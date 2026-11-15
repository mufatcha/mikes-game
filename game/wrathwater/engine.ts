/** Runs a Wrathwater session: game loop, controls, camera, minimap, autosave. React shows the HUD and menus. */
import * as THREE from "three";
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
  STRETCH,
  STRETCH_MOVES,
  fruitInfo,
  type FruitId,
  type MaterialId,
  type WeaponId,
} from "./items";
import { SeaRenderer, type CameraView } from "./render";
import { LEVER_IN, LEVER_LENGTH, LEVER_OUT, WHEEL_LOCK, helmLayout } from "./models";
import { connectedPad, padDown } from "@/lib/gamepad";
import { writeSave, type SaveData } from "./save";
import { AWAKEN_COOLDOWN, AWAKEN_TIME, Sim, type Side, type SimEvent } from "./sim";
import { FORTRESS, FORTRESS_NAME, HAVEN, HAVEN_SAFE_RADIUS, ISLANDS, WORLD_HALF, type IslandKind, type ServiceKind } from "./world";

const STEP = 1 / 60;
const MOUSE_SENSITIVITY = 0.0026;
/** Thumbstick look speed, radians per second at full tilt. */
const STICK_LOOK = 2.8;
const VIEW_KEY = "ww.view";

/** Game actions any controller can trigger: keyboard, gamepad, touch buttons or VR hands. */
export type Action =
  | "power"
  | "switchMove"
  | "awaken"
  | "interact"
  | "board"
  | "inventory"
  | "pause"
  | "weaponNext"
  | "weaponPrev"
  | "fireLook"
  | "firePort"
  | "fireStarboard"
  | "sailsUp"
  | "sailsDown"
  | "view";

/** A VR hand holding the wheel (and the angle it was at last frame), or a sail lever. */
type HelmGrab = { kind: "wheel"; last: number } | { kind: "lever"; i: number };

/** Held buttons from touch, gamepad or VR. */
interface Held {
  attack: boolean;
  aim: boolean;
  interact: boolean;
  sprint: boolean;
}
const NO_HELD: Held = { attack: false, aim: false, interact: false, sprint: false };

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
  /** Seen through your own eyes (P switches). */
  firstPerson: boolean;
  /** Playing with a controller, touch or VR, so no mouse capture is needed. */
  noMouse: boolean;
  inVr: boolean;
  weapon: { id: WeaponId; name: string; ready: number; ammo: number | null };
  fruit: {
    id: FruitId;
    name: string;
    power: string;
    ready: number;
    /** The Stretch Fruit's moves (T switches, R uses the selected one). */
    moves?: { name: string; ready: number; selected: boolean }[];
    bouncing?: boolean;
  } | null;
  /** The Kill Order Fruit's awakened form, once you know its real name. */
  awaken: { active: number; ready: number } | null;
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

/** Typing this (W W S S A D A D) opens the cheat menu. */
const CHEAT_CODE = ["KeyW", "KeyW", "KeyS", "KeyS", "KeyA", "KeyD", "KeyA", "KeyD"];
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
  /** W W S S A D A D was typed: open the cheat menu. */
  onCheatMenu(): void;
  onHurt(): void;
  /** You opened the vault and read the fruit's real name. */
  onTrueName(): void;
}

export class WrathwaterEngine {
  readonly sim: Sim;
  private renderer: SeaRenderer;
  private audio = new SeaAudio();
  /** At sea the camera turns with the ship; on foot it's free. */
  private shipYaw = 0;
  private footYaw = 0;
  private pitch = 0.26;
  private shipDistance = 240;
  /** The last few keys pressed, to spot the cheat code. */
  private typed: string[] = [];
  private footDistance = 55;
  private aimSide: Side | null = null;
  private keys = new Set<string>();
  /** First person by default; P switches to the camera behind you. */
  firstPerson = true;
  /** What you last played with. Only the mouse needs capturing. */
  private inputMode: "mouse" | "touch" | "pad" | "vr" = "mouse";
  /** Touch controls: the move stick (x right, y forward), and held buttons. */
  private touchMove = { x: 0, y: 0 };
  private touchHeld: Held = { ...NO_HELD };
  /** Gamepad state, read every frame. */
  private padMove = { x: 0, y: 0 };
  private padHeld: Held = { ...NO_HELD };
  private padPrev: boolean[] = [];
  private padSprint = false;
  private padStickY = 0;
  /** VR: turning with the right stick, and the hands' buttons last frame. */
  private vrTurn = 0;
  private vrPrev: { left: boolean[]; right: boolean[] } = { left: [], right: [] };
  private vrSnapped = false;
  private vrHudTimer = 0;
  private lastHud: HudState | null = null;
  private lastNotice = "";
  /** Your ship's wheel angle (radians) and the three sail levers: angle, and whether each is pulled out. */
  private helmWheel = 0;
  private leverAngle = [LEVER_IN, LEVER_IN, LEVER_IN];
  private leverOut = [false, false, false];
  /** VR: what each hand is holding at the helm. */
  private vrGrab: { left: HelmGrab | null; right: HelmGrab | null } = { left: null, right: null };
  private vrSqueeze = { left: false, right: false };
  private mouseLeft = false;
  private mouseRight = false;
  private sails = 0;
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
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v) this.firstPerson = v !== "third";
    } catch {
      // Storage blocked: first person.
    }
    this.last = performance.now();
    // The renderer runs the loop, so it keeps going inside a VR headset.
    this.renderer.setLoop(this.frame);
    this.notice(`Welcome aboard, Captain ${save.captain}. Make a name for yourself.`, "info");
    // Handy for poking at the game from the browser console while developing.
    if (process.env.NODE_ENV === "development") {
      Object.assign(window, { wrathwater: this, wrathwaterIslands: ISLANDS });
    }
  }

  dispose() {
    this.renderer.setLoop(null);
    this.renderer.endVr();
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

  // ---------------------------------------------------------------- cheats (W W S S A D A D)

  /** +1,000 gold, +50 shot and +20 of every material. */
  cheatSupplies() {
    const s = this.sim.save;
    s.gold += 1000;
    s.ammo += 50;
    for (const m of Object.keys(s.materials) as MaterialId[]) s.materials[m] += 20;
    this.notice("Cheat: +1,000 gold, +50 shot and +20 of every material.", "gold");
    this.save();
  }

  /** Every weapon, and every fruit to carry. */
  cheatArmory() {
    const s = this.sim.save;
    s.weapons = WEAPON_ORDER.filter((w) => w !== "fists");
    for (const f of Object.keys(FRUITS) as FruitId[]) {
      if (!s.fruitsFound.includes(f)) s.fruitsFound.push(f);
      if (!s.heldFruits.includes(f) && s.fruit !== f) s.heldFruits.push(f);
    }
    this.notice("Cheat: every weapon unlocked, and every fruit in your bag.", "gold");
    this.save();
  }

  /** No more wanted stars. */
  cheatClearWanted() {
    this.sim.clearWanted();
    this.notice("Cheat: the Marines have forgotten all about you.", "info");
  }

  /** +50,000,000 bounty, to climb the ranks. */
  cheatBounty() {
    this.sim.addBounty(50_000_000, 0, 0);
    this.notice("Cheat: +50,000,000 bounty.", "bounty");
    this.save();
  }

  /** All three Vault Warden keys, so the vault at the fortress will open. */
  cheatVaultKeys() {
    const towns = ISLANDS.filter((i) => i.warden).map((i) => i.index);
    this.sim.save.vaultKeys = [...new Set([...this.sim.save.vaultKeys, ...towns])];
    this.notice(`Cheat: all 3 Vault Warden keys. The vault is at ${FORTRESS_NAME}, far to the southeast.`, "bounty");
    this.save();
  }

  /** Learn the Stretch Fruit's real name (and get the fruit) without cracking the vault. */
  cheatTrueName() {
    const s = this.sim.save;
    s.trueName = true;
    if (!s.fruitsFound.includes("gomu")) {
      s.fruitsFound.push("gomu");
      s.heldFruits.push("gomu");
    }
    this.save();
    this.releasePointer();
    this.cb.onTrueName();
  }

  /** Nothing can hurt you or your ship (press again to turn it off). Returns whether it's on. */
  cheatGod() {
    this.sim.god = !this.sim.god;
    this.notice(this.sim.god ? "Cheat: God mode on. Nothing can hurt you." : "Cheat: God mode off.", "info");
    return this.sim.god;
  }

  get godMode() {
    return this.sim.god;
  }

  /** Every ship upgrade at its top level, and the hull fully repaired. */
  cheatShip() {
    const s = this.sim.save;
    for (const u of UPGRADES) s.upgrades[u.id] = u.maxLevel;
    this.sim.refreshPlayerStats();
    this.sim.repairPlayer();
    this.notice("Cheat: your ship is fully upgraded and repaired.", "gold");
    this.save();
  }

  /** Sail straight to an island. */
  cheatTravel(index: number) {
    const isl = ISLANDS[index];
    if (!isl) return;
    this.sim.sailTo(index);
    this.notice(`Cheat: you're off the coast of ${isl.name}.`, "info");
  }

  /** The islands you can sail to, for the cheat menu. */
  get islandList() {
    return ISLANDS.map((i) => ({ index: i.index, name: i.name, kind: i.kind }));
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
    const info = fruitInfo(fruit, s.trueName);
    this.notice(`You ate the ${info.name}! Press R to use ${info.power}. You can never swim again.`, "bounty");
    if (fruit === "gomu") this.notice("Five moves: press T to switch, R to use.", "info");
    if (this.sim.canAwaken) this.notice("Its true power is yours: press V to awaken it.", "bounty");
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
    if (this.inputMode !== "mouse" || this.renderer.inVr || document.pointerLockElement === this.container) return;
    try {
      const r = this.container.requestPointerLock?.() as Promise<void> | undefined;
      r?.catch?.(() => {});
    } catch {
      // No mouse capture here (phones): the touch controls look around instead.
    }
  }

  private releasePointer() {
    if (document.pointerLockElement === this.container) document.exitPointerLock();
  }

  // ---------------------------------------------------------------- loop

  private frame = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.pollPad(dt);
    this.pollVr();
    this.updateHelm(dt);
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
    this.vrHudTimer += dt;
    if (this.renderer.inVr && this.vrHudTimer > 0.2) {
      this.vrHudTimer = 0;
      this.drawVrHud();
    }
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
      aiming: this.sim.mode === "foot" && (this.mouseRight || this.anyHeld("aim") || (WEAPONS[this.sim.save.equipped].kind === "gun" && this.mouseLeft)),
      firstPerson: this.firstPerson,
      vrYaw: (this.sim.mode === "ship" ? this.sim.player.heading : 0) + this.vrTurn,
      helm: { wheel: this.helmWheel, levers: this.leverAngle },
    };
  }

  private applyControls() {
    const k = this.keys;
    const inp = this.sim.input;
    inp.aimYaw = this.camYaw;
    if (this.sim.mode === "ship") {
      let rudder = this.touchMove.x + this.padMove.x;
      if (k.has("KeyA") || k.has("ArrowLeft")) rudder -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) rudder += 1;
      // In VR you steer with your hands on the wheel: it stays where you leave it.
      if (this.renderer.inVr) rudder = this.helmWheel / WHEEL_LOCK;
      inp.sails = this.sails;
      inp.rudder = Math.max(-1, Math.min(1, rudder));
      inp.moveX = inp.moveZ = 0;
    } else {
      let fwd = this.touchMove.y + this.padMove.y;
      let side = this.touchMove.x + this.padMove.x;
      if (k.has("KeyW") || k.has("ArrowUp")) fwd += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) fwd -= 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) side -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) side += 1;
      const c = Math.cos(this.footYaw);
      const s = Math.sin(this.footYaw);
      inp.moveX = c * fwd - s * side;
      inp.moveZ = s * fwd + c * side;
      const len = Math.hypot(inp.moveX, inp.moveZ);
      if (len > 1) {
        inp.moveX /= len;
        inp.moveZ /= len;
      }
      inp.sprint = k.has("ShiftLeft") || k.has("ShiftRight") || this.anyHeld("sprint");
      inp.attackHeld = this.mouseLeft || this.anyHeld("attack");
      inp.aiming = this.mouseRight || this.anyHeld("aim");
      if (inp.attackHeld) inp.attack = true;
    }
    inp.interactHeld = k.has("KeyE") || this.anyHeld("interact");
    inp.firstPerson = this.firstPerson || this.renderer.inVr;
  }

  private anyHeld(b: keyof Held) {
    return this.touchHeld[b] || this.padHeld[b];
  }

  // ---------------------------------------------------------------- actions (keyboard, gamepad, touch, VR)

  /** Do one game action, the same way its key would. */
  press(a: Action) {
    if (this.paused && a !== "pause") return;
    const sim = this.sim;
    const foot = sim.mode === "foot";
    this.audio.unlock();
    switch (a) {
      case "power":
        sim.input.ability = true;
        break;
      case "switchMove":
        if (sim.save.fruit === "gomu") sim.cycleMove();
        else this.press("weaponNext");
        break;
      case "awaken":
        if (!sim.awaken() && sim.canAwaken && !sim.awakened) this.notice("The awakening is still resting.", "info");
        break;
      case "interact":
        sim.input.interact = true;
        break;
      case "board":
        if (foot) sim.shore.board();
        else if (sim.shore.goAshore()) this.sails = 0;
        break;
      case "inventory":
        this.releasePointer();
        this.cb.onInventory();
        break;
      case "pause":
        this.cb.onPauseRequest();
        break;
      case "weaponNext":
      case "weaponPrev": {
        if (!foot) break;
        const owned = WEAPON_ORDER.filter((w) => w === "fists" || sim.save.weapons.includes(w));
        const step = a === "weaponNext" ? 1 : owned.length - 1;
        this.equip(owned[(owned.indexOf(sim.save.equipped) + step) % owned.length]);
        break;
      }
      case "fireLook":
        if (!foot && this.aimSide !== null) sim.input.fire = this.aimSide;
        break;
      case "firePort":
        if (!foot) sim.input.fire = -1;
        break;
      case "fireStarboard":
        if (!foot) sim.input.fire = 1;
        break;
      case "sailsUp":
        if (!foot) this.sails = Math.min(3, this.sails + 1);
        break;
      case "sailsDown":
        if (!foot) this.sails = Math.max(0, this.sails - 1);
        break;
      case "view":
        this.toggleView();
        break;
    }
  }

  /** P: first person or the camera behind you. */
  toggleView() {
    this.firstPerson = !this.firstPerson;
    this.pitch = this.firstPerson ? Math.min(this.pitch, 0.5) : Math.max(0.1, this.pitch);
    try {
      localStorage.setItem(VIEW_KEY, this.firstPerson ? "first" : "third");
    } catch {
      // Not saved.
    }
    this.notice(this.firstPerson ? "First person." : "Third person.", "info");
    this.pushHud();
  }

  /** Turn the view by an amount (mouse, touch drag or stick). */
  look(dx: number, dy: number) {
    if (this.sim.mode === "foot") this.footYaw += dx;
    else {
      this.shipYaw += dx;
      while (this.shipYaw > Math.PI) this.shipYaw -= Math.PI * 2;
      while (this.shipYaw < -Math.PI) this.shipYaw += Math.PI * 2;
    }
    const lo = this.firstPerson ? -1.2 : -0.15;
    this.pitch = Math.max(lo, Math.min(this.firstPerson ? 1.3 : 1.25, this.pitch + dy));
  }

  // ---------------------------------------------------------------- touch

  /** Phones and tablets: the on-screen controls call these. */
  useTouch() {
    if (this.inputMode !== "touch") {
      this.inputMode = "touch";
      this.pushHud();
    }
  }
  setTouchMove(x: number, y: number) {
    this.useTouch();
    this.touchMove = { x, y };
  }
  setTouchHeld(b: keyof Held, on: boolean) {
    this.useTouch();
    this.touchHeld[b] = on;
    if (b === "attack" && on && this.sim.mode === "ship") this.press("fireLook");
  }
  touchLook(dxPixels: number, dyPixels: number) {
    this.useTouch();
    if (!this.paused) this.look(dxPixels * 0.006, dyPixels * 0.006);
  }

  // ---------------------------------------------------------------- gamepad

  /**
   * An Xbox / PlayStation style controller. Left stick moves (or steers, and
   * pushes the sails up and down), right stick looks. RT attacks or fires the
   * side you're looking at, LT aims. A: use / hold to rob. B: go ashore or
   * board. X: Devil Fruit power. Y: switch Stretch move. LB / RB: switch
   * weapon (fire port / starboard at sea). D-pad left: awaken. Left stick
   * click: sprint. Right stick click: first / third person. Start: pause.
   * Back / View: inventory.
   */
  private pollPad(dt: number) {
    const pad = connectedPad();
    if (!pad) {
      this.padPrev = [];
      this.padMove = { x: 0, y: 0 };
      this.padHeld = { ...NO_HELD };
      return;
    }
    const down = (i: number) => padDown(pad, i);
    const pressed = (i: number) => down(i) && !this.padPrev[i];
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const lx = dz(pad.axes[0] ?? 0);
    const ly = dz(pad.axes[1] ?? 0);
    const rx = dz(pad.axes[2] ?? 0);
    const ry = dz(pad.axes[3] ?? 0);
    const any = pad.buttons.some((b) => b.pressed) || Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0;
    if (any && this.inputMode !== "pad" && !this.renderer.inVr) {
      this.inputMode = "pad";
      this.pushHud();
    }
    if (pressed(9)) this.press("pause");
    if (this.paused) {
      // Menus are driven by the site's own controller navigation.
      this.padPrev = pad.buttons.map((b) => b.pressed || b.value > 0.4);
      this.padHeld = { ...NO_HELD };
      this.padMove = { x: 0, y: 0 };
      return;
    }
    const foot = this.sim.mode === "foot";
    if (foot) {
      this.padMove = { x: lx, y: -ly };
      if (pressed(10)) this.padSprint = !this.padSprint;
      if (Math.hypot(lx, ly) < 0.2) this.padSprint = false;
    } else {
      this.padMove = { x: lx, y: 0 };
      this.padSprint = false;
      // Push the stick up or down to raise or lower the sails one step.
      const stepY = ly < -0.7 ? -1 : ly > 0.7 ? 1 : 0;
      if (stepY !== this.padStickY && stepY !== 0) this.press(stepY < 0 ? "sailsUp" : "sailsDown");
      this.padStickY = stepY;
    }
    this.padHeld = { attack: foot && down(7), aim: foot && down(6), interact: foot && down(0), sprint: this.padSprint };
    if (!this.paused && (rx || ry)) this.look(rx * STICK_LOOK * dt, ry * STICK_LOOK * 0.7 * dt);
    if (pressed(0)) this.press("interact");
    if (pressed(1)) this.press("board");
    if (pressed(2)) this.press("power");
    if (pressed(3)) this.press("switchMove");
    if (pressed(14)) this.press("awaken");
    if (pressed(11)) this.press("view");
    if (pressed(8)) this.press("inventory");
    if (pressed(12)) this.press("sailsUp");
    if (pressed(13)) this.press("sailsDown");
    if (foot) {
      if (pressed(4)) this.press("weaponPrev");
      if (pressed(5)) this.press("weaponNext");
      if (pressed(15)) this.press("weaponNext");
    } else {
      if (pressed(7)) this.press("fireLook");
      if (pressed(4)) this.press("firePort");
      if (pressed(5)) this.press("fireStarboard");
    }
    this.padPrev = pad.buttons.map((b) => b.pressed || b.value > 0.4);
  }

  // ---------------------------------------------------------------- VR

  /** Whether this browser can show the game in a VR headset. */
  static async vrAvailable() {
    try {
      return !!navigator.xr && (await navigator.xr.isSessionSupported("immersive-vr"));
    } catch {
      return false;
    }
  }

  get inVr() {
    return this.renderer.inVr;
  }

  /** Put on the headset. Must be called from a click or tap. */
  async enterVr() {
    if (!navigator.xr || this.renderer.inVr) return false;
    try {
      const session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor"] });
      session.addEventListener("end", () => {
        this.renderer.vrEnded();
        this.inputMode = "mouse";
        this.vrPrev = { left: [], right: [] };
        this.pushHud();
      });
      await this.renderer.startVr(session);
      this.audio.unlock();
      this.releasePointer();
      this.inputMode = "vr";
      this.vrTurn = this.sim.mode === "foot" ? this.footYaw : 0;
      this.notice("VR: at the helm, grab the wheel with a grip and turn it, and pull the sail levers on your left toward you. On foot: left stick walks, right stick turns, right trigger attacks. A boards, B uses your fruit, ☰ pauses.", "info");
      this.pushHud();
      return true;
    } catch {
      this.notice("Couldn't start VR on this device.", "danger");
      return false;
    }
  }

  exitVr() {
    this.renderer.endVr();
  }

  /**
   * VR hands (Meta Quest and similar). Left stick: walk (or steer, and push
   * up / down for the sails). Right stick: snap turn. Right trigger: attack
   * (or fire the side you face). Left trigger: aim. Right grip: hold to use
   * or rob. Left grip: sprint. A: go ashore / board. B: Devil Fruit power.
   * X: switch Stretch move (or weapon). Y: awaken. ☰: pause.
   */
  private pollVr() {
    if (!this.renderer.inVr) return;
    const L = this.renderer.vrHand("left");
    const R = this.renderer.vrHand("right");
    const head = this.renderer.vrHeadYaw() ?? this.footYaw;
    // Look where your head looks; aim where your right hand points.
    if (this.sim.mode === "foot") this.footYaw = head;
    else {
      let rel = head - this.sim.player.heading;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      this.shipYaw = rel;
    }
    const lb = L.gamepad?.buttons ?? [];
    const rb = R.gamepad?.buttons ?? [];
    const on = (b: readonly GamepadButton[], i: number) => !!b[i] && (b[i].pressed || b[i].value > 0.5);
    const was = (hand: "left" | "right", i: number) => !!this.vrPrev[hand][i];
    const pressed = (hand: "left" | "right", i: number) => on(hand === "left" ? lb : rb, i) && !was(hand, i);
    const lax = L.gamepad?.axes ?? [];
    const rax = R.gamepad?.axes ?? [];
    const dz = (v: number | undefined) => (!v || Math.abs(v) < 0.2 ? 0 : v);
    const lx = dz(lax[2]);
    const ly = dz(lax[3]);
    const rx = dz(rax[2]);
    // Snap turn.
    if (Math.abs(rx) > 0.7 && !this.vrSnapped) {
      this.vrTurn += Math.sign(rx) * (Math.PI / 6);
      this.vrSnapped = true;
    } else if (Math.abs(rx) < 0.3) this.vrSnapped = false;
    const menu = lb.slice(6).some((b) => b.pressed);
    if (menu && !this.vrPrev.left.slice(6).some(Boolean)) {
      this.exitVr();
      this.press("pause");
    }
    if (!this.paused) {
      const foot = this.sim.mode === "foot";
      if (foot) {
        // Walk relative to where you're looking.
        this.padMove = { x: lx, y: -ly };
        this.padHeld = { attack: on(rb, 0), aim: on(lb, 0), interact: on(rb, 1), sprint: on(lb, 1) };
        if (on(rb, 0) || on(lb, 0)) this.footYaw = R.yaw;
      } else {
        // At the helm you steer with the wheel and set sail with the levers: grab them with a grip.
        this.padMove = { x: 0, y: 0 };
        this.padHeld = { ...NO_HELD };
        this.vrHelm(on(lb, 1), on(rb, 1));
        if (pressed("right", 0)) this.press("fireLook");
      }
      if (pressed("right", 1) && this.sim.mode === "foot") this.press("interact");
      if (pressed("right", 4)) this.press("board");
      if (pressed("right", 5)) this.press("power");
      if (pressed("left", 4)) this.press("switchMove");
      if (pressed("left", 5)) this.press("awaken");
      if (pressed("left", 3)) this.press("inventory");
    }
    this.vrPrev = { left: lb.map((b) => b.pressed || b.value > 0.5), right: rb.map((b) => b.pressed || b.value > 0.5) };
  }

  // ---------------------------------------------------------------- the helm (wheel and sail levers)

  /** Keep the wheel and levers in step with how you're sailing (unless a VR hand is holding them). */
  private updateHelm(dt: number) {
    const vr = this.renderer.inVr && this.sim.mode === "ship";
    if (!vr) {
      // The wheel turns as you steer, and spins back when you let go.
      const want = this.sim.player.rudder * WHEEL_LOCK;
      const step = 5 * dt;
      this.helmWheel += Math.max(-step, Math.min(step, want - this.helmWheel));
      this.vrGrab = { left: null, right: null };
    }
    const count = this.leverOut.filter(Boolean).length;
    // Sails changed some other way (keys, a menu, going ashore): the levers follow.
    if (count !== this.sails) this.leverOut = [0, 1, 2].map((i) => i < this.sails);
    for (let i = 0; i < 3; i++) {
      const held = this.vrGrab.left?.kind === "lever" && this.vrGrab.left.i === i || (this.vrGrab.right?.kind === "lever" && this.vrGrab.right.i === i);
      if (held) continue;
      const want = this.leverOut[i] ? LEVER_OUT : LEVER_IN;
      this.leverAngle[i] += (want - this.leverAngle[i]) * Math.min(1, dt * 10);
    }
  }

  /**
   * VR at the helm: squeeze a grip near the wheel's rim to take hold, turn it
   * like a real wheel, and let go: it stays put. Squeeze near a lever's knob
   * and pull it toward you to let out a set of sails (push it away to take
   * them in). Each lever pulled out is one more set of sails.
   */
  private vrHelm(leftSqueeze: boolean, rightSqueeze: boolean) {
    const lay = helmLayout(this.sim.player.cls);
    for (const hand of ["left", "right"] as const) {
      const squeeze = hand === "left" ? leftSqueeze : rightSqueeze;
      const fresh = squeeze && !this.vrSqueeze[hand];
      this.vrSqueeze[hand] = squeeze;
      const pos = this.renderer.vrHandOnShip(hand, this.sim);
      let g = this.vrGrab[hand];
      if (!squeeze || !pos) {
        if (g?.kind === "lever") {
          // Let go: it snaps to whichever end it's nearer.
          this.leverOut[g.i] = this.leverAngle[g.i] > 0;
          this.sails = this.leverOut.filter(Boolean).length;
          this.renderer.vrBuzz(hand, 0.4, 30);
        }
        this.vrGrab[hand] = null;
        continue;
      }
      const toWheel = pos.clone().sub(lay.wheel);
      const wheelAngle = Math.atan2(toWheel.z, toWheel.y);
      if (!g) {
        if (!fresh) continue;
        const radial = Math.hypot(toWheel.y, toWheel.z);
        // The nearest lever knob within reach wins; otherwise the wheel's rim (or a spoke handle).
        let best = 3;
        lay.levers.forEach((pivot, i) => {
          const a = this.leverAngle[i];
          const knob = pivot.clone().add(new THREE.Vector3(-Math.sin(a), Math.cos(a), 0).multiplyScalar(LEVER_LENGTH));
          const d = knob.distanceTo(pos);
          if (d < best) {
            best = d;
            g = { kind: "lever", i };
          }
        });
        if (!g && Math.abs(toWheel.x) < 3 && radial > lay.wheelRadius - 2.5 && radial < lay.wheelRadius + 3) g = { kind: "wheel", last: wheelAngle };
        if (!g) continue;
        this.vrGrab[hand] = g;
        this.renderer.vrBuzz(hand, 0.6, 40);
      }
      if (g.kind === "wheel") {
        let da = wheelAngle - g.last;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const before = this.helmWheel;
        this.helmWheel = Math.max(-WHEEL_LOCK, Math.min(WHEEL_LOCK, this.helmWheel + da));
        g.last = wheelAngle;
        // A click every eighth of a turn, and a thump at hard over.
        const notch = (a: number) => Math.round(a / (Math.PI / 4));
        if (notch(before) !== notch(this.helmWheel)) this.renderer.vrBuzz(hand, 0.25, 15);
        if (Math.abs(this.helmWheel) === WHEEL_LOCK && Math.abs(before) !== WHEEL_LOCK) this.renderer.vrBuzz(hand, 0.9, 60);
      } else {
        const pivot = lay.levers[g.i];
        const d = pos.clone().sub(pivot);
        const a = Math.max(LEVER_IN, Math.min(LEVER_OUT, Math.atan2(-d.x, Math.max(0.5, d.y))));
        const was = this.leverAngle[g.i] > 0;
        this.leverAngle[g.i] = a;
        // Sails go out (or in) as soon as the lever passes the middle.
        if (a > 0 !== was) {
          this.leverOut[g.i] = a > 0;
          this.sails = this.leverOut.filter(Boolean).length;
          this.renderer.vrBuzz(hand, 0.7, 50);
        }
      }
    }
  }

  /** The wrist screen in VR. */
  private drawVrHud() {
    const h = this.lastHud;
    if (!h) return;
    const lines: { text: string; color?: string; size?: number }[] = [];
    lines.push({ text: `Captain ${h.captain} · ${h.rankTitle}`, color: "#fca5a5", size: 26 });
    lines.push({ text: `Bounty ${shortBerries(h.bounty)} · ${h.gold.toLocaleString("en-US")} gold`, color: "#fcd34d" });
    lines.push({ text: h.mode === "foot" ? `Health ${h.heroHp}/${h.heroMaxHp}` : `Hull ${h.hp}/${h.maxHp} · sails ${h.sails}/3`, color: "#86efac" });
    lines.push({ text: h.stars > 0 ? `Wanted ${"★".repeat(h.stars)}` : "Not wanted", color: h.stars > 0 ? "#f87171" : "#a1a1aa" });
    if (h.fruit) lines.push({ text: `${h.fruit.power}${h.fruit.ready >= 0.999 ? " · ready" : ""}`, color: h.fruit.ready >= 0.999 ? "#e9d5ff" : "#71717a", size: 26 });
    if (h.prompt) lines.push({ text: `${h.prompt.label}${h.prompt.progress > 0 ? ` ${Math.round(h.prompt.progress * 100)}%` : ""}`, color: "#ffffff", size: 24 });
    else if (h.landing) lines.push({ text: `A: dock at ${h.landing}`, color: "#ffffff", size: 24 });
    if (this.lastNotice) lines.push({ text: this.lastNotice, color: "#d4d4d8", size: 20 });
    this.renderer.drawVrHud(lines);
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
      case "vaultKey":
        this.audio.fanfare();
        this.save();
        this.notice(
          e.keys >= 3
            ? `All 3 Vault Warden keys! The vault at ${FORTRESS_NAME}, far to the southeast, will open for you now.`
            : `You took a Vault Warden's key (${e.keys} of 3)! It's stamped "${FORTRESS_NAME}", far to the southeast.`,
          "bounty",
        );
        break;
      case "vaultOpened":
        this.audio.fanfare();
        this.save();
        this.releasePointer();
        this.cb.onTrueName();
        break;
      case "awakened":
        this.audio.power("gomu");
        this.notice(
          e.on
            ? `KILL ORDER AWAKENING! The secret form: every move is monstrous for ${AWAKEN_TIME} seconds.`
            : `The secret form fades. It rests for ${AWAKEN_COOLDOWN} seconds.`,
          e.on ? "bounty" : "info",
        );
        break;
      case "carrierSighted":
        this.notice("A pirate brig with an odd purple lantern is on the horizon.", "info");
        break;
      case "switchMove":
        this.audio.step();
        break;
      case "robbed": {
        this.audio.coin();
        this.audio.alarm();
        const what = {
          bank: "the bank",
          shop: "a shop",
          armory: "the armory",
          house: "a house",
          tavern: "the tavern",
          shipwright: "the shipwright",
          blacksmith: "the blacksmith",
          market: "the black market",
          vault: "the vault",
        }[e.building];
        this.notice(`You robbed ${what} in ${e.town}! ${this.lootParts(e.gold, e.weapon, e, e.ammo)}`, "bounty");
        if (this.sim.time < this.sim.havenUnsafeUntil && e.town === HAVEN.name) {
          this.notice("Blackwater Cove isn't safe for you right now. The Marines are coming in.", "danger");
        }
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
    this.lastNotice = text;
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
    const markers: CompassMarker[] = ISLANDS.filter((i) => i !== FORTRESS || sim.fortressKnown).map((i) => {
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
    const hud: HudState = {
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
      firstPerson: this.firstPerson,
      noMouse: this.inputMode !== "mouse",
      inVr: this.renderer.inVr,
      weapon: {
        id: weaponId,
        name: WEAPONS[weaponId].name,
        ready: hero ? 1 - hero.cooldown / WEAPONS[weaponId].cooldown : 1,
        ammo: WEAPONS[weaponId].kind === "gun" ? sim.save.ammo : null,
      },
      fruit: fruit
        ? {
            id: fruit,
            name: fruitInfo(fruit, sim.save.trueName).name,
            power: fruit === "gomu" ? STRETCH[sim.stretchMove].name : fruitInfo(fruit, sim.save.trueName).power,
            ready:
              fruit === "gomu"
                ? sim.moveReady(sim.stretchMove)
                : Math.max(0, 1 - sim.fruitCooldown / (FRUITS[fruit].cooldown * (sim.awakened ? 1 / 3 : 1))),
            moves:
              fruit === "gomu"
                ? STRETCH_MOVES.map((m) => ({ name: STRETCH[m].name, ready: sim.moveReady(m), selected: m === sim.stretchMove }))
                : undefined,
            bouncing: sim.bouncing,
          }
        : null,
      awaken: sim.canAwaken
        ? {
            active: sim.awakened ? (sim.awakenedUntil - sim.time) / AWAKEN_TIME : 0,
            ready: sim.awakened ? 1 : Math.min(1, 1 - (sim.awakenReadyAt - sim.time) / (AWAKEN_TIME + AWAKEN_COOLDOWN)),
          }
        : null,
      prompt: prompt
        ? hold && prompt.robAlt && hold.key === prompt.robAlt.key
          ? { label: hold.label, key: prompt.key, hold: hold.needed, progress: hold.progress / hold.needed }
          : { label: prompt.label, key: prompt.key, hold: prompt.hold, progress: hold && hold.key === prompt.key ? hold.progress / hold.needed : 0 }
        : null,
      hidden: sim.hidden,
      compass: { heading: yaw, markers },
      night: this.renderer.night,
    };
    this.lastHud = hud;
    this.cb.onHud(hud);
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
      if (isl === FORTRESS && !sim.fortressKnown) continue;
      const [x, z] = toMap(isl.x, isl.z);
      g.fillStyle = isl.haven ? "#a16207" : isl.kind === "town" ? "#8b7355" : isl.kind === "mystery" ? "#6b4f8a" : isl.kind === "fortress" ? "#7f1d1d" : "#7c6a48";
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
      // The cheat code: W W S S A D A D (the keys still move you as you type it).
      if (!e.repeat) {
        this.typed = [...this.typed, e.code].slice(-CHEAT_CODE.length);
        if (this.typed.join() === CHEAT_CODE.join()) {
          this.typed = [];
          this.keys.clear();
          this.releasePointer();
          this.cb.onCheatMenu();
          return;
        }
      }
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
      else if (e.code === "KeyT") sim.cycleMove();
      else if (e.code === "KeyP") this.toggleView();
      else if (e.code === "KeyV") {
        if (!sim.awaken() && sim.canAwaken && !sim.awakened) this.notice("The awakening is still resting.", "info");
      }
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
      this.inputMode = "mouse";
      this.look(e.movementX * MOUSE_SENSITIVITY, e.movementY * MOUSE_SENSITIVITY);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (this.paused) return;
      this.audio.unlock();
      if (document.pointerLockElement !== el) {
        this.inputMode = "mouse";
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
      else this.shipDistance = Math.max(140, Math.min(800, this.shipDistance * f));
    };
    const onLockChange = () => {
      if (document.pointerLockElement !== el && !this.paused && !this.downReported && this.inputMode === "mouse") this.cb.onPauseRequest();
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
