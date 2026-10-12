import {
  BASE_SPEED,
  CEILING_HEIGHT,
  DT,
  EYE_HEIGHT,
  GRAVITY,
  MAX_HP,
  MAX_PITCH,
  PLAYER_HEIGHT,
  THROW_HEIGHT,
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
import {
  SPAWNS,
  TARDIS_ARRIVE_INSIDE,
  TARDIS,
  TARDIS_SPOTS,
  atTardisConsole,
  inTardis,
  moveTardis,
  tardisArriveOutside,
  tardisSpotNow,
  WALLS,
  WALL_HEIGHT,
  atTardisDoor,
  atTardisExit,
  inSafeZone,
} from "../shared/map";
import {
  CROUCH_SCALE,
  firstWallHitWithNormal,
  hasLineOfSight,
  movePlayer,
  segmentCircle,
  segmentRectHit,
  stanceSpeed,
  stepVertical,
} from "../shared/physics";
import type { BulletSnap, GameEvent, InputFrame, PlayerSnap, ZoneSnap } from "../shared/protocol";
import {
  ABILITY_IDS,
  AFTERBURN_DAMAGE,
  AIRBLAST_CONE,
  AIRBLAST_PUSH,
  AIRBLAST_RANGE,
  COMPANIONS,
  rollCompanion,
  type CompanionKind,
  ANTIOXIDANT_HEAL,
  ANTIOXIDANT_SPEED,
  ANTIOXIDANT_TIME,
  BOSS_DAMAGE_BONUS,
  STUDENT_LIVES,
  BOSS_SPEED_BONUS,
  JAM_DPS,
  JAM_RADIUS,
  JAM_RANGE,
  JAM_TIME,
  MAX_PEELS,
  PEEL_RADIUS,
  PEEL_TIME,
  RIND_TIME,
  ROLL_DISTANCE,
  ROLL_STUN,
  SQUIRT_DROPS,
  abilitiesOf,
  hasAbilities,
  DASH_DISTANCE,
  DASH_STUN,
  EXTRA_CREDIT_HEAL,
  EXTRA_CREDIT_RADIUS,
  FIGHT_SONG_HEAL,
  FIGHT_SONG_RADIUS,
  FIGHT_SONG_TIME,
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
  /** Peely's Thick Rind: can't be hurt until this match time. */
  shieldUntil: number;
  /** Can't ride the TARDIS again until this match time. */
  tardisReadyAt: number;
  /** Barry's Antioxidants: faster until this match time. */
  hasteUntil: number;
  /** Feet off the floor (jumping, or up on a desk), and rising speed. */
  z: number;
  vz: number;
  /** Holding crouch: shorter and slower. */
  crouching: boolean;
  /** Gamer super: playing as one of these characters until formUntil. */
  form: CompanionKind | null;
  formUntil: number;
  /** On fire (Pyro) until this match time: afterburn every half second, credited to burnBy. */
  burnUntil: number;
  nextBurn: number;
  burnBy: string;
  burnTeam: Team;
  /** 3D view: how far up (positive) or down they're aiming. */
  pitch: number;
  /** Principal and mascots: match time each ability is ready again. */
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
  /** 3D view only: height above the floor and upward speed. */
  z: number;
  vz: number;
}

/** Something lying on the floor from a mascot power. */
interface Zone extends ZoneSnap {
  owner: string;
  until: number;
  /** Jam: next match time it hurts whoever is standing in it. */
  nextTick: number;
}

/** Speed a dodgeball keeps after each bounce. */
const BOUNCE_KEEP = 0.85;

// 3D throw physics.
/** How much gravity pulls on each kind of throw: balls and blobs arc, darts and streaks fly almost flat. */
const GRAVITY_SCALE = { ball: 1, blob: 1, streak: 0.3 } as const;
/** Of its upward speed, a ball keeps this much when it bounces off the floor, ceiling or a desk top. */
const FLOOR_KEEP = 0.55;
/** And of its forward speed. */
const FLOOR_GRIP = 0.85;
/** Balls rolling slower than this are dead. */
const DEAD_BALL_SPEED = 160;

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
  private zones: Zone[] = [];
  private events: GameEvent[] = [];
  private nextBulletId = 1;
  private nextZoneId = 1;

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
    const students = [...this.players.values()].filter((p) => !this.isBoss(p));
    return students.length > 0 && students.every((p) => !p.alive && p.lives === 0);
  }

  /** Boss mode: a student is down; take a life, and with none left they stay out. */
  private loseLife(p: PlayerState) {
    if (this.mode !== "boss" || this.isBoss(p)) return;
    p.lives = Math.max(0, p.lives - 1);
    if (p.lives === 0) p.respawnAt = Infinity;
  }

  constructor(
    entries: MatchEntry[],
    readonly mode: GameMode = "teams",
    /** Played in the 3D view: throws fly in 3D, with gravity and bounces. */
    readonly view3d = false,
  ) {
    // Every match starts with the TARDIS back in the Library.
    moveTardis(0);
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

  /** The Principal or a duel mascot: four powers instead of a class super, and not a patient. */
  isBoss(p: PlayerState) {
    return hasAbilities(p.loadout.archetype);
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
    if (old && this.isBoss(old) && this.isBoss(p)) {
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
    // Playing as Cuphead, Mugman or Churchill, you shoot what they shoot.
    if (p.form) return COMPANIONS[p.form].weapon;
    return weaponsOf(p.loadout.archetype, p.loadout.section)[p.slot];
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
      if (p.alive) this.rideTardis(p);
      if (p.alive) this.updateFormAndBurn(p);
      if (p.isBot && p.alive && this.isBoss(p)) this.botAbilities(p);
      if (p.alive && !this.isBoss(p)) {
        p.superCharge = Math.min(1, p.superCharge + DT / SUPER_PASSIVE_SECONDS);
        if (p.isBot && p.superCharge >= 1) this.botSuper(p);
      }
    }

    this.updateBullets();
    this.updateZones();

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
        ...(p.loadout.section && { section: p.loadout.section }),
        ...(p.alive && p.z > 0 && { z: p.z }),
        ...(p.alive && p.vz !== 0 && { vz: p.vz }),
        ...(p.alive && p.crouching && { crouch: true }),
        ...(p.alive && p.form && { form: p.form, formLeft: r1(Math.max(0, p.formUntil - this.time)) }),
        ...(p.alive && this.time < p.burnUntil && { burning: true }),
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
        ...(this.mode === "boss" && !this.isBoss(p) && { lives: p.lives }),
        jailed: p.alive ? r1(Math.max(0, p.jailedUntil - this.time)) : 0,
        stunned: p.alive && this.time < p.stunnedUntil,
        reveal: p.alive && this.time < p.revealUntil,
        ...(this.isBoss(p) && {
          cds: abilitiesOf(p.loadout.archetype).map((a) => r1(Math.max(0, p.cooldowns[a.id] - this.time))),
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
      ...(this.view3d && { z: r1(b.z) }),
    }));
    const zones: ZoneSnap[] = this.zones.map((z) => ({ id: z.id, k: z.k, x: r1(z.x), y: r1(z.y), r: z.r, team: z.team }));
    const events = this.events;
    this.events = [];
    return {
      tick: this.tick,
      scores: this.scores,
      timeLeft: Math.ceil(this.timeLeft),
      players,
      bullets,
      zones,
      tardis: tardisSpotNow(),
      events,
    };
  }

  fullAmmo(loadout: Loadout): [number, number] {
    const [a, b] = weaponsOf(loadout.archetype, loadout.section);
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
      cooldowns: Object.fromEntries(ABILITY_IDS.map((a) => [a, 0])) as Record<AbilityId, number>,
      shieldUntil: 0,
      hasteUntil: 0,
      tardisReadyAt: 0,
      pitch: 0,
      z: 0,
      vz: 0,
      crouching: false,
      form: null,
      formUntil: 0,
      burnUntil: 0,
      nextBurn: 0,
      burnBy: "",
      burnTeam: 0,
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
    if (this.view3d && Number.isFinite(input.pitch)) p.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, input.pitch!));

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
    // Sprinting is faster, crouching slower; jumping takes off from the ground.
    const stance = held ? 1 : stanceSpeed(input.sprint, input.crouch);
    movePlayer(p, mx, my, BASE_SPEED * moveSpeedFor(p.loadout.archetype) * this.speedMult(p) * stance, DT, p.radius);
    stepVertical(p, !held && !!input.jump, DT, p.radius);
    p.crouching = !held && !!input.crouch;

    if (p.reloadEnd >= 0 && this.time >= p.reloadEnd) {
      p.ammo[p.slot] = weapon.magSize;
      p.reloadEnd = -1;
    }
    if (input.reload && !p.form && p.reloadEnd < 0 && p.ammo[p.slot] < weapon.magSize) {
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
      (this.isBoss(p) || !inSafeZone(p.x, p.y));
    if (wantsFire && ready) {
      if (p.form || p.ammo[p.slot] > 0) {
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
    // Playing as Cuphead, Mugman or Churchill: shots never run out.
    if (!p.infAmmo && !p.form) p.ammo[p.slot]--;
    p.nextFire = this.time + 1 / (weapon.fireRate * (this.time < p.overclockUntil ? 2 : 1));
    p.protectedUntil = 0;
    const pitch = this.pitchOf(p, weaponId);
    for (let i = 0; i < weapon.pellets; i++) {
      const angle = p.aim + (Math.random() * 2 - 1) * weapon.spread;
      const speed = weapon.projectileSpeed * (weapon.pellets > 1 ? 0.9 + Math.random() * 0.2 : 1);
      // Shotgun-style throws spread up and down a little too.
      const tilt = pitch + (weapon.pellets > 1 ? (Math.random() * 2 - 1) * weapon.spread * 0.5 : 0);
      this.launch(p, weaponId, p.x, p.y, this.handHeight(p), angle, tilt, speed, weapon.damage * this.damageMult(p));
    }
    this.events.push({ k: "shot", by: p.id, weapon: weaponId });
    if (p.ammo[p.slot] === 0 && !p.form) this.startReload(p);
  }

  /**
   * Send a projectile flying. Top-down it just goes along `angle`; in 3D it
   * starts at height `z` and is tilted up or down by `pitch`.
   */
  private launch(
    owner: { id: string; team: Team },
    weapon: WeaponId,
    x: number,
    y: number,
    z: number,
    angle: number,
    pitch: number,
    speed: number,
    damage: number,
  ) {
    const w = WEAPONS[weapon];
    const flat = this.view3d ? Math.cos(pitch) : 1;
    this.bullets.push({
      id: this.nextBulletId++,
      owner: owner.id,
      team: owner.team,
      weapon,
      x,
      y,
      vx: Math.cos(angle) * speed * flat,
      vy: Math.sin(angle) * speed * flat,
      damage,
      travelled: 0,
      range: w.range,
      bounces: w.bounces ?? 0,
      z,
      vz: this.view3d ? Math.sin(pitch) * speed : 0,
    });
  }

  /**
   * How far up to throw, in 3D. People throw where they look; bots lob just
   * high enough to reach whoever they're aiming at.
   */
  /** In 3D, throws leave your hand: higher mid-jump or up on a desk, lower when crouching. */
  private handHeight(p: PlayerState) {
    return p.z + THROW_HEIGHT * (p.crouching ? CROUCH_SCALE : 1);
  }

  private pitchOf(p: PlayerState, weapon: WeaponId) {
    if (!this.view3d) return 0;
    if (!p.isBot) return p.pitch;
    const w = WEAPONS[weapon];
    let dist = Infinity;
    for (const t of this.players.values()) {
      if (!t.alive || t.team === p.team) continue;
      let diff = Math.atan2(t.y - p.y, t.x - p.x) - p.aim;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < 0.35) dist = Math.min(dist, Math.hypot(t.x - p.x, t.y - p.y));
    }
    if (!Number.isFinite(dist)) return 0;
    // The low arc that comes back down to throwing height at that distance.
    const s = (GRAVITY * GRAVITY_SCALE[w.style] * dist) / w.projectileSpeed ** 2;
    return s >= 1 ? 0.6 : Math.min(0.6, 0.5 * Math.asin(s));
  }

  private updateBullets() {
    const moving = this.bullets;
    // Bursts launched while moving land here and start flying next tick.
    this.bullets = [];
    const remaining: Bullet[] = [];
    for (const b of moving) {
      if (this.view3d ? this.moveBullet3D(b) : this.moveBullet2D(b)) remaining.push(b);
      else this.burst(b);
    }
    this.bullets = [...remaining, ...this.bullets];
  }

  /** Move a projectile one tick, top-down. Returns false once it's done. */
  private moveBullet2D(b: Bullet) {
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
        this.bounceOffWall(b, hx, hy, wall);
        return b.travelled < b.range;
      }
      b.x = hx;
      b.y = hy;
      return false;
    }
    b.x = nx;
    b.y = ny;
    b.travelled += Math.hypot(b.vx, b.vy) * DT;
    return b.travelled < b.range;
  }

  /** Reflect off a wall face, losing a little speed. */
  private bounceOffWall(b: Bullet, hx: number, hy: number, wall: { nx: number; ny: number }) {
    const dot = b.vx * wall.nx + b.vy * wall.ny;
    b.vx = (b.vx - 2 * dot * wall.nx) * BOUNCE_KEEP;
    b.vy = (b.vy - 2 * dot * wall.ny) * BOUNCE_KEEP;
    b.travelled += Math.hypot(hx - b.x, hy - b.y);
    // Step just off the wall so it doesn't hit the same face again.
    b.x = hx + wall.nx * 0.5;
    b.y = hy + wall.ny * 0.5;
    b.bounces--;
  }

  /**
   * Move a projectile one tick in 3D: gravity pulls it into an arc, it can
   * fly over desks and tables and over people's heads, and balls bounce off
   * the floor, the ceiling and furniture tops, then roll to a stop. Splats
   * and darts end where they land. Returns false once it's done.
   */
  private moveBullet3D(b: Bullet) {
    const w = WEAPONS[b.weapon];
    const r = w.radius;
    const isBall = w.style === "ball" && !w.burst;
    const vz = b.vz - GRAVITY * (w.gravity ?? GRAVITY_SCALE[w.style]) * DT;
    const nx = b.x + b.vx * DT;
    const ny = b.y + b.vy * DT;
    const nz = b.z + ((b.vz + vz) / 2) * DT;
    const zAt = (t: number) => b.z + (nz - b.z) * t;

    // Walls and furniture, unless it passes over the top.
    let wall: { t: number; nx: number; ny: number } | null = null;
    for (const rect of WALLS) {
      const hit = segmentRectHit(b.x, b.y, nx, ny, rect);
      if (!hit || (wall && hit.t >= wall.t)) continue;
      if (zAt(hit.t) - r > WALL_HEIGHT[rect.kind]) continue;
      wall = hit;
    }
    let hitT = wall?.t ?? null;
    let target: PlayerState | null = null;
    for (const p of this.players.values()) {
      if (!p.alive || p.team === b.team) continue;
      const t = segmentCircle(b.x, b.y, nx, ny, p.x, p.y, p.radius + r);
      if (t === null || (hitT !== null && t >= hitT)) continue;
      // Over their head is a miss.
      // Over their head, or under their feet when they jump, is a miss.
      const tall = PLAYER_HEIGHT * (p.radius / PLAYER_RADIUS) * (p.crouching ? CROUCH_SCALE : 1);
      if (zAt(t) - r > p.z + tall || zAt(t) + r < p.z) continue;
      hitT = t;
      target = p;
    }
    if (hitT !== null) {
      const hx = b.x + (nx - b.x) * hitT;
      const hy = b.y + (ny - b.y) * hitT;
      b.z = zAt(hitT);
      if (target) this.damage(target, b, hx, hy);
      else this.events.push({ k: "impact", x: r1(hx), y: r1(hy) });
      if (!target && wall && b.bounces > 0) {
        this.bounceOffWall(b, hx, hy, wall);
        b.vz = vz;
        b.z = Math.max(b.z, r);
        return b.travelled < b.range;
      }
      b.x = hx;
      b.y = hy;
      return false;
    }

    b.travelled += Math.hypot(nx - b.x, ny - b.y);
    b.x = nx;
    b.y = ny;
    b.z = nz;
    b.vz = vz;

    // What's under it: a desk or table top, or the floor.
    let ground = 0;
    for (const rect of WALLS) {
      const h = WALL_HEIGHT[rect.kind];
      if (h >= CEILING_HEIGHT || h > ground) continue;
      if (b.x >= rect.x && b.x <= rect.x + rect.w && b.y >= rect.y && b.y <= rect.y + rect.h) ground = h;
    }
    if (b.z - r < ground) {
      if (!isBall) {
        this.events.push({ k: "impact", x: r1(b.x), y: r1(b.y) });
        return false;
      }
      b.z = ground + r;
      if (b.vz < -80) {
        // A bounce: up again with less speed, and a little slower forward.
        b.vz = -b.vz * FLOOR_KEEP;
        b.vx *= FLOOR_GRIP;
        b.vy *= FLOOR_GRIP;
      } else {
        // Rolling along the floor, slowing down.
        b.vz = 0;
        const roll = 1 - 1.5 * DT;
        b.vx *= roll;
        b.vy *= roll;
      }
    } else if (b.z + r > CEILING_HEIGHT) {
      if (!isBall) {
        this.events.push({ k: "impact", x: r1(b.x), y: r1(b.y) });
        return false;
      }
      b.z = CEILING_HEIGHT - r;
      b.vz = -Math.abs(b.vz) * FLOOR_KEEP;
    }
    if (isBall && Math.hypot(b.vx, b.vy) < DEAD_BALL_SPEED) return false;
    return b.travelled < b.range;
  }

  /** A projectile that bursts (the Big Orange) scatters its pieces where it ended. */
  private burst(b: Bullet) {
    const burst = WEAPONS[b.weapon].burst;
    if (!burst) return;
    const piece = WEAPONS[burst.weapon];
    const owner = this.players.get(b.owner);
    const damage = piece.damage * (owner ? this.damageMult(owner) : 1);
    const z = Math.max(piece.radius + 4, Math.min(CEILING_HEIGHT - piece.radius, b.z));
    for (let i = 0; i < burst.count; i++) {
      const a = (i / burst.count) * Math.PI * 2;
      this.launch({ id: b.owner, team: b.team }, burst.weapon, b.x, b.y, z, a, 0.35, piece.projectileSpeed, damage);
    }
    this.events.push({ k: "impact", x: r1(b.x), y: r1(b.y) });
  }

  private damage(
    target: PlayerState,
    b: Pick<Bullet, "owner" | "team" | "weapon" | "damage">,
    x: number,
    y: number,
  ) {
    const zoneProtected = inSafeZone(target.x, target.y) && !this.isBoss(target);
    const shielded = this.time < target.shieldUntil;
    if (this.time < target.protectedUntil || zoneProtected || this.isJailed(target) || target.god || shielded) {
      this.events.push({ k: "impact", x: r1(x), y: r1(y) });
      return;
    }
    // Captain Churchill's tank shrugs off most of a hit.
    const defense = target.form ? COMPANIONS[target.form].defense : ARCHETYPES[target.loadout.archetype].defense;
    const dmg = Math.min(target.hp, b.damage * (1 - defense));
    target.hp -= dmg;
    target.brain?.onDamaged(b.owner, this.time);
    this.events.push({ k: "hit", by: b.owner, target: target.id, x: r1(x), y: r1(y), dmg: Math.round(dmg) });
    const stun = WEAPONS[b.weapon].stun;
    if (stun) target.stunnedUntil = Math.max(target.stunnedUntil, this.time + stun);
    const slow = WEAPONS[b.weapon].slow;
    if (slow) target.slowUntil = Math.max(target.slowUntil, this.time + slow);
    // Pyro fire: keeps burning for a few seconds (afterburn), credited to whoever lit it.
    const burn = WEAPONS[b.weapon].burn;
    if (burn && target.hp > dmg) {
      if (this.time >= target.burnUntil) target.nextBurn = this.time + 0.5;
      target.burnUntil = Math.max(target.burnUntil, this.time + burn);
      target.burnBy = b.owner;
      target.burnTeam = b.team;
    }
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
    if (this.mode === "boss" && this.isBoss(target)) this.principalDown = true;
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
    p.z = 0;
    p.vz = 0;
    p.crouching = false;
    p.form = null;
    p.burnUntil = 0;
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
  /**
   * The TARDIS hidden in the Library: walk into its doors and you step inside
   * its console room (it's bigger on the inside); walk back into the doors
   * from inside and you're out in the Library again. Bots stay out, since
   * they can't find their way around in there.
   */
  /** Turn back into the Gamer when your character's time is up, and burn while you're on fire. */
  private updateFormAndBurn(p: PlayerState) {
    if (p.form && this.time >= p.formUntil) {
      p.form = null;
      p.reloadEnd = -1;
    }
    if (this.time >= p.burnUntil) return;
    // The Nurse's Office puts you out.
    if (inSafeZone(p.x, p.y)) {
      p.burnUntil = 0;
      return;
    }
    if (this.time >= p.nextBurn) {
      p.nextBurn = this.time + 0.5;
      this.damage(p, { owner: p.burnBy, team: p.burnTeam, weapon: "afterburn", damage: AFTERBURN_DAMAGE }, p.x, p.y);
    }
  }

  /**
   * The Pyro's Airblast: everyone in a cone in front is knocked back (and
   * stung a little), and enemy throws in it turn around and fly back the way
   * the Pyro is facing, now on the Pyro's team.
   */
  private airblast(p: PlayerState) {
    const inCone = (x: number, y: number, reach: number) => {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d > reach) return false;
      let diff = Math.atan2(y - p.y, x - p.x) - p.aim;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      return d < 30 || Math.abs(diff) < AIRBLAST_CONE;
    };
    for (const t of this.players.values()) {
      if (!t.alive || t.team === p.team || this.isJailed(t)) continue;
      if (!inCone(t.x, t.y, AIRBLAST_RANGE + t.radius) || !hasLineOfSight(p.x, p.y, t.x, t.y)) continue;
      const a = Math.atan2(t.y - p.y, t.x - p.x);
      for (let d = 0; d < AIRBLAST_PUSH; d += 25) movePlayer(t, Math.cos(a), Math.sin(a), 25 / DT, DT, t.radius);
      t.inputs = [];
      this.damage(t, this.superShot(p, "airblast"), t.x, t.y);
    }
    for (const b of this.bullets) {
      if (b.team === p.team || !inCone(b.x, b.y, AIRBLAST_RANGE + 40)) continue;
      const speed = Math.hypot(b.vx, b.vy) * 1.1;
      b.vx = Math.cos(p.aim) * speed;
      b.vy = Math.sin(p.aim) * speed;
      b.team = p.team;
      b.owner = p.id;
      b.travelled = 0;
    }
  }

  private rideTardis(p: PlayerState) {
    if (p.isBot || this.time < p.tardisReadyAt || this.isJailed(p)) return;
    const goingIn = atTardisDoor(p.x, p.y);
    if (!goingIn && !atTardisExit(p.x, p.y)) return;
    const to = goingIn ? TARDIS_ARRIVE_INSIDE : tardisArriveOutside();
    this.events.push({ k: "tardis", who: p.id, x: r1(p.x), y: r1(p.y), tx: to.x, ty: to.y, inside: goingIn });
    p.x = to.x;
    p.z = 0;
    p.vz = 0;
    p.y = to.y;
    p.inputs = [];
    p.tardisReadyAt = this.time + 1;
  }

  /**
   * Fly the TARDIS from its console: it dematerializes where it was and lands
   * at the chosen spot, with everyone inside riding along. Anyone standing
   * where it lands gets nudged out in front of its doors. Returns why it
   * couldn't go, or null.
   */
  flyTardis(id: string, spot: number): string | null {
    const p = this.players.get(id);
    if (!p || !p.alive || !inTardis(p.x, p.y)) return "You need to be inside the TARDIS.";
    if (!atTardisConsole(p.x, p.y)) return "Step up to the console to fly the TARDIS.";
    if (!Number.isInteger(spot) || !TARDIS_SPOTS[spot]) return "That's not somewhere the TARDIS can land.";
    if (spot === tardisSpotNow()) return "The TARDIS is already there.";
    const from = { x: TARDIS.x + TARDIS.w / 2, y: TARDIS.y + TARDIS.h / 2 };
    moveTardis(spot);
    const out = tardisArriveOutside();
    for (const t of this.players.values()) {
      if (!t.alive) continue;
      const overlaps =
        t.x > TARDIS.x - t.radius && t.x < TARDIS.x + TARDIS.w + t.radius && t.y > TARDIS.y - t.radius && t.y < TARDIS.y + TARDIS.h + t.radius;
      if (overlaps) {
        t.x = out.x;
        t.z = 0;
        t.vz = 0;
        t.y = out.y;
        t.inputs = [];
      }
    }
    this.events.push({
      k: "tardisfly",
      by: p.id,
      x: r1(from.x),
      y: r1(from.y),
      tx: r1(TARDIS.x + TARDIS.w / 2),
      ty: r1(TARDIS.y + TARDIS.h / 2),
      spot,
    });
    return null;
  }

  private updateSafeZone(p: PlayerState) {
    // The Principal isn't a patient: no healing, no protection, no timer.
    if (this.isBoss(p)) return;
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

  // ---------------------------------------------------------------- Principal and mascot abilities

  /** Use one of the Principal's or a mascot's abilities. Returns why it failed, or null on success. */
  useAbility(id: string, ability: AbilityId, targetId?: string, score?: number): string | null {
    const p = this.players.get(id);
    if (!p || !p.alive || !this.isBoss(p)) return "Only the Principal and the mascots can do that.";
    if (!(ability in p.cooldowns)) return "Unknown ability.";
    if (this.time < p.cooldowns[ability]) return null;
    if (this.time < p.stunnedUntil) return null;
    // Each character has its own set of four; only those can be used.
    const def = abilitiesOf(p.loadout.archetype).find((a) => a.id === ability);
    if (!def) return "That power isn't yours.";

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
          // In 3D the papers flutter out in a gentle upward ring.
          this.launch(p, "quiz", p.x, p.y, this.handHeight(p), a, 0.15, w.projectileSpeed, w.damage * this.damageMult(p));
        }
        this.events.push({ k: "shot", by: p.id, weapon: "quiz" });
        break;
      }
      case "intercom":
        p.revealUntil = this.time + INTERCOM_TIME;
        break;
      // Barry the Blueberry.
      case "berryblast":
        this.fan(p, "berryblast", 5, 0.4);
        break;
      case "rollout":
        this.charge(p, ROLL_DISTANCE, "rollout", ROLL_STUN);
        break;
      case "jam": {
        // Splat it where you aim: up to JAM_RANGE away (closer when looking down in 3D), short of any wall.
        let reach = JAM_RANGE;
        const foe = p.isBot && targetId ? this.players.get(targetId) : undefined;
        if (foe) reach = Math.min(reach, Math.hypot(foe.x - p.x, foe.y - p.y));
        else if (this.view3d && p.pitch < -0.05) reach = Math.min(reach, EYE_HEIGHT / Math.tan(-p.pitch));
        const ex = p.x + Math.cos(p.aim) * reach;
        const ey = p.y + Math.sin(p.aim) * reach;
        const wall = firstWallHitWithNormal(p.x, p.y, ex, ey);
        const d = wall ? Math.max(0, wall.t * reach - 20) : reach;
        this.addZone(p, "jam", p.x + Math.cos(p.aim) * d, p.y + Math.sin(p.aim) * d, JAM_RADIUS, JAM_TIME);
        break;
      }
      case "antioxidants":
        p.hp = Math.min(p.maxHp, p.hp + ANTIOXIDANT_HEAL);
        p.hasteUntil = this.time + ANTIOXIDANT_TIME;
        break;
      // Peely the Orange.
      case "squirt":
        this.fan(p, "squirt", SQUIRT_DROPS, 0.3);
        break;
      case "peel": {
        // Only so many peels down at once: the oldest goes.
        const mine = this.zones.filter((z) => z.k === "peel" && z.owner === p.id);
        if (mine.length >= MAX_PEELS) this.zones = this.zones.filter((z) => z !== mine[0]);
        this.addZone(p, "peel", p.x, p.y, PEEL_RADIUS, PEEL_TIME);
        break;
      }
      case "rind":
        p.shieldUntil = this.time + RIND_TIME;
        break;
      case "bigorange":
        this.fan(p, "bigorange", 1, 0);
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
    const boss = this.mode === "boss" && this.isBoss(p) ? BOSS_DAMAGE_BONUS : 1;
    return levelBonus(this.levelOf(p)) * boss;
  }

  private maxHpOf(loadout: Loadout, levels: ClassLevels) {
    return Math.round(maxHpFor(loadout.archetype) * levelBonus(levels[loadout.archetype] ?? 1));
  }

  /** Earn XP for the class you're playing (the Principal isn't a class you level). */
  addXp(p: PlayerState, amount: number) {
    if (p.isBot || this.isBoss(p) || amount <= 0) return;
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
    if (!p || !p.alive || p.superCharge < 1 || this.isBoss(p)) return;
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
      case "dash":
        this.charge(p, DASH_DISTANCE, "tackle", DASH_STUN);
        break;
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
      case "fightsong":
        for (const t of this.players.values()) {
          if (!t.alive || t.team !== p.team) continue;
          if (Math.hypot(t.x - p.x, t.y - p.y) > FIGHT_SONG_RADIUS) continue;
          t.hp = Math.min(t.maxHp, t.hp + FIGHT_SONG_HEAL);
          t.hasteUntil = Math.max(t.hasteUntil, this.time + FIGHT_SONG_TIME);
        }
        break;
      case "crescendo":
        this.fan(p, "note", 9, 0.6);
        break;
      case "summon": {
        // Character select: roll who you'll play as for a while.
        const who = rollCompanion();
        p.form = who;
        p.formUntil = this.time + COMPANIONS[who].secs;
        p.reloadEnd = -1;
        this.events.push({ k: "summon", by: p.id, who, x: r1(p.x), y: r1(p.y) });
        break;
      }
      case "airblast":
        this.airblast(p);
        break;
    }
    this.events.push({ k: "super", by: p.id, super: def.id, x: r1(p.x), y: r1(p.y) });
  }

  /**
   * Charge forward up to `distance` where you aim (the Jock's Touchdown Dash,
   * Barry's Roll Out), hitting and stunning everyone you run into.
   */
  private charge(p: PlayerState, distance: number, weapon: WeaponId, stun: number) {
    const dx = Math.cos(p.aim);
    const dy = Math.sin(p.aim);
    const hit = new Set<PlayerState>();
    const step = 30;
    for (let d = 0; d < distance; d += step) {
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
      this.damage(t, this.superShot(p, weapon), t.x, t.y);
      if (t.alive) t.stunnedUntil = this.time + stun;
    }
    p.inputs = [];
  }

  // ---------------------------------------------------------------- floor zones

  private addZone(p: PlayerState, k: Zone["k"], x: number, y: number, r: number, secs: number) {
    this.zones.push({ id: this.nextZoneId++, k, x, y, r, team: p.team, owner: p.id, until: this.time + secs, nextTick: this.time });
  }

  /**
   * Jam Puddles slow everyone on the other side standing in them and hurt
   * every half second; a Peel Trap trips the first enemy to step on it.
   */
  private updateZones() {
    this.zones = this.zones.filter((z) => {
      if (this.time >= z.until) return false;
      const owner = this.players.get(z.owner);
      const mult = owner ? this.damageMult(owner) : 1;
      const tick = z.k === "jam" && this.time >= z.nextTick;
      if (tick) z.nextTick = this.time + 0.5;
      for (const t of this.players.values()) {
        if (!t.alive || t.team === z.team || this.isJailed(t)) continue;
        if (Math.hypot(t.x - z.x, t.y - z.y) > z.r + t.radius * 0.5) continue;
        if (z.k === "jam") {
          t.slowUntil = Math.max(t.slowUntil, this.time + 0.3);
          if (tick) this.damage(t, { owner: z.owner, team: z.team, weapon: "jam", damage: (JAM_DPS / 2) * mult }, t.x, t.y);
        } else {
          this.damage(t, { owner: z.owner, team: z.team, weapon: "peel", damage: WEAPONS.peel.damage * mult }, t.x, t.y);
          return false;
        }
      }
      return true;
    });
  }

  /** A damage source for a super, scaled by the user's level. */
  private superShot(p: PlayerState, weapon: WeaponId) {
    return { owner: p.id, team: p.team, weapon, damage: WEAPONS[weapon].damage * this.damageMult(p) };
  }

  /** Throw `count` projectiles in a fan `spread` radians wide either side of your aim. */
  private fan(p: PlayerState, weapon: WeaponId, count: number, spread: number) {
    const w = WEAPONS[weapon];
    const pitch = this.pitchOf(p, weapon);
    for (let i = 0; i < count; i++) {
      const a = p.aim + (count === 1 ? 0 : -spread + (2 * spread * i) / (count - 1));
      this.launch(p, weapon, p.x, p.y, this.handHeight(p), a, pitch, w.projectileSpeed, w.damage * this.damageMult(p));
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
    let best = def.id === "paintbomb" || def.id === "dash" ? 300 : def.id === "airblast" ? AIRBLAST_RANGE : 600;
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
      (p.superSpeed ? SUPER_MULT : p.turbo ? TURBO_MULT : 1) *
      (this.time < p.overclockUntil ? OVERCLOCK_SPEED : 1) *
      (this.time < p.hasteUntil ? ANTIOXIDANT_SPEED : 1) *
      (p.form ? COMPANIONS[p.form].speed : 1);
    // 7v1 buff: the boss Principal is a bit quicker.
    const boss = this.mode === "boss" && this.isBoss(p) ? BOSS_SPEED_BONUS : 1;
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
        if (this.mode === "boss" && this.isBoss(t)) this.principalDown = true;
        break;
    }
    return null;
  }

  /** A bot duel mascot uses its four powers when they'd help. */
  private botMascotAbilities(p: PlayerState) {
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
    const hurt = p.hp < p.maxHp * 0.45;
    const fire = (a: AbilityId, aim?: number) => {
      if (aim !== undefined) p.aim = aim;
      this.useAbility(p.id, a, foe?.id);
    };
    if (p.loadout.archetype === "blueberry") {
      if (ready("antioxidants") && hurt) return fire("antioxidants");
      if (!foe) return;
      const at = Math.atan2(foe.y - p.y, foe.x - p.x);
      if (ready("jam") && dist < JAM_RANGE + JAM_RADIUS) fire("jam", at);
      else if (ready("rollout") && dist < 380) fire("rollout", at);
      else if (ready("berryblast") && dist < 700) fire("berryblast", at);
    } else {
      if (ready("rind") && foe && hurt) return fire("rind");
      if (!foe) return;
      const at = Math.atan2(foe.y - p.y, foe.x - p.x);
      if (ready("peel") && dist < 260) fire("peel");
      else if (ready("squirt") && dist < 420) fire("squirt", at);
      else if (ready("bigorange") && dist < 700) fire("bigorange", at);
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

  /** A bot Principal (or mascot) uses its abilities when they'd help. */
  private botAbilities(p: PlayerState) {
    if (p.loadout.archetype !== "principal") {
      this.botMascotAbilities(p);
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
