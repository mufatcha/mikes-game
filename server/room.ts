import type { ServerWebSocket } from "bun";
import { MAX_HUMANS, RESULTS_DURATION, TEAM_SIZE, type Team } from "../shared/constants";
import type { ClientMessage, InputFrame, RosterEntry, ServerMessage } from "../shared/protocol";
import {
  ARCHETYPES,
  ARCHETYPE_IDS,
  DEFAULT_LOADOUT,
  sanitizeLoadout,
  type ArchetypeId,
  type Loadout,
} from "../shared/archetypes";
import { Match, type MatchEntry } from "./match";

export interface SocketData {
  code: string;
  clientId: string;
}

interface Client {
  id: string;
  ws: ServerWebSocket<SocketData>;
  name: string;
  team: Team;
  loadout: Loadout;
  /** False until the client sends hello; until then it doesn't reserve a class. */
  ready: boolean;
}

const BOT_NAMES = [
  "Viper", "Ghost", "Havoc", "Nomad", "Talon", "Rook", "Jinx", "Bishop",
  "Echo", "Brick", "Sable", "Dash", "Moss", "Rivet", "Quill", "Ember",
];

function cleanName(raw: unknown) {
  const s = String(raw ?? "").replace(/[^\p{L}\p{N} _\-.]/gu, "").trim().slice(0, 16);
  return s || "Player";
}

export class Room {
  readonly clients = new Map<string, Client>();
  hostId: string | null = null;
  phase: "lobby" | "match" | "results" = "lobby";
  match: Match | null = null;
  /** Last time the room had nobody in it; used for cleanup. */
  emptySince = Date.now();

  private resultsUntil = 0;
  private botSeq = 0;

  constructor(readonly code: string) {}

  get isFull() {
    return this.clients.size >= MAX_HUMANS;
  }

  join(ws: ServerWebSocket<SocketData>) {
    const id = ws.data.clientId;
    if (this.isFull) {
      this.send(ws, { t: "error", message: "This match is full (8 players).", fatal: true });
      ws.close();
      return;
    }
    const team = this.teamWithRoom();
    const client: Client = {
      id,
      ws,
      name: "Player",
      team,
      loadout: this.claimClass(team, id, DEFAULT_LOADOUT),
      ready: false,
    };
    this.clients.set(id, client);
    if (!this.hostId) this.hostId = id;
    this.send(ws, { t: "welcome", id, code: this.code });

    if (this.match) this.addHumanToMatch(client);
    this.broadcastRoom();
  }

  leave(id: string) {
    const client = this.clients.get(id);
    if (!client) return;
    this.clients.delete(id);
    if (this.hostId === id) this.hostId = this.clients.keys().next().value ?? null;
    if (this.clients.size === 0) this.emptySince = Date.now();

    if (this.match) {
      this.match.removePlayer(id);
      this.match.addPlayer(this.makeBot(client.team));
    }
    this.broadcastRoom();
  }

  handle(id: string, raw: string | Buffer) {
    const client = this.clients.get(id);
    if (!client) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    switch (msg.t) {
      case "input":
        if (this.match && this.phase === "match") this.match.queueInput(id, sanitizeInput(msg));
        return;
      case "hello":
        client.name = cleanName(msg.name);
        client.ready = true;
        client.loadout = this.claimClass(client.team, id, sanitizeLoadout(msg.loadout));
        this.syncToMatch(client);
        break;
      case "loadout": {
        const wanted = sanitizeLoadout(msg.loadout);
        if (this.takenClasses(client.team, id).has(wanted.archetype)) {
          const name = ARCHETYPES[wanted.archetype].name;
          this.send(client.ws, { t: "error", message: `Your team already has a ${name}.` });
          break;
        }
        client.loadout = wanted;
        this.match?.setLoadout(id, client.loadout);
        break;
      }
      case "team": {
        if (this.phase !== "lobby") return;
        const team: Team = msg.team === 1 ? 1 : 0;
        if (team === client.team || this.humansOn(team) >= TEAM_SIZE) return;
        client.team = team;
        client.loadout = this.claimClass(team, id, client.loadout);
        break;
      }
      case "start":
        if (id !== this.hostId || this.phase !== "lobby") return;
        this.startMatch();
        break;
      case "end":
        if (id !== this.hostId || this.phase !== "match" || !this.match) return;
        this.match.finished = true;
        return;
      default:
        return;
    }
    this.broadcastRoom();
  }

  /** Advance one simulation tick. */
  tick() {
    if (this.phase === "match" && this.match) {
      this.match.step();
      this.broadcastSnapshot();
      if (this.match.finished) this.finishMatch();
    } else if (this.phase === "results" && Date.now() >= this.resultsUntil) {
      this.phase = "lobby";
      this.match = null;
      this.broadcastRoom();
    }
  }

  private startMatch() {
    const entries: MatchEntry[] = [];
    for (const c of this.clients.values()) {
      entries.push({ id: c.id, name: c.name, team: c.team, loadout: c.loadout, isBot: false });
    }
    for (const team of [0, 1] as Team[]) {
      for (let n = this.humansOn(team); n < TEAM_SIZE; n++) entries.push(this.makeBot(team, entries));
    }
    this.match = new Match(entries);
    this.phase = "match";
  }

  private finishMatch() {
    const match = this.match!;
    this.phase = "results";
    this.resultsUntil = Date.now() + RESULTS_DURATION * 1000;
    const players = [...match.players.values()]
      .map((p) => ({ id: p.id, name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, isBot: p.isBot }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    this.broadcast({
      t: "results",
      scores: match.scores,
      winner: match.winner,
      players,
      returnIn: RESULTS_DURATION,
    });
    this.broadcastRoom();
  }

  /** Swap a bot on the client's team for the client, preferring one playing the same class. */
  private addHumanToMatch(client: Client) {
    const match = this.match!;
    const bots = [...match.players.values()].filter((p) => p.isBot && p.team === client.team);
    const bot = bots.find((p) => p.loadout.archetype === client.loadout.archetype) ?? bots[0];
    if (bot) match.removePlayer(bot.id);
    client.loadout = this.claimClass(client.team, client.id, client.loadout);
    match.addPlayer({ id: client.id, name: client.name, team: client.team, loadout: client.loadout, isBot: false });
  }

  private syncToMatch(client: Client) {
    const p = this.match?.players.get(client.id);
    if (!p) return;
    p.name = client.name;
    // A freshly joined player hasn't fired yet, so apply the loadout immediately.
    if (p.kills === 0 && p.deaths === 0) {
      p.loadout = client.loadout;
      p.ammo = this.match!.fullAmmo(p.loadout);
    }
    this.match!.setLoadout(client.id, client.loadout);
  }

  /** Classes already held (or queued for next respawn) by teammates other than `exceptId`. */
  private takenClasses(team: Team, exceptId: string | null, extra: MatchEntry[] = []) {
    const taken = new Set<ArchetypeId>();
    for (const c of this.clients.values()) {
      if (c.ready && c.team === team && c.id !== exceptId) taken.add(c.loadout.archetype);
    }
    for (const p of this.match?.players.values() ?? []) {
      if (p.team !== team || p.id === exceptId) continue;
      taken.add(p.loadout.archetype);
      if (p.pendingLoadout) taken.add(p.pendingLoadout.archetype);
    }
    for (const e of extra) if (e.team === team) taken.add(e.loadout.archetype);
    return taken;
  }

  /** The requested class if no teammate has it, otherwise the first free one. */
  private claimClass(team: Team, id: string, wanted: Loadout): Loadout {
    const taken = this.takenClasses(team, id);
    if (!taken.has(wanted.archetype)) return wanted;
    return { archetype: ARCHETYPE_IDS.find((a) => !taken.has(a)) ?? wanted.archetype };
  }

  private makeBot(team: Team, extra: MatchEntry[] = []): MatchEntry {
    const usedNames = new Set([
      ...(this.match ? [...this.match.players.values()].map((p) => p.name) : []),
      ...extra.map((e) => e.name),
    ]);
    const freeNames = BOT_NAMES.filter((n) => !usedNames.has(`${n} [BOT]`));
    const name = freeNames[Math.floor(Math.random() * freeNames.length)] ?? `Bot ${this.botSeq}`;
    const taken = this.takenClasses(team, null, extra);
    const freeClasses = ARCHETYPE_IDS.filter((a) => !taken.has(a));
    const pool = freeClasses.length > 0 ? freeClasses : ARCHETYPE_IDS;
    const archetype = pool[Math.floor(Math.random() * pool.length)];
    return {
      id: `bot-${++this.botSeq}`,
      name: `${name} [BOT]`,
      team,
      loadout: { archetype },
      isBot: true,
    };
  }

  private humansOn(team: Team) {
    let n = 0;
    for (const c of this.clients.values()) if (c.team === team) n++;
    return n;
  }

  private teamWithRoom(): Team {
    return this.humansOn(1) < this.humansOn(0) ? 1 : 0;
  }

  private roster(): RosterEntry[] {
    if (this.match) {
      return [...this.match.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        loadout: this.clients.get(p.id)?.loadout ?? p.loadout,
        isBot: p.isBot,
        isHost: p.id === this.hostId,
      }));
    }
    return [...this.clients.values()].map((c) => ({
      id: c.id,
      name: c.name,
      team: c.team,
      loadout: c.loadout,
      isBot: false,
      isHost: c.id === this.hostId,
    }));
  }

  private broadcastRoom() {
    this.broadcast({ t: "room", code: this.code, phase: this.phase, hostId: this.hostId, roster: this.roster() });
  }

  private broadcastSnapshot() {
    const match = this.match!;
    // Serialize once, then splice in each client's ack.
    const body = JSON.stringify(match.takeSnapshot()).slice(1);
    for (const c of this.clients.values()) {
      const ack = match.players.get(c.id)?.lastSeq ?? 0;
      c.ws.send(`{"t":"snap","ack":${ack},${body}`);
    }
  }

  private broadcast(msg: ServerMessage) {
    const s = JSON.stringify(msg);
    for (const c of this.clients.values()) c.ws.send(s);
  }

  private send(ws: ServerWebSocket<SocketData>, msg: ServerMessage) {
    ws.send(JSON.stringify(msg));
  }
}

function sanitizeInput(m: InputFrame): InputFrame {
  return {
    seq: Number(m.seq) || 0,
    mx: Number(m.mx) || 0,
    my: Number(m.my) || 0,
    aim: Number(m.aim) || 0,
    fire: !!m.fire,
    reload: !!m.reload,
    swap: m.swap === 0 || m.swap === 1 ? m.swap : -1,
  };
}
