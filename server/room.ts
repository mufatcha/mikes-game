import type { ServerWebSocket } from "bun";
import {
  GAME_MODE_IDS,
  MAX_HUMANS,
  RESULTS_DURATION,
  isPrincipalSeat,
  teamSizeFor,
  type GameMode,
  type Team,
} from "../shared/constants";
import type { ClientMessage, InputFrame, RosterEntry, ServerMessage } from "../shared/protocol";
import {
  ABILITY_IDS,
  ARCHETYPES,
  ARCHETYPE_IDS,
  DEFAULT_LOADOUT,
  PRINCIPAL_LOADOUT,
  sanitizeLoadout,
  type AbilityId,
  type ArchetypeId,
  type Loadout,
} from "../shared/archetypes";
import { Match, type MatchEntry } from "./match";
import { CHEAT_CODE, PRANK_IDS } from "../shared/pranks";
import { XP_FOR_PLAYING, XP_FOR_WINNING, clampLevel, sanitizeLevels, type ClassLevels } from "../shared/progress";

export interface SocketData {
  code: string;
  clientId: string;
}

interface Client {
  id: string;
  ws: ServerWebSocket<SocketData>;
  name: string;
  team: Team;
  /** The student class this player picked (kept even while they're the Principal). */
  loadout: Loadout;
  /** Levels for each class, from the XP saved in their browser. */
  levels: ClassLevels;
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
  mode: GameMode = "teams";
  /** Seen in 3D first person instead of top-down; works with every mode. */
  view3d = false;
  match: Match | null = null;
  /** Last time the room had nobody in it; used for cleanup. */
  emptySince = Date.now();

  private resultsUntil = 0;
  private botSeq = 0;
  /** Players who entered the cheat code; they keep the prank menu for the rest of their visit. */
  private pranksters = new Set<string>();

  constructor(readonly code: string) {}

  get isFull() {
    return this.clients.size >= this.capacity;
  }

  /** Humans allowed in the room: a duel is just two players. */
  get capacity() {
    return this.mode === "duel" ? 2 : MAX_HUMANS;
  }

  join(ws: ServerWebSocket<SocketData>) {
    const id = ws.data.clientId;
    if (this.isFull) {
      this.send(ws, { t: "error", message: `This match is full (${this.capacity} players).`, fatal: true });
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
      levels: {},
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
    this.pranksters.delete(id);
    if (this.hostId === id) this.hostId = this.clients.keys().next().value ?? null;
    if (this.clients.size === 0) this.emptySince = Date.now();

    if (this.match) this.match.replacePlayer(id, this.makeBot(client.team));
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
      case "ability": {
        if (!this.match || this.phase !== "match") return;
        if (!ABILITY_IDS.includes(msg.ability)) return;
        const error = this.match.useAbility(
          id,
          msg.ability as AbilityId,
          typeof msg.target === "string" ? msg.target : undefined,
          Number(msg.score),
        );
        if (error) this.send(client.ws, { t: "error", message: error });
        return;
      }
      case "prank": {
        if (msg.action === "unlock") {
          if (msg.code === CHEAT_CODE) {
            this.pranksters.add(id);
            this.send(client.ws, { t: "prank-unlocked" });
          }
          return;
        }
        if (!this.pranksters.has(id) || !this.match || this.phase !== "match") return;
        if (!PRANK_IDS.includes(msg.action)) return;
        const error = this.match.prank(id, msg.action, typeof msg.target === "string" ? msg.target : undefined);
        if (error) this.send(client.ws, { t: "error", message: error });
        return;
      }
      case "super":
        if (this.match && this.phase === "match") this.match.useSuper(id);
        return;
      case "levels":
        client.levels = sanitizeLevels(msg.levels, ARCHETYPE_IDS);
        this.match?.setLevels(id, client.levels);
        break;
      case "hello":
        client.name = cleanName(msg.name);
        client.levels = sanitizeLevels(msg.levels, ARCHETYPE_IDS);
        this.match?.setLevels(id, client.levels);
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
        // The Principal stays the Principal; the pick applies if they go back to being a student.
        if (!this.isPrincipalSeat(client.team)) this.match?.setLoadout(id, client.loadout);
        break;
      }
      case "team": {
        if (this.phase !== "lobby") return;
        const team: Team = msg.team === 1 ? 1 : 0;
        if (team === client.team || this.humansOn(team) >= teamSizeFor(this.mode, team)) return;
        client.team = team;
        client.loadout = this.claimClass(team, id, client.loadout);
        break;
      }
      case "mode": {
        if (id !== this.hostId || this.phase !== "lobby") return;
        if (!GAME_MODE_IDS.includes(msg.mode)) return;
        if (msg.mode === "duel" && this.clients.size > 2) {
          this.send(client.ws, { t: "error", message: "A 1v1 duel is for 2 players. Some people need to leave first." });
          return;
        }
        if (msg.mode === this.mode) return;
        this.mode = msg.mode;
        // Nobody becomes the Principal without choosing it: everyone starts as a student.
        if (this.mode === "boss") for (const c of this.clients.values()) c.team = 0;
        // Duel: one player on each side, the host on the Blueberry side.
        if (this.mode === "duel") {
          const order = [...this.clients.values()].sort((a, b) => (a.id === this.hostId ? -1 : b.id === this.hostId ? 1 : 0));
          order.forEach((c, i) => (c.team = i === 0 ? 0 : 1));
        }
        this.rebalance();
        break;
      }
      case "view": {
        if (id !== this.hostId || this.phase !== "lobby") return;
        const view3d = msg.view3d === true;
        if (view3d === this.view3d) return;
        this.view3d = view3d;
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

  /** In boss mode, team 1 is the Principal's one seat. */
  private isPrincipalSeat(team: Team) {
    return isPrincipalSeat(this.mode, team);
  }

  /** The class a player actually plays: the Principal seat overrides their pick. */
  private effectiveLoadout(team: Team, picked: Loadout): Loadout {
    return this.isPrincipalSeat(team) ? PRINCIPAL_LOADOUT : picked;
  }

  /** After a mode change, move people off teams that are now over their size. */
  private rebalance() {
    for (const team of [1, 0] as Team[]) {
      const other: Team = team === 0 ? 1 : 0;
      const members = [...this.clients.values()].filter((c) => c.team === team);
      // Keep the host where they are if possible.
      members.sort((a, b) => (a.id === this.hostId ? -1 : b.id === this.hostId ? 1 : 0));
      for (const c of members.slice(teamSizeFor(this.mode, team))) {
        if (this.humansOn(other) >= teamSizeFor(this.mode, other)) break;
        c.team = other;
      }
    }
    for (const c of this.clients.values()) c.loadout = this.claimClass(c.team, c.id, c.loadout);
  }

  private startMatch() {
    const entries: MatchEntry[] = [];
    for (const c of this.clients.values()) {
      entries.push({
        id: c.id,
        name: c.name,
        team: c.team,
        loadout: this.effectiveLoadout(c.team, c.loadout),
        isBot: false,
        levels: c.levels,
      });
    }
    for (const team of [0, 1] as Team[]) {
      for (let n = this.humansOn(team); n < teamSizeFor(this.mode, team); n++) {
        entries.push(this.makeBot(team, entries));
      }
    }
    this.match = new Match(entries, this.mode);
    this.phase = "match";
  }

  private finishMatch() {
    const match = this.match!;
    this.phase = "results";
    this.resultsUntil = Date.now() + RESULTS_DURATION * 1000;
    // Everyone gets XP for finishing the match, and more for winning it.
    for (const p of match.players.values()) {
      match.addXp(p, XP_FOR_PLAYING);
      if (match.winner === p.team) match.addXp(p, XP_FOR_WINNING);
    }
    const players = [...match.players.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        kills: p.kills,
        deaths: p.deaths,
        isBot: p.isBot,
        xp: Object.fromEntries(Object.entries(p.xp).map(([k, v]) => [k, Math.round(v ?? 0)])),
      }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    this.broadcast({
      t: "results",
      mode: match.mode,
      ...(match.mode === "boss" && { reason: match.endReason }),
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
    client.loadout = this.claimClass(client.team, client.id, client.loadout);
    const entry: MatchEntry = {
      id: client.id,
      name: client.name,
      team: client.team,
      loadout: this.effectiveLoadout(client.team, client.loadout),
      isBot: false,
      levels: client.levels,
    };
    if (bot) match.replacePlayer(bot.id, entry);
    else match.addPlayer(entry);
  }

  private syncToMatch(client: Client) {
    const p = this.match?.players.get(client.id);
    if (!p || this.isPrincipalSeat(client.team)) {
      if (p) p.name = client.name;
      return;
    }
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
    // Seven students and six classes: in boss mode, students can share.
    if (this.mode === "boss" || this.mode === "duel") return taken;
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
    let loadout: Loadout;
    if (this.isPrincipalSeat(team)) {
      loadout = PRINCIPAL_LOADOUT;
    } else {
      // Prefer a class nobody on the team has yet, even when sharing is allowed.
      const used = new Set([
        ...this.takenClasses(team, null, extra),
        ...extra.filter((e) => e.team === team).map((e) => e.loadout.archetype),
      ]);
      const freeClasses = ARCHETYPE_IDS.filter((a) => !used.has(a));
      const pool = freeClasses.length > 0 ? freeClasses : ARCHETYPE_IDS;
      loadout = { archetype: pool[Math.floor(Math.random() * pool.length)] };
    }
    return {
      id: `bot-${++this.botSeq}`,
      name: `${name} [BOT]`,
      team,
      loadout,
      isBot: true,
    };
  }

  private humansOn(team: Team) {
    let n = 0;
    for (const c of this.clients.values()) if (c.team === team) n++;
    return n;
  }

  /** Newcomers join whichever team has the most open seats. */
  private teamWithRoom(): Team {
    const open0 = teamSizeFor(this.mode, 0) - this.humansOn(0);
    const open1 = teamSizeFor(this.mode, 1) - this.humansOn(1);
    return open1 > open0 ? 1 : 0;
  }

  private roster(): RosterEntry[] {
    if (this.match) {
      return [...this.match.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        loadout: p.loadout.archetype === "principal" ? p.loadout : (this.clients.get(p.id)?.loadout ?? p.loadout),
        isBot: p.isBot,
        isHost: p.id === this.hostId,
        level: this.match!.levelOf(p),
      }));
    }
    return [...this.clients.values()].map((c) => ({
      id: c.id,
      name: c.name,
      team: c.team,
      loadout: this.effectiveLoadout(c.team, c.loadout),
      isBot: false,
      isHost: c.id === this.hostId,
      level: clampLevel(c.levels[this.effectiveLoadout(c.team, c.loadout).archetype] ?? 1),
    }));
  }

  private broadcastRoom() {
    this.broadcast({
      t: "room",
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      mode: this.mode,
      view3d: this.view3d,
      roster: this.roster(),
    });
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
