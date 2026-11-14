/**
 * Wrathwater simulation: ships, cannon fire, AI, bounty and wanted level.
 * Pure game logic with no rendering, so it can be tested on its own.
 *
 * Coordinates: the sea is the x/z plane, y is up. A heading of 0 points along
 * +x; forward is (cos h, sin h) and starboard (right) is (-sin h, cos h).
 */
import {
  HUNTERS_BY_STARS,
  KING_BOUNTY,
  SHIP_CLASSES,
  playerStats,
  rankFor,
  type Faction,
  type ShipClass,
  type ShipClassId,
} from "./data";
import { Shore, type WalkerKind } from "./foot";
import { FRUITS, type FruitId, type WeaponId } from "./items";
import type { SaveData } from "./save";
import { HAVEN, HAVEN_SAFE_RADIUS, ISLANDS, WORLD_HALF, groundHeight, islandAt, type BuildingKind, type ServiceKind } from "./world";

export const GRAVITY = 160;
const BALL_SPEED = 390;
const SINK_TIME = 6;
const PICKUP_RADIUS = 48;
/** Ships farther than this from you (and not chasing you) sail off and are removed. */
const DESPAWN_RANGE = 3400;
/** Marines notice you within this range. */
const MARINE_SIGHT = 1300;
/** Out of every Marine's sight for this long and your wanted level starts dropping. */
const HIDE_TIME = 18;

export type Side = 1 | -1; // 1 = starboard (right), -1 = port (left)

export interface ShipStats {
  hull: number;
  speed: number;
  turn: number;
  cannonsPerSide: number;
  damage: number;
  reload: number;
  range: number;
}

export interface Ship {
  id: number;
  cls: ShipClass;
  faction: Faction;
  stats: ShipStats;
  x: number;
  z: number;
  heading: number;
  speed: number;
  /** 0..1 fraction of top speed the ship is trying to reach. */
  throttle: number;
  /** -1 (hard to port) .. 1 (hard to starboard). */
  rudder: number;
  hp: number;
  /** Seconds until each side can fire again. */
  reload: { [side: number]: number };
  /** Seconds since it started sinking, or -1 while afloat. */
  sinking: number;
  hitByPlayer: boolean;
  /** Seconds left burning (Flame-Flame Fruit). */
  burn: number;
  ai: {
    hunter: boolean;
    angered: boolean;
    waypoint: { x: number; z: number };
    nextWaypoint: number;
  };
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: number;
  byPlayer: boolean;
  damage: number;
  /** A Flame-Flame fireball: sets what it hits on fire. */
  fire?: boolean;
}

export interface Crate {
  id: number;
  x: number;
  z: number;
  gold: number;
}

export type SimEvent =
  | { k: "fire"; shipId: number; side: Side; byPlayer: boolean; x: number; z: number; count: number }
  | { k: "hit"; x: number; y: number; z: number; onPlayer: boolean; byPlayer: boolean; damage: number }
  | { k: "splash"; x: number; z: number }
  | { k: "sunk"; shipId: number; name: string; faction: Faction; bounty: number; gold: number; byPlayer: boolean; x: number; z: number }
  | { k: "playerSunk" }
  | { k: "crate"; gold: number; x: number; z: number }
  | { k: "scrape" }
  | { k: "rank"; title: string }
  | { k: "king" }
  | { k: "stars"; stars: number; prev: number }
  // On foot
  | { k: "ashore"; island: string }
  | { k: "board" }
  | { k: "swing"; x: number; z: number; byHero: boolean }
  | { k: "noAmmo" }
  | { k: "gunshot"; x: number; z: number; byHero: boolean; weapon: WeaponId }
  | { k: "impact"; x: number; y: number; z: number; fire: boolean }
  | { k: "explosion"; x: number; z: number; radius: number }
  | { k: "walkerHit"; x: number; y: number; z: number; damage: number }
  | { k: "walkerDown"; x: number; z: number; kind: WalkerKind; bounty: number; gold: number }
  | { k: "heroHit"; damage: number }
  | { k: "heroDown" }
  | { k: "drowning" }
  | { k: "power"; fruit: FruitId; x: number; z: number; tx: number; tz: number; atSea?: boolean }
  | { k: "fruitFound"; fruit: FruitId }
  | { k: "loot"; x: number; z: number; gold: number; weapon: WeaponId | null; wood: number; iron: number; powder: number; ammo: number }
  | { k: "service"; building: ServiceKind }
  | { k: "robbed"; building: BuildingKind; town: string; gold: number; weapon: WeaponId | null; wood: number; iron: number; powder: number; ammo: number };

export interface PlayerInput {
  /** Sail setting 0 (anchored) .. 3 (full sail). */
  sails: number;
  rudder: number;
  fire: Side | null;
  /** On foot: wanted walking direction in world space (length up to 1). */
  moveX: number;
  moveZ: number;
  sprint: boolean;
  /** Where the camera looks (map angle); aims guns, powers and swings. */
  aimYaw: number;
  /** One-shot presses, cleared every step. */
  attack: boolean;
  interact: boolean;
  ability: boolean;
  /** Held buttons. */
  attackHeld: boolean;
  aiming: boolean;
  interactHeld: boolean;
}

const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export function forward(h: number) {
  return { x: Math.cos(h), z: Math.sin(h) };
}

export function sideNormal(h: number, side: Side) {
  return { x: -Math.sin(h) * side, z: Math.cos(h) * side };
}

/** Heat a sinking adds to your wanted level. */
const SINK_HEAT: Partial<Record<ShipClassId, number>> = {
  merchant_cog: 0.9,
  treasure_galleon: 1.3,
  marine_sloop: 1.2,
  marine_frigate: 1.4,
  marine_warship: 1.7,
  marine_flagship: 2.2,
};

export class Sim {
  time = 0;
  ships: Ship[] = [];
  balls: Ball[] = [];
  crates: Crate[] = [];
  events: SimEvent[] = [];
  player!: Ship;
  /** Wanted level, 0..5 (shown as stars, rounded up). */
  heat = 0;
  input: PlayerInput = {
    sails: 0, rudder: 0, fire: null, moveX: 0, moveZ: 0, sprint: false, aimYaw: 0,
    attack: false, interact: false, ability: false, attackHeld: false, aiming: false, interactHeld: false,
  };
  /** Sailing your ship, or ashore on foot. */
  mode: "ship" | "foot" = "ship";
  /** Seconds until your Devil Fruit power is ready again. */
  fruitCooldown = 0;
  shore = new Shore(this);
  private hiddenUntil = -1;

  private nextId = 1;
  private lastSeen = -999;
  private nextHunterSpawn = 0;
  private nextAmbientSpawn = 0;
  private lastScrape = -999;
  private lastStars = 0;

  constructor(public save: SaveData) {
    this.spawnPlayer();
    for (let i = 0; i < 14; i++) this.spawnCrate();
  }

  get stars() {
    return this.heat <= 0.001 ? 0 : Math.min(5, Math.ceil(this.heat));
  }

  /** Hidden in Smoke-Smoke smoke: Marines lose track of you. */
  get hidden() {
    return this.time < this.hiddenUntil;
  }

  smoke(seconds: number) {
    this.hiddenUntil = this.time + seconds;
    this.lastSeen = -999;
  }

  /** A Marine on foot can see you. */
  seenByMarines() {
    if (!this.hidden) this.lastSeen = this.time;
  }

  get inHaven() {
    return Math.hypot(this.player.x - HAVEN.x, this.player.z - HAVEN.z) < HAVEN_SAFE_RADIUS;
  }

  /** Stats for your ship with the bought upgrades; call after buying. */
  refreshPlayerStats() {
    const p = this.player;
    const s = playerStats(this.save.upgrades);
    const ratio = p.hp / p.stats.hull;
    p.stats = s;
    p.hp = Math.min(s.hull, Math.max(1, ratio * s.hull));
  }

  repairPlayer() {
    this.player.hp = this.player.stats.hull;
  }

  /** Back to Blackwater Cove after sinking: a quarter of your gold is lost, the Marines lose your trail. */
  respawnPlayer() {
    this.save.gold = Math.floor(this.save.gold * 0.75);
    this.save.deaths++;
    this.ships = this.ships.filter((s) => s !== this.player && !s.ai.hunter);
    this.heat = 0;
    this.lastStars = 0;
    this.mode = "ship";
    this.hiddenUntil = -1;
    this.shore.reset();
    this.spawnPlayer();
  }

  step(dt: number) {
    this.time += dt;
    const p = this.player;

    this.fruitCooldown = Math.max(0, this.fruitCooldown - dt);

    if (p.sinking < 0 && this.mode === "ship") {
      p.throttle = clamp(this.input.sails, 0, 3) / 3;
      p.rudder = clamp(this.input.rudder, -1, 1);
      if (this.input.fire !== null) this.tryFire(p, this.input.fire);
      if (this.input.ability) this.seaPower();
    } else if (this.mode === "foot") {
      // Anchored while you're ashore.
      p.throttle = 0;
      p.rudder = 0;
    }

    for (const s of this.ships) {
      if (s !== p && s.sinking < 0) this.think(s);
      this.move(s, dt);
      for (const side of [1, -1]) s.reload[side] = Math.max(0, s.reload[side] - dt);
      if (s.burn > 0 && s.sinking < 0) {
        s.burn -= dt;
        s.hp -= 9 * dt;
        if (s.hp <= 0) this.damage(s, 0.01, true, s.x, 8, s.z);
      }
    }
    this.shore.step(dt);
    this.input.fire = null;
    this.input.attack = false;
    this.input.interact = false;
    this.input.ability = false;
    this.collide();
    this.updateBalls(dt);
    this.updateSinking(dt);
    this.updateHeat(dt);
    this.updateCrates();
    if (this.inHaven && p.sinking < 0) p.hp = Math.min(p.stats.hull, p.hp + 15 * dt);
    this.populate();
  }

  // ---------------------------------------------------------------- ships

  private spawnPlayer() {
    const stats = playerStats(this.save.upgrades);
    // Start at the dock, pointing out to sea.
    this.player = this.makeShip(SHIP_CLASSES.player, stats, HAVEN.x + HAVEN.radius + 90, HAVEN.z, 0);
    this.ships.push(this.player);
  }

  private makeShip(cls: ShipClass, stats: ShipStats, x: number, z: number, heading: number): Ship {
    return {
      id: this.nextId++,
      cls,
      faction: cls.faction,
      stats,
      x,
      z,
      heading,
      speed: 0,
      throttle: 0,
      rudder: 0,
      hp: stats.hull,
      reload: { 1: 0, [-1]: 0 },
      sinking: -1,
      hitByPlayer: false,
      burn: 0,
      ai: { hunter: false, angered: false, waypoint: { x, z }, nextWaypoint: 0 },
    };
  }

  private spawnNpc(id: ShipClassId, x: number, z: number, hunter = false) {
    const cls = SHIP_CLASSES[id];
    const ship = this.makeShip(cls, { ...cls }, x, z, rand(-Math.PI, Math.PI));
    ship.ai.hunter = hunter;
    ship.speed = cls.speed * 0.5;
    this.ships.push(ship);
    return ship;
  }

  private move(s: Ship, dt: number) {
    if (s.sinking >= 0) {
      s.speed = Math.max(0, s.speed - 20 * dt);
    } else {
      const target = s.throttle * s.stats.speed;
      const accel = target > s.speed ? 16 : 26;
      s.speed += clamp(target - s.speed, -accel * dt, accel * dt);
      // Ships turn poorly when nearly stopped.
      const grip = clamp(0.25 + s.speed / s.stats.speed, 0.25, 1);
      s.heading = wrap(s.heading + s.stats.turn * s.rudder * grip * dt);
    }
    const f = forward(s.heading);
    s.x += f.x * s.speed * dt;
    s.z += f.z * s.speed * dt;
  }

  private collide() {
    const p = this.player;
    for (const s of this.ships) {
      for (const isl of ISLANDS) {
        const dx = s.x - isl.x;
        const dz = s.z - isl.z;
        const d = Math.hypot(dx, dz);
        const min = isl.radius + s.cls.beam * 0.6;
        if (d >= min || d < 1e-6) continue;
        s.x = isl.x + (dx / d) * min;
        s.z = isl.z + (dz / d) * min;
        if (s === p && s.speed > 25 && this.time - this.lastScrape > 1) {
          this.lastScrape = this.time;
          this.damage(p, 6, false, s.x, 4, s.z);
          this.events.push({ k: "scrape" });
        }
        s.speed *= 0.6;
      }
      const lim = WORLD_HALF - 20;
      if (Math.abs(s.x) > lim || Math.abs(s.z) > lim) {
        s.x = clamp(s.x, -lim, lim);
        s.z = clamp(s.z, -lim, lim);
        s.speed *= 0.6;
      }
    }
    // Ships bump instead of passing through each other.
    for (let i = 0; i < this.ships.length; i++) {
      for (let j = i + 1; j < this.ships.length; j++) {
        const a = this.ships[i];
        const b = this.ships[j];
        const ra = a.cls.length * 0.36;
        const rb = b.cls.length * 0.36;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= ra + rb || d < 1e-6) continue;
        const push = (ra + rb - d) / 2;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
        a.speed *= 0.9;
        b.speed *= 0.9;
      }
    }
  }

  // ---------------------------------------------------------------- AI

  private think(s: Ship) {
    const p = this.player;
    const t = this.time;
    const dPlayer = Math.hypot(p.x - s.x, p.z - s.z);
    const playerAfloat = p.sinking < 0 && this.mode === "ship" && !this.hidden;
    const playerSafe = this.inHaven;

    let mode: "patrol" | "engage" | "flee" = "patrol";
    if (s.faction === "merchant") {
      if (playerAfloat && (s.ai.angered || this.stars >= 2) && dPlayer < 1200) mode = "flee";
    } else if (s.faction === "pirate") {
      if (playerAfloat && !playerSafe && (dPlayer < 950 || s.ai.angered)) mode = "engage";
    } else if (s.faction === "marine") {
      const hostile = s.ai.hunter ? this.stars > 0 : this.heat > 0 || s.ai.angered;
      if (playerAfloat && !playerSafe && hostile && (s.ai.hunter || dPlayer < MARINE_SIGHT)) mode = "engage";
    }

    let desired = s.heading;
    s.throttle = 0.55;
    if (mode === "engage") {
      const toP = Math.atan2(p.z - s.z, p.x - s.x);
      const range = s.stats.range;
      if (dPlayer > range * 0.85) {
        desired = toP;
        s.throttle = 1;
      } else {
        // Turn side-on so the player sits on a broadside.
        const f = forward(s.heading);
        const cross = f.x * (p.z - s.z) - f.z * (p.x - s.x);
        const side: Side = cross > 0 ? 1 : -1;
        desired = toP - (side * Math.PI) / 2;
        if (dPlayer < range * 0.4) desired -= side * 0.4; // too close: open the distance
        s.throttle = 0.75;
        this.aiFire(s, side, dPlayer);
      }
    } else if (mode === "flee") {
      desired = Math.atan2(s.z - p.z, s.x - p.x);
      s.throttle = 1;
      // Merchants still fire back if you come alongside.
      const f = forward(s.heading);
      const cross = f.x * (p.z - s.z) - f.z * (p.x - s.x);
      this.aiFire(s, cross > 0 ? 1 : -1, dPlayer);
    } else {
      if (t > s.ai.nextWaypoint || Math.hypot(s.ai.waypoint.x - s.x, s.ai.waypoint.z - s.z) < 150) {
        s.ai.waypoint = this.randomSeaPoint(s.x, s.z, 900, 2200);
        s.ai.nextWaypoint = t + rand(25, 45);
      }
      desired = Math.atan2(s.ai.waypoint.z - s.z, s.ai.waypoint.x - s.x);
    }

    desired = this.avoid(s, desired);
    s.rudder = clamp(wrap(desired - s.heading) * 2.2, -1, 1);
  }

  /** Steer clear of islands, the storm wall, and (for Marines) the pirate haven. */
  private avoid(s: Ship, desired: number) {
    const f = forward(s.heading);
    const look = 90 + s.speed * 2.8;
    const ax = s.x + f.x * look;
    const az = s.z + f.z * look;
    const isl = islandAt(ax, az, s.cls.beam + 40);
    if (isl) {
      const cross = f.x * (isl.z - s.z) - f.z * (isl.x - s.x);
      return s.heading - Math.sign(cross || 1) * 1.2;
    }
    if (s.faction === "marine" && Math.hypot(ax - HAVEN.x, az - HAVEN.z) < HAVEN_SAFE_RADIUS + 150) {
      return Math.atan2(s.z - HAVEN.z, s.x - HAVEN.x);
    }
    const lim = WORLD_HALF - 400;
    if (Math.abs(ax) > lim || Math.abs(az) > lim) return Math.atan2(-s.z, -s.x);
    return desired;
  }

  private aiFire(s: Ship, side: Side, dPlayer: number) {
    if (dPlayer > s.stats.range * 1.05 || s.reload[side] > 0) return;
    const p = this.player;
    const n = sideNormal(s.heading, side);
    const toP = { x: (p.x - s.x) / dPlayer, z: (p.z - s.z) / dPlayer };
    if (n.x * toP.x + n.z * toP.z < Math.cos(0.38)) return;
    const aim = this.aimAt(s, side, p, 0.6);
    this.fire(s, side, aim.range, aim.yaw);
  }

  private randomSeaPoint(cx: number, cz: number, minR: number, maxR: number) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(minR, maxR);
      const x = clamp(cx + Math.cos(a) * r, -WORLD_HALF + 500, WORLD_HALF - 500);
      const z = clamp(cz + Math.sin(a) * r, -WORLD_HALF + 500, WORLD_HALF - 500);
      if (!islandAt(x, z, 120) && Math.hypot(x - HAVEN.x, z - HAVEN.z) > HAVEN_SAFE_RADIUS + 200) return { x, z };
    }
    return { x: cx, z: cz };
  }

  // ---------------------------------------------------------------- Devil Fruit powers at sea

  private seaPower() {
    const fruit = this.save.fruit;
    if (!fruit || this.fruitCooldown > 0 || this.inHaven) return;
    const p = this.player;
    this.fruitCooldown = FRUITS[fruit].cooldown;
    const aim = this.input.aimYaw;
    const target = this.shipInCone(aim, 950, 0.55);
    const tx = target ? target.x : p.x + Math.cos(aim) * 500;
    const tz = target ? target.z : p.z + Math.sin(aim) * 500;
    this.events.push({ k: "power", fruit, x: p.x, z: p.z, tx, tz, atSea: true });
    switch (fruit) {
      case "mera": {
        const d = Math.max(150, Math.hypot(tx - p.x, tz - p.z));
        const flight = d / 520;
        this.balls.push({
          x: p.x, y: 14, z: p.z,
          vx: ((tx - p.x) / d) * 520, vy: 0.5 * GRAVITY * flight - 14 / flight, vz: ((tz - p.z) / d) * 520,
          owner: p.id, byPlayer: true, damage: 140, fire: true,
        });
        break;
      }
      case "goro":
        if (target) this.damage(target, 210, true, target.x, 10, target.z);
        break;
      case "gomu":
        // Both broadsides at once, reload or not.
        p.reload[1] = 0;
        p.reload[-1] = 0;
        this.tryFire(p, 1);
        this.tryFire(p, -1);
        break;
      case "moku":
        this.smoke(8);
        break;
      case "gura":
        this.events.push({ k: "explosion", x: p.x, z: p.z, radius: 520 });
        for (const s of this.ships) {
          if (s === p || s.sinking >= 0) continue;
          if (Math.hypot(s.x - p.x, s.z - p.z) < 520) this.damage(s, 150, true, s.x, 8, s.z);
        }
        break;
    }
  }

  private shipInCone(aim: number, range: number, cone: number) {
    const p = this.player;
    let best: Ship | null = null;
    let bestD = Infinity;
    for (const s of this.ships) {
      if (s === p || s.sinking >= 0) continue;
      const dx = s.x - p.x;
      const dz = s.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 1) continue;
      if ((dx * Math.cos(aim) + dz * Math.sin(aim)) / d < Math.cos(cone)) continue;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- cannons

  /**
   * Your broadside ranges in on the nearest ship on that side (aim assist), so
   * near and far targets can both be hit. With nothing there it fires at full range.
   */
  private tryFire(s: Ship, side: Side) {
    if (s.reload[side] > 0 || this.inHaven) return;
    const n = sideNormal(s.heading, side);
    let best: Ship | null = null;
    let bestD = Infinity;
    for (const t of this.ships) {
      if (t === s || t.sinking >= 0) continue;
      const dx = t.x - s.x;
      const dz = t.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d > s.stats.range * 1.1 || d < 1) continue;
      if ((n.x * dx + n.z * dz) / d < Math.cos(0.6)) continue;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) {
      this.fire(s, side, s.stats.range, 0);
      return;
    }
    const aim = this.aimAt(s, side, best, 1);
    this.fire(s, side, aim.range, aim.yaw);
  }

  /** Range and gun swivel to hit `target`, leading its movement by `lead` (0..1). */
  private aimAt(s: Ship, side: Side, target: Ship, lead: number) {
    const tf = forward(target.heading);
    let px = target.x;
    let pz = target.z;
    // Two passes: the flight time depends on the distance, which depends on the lead.
    for (let i = 0; i < 2; i++) {
      const flight = Math.hypot(px - s.x, pz - s.z) / BALL_SPEED;
      px = target.x + tf.x * target.speed * flight * lead;
      pz = target.z + tf.z * target.speed * flight * lead;
    }
    const n = sideNormal(s.heading, side);
    const want = Math.atan2(pz - s.z, px - s.x);
    const yaw = clamp(wrap(want - Math.atan2(n.z, n.x)), -0.5, 0.5);
    return { range: Math.hypot(px - s.x, pz - s.z), yaw };
  }

  /** Fire a full broadside, aimed to land around `aimRange`, guns swiveled by `aimYaw`. */
  private fire(s: Ship, side: Side, aimRange: number, aimYaw: number) {
    const byPlayer = s === this.player;
    const n = s.stats.cannonsPerSide;
    const f = forward(s.heading);
    const sn = sideNormal(s.heading, side);
    const range = clamp(aimRange, 120, s.stats.range);
    for (let i = 0; i < n; i++) {
      const along = n === 1 ? 0 : (i / (n - 1) - 0.5) * s.cls.length * 0.6;
      const ox = s.x + f.x * along + sn.x * s.cls.beam * 0.5;
      const oz = s.z + f.z * along + sn.z * s.cls.beam * 0.5;
      const oy = 7;
      // AI gunners are less accurate than you.
      const spread = byPlayer ? 0.035 : 0.07;
      const yaw = aimYaw + rand(-spread, spread);
      const r = range * rand(byPlayer ? 0.95 : 0.85, byPlayer ? 1.05 : 1.12);
      const flight = r / BALL_SPEED;
      const vy = 0.5 * GRAVITY * flight - oy / flight;
      const c = Math.cos(yaw);
      const sYaw = Math.sin(yaw);
      const dirX = sn.x * c - sn.z * sYaw;
      const dirZ = sn.x * sYaw + sn.z * c;
      this.balls.push({
        x: ox,
        y: oy,
        z: oz,
        // Balls don't carry the ship's own speed, so they land where the guns point (arcade-style).
        vx: dirX * BALL_SPEED,
        vy,
        vz: dirZ * BALL_SPEED,
        owner: s.id,
        byPlayer,
        damage: s.stats.damage,
      });
    }
    s.reload[side] = s.stats.reload;
    this.events.push({ k: "fire", shipId: s.id, side, byPlayer, x: s.x + sn.x * s.cls.beam * 0.5, z: s.z + sn.z * s.cls.beam * 0.5, count: n });
  }

  private updateBalls(dt: number) {
    const keep: Ball[] = [];
    // Two substeps so fast balls can't skip over a narrow hull.
    const sub = dt / 2;
    outer: for (const b of this.balls) {
      for (let k = 0; k < 2; k++) {
        b.vy -= GRAVITY * sub;
        b.x += b.vx * sub;
        b.y += b.vy * sub;
        b.z += b.vz * sub;
        if (b.y < 16) {
          for (const s of this.ships) {
            if (s.id === b.owner || s.sinking >= 0) continue;
            // Enemy fire only hurts you; your fire hurts everyone.
            if (!b.byPlayer && s !== this.player) continue;
            const dx = b.x - s.x;
            const dz = b.z - s.z;
            const f = forward(s.heading);
            const along = dx * f.x + dz * f.z;
            const across = -dx * f.z + dz * f.x;
            // A little slack for the ball's own size.
            if (Math.abs(along) < s.cls.length / 2 + 4 && Math.abs(across) < s.cls.beam / 2 + 5 && b.y > -2) {
              this.damage(s, b.damage * rand(0.85, 1.15), b.byPlayer, b.x, b.y, b.z);
              if (b.fire) {
                s.burn = 6;
                this.events.push({ k: "explosion", x: b.x, z: b.z, radius: 40 });
              }
              continue outer;
            }
          }
        }
        const ground = b.y < 40 ? groundHeight(b.x, b.z) : null;
        if (ground !== null && b.y <= ground) {
          this.events.push({ k: "impact", x: b.x, y: ground, z: b.z, fire: !!b.fire });
          continue outer;
        }
        if (b.y <= 0) {
          this.events.push({ k: "splash", x: b.x, z: b.z });
          continue outer;
        }
      }
      keep.push(b);
    }
    this.balls = keep;
  }

  private damage(s: Ship, amount: number, byPlayer: boolean, x: number, y: number, z: number) {
    s.hp -= amount;
    this.events.push({ k: "hit", x, y, z, onPlayer: s === this.player, byPlayer, damage: amount });
    if (byPlayer && s !== this.player) {
      s.hitByPlayer = true;
      s.ai.angered = true;
      if (s.faction === "merchant") this.addHeat(0.08);
      if (s.faction === "marine") this.addHeat(0.15);
    }
    if (s.hp > 0) return;
    s.hp = 0;
    s.sinking = 0;
    if (s === this.player) {
      this.events.push({ k: "playerSunk" });
      return;
    }
    const reward = s.hitByPlayer;
    const gold = reward ? Math.round(rand(s.cls.gold[0], s.cls.gold[1])) : 0;
    const bounty = reward ? s.cls.bounty : 0;
    if (reward) this.reward(bounty, gold, SINK_HEAT[s.cls.id] ?? 0);
    this.events.push({ k: "sunk", shipId: s.id, name: s.cls.name, faction: s.faction, bounty, gold, byPlayer: reward, x: s.x, z: s.z });
  }

  private reward(bounty: number, gold: number, heat: number) {
    this.save.sunk++;
    this.addBounty(bounty, gold, heat);
  }

  /** Raise your bounty (and wanted level) for a crime, and pay you. */
  addBounty(bounty: number, gold: number, heat: number) {
    const before = rankFor(this.save.bounty).index;
    this.save.bounty += bounty;
    this.save.gold += gold;
    this.addHeat(heat);
    const after = rankFor(this.save.bounty);
    if (after.index > before) this.events.push({ k: "rank", title: after.title });
    if (!this.save.crowned && this.save.bounty >= KING_BOUNTY) {
      this.save.crowned = true;
      this.events.push({ k: "king" });
    }
  }

  private updateSinking(dt: number) {
    for (const s of this.ships) if (s.sinking >= 0) s.sinking += dt;
    this.ships = this.ships.filter((s) => s === this.player || s.sinking < SINK_TIME);
  }

  // ---------------------------------------------------------------- wanted level

  addHeat(amount: number) {
    if (amount <= 0) return;
    this.heat = Math.min(5, this.heat + amount);
    if (!this.hidden) this.lastSeen = this.time;
  }

  private updateHeat(dt: number) {
    const p = this.player;
    if (this.inHaven) {
      this.heat = Math.max(0, this.heat - 0.6 * dt);
    } else if (this.heat > 0) {
      const seen =
        !this.hidden &&
        this.mode === "ship" &&
        this.ships.some((s) => s.faction === "marine" && s.sinking < 0 && Math.hypot(s.x - p.x, s.z - p.z) < MARINE_SIGHT);
      if (seen) this.lastSeen = this.time;
      else if (this.time - this.lastSeen > HIDE_TIME) this.heat = Math.max(0, this.heat - 0.12 * dt);
    }
    const stars = this.stars;
    if (stars !== this.lastStars) {
      this.events.push({ k: "stars", stars, prev: this.lastStars });
      this.lastStars = stars;
      // Called off: hunters go back to patrolling.
      if (stars === 0) for (const s of this.ships) s.ai.hunter = false;
    }
  }

  // ---------------------------------------------------------------- population

  /** Keep the sea busy around you, and send Marine hunters when you're wanted. */
  private populate() {
    const p = this.player;
    const t = this.time;

    for (const s of this.ships) {
      if (s === p || s.sinking >= 0 || s.ai.hunter) continue;
      if (Math.hypot(s.x - p.x, s.z - p.z) > DESPAWN_RANGE) s.sinking = SINK_TIME; // quietly removed
    }

    if (p.sinking >= 0) return;

    if (t >= this.nextHunterSpawn && this.stars > 0 && !this.inHaven) {
      const want = [...HUNTERS_BY_STARS[this.stars]];
      for (const s of this.ships) {
        if (!s.ai.hunter || s.sinking >= 0) continue;
        const i = want.indexOf(s.cls.id);
        if (i >= 0) want.splice(i, 1);
      }
      if (want.length > 0) {
        const pos = this.offscreenPoint(1500, 1900);
        if (pos) {
          const hunter = this.spawnNpc(want[0], pos.x, pos.z, true);
          hunter.heading = Math.atan2(p.z - pos.z, p.x - pos.x);
        }
        this.nextHunterSpawn = t + 9;
      }
    }

    if (t < this.nextAmbientSpawn) return;
    this.nextAmbientSpawn = t + 2;
    const near = (f: Faction) =>
      this.ships.filter((s) => s.faction === f && s.sinking < 0 && !s.ai.hunter && Math.hypot(s.x - p.x, s.z - p.z) < 2800).length;
    const rank = rankFor(this.save.bounty).index;
    const pos = this.offscreenPoint(1800, 2600);
    if (!pos) return;
    if (near("merchant") < 5) this.spawnNpc(Math.random() < 0.1 ? "treasure_galleon" : "merchant_cog", pos.x, pos.z);
    else if (near("pirate") < 1 + Math.min(2, Math.floor(rank / 2))) this.spawnNpc("pirate_brig", pos.x, pos.z);
    else if (near("marine") < 1 + Math.floor(rank / 2)) {
      const big = rank >= 3 && Math.random() < 0.35;
      this.spawnNpc(big ? "marine_frigate" : "marine_sloop", pos.x, pos.z);
    }
  }

  private offscreenPoint(minR: number, maxR: number) {
    const p = this.player;
    const pt = this.randomSeaPoint(p.x, p.z, minR, maxR);
    return Math.hypot(pt.x - p.x, pt.z - p.z) >= minR * 0.9 ? pt : null;
  }

  // ---------------------------------------------------------------- treasure

  private spawnCrate() {
    for (let i = 0; i < 40; i++) {
      const x = rand(-WORLD_HALF + 400, WORLD_HALF - 400);
      const z = rand(-WORLD_HALF + 400, WORLD_HALF - 400);
      if (islandAt(x, z, 80) || Math.hypot(x - HAVEN.x, z - HAVEN.z) < HAVEN_SAFE_RADIUS) continue;
      this.crates.push({ id: this.nextId++, x, z, gold: Math.round(rand(40, 110)) });
      return;
    }
  }

  private updateCrates() {
    const p = this.player;
    if (p.sinking >= 0) return;
    const before = this.crates.length;
    this.crates = this.crates.filter((c) => {
      if (Math.hypot(c.x - p.x, c.z - p.z) > PICKUP_RADIUS + p.cls.beam / 2) return true;
      this.save.gold += c.gold;
      this.events.push({ k: "crate", gold: c.gold, x: c.x, z: c.z });
      return false;
    });
    for (let i = this.crates.length; i < before; i++) this.spawnCrate();
  }
}
