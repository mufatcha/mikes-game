/**
 * Wrathwater on foot: going ashore, walking/swimming, fighting Marines and
 * bandits, looting islands, robbing towns, and Devil Fruit powers.
 */
import { FRUITS, FRUIT_IDS, PLAYER_FOOT_HP, WEAPONS, WEAPON_ORDER, type FruitId, type WeaponId } from "./items";
import type { Sim } from "./sim";
import { BEACH_TOP, ISLANDS, groundHeight, islandAt, waveHeight, type Building, type Island, type LootSpot, type ServiceKind } from "./world";

export type WalkerKind = "hero" | "marine" | "captain" | "bandit";

export interface Walker {
  id: number;
  kind: WalkerKind;
  island: number;
  x: number;
  z: number;
  y: number;
  heading: number;
  hp: number;
  maxHp: number;
  weapon: WeaponId;
  cooldown: number;
  /** Seconds since the last attack started (drives the swing animation). */
  swing: number;
  moving: boolean;
  swimming: boolean;
  home: { x: number; z: number };
  /** Seconds since death, or -1 while alive. */
  dead: number;
  hurt: number;
}

export interface Shot {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  travelled: number;
  range: number;
  damage: number;
  byHero: boolean;
  fire: boolean;
}

export interface Hold {
  key: string;
  label: string;
  progress: number;
  needed: number;
}

export interface Prompt {
  key: string;
  label: string;
  /** Seconds to hold E, or 0 for a single press. */
  hold: number;
  run: () => void;
}

const WALK = 72;
const SPRINT = 112;
const SWIM = 34;
const HERO_RADIUS = 6;
const SPOT_RESPAWN: Record<LootSpot["kind"], number> = { chest: 360, crate: 300, buried: 900, fruit: Infinity };
const BUILDING_RESPAWN = 480;
const ACTIVE_RANGE = 1150;
/** Enemy guns hit much softer than yours. */
const NPC_GUN_DAMAGE: Partial<Record<WeaponId, number>> = { musket: 14, flintlock: 10, blunderbuss: 4 };

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));
const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export class Shore {
  hero: Walker | null = null;
  walkers: Walker[] = [];
  shots: Shot[] = [];
  hold: Hold | null = null;
  /** Loot spots and buildings emptied this session, with when they refill. */
  spentUntil = new Map<string, number>();
  private nextId = 100000;
  private activeIslands = new Set<number>();
  private drownWarned = 0;

  constructor(private sim: Sim) {}

  // ---------------------------------------------------------------- ashore / aboard

  /** The island your ship is close enough to land on. */
  landingIsland(): Island | null {
    const p = this.sim.player;
    if (p.sinking >= 0 || p.speed > 35) return null;
    for (const isl of ISLANDS) {
      if (Math.hypot(isl.x - p.x, isl.z - p.z) < isl.radius + p.cls.beam + 80) return isl;
    }
    return null;
  }

  goAshore() {
    const isl = this.landingIsland();
    if (!isl || this.hero) return false;
    const p = this.sim.player;
    const a = Math.atan2(p.z - isl.z, p.x - isl.x);
    const x = isl.x + Math.cos(a) * isl.radius * 0.84;
    const z = isl.z + Math.sin(a) * isl.radius * 0.84;
    this.hero = this.makeWalker("hero", isl.index, x, z, this.sim.save.equipped);
    this.hero.maxHp = PLAYER_FOOT_HP;
    this.hero.hp = PLAYER_FOOT_HP;
    this.hero.heading = a + Math.PI;
    // Docking at Blackwater Cove: the shipwright's crew patches the hull while you're ashore.
    if (isl.haven) p.hp = p.stats.hull;
    p.throttle = 0;
    this.sim.input.sails = 0;
    this.sim.mode = "foot";
    this.sim.events.push({ k: "ashore", island: isl.name });
    return true;
  }

  canBoard() {
    const h = this.hero;
    const p = this.sim.player;
    return !!h && h.dead < 0 && Math.hypot(h.x - p.x, h.z - p.z) < p.cls.length * 0.5 + 45;
  }

  board() {
    if (!this.canBoard()) return false;
    this.hero = null;
    this.hold = null;
    this.walkers = [];
    this.activeIslands.clear();
    this.sim.mode = "ship";
    this.sim.events.push({ k: "board" });
    return true;
  }

  /** After respawning at the haven. */
  reset() {
    this.hero = null;
    this.hold = null;
    this.walkers = [];
    this.shots = [];
    this.activeIslands.clear();
  }

  // ---------------------------------------------------------------- step

  step(dt: number) {
    this.populate();
    const h = this.hero;
    if (h && h.dead < 0) this.moveHero(h, dt);
    for (const w of this.walkers) {
      w.swing += dt;
      w.hurt = Math.max(0, w.hurt - dt);
      w.cooldown = Math.max(0, w.cooldown - dt);
      if (w.dead >= 0) {
        w.dead += dt;
        continue;
      }
      if (h) this.think(w, h, dt);
    }
    this.walkers = this.walkers.filter((w) => w.dead < 8);
    if (h) {
      h.swing += dt;
      h.hurt = Math.max(0, h.hurt - dt);
      h.cooldown = Math.max(0, h.cooldown - dt);
      if (h.dead >= 0) h.dead += dt;
      else if (this.sim.time - this.lastHeroHit > 7) h.hp = Math.min(h.maxHp, h.hp + 6 * dt);
    }
    this.updateShots(dt);
    this.updateHold(dt);
  }

  private lastHeroHit = -99;

  private moveHero(h: Walker, dt: number) {
    const inp = this.sim.input;
    const len = Math.hypot(inp.moveX, inp.moveZ);
    const hidden = this.sim.hidden;
    const ground = groundHeight(h.x, h.z);
    h.swimming = ground === null;
    let speed = h.swimming ? SWIM : inp.sprint ? SPRINT : WALK;
    if (hidden) speed *= 1.35;
    h.moving = len > 0.1;
    if (h.moving) {
      const nx = h.x + (inp.moveX / Math.max(1, len)) * speed * dt;
      const nz = h.z + (inp.moveZ / Math.max(1, len)) * speed * dt;
      h.x = nx;
      h.z = nz;
      if (!inp.attackHeld) h.heading = Math.atan2(inp.moveZ, inp.moveX);
    }
    if (inp.attackHeld || inp.aiming) h.heading = inp.aimYaw;
    this.collide(h);
    const g = groundHeight(h.x, h.z);
    h.swimming = g === null;
    h.y = g ?? waveHeight(h.x, h.z, this.sim.time) - 4;

    // Too far from any island: swim back toward the ship's island.
    const isl = islandAt(h.x, h.z, 260);
    if (!isl) {
      const home = ISLANDS[h.island];
      const a = Math.atan2(h.z - home.z, h.x - home.x);
      h.x = home.x + Math.cos(a) * (home.radius + 259);
      h.z = home.z + Math.sin(a) * (home.radius + 259);
    } else h.island = isl.index;

    // Devil Fruit users sink like a stone.
    if (h.swimming && this.sim.save.fruit) {
      this.hurtHero(h, 35 * dt, null);
      if (this.sim.time - this.drownWarned > 2) {
        this.drownWarned = this.sim.time;
        this.sim.events.push({ k: "drowning" });
      }
    }

    if (inp.attack) this.heroAttack(h);
    if (inp.ability) this.useFootPower(h);
  }

  private collide(w: Walker) {
    const isl = islandAt(w.x, w.z, 30);
    if (!isl) return;
    for (const b of isl.buildings) {
      const hw = b.w / 2 + HERO_RADIUS;
      const hd = b.d / 2 + HERO_RADIUS;
      const dx = w.x - b.x;
      const dz = w.z - b.z;
      if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
      if (hw - Math.abs(dx) < hd - Math.abs(dz)) w.x = b.x + Math.sign(dx || 1) * hw;
      else w.z = b.z + Math.sign(dz || 1) * hd;
    }
    for (const p of isl.palms) {
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d < 4 + HERO_RADIUS && d > 1e-6) {
        w.x = p.x + ((w.x - p.x) / d) * (4 + HERO_RADIUS);
        w.z = p.z + ((w.z - p.z) / d) * (4 + HERO_RADIUS);
      }
    }
  }

  // ---------------------------------------------------------------- combat

  private heroAttack(h: Walker) {
    if (h.cooldown > 0) return;
    const wpn = WEAPONS[h.weapon];
    if (wpn.kind === "gun") {
      if (this.sim.save.ammo <= 0) {
        h.cooldown = 0.6;
        this.sim.events.push({ k: "noAmmo" });
        return;
      }
      this.sim.save.ammo--;
    }
    h.cooldown = wpn.cooldown;
    h.swing = 0;
    if (wpn.kind === "melee") {
      this.sim.events.push({ k: "swing", x: h.x, z: h.z, byHero: true });
      this.meleeHit(h, wpn.damage, wpn.range, 0.55);
    } else {
      this.fireGun(h, wpn.id, h.heading, true);
    }
  }

  private meleeHit(attacker: Walker, damage: number, range: number, cone: number) {
    const fx = Math.cos(attacker.heading);
    const fz = Math.sin(attacker.heading);
    const targets = attacker.kind === "hero" ? this.walkers : this.hero ? [this.hero] : [];
    for (const t of targets) {
      if (t.dead >= 0) continue;
      const dx = t.x - attacker.x;
      const dz = t.z - attacker.z;
      const d = Math.hypot(dx, dz);
      if (d > range + HERO_RADIUS || (d > 1 && (dx * fx + dz * fz) / d < cone)) continue;
      this.damageWalker(t, damage, attacker.kind === "hero");
    }
  }

  private fireGun(w: Walker, weapon: WeaponId, aim: number, byHero: boolean) {
    const wpn = WEAPONS[weapon];
    for (let i = 0; i < wpn.pellets; i++) {
      const a = aim + rand(-wpn.spread, wpn.spread) + (byHero ? 0 : rand(-0.06, 0.06));
      this.shots.push({
        x: w.x + Math.cos(aim) * 8,
        y: w.y + 12,
        z: w.z + Math.sin(aim) * 8,
        vx: Math.cos(a) * 950,
        vz: Math.sin(a) * 950,
        travelled: 0,
        range: wpn.range,
        damage: byHero ? wpn.damage : (NPC_GUN_DAMAGE[weapon] ?? 8),
        byHero,
        fire: false,
      });
    }
    this.sim.events.push({ k: "gunshot", x: w.x, z: w.z, byHero, weapon });
  }

  private updateShots(dt: number) {
    const keep: Shot[] = [];
    outer: for (const s of this.shots) {
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        s.x += (s.vx * dt) / steps;
        s.z += (s.vz * dt) / steps;
        s.travelled += (Math.hypot(s.vx, s.vz) * dt) / steps;
        const isl = islandAt(s.x, s.z, 10);
        if (isl && isl.buildings.some((b) => Math.abs(s.x - b.x) < b.w / 2 && Math.abs(s.z - b.z) < b.d / 2)) {
          this.sim.events.push({ k: "impact", x: s.x, y: s.y, z: s.z, fire: s.fire });
          continue outer;
        }
        const targets = s.byHero ? this.walkers : this.hero ? [this.hero] : [];
        for (const t of targets) {
          if (t.dead >= 0 || Math.hypot(t.x - s.x, t.z - s.z) > (s.fire ? 16 : 9)) continue;
          if (s.fire) this.explode(s.x, s.z, 45, s.damage, true);
          else this.damageWalker(t, s.damage, s.byHero);
          continue outer;
        }
      }
      if (s.travelled > s.range) {
        if (s.fire) this.explode(s.x, s.z, 45, s.damage, true);
        continue;
      }
      keep.push(s);
    }
    this.shots = keep;
  }

  private explode(x: number, z: number, radius: number, damage: number, byHero: boolean) {
    this.sim.events.push({ k: "explosion", x, z, radius });
    const targets = byHero ? this.walkers : this.hero ? [this.hero] : [];
    for (const t of targets) {
      if (t.dead < 0 && Math.hypot(t.x - x, t.z - z) < radius) this.damageWalker(t, damage, byHero);
    }
  }

  private damageWalker(t: Walker, amount: number, byHero: boolean) {
    if (t.kind === "hero") {
      this.hurtHero(t, amount, null);
      return;
    }
    t.hp -= amount;
    t.hurt = 0.25;
    this.sim.events.push({ k: "walkerHit", x: t.x, y: t.y + 14, z: t.z, damage: Math.round(amount) });
    if (byHero && (t.kind === "marine" || t.kind === "captain")) {
      this.alertIsland(t.island);
      this.sim.addHeat(0.1);
    }
    if (t.hp > 0) return;
    t.hp = 0;
    t.dead = 0;
    if (!byHero) return;
    const bounty = t.kind === "captain" ? 12_000_000 : t.kind === "marine" ? 2_000_000 : 1_000_000;
    const gold = t.kind === "bandit" ? randInt(15, 40) : randInt(5, 20);
    this.sim.addBounty(bounty, gold, t.kind === "bandit" ? 0 : 0.35);
    this.sim.events.push({ k: "walkerDown", x: t.x, z: t.z, kind: t.kind, bounty, gold });
  }

  private hurtHero(h: Walker, amount: number, from: Walker | null) {
    if (h.dead >= 0) return;
    // Rubber shrugs off bullets.
    const rubber = this.sim.save.fruit === "gomu" && from !== null && WEAPONS[from.weapon].kind === "gun";
    h.hp -= rubber ? amount * 0.5 : amount;
    h.hurt = 0.3;
    this.lastHeroHit = this.sim.time;
    this.sim.events.push({ k: "heroHit", damage: amount });
    if (h.hp <= 0) {
      h.hp = 0;
      h.dead = 0;
      this.sim.events.push({ k: "heroDown" });
    }
  }

  /** Every guard on an island turns on you. */
  alertIsland(index: number) {
    this.alerted.set(index, this.sim.time + 40);
  }
  private alerted = new Map<number, number>();

  // ---------------------------------------------------------------- Devil Fruit powers on foot

  private useFootPower(h: Walker) {
    const fruit = this.sim.save.fruit;
    if (!fruit || this.sim.fruitCooldown > 0) return;
    this.sim.fruitCooldown = FRUITS[fruit].cooldown;
    const aim = this.sim.input.aimYaw;
    h.heading = aim;
    h.swing = 0;
    switch (fruit) {
      case "mera":
        this.shots.push({
          x: h.x, y: h.y + 14, z: h.z, vx: Math.cos(aim) * 520, vz: Math.sin(aim) * 520,
          travelled: 0, range: 420, damage: 85, byHero: true, fire: true,
        });
        this.sim.events.push({ k: "power", fruit, x: h.x, z: h.z, tx: h.x + Math.cos(aim) * 40, tz: h.z + Math.sin(aim) * 40 });
        break;
      case "goro": {
        const t = this.nearestInFront(h, 340, 0.5);
        const tx = t ? t.x : h.x + Math.cos(aim) * 200;
        const tz = t ? t.z : h.z + Math.sin(aim) * 200;
        this.sim.events.push({ k: "power", fruit, x: h.x, z: h.z, tx, tz });
        this.explode(tx, tz, 40, 95, true);
        break;
      }
      case "gomu": {
        this.sim.events.push({ k: "power", fruit, x: h.x, z: h.z, tx: h.x + Math.cos(aim) * 140, tz: h.z + Math.sin(aim) * 140 });
        const t = this.nearestInFront(h, 150, 0.85);
        if (t) this.damageWalker(t, 75, true);
        break;
      }
      case "moku":
        this.sim.smoke(8);
        this.sim.events.push({ k: "power", fruit, x: h.x, z: h.z, tx: h.x, tz: h.z });
        break;
      case "gura":
        this.sim.events.push({ k: "power", fruit, x: h.x, z: h.z, tx: h.x, tz: h.z });
        this.explode(h.x, h.z, 170, 85, true);
        break;
    }
  }

  private nearestInFront(h: Walker, range: number, cone: number) {
    let best: Walker | null = null;
    let bestD = Infinity;
    for (const w of this.walkers) {
      if (w.dead >= 0) continue;
      const dx = w.x - h.x;
      const dz = w.z - h.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 1) continue;
      if ((dx * Math.cos(h.heading) + dz * Math.sin(h.heading)) / d < cone) continue;
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- NPCs

  private makeWalker(kind: WalkerKind, island: number, x: number, z: number, weapon: WeaponId): Walker {
    const hp = kind === "captain" ? 190 : kind === "marine" ? 70 : kind === "bandit" ? 55 : PLAYER_FOOT_HP;
    return {
      id: this.nextId++,
      kind,
      island,
      x,
      z,
      y: groundHeight(x, z) ?? BEACH_TOP,
      heading: Math.random() * Math.PI * 2,
      hp,
      maxHp: hp,
      weapon,
      cooldown: rand(0.5, 2),
      swing: 9,
      moving: false,
      swimming: false,
      home: { x, z },
      dead: -1,
      hurt: 0,
    };
  }

  /** Guards and bandits appear when you come near their island and leave when you're gone. */
  private populate() {
    const anchor = this.hero ?? this.sim.player;
    for (const isl of ISLANDS) {
      const near = Math.hypot(isl.x - anchor.x, isl.z - anchor.z) < isl.radius + ACTIVE_RANGE;
      if (near && !this.activeIslands.has(isl.index)) {
        this.activeIslands.add(isl.index);
        for (const g of isl.guards) {
          this.walkers.push(this.makeWalker("marine", isl.index, g.x, g.z, Math.random() < 0.55 ? "musket" : "cutlass"));
        }
        if (isl.kind === "town" && this.sim.stars >= 3) {
          const b = isl.buildings[0];
          this.walkers.push(this.makeWalker("captain", isl.index, b.door.x, b.door.z, "cutlass"));
        }
        for (const b of isl.bandits) {
          this.walkers.push(this.makeWalker("bandit", isl.index, b.x, b.z, Math.random() < 0.3 ? "flintlock" : "cutlass"));
        }
      } else if (!near && this.activeIslands.has(isl.index)) {
        this.activeIslands.delete(isl.index);
        this.walkers = this.walkers.filter((w) => w.island !== isl.index);
      }
    }
  }

  private think(w: Walker, h: Walker, dt: number) {
    const t = this.sim.time;
    const dx = h.x - w.x;
    const dz = h.z - w.z;
    const d = Math.hypot(dx, dz);
    const heroHere = h.dead < 0 && !this.sim.hidden && h.island === w.island;
    const alerted = (this.alerted.get(w.island) ?? 0) > t;
    let hostile = false;
    if (heroHere) {
      if (w.kind === "bandit") hostile = d < 260 || (alerted && d < 600);
      else hostile = (this.sim.heat > 0 || alerted) && d < 420;
    }
    if (hostile && w.kind !== "bandit") this.sim.seenByMarines();

    const wpn = WEAPONS[w.weapon];
    let goalX = w.home.x;
    let goalZ = w.home.z;
    let speed = WALK * 0.55;
    if (hostile) {
      w.heading = Math.atan2(dz, dx);
      speed = WALK * 0.9;
      if (wpn.kind === "gun") {
        // Keep some distance and shoot.
        const want = 200;
        goalX = h.x - (dx / d) * want;
        goalZ = h.z - (dz / d) * want;
        if (d < wpn.range * 0.9 && w.cooldown <= 0) {
          w.cooldown = wpn.cooldown + rand(0.8, 1.6);
          w.swing = 0;
          this.fireGun(w, w.weapon, w.heading, false);
        }
      } else {
        goalX = h.x;
        goalZ = h.z;
        if (d < wpn.range + 10 && w.cooldown <= 0) {
          w.cooldown = wpn.cooldown + rand(0.9, 1.6);
          w.swing = 0;
          this.sim.events.push({ k: "swing", x: w.x, z: w.z, byHero: false });
          const dmg = w.kind === "captain" ? 18 : w.kind === "bandit" ? 7 : 8;
          if (d < wpn.range + HERO_RADIUS + 4) this.hurtHero(h, dmg, w);
        }
      }
    }
    const gx = goalX - w.x;
    const gz = goalZ - w.z;
    const gd = Math.hypot(gx, gz);
    w.moving = gd > 12;
    if (w.moving) {
      if (!hostile) w.heading = Math.atan2(gz, gx);
      const step = Math.min(gd, speed * dt);
      const nx = w.x + (gx / gd) * step;
      const nz = w.z + (gz / gd) * step;
      // NPCs stay on dry land.
      if (groundHeight(nx, nz) !== null) {
        w.x = nx;
        w.z = nz;
      }
    }
    this.collide(w);
    w.y = groundHeight(w.x, w.z) ?? w.y;
    void wrap;
  }

  // ---------------------------------------------------------------- looting and robbing

  /** What pressing E would do right now, on foot. */
  prompt(): Prompt | null {
    const h = this.hero;
    if (!h || h.dead >= 0) return null;
    if (this.canBoard()) return { key: "board", label: "Board your ship", hold: 0, run: () => this.board() };
    const isl = ISLANDS[h.island];
    const t = this.sim.time;
    for (const s of isl.spots) {
      if ((this.spentUntil.get(s.id) ?? 0) > t) continue;
      if (s.kind === "fruit" && !this.unfoundFruit()) continue;
      if (Math.hypot(s.x - h.x, s.z - h.z) > 26) continue;
      const label = { chest: "Open the chest", crate: "Search the supply crate", buried: "Dig up the treasure", fruit: "Take the strange fruit" }[s.kind];
      const hold = { chest: 1.5, crate: 1, buried: 3.5, fruit: 0 }[s.kind];
      return { key: s.id, label, hold, run: () => this.lootSpot(s) };
    }
    for (let i = 0; i < isl.buildings.length; i++) {
      const b = isl.buildings[i];
      if (b.kind === "shipwright" || b.kind === "blacksmith" || b.kind === "market") {
        if (Math.hypot(b.door.x - h.x, b.door.z - h.z) > 28) continue;
        const kind: ServiceKind = b.kind;
        const label = { shipwright: "Visit the Shipwright (upgrade your ship)", blacksmith: "Visit the Blacksmith (craft weapons)", market: "Visit the Black Market" }[kind];
        return { key: `svc${i}`, label, hold: 0, run: () => this.sim.events.push({ k: "service", building: kind }) };
      }
      if (b.kind === "house" || b.kind === "tavern" || isl.kind === "haven") continue;
      const key = `b${isl.index}:${i}`;
      if ((this.spentUntil.get(key) ?? 0) > t) continue;
      if (Math.hypot(b.door.x - h.x, b.door.z - h.z) > 28) continue;
      const label = { bank: "Rob the bank vault", shop: "Rob the shop", armory: "Break into the armory" }[b.kind];
      const hold = { bank: 8, shop: 4, armory: 6 }[b.kind];
      return { key, label, hold, run: () => this.rob(isl, b, key) };
    }
    return null;
  }

  private updateHold(dt: number) {
    const inp = this.sim.input;
    const p = this.prompt();
    if (!p || !inp.interactHeld) {
      this.hold = null;
      return;
    }
    if (p.hold === 0) {
      if (inp.interact) p.run();
      this.hold = null;
      return;
    }
    if (!this.hold || this.hold.key !== p.key) this.hold = { key: p.key, label: p.label, progress: 0, needed: p.hold };
    this.hold.progress += dt;
    // Robbing makes noise: guards come running.
    if (p.key.startsWith("b") && this.hero) this.alertIsland(this.hero.island);
    if (this.hold.progress >= this.hold.needed) {
      this.hold = null;
      p.run();
    }
  }

  private unfoundFruit(): FruitId | null {
    const s = this.sim.save;
    const left = FRUIT_IDS.filter((f) => !s.fruitsFound.includes(f));
    return left.length ? left[Math.floor(Math.random() * left.length)] : null;
  }

  private giveFruit(chance: number) {
    if (Math.random() > chance) return;
    const f = this.unfoundFruit();
    if (!f) return;
    this.sim.save.fruitsFound.push(f);
    this.sim.save.heldFruits.push(f);
    this.sim.events.push({ k: "fruitFound", fruit: f });
  }

  private giveWeapon(chance: number) {
    if (Math.random() > chance) return null;
    const s = this.sim.save;
    const missing = WEAPON_ORDER.filter((w) => w !== "fists" && w !== "dull_sword" && !s.weapons.includes(w));
    if (!missing.length) return null;
    const w = missing[Math.floor(Math.random() * missing.length)];
    s.weapons.push(w);
    return w;
  }

  private giveMaterials(wood: [number, number], iron: [number, number], powder: [number, number]) {
    const m = this.sim.save.materials;
    const got = { wood: randInt(...wood), iron: randInt(...iron), powder: randInt(...powder) };
    m.wood += got.wood;
    m.iron += got.iron;
    m.powder += got.powder;
    return got;
  }

  private lootSpot(s: LootSpot) {
    this.spentUntil.set(s.id, this.sim.time + SPOT_RESPAWN[s.kind]);
    const save = this.sim.save;
    let ammo = 0;
    let gold = 0;
    let weapon: WeaponId | null = null;
    let mats = { wood: 0, iron: 0, powder: 0 };
    if (s.kind === "chest") {
      gold = randInt(60, 170);
      mats = this.giveMaterials([1, 3], [0, 2], [0, 2]);
      weapon = this.giveWeapon(0.12);
      ammo = randInt(2, 5);
      this.giveFruit(0.06);
    } else if (s.kind === "crate") {
      mats = this.giveMaterials([2, 4], [1, 3], [1, 3]);
      ammo = randInt(3, 6);
    } else if (s.kind === "buried") {
      gold = randInt(220, 420);
      mats = this.giveMaterials([0, 2], [1, 3], [1, 2]);
      this.giveFruit(0.25);
    } else if (s.kind === "fruit") {
      this.giveFruit(1);
    }
    save.gold += gold;
    save.ammo += ammo;
    this.sim.events.push({ k: "loot", x: s.x, z: s.z, gold, weapon, ...mats, ammo });
  }

  private rob(isl: Island, b: Building, key: string) {
    this.spentUntil.set(key, this.sim.time + BUILDING_RESPAWN);
    this.alertIsland(isl.index);
    const save = this.sim.save;
    save.robberies++;
    let weapon: WeaponId | null = null;
    let mats = { wood: 0, iron: 0, powder: 0 };
    let gold = 0;
    let ammo = 0;
    if (b.kind === "bank") {
      gold = randInt(700, 1300);
      this.sim.addBounty(35_000_000, gold, 2);
    } else if (b.kind === "shop") {
      gold = randInt(120, 240);
      mats = this.giveMaterials([1, 3], [1, 2], [0, 2]);
      ammo = randInt(3, 6);
      this.sim.addBounty(6_000_000, gold, 0.8);
    } else {
      weapon = this.giveWeapon(1);
      mats = this.giveMaterials([0, 2], [2, 5], [3, 6]);
      ammo = randInt(10, 16);
      this.sim.addBounty(12_000_000, 0, 1.3);
    }
    save.ammo += ammo;
    this.sim.events.push({ k: "robbed", building: b.kind, town: isl.name, gold, weapon, ...mats, ammo });
  }

  // ---------------------------------------------------------------- inventory

  equip(id: WeaponId) {
    const s = this.sim.save;
    if (id !== "fists" && !s.weapons.includes(id)) return;
    s.equipped = id;
    if (this.hero) {
      this.hero.weapon = id;
      this.hero.cooldown = 0.3;
    }
  }
}
