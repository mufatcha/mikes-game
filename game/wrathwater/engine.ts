/** Runs a Wrathwater session: game loop, controls, camera, minimap, autosave. React shows the HUD and menus. */
import { HUNTERS_BY_STARS, UPGRADES, rankFor, shortBerries, upgradeCost, type UpgradeId } from "./data";
import { SeaAudio } from "./audio";
import {
  FRUITS,
  FRUIT_SELL_PRICE,
  MATERIAL_NAMES,
  RECIPES,
  SHOT_RECIPE,
  WEAPONS,
  WEAPON_ORDER,
  type FruitId,
  type MaterialId,
  type WeaponId,
} from "./items";
import { SeaRenderer, type CameraView } from "./render";
import { writeSave, type SaveData } from "./save";
import { Sim, type Side, type SimEvent } from "./sim";
import { HAVEN, HAVEN_SAFE_RADIUS, ISLANDS, WORLD_HALF, type IslandKind, type ServiceKind } from "./world";

const STEP = 1 / 60;
const MOUSE_SENSITIVITY = 0.0026;

export interface CompassMarker {
  label: string;
  kind: IslandKind;
  /** Bearing relative to where the camera faces, radians (0 = straight ahead). */
  bearing: number;
  distance: number;
}

export interface HudState {
  mode: "ship" | "foot";
  captain: string;
  bounty: number;
  rankTitle: string;
  nextRank: { title: string; bounty: number } | null;
  gold: number;
  hp: number;
  maxHp: number;
  heroHp: number;
  heroMaxHp: number;
  sails: number;
  knots: number;
  stars: number;
  hunted: boolean;
  reload: { port: number; starboard: number };
  landing: string | null;
  inHaven: boolean;
  aimSide: Side | null;
  nearStorm: boolean;
  pointerLocked: boolean;
  weapon: { id: WeaponId; name: string; ready: number; ammo: number | null };
  fruit: { id: FruitId; name: string; power: string; ready: number } | null;
  prompt: { label: string; key: string; hold: number; progress: number } | null;
  hidden: boolean;
  compass: { heading: number; markers: CompassMarker[] };
  night: number;
}

export interface Notice {
  id: number;
  text: string;
  tone: "gold" | "bounty" | "danger" | "info";
}

export interface EngineCallbacks {
  onHud(hud: HudState): void;
  onNotice(n: Notice): void;
  /** Your ship went down, or you fell in battle ashore. */
  onSunk(onFoot: boolean): void;
  onKing(): void;
  onPauseRequest(): void;
  /** You walked into one of Blackwater Cove's stores. */
  onService(kind: ServiceKind): void;
  onFruit(fruit: FruitId): void;
  onInventory(): void;
  onHurt(): void;
}

export class WrathwaterEngine {
  readonly sim: Sim;
  private renderer: SeaRenderer;
  private audio = new SeaAudio();
  /** At sea the camera turns with the ship; on foot it's free. */
  private shipYaw = 0;
  private footYaw = 0;
  private pitch = 0.26;
  private shipDistance = 115;
  private footDistance = 55;
  private aimSide: Side | null = null;
  private keys = new Set<string>();
  private mouseLeft = false;
  private mouseRight = false;
  private sails = 0;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private hudTimer = 0;
  private saveTimer = 0;
  private stepTimer = 0;
  private noticeId = 0;
  private lastNoAmmo = -99;
  private cleanup: (() => void) | null = null;
  private downReported = false;

  constructor(
    private container: HTMLElement,
    private minimap: HTMLCanvasElement,
    save: SaveData,
    private cb: EngineCallbacks,
  ) {
    this.sim = new Sim(save);
    this.renderer = new SeaRenderer(container);
    this.attachInput();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.notice(`Welcome aboard, Captain ${save.captain}. Make a name for yourself.`, "info");
    // Handy for poking at the game from the browser console while developing.
    if (process.env.NODE_ENV === "development") {
      Object.assign(window, { wrathwater: this, wrathwaterIslands: ISLANDS });
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.cleanup?.();
    this.save();
    this.audio.dispose();
    this.renderer.dispose();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.keys.clear();
    this.mouseLeft = this.mouseRight = false;
    if (paused) this.releasePointer();
    this.audio.setAmbience(paused ? 0.3 : 1);
  }

  save() {
    writeSave(this.sim.save);
  }

  // ---------------------------------------------------------------- actions from menus

  buyUpgrade(id: UpgradeId) {
    const def = UPGRADES.find((u) => u.id === id)!;
    const level = this.sim.save.upgrades[id];
    if (level >= def.maxLevel) return false;
    const cost = upgradeCost(def, level);
    if (this.sim.save.gold < cost) return false;
    this.sim.save.gold -= cost;
    this.sim.save.upgrades[id] = level + 1;
    this.sim.refreshPlayerStats();
    this.sim.repairPlayer();
    this.afterPurchase();
    return true;
  }

  canCraft(weapon: WeaponId) {
    const r = RECIPES.find((x) => x.weapon === weapon);
    const s = this.sim.save;
    if (!r || s.weapons.includes(weapon) || s.gold < r.gold) return false;
    return (Object.keys(r.materials) as MaterialId[]).every((m) => s.materials[m] >= (r.materials[m] ?? 0));
  }

  craft(weapon: WeaponId) {
    if (!this.canCraft(weapon)) return false;
    const r = RECIPES.find((x) => x.weapon === weapon)!;
    const s = this.sim.save;
    s.gold -= r.gold;
    for (const m of Object.keys(r.materials) as MaterialId[]) s.materials[m] -= r.materials[m] ?? 0;
    s.weapons.push(weapon);
    this.sim.shore.equip(weapon);
    this.afterPurchase();
    this.notice(`Forged a ${WEAPONS[weapon].name}!`, "gold");
    return true;
  }

  equip(weapon: WeaponId) {
    this.sim.shore.equip(weapon);
    this.pushHud();
  }

  canMakeShot() {
    const m = this.sim.save.materials;
    return (Object.keys(SHOT_RECIPE.materials) as MaterialId[]).every((k) => m[k] >= (SHOT_RECIPE.materials[k] ?? 0));
  }

  /** Turn iron and gunpowder into lead shot for your guns. */
  makeShot() {
    if (!this.canMakeShot()) return false;
    const s = this.sim.save;
    for (const k of Object.keys(SHOT_RECIPE.materials) as MaterialId[]) s.materials[k] -= SHOT_RECIPE.materials[k] ?? 0;
    s.ammo += SHOT_RECIPE.rounds;
    this.afterPurchase();
    return true;
  }

  /** Eat a Devil Fruit you're carrying. A second fruit would kill you, so that's refused. */
  eatFruit(fruit: FruitId) {
    const s = this.sim.save;
    if (s.fruit || !s.heldFruits.includes(fruit)) return false;
    s.heldFruits = s.heldFruits.filter((f) => f !== fruit);
    s.fruit = fruit;
    this.sim.fruitCooldown = 0;
    this.audio.fanfare();
    this.notice(`You ate the ${FRUITS[fruit].name}! Press R to use ${FRUITS[fruit].power}. You can never swim again.`, "bounty");
    this.save();
    return true;
  }

  /** Sell a spare fruit to Blackwater Cove's black market. */
  sellFruit(fruit: FruitId) {
    const s = this.sim.save;
    if (!this.sim.inHaven || !s.heldFruits.includes(fruit)) return false;
    s.heldFruits = s.heldFruits.filter((f) => f !== fruit);
    s.gold += FRUIT_SELL_PRICE;
    this.afterPurchase();
    return true;
  }

  private afterPurchase() {
    this.save();
    this.audio.coin();
    this.pushHud();
  }

  respawn() {
    this.sim.respawnPlayer();
    this.sails = 0;
    this.downReported = false;
    this.save();
    this.notice("Your crew dragged you back to Blackwater Cove. A quarter of your gold is gone.", "danger");
  }

  requestPointer() {
    this.audio.unlock();
    if (document.pointerLockElement !== this.container) void this.container.requestPointerLock?.();
  }

  private releasePointer() {
    if (document.pointerLockElement === this.container) document.exitPointerLock();
  }

  // ---------------------------------------------------------------- loop

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 6) {
        this.acc -= STEP;
        steps++;
        this.applyControls();
        this.sim.step(STEP);
        this.consumeEvents();
      }
      if (steps === 6) this.acc = 0;
      this.footsteps(dt);
    }
    this.renderer.render(this.sim, this.cameraView(), this.paused ? 0 : dt);
    this.drawMinimap();
    this.hudTimer += dt;
    if (this.hudTimer > 0.08) {
      this.hudTimer = 0;
      this.pushHud();
    }
    this.saveTimer += dt;
    if (this.saveTimer > 10) {
      this.saveTimer = 0;
      this.save();
    }
  };

  /** Map angle the camera looks along. */
  private get camYaw() {
    return this.sim.mode === "foot" ? this.footYaw : this.sim.player.heading + this.shipYaw;
  }

  private cameraView(): CameraView {
    const s = Math.sin(this.shipYaw);
    this.aimSide = this.sim.mode === "ship" && Math.abs(s) > 0.45 ? (s > 0 ? 1 : -1) : null;
    return {
      yaw: this.camYaw,
      pitch: this.pitch,
      distance: this.sim.mode === "foot" ? this.footDistance : this.shipDistance,
      aimSide: this.aimSide,
      aiming: this.sim.mode === "foot" && (this.mouseRight || WEAPONS[this.sim.save.equipped].kind === "gun" && this.mouseLeft),
    };
  }

  private applyControls() {
    const k = this.keys;
    const inp = this.sim.input;
    inp.aimYaw = this.camYaw;
    if (this.sim.mode === "ship") {
      let rudder = 0;
      if (k.has("KeyA") || k.has("ArrowLeft")) rudder -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) rudder += 1;
      inp.sails = this.sails;
      inp.rudder = rudder;
      inp.moveX = inp.moveZ = 0;
    } else {
      let fwd = 0;
      let side = 0;
      if (k.has("KeyW") || k.has("ArrowUp")) fwd += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) fwd -= 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) side -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) side += 1;
      const c = Math.cos(this.footYaw);
      const s = Math.sin(this.footYaw);
      inp.moveX = c * fwd - s * side;
      inp.moveZ = s * fwd + c * side;
      inp.sprint = k.has("ShiftLeft") || k.has("ShiftRight");
      inp.attackHeld = this.mouseLeft;
      inp.aiming = this.mouseRight;
      if (this.mouseLeft) inp.attack = true;
    }
    inp.interactHeld = k.has("KeyE");
  }

  private footsteps(dt: number) {
    const h = this.sim.shore.hero;
    if (this.sim.mode !== "foot" || !h || !h.moving || h.dead >= 0) return;
    this.stepTimer += dt;
    const every = h.swimming ? 0.6 : this.sim.input.sprint ? 0.27 : 0.38;
    if (this.stepTimer > every) {
      this.stepTimer = 0;
      if (h.swimming) this.audio.splash(0.25);
      else this.audio.step();
    }
  }

  private consumeEvents() {
    const sim = this.sim;
    const events = sim.events;
    sim.events = [];
    this.renderer.handleEvents(events, sim);
    for (const e of events) this.react(e);
  }

  private react(e: SimEvent) {
    const at = this.sim.mode === "foot" && this.sim.shore.hero ? this.sim.shore.hero : this.sim.player;
    const near = (x: number, z: number) => Math.max(0, 1 - Math.hypot(x - at.x, z - at.z) / 1800);
    switch (e.k) {
      case "fire":
        this.audio.cannon(e.byPlayer ? 0.9 : near(e.x, e.z) * 0.8, e.count);
        break;
      case "hit":
        this.audio.hit(e.onPlayer || e.byPlayer ? 0.7 : near(e.x, e.z) * 0.5);
        if (e.onPlayer) this.cb.onHurt();
        break;
      case "splash":
        this.audio.splash(near(e.x, e.z) * 0.6);
        break;
      case "impact":
        this.audio.hit(near(e.x, e.z) * 0.4);
        break;
      case "explosion":
        this.audio.sink(near(e.x, e.z) * (e.radius > 300 ? 1 : 0.6));
        break;
      case "sunk":
        this.audio.sink(near(e.x, e.z));
        if (e.byPlayer) {
          const gold = e.gold ? ` · +${e.gold} gold` : "";
          this.notice(`Sank a ${e.name}! +${shortBerries(e.bounty)} bounty${gold}`, "bounty");
        }
        break;
      case "crate":
        this.audio.coin();
        this.notice(`Treasure! +${e.gold} gold`, "gold");
        break;
      case "scrape":
        this.notice("Ran aground! Mind the shallows.", "danger");
        break;
      case "rank":
        this.audio.fanfare();
        this.notice(`The world takes notice: you're now a ${e.title}!`, "bounty");
        break;
      case "king":
        this.audio.fanfare();
        this.save();
        this.releasePointer();
        this.cb.onKing();
        break;
      case "stars":
        if (e.stars > e.prev) {
          this.audio.alarm();
          const hunters = HUNTERS_BY_STARS[e.stars].length;
          this.notice(`Wanted level ${"★".repeat(e.stars)}: the Marines send ${hunters} ship${hunters === 1 ? "" : "s"} after you!`, "danger");
        } else if (e.stars === 0) {
          this.notice("You lost the Marines.", "info");
        }
        break;
      case "playerSunk":
      case "heroDown":
        if (!this.downReported) {
          this.downReported = true;
          this.audio.sink(1);
          this.save();
          window.setTimeout(() => {
            this.releasePointer();
            this.cb.onSunk(e.k === "heroDown");
          }, 2600);
        }
        break;
      case "ashore":
        this.footYaw = this.sim.shore.hero?.heading ?? this.footYaw;
        this.save();
        if (e.island === HAVEN.name) {
          this.notice("Docked at Blackwater Cove. The shipwright's crew patched your hull. Walk to the stores, then back to your ship (F) to set sail.", "info");
        } else {
          this.notice(`Docked at ${e.island}. Walk back to your ship and press F to set sail.`, "info");
        }
        break;
      case "service":
        this.releasePointer();
        this.cb.onService(e.building);
        break;
      case "board":
        this.shipYaw = 0;
        break;
      case "swing":
        this.audio.swing(e.byHero ? 0.6 : near(e.x, e.z) * 0.5);
        break;
      case "gunshot":
        this.audio.gun(e.byHero ? 0.7 : near(e.x, e.z) * 0.6, e.weapon === "musket");
        break;
      case "noAmmo":
        this.audio.thud(0.25);
        if (this.sim.time - this.lastNoAmmo > 3) {
          this.lastNoAmmo = this.sim.time;
          this.notice("Out of shot! Loot crates, rob a shop or armory, or make more in the inventory (I).", "danger");
        }
        break;
      case "walkerHit":
        this.audio.thud(near(e.x, e.z) * 0.7);
        break;
      case "walkerDown":
        if (e.bounty) this.notice(`Defeated a ${e.kind === "bandit" ? "bandit" : e.kind === "captain" ? "Marine captain" : "Marine"} · +${shortBerries(e.bounty)}${e.gold ? ` · +${e.gold} gold` : ""}`, "bounty");
        break;
      case "heroHit":
        this.audio.thud(0.5);
        this.cb.onHurt();
        break;
      case "drowning":
        this.notice("You're sinking like a stone! Devil Fruit users can't swim. Get back to land!", "danger");
        break;
      case "power":
        this.audio.power(e.fruit);
        break;
      case "fruitFound":
        this.audio.fanfare();
        this.save();
        this.releasePointer();
        this.cb.onFruit(e.fruit);
        break;
      case "loot": {
        this.audio.coin();
        const parts = this.lootParts(e.gold, e.weapon, e, e.ammo);
        if (parts) this.notice(parts, "gold");
        break;
      }
      case "robbed": {
        this.audio.coin();
        this.audio.alarm();
        const what = { bank: "the bank", shop: "a shop", armory: "the armory" }[e.building as "bank" | "shop" | "armory"] ?? "a building";
        this.notice(`You robbed ${what} in ${e.town}! ${this.lootParts(e.gold, e.weapon, e, e.ammo)}`, "bounty");
        break;
      }
    }
  }

  private lootParts(gold: number, weapon: WeaponId | null, m: Record<MaterialId, number>, ammo: number) {
    const parts: string[] = [];
    if (gold) parts.push(`+${gold} gold`);
    if (ammo) parts.push(`+${ammo} shot`);
    for (const id of ["wood", "iron", "powder"] as MaterialId[]) if (m[id]) parts.push(`+${m[id]} ${MATERIAL_NAMES[id].toLowerCase()}`);
    if (weapon) parts.push(`a ${WEAPONS[weapon].name}!`);
    return parts.join(" · ");
  }

  private notice(text: string, tone: Notice["tone"]) {
    this.cb.onNotice({ id: ++this.noticeId, text, tone });
  }

  private pushHud() {
    const sim = this.sim;
    const p = sim.player;
    const rank = rankFor(sim.save.bounty);
    const hero = sim.shore.hero;
    const at = sim.mode === "foot" && hero ? hero : p;
    const edge = Math.max(Math.abs(at.x), Math.abs(at.z));
    const weaponId = sim.save.equipped;
    const fruit = sim.save.fruit;
    const prompt = sim.mode === "foot" ? sim.shore.prompt() : null;
    const hold = sim.shore.hold;
    const landing = sim.mode === "ship" ? sim.shore.landingIsland() : null;
    const yaw = this.camYaw;
    const markers: CompassMarker[] = ISLANDS.map((i) => {
      let b = Math.atan2(i.z - at.z, i.x - at.x) - yaw;
      while (b > Math.PI) b -= Math.PI * 2;
      while (b < -Math.PI) b += Math.PI * 2;
      return { label: i.name, kind: i.kind, bearing: b, distance: Math.hypot(i.x - at.x, i.z - at.z) - i.radius };
    })
      .filter((m) => m.distance < 3200 && m.distance > -50)
      .sort((a, b) => a.distance - b.distance)
      // Nearest first, skipping any that would overlap one already shown.
      .filter((m, i, all) => all.slice(0, i).every((o) => Math.abs(o.bearing - m.bearing) > 0.32))
      .slice(0, 4);
    this.cb.onHud({
      mode: sim.mode,
      captain: sim.save.captain,
      bounty: sim.save.bounty,
      rankTitle: rank.title,
      nextRank: rank.next,
      gold: sim.save.gold,
      hp: Math.max(0, Math.ceil(p.hp)),
      maxHp: Math.round(p.stats.hull),
      heroHp: hero ? Math.max(0, Math.ceil(hero.hp)) : 0,
      heroMaxHp: hero ? hero.maxHp : 1,
      sails: this.sails,
      knots: Math.round(p.speed / 6),
      stars: sim.stars,
      hunted: sim.ships.some((s) => s.ai.hunter && s.sinking < 0),
      reload: {
        port: 1 - p.reload[-1] / p.stats.reload,
        starboard: 1 - p.reload[1] / p.stats.reload,
      },
      landing: landing ? landing.name : null,
      inHaven: sim.inHaven,
      aimSide: this.aimSide,
      nearStorm: edge > WORLD_HALF - 500,
      pointerLocked: document.pointerLockElement === this.container,
      weapon: {
        id: weaponId,
        name: WEAPONS[weaponId].name,
        ready: hero ? 1 - hero.cooldown / WEAPONS[weaponId].cooldown : 1,
        ammo: WEAPONS[weaponId].kind === "gun" ? sim.save.ammo : null,
      },
      fruit: fruit
        ? { id: fruit, name: FRUITS[fruit].name, power: FRUITS[fruit].power, ready: 1 - sim.fruitCooldown / FRUITS[fruit].cooldown }
        : null,
      prompt: prompt
        ? { label: prompt.label, key: prompt.key, hold: prompt.hold, progress: hold && hold.key === prompt.key ? hold.progress / hold.needed : 0 }
        : null,
      hidden: sim.hidden,
      compass: { heading: yaw, markers },
      night: this.renderer.night,
    });
  }

  // ---------------------------------------------------------------- minimap

  private drawMinimap() {
    const c = this.minimap;
    const size = c.clientWidth;
    if (!size) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(size * dpr)) {
      c.width = Math.round(size * dpr);
      c.height = Math.round(size * dpr);
    }
    const g = c.getContext("2d")!;
    const sim = this.sim;
    const hero = sim.mode === "foot" ? sim.shore.hero : null;
    const me = hero ?? sim.player;
    const R = size / 2;
    const span = hero ? 700 : 2600;
    const k = R / span;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "rgba(6,22,32,0.85)";
    g.fillRect(0, 0, size, size);
    const toMap = (x: number, z: number) => [R + (x - me.x) * k, R + (z - me.z) * k] as const;

    const [hx, hz] = toMap(HAVEN.x, HAVEN.z);
    g.strokeStyle = "rgba(250,204,21,0.35)";
    g.setLineDash([4, 4]);
    g.beginPath();
    g.arc(hx, hz, HAVEN_SAFE_RADIUS * k, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    for (const isl of ISLANDS) {
      const [x, z] = toMap(isl.x, isl.z);
      g.fillStyle = isl.haven ? "#a16207" : isl.kind === "town" ? "#8b7355" : isl.kind === "mystery" ? "#6b4f8a" : "#7c6a48";
      g.beginPath();
      g.arc(x, z, Math.max(2, isl.radius * k), 0, Math.PI * 2);
      g.fill();
      if (hero) {
        for (const b of isl.buildings) {
          const [bx, bz] = toMap(b.x - b.w / 2, b.z - b.d / 2);
          g.fillStyle = b.kind === "bank" ? "#facc15" : b.kind === "armory" ? "#94a3b8" : "#3f3a35";
          g.fillRect(bx, bz, b.w * k, b.d * k);
        }
        for (const s of isl.spots) {
          if ((sim.shore.spentUntil.get(s.id) ?? 0) > sim.time) continue;
          if (s.kind === "fruit" && sim.save.fruitsFound.length >= 5) continue;
          const [sx, sz] = toMap(s.x, s.z);
          g.fillStyle = s.kind === "fruit" ? "#c084fc" : s.kind === "buried" ? "#ef4444" : "#facc15";
          g.fillRect(sx - 2.5, sz - 2.5, 5, 5);
        }
      }
    }
    const [ex0, ez0] = toMap(-WORLD_HALF, -WORLD_HALF);
    g.strokeStyle = "rgba(239,68,68,0.6)";
    g.strokeRect(ex0, ez0, WORLD_HALF * 2 * k, WORLD_HALF * 2 * k);
    if (!hero) {
      for (const cr of sim.crates) {
        const [x, z] = toMap(cr.x, cr.z);
        g.fillStyle = "#facc15";
        g.fillRect(x - 2, z - 2, 4, 4);
      }
    }
    for (const s of sim.ships) {
      if (s.sinking >= 0) continue;
      const [x, z] = toMap(s.x, s.z);
      if (s === sim.player) {
        if (!hero) continue;
        g.fillStyle = "#ffffff";
        g.fillRect(x - 3, z - 3, 6, 6);
        continue;
      }
      g.fillStyle = { merchant: "#e7d7b0", pirate: "#ef4444", marine: "#60a5fa", player: "#fff" }[s.faction];
      g.beginPath();
      g.arc(x, z, 3.2, 0, Math.PI * 2);
      g.fill();
      if (s.ai.hunter) {
        g.strokeStyle = "#f87171";
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, z, 6, 0, Math.PI * 2);
        g.stroke();
      }
    }
    if (hero) {
      for (const w of sim.shore.walkers) {
        if (w.dead >= 0) continue;
        const [x, z] = toMap(w.x, w.z);
        g.fillStyle = w.kind === "bandit" ? "#f97316" : "#60a5fa";
        g.beginPath();
        g.arc(x, z, 2.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();

    g.save();
    g.translate(R, R);
    g.rotate(hero ? hero.heading : sim.player.heading);
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(8, 0);
    g.lineTo(-6, 5);
    g.lineTo(-3, 0);
    g.lineTo(-6, -5);
    g.closePath();
    g.fill();
    g.restore();
    g.strokeStyle = "rgba(255,255,255,0.25)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(R, R, R - 1, 0, Math.PI * 2);
    g.stroke();
  }

  // ---------------------------------------------------------------- input

  private attachInput() {
    const el = this.container;
    const onKeyDown = (e: KeyboardEvent) => {
      if (this.paused) return;
      this.audio.unlock();
      if (e.code === "Escape") {
        this.cb.onPauseRequest();
        return;
      }
      if (e.code === "Tab" || e.code === "KeyI") {
        e.preventDefault();
        if (!e.repeat) {
          this.releasePointer();
          this.cb.onInventory();
        }
        return;
      }
      if (e.repeat) {
        this.keys.add(e.code);
        return;
      }
      const sim = this.sim;
      const foot = sim.mode === "foot";
      if (e.code === "KeyR") sim.input.ability = true;
      else if (e.code === "KeyE") sim.input.interact = true;
      if (!foot) {
        if (e.code === "KeyW" || e.code === "ArrowUp") this.sails = Math.min(3, this.sails + 1);
        else if (e.code === "KeyS" || e.code === "ArrowDown") this.sails = Math.max(0, this.sails - 1);
        else if (e.code === "KeyQ") sim.input.fire = -1;
        else if (e.code === "KeyE") sim.input.fire = 1;
        else if (e.code === "Space") {
          e.preventDefault();
          if (this.aimSide !== null) sim.input.fire = this.aimSide;
        } else if (e.code === "KeyF") {
          if (sim.shore.goAshore()) this.sails = 0;
        } else if (e.code === "KeyC") this.shipYaw = 0;
      } else {
        if (e.code === "KeyF") sim.shore.board();
        else if (e.code === "Space") e.preventDefault();
        else if (e.code.startsWith("Digit")) {
          const w = WEAPON_ORDER[Number(e.code.slice(5)) - 1];
          if (w) this.equip(w);
        } else if (e.code === "KeyQ") {
          const owned = WEAPON_ORDER.filter((w) => w === "fists" || sim.save.weapons.includes(w));
          this.equip(owned[(owned.indexOf(sim.save.equipped) + 1) % owned.length]);
        }
      }
      this.keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== el || this.paused) return;
      const dx = e.movementX * MOUSE_SENSITIVITY;
      if (this.sim.mode === "foot") this.footYaw += dx;
      else {
        this.shipYaw += dx;
        while (this.shipYaw > Math.PI) this.shipYaw -= Math.PI * 2;
        while (this.shipYaw < -Math.PI) this.shipYaw += Math.PI * 2;
      }
      this.pitch = Math.max(-0.15, Math.min(1.25, this.pitch + e.movementY * MOUSE_SENSITIVITY));
    };
    const onMouseDown = (e: MouseEvent) => {
      if (this.paused) return;
      this.audio.unlock();
      if (document.pointerLockElement !== el) {
        this.requestPointer();
        return;
      }
      if (e.button === 0) {
        this.mouseLeft = true;
        if (this.sim.mode === "ship" && this.aimSide !== null) this.sim.input.fire = this.aimSide;
      } else if (e.button === 2) this.mouseRight = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.mouseLeft = false;
      if (e.button === 2) this.mouseRight = false;
    };
    const onWheel = (e: WheelEvent) => {
      const f = e.deltaY > 0 ? 1.1 : 0.9;
      if (this.sim.mode === "foot") this.footDistance = Math.max(25, Math.min(120, this.footDistance * f));
      else this.shipDistance = Math.max(70, Math.min(420, this.shipDistance * f));
    };
    const onLockChange = () => {
      if (document.pointerLockElement !== el && !this.paused && !this.downReported) this.cb.onPauseRequest();
      this.pushHud();
    };
    const onBlur = () => {
      this.keys.clear();
      this.mouseLeft = this.mouseRight = false;
    };
    const onResize = () => this.renderer.resize();
    const onContext = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onResize);
    document.addEventListener("pointerlockchange", onLockChange);
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("contextmenu", onContext);
    this.cleanup = () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerlockchange", onLockChange);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContext);
      this.releasePointer();
    };
  }
}
