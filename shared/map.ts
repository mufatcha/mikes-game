import type { ArchetypeId } from "./archetypes";

export type WallKind = "wall" | "desk" | "shelf" | "table" | "bleacher" | "locker" | "easel";

/** How tall each kind of wall or furniture is, in world units. In 3D, throws can fly over the low ones. */
export const WALL_HEIGHT: Record<WallKind, number> = {
  wall: 80,
  locker: 80,
  shelf: 64,
  desk: 22,
  table: 26,
  bleacher: 30,
  easel: 46,
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Wall extends Rect {
  kind: WallKind;
}

export interface Point {
  x: number;
  y: number;
}

export type FloorPattern = "court" | "carpet" | "checker" | "tiles" | "stripes" | "splatter";

/** Furniture drawn on the floor that players walk over (doesn't block). */
export interface Decor extends Rect {
  kind: "bench" | "chair";
}

export interface Room extends Rect {
  name: string;
  floor: string;
  pattern: FloorPattern;
  /** The class that spawns here. Both teams share every room. */
  archetype: ArchetypeId;
  /** Where the room name is painted on the floor, clear of furniture. */
  label: Point;
}

/**
 * One big school: three rooms along the top, three along the bottom, a wide
 * main hall between them, and two cross halls. Every room is shared, so both
 * teams' players of a class spawn in the same place.
 */
export const MAP_WIDTH = 2600;
export const MAP_HEIGHT = 1800;

const T = 24; // wall thickness
const L = 14; // locker depth

function split(from: number, to: number, gaps: [number, number][]): [number, number][] {
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
function stripH(kind: WallKind, x1: number, x2: number, y: number, h: number, gaps: [number, number][]) {
  return split(x1, x2, gaps).map(([a, b]): Wall => ({ x: a, y, w: b - a, h, kind }));
}

/** Vertical strip from y1 to y2 starting at x, with gaps. */
function stripV(kind: WallKind, y1: number, y2: number, x: number, w: number, gaps: [number, number][]) {
  return split(y1, y2, gaps).map(([a, b]): Wall => ({ x, y: a, w, h: b - a, kind }));
}

function box(kind: WallKind, x: number, y: number, w: number, h: number): Wall {
  return { x, y, w, h, kind };
}

/** A wall with a row of lockers along its hallway side, broken by doors. */
function lockerWallH(x1: number, x2: number, y: number, hall: "above" | "below", doors: [number, number][]) {
  return [
    ...stripH("wall", x1, x2, y, T, doors),
    ...stripH("locker", x1, x2, hall === "below" ? y + T : y - L, L, doors),
  ];
}

function lockerWallV(y1: number, y2: number, x: number, hall: "left" | "right", doors: [number, number][]) {
  return [
    ...stripV("wall", y1, y2, x, T, doors),
    ...stripV("locker", y1, y2, hall === "right" ? x + T : x - L, L, doors),
  ];
}

// Cross halls run top to bottom; the main hall runs left to right.
const HALL_A = { x1: 900, x2: 1100 };
const HALL_B = { x1: 1700, x2: 1900 };
const MAIN_HALL = { y1: 700, y2: 1000 };
const TOP_WALL_Y = MAIN_HALL.y1 - T;
const BOTTOM_WALL_Y = MAIN_HALL.y2;

export const ROOMS: Room[] = [
  { name: "Gym", archetype: "jock", x: 0, y: 0, w: 876, h: 676, floor: "#283246", pattern: "court", label: { x: 438, y: 530 } },
  { name: "Library", archetype: "nerd", x: 1124, y: 0, w: 552, h: 676, floor: "#1d2740", pattern: "carpet", label: { x: 1400, y: 620 } },
  { name: "Classroom", archetype: "teacher", x: 1924, y: 0, w: 676, h: 676, floor: "#2a3240", pattern: "checker", label: { x: 2262, y: 570 } },
  { name: "Cafeteria", archetype: "lunchlady", x: 0, y: 1024, w: 876, h: 776, floor: "#323843", pattern: "tiles", label: { x: 438, y: 1265 } },
  { name: "Detention", archetype: "clown", x: 1124, y: 1024, w: 552, h: 776, floor: "#262b35", pattern: "stripes", label: { x: 1400, y: 1460 } },
  { name: "Art Room", archetype: "artkid", x: 1924, y: 1024, w: 676, h: 776, floor: "#25304a", pattern: "splatter", label: { x: 2262, y: 1545 } },
];

/** Street-styled corridors, used for floor markings. */
export const HALLS: Rect[] = [
  { x: 0, y: MAIN_HALL.y1, w: MAP_WIDTH, h: MAIN_HALL.y2 - MAIN_HALL.y1 },
  { x: HALL_A.x1, y: 0, w: HALL_A.x2 - HALL_A.x1, h: MAIN_HALL.y1 },
  { x: HALL_B.x1, y: 0, w: HALL_B.x2 - HALL_B.x1, h: MAIN_HALL.y1 },
  { x: HALL_A.x1, y: MAIN_HALL.y2, w: HALL_A.x2 - HALL_A.x1, h: MAP_HEIGHT - MAIN_HALL.y2 },
  { x: HALL_B.x1, y: MAIN_HALL.y2, w: HALL_B.x2 - HALL_B.x1, h: MAP_HEIGHT - MAIN_HALL.y2 },
];

const CAFETERIA_TABLES = [1130, 1350, 1570].flatMap((y) => [100, 576].map((x) => ({ x, y })));
export type School = "blueberries" | "orangepeels";

/** Cafeteria tables painted with a rival school's logo and name: Blueberries on the left, Orange Peels on the right. */
export const SCHOOL_TABLES = CAFETERIA_TABLES.map(({ x, y }) => ({
  x,
  y,
  w: 200,
  h: 50,
  school: (x < 300 ? "blueberries" : "orangepeels") as School,
}));
const CLASS_DESKS = [220, 330, 440].flatMap((y) => [2000, 2130, 2260, 2390, 2520].map((x) => ({ x, y })));
const DETENTION_DESKS = [1150, 1350, 1550].flatMap((y) => [1200, 1550].map((x) => ({ x, y })));

export const WALLS: Wall[] = [
  // Gym
  ...lockerWallV(0, MAIN_HALL.y1, HALL_A.x1 - T, "right", [[250, 370]]),
  ...lockerWallH(0, HALL_A.x1 - T, TOP_WALL_Y, "below", [[200, 330], [570, 700]]),
  box("bleacher", 100, 80, 676, 36),
  box("bleacher", 150, 400, 200, 30),
  box("bleacher", 526, 400, 200, 30),
  box("bleacher", 418, 250, 40, 40),

  // Library
  ...lockerWallV(0, MAIN_HALL.y1, HALL_A.x2, "left", [[300, 420]]),
  ...lockerWallV(0, MAIN_HALL.y1, HALL_B.x1 - T, "right", [[300, 420]]),
  ...lockerWallH(HALL_A.x2 + T, HALL_B.x1 - T, TOP_WALL_Y, "below", [[1340, 1460]]),
  ...[1230, 1360, 1490].flatMap((x) => [box("shelf", x, 80, 30, 180), box("shelf", x, 360, 30, 200)]),

  // Classroom
  ...lockerWallV(0, MAIN_HALL.y1, HALL_B.x2, "left", [[250, 370]]),
  ...lockerWallH(HALL_B.x2 + T, MAP_WIDTH, TOP_WALL_Y, "below", [[2000, 2130], [2370, 2500]]),
  box("desk", 2150, 60, 200, 40),
  ...CLASS_DESKS.map(({ x, y }) => box("desk", x, y, 50, 34)),

  // Cafeteria
  ...lockerWallH(0, HALL_A.x1 - T, BOTTOM_WALL_Y, "above", [[200, 330], [570, 700]]),
  ...lockerWallV(MAIN_HALL.y2, MAP_HEIGHT, HALL_A.x1 - T, "right", [[1400, 1520]]),
  ...CAFETERIA_TABLES.map(({ x, y }) => box("table", x, y, 200, 50)),

  // Detention
  ...lockerWallH(HALL_A.x2 + T, HALL_B.x1 - T, BOTTOM_WALL_Y, "above", [[1340, 1460]]),
  ...lockerWallV(MAIN_HALL.y2, MAP_HEIGHT, HALL_A.x2, "left", [[1380, 1500]]),
  ...lockerWallV(MAIN_HALL.y2, MAP_HEIGHT, HALL_B.x1 - T, "right", [[1380, 1500]]),
  ...DETENTION_DESKS.map(({ x, y }) => box("desk", x, y, 50, 34)),
  box("desk", 1330, 1700, 140, 40),

  // Art room
  ...lockerWallH(HALL_B.x2 + T, MAP_WIDTH, BOTTOM_WALL_Y, "above", [[2000, 2130], [2370, 2500]]),
  ...lockerWallV(MAIN_HALL.y2, MAP_HEIGHT, HALL_B.x2, "left", [[1400, 1520]]),
  ...[1180, 1420, 1620].flatMap((y) => [2020, 2200, 2380].map((x) => box("easel", x, y, 80, 50))),

  // Locker banks in the main hall for cover (the Nurse's Office sits between them)
  box("locker", 420, 830, 160, 40),
  box("locker", 2020, 830, 160, 40),
];

/** Benches beside the lunch tables and a chair behind every desk. */
export const DECOR: Decor[] = [
  ...CAFETERIA_TABLES.flatMap(({ x, y }): Decor[] => [
    { kind: "bench", x: x + 10, y: y - 24, w: 180, h: 14 },
    { kind: "bench", x: x + 10, y: y + 60, w: 180, h: 14 },
  ]),
  ...[...CLASS_DESKS, ...DETENTION_DESKS].map(({ x, y }): Decor => ({ kind: "chair", x: x + 12, y: y + 40, w: 26, h: 22 })),
  { kind: "chair", x: 2235, y: 28, w: 30, h: 24 },
  { kind: "chair", x: 1385, y: 1748, w: 30, h: 24 },
];

/**
 * The Nurse's Office: heals and protects whoever stands in it, but they can't
 * throw from inside, and staying too long makes them pass out.
 */
export const SAFE_ZONE: Rect & { name: string } = { name: "Nurse's Office", x: 1180, y: 765, w: 240, h: 170 };

export function inSafeZone(x: number, y: number) {
  return x >= SAFE_ZONE.x && x <= SAFE_ZONE.x + SAFE_ZONE.w && y >= SAFE_ZONE.y && y <= SAFE_ZONE.y + SAFE_ZONE.h;
}

export const SPAWNS: Record<ArchetypeId, Point[]> = {
  // The Principal starts at either end of the main hall, away from the classrooms.
  principal: [
    { x: 150, y: 850 },
    { x: 2450, y: 850 },
  ],
  // The duel mascots: Barry on the Blueberry (west) side, Peely on the Orange Peel (east) side.
  blueberry: [
    { x: 150, y: 850 },
    { x: 438, y: 580 },
    { x: 438, y: 1250 },
  ],
  orangepeel: [
    { x: 2450, y: 850 },
    { x: 2260, y: 600 },
    { x: 2300, y: 1320 },
  ],
  jock: [
    { x: 100, y: 200 },
    { x: 776, y: 200 },
    { x: 438, y: 180 },
    { x: 100, y: 580 },
    { x: 776, y: 580 },
    { x: 438, y: 580 },
  ],
  nerd: [
    { x: 1175, y: 150 },
    { x: 1625, y: 150 },
    { x: 1310, y: 310 },
    { x: 1440, y: 310 },
    { x: 1175, y: 610 },
    { x: 1625, y: 610 },
  ],
  teacher: [
    { x: 1980, y: 100 },
    { x: 2550, y: 100 },
    { x: 2420, y: 140 },
    { x: 1980, y: 600 },
    { x: 2550, y: 600 },
    { x: 2260, y: 600 },
  ],
  lunchlady: [
    { x: 60, y: 1250 },
    { x: 820, y: 1250 },
    { x: 438, y: 1250 },
    { x: 60, y: 1720 },
    { x: 820, y: 1720 },
    { x: 438, y: 1720 },
  ],
  clown: [
    { x: 1400, y: 1150 },
    { x: 1400, y: 1300 },
    { x: 1170, y: 1250 },
    { x: 1630, y: 1250 },
    { x: 1170, y: 1740 },
    { x: 1630, y: 1740 },
  ],
  artkid: [
    { x: 1980, y: 1100 },
    { x: 2550, y: 1100 },
    { x: 2300, y: 1320 },
    { x: 2120, y: 1520 },
    { x: 1980, y: 1720 },
    { x: 2550, y: 1720 },
  ],
};
