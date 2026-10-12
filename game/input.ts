import { ABILITY_ACTIONS, getKeybinds } from "@/lib/settings";
import type { InputFrame } from "@/shared/protocol";
import { CHEAT_CODE } from "@/shared/pranks";
import { MAX_PITCH } from "@/shared/constants";

export interface InputHandlers {
  onMenu(): void;
  onLoadout(): void;
  onActivity(): void;
  /** One of the Principal's ability keys, by index in ABILITIES. */
  onAbility(index: number): void;
  /** The super key. */
  onSuper(): void;
  /** The secret cheat code was typed. */
  onCheatCode(): void;
}

/** Keyboard and mouse state, sampled once per fixed simulation step. */
export class InputController {
  mouseX = 0;
  mouseY = 0;
  scoreboard = false;

  private keys = new Set<string>();
  private firing = false;
  private reloadQueued = false;
  private swapTo = -1;
  private swapToggle = false;
  private enabled = true;
  /** The last few letters typed, for spotting the cheat code. */
  private typed = "";
  private cleanup: (() => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private handlers: InputHandlers,
  ) {
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  attach() {
    const onKeyDown = (e: KeyboardEvent) => {
      this.handlers.onActivity();
      // Watch for the cheat code in the letters you type, by key position (so it's always the W/A/S/D keys).
      if (!e.repeat && e.code.startsWith("Key")) {
        this.typed = (this.typed + e.code.slice(3).toLowerCase()).slice(-CHEAT_CODE.length);
        if (this.typed === CHEAT_CODE) {
          this.typed = "";
          this.handlers.onCheatCode();
        }
      }
      if (e.code === "Escape") {
        this.handlers.onMenu();
        return;
      }
      if (!this.enabled) return;
      const binds = getKeybinds();
      if (Object.values(binds).includes(e.code)) e.preventDefault();
      if (e.code === binds.scoreboard) {
        this.scoreboard = true;
        return;
      }
      if (e.repeat) return;
      if (e.code === binds.reload) this.reloadQueued = true;
      else if (e.code === binds.weapon1) this.swapTo = 0;
      else if (e.code === binds.weapon2) this.swapTo = 1;
      else if (e.code === binds.swap) this.swapToggle = true;
      else if (e.code === binds.super) {
        this.handlers.onSuper();
        return;
      } else if (e.code === binds.loadout) {
        this.handlers.onLoadout();
        return;
      } else {
        const ability = ABILITY_ACTIONS.findIndex((a) => binds[a] === e.code);
        if (ability >= 0) {
          this.handlers.onAbility(ability);
          return;
        }
      }
      this.keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === getKeybinds().scoreboard) this.scoreboard = false;
      this.keys.delete(e.code);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (this.fpsMode && this.pointerLocked) {
        if (this.enabled) {
          this.yaw += e.movementX * this.sensitivity;
          this.lookUp(-e.movementY * this.sensitivity);
        }
        return;
      }
      const r = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    };
    const onMouseDown = (e: MouseEvent) => {
      this.handlers.onActivity();
      // First person: the first click grabs the mouse instead of throwing.
      if (this.fpsMode && !this.pointerLocked) {
        if (this.enabled) this.canvas.requestPointerLock?.();
        return;
      }
      if (this.enabled && e.button === 0) this.firing = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.firing = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (this.enabled && Math.abs(e.deltaY) > 0) this.swapToggle = true;
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onBlur = () => this.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onBlur);
    this.canvas.addEventListener("mousedown", onMouseDown);
    this.canvas.addEventListener("wheel", onWheel, { passive: true });
    this.canvas.addEventListener("contextmenu", onContextMenu);

    this.cleanup = () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
      this.canvas.removeEventListener("mousedown", onMouseDown);
      this.canvas.removeEventListener("wheel", onWheel);
      this.canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }

  detach() {
    this.cleanup?.();
    this.cleanup = null;
  }

  // ------------------------------------------------------------ first person

  /** First-person mode: the mouse turns you, and movement keys are relative to where you face. */
  fpsMode = false;
  /** Facing angle in first person, in radians. */
  yaw = 0;
  /** Looking up (positive) or down in first person, in radians. */
  pitch = 0;
  /** Mouse turn speed, radians per pixel of mouse movement. */
  sensitivity = 0.0025;

  private lookUp(by: number) {
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + by));
  }

  /** Look around in first person with the touch aim stick (sideways turns, up and down tilts), once per frame. */
  updateFps(dt: number) {
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw)); // keep it in -π..π
    if (this.touchAim === null) return;
    this.yaw += Math.cos(this.touchAim) * 2.6 * dt;
    this.lookUp(-Math.sin(this.touchAim) * 1.4 * dt);
  }

  /** Turn movement relative to where you face into a world direction. */
  private toWorld(strafe: number, forward: number): [number, number] {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return [forward * c - strafe * s, forward * s + strafe * c];
  }

  private get pointerLocked() {
    return typeof document !== "undefined" && document.pointerLockElement === this.canvas;
  }

  // ------------------------------------------------------------ touch

  /** Set while a touch screen is in use; turns on the thumbsticks and turns off the crosshair. */
  touchMode = false;
  private touchMove = { x: 0, y: 0 };
  private touchAim: number | null = null;
  private touchFiring = false;
  private lastTouchAim = 0;
  private pulse = false;

  /** Left thumbstick, each axis from -1 to 1. */
  setTouchMove(x: number, y: number) {
    this.touchMode = true;
    this.touchMove = { x, y };
  }

  /** Right thumbstick: the aim angle (null when released) and whether it's pushed far enough to throw. */
  setTouchAim(angle: number | null, firing: boolean) {
    this.touchMode = true;
    this.touchAim = angle;
    if (angle !== null) this.lastTouchAim = angle;
    this.touchFiring = angle !== null && firing;
  }

  /** Touch buttons for jump (held), and sprint and crouch (toggles). */
  touchJump = false;
  touchSprint = false;
  touchCrouch = false;

  /** Let go of both thumbsticks, e.g. when the touch controls are turned off. */
  releaseTouch() {
    this.touchMove = { x: 0, y: 0 };
    this.touchAim = null;
    this.touchFiring = false;
    this.touchJump = false;
  }

  reload() {
    if (this.enabled) this.reloadQueued = true;
  }

  switchWeapon() {
    if (this.enabled) this.swapToggle = true;
  }

  /**
   * Aim on a touch screen: the right stick if it's held, otherwise the way
   * you're walking, otherwise wherever you last aimed.
   */
  touchAimAngle() {
    if (this.touchAim !== null) return this.touchAim;
    const { x, y } = this.touchMove;
    if (Math.hypot(x, y) > 0.3) this.lastTouchAim = Math.atan2(y, x);
    return this.lastTouchAim;
  }

  /** Build the next input frame, consuming one-shot actions like reload. */
  frame(aim: number, currentSlot: number, autoWeapon = true): Omit<InputFrame, "seq"> {
    const k = this.keys;
    const b = getKeybinds();
    let mx = 0;
    let my = 0;
    // Arrow keys always move too, unless they've been bound to something else.
    const held = (code: string, arrow: string) => k.has(code) || (k.has(arrow) && !Object.values(b).includes(arrow));
    if (held(b.up, "ArrowUp")) my -= 1;
    if (held(b.down, "ArrowDown")) my += 1;
    if (held(b.left, "ArrowLeft")) mx -= 1;
    if (held(b.right, "ArrowRight")) mx += 1;
    if (this.enabled) {
      mx = Math.max(-1, Math.min(1, mx + Math.round(this.touchMove.x * 100) / 100));
      my = Math.max(-1, Math.min(1, my + Math.round(this.touchMove.y * 100) / 100));
      // First person: up/down are forward/back and left/right strafe, relative to where you face.
      if (this.fpsMode) [mx, my] = this.toWorld(mx, -my).map((v) => Math.round(v * 100) / 100) as [number, number];
    }

    // Holding the aim stick keeps throwing. Semi-auto throws need a fresh
    // press for each shot, so pulse the trigger for those.
    this.pulse = !this.pulse;
    const touchFire = this.touchFiring && (autoWeapon || this.pulse);

    let swap = this.swapTo;
    if (this.swapToggle) swap = currentSlot === 0 ? 1 : 0;
    // Held moves, from the keyboard or the touch buttons; only sent while held.
    const jump = this.enabled && (k.has(b.jump) || this.touchJump);
    const sprint = this.enabled && (k.has(b.sprint) || this.touchSprint);
    const crouch = this.enabled && (k.has(b.crouch) || this.touchCrouch);
    const frame = {
      mx,
      my,
      aim: Math.round(aim * 1000) / 1000,
      ...(this.fpsMode && { pitch: Math.round(this.pitch * 1000) / 1000 }),
      ...(jump && { jump }),
      ...(sprint && { sprint }),
      ...(crouch && { crouch }),
      fire: this.enabled && (this.firing || touchFire),
      reload: this.reloadQueued,
      swap,
    };
    this.reloadQueued = false;
    this.swapTo = -1;
    this.swapToggle = false;
    return frame;
  }

  private clear() {
    this.keys.clear();
    this.firing = false;
    this.scoreboard = false;
    this.releaseTouch();
  }
}
