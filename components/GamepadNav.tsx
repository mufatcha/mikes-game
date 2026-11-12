"use client";

import { useEffect } from "react";
import { PAD_BACK_EVENT, connectedPad, padCapturing, padDown, padInGameplay } from "@/lib/gamepad";

/**
 * Menus on a game controller: whenever a match isn't being played (the title
 * screen, the lobby, an in-game menu), the D-pad or left stick moves a
 * highlight to the nearest button in that direction, A presses it and B
 * closes the open menu. On a slider, left and right change its value.
 */

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
type Dir = "up" | "down" | "left" | "right";

let marked: HTMLElement | null = null;

function current(): HTMLElement | null {
  return marked && document.contains(marked) ? marked : null;
}

function clearMark() {
  marked?.removeAttribute("data-pad-focus");
  marked = null;
}

function mark(el: HTMLElement) {
  marked?.removeAttribute("data-pad-focus");
  marked = el;
  el.setAttribute("data-pad-focus", "");
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** Everything you can move to: inside the open menu if there is one, otherwise the whole page. */
function candidates(): HTMLElement[] {
  const menus = document.querySelectorAll<HTMLElement>("[data-modal]");
  const root = menus.length ? menus[menus.length - 1] : document.body;
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  });
}

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** Move the highlight to the nearest thing in that direction (or to the first thing, to start). */
function move(dir: Dir) {
  const list = candidates();
  if (list.length === 0) return;
  const cur = current();
  if (!cur || !list.includes(cur)) {
    mark(list[0]);
    return;
  }
  const c = center(cur.getBoundingClientRect());
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const p = center(el.getBoundingClientRect());
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const along = dir === "right" ? dx : dir === "left" ? -dx : dir === "down" ? dy : -dy;
    const across = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    if (along <= 4) continue;
    // Prefer things straight ahead over things off to the side.
    const score = along + across * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) mark(best);
}

const valueSetter = Object.getOwnPropertyDescriptor(
  typeof HTMLInputElement === "undefined" ? Object.prototype : HTMLInputElement.prototype,
  "value",
)?.set;

/** Nudge a slider one step, telling React about it like a real drag would. */
function nudge(el: HTMLInputElement, by: 1 | -1) {
  const step = Number(el.step) || 1;
  const min = el.min === "" ? 0 : Number(el.min);
  const max = el.max === "" ? 100 : Number(el.max);
  const next = Math.max(min, Math.min(max, Number(el.value) + by * step));
  valueSetter?.call(el, String(Math.round(next * 1000) / 1000));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function step(dir: Dir) {
  const cur = current();
  if (cur instanceof HTMLInputElement && cur.type === "range" && (dir === "left" || dir === "right")) {
    nudge(cur, dir === "right" ? 1 : -1);
    return;
  }
  move(dir);
}

/** A: press the highlighted button (or start highlighting). */
function activate() {
  const cur = current();
  if (!cur) {
    move("down");
    return;
  }
  if (cur instanceof HTMLInputElement && cur.type !== "checkbox" && cur.type !== "radio" && cur.type !== "range") {
    cur.focus();
    return;
  }
  cur.click();
}

export default function GamepadNav() {
  useEffect(() => {
    let raf = 0;
    let prev: boolean[] = [];
    let held: Dir | null = null;
    let nextRepeat = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const pad = connectedPad();
      if (!pad) {
        prev = [];
        return;
      }
      const down = (i: number) => padDown(pad, i);
      const pressed = (i: number) => down(i) && !prev[i];
      if (padInGameplay() || padCapturing()) {
        // The controller is playing (or being remapped): leave it alone, and drop the highlight.
        held = null;
        if (padInGameplay()) clearMark();
      } else {
        const ax = pad.axes[0] ?? 0;
        const ay = pad.axes[1] ?? 0;
        const dir: Dir | null =
          down(12) || ay < -0.55 ? "up" : down(13) || ay > 0.55 ? "down" : down(14) || ax < -0.55 ? "left" : down(15) || ax > 0.55 ? "right" : null;
        // One step on press, then repeat while held.
        if (dir !== held) {
          held = dir;
          nextRepeat = now + 380;
          if (dir) step(dir);
        } else if (dir && now >= nextRepeat) {
          nextRepeat = now + 120;
          step(dir);
        }
        if (pressed(0)) activate();
        if (pressed(1)) window.dispatchEvent(new Event(PAD_BACK_EVENT));
      }
      prev = pad.buttons.map((_, i) => down(i));
    };
    raf = requestAnimationFrame(tick);
    // Using the mouse hides the controller highlight.
    const onMouse = () => clearMark();
    window.addEventListener("mousedown", onMouse);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousedown", onMouse);
    };
  }, []);
  return null;
}
