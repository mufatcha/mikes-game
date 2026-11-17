/**
 * Wrathwater on foot: going ashore, walking/swimming, fighting Marines and
 * bandits, looting islands, robbing towns, and Devil Fruit powers.
 */
import { FRUIT_IDS, ITEMS, PLAYER_FOOT_HP, WEAPONS, WEAPON_ORDER, skillEffects, type FruitId, type ItemId, type StretchMove, type WeaponId } from "./items";
import { giverName } from "./quests";
import { HOME_ISLAND, HOME_PRICE, homeLayout } from "./home";
import type { Sim } from "./sim";
import { BEACH_TOP, COUNTER, ISLANDS, doorAxis, groundHeight, islandAt, waveHeight, type Building, type BuildingKind, type Island, type LootSpot, type ServiceKind } from "./world";

export type WalkerKind = "hero" | "marine" | "captain" | "bandit" | "crew" | "tribal";

/** Bandits and tribal warriors: fight on sight, and no Marine cares if you beat them. */
const outlaw = (k: WalkerKind) => k === "bandit" || k === "tribal";

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
  /** A Vault Warden: a tough captain carrying one of the vault's keys. */
  warden?: boolean;
  /** Seconds of poison left (it hurts every second), and of being bound by smoke (can't fight). */
  poison?: number;
  stun?: number;
  /** A body you've searched (it sinks into the ground from `dead` = sinkAt). */
  looted?: boolean;
  sinkAt?: number;
  /** When this enemy last fought (your crew go for enemies who are fighting). */
  engaged?: number;
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
  /** Venom: whoever it hits keeps getting hurt for a while. */
  poison?: boolean;
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
  /** A shop you visit with a tap of E can be robbed by holding E instead. */
  robAlt?: { key: string; label: string; hold: number; run: () => void };
  /** Cracking the vault: the alarm brings waves of elite Marines. */
  vault?: boolean;
}

/** Robbing each kind of building: what the hold bar says and how long it takes. */
const ROB: Record<BuildingKind, { label: string; hold: number }> = {
  bank: { label: "Rob the bank vault", hold: 8 },
  shop: { label: "Rob the shop", hold: 4 },
  armory: { label: "Break into the armory", hold: 6 },
  house: { label: "Rob the house", hold: 3 },
  tavern: { label: "Rob the tavern's till", hold: 4 },
  shipwright: { label: "Rob the shipwright's yard", hold: 6 },
  blacksmith: { label: "Rob the blacksmith's forge", hold: 6 },
  market: { label: "Rob the black market", hold: 6 },
  vault: { label: "Crack the vault", hold: 30 },
  hut: { label: "Raid the hut", hold: 3 },
};
/** What Blackwater Cove's stores are called. */
export const STORE_NAMES: Record<ServiceKind, string> = { shipwright: "shipwright's", blacksmith: "blacksmith's", market: "black market", tavern: "tavern", shop: "general store" };

/** Holding E this long at a shop you can visit means rob it, not visit. */
const ROB_INSTEAD_AFTER = 0.5;
/** Robbing in Blackwater Cove makes it unsafe for you for this long (seconds). */
const HAVEN_ANGRY = 180;

/** How long a body lies there before it's gone (seconds). */
const BODY_TIME = 90;
/** Crew ashore: how many come with you, and how far they'll go for a fight. */
const MAX_ALLIES = 6;
const ALLY_REACH = 260;

const WALK = 72;
const SPRINT = 112;
const SWIM = 34;
const HERO_RADIUS = 6;
const SPOT_RESPAWN: Record<LootSpot["kind"], number> = { chest: 360, crate: 300, buried: 900, fruit: Infinity };
const BUILDING_RESPAWN = 480;
/** How close to a building's door you need to be to visit or rob it. */
const DOOR_REACH = 34;
/** Vault Wardens are much tougher than other captains. */
const WARDEN_HP = 650;
/** Cracking the vault: elite Marines storm in every few seconds. */
const VAULT_WAVE_EVERY = 6;
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
  /** A shop you can visit or rob: how long E has been held there. */
  private tap = { key: "", time: 0 };
  /** Seconds until the next wave of guards while cracking the vault. */
  private vaultWave = 0;
  /** Loot spots and buildings emptied this session, with when they refill. */
  spentUntil = new Map<string, number>();
  private nextId = 100000;
  private activeIslands = new Set<number>();
  /** Your crew ashore: they follow you and fight beside you. */
  allies: Walker[] = [];
  /** In VR you walk right into Blackwater Cove's stores: the one you're standing in. */
  inside: { island: number; index: number; kind: ServiceKind } | null = null;
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
    const fx = skillEffects(this.sim.save.skills);
    this.hero.maxHp = fx.maxHp;
    this.hero.hp = fx.maxHp;
    this.hero.heading = a + Math.PI;
    // Up to six of your crew come ashore with you.
    const n = Math.min(MAX_ALLIES, this.sim.save.crew);
    this.allies = [];
    for (let i = 0; i < n; i++) {
      const b = a + (i - (n - 1) / 2) * 0.35;
      const ally = this.makeWalker("crew", isl.index, x + Math.cos(b) * 26, z + Math.sin(b) * 26, "cutlass");
      ally.maxHp = 90;
      ally.hp = 90;
      this.allies.push(ally);
    }
    // Docking at Blackwater Cove (or your own island's dock): your hull gets patched while you're ashore.
    if (isl.haven || (isl === HOME_ISLAND && this.sim.save.home.built.includes("dock"))) p.hp = p.stats.hull;
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
    this.inside = null;
    this.hero = null;
    this.hold = null;
    this.walkers = [];
    this.allies = [];
    this.activeIslands.clear();
    this.sim.mode = "ship";
    this.sim.events.push({ k: "board" });
    return true;
  }

  /** After respawning at the haven. */
  reset() {
    this.inside = null;
    this.allies = [];
    this.launch = null;
    this.flurry = null;
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
      if (w.poison && w.poison > 0) {
        const before = Math.ceil(w.poison);
        w.poison -= dt;
        // Once a second, the poison bites.
        if (Math.ceil(w.poison) < before) this.damageWalker(w, 12 * this.sim.powerMul, true);
        if (w.dead >= 0) continue;
      }
      if (w.stun && w.stun > 0) {
        w.stun -= dt;
        w.moving = false;
        continue;
      }
      if (h) this.think(w, h, dt);
    }
    // Bodies stay until searched (or a minute and a half), then sink away.
    this.walkers = this.walkers.filter((w) => w.dead < (w.sinkAt ?? BODY_TIME) + 4);
    for (const a of this.allies) {
      a.swing += dt;
      a.hurt = Math.max(0, a.hurt - dt);
      a.cooldown = Math.max(0, a.cooldown - dt);
      if (a.dead >= 0) {
        a.dead += dt;
        continue;
      }
      if (h) this.allyThink(a, h, dt);
    }
    this.allies = this.allies.filter((a) => a.dead < 8);
    if (h) {
      h.swing += dt;
      h.hurt = Math.max(0, h.hurt - dt);
      h.cooldown = Math.max(0, h.cooldown - dt);
      if (h.dead >= 0) h.dead += dt;
      else {
        // You heal when you've been out of a fight a while, unless you're hungry.
        if (this.sim.time - this.lastHeroHit > 7 && this.sim.save.hunger >= 20) h.hp = Math.min(h.maxHp, h.hp + 6 * dt);
        // Starving or food poisoning wears you down.
        const drain = (this.sim.starving ? 1 : 0) + (this.sim.foodPoisoned ? 1.5 : 0);
        if (drain && h.hp > 1) h.hp = Math.max(1, h.hp - drain * dt);
      }
    }
    if (h && h.dead < 0) this.updateFlurry(h, dt);
    else this.flurry = null;
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
    speed *= skillEffects(this.sim.save.skills).speed;
    if (this.sim.tailwind) speed *= 1.7;
    if (this.sim.foodPoisoned) speed *= 0.7;
    if (this.sim.starving) speed *= 0.85;
    h.moving = len > 0.1;
    const launching = this.updateLaunch(h, dt);
    if (h.moving && !launching) {
      const nx = h.x + (inp.moveX / Math.max(1, len)) * speed * dt;
      const nz = h.z + (inp.moveZ / Math.max(1, len)) * speed * dt;
      h.x = nx;
      h.z = nz;
      if (!inp.attackHeld && !inp.firstPerson) h.heading = Math.atan2(inp.moveZ, inp.moveX);
    }
    if ((inp.attackHeld || inp.aiming || inp.firstPerson) && !launching) h.heading = inp.aimYaw;
    if (this.inside) this.keepInside(h);
    else this.collide(h);
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

  // ---------------------------------------------------------------- inside a store

  /** Walk in through a store's door: you stand just inside, facing the counter. */
  enterStore(island: number, index: number) {
    const h = this.hero;
    const b = ISLANDS[island]?.buildings[index];
    if (!h || !b) return false;
    const kind = (b.kind === "tavern" ? "tavern" : b.kind) as ServiceKind;
    const ax = doorAxis(b);
    h.x = b.x + Math.cos(ax.angle) * (ax.depth / 2 - 22);
    h.z = b.z + Math.sin(ax.angle) * (ax.depth / 2 - 22);
    h.heading = ax.angle + Math.PI;
    this.hold = null;
    this.inside = { island, index, kind };
    this.sim.events.push({ k: "store", building: kind });
    return true;
  }

  /** Back out through the door. */
  leaveStore() {
    const h = this.hero;
    const at = this.inside;
    if (!h || !at) return;
    const b = ISLANDS[at.island].buildings[at.index];
    h.x = b.door.x;
    h.z = b.door.z;
    h.heading = b.facing;
    this.inside = null;
    this.sim.events.push({ k: "store", building: null });
  }

  /** The store you're in: its building. */
  get insideBuilding() {
    return this.inside ? ISLANDS[this.inside.island].buildings[this.inside.index] : null;
  }

  private keepInside(h: Walker) {
    const b = this.insideBuilding;
    if (!b) return;
    const m = HERO_RADIUS + 1;
    h.x = Math.max(b.x - b.w / 2 + m, Math.min(b.x + b.w / 2 - m, h.x));
    h.z = Math.max(b.z - b.d / 2 + m, Math.min(b.z + b.d / 2 - m, h.z));
    // Not over the counter: stay on the customers' side of it.
    const ax = doorAxis(b);
    const fx = Math.cos(ax.angle);
    const fz = Math.sin(ax.angle);
    const u = (h.x - b.x) * fx + (h.z - b.z) * fz;
    const front = -ax.depth / 2 + COUNTER + 3 + HERO_RADIUS;
    if (u < front) {
      h.x += (front - u) * fx;
      h.z += (front - u) * fz;
    }
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
    const sk = skillEffects(this.sim.save.skills);
    h.cooldown = wpn.cooldown * (wpn.kind === "gun" ? sk.gunCooldown : 1);
    h.swing = 0;
    if (wpn.kind === "melee") {
      this.sim.events.push({ k: "swing", x: h.x, z: h.z, byHero: true });
      this.meleeHit(h, wpn.damage * sk.melee, wpn.range, 0.55);
      // A supply crate in front of you breaks open.
      const fx = Math.cos(h.heading);
      const fz = Math.sin(h.heading);
      const crate = this.crateNear(h.x + fx * wpn.range * 0.6, h.z + fz * wpn.range * 0.6, wpn.range * 0.6 + 6);
      if (crate) this.lootSpot(crate, true);
    } else {
      this.fireGun(h, wpn.id, h.heading, true);
    }
  }

  /** An unopened supply crate on your island within `reach` of a point. */
  private crateNear(x: number, z: number, reach: number) {
    const h = this.hero;
    if (!h) return null;
    const t = this.sim.time;
    return ISLANDS[h.island].spots.find((s) => s.kind === "crate" && (this.spentUntil.get(s.id) ?? 0) <= t && Math.hypot(s.x - x, s.z - z) < reach) ?? null;
  }

  /**
   * A real swing in VR: your weapon's tip is at (x, y, z) and moving fast.
   * Smashes a supply crate it hits, and hurts anyone it hits. Returns what it
   * hit (for the controller's buzz), or null if you can't swing right now.
   */
  swingAt(x: number, y: number, z: number): "crate" | "hit" | "miss" | null {
    const h = this.hero;
    if (!h || h.dead >= 0 || h.cooldown > 0) return null;
    const wpn = WEAPONS[h.weapon];
    if (wpn.kind !== "melee") return null;
    h.cooldown = Math.min(wpn.cooldown, 0.4);
    h.swing = 0;
    this.sim.events.push({ k: "swing", x: h.x, z: h.z, byHero: true });
    let result: "crate" | "hit" | "miss" = "miss";
    // Crates are about 10 tall: the tip has to come down into one.
    const crate = this.crateNear(x, z, 9);
    if (crate && y < (groundHeight(crate.x, crate.z) ?? BEACH_TOP) + 14) {
      this.lootSpot(crate, true);
      result = "crate";
    }
    for (const t of this.walkers) {
      if (t.dead >= 0) continue;
      if (Math.hypot(t.x - x, t.z - z) > HERO_RADIUS + 4 || y < t.y - 2 || y > t.y + 21) continue;
      this.damageWalker(t, wpn.damage * skillEffects(this.sim.save.skills).melee, true);
      result = "hit";
    }
    return result;
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
        damage: byHero ? wpn.damage * skillEffects(this.sim.save.skills).gunDamage : (NPC_GUN_DAMAGE[weapon] ?? 8),
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
        const targets = s.byHero ? this.walkers : this.hero ? [this.hero, ...this.allies] : this.allies;
        for (const t of targets) {
          if (t.dead >= 0 || Math.hypot(t.x - s.x, t.z - s.z) > (s.fire ? 16 : 9)) continue;
          if (s.fire) this.explode(s.x, s.z, 45, s.damage, true);
          else this.damageWalker(t, s.damage, s.byHero);
          if (s.poison && t.kind !== "hero") t.poison = Math.max(t.poison ?? 0, 6);
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
    if (t.kind === "crew") {
      if (t.dead >= 0 || this.sim.god) return;
      t.hp -= amount;
      t.hurt = 0.25;
      this.sim.events.push({ k: "walkerHit", x: t.x, y: t.y + 14, z: t.z, damage: Math.round(amount) });
      if (t.hp <= 0) {
        t.hp = 0;
        t.dead = 0;
        // A sailor lost for good.
        this.sim.save.crew = Math.max(0, this.sim.save.crew - 1);
        this.sim.events.push({ k: "crewDown" });
      }
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
    // A Vault Warden drops their key.
    if (t.warden && !this.sim.save.vaultKeys.includes(t.island)) {
      this.sim.save.vaultKeys.push(t.island);
      this.sim.events.push({ k: "vaultKey", keys: this.sim.save.vaultKeys.length, island: t.island });
    }
    const bounty = t.kind === "captain" ? 12_000_000 : t.kind === "marine" ? 2_000_000 : 1_000_000;
    const gold = outlaw(t.kind) ? randInt(15, 40) : randInt(5, 20);
    this.sim.addBounty(bounty, gold, outlaw(t.kind) ? 0 : 0.35);
    this.sim.events.push({ k: "walkerDown", x: t.x, z: t.z, kind: t.kind, bounty, gold, island: t.island });
  }

  private hurtHero(h: Walker, amount: number, from: Walker | null) {
    if (this.sim.god) return; // cheat: god mode
    if (h.dead >= 0) return;
    // Rubber shrugs off bullets.
    const gun = from !== null && WEAPONS[from.weapon].kind === "gun";
    // Bounce Body: bullets and blades bounce straight back at whoever sent them.
    if (this.sim.bouncing && from) {
      this.sim.events.push({ k: "power", fruit: "gomu", x: h.x, z: h.z, tx: from.x, tz: from.z, move: "bounce", awake: this.sim.awakened });
      if (from.dead < 0) this.damageWalker(from, amount * (this.sim.awakened ? 5 : 1.5), true);
      return;
    }
    // Awakened: bullets do nothing and blades only scratch.
    if (this.sim.awakened && gun) return;
    const rubber = this.sim.save.fruit === "gomu" && gun;
    if (this.sim.ironSkin) amount *= 0.25;
    h.hp -= rubber ? amount * 0.5 : this.sim.awakened ? amount * 0.5 : amount;
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
    if (fruit === "gomu") return this.footStretch(h);
    if (!fruit || this.launch) return;
    const move = this.sim.takeFruitMove();
    if (!move) return;
    const pow = this.sim.powerMul;
    const aim = this.sim.input.aimYaw;
    const cx = Math.cos(aim);
    const cz = Math.sin(aim);
    h.heading = aim;
    h.swing = 0;
    const fx = (tx: number, tz: number, m: string = move) =>
      this.sim.events.push({ k: "power", fruit, x: h.x, z: h.z, tx, tz, move: m as typeof move });
    const shoot = (speed: number, range: number, damage: number, fire: boolean, poison = false) =>
      this.shots.push({
        x: h.x, y: h.y + 14, z: h.z, vx: cx * speed, vz: cz * speed,
        travelled: 0, range, damage: damage * pow, byHero: true, fire, poison,
      });
    const around = (r: number) => this.walkers.filter((w) => w.dead < 0 && Math.hypot(w.x - h.x, w.z - h.z) < r);
    const fling = (w: Walker, dist: number) => {
      const a = Math.atan2(w.z - h.z, w.x - h.x);
      const nx = w.x + Math.cos(a) * dist;
      const nz = w.z + Math.sin(a) * dist;
      if (groundHeight(nx, nz) !== null) {
        w.x = nx;
        w.z = nz;
      }
    };
    switch (move) {
      case "fireball":
        shoot(520, 420, 85, true);
        fx(h.x + cx * 40, h.z + cz * 40);
        break;
      case "flameRing":
        fx(h.x, h.z);
        this.explode(h.x, h.z, 110, 70 * pow, true);
        break;
      case "fireRain":
        for (let i = 1; i <= 5; i++) {
          const tx = h.x + cx * (50 + i * 50);
          const tz = h.z + cz * (50 + i * 50);
          fx(tx, tz);
          this.explode(tx, tz, 45, 55 * pow, true);
        }
        break;
      case "bolt": {
        const t = this.nearestInFront(h, 340, 0.5);
        const tx = t ? t.x : h.x + cx * 200;
        const tz = t ? t.z : h.z + cz * 200;
        fx(tx, tz);
        this.explode(tx, tz, 40, 95 * pow, true);
        break;
      }
      case "chain": {
        const hit = around(260).sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z)).slice(0, 4);
        if (!hit.length) fx(h.x + cx * 120, h.z + cz * 120, "bolt");
        for (const w of hit) {
          fx(w.x, w.z, "bolt");
          this.damageWalker(w, 60 * pow, true);
        }
        break;
      }
      case "thunderDash":
        fx(h.x + cx * 200, h.z + cz * 200);
        this.launch = { dir: aim, t: 0.3, speed: 1000, hit: new Set() };
        break;
      case "screen":
        this.sim.smoke(8);
        fx(h.x, h.z);
        break;
      case "smokeFist":
        shoot(600, 320, 55, false);
        fx(h.x + cx * 40, h.z + cz * 40);
        break;
      case "smokeBind":
        fx(h.x, h.z);
        for (const w of around(160)) {
          w.stun = 4;
          this.damageWalker(w, 25 * pow, true);
        }
        break;
      case "seaquake":
        fx(h.x, h.z);
        this.explode(h.x, h.z, 170, 85 * pow, true);
        break;
      case "quakePunch":
        fx(h.x + cx * 70, h.z + cz * 70);
        this.explode(h.x + cx * 70, h.z + cz * 70, 80, 120 * pow, true);
        break;
      case "tsunami":
        fx(h.x, h.z);
        for (const w of around(240)) {
          this.damageWalker(w, 55 * pow, true);
          fling(w, 120);
        }
        break;
      case "galeSlash":
        shoot(800, 520, 70, false);
        fx(h.x + cx * 60, h.z + cz * 60);
        break;
      case "tornado":
        fx(h.x, h.z);
        for (const w of around(180)) {
          this.damageWalker(w, 40 * pow, true);
          fling(w, 140);
          w.stun = 1.5;
        }
        break;
      case "tailwind":
        this.sim.windUntil = this.sim.time + 6;
        fx(h.x, h.z);
        break;
      case "ironSkin":
        this.sim.ironUntil = this.sim.time + 8;
        fx(h.x, h.z);
        break;
      case "ironFist": {
        const t = this.nearestInFront(h, 60, 0.6);
        fx(h.x + cx * 40, h.z + cz * 40);
        if (t) this.damageWalker(t, 150 * pow, true);
        break;
      }
      case "ironRain":
        fx(h.x + cx * 260, h.z + cz * 260);
        this.explode(h.x + cx * 260, h.z + cz * 260, 70, 90 * pow, true);
        break;
      case "venomSpit":
        shoot(560, 360, 40, false, true);
        fx(h.x + cx * 40, h.z + cz * 40);
        break;
      case "poisonCloud":
        fx(h.x, h.z);
        for (const w of around(150)) w.poison = Math.max(w.poison ?? 0, 6);
        break;
      case "toxicTide":
        fx(h.x, h.z);
        for (const w of around(300)) {
          w.poison = Math.max(w.poison ?? 0, 4);
          this.damageWalker(w, 20 * pow, true);
        }
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- bombs, tonics and smoke

  /** Use something you're carrying. Returns a reason it can't be used, or null when it worked. */
  useItem(id: ItemId): string | null {
    const s = this.sim.save;
    if ((s.items[id] ?? 0) <= 0) return `You have no ${ITEMS[id].name.toLowerCase()}s.`;
    const h = this.hero;
    if (id === "smoke") {
      s.items.smoke--;
      this.sim.smoke(5);
      const at = h ?? this.sim.player;
      this.sim.events.push({ k: "power", fruit: "moku", x: at.x, z: at.z, tx: at.x, tz: at.z, move: "screen" });
      return null;
    }
    if (!h || h.dead >= 0) return "Use that ashore.";
    if (id === "tonic") {
      if (h.hp >= h.maxHp) return "You're already at full health.";
      s.items.tonic--;
      h.hp = Math.min(h.maxHp, h.hp + 60);
      this.sim.events.push({ k: "itemUsed", item: id });
      return null;
    }
    // A powder bomb, thrown where you're looking.
    s.items.bomb--;
    const aim = this.sim.input.aimYaw;
    let tx = h.x + Math.cos(aim) * 150;
    let tz = h.z + Math.sin(aim) * 150;
    if (groundHeight(tx, tz) === null) {
      tx = h.x + Math.cos(aim) * 60;
      tz = h.z + Math.sin(aim) * 60;
    }
    this.explode(tx, tz, 70, 80, true);
    this.sim.events.push({ k: "itemUsed", item: id });
    return null;
  }

  // ---------------------------------------------------------------- the Stretch Fruit on foot

  private launch: { dir: number; t: number; speed: number; hit: Set<number> } | null = null;
  private flurry: { t: number; tick: number } | null = null;

  private stretchFx(h: Walker, move: StretchMove, tx: number, tz: number) {
    this.sim.events.push({ k: "power", fruit: "gomu", x: h.x, z: h.z, tx, tz, move, awake: this.sim.awakened });
  }

  private footStretch(h: Walker) {
    if (this.launch || this.flurry) return;
    const m = this.sim.takeMove();
    if (!m) return;
    const aw = this.sim.awakened;
    const aim = this.sim.input.aimYaw;
    const cx = Math.cos(aim);
    const cz = Math.sin(aim);
    h.heading = aim;
    h.swing = 0;
    switch (m) {
      case "punch": {
        const reach = aw ? 300 : 140;
        this.stretchFx(h, m, h.x + cx * reach, h.z + cz * reach);
        const t = this.nearestInFront(h, reach + 10, 0.85);
        if (t) this.damageWalker(t, aw ? 400 : 75, true);
        if (aw && t) this.explode(t.x, t.z, 90, 150, true);
        break;
      }
      case "sling":
        // Arms stretch back, then you fly.
        this.stretchFx(h, m, h.x - cx * 45, h.z - cz * 45);
        this.launch = { dir: aim, t: aw ? 0.45 : 0.3, speed: aw ? 1300 : 900, hit: new Set() };
        break;
      case "grab": {
        const reach = aw ? 340 : 170;
        const t = this.nearestInFront(h, reach, 0.6);
        if (!t) {
          this.stretchFx(h, m, h.x + cx * reach, h.z + cz * reach);
          this.sim.moveCd.grab = 1;
          break;
        }
        this.stretchFx(h, m, t.x, t.z);
        // Swing them round through everyone near you...
        for (const w of this.walkers) {
          if (w === t || w.dead >= 0) continue;
          if (Math.hypot(w.x - h.x, w.z - h.z) < (aw ? 150 : 80)) this.damageWalker(w, aw ? 200 : 40, true);
        }
        this.damageWalker(t, aw ? 350 : 60, true);
        // ...then hurl them.
        const dist = aw ? 300 : 140;
        const nx = h.x + cx * dist;
        const nz = h.z + cz * dist;
        if (groundHeight(nx, nz) !== null) {
          t.x = nx;
          t.z = nz;
        }
        this.explode(t.x, t.z, aw ? 120 : 45, aw ? 220 : 40, true);
        break;
      }
      case "bounce":
        this.sim.bounceUntil = this.sim.time + (aw ? 15 : 6);
        this.stretchFx(h, m, h.x, h.z);
        break;
      case "flurry":
        this.flurry = { t: aw ? 3 : 1.5, tick: 0 };
        break;
    }
  }

  /** Slingshot Launch in flight. Returns true while you're flying. */
  private updateLaunch(h: Walker, dt: number) {
    const L = this.launch;
    if (!L) return false;
    const aw = this.sim.awakened;
    const nx = h.x + Math.cos(L.dir) * L.speed * dt;
    const nz = h.z + Math.sin(L.dir) * L.speed * dt;
    // Stop at the shore rather than flying into the sea.
    if (groundHeight(nx, nz) === null) L.t = 0;
    else {
      const ox = h.x;
      const oz = h.z;
      h.x = nx;
      h.z = nz;
      this.collide(h);
      // Hit a wall: slam down right there.
      if (Math.hypot(h.x - ox, h.z - oz) < L.speed * dt * 0.3) L.t = 0;
    }
    h.heading = L.dir;
    h.moving = true;
    for (const w of this.walkers) {
      if (w.dead >= 0 || L.hit.has(w.id) || Math.hypot(w.x - h.x, w.z - h.z) > (aw ? 40 : 24)) continue;
      L.hit.add(w.id);
      this.damageWalker(w, aw ? 150 : 35, true);
    }
    L.t -= dt;
    if (L.t <= 0) {
      this.launch = null;
      this.explode(h.x, h.z, aw ? 160 : 55, aw ? 250 : 50, true);
    }
    return true;
  }

  /** Spinning Punch Flurry: a storm of fists. */
  private updateFlurry(h: Walker, dt: number) {
    const f = this.flurry;
    if (!f) return;
    const aw = this.sim.awakened;
    f.t -= dt;
    f.tick -= dt;
    if (f.tick <= 0) {
      f.tick = 0.08;
      const aim = this.sim.input.aimYaw;
      h.heading = aim;
      h.swing = 0;
      const reach = aw ? 230 : 110;
      for (const w of this.walkers) {
        if (w.dead >= 0) continue;
        const dx = w.x - h.x;
        const dz = w.z - h.z;
        const d = Math.hypot(dx, dz);
        if (d > reach || d < 1) continue;
        if (!aw && (dx * Math.cos(aim) + dz * Math.sin(aim)) / d < 0.5) continue;
        this.damageWalker(w, aw ? 30 : 9, true);
      }
      // Fists everywhere (all the way round when awakened).
      const a = aw ? Math.random() * Math.PI * 2 : aim + (Math.random() - 0.5) * 1.1;
      const r = reach * (0.6 + Math.random() * 0.4);
      this.stretchFx(h, "flurry", h.x + Math.cos(a) * r, h.z + Math.sin(a) * r);
    }
    if (f.t <= 0) this.flurry = null;
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
    const hp = kind === "captain" ? 190 : kind === "marine" ? 70 : kind === "tribal" ? 80 : kind === "bandit" ? 55 : PLAYER_FOOT_HP;
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
        // A Vault Warden, until you've taken their key.
        if (isl.warden && !this.sim.save.vaultKeys.includes(isl.index)) {
          const w = this.makeWalker("captain", isl.index, isl.warden.x, isl.warden.z, "cutlass");
          w.warden = true;
          w.hp = w.maxHp = WARDEN_HP;
          this.walkers.push(w);
        }
        // The fortress: elite captains on top of the guards.
        if (isl.kind === "fortress") {
          for (const b of isl.buildings) {
            for (let i = 0; i < 2; i++) {
              const a = Math.random() * Math.PI * 2;
              this.walkers.push(this.makeWalker("captain", isl.index, b.door.x + Math.cos(a) * 40, b.door.z + Math.sin(a) * 40, i ? "musket" : "cutlass"));
            }
          }
        }
        if (isl.kind === "town" && this.sim.stars >= 3) {
          const b = isl.buildings[0];
          this.walkers.push(this.makeWalker("captain", isl.index, b.door.x, b.door.z, "cutlass"));
        }
        for (const b of isl.bandits) {
          const tribe = isl.kind === "tribe";
          this.walkers.push(this.makeWalker(tribe ? "tribal" : "bandit", isl.index, b.x, b.z, tribe ? (Math.random() < 0.5 ? "axe" : "rapier") : Math.random() < 0.3 ? "flintlock" : "cutlass"));
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
      if (outlaw(w.kind)) hostile = d < 260 || (alerted && d < 600);
      // The fortress and the Vault Wardens don't wait for a pirate to be wanted (a Marine is one of their own).
      else if (this.sim.save.side === "marine") hostile = (this.sim.heat > 0 || alerted) && d < 420;
      else if (ISLANDS[w.island]?.kind === "fortress") hostile = d < 520;
      else if (w.warden) hostile = d < 260 || ((this.sim.heat > 0 || alerted) && d < 420);
      else hostile = (this.sim.heat > 0 || alerted) && d < 420;
    }
    if (hostile && w.kind !== "bandit") this.sim.seenByMarines();

    const wpn = WEAPONS[w.weapon];
    let goalX = w.home.x;
    let goalZ = w.home.z;
    let speed = WALK * 0.55;
    if (hostile) {
      w.engaged = t;
      // Whoever's closest: you, or one of your crew.
      let tgt: Walker = h;
      let td = d;
      for (const a of this.allies) {
        if (a.dead >= 0) continue;
        const ad = Math.hypot(a.x - w.x, a.z - w.z);
        if (ad < td) {
          td = ad;
          tgt = a;
        }
      }
      if (tgt !== h) return this.fightAlly(w, tgt, td, dt);
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
          const dmg = w.kind === "captain" ? 18 : w.kind === "tribal" ? 10 : w.kind === "bandit" ? 7 : 8;
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

  /** An enemy fighting one of your crew. */
  private fightAlly(w: Walker, a: Walker, d: number, dt: number) {
    const wpn = WEAPONS[w.weapon];
    w.heading = Math.atan2(a.z - w.z, a.x - w.x);
    if (wpn.kind === "gun") {
      if (d < wpn.range * 0.9 && w.cooldown <= 0) {
        w.cooldown = wpn.cooldown + rand(0.8, 1.6);
        w.swing = 0;
        this.fireGun(w, w.weapon, w.heading, false);
      }
      this.walkToward(w, a.x - Math.cos(w.heading) * 160, a.z - Math.sin(w.heading) * 160, WALK * 0.9, dt);
      return;
    }
    if (d < wpn.range + 10 && w.cooldown <= 0) {
      w.cooldown = wpn.cooldown + rand(0.9, 1.6);
      w.swing = 0;
      this.sim.events.push({ k: "swing", x: w.x, z: w.z, byHero: false });
      this.damageWalker(a, w.kind === "captain" ? 18 : 9, false);
    }
    this.walkToward(w, a.x, a.z, WALK * 0.9, dt);
  }

  /** Step a walker toward a point, staying on land and out of buildings. */
  private walkToward(w: Walker, x: number, z: number, speed: number, dt: number) {
    const gx = x - w.x;
    const gz = z - w.z;
    const gd = Math.hypot(gx, gz);
    w.moving = gd > 12;
    if (w.moving) {
      const step = Math.min(gd, speed * dt);
      const nx = w.x + (gx / gd) * step;
      const nz = w.z + (gz / gd) * step;
      // Stay on dry land (but anyone already in the shallows can wade out).
      if (groundHeight(nx, nz) !== null || groundHeight(w.x, w.z) === null) {
        w.x = nx;
        w.z = nz;
      }
    }
    this.collide(w);
    w.y = groundHeight(w.x, w.z) ?? w.y;
  }

  /**
   * One of your crew ashore: stick close to you, and wade into any fight
   * near you (anyone who's fighting you or them, and bandits).
   */
  private allyThink(a: Walker, h: Walker, dt: number) {
    const t = this.sim.time;
    // You're in a store: they wait outside.
    if (this.inside || h.dead >= 0) {
      a.moving = false;
      return;
    }
    let foe: Walker | null = null;
    let best = ALLY_REACH;
    for (const w of this.walkers) {
      if (w.dead >= 0) continue;
      const fighting = (w.engaged !== undefined && t - w.engaged < 4) || outlaw(w.kind);
      if (!fighting) continue;
      const d = Math.hypot(w.x - a.x, w.z - a.z);
      if (d < best && Math.hypot(w.x - h.x, w.z - h.z) < ALLY_REACH * 1.5) {
        best = d;
        foe = w;
      }
    }
    if (foe) {
      a.heading = Math.atan2(foe.z - a.z, foe.x - a.x);
      if (best < 26 && a.cooldown <= 0) {
        a.cooldown = 0.9 + Math.random() * 0.4;
        a.swing = 0;
        this.sim.events.push({ k: "swing", x: a.x, z: a.z, byHero: false });
        // They fight for you: their blows count as yours.
        this.damageWalker(foe, 14, true);
      }
      this.walkToward(a, foe.x, foe.z, SPRINT * 0.85, dt);
      return;
    }
    // Follow you, spread out around you.
    const i = this.allies.indexOf(a);
    const ang = h.heading + Math.PI + (i - (this.allies.length - 1) / 2) * 0.55;
    const fx = h.x + Math.cos(ang) * 30;
    const fz = h.z + Math.sin(ang) * 30;
    const d = Math.hypot(fx - a.x, fz - a.z);
    // Left far behind (you jumped or swam off): catch up.
    if (d > 500 && groundHeight(fx, fz) !== null) {
      a.x = fx;
      a.z = fz;
    }
    a.island = h.island;
    if (d > 14) a.heading = Math.atan2(fz - a.z, fx - a.x);
    this.walkToward(a, fx, fz, d > 90 ? SPRINT : WALK * 1.05, dt);
  }

  /** Something exploding on the ground (a volcanic bomb): hurts you and anyone near. */
  blast(x: number, z: number, radius: number, damage: number) {
    if (!this.hero) return;
    this.explode(x, z, radius, damage, false);
  }

  /** Search a body: coins, shot, maybe their weapon or something to eat. */
  private lootBody(w: Walker) {
    const s = this.sim.save;
    w.looted = true;
    w.sinkAt = w.dead + 1;
    const gold = w.kind === "captain" ? randInt(40, 90) : outlaw(w.kind) ? randInt(15, 45) : randInt(8, 25);
    s.gold += gold;
    const gun = WEAPONS[w.weapon].kind === "gun";
    const ammo = gun ? randInt(1, 4) : 0;
    s.ammo += ammo;
    let weapon: WeaponId | null = null;
    if (w.weapon !== "fists" && !s.weapons.includes(w.weapon) && Math.random() < 0.15) {
      weapon = w.weapon;
      s.weapons.push(w.weapon);
    }
    if (Math.random() < 0.3) s.food.push({ food: "biscuit", spoils: s.playTime + 30 * 60 });
    if (Math.random() < 0.1) s.items[Math.random() < 0.5 ? "tonic" : "bomb"]++;
    this.sim.events.push({ k: "loot", x: w.x, z: w.z, gold, weapon, wood: 0, iron: 0, powder: 0, ammo, kind: "body" });
  }

  // ---------------------------------------------------------------- looting and robbing

  /** What pressing E would do right now, on foot. */
  prompt(): Prompt | null {
    const h = this.hero;
    if (!h || h.dead >= 0) return null;
    // In a store: walk back to the door to leave; anywhere else, shop.
    if (this.inside) {
      const b = this.insideBuilding!;
      const ax = doorAxis(b);
      const dx = b.x + Math.cos(ax.angle) * (ax.depth / 2 - 8);
      const dz = b.z + Math.sin(ax.angle) * (ax.depth / 2 - 8);
      const name = STORE_NAMES[this.inside.kind];
      if (Math.hypot(h.x - dx, h.z - dz) < 11) return { key: "leave", label: `Leave the ${name}`, hold: 0, run: () => this.leaveStore() };
      const at = this.inside;
      return {
        key: "counter",
        label: "Shop at the counter (in VR, point at the board)",
        hold: 0,
        run: () => this.sim.events.push({ k: "service", building: at.kind, island: at.island, index: at.index }),
      };
    }
    if (this.canBoard()) return { key: "board", label: "Board your ship", hold: 0, run: () => this.board() };
    const isl = ISLANDS[h.island];
    // Your island's signpost: buy it, or run it.
    if (isl === HOME_ISLAND) {
      const sign = homeLayout().sign;
      if (Math.hypot(sign.x - h.x, sign.z - h.z) < 26) {
        const owned = this.sim.save.home.owned;
        return {
          key: "homesign",
          label: owned ? "Your island: build, collect and use the vault" : `This island is for sale: buy it for ${HOME_PRICE.toLocaleString("en-US")} gold`,
          hold: 0,
          run: () => this.sim.events.push({ k: "homeSign" }),
        };
      }
    }
    for (const w of this.walkers) {
      if (w.dead < 0.6 || w.looted || w.dead > BODY_TIME || Math.hypot(w.x - h.x, w.z - h.z) > 20) continue;
      return { key: `body${w.id}`, label: "Search the body", hold: 1, run: () => this.lootBody(w) };
    }
    // The quest giver, unless you're nearer a door.
    const nearDoor = isl.buildings.some((b) => Math.hypot(b.door.x - h.x, b.door.z - h.z) < Math.hypot((isl.questGiver?.x ?? 1e9) - h.x, (isl.questGiver?.z ?? 1e9) - h.z));
    if (isl.questGiver && !nearDoor && Math.hypot(isl.questGiver.x - h.x, isl.questGiver.z - h.z) < 22) {
      const name = giverName(isl.index);
      const q = this.sim.save.quest;
      const label = !q ? `Talk to ${name} (quest)` : q.giver === isl.index && q.kind === "bring" ? `Hand over to ${name}` : `Talk to ${name}`;
      return { key: `quest${isl.index}`, label, hold: 0, run: () => this.sim.events.push({ k: "questGiver", island: isl.index }) };
    }
    const t = this.sim.time;
    for (const s of isl.spots) {
      if ((this.spentUntil.get(s.id) ?? 0) > t) continue;
      if (s.kind === "fruit" && !this.unfoundFruit()) continue;
      if (Math.hypot(s.x - h.x, s.z - h.z) > 26) continue;
      const label = { chest: "Open the chest", crate: "Search the supply crate", buried: "Dig up the treasure", fruit: "Take the strange fruit" }[s.kind];
      const hold = { chest: 1.5, crate: 1, buried: 3.5, fruit: 0 }[s.kind];
      return { key: s.id, label, hold, run: () => this.lootSpot(s) };
    }
    // Every building can be robbed; the shops you visit are robbed by holding E instead of tapping it.
    for (let i = 0; i < isl.buildings.length; i++) {
      const b = isl.buildings[i];
      if (Math.hypot(b.door.x - h.x, b.door.z - h.z) > DOOR_REACH) continue;
      const key = `b${isl.index}:${i}`;
      const robbed = (this.spentUntil.get(key) ?? 0) > t;
      const rob = { key, label: ROB[b.kind].label, hold: ROB[b.kind].hold, run: () => this.rob(isl, b, key) };
      // The vault: sealed until you hold all three Warden keys.
      if (b.kind === "vault") {
        const s = this.sim.save;
        if (s.trueName) return { key: "vaultdone", label: "The vault stands empty. You know the fruit's real name now.", hold: 0, run: () => {} };
        if (s.vaultKeys.length < 3) {
          return {
            key: "vaultlocked",
            label: `The vault is sealed: it needs 3 Vault Warden keys (you have ${s.vaultKeys.length})`,
            hold: 0,
            run: () => {},
          };
        }
        return { ...rob, vault: true };
      }
      if (b.kind === "shipwright" || b.kind === "blacksmith" || b.kind === "market" || b.kind === "shop" || (b.kind === "tavern" && isl.haven)) {
        const kind = b.kind as ServiceKind;
        const visit = {
          shipwright: "Visit the Shipwright (upgrades and bigger ships)",
          blacksmith: "Visit the Blacksmith (craft weapons)",
          market: "Visit the Black Market",
          tavern: "Visit the tavern (hire crew, buy food)",
          shop: "Visit the general store (food and supplies)",
        }[kind];
        return {
          key: `svc${i}`,
          label: robbed ? visit : `${visit} · hold to rob`,
          hold: 0,
          run: () => this.sim.events.push({ k: "service", building: kind, island: isl.index, index: i }),
          ...(!robbed && { robAlt: rob }),
        };
      }
      if (robbed) continue;
      return rob;
    }
    return null;
  }

  private updateHold(dt: number) {
    const inp = this.sim.input;
    const p = this.prompt();
    // A shop you can visit or rob: a quick tap visits, holding on robs.
    if (p?.robAlt) {
      if (this.tap.key !== p.key) this.tap = { key: p.key, time: 0 };
      if (inp.interactHeld) {
        this.tap.time += dt;
        if (this.tap.time < ROB_INSTEAD_AFTER) return;
        const r = p.robAlt;
        if (!this.hold || this.hold.key !== r.key) this.hold = { key: r.key, label: r.label, progress: 0, needed: r.hold };
        this.hold.progress += dt;
        if (this.hero) this.alertIsland(this.hero.island);
        if (this.hold.progress >= this.hold.needed) {
          this.hold = null;
          this.tap.time = -Infinity; // don't also visit when you let go
          r.run();
        }
        return;
      }
      if (this.tap.time > 0 && this.tap.time < ROB_INSTEAD_AFTER) p.run();
      this.tap.time = 0;
      this.hold = null;
      return;
    }
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
    // The vault alarm: elite captains storm in every few seconds while you work.
    if (p.vault && this.hero) {
      this.vaultWave -= dt;
      if (this.vaultWave <= 0) {
        this.vaultWave = VAULT_WAVE_EVERY;
        const h = this.hero;
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          const w = this.makeWalker("captain", h.island, h.x + Math.cos(a) * 160, h.z + Math.sin(a) * 160, i === 0 ? "musket" : "cutlass");
          this.walkers.push(w);
        }
        this.sim.addHeat(1);
      }
    }
    if (this.hold.progress >= this.hold.needed) {
      this.hold = null;
      p.run();
    }
  }

  private unfoundFruit(): FruitId | null {
    const s = this.sim.save;
    // The Stretch Fruit isn't buried anywhere: one pirate brig carries it.
    const left = FRUIT_IDS.filter((f) => f !== "gomu" && !s.fruitsFound.includes(f));
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

  private lootSpot(s: LootSpot, smashed = false) {
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
    this.sim.events.push({ k: "loot", x: s.x, z: s.z, gold, weapon, ...mats, ammo, smashed, spot: s.id, kind: s.kind });
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
    switch (b.kind) {
      case "bank":
        gold = randInt(700, 1300);
        this.sim.addBounty(35_000_000, gold, 2);
        break;
      case "shop":
        gold = randInt(120, 240);
        mats = this.giveMaterials([1, 3], [1, 2], [0, 2]);
        ammo = randInt(3, 6);
        this.sim.addBounty(6_000_000, gold, 0.8);
        break;
      case "armory":
        weapon = this.giveWeapon(1);
        mats = this.giveMaterials([0, 2], [2, 5], [3, 6]);
        ammo = randInt(10, 16);
        this.sim.addBounty(12_000_000, 0, 1.3);
        break;
      case "house":
        // Someone's savings under the bed, and whatever's in the shed.
        gold = randInt(30, 90);
        mats = this.giveMaterials([1, 2], [0, 1], [0, 1]);
        ammo = randInt(1, 3);
        this.sim.addBounty(1_500_000, gold, 0.4);
        break;
      case "tavern":
        gold = randInt(100, 220);
        ammo = randInt(2, 5);
        weapon = this.giveWeapon(0.25);
        this.sim.addBounty(4_000_000, gold, 0.7);
        break;
      case "shipwright":
        gold = randInt(150, 300);
        mats = this.giveMaterials([6, 12], [1, 3], [0, 1]);
        this.sim.addBounty(8_000_000, gold, 1);
        break;
      case "blacksmith":
        weapon = this.giveWeapon(1);
        mats = this.giveMaterials([0, 1], [4, 8], [1, 2]);
        ammo = randInt(6, 12);
        this.sim.addBounty(9_000_000, 0, 1.1);
        break;
      case "vault": {
        // Inside: a fortune, and the sealed file with the Stretch Fruit's real name.
        gold = randInt(4000, 6000);
        save.trueName = true;
        // If you've never found the fruit, it's in here too.
        if (!save.fruitsFound.includes("gomu")) {
          save.fruitsFound.push("gomu");
          save.heldFruits.push("gomu");
        }
        this.sim.addBounty(500_000_000, gold, 5);
        this.sim.events.push({ k: "vaultOpened" });
        break;
      }
      case "hut":
        // Tribal treasures: shells and gold, smoked fish, sometimes a tonic.
        gold = randInt(40, 110);
        save.food.push({ food: "fish", spoils: save.playTime + 15 * 60 });
        if (Math.random() < 0.3) save.items.tonic++;
        this.sim.addBounty(1_000_000, gold, 0);
        break;
      case "market":
        gold = randInt(250, 450);
        mats = this.giveMaterials([0, 1], [0, 2], [4, 8]);
        this.giveFruit(0.15);
        this.sim.addBounty(10_000_000, gold, 1.2);
        break;
    }
    // The haven doesn't take kindly to it: it isn't safe for you for a while.
    if (isl.kind === "haven") this.sim.havenUnsafeUntil = this.sim.time + HAVEN_ANGRY;
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
