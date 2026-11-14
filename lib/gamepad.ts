/**
 * Shared game-controller state between the game and the menus: one
 * controller drives either the match or the menu highlight, never both.
 */

/** A VR headset's hand controller (they point at the page themselves; they're not a game controller). */
export function isVrController(pad: Gamepad) {
  return pad.mapping === "xr-standard" || /oculus|meta|quest|touch|openxr|vive|index|knuckles|pico|wmr|mixed reality/i.test(pad.id);
}

/** The first connected game controller (an Xbox, PlayStation or similar pad), if any. */
export function connectedPad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  return [...navigator.getGamepads()].find((p): p is Gamepad => !!p && p.connected && !isVrController(p)) ?? null;
}

/** Every connected VR hand controller. */
export function vrControllers(): Gamepad[] {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return [];
  return [...navigator.getGamepads()].filter((p): p is Gamepad => !!p && p.connected && isVrController(p));
}

/** Whether a button is held (triggers count once pressed about halfway). */
export function padDown(pad: Gamepad, index: number) {
  const b = pad.buttons[index];
  return !!b && (b.pressed || b.value > 0.4);
}

const state = {
  /** A match is on screen with no menu open: the controller is playing, not navigating menus. */
  gameplay: false,
  /** Settings is waiting for a button to remap: nothing else should react. */
  capturing: false,
};

export function setPadGameplay(on: boolean) {
  state.gameplay = on;
}

export function padInGameplay() {
  return state.gameplay;
}

export function setPadCapturing(on: boolean) {
  state.capturing = on;
}

export function padCapturing() {
  return state.capturing;
}

/** Fired on window when B is pressed in a menu; the open menu closes (or goes back). */
export const PAD_BACK_EVENT = "pad-back";

/** Fired on window when ☰ is pressed on a VR controller while browsing the site: open Settings. */
export const OPEN_SETTINGS_EVENT = "open-settings";
