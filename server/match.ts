import {
  BASE_SPEED,
  BOSS_MATCH_DURATION,
  DT,
  MATCH_DURATION,
  MAX_HP,
  PLAYER_RADIUS,
  RESPAWN_TIME,
  SAFE_ZONE_HEAL,
  SAFE_ZONE_MAX_TIME,
  SAFE_ZONE_MAX_VISITS,
  SAFE_ZONE_REENTRY_GRACE,
  SAFE_ZONE_VISIT_WINDOW,
  SCORE_TO_WIN,
  SPAWN_PROTECTION,
  SWAP_TIME,
  type GameMode,
  type Team,
} from "../shared/constants";
import { SPAWNS, inSafeZone } from "../shared/map";
import { firstWallHit, hasLineOfSight, movePlayer, segmentCircle } from "../shared/physics";
import type { BulletSnap, GameEvent, InputFrame, PlayerSnap } from "../shared/protocol";
import {
  ABILITIES,
  ARCHETYPES,
  DETENTION_RANGE,
  INTERCOM_TIME,
  LECTURE_RADIUS,
  LECTURE_STUN,
  QUIZ_PAPERS,
  detentionSeconds,
  maxHpFor,
  radiusFor,
  type AbilityId,
  WEAPONS,
  moveSpeedFor,
  weaponsOf,
  type Loadout,
  type WeaponId,
} from "../shared/archetypes";
import { BotBrain } from "./bot";
import { FREEZE_TIME, PRANK_TIME, SLOW_MULT, SUPER_MULT, TURBO_MULT, type PrankAction } from "../shared/pranks";

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
  /** Match times of recent entries into the Nurse's Office. */
  zoneVisits: number[];
  inZone: boolean;
  zoneLeftAt: number;
  /** Fraction of full health to respawn with (halved after passing out). */
  spawnHpFrac: number;
  maxHp: number;
  radius: number;
  /** Locked in detention until this match time: can't move, throw, or be hurt. */
  jailedUntil: number;
  /** Stunned by a Stern Lecture until this match time: can't move or throw. */
  stunnedUntil: number;
  /** Principal's Intercom: sees every student until this match time. */
  revealUntil: number;
  /** Principal: match time each ability is ready again. */
  cooldowns: Record<AbilityId, number>;
  // Prank menu effects.
  reversedUntil: number;
  slowUntil: number;
  turbo: boolean;
  superSpeed: boolean;
  god: boolean;
  infAmmo: boolean;
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

  /** Boss mode: set when the Principal is knocked out. */
  private principalDown = false;

  constructor(
    entries: MatchEntry[],
    readonly mode: GameMode = "teams",
  ) {
    for (const e of entries) this.respawn(this.createPlayer(e));
  }

  get duration() {
    return this.mode === "boss" ? BOSS_MATCH_DURATION : MATCH_DURATION;
  }

  get timeLeft() {
    return Math.max(0, this.duration - this.time);
  }

  get winner(): Team | null {
    // Boss mode: students win by knocking out the Principal; otherwise the Principal survives the bell.
    if (this.mode === "boss") return this.principalDown ? 0 : 1;
    if (this.scores[0] === this.scores[1]) return null;
    return this.scores[0] > this.scores[1] ? 0 : 1;
  }

  isPrincipal(p: PlayerState) {
    return p.loadout.archetype === "principal";
  }

  isJailed(p: PlayerState) {
    return this.time < p.jailedUntil;
  }

  /**
   * Swap one player for another (a human taking over a bot, or a bot filling in
   * for someone who left). The Principal keeps its health, spot and cooldowns
   * so nobody gets a free reset.
   */
  replacePlayer(oldId: string, e: MatchEntry) {
    const old = this.players.get(oldId);
    this.players.delete(oldId);
    const p = this.addPlayer(e);
    if (old && this.isPrincipal(old) && this.isPrincipal(p)) {
      Object.assign(p, {
        x: old.x,
        y: old.y,
        hp: old.hp,
        alive: old.alive,
        respawnAt: old.respawnAt,
        protectedUntil: old.protectedUntil,
        cooldowns: { ...old.cooldowns },
        revealUntil: old.revealUntil,
        kills: old.kills,
        deaths: old.deaths,
      });
    }
    return p;
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
      if (p.isBot && p.alive && this.isPrincipal(p)) this.botAbilities(p);
    }

    this.updateBullets();

    const scoreReached = this.mode === "teams" && (this.scores[0] >= SCORE_TO_WIN || this.scores[1] >= SCORE_TO_WIN);
    if (scoreReached || this.principalDown || this.time >= this.duration) this.finished = true;
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
        visits: p.zoneVisits.length,
        maxHp: p.maxHp,
        jailed: p.alive ? r1(Math.max(0, p.jailedUntil - this.time)) : 0,
        stunned: p.alive && this.time < p.stunnedUntil,
        reveal: p.alive && this.time < p.revealUntil,
        ...(this.isPrincipal(p) && {
          cds: ABILITIES.map((a) => r1(Math.max(0, p.cooldowns[a.id] - this.time))),
        }),
        ...(this.speedMult(p) !== 1 && { speed: this.speedMult(p) }),
        ...(this.time < p.reversedUntil && { reversed: true }),
        ...(p.god && { god: true }),
        ...(p.infAmmo && { infAmmo: true }),
        ...(p.turbo && { turbo: true }),
        ...(p.superSpeed && { superSpeed: true }),
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
      zoneVisits: [],
      inZone: false,
      zoneLeftAt: -Infinity,
      spawnHpFrac: 1,
      maxHp: maxHpFor(e.loadout.archetype),
      radius: radiusFor(e.loadout.archetype),
      jailedUntil: 0,
      stunnedUntil: 0,
      revealUntil: 0,
      cooldowns: { detention: 0, lecture: 0, quiz: 0, intercom: 0 },
      reversedUntil: 0,
      slowUntil: 0,
      turbo: false,
      superSpeed: false,
      god: false,
      infAmmo: false,
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
    // Locked in detention or stunned by a lecture: you can look around, nothing else.
    const held = this.isJailed(p) || this.time < p.stunnedUntil;
    // Pranked with reversed controls: every direction is flipped.
    const flip = this.time < p.reversedUntil ? -1 : 1;
    const mx = held ? 0 : flip * Math.max(-1, Math.min(1, input.mx || 0));
    const my = held ? 0 : flip * Math.max(-1, Math.min(1, input.my || 0));
    movePlayer(p, mx, my, BASE_SPEED * moveSpeedFor(p.loadout.archetype) * this.speedMult(p), DT, p.radius);

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
    // No throwing from inside the Nurse's Office (except the Principal, who isn't a patient).
    const ready =
      !held &&
      p.reloadEnd < 0 &&
      this.time >= p.nextFire &&
      this.time >= p.swapReadyAt &&
      (this.isPrincipal(p) || !inSafeZone(p.x, p.y));
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
    if (!p.infAmmo) p.ammo[p.slot]--;
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
        const t = segmentCircle(b.x, b.y, nx, ny, p.x, p.y, p.radius + WEAPONS[b.weapon].radius);
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

  private damage(
    target: PlayerState,
    b: Pick<Bullet, "owner" | "team" | "weapon" | "damage">,
    x: number,
    y: number,
  ) {
    const zoneProtected = inSafeZone(target.x, target.y) && !this.isPrincipal(target);
    if (this.time < target.protectedUntil || zoneProtected || this.isJailed(target) || target.god) {
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
    if (this.mode === "boss" && this.isPrincipal(target)) this.principalDown = true;
  }

  private respawn(p: PlayerState) {
    if (p.pendingLoadout) {
      p.loadout = p.pendingLoadout;
      p.pendingLoadout = null;
    }
    p.maxHp = maxHpFor(p.loadout.archetype);
    p.radius = radiusFor(p.loadout.archetype);
    const spawn = this.pickSpawn(p);
    p.x = spawn.x;
    p.y = spawn.y;
    p.vx = 0;
    p.vy = 0;
    p.aim = p.team === 0 ? 0 : Math.PI;
    p.hp = Math.round(p.maxHp * p.spawnHpFrac);
    p.spawnHpFrac = 1;
    p.jailedUntil = 0;
    p.stunnedUntil = 0;
    p.revealUntil = 0;
    p.zoneTime = 0;
    p.zoneVisits = [];
    p.inZone = false;
    p.zoneLeftAt = -Infinity;
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

  /**
   * Heal inside the Nurse's Office. Stay too long, or keep ducking in and out,
   * and you pass out.
   */
  private updateSafeZone(p: PlayerState) {
    // The Principal isn't a patient: no healing, no protection, no timer.
    if (this.isPrincipal(p)) return;
    p.zoneVisits = p.zoneVisits.filter((t) => this.time - t < SAFE_ZONE_VISIT_WINDOW);
    if (!inSafeZone(p.x, p.y)) {
      if (p.inZone) p.zoneLeftAt = this.time;
      p.inZone = false;
      p.zoneTime = Math.max(0, p.zoneTime - DT);
      return;
    }
    if (!p.inZone) {
      p.inZone = true;
      if (this.time - p.zoneLeftAt >= SAFE_ZONE_REENTRY_GRACE) p.zoneVisits.push(this.time);
      if (p.zoneVisits.length >= SAFE_ZONE_MAX_VISITS) {
        this.passOut(p, "visits");
        return;
      }
    }
    p.hp = Math.min(p.maxHp, p.hp + SAFE_ZONE_HEAL * DT);
    p.zoneTime += DT;
    if (p.zoneTime >= SAFE_ZONE_MAX_TIME) this.passOut(p, "time");
  }

  /** Knocked out by the Nurse's Office: dies without giving anyone a kill and respawns with half health. */
  private passOut(p: PlayerState, reason: "time" | "visits") {
    p.hp = 0;
    p.alive = false;
    p.respawnAt = this.time + RESPAWN_TIME;
    p.deaths++;
    p.inputs = [];
    p.spawnHpFrac = 0.5;
    this.events.push({ k: "passout", victim: p.id, reason });
  }

  // ---------------------------------------------------------------- Principal abilities

  /** Use one of the Principal's abilities. Returns why it failed, or null on success. */
  useAbility(id: string, ability: AbilityId, targetId?: string, score?: number): string | null {
    const p = this.players.get(id);
    if (!p || !p.alive || !this.isPrincipal(p)) return "Only the Principal can do that.";
    if (!(ability in p.cooldowns)) return "Unknown ability.";
    if (this.time < p.cooldowns[ability]) return null;
    if (this.time < p.stunnedUntil) return null;
    const def = ABILITIES.find((a) => a.id === ability)!;

    switch (ability) {
      case "detention": {
        const target = targetId ? this.players.get(targetId) : undefined;
        if (!target || !target.alive || target.team === p.team || this.isJailed(target)) {
          return "That student can't be sent to detention.";
        }
        const d = Math.hypot(target.x - p.x, target.y - p.y);
        if (d > DETENTION_RANGE + 60 || !hasLineOfSight(p.x, p.y, target.x, target.y)) {
          return "That student is out of sight.";
        }
        const secs = detentionSeconds(score ?? 0);
        const spot = this.jailSpot();
        target.x = spot.x;
        target.y = spot.y;
        target.jailedUntil = this.time + secs;
        target.stunnedUntil = 0;
        target.reloadEnd = -1;
        target.triggerQueued = false;
        target.inputs = [];
        target.brain?.reset();
        this.events.push({ k: "jailed", by: p.id, target: target.id, secs });
        break;
      }
      case "lecture": {
        for (const s of this.players.values()) {
          if (!s.alive || s.team === p.team || this.isJailed(s)) continue;
          if (Math.hypot(s.x - p.x, s.y - p.y) > LECTURE_RADIUS + s.radius) continue;
          if (!hasLineOfSight(p.x, p.y, s.x, s.y)) continue;
          const lecture = WEAPONS.lecture;
          this.damage(s, { owner: p.id, team: p.team, weapon: "lecture", damage: lecture.damage }, s.x, s.y);
          if (s.alive) s.stunnedUntil = this.time + LECTURE_STUN;
        }
        break;
      }
      case "quiz": {
        const w = WEAPONS.quiz;
        for (let i = 0; i < QUIZ_PAPERS; i++) {
          const a = p.aim + (i / QUIZ_PAPERS) * Math.PI * 2;
          this.bullets.push({
            id: this.nextBulletId++,
            owner: p.id,
            team: p.team,
            weapon: "quiz",
            x: p.x,
            y: p.y,
            vx: Math.cos(a) * w.projectileSpeed,
            vy: Math.sin(a) * w.projectileSpeed,
            damage: w.damage,
            travelled: 0,
            range: w.range,
          });
        }
        this.events.push({ k: "shot", by: p.id, weapon: "quiz" });
        break;
      }
      case "intercom":
        p.revealUntil = this.time + INTERCOM_TIME;
        break;
    }
    p.cooldowns[ability] = this.time + def.cooldown;
    p.protectedUntil = 0;
    this.events.push({ k: "ability", by: p.id, ability, x: r1(p.x), y: r1(p.y) });
    return null;
  }

  // ---------------------------------------------------------------- prank menu

  /** Movement speed multiplier from pranks (turbo, slow). */
  speedMult(p: PlayerState) {
    const boost = p.superSpeed ? SUPER_MULT : p.turbo ? TURBO_MULT : 1;
    return boost * (this.time < p.slowUntil ? SLOW_MULT : 1);
  }

  /**
   * Secret prank menu. Nothing shows in the kill feed, so friends only see
   * what happens to them. Returns why it failed, or null.
   */
  prank(byId: string, action: PrankAction, targetId?: string): string | null {
    const me = this.players.get(byId);
    if (!me) return "You're not in the match.";
    switch (action) {
      case "god":
        me.god = !me.god;
        return null;
      case "ammo":
        me.infAmmo = !me.infAmmo;
        if (me.infAmmo) me.ammo = this.fullAmmo(me.loadout);
        return null;
      case "super":
        me.superSpeed = !me.superSpeed;
        return null;
      case "turbo":
        me.turbo = !me.turbo;
        return null;
      case "heal":
        if (me.alive) me.hp = me.maxHp;
        return null;
    }

    const t = targetId ? this.players.get(targetId) : undefined;
    if (!t) return "Pick a player first.";
    if (!t.alive) return `${t.name} is already down.`;
    switch (action) {
      case "freeze":
        t.stunnedUntil = this.time + FREEZE_TIME;
        break;
      case "detention": {
        const spot = this.jailSpot();
        t.x = spot.x;
        t.y = spot.y;
        t.jailedUntil = this.time + PRANK_TIME;
        t.inputs = [];
        t.brain?.reset();
        break;
      }
      case "reverse":
        t.reversedUntil = this.time + PRANK_TIME;
        break;
      case "slow":
        t.slowUntil = this.time + PRANK_TIME;
        break;
      case "bring":
        if (!me.alive) return "You need to be alive to bring someone to you.";
        t.x = me.x;
        t.y = me.y;
        movePlayer(t, 1, 0, 1, DT, t.radius); // nudge out of any wall
        t.inputs = [];
        break;
      case "yeet": {
        const spots = Object.values(SPAWNS).flat();
        const s = spots[Math.floor(Math.random() * spots.length)];
        t.x = s.x;
        t.y = s.y;
        t.inputs = [];
        break;
      }
      case "onehp":
        t.hp = 1;
        break;
      case "knockout":
        t.hp = 0;
        t.alive = false;
        t.respawnAt = this.time + RESPAWN_TIME;
        t.deaths++;
        t.inputs = [];
        this.events.push({ k: "passout", victim: t.id, reason: "prank" });
        // In boss mode, knocking out the Principal still ends the match.
        if (this.mode === "boss" && this.isPrincipal(t)) this.principalDown = true;
        break;
    }
    return null;
  }

  /** A free spot in the Detention room. */
  private jailSpot() {
    const spots = SPAWNS.clown;
    const used = [...this.players.values()].filter((p) => p.alive && this.isJailed(p));
    const free = spots.filter((s) => used.every((u) => Math.hypot(u.x - s.x, u.y - s.y) > 40));
    const pool = free.length > 0 ? free : spots;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** A bot Principal uses its abilities when they'd help. */
  private botAbilities(p: PlayerState) {
    const ready = (a: AbilityId) => this.time >= p.cooldowns[a];
    const students = [...this.players.values()].filter((s) => s.alive && s.team !== p.team && !this.isJailed(s));
    const inSight = students
      .map((s) => ({ s, d: Math.hypot(s.x - p.x, s.y - p.y) }))
      .filter(({ s, d }) => d < 900 && hasLineOfSight(p.x, p.y, s.x, s.y))
      .sort((a, b) => a.d - b.d);
    // Bots don't spam: a small chance each tick once an ability makes sense.
    if (Math.random() > 0.08) return;

    if (ready("lecture") && inSight.filter(({ d }) => d < LECTURE_RADIUS).length >= 2) {
      this.useAbility(p.id, "lecture");
    } else if (ready("detention") && inSight.length > 0 && inSight[0].d < DETENTION_RANGE) {
      this.useAbility(p.id, "detention", inSight[0].s.id, 0.3 + Math.random() * 0.7);
    } else if (ready("quiz") && inSight.filter(({ d }) => d < 500).length >= 1) {
      this.useAbility(p.id, "quiz");
    } else if (ready("intercom") && inSight.length === 0) {
      this.useAbility(p.id, "intercom");
    }
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
