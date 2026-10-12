import {
  BASE_SPEED,
  DT,
  MAX_HP,
  PLAYER_RADIUS,
  RESPAWN_TIME,
  SAFE_ZONE_HEAL,
  SAFE_ZONE_MAX_TIME,
  SAFE_ZONE_MAX_VISITS,
  SAFE_ZONE_REENTRY_GRACE,
  SAFE_ZONE_VISIT_WINDOW,
  SPAWN_PROTECTION,
  SWAP_TIME,
  matchDurationFor,
  winScoreFor,
  type GameMode,
  type Team,
} from "../shared/constants";
import { SPAWNS, inSafeZone } from "../shared/map";
import { firstWallHitWithNormal, hasLineOfSight, movePlayer, segmentCircle } from "../shared/physics";
import type { BulletSnap, GameEvent, InputFrame, PlayerSnap } from "../shared/protocol";
import {
  BOSS_DAMAGE_BONUS,
  STUDENT_LIVES,
  BOSS_SPEED_BONUS,
  DUEL_PRINCIPAL_HP,
  HALL_PASS_DISTANCE,
  STAFF_MEETING_TIME,
  abilitiesFor,
  DASH_DISTANCE,
  DASH_STUN,
  EXTRA_CREDIT_HEAL,
  EXTRA_CREDIT_RADIUS,
  OVERCLOCK_SPEED,
  OVERCLOCK_TIME,
  PAINT_BOMB_RADIUS,
  PAINT_BOMB_SLOW,
  SPECIAL_WEAPONS,
  SUPERS,
  SUPER_CHARGE_DAMAGE,
  SUPER_PASSIVE_SECONDS,
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
import {
  XP_PER_DAMAGE,
  XP_PER_KILL,
  clampLevel,
  levelBonus,
  type ClassLevels,
  type ClassXp,
} from "../shared/progress";
import { FREEZE_TIME, PRANK_TIME, SLOW_MULT, SUPER_MULT, TURBO_MULT, type PrankAction } from "../shared/pranks";

export interface MatchEntry {
  id: string;
  name: string;
  team: Team;
  loadout: Loadout;
  isBot: boolean;
  /** Class levels this player has earned (bots play at level 1). */
  levels?: ClassLevels;
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
  /** Boss mode students: knockouts left before they're out for the match. */
  lives: number;
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
  /** Duel Principal's Staff Meeting: can't be hurt until this match time. */
  shieldUntil: number;
  /** Principal: match time each ability is ready again. */
  cooldowns: Record<AbilityId, number>;
  // Prank menu effects.
  reversedUntil: number;
  slowUntil: number;
  turbo: boolean;
  superSpeed: boolean;
  god: boolean;
  infAmmo: boolean;
  /** Super charge, 0 to 1. */
  superCharge: number;
  /** Nerd super: faster firing and moving until this match time. */
  overclockUntil: number;
  levels: ClassLevels;
  /** XP earned this match, per class. */
  xp: ClassXp;
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
  /** Wall bounces left (dodgeballs). */
  bounces: number;
}

/** Speed a dodgeball keeps after each bounce. */
const BOUNCE_KEEP = 0.85;

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

  /** Why a boss match ended, for the results screen. */
  get endReason(): "knockout" | "wipe" | "bell" {
    if (this.principalDown) return "knockout";
    return this.studentsWiped() ? "wipe" : "bell";
  }

  /** Boss mode: every student has used up all their lives. */
  studentsWiped() {
    if (this.mode !== "boss") return false;
    const students = [...this.players.values()].filter((p) => !this.isPrincipal(p));
    return students.length > 0 && students.every((p) => !p.alive && p.lives === 0);
  }

  /** Boss mode: a student is down; take a life, and with none left they stay out. */
  private loseLife(p: PlayerState) {
    if (this.mode !== "boss" || this.isPrincipal(p)) return;
    p.lives = Math.max(0, p.lives - 1);
    if (p.lives === 0) p.respawnAt = Infinity;
  }

  constructor(
    entries: MatchEntry[],
    readonly mode: GameMode = "teams",
  ) {
    for (const e of entries) this.respawn(this.createPlayer(e));
  }

  get duration() {
    return matchDurationFor(this.mode);
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
      if (p.alive && !this.isPrincipal(p)) {
        p.superCharge = Math.min(1, p.superCharge + DT / SUPER_PASSIVE_SECONDS);
        if (p.isBot && p.superCharge >= 1) this.botSuper(p);
      }
    }

    this.updateBullets();

    const goal = winScoreFor(this.mode);
    const scoreReached = this.scores[0] >= goal || this.scores[1] >= goal;
    if (scoreReached || this.principalDown || this.studentsWiped() || this.time >= this.duration) this.finished = true;
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
        respawn: p.alive || !Number.isFinite(p.respawnAt) ? 0 : r1(Math.max(0, p.respawnAt - this.time)),
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
        ...(this.mode === "boss" && !this.isPrincipal(p) && { lives: p.lives }),
        jailed: p.alive ? r1(Math.max(0, p.jailedUntil - this.time)) : 0,
        stunned: p.alive && this.time < p.stunnedUntil,
        reveal: p.alive && this.time < p.revealUntil,
        ...(this.isPrincipal(p) && {
          cds: abilitiesFor(this.mode).map((a) => r1(Math.max(0, p.cooldowns[a.id] - this.time))),
        }),
        ...(this.speedMult(p) !== 1 && { speed: this.speedMult(p) }),
        ...(this.time < p.reversedUntil && { reversed: true }),
        ...(p.god && { god: true }),
        ...(p.infAmmo && { infAmmo: true }),
        ...(p.turbo && { turbo: true }),
        ...(p.superSpeed && { superSpeed: true }),
        sup: r2(p.superCharge),
        ...(this.time < p.overclockUntil && { boosted: true }),
        ...(this.time < p.shieldUntil && { shielded: true }),
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
      lives: STUDENT_LIVES,
      maxHp: this.maxHpOf(e.loadout, e.levels ?? {}),
      radius: radiusFor(e.loadout.archetype),
      jailedUntil: 0,
      stunnedUntil: 0,
      revealUntil: 0,
      cooldowns: {
        detention: 0,
        lecture: 0,
        quiz: 0,
        intercom: 0,
        hallpass: 0,
        suspension: 0,
        staffmeeting: 0,
        reportcard: 0,
      },
      shieldUntil: 0,
      reversedUntil: 0,
      slowUntil: 0,
      turbo: false,
      superSpeed: false,
      god: false,
      infAmmo: false,
      superCharge: 0,
      overclockUntil: 0,
      levels: e.levels ?? {},
      xp: {},
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
    p.nextFire = this.time + 1 / (weapon.fireRate * (this.time < p.overclockUntil ? 2 : 1));
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
        damage: weapon.damage * this.damageMult(p),
        travelled: 0,
        bounces: weapon.bounces ?? 0,
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
      const wall = firstWallHitWithNormal(b.x, b.y, nx, ny);
      let hitT = wall?.t ?? null;
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
        // Dodgeballs bounce off walls: reflect, lose a little speed, keep going.
        if (!target && wall && b.bounces > 0) {
          const dot = b.vx * wall.nx + b.vy * wall.ny;
          b.vx = (b.vx - 2 * dot * wall.nx) * BOUNCE_KEEP;
          b.vy = (b.vy - 2 * dot * wall.ny) * BOUNCE_KEEP;
          b.travelled += Math.hypot(hx - b.x, hy - b.y);
          // Step just off the wall so it doesn't hit the same face again.
          b.x = hx + wall.nx * 0.5;
          b.y = hy + wall.ny * 0.5;
          b.bounces--;
          if (b.travelled < b.range) remaining.push(b);
        }
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
    const shielded = this.time < target.shieldUntil;
    if (this.time < target.protectedUntil || zoneProtected || this.isJailed(target) || target.god || shielded) {
      this.events.push({ k: "impact", x: r1(x), y: r1(y) });
      return;
    }
    const dmg = Math.min(target.hp, b.damage * (1 - ARCHETYPES[target.loadout.archetype].defense));
    target.hp -= dmg;
    target.brain?.onDamaged(b.owner, this.time);
    this.events.push({ k: "hit", by: b.owner, target: target.id, x: r1(x), y: r1(y), dmg: Math.round(dmg) });
    const stun = WEAPONS[b.weapon].stun;
    if (stun) target.stunnedUntil = Math.max(target.stunnedUntil, this.time + stun);
    const attacker = this.players.get(b.owner);
    if (attacker) {
      // Dealing damage fills your super (but not damage from supers themselves) and earns class XP.
      if (!SPECIAL_WEAPONS.includes(b.weapon)) {
        attacker.superCharge = Math.min(1, attacker.superCharge + dmg / SUPER_CHARGE_DAMAGE);
      }
      this.addXp(attacker, dmg * XP_PER_DAMAGE);
    }
    if (target.hp > 0) return;

    target.hp = 0;
    target.alive = false;
    target.respawnAt = this.time + RESPAWN_TIME;
    target.deaths++;
    this.loseLife(target);
    target.inputs = [];
    const killer = this.players.get(b.owner);
    if (killer) {
      killer.kills++;
      this.addXp(killer, XP_PER_KILL);
    }
    this.scores[b.team]++;
    this.events.push({ k: "kill", killer: b.owner, victim: target.id, weapon: b.weapon });
    if (this.mode === "boss" && this.isPrincipal(target)) this.principalDown = true;
  }

  private respawn(p: PlayerState) {
    if (p.pendingLoadout) {
      p.loadout = p.pendingLoadout;
      p.pendingLoadout = null;
    }
    p.maxHp = this.maxHpOf(p.loadout, p.levels);
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
    p.overclockUntil = 0;
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
    this.loseLife(p);
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
    // Each mode has its own set of four; only those can be used.
    const def = abilitiesFor(this.mode).find((a) => a.id === ability);
    if (!def) return "That power isn't available in this mode.";

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
          this.damage(s, { owner: p.id, team: p.team, weapon: "lecture", damage: lecture.damage * this.damageMult(p) }, s.x, s.y);
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
            damage: w.damage * this.damageMult(p),
            travelled: 0,
            bounces: 0,
            range: w.range,
          });
        }
        this.events.push({ k: "shot", by: p.id, weapon: "quiz" });
        break;
      }
      case "intercom":
        p.revealUntil = this.time + INTERCOM_TIME;
        break;
      case "hallpass": {
        const dx = Math.cos(p.aim);
        const dy = Math.sin(p.aim);
        for (let d = 0; d < HALL_PASS_DISTANCE; d += 25) {
          const bx = p.x;
          const by = p.y;
          movePlayer(p, dx, dy, 25 / DT, DT, p.radius);
          if (Math.hypot(p.x - bx, p.y - by) < 8) break;
        }
        p.inputs = [];
        break;
      }
      case "suspension":
        this.fan(p, "suspension", 1, 0);
        break;
      case "reportcard":
        this.fan(p, "reportcard", 1, 0);
        break;
      case "staffmeeting":
        p.shieldUntil = this.time + STAFF_MEETING_TIME;
        break;
    }
    p.cooldowns[ability] = this.time + def.cooldown;
    p.protectedUntil = 0;
    this.events.push({ k: "ability", by: p.id, ability, x: r1(p.x), y: r1(p.y) });
    return null;
  }

  // ---------------------------------------------------------------- XP and levels

  levelOf(p: Pick<PlayerState, "levels" | "loadout">) {
    return clampLevel(p.levels[p.loadout.archetype] ?? 1);
  }

  /** Higher class levels hit harder. */
  damageMult(p: PlayerState) {
    // 7v1 buff: the boss Principal hits 20% harder.
    const boss = this.mode === "boss" && this.isPrincipal(p) ? BOSS_DAMAGE_BONUS : 1;
    return levelBonus(this.levelOf(p)) * boss;
  }

  private maxHpOf(loadout: Loadout, levels: ClassLevels) {
    // Duel Principals are built for a fair 1v1, not a 7v1 siege.
    const base = this.mode === "duel" && loadout.archetype === "principal" ? DUEL_PRINCIPAL_HP : maxHpFor(loadout.archetype);
    return Math.round(base * levelBonus(levels[loadout.archetype] ?? 1));
  }

  /** Earn XP for the class you're playing (the Principal isn't a class you level). */
  addXp(p: PlayerState, amount: number) {
    if (p.isBot || this.isPrincipal(p) || amount <= 0) return;
    const id = p.loadout.archetype;
    p.xp[id] = (p.xp[id] ?? 0) + amount;
  }

  /** A player's levels changed mid-match; it applies from their next respawn. */
  setLevels(id: string, levels: ClassLevels) {
    const p = this.players.get(id);
    if (p) p.levels = levels;
  }

  // ---------------------------------------------------------------- class supers

  /** Use your class super if it's fully charged. Fires where you're aiming. */
  useSuper(id: string) {
    const p = this.players.get(id);
    if (!p || !p.alive || p.superCharge < 1 || this.isPrincipal(p)) return;
    if (this.isJailed(p) || this.time < p.stunnedUntil) return;
    // Same rule as throwing: no supers from inside the Nurse's Office.
    if (inSafeZone(p.x, p.y)) return;
    const def = SUPERS[p.loadout.archetype];
    if (!def) return;
    p.superCharge = 0;
    p.protectedUntil = 0;

    switch (def.id) {
      case "extracredit":
        for (const t of this.players.values()) {
          if (!t.alive || t.team !== p.team) continue;
          if (Math.hypot(t.x - p.x, t.y - p.y) > EXTRA_CREDIT_RADIUS) continue;
          t.hp = Math.min(t.maxHp, t.hp + EXTRA_CREDIT_HEAL);
        }
        break;
      case "meatball":
        this.fan(p, "meatball", 7, 0.5);
        break;
      case "pies":
        this.fan(p, "pie", 5, 0.25);
        break;
      case "dash": {
        const dx = Math.cos(p.aim);
        const dy = Math.sin(p.aim);
        const hit = new Set<PlayerState>();
        const step = 30;
        for (let d = 0; d < DASH_DISTANCE; d += step) {
          const bx = p.x;
          const by = p.y;
          movePlayer(p, dx, dy, step / DT, DT, p.radius);
          // Stop early if a wall stopped us.
          if (Math.hypot(p.x - bx, p.y - by) < step * 0.3) break;
          for (const t of this.players.values()) {
            if (!t.alive || t.team === p.team || hit.has(t)) continue;
            if (Math.hypot(t.x - p.x, t.y - p.y) < p.radius + t.radius + 10) hit.add(t);
          }
        }
        for (const t of hit) {
          this.damage(t, this.superShot(p, "tackle"), t.x, t.y);
          if (t.alive) t.stunnedUntil = this.time + DASH_STUN;
        }
        p.inputs = [];
        break;
      }
      case "paintbomb":
        for (const t of this.players.values()) {
          if (!t.alive || t.team === p.team || this.isJailed(t)) continue;
          if (Math.hypot(t.x - p.x, t.y - p.y) > PAINT_BOMB_RADIUS + t.radius) continue;
          if (!hasLineOfSight(p.x, p.y, t.x, t.y)) continue;
          this.damage(t, this.superShot(p, "paintbomb"), t.x, t.y);
          if (t.alive) t.slowUntil = Math.max(t.slowUntil, this.time + PAINT_BOMB_SLOW);
        }
        break;
      case "overclock":
        p.overclockUntil = this.time + OVERCLOCK_TIME;
        break;
    }
    this.events.push({ k: "super", by: p.id, super: def.id, x: r1(p.x), y: r1(p.y) });
  }

  /** A damage source for a super, scaled by the user's level. */
  private superShot(p: PlayerState, weapon: WeaponId) {
    return { owner: p.id, team: p.team, weapon, damage: WEAPONS[weapon].damage * this.damageMult(p) };
  }

  /** Throw `count` projectiles in a fan `spread` radians wide either side of your aim. */
  private fan(p: PlayerState, weapon: WeaponId, count: number, spread: number) {
    const w = WEAPONS[weapon];
    for (let i = 0; i < count; i++) {
      const a = p.aim + (count === 1 ? 0 : -spread + (2 * spread * i) / (count - 1));
      this.bullets.push({
        id: this.nextBulletId++,
        owner: p.id,
        team: p.team,
        weapon,
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * w.projectileSpeed,
        vy: Math.sin(a) * w.projectileSpeed,
        damage: w.damage * this.damageMult(p),
        travelled: 0,
        range: w.range,
        bounces: 0,
      });
    }
    this.events.push({ k: "shot", by: p.id, weapon });
  }

  /** Bots fire their super when it would help. */
  private botSuper(p: PlayerState) {
    if (Math.random() > 0.05) return;
    const def = SUPERS[p.loadout.archetype];
    if (!def) return;
    if (def.id === "extracredit") {
      if (p.hp < p.maxHp * 0.6) this.useSuper(p.id);
      return;
    }
    let nearest: PlayerState | null = null;
    let best = def.id === "paintbomb" || def.id === "dash" ? 300 : 600;
    for (const t of this.players.values()) {
      if (!t.alive || t.team === p.team || this.isJailed(t)) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < best && hasLineOfSight(p.x, p.y, t.x, t.y)) {
        best = d;
        nearest = t;
      }
    }
    if (!nearest) return;
    p.aim = Math.atan2(nearest.y - p.y, nearest.x - p.x);
    this.useSuper(p.id);
  }

  // ---------------------------------------------------------------- prank menu

  /** Movement speed multiplier from pranks (turbo, slow). */
  speedMult(p: PlayerState) {
    const boost =
      (p.superSpeed ? SUPER_MULT : p.turbo ? TURBO_MULT : 1) * (this.time < p.overclockUntil ? OVERCLOCK_SPEED : 1);
    // 7v1 buff: the boss Principal is a bit quicker.
    const boss = this.mode === "boss" && this.isPrincipal(p) ? BOSS_SPEED_BONUS : 1;
    return boost * boss * (this.time < p.slowUntil ? SLOW_MULT : 1);
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
        this.loseLife(t);
        t.inputs = [];
        this.events.push({ k: "passout", victim: t.id, reason: "prank" });
        // In boss mode, knocking out the Principal still ends the match.
        if (this.mode === "boss" && this.isPrincipal(t)) this.principalDown = true;
        break;
    }
    return null;
  }

  /** A bot duel Principal: shield when hurt, shoot when it has a clear shot, dash away when cornered. */
  private botDuelAbilities(p: PlayerState) {
    if (Math.random() > 0.08) return;
    const ready = (a: AbilityId) => this.time >= p.cooldowns[a];
    let foe: PlayerState | null = null;
    let dist = Infinity;
    for (const t of this.players.values()) {
      if (!t.alive || t.team === p.team) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < dist && d < 900 && hasLineOfSight(p.x, p.y, t.x, t.y)) {
        dist = d;
        foe = t;
      }
    }
    if (ready("staffmeeting") && foe && p.hp < p.maxHp * 0.35) {
      this.useAbility(p.id, "staffmeeting");
      return;
    }
    if (!foe) return;
    const aimAtFoe = Math.atan2(foe.y - p.y, foe.x - p.x);
    if (ready("hallpass") && dist < 220 && p.hp < p.maxHp * 0.5) {
      // Dash away from them.
      p.aim = aimAtFoe + Math.PI;
      this.useAbility(p.id, "hallpass");
    } else if (ready("suspension")) {
      p.aim = aimAtFoe;
      this.useAbility(p.id, "suspension");
    } else if (ready("reportcard") && dist < 600) {
      p.aim = aimAtFoe;
      this.useAbility(p.id, "reportcard");
    }
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
    if (this.mode === "duel") {
      this.botDuelAbilities(p);
      return;
    }
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
