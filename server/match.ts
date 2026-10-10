import {
  BASE_SPEED,
  DT,
  MATCH_DURATION,
  MAX_HP,
  PLAYER_RADIUS,
  RESPAWN_TIME,
  SAFE_ZONE_HEAL,
  SAFE_ZONE_MAX_TIME,
  SCORE_TO_WIN,
  SPAWN_PROTECTION,
  SWAP_TIME,
  type Team,
} from "../shared/constants";
import { SPAWNS, inSafeZone } from "../shared/map";
import { firstWallHit, movePlayer, segmentCircle } from "../shared/physics";
import type { BulletSnap, GameEvent, InputFrame, PlayerSnap } from "../shared/protocol";
import {
  ARCHETYPES,
  WEAPONS,
  moveSpeedFor,
  weaponsOf,
  type Loadout,
  type WeaponId,
} from "../shared/archetypes";
import { BotBrain } from "./bot";

export interface MatchEntry {
  id: string;
  name: string;
  team: Team;
  loadout: Loadout;
  isBot: boolean;
}

export interface PlayerState extends MatchEntry {
  x: number;
  y: number;
  vx: number;
  vy: number;
  aim: number;
  hp: number;
  alive: boolean;
  respawnAt: number;
  protectedUntil: number;
  /** Takes effect on the next respawn. */
  pendingLoadout: Loadout | null;
  ammo: [number, number];
  slot: 0 | 1;
  reloadStart: number;
  /** Match time when the current reload finishes, or -1. */
  reloadEnd: number;
  nextFire: number;
  swapReadyAt: number;
  prevFire: boolean;
  /** A semi-auto trigger pull waiting for the weapon to be ready. */
  triggerQueued: boolean;
  inputs: InputFrame[];
  lastInput: InputFrame;
  lastInputAt: number;
  lastSeq: number;
  kills: number;
  deaths: number;
  /** Seconds spent in the Nurse's Office; drains while outside. */
  zoneTime: number;
  /** Health to respawn with (reduced after passing out). */
  spawnHp: number;
  brain: BotBrain | null;
}

interface Bullet {
  id: number;
  owner: string;
  team: Team;
  weapon: WeaponId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  travelled: number;
  range: number;
}

const IDLE: InputFrame = { seq: 0, mx: 0, my: 0, aim: 0, fire: false, reload: false, swap: -1 };
const MAX_QUEUED_INPUTS = 8;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

export class Match {
  readonly players = new Map<string, PlayerState>();
  time = 0;
  tick = 0;
  scores: [number, number] = [0, 0];
  finished = false;

  private bullets: Bullet[] = [];
  private events: GameEvent[] = [];
  private nextBulletId = 1;

  constructor(entries: MatchEntry[]) {
    for (const e of entries) this.respawn(this.createPlayer(e));
  }

  get timeLeft() {
    return Math.max(0, MATCH_DURATION - this.time);
  }

  get winner(): Team | null {
    if (this.scores[0] === this.scores[1]) return null;
    return this.scores[0] > this.scores[1] ? 0 : 1;
  }

  currentWeapon(p: PlayerState): WeaponId {
    return weaponsOf(p.loadout.archetype)[p.slot];
  }

  addPlayer(e: MatchEntry) {
    const p = this.createPlayer(e);
    this.respawn(p);
    return p;
  }

  removePlayer(id: string) {
    this.players.delete(id);
  }

  setLoadout(id: string, loadout: Loadout) {
    const p = this.players.get(id);
    if (p) p.pendingLoadout = loadout;
  }

  queueInput(id: string, frame: InputFrame) {
    const p = this.players.get(id);
    if (!p || p.isBot) return;
    if (frame.seq <= p.lastSeq) return;
    p.inputs.push(frame);
    if (p.inputs.length > MAX_QUEUED_INPUTS) p.inputs.splice(0, p.inputs.length - 3);
  }

  step() {
    if (this.finished) return;
    this.tick++;
    this.time += DT;

    for (const p of this.players.values()) {
      const px = p.x;
      const py = p.y;
      if (p.isBot) {
        this.applyInput(p, p.brain!.think(p, this));
      } else if (p.inputs.length > 0) {
        this.consumeInput(p);
        // Catch up if the client is running ahead of us.
        if (p.inputs.length > 2) this.consumeInput(p);
      } else {
        // No input this tick: stand still but keep aiming/firing briefly.
        const stale = this.time - p.lastInputAt > 0.5;
        this.applyInput(p, {
          ...IDLE,
          aim: p.lastInput.aim,
          fire: stale ? false : p.lastInput.fire,
        });
      }
      p.vx = (p.x - px) / DT;
      p.vy = (p.y - py) / DT;
      if (p.alive) this.updateSafeZone(p);
    }

    this.updateBullets();

    if (
      this.scores[0] >= SCORE_TO_WIN ||
      this.scores[1] >= SCORE_TO_WIN ||
      this.time >= MATCH_DURATION
    ) {
      this.finished = true;
    }
  }

  /** Shared snapshot body; the room adds each client's ack. Clears pending events. */
  takeSnapshot() {
    const players: PlayerSnap[] = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id,
        x: r1(p.x),
        y: r1(p.y),
        aim: r2(p.aim),
        hp: Math.ceil(p.hp),
        alive: p.alive,
        respawn: p.alive ? 0 : r1(Math.max(0, p.respawnAt - this.time)),
        protected: p.alive && this.time < p.protectedUntil,
        weapon: this.currentWeapon(p),
        archetype: p.loadout.archetype,
        slot: p.slot,
        ammo: p.ammo[p.slot],
        reload:
          p.reloadEnd < 0
            ? -1
            : r2((this.time - p.reloadStart) / (p.reloadEnd - p.reloadStart)),
        kills: p.kills,
        deaths: p.deaths,
        zone: r1(p.zoneTime),
      });
    }
    const bullets: BulletSnap[] = this.bullets.map((b) => ({
      id: b.id,
      x: r1(b.x),
      y: r1(b.y),
      vx: Math.round(b.vx),
      vy: Math.round(b.vy),
      team: b.team,
      w: b.weapon,
    }));
    const events = this.events;
    this.events = [];
    return {
      tick: this.tick,
      scores: this.scores,
      timeLeft: Math.ceil(this.timeLeft),
      players,
      bullets,
      events,
    };
  }

  fullAmmo(loadout: Loadout): [number, number] {
    const [a, b] = weaponsOf(loadout.archetype);
    return [WEAPONS[a].magSize, WEAPONS[b].magSize];
  }

  private createPlayer(e: MatchEntry): PlayerState {
    const p: PlayerState = {
      ...e,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      aim: e.team === 0 ? 0 : Math.PI,
      hp: MAX_HP,
      alive: false,
      respawnAt: 0,
      protectedUntil: 0,
      pendingLoadout: null,
      ammo: this.fullAmmo(e.loadout),
      slot: 0,
      reloadStart: 0,
      reloadEnd: -1,
      nextFire: 0,
      swapReadyAt: 0,
      prevFire: false,
      triggerQueued: false,
      inputs: [],
      lastInput: { ...IDLE },
      lastInputAt: this.time,
      lastSeq: 0,
      kills: 0,
      deaths: 0,
      zoneTime: 0,
      spawnHp: MAX_HP,
      brain: e.isBot ? new BotBrain() : null,
    };
    this.players.set(p.id, p);
    return p;
  }

  private consumeInput(p: PlayerState) {
    const input = p.inputs.shift()!;
    p.lastInput = input;
    p.lastInputAt = this.time;
    p.lastSeq = input.seq;
    this.applyInput(p, input);
  }

  private applyInput(p: PlayerState, input: InputFrame) {
    if (!p.alive) {
      p.prevFire = input.fire;
      if (this.time >= p.respawnAt) this.respawn(p);
      return;
    }

    if (Number.isFinite(input.aim)) p.aim = input.aim;

    if ((input.swap === 0 || input.swap === 1) && input.swap !== p.slot) {
      p.slot = input.swap;
      p.reloadEnd = -1;
      p.swapReadyAt = this.time + SWAP_TIME;
      p.triggerQueued = false;
    }

    const weapon = WEAPONS[this.currentWeapon(p)];
    const mx = Math.max(-1, Math.min(1, input.mx || 0));
    const my = Math.max(-1, Math.min(1, input.my || 0));
    movePlayer(p, mx, my, BASE_SPEED * moveSpeedFor(p.loadout.archetype), DT);

    if (p.reloadEnd >= 0 && this.time >= p.reloadEnd) {
      p.ammo[p.slot] = weapon.magSize;
      p.reloadEnd = -1;
    }
    if (input.reload && p.reloadEnd < 0 && p.ammo[p.slot] < weapon.magSize) {
      this.startReload(p);
    }

    if (input.fire && !p.prevFire) p.triggerQueued = true;
    if (!input.fire) p.triggerQueued = false;
    const wantsFire = input.fire && (weapon.auto || p.isBot || p.triggerQueued);
    // No throwing from inside the Nurse's Office.
    const ready =
      p.reloadEnd < 0 && this.time >= p.nextFire && this.time >= p.swapReadyAt && !inSafeZone(p.x, p.y);
    if (wantsFire && ready) {
      if (p.ammo[p.slot] > 0) {
        this.fire(p, weapon.id);
        p.triggerQueued = false;
      } else {
        this.startReload(p);
      }
    }
    p.prevFire = input.fire;
  }

  private startReload(p: PlayerState) {
    const weapon = WEAPONS[this.currentWeapon(p)];
    p.reloadStart = this.time;
    p.reloadEnd = this.time + weapon.reloadTime;
  }

  private fire(p: PlayerState, weaponId: WeaponId) {
    const weapon = WEAPONS[weaponId];
    p.ammo[p.slot]--;
    p.nextFire = this.time + 1 / weapon.fireRate;
    p.protectedUntil = 0;
    for (let i = 0; i < weapon.pellets; i++) {
      const angle = p.aim + (Math.random() * 2 - 1) * weapon.spread;
      const speed = weapon.projectileSpeed * (weapon.pellets > 1 ? 0.9 + Math.random() * 0.2 : 1);
      this.bullets.push({
        id: this.nextBulletId++,
        owner: p.id,
        team: p.team,
        weapon: weaponId,
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: weapon.damage,
        travelled: 0,
        range: weapon.range,
      });
    }
    this.events.push({ k: "shot", by: p.id, weapon: weaponId });
    if (p.ammo[p.slot] === 0) this.startReload(p);
  }

  private updateBullets() {
    const remaining: Bullet[] = [];
    for (const b of this.bullets) {
      const nx = b.x + b.vx * DT;
      const ny = b.y + b.vy * DT;
      let hitT = firstWallHit(b.x, b.y, nx, ny);
      let target: PlayerState | null = null;
      for (const p of this.players.values()) {
        if (!p.alive || p.team === b.team) continue;
        const t = segmentCircle(b.x, b.y, nx, ny, p.x, p.y, PLAYER_RADIUS + WEAPONS[b.weapon].radius);
        if (t !== null && (hitT === null || t < hitT)) {
          hitT = t;
          target = p;
        }
      }
      if (hitT !== null) {
        const hx = b.x + (nx - b.x) * hitT;
        const hy = b.y + (ny - b.y) * hitT;
        if (target) this.damage(target, b, hx, hy);
        else this.events.push({ k: "impact", x: r1(hx), y: r1(hy) });
        continue;
      }
      b.x = nx;
      b.y = ny;
      b.travelled += Math.hypot(b.vx, b.vy) * DT;
      if (b.travelled < b.range) remaining.push(b);
    }
    this.bullets = remaining;
  }

  private damage(target: PlayerState, b: Bullet, x: number, y: number) {
    if (this.time < target.protectedUntil || inSafeZone(target.x, target.y)) {
      this.events.push({ k: "impact", x: r1(x), y: r1(y) });
      return;
    }
    const dmg = b.damage * (1 - ARCHETYPES[target.loadout.archetype].defense);
    target.hp -= dmg;
    target.brain?.onDamaged(b.owner, this.time);
    this.events.push({ k: "hit", by: b.owner, target: target.id, x: r1(x), y: r1(y), dmg: Math.round(dmg) });
    if (target.hp > 0) return;

    target.hp = 0;
    target.alive = false;
    target.respawnAt = this.time + RESPAWN_TIME;
    target.deaths++;
    target.inputs = [];
    const killer = this.players.get(b.owner);
    if (killer) killer.kills++;
    this.scores[b.team]++;
    this.events.push({ k: "kill", killer: b.owner, victim: target.id, weapon: b.weapon });
  }

  private respawn(p: PlayerState) {
    if (p.pendingLoadout) {
      p.loadout = p.pendingLoadout;
      p.pendingLoadout = null;
    }
    const spawn = this.pickSpawn(p);
    p.x = spawn.x;
    p.y = spawn.y;
    p.vx = 0;
    p.vy = 0;
    p.aim = p.team === 0 ? 0 : Math.PI;
    p.hp = p.spawnHp;
    p.spawnHp = MAX_HP;
    p.zoneTime = 0;
    p.alive = true;
    p.protectedUntil = this.time + SPAWN_PROTECTION;
    p.ammo = this.fullAmmo(p.loadout);
    p.slot = 0;
    p.reloadEnd = -1;
    p.nextFire = 0;
    p.swapReadyAt = 0;
    p.triggerQueued = false;
    p.brain?.reset();
  }

  /** Heal inside the Nurse's Office; stay too long and you pass out. */
  private updateSafeZone(p: PlayerState) {
    if (!inSafeZone(p.x, p.y)) {
      p.zoneTime = Math.max(0, p.zoneTime - DT);
      return;
    }
    p.hp = Math.min(MAX_HP, p.hp + SAFE_ZONE_HEAL * DT);
    p.zoneTime += DT;
    if (p.zoneTime < SAFE_ZONE_MAX_TIME) return;
    p.hp = 0;
    p.alive = false;
    p.respawnAt = this.time + RESPAWN_TIME;
    p.deaths++;
    p.inputs = [];
    p.spawnHp = Math.round(MAX_HP / 2);
    this.events.push({ k: "passout", victim: p.id });
  }

  /**
   * A spot in the player's class room (shared by both teams), preferring
   * spots far from enemies and not already occupied.
   */
  private pickSpawn(player: PlayerState) {
    const spots = SPAWNS[player.loadout.archetype];
    let best = spots[0];
    let bestScore = -Infinity;
    for (const s of spots) {
      let nearest = 5000;
      let occupied = false;
      for (const p of this.players.values()) {
        if (!p.alive || p === player) continue;
        const d = Math.hypot(p.x - s.x, p.y - s.y);
        if (p.team !== player.team) nearest = Math.min(nearest, d);
        if (d < PLAYER_RADIUS * 2.5) occupied = true;
      }
      const score = nearest + Math.random() * 150 - (occupied ? 10000 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }
}
