import type { InputFrame } from "@/shared/protocol";

export interface InputHandlers {
  onMenu(): void;
  onLoadout(): void;
  onActivity(): void;
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
      if (e.code === "Escape") {
        this.handlers.onMenu();
        return;
      }
      if (!this.enabled) return;
      if (e.code === "Tab") {
        e.preventDefault();
        this.scoreboard = true;
        return;
      }
      if (e.repeat) return;
      if (e.code === "KeyR") this.reloadQueued = true;
      else if (e.code === "Digit1") this.swapTo = 0;
      else if (e.code === "Digit2") this.swapTo = 1;
      else if (e.code === "KeyQ") this.swapToggle = true;
      else if (e.code === "KeyB") {
        this.handlers.onLoadout();
        return;
      }
      this.keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Tab") this.scoreboard = false;
      this.keys.delete(e.code);
    };
    const onMouseMove = (e: MouseEvent) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    };
    const onMouseDown = (e: MouseEvent) => {
      this.handlers.onActivity();
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

  /** Build the next input frame, consuming one-shot actions like reload. */
  frame(aim: number, currentSlot: number): Omit<InputFrame, "seq"> {
    const k = this.keys;
    let mx = 0;
    let my = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) my -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) my += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;

    let swap = this.swapTo;
    if (this.swapToggle) swap = currentSlot === 0 ? 1 : 0;
    const frame = {
      mx,
      my,
      aim: Math.round(aim * 1000) / 1000,
      fire: this.enabled && this.firing,
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
  }
}
