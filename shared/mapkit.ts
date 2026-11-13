import type { Rect, Wall, WallKind } from "./map";

/**
 * Building blocks for laying out a school map (see map.ts and bigmap.ts):
 * walls with doorway gaps, lockers along hallway walls, and the TARDIS's
 * console room.
 */

/** Wall thickness. */
export const T = 24;
/** Locker depth. */
export const L = 14;

export function split(from: number, to: number, gaps: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cur = from;
  for (const [g1, g2] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g1 > cur) out.push([cur, g1]);
    cur = Math.max(cur, g2);
  }
  if (cur < to) out.push([cur, to]);
  return out;
}

/** Horizontal strip from x1 to x2 starting at y, with gaps. */
export function stripH(kind: WallKind, x1: number, x2: number, y: number, h: number, gaps: [number, number][]) {
  return split(x1, x2, gaps).map(([a, b]): Wall => ({ x: a, y, w: b - a, h, kind }));
}

/** Vertical strip from y1 to y2 starting at x, with gaps. */
export function stripV(kind: WallKind, y1: number, y2: number, x: number, w: number, gaps: [number, number][]) {
  return split(y1, y2, gaps).map(([a, b]): Wall => ({ x, y: a, w, h: b - a, kind }));
}

export function box(kind: WallKind, x: number, y: number, w: number, h: number): Wall {
  return { x, y, w, h, kind };
}

/** A wall with a row of lockers along its hallway side, broken by doors. */
export function lockerWallH(x1: number, x2: number, y: number, hall: "above" | "below", doors: [number, number][]) {
  return [...stripH("wall", x1, x2, y, T, doors), ...stripH("locker", x1, x2, hall === "below" ? y + T : y - L, L, doors)];
}

export function lockerWallV(y1: number, y2: number, x: number, hall: "left" | "right", doors: [number, number][]) {
  return [...stripV("wall", y1, y2, x, T, doors), ...stripV("locker", y1, y2, hall === "right" ? x + T : x - L, L, doors)];
}

/** The TARDIS console room's wall thickness and half the width of its doors. */
export const TI_WALL = 20;
export const TI_DOOR = 32;

/** The TARDIS's console room, inside `ti`: walls with the doors in the south wall, the console, the time rotor and six struts. */
export function tardisRoom(ti: Rect): Wall[] {
  const doorX = ti.x + ti.w / 2;
  return [
    box("tardiswall", ti.x - TI_WALL, ti.y - TI_WALL, ti.w + TI_WALL * 2, TI_WALL),
    box("tardiswall", ti.x - TI_WALL, ti.y, TI_WALL, ti.h),
    box("tardiswall", ti.x + ti.w, ti.y, TI_WALL, ti.h),
    box("tardiswall", ti.x - TI_WALL, ti.y + ti.h, ti.w / 2 + TI_WALL - TI_DOOR, TI_WALL),
    box("tardisdoor", doorX - TI_DOOR, ti.y + ti.h, TI_DOOR * 2, TI_WALL),
    box("tardiswall", doorX + TI_DOOR, ti.y + ti.h, ti.w / 2 + TI_WALL - TI_DOOR, TI_WALL),
    // The console in the middle, with the time rotor rising out of it.
    box("console", doorX - 35, ti.y + ti.h / 2 - 35, 70, 70),
    box("rotor", doorX - 8, ti.y + ti.h / 2 - 8, 16, 16),
    // Six coral struts around the console, leaving a clear path from the doors.
    ...[0, 60, 120, 180, 240, 300].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return box("strut", doorX + Math.cos(a) * 140 - 6, ti.y + ti.h / 2 + Math.sin(a) * 140 - 6, 12, 12);
    }),
  ];
}
