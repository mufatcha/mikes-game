/**
 * Shared game-controller state between the game and the menus: one
 * controller drives either the match or the menu highlight, never both.
 */

/** The first connected controller, if any. */
export function connectedPad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  return [...navigator.getGamepads()].find((p): p is Gamepad => !!p && p.connected) ?? null;
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
