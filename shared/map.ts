import type { ArchetypeId } from "./archetypes";
import { T, TI_DOOR, TI_WALL, box, lockerWallH, lockerWallV, stripH, stripV, tardisRoom } from "./mapkit";
import { buildBigMap } from "./bigmap";

export type WallKind =
  | "wall"
  | "desk"
  | "shelf"
  | "table"
  | "bleacher"
  | "locker"
  | "easel"
  | "clinic"
  | "tardis"
  // Inside the TARDIS.
  | "tardiswall"
  | "tardisdoor"
  | "console"
  | "rotor"
  | "strut"
  // The Game Room.
  | "gamerwall"
  | "arcade"
  | "tvscreen"
  | "pcdesk"
  | "monitor"
  | "couch"
  | "beanbag";

/** How tall each kind of wall or furniture is, in world units. In 3D, throws can fly over the low ones. */
export const WALL_HEIGHT: Record<WallKind, number> = {
  wall: 80,
  locker: 80,
  shelf: 64,
  desk: 22,
  table: 26,
  bleacher: 30,
  easel: 46,
  clinic: 80,
  tardis: 72,
  tardiswall: 80,
  tardisdoor: 80,
  console: 30,
  rotor: 80,
  strut: 80,
  gamerwall: 80,
  arcade: 64,
  tvscreen: 80,
  pcdesk: 28,
  monitor: 50,
  couch: 24,
  beanbag: 14,
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

export type FloorPattern = "court" | "carpet" | "checker" | "tiles" | "stripes" | "splatter" | "neon" | "stage";

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
const SW = 2600;
/** The school building; the Game Room hangs off the bottom of it, below the right cross hall. */
const SH = 1800;
const SMH = 2240;

// Cross halls run top to bottom; the main hall runs left to right.
const HALL_A = { x1: 900, x2: 1100 };
const HALL_B = { x1: 1700, x2: 1900 };
const MAIN_HALL = { y1: 700, y2: 1000 };
const TOP_WALL_Y = MAIN_HALL.y1 - T;
const BOTTOM_WALL_Y = MAIN_HALL.y2;

const S_ROOMS: Room[] = [
  { name: "Gym", archetype: "jock", x: 0, y: 0, w: 876, h: 676, floor: "#283246", pattern: "court", label: { x: 438, y: 530 } },
  { name: "Library", archetype: "nerd", x: 1124, y: 0, w: 552, h: 676, floor: "#1d2740", pattern: "carpet", label: { x: 1400, y: 620 } },
  { name: "Classroom", archetype: "teacher", x: 1924, y: 0, w: 676, h: 676, floor: "#2a3240", pattern: "checker", label: { x: 2262, y: 570 } },
  { name: "Cafeteria", archetype: "lunchlady", x: 0, y: 1024, w: 876, h: 776, floor: "#323843", pattern: "tiles", label: { x: 438, y: 1265 } },
  { name: "Detention", archetype: "clown", x: 1124, y: 1024, w: 552, h: 776, floor: "#262b35", pattern: "stripes", label: { x: 1400, y: 1460 } },
  { name: "Art Room", archetype: "artkid", x: 1924, y: 1024, w: 676, h: 776, floor: "#25304a", pattern: "splatter", label: { x: 2262, y: 1545 } },
  // Down at the end of the right cross hall, through a door in the bottom wall of the school.
  { name: "Game Room", archetype: "gamer", x: 1500, y: 1824, w: 600, h: 416, floor: "#0f0a1e", pattern: "neon", label: { x: 1800, y: 1975 } },
  // The music wing, below the school on the left.
  { name: "Band Room", archetype: "bandkid", x: 700, y: 1824, w: 600, h: 416, floor: "#3b2a1a", pattern: "stage", label: { x: 1000, y: 1880 } },
  { name: "Orchestra Room", archetype: "orchestra", x: 24, y: 1824, w: 628, h: 416, floor: "#3b2a1a", pattern: "stage", label: { x: 338, y: 2190 } },
];

/** Street-styled corridors, used for floor markings. */
const S_HALLS: Rect[] = [
  { x: 0, y: MAIN_HALL.y1, w: SW, h: MAIN_HALL.y2 - MAIN_HALL.y1 },
  { x: HALL_A.x1, y: 0, w: HALL_A.x2 - HALL_A.x1, h: MAIN_HALL.y1 },
  { x: HALL_B.x1, y: 0, w: HALL_B.x2 - HALL_B.x1, h: MAIN_HALL.y1 },
  { x: HALL_A.x1, y: MAIN_HALL.y2, w: HALL_A.x2 - HALL_A.x1, h: SH - MAIN_HALL.y2 },
  { x: HALL_B.x1, y: MAIN_HALL.y2, w: HALL_B.x2 - HALL_B.x1, h: SH - MAIN_HALL.y2 },
];

const CAFETERIA_TABLES = [1130, 1350, 1570].flatMap((y) => [100, 576].map((x) => ({ x, y })));
export type School = "lemons" | "orangepeels";

/** Cafeteria tables painted with a rival school's logo and name: Lemons on the left, Orange Peels on the right. */
const S_SCHOOL_TABLES = CAFETERIA_TABLES.map(({ x, y }) => ({
  x,
  y,
  w: 200,
  h: 50,
  school: (x < 300 ? "lemons" : "orangepeels") as School,
}));
const CLASS_DESKS = [220, 330, 440].flatMap((y) => [2000, 2130, 2260, 2390, 2520].map((x) => ({ x, y })));
const DETENTION_DESKS = [1150, 1350, 1550].flatMap((y) => [1200, 1550].map((x) => ({ x, y })));

/**
 * The Nurse's Office: a little building in the middle of the main hall,
 * with a door at each end. Small enough to leave room to walk past it.
 */
const NURSE = { x: 1190, y: 780, w: 220, h: 140 };
const NURSE_WALL = 10;
const NURSE_DOOR: [number, number] = [NURSE.y + NURSE.h / 2 - 35, NURSE.y + NURSE.h / 2 + 35];

/**
 * Places the TARDIS can land, each with room in front of its doors (which
 * face south). It starts parked in the back corner of the Library, behind
 * the shelves; from the console inside you can fly it to any of the others.
 */
const S_TARDIS_SPOTS: { name: string; x: number; y: number }[] = [
  { name: "📚 Library", x: 1634, y: 2 },
  { name: "🏈 Gym", x: 30, y: 470 },
  { name: "🍔 Cafeteria", x: 470, y: 1450 },
  { name: "🍎 Classroom", x: 1950, y: 500 },
  { name: "🎨 Art Room", x: 2530, y: 1250 },
  { name: "🤡 Detention", x: 1300, y: 1450 },
  { name: "🏫 Main Hall", x: 700, y: 740 },
  { name: "🎮 Game Room", x: 1560, y: 1836 },
  { name: "🥁 Band Room", x: 720, y: 1836 },
  { name: "🎻 Orchestra Room", x: 40, y: 1836 },
];

/** The police box (it travels between the spots above), and its console room off the east edge of the school. */
const S_TARDIS: Wall = { x: S_TARDIS_SPOTS[0].x, y: S_TARDIS_SPOTS[0].y, w: 38, h: 38, kind: "tardis" };
const S_TARDIS_INSIDE: Rect = { x: SW + 400, y: 300, w: 560, h: 420 };
const TARDIS_ROOM: Wall[] = tardisRoom(S_TARDIS_INSIDE);

/**
 * The Game Room, where the Gamer spawns: down through a door at the bottom of
 * the right cross hall. Dark walls lit with RGB strips and game posters, arcade
 * cabinets, a big TV with a couch and beanbags, and two gaming PC setups.
 */
const S_GAME_ROOM: Rect = { x: 1500, y: SH + T, w: 600, h: SMH - SH - T };

const GAME_DOOR: [number, number] = [1740, 1860];
const GR = S_GAME_ROOM;
const GAME_ROOM_WALLS: Wall[] = [
  box("gamerwall", GR.x - T, GR.y, T, GR.h),
  box("gamerwall", GR.x + GR.w, GR.y, T, GR.h),
  // Lining the room (the walls behind are the school's on the other side).
  ...stripH("gamerwall", GR.x, GR.x + GR.w, GR.y, 6, [GAME_DOOR]),
  ...stripH("gamerwall", GR.x, GR.x + GR.w, GR.y + GR.h - 6, 6, [[1720, 1880]]),
  box("tvscreen", 1720, GR.y + GR.h - 8, 160, 8),
  // Arcade cabinets down both sides.
  ...[1880, 1940, 2000, 2060].map((y) => box("arcade", GR.x, y, 26, 34)),
  ...[1870, 1930].map((y) => box("arcade", GR.x + GR.w - 26, y, 26, 34)),
  // Two gaming PCs against the right wall: desk, with the monitor on the back of it.
  box("pcdesk", 2040, 2010, 54, 70),
  box("monitor", 2088, 2016, 6, 58),
  box("pcdesk", 2040, 2120, 54, 70),
  box("monitor", 2088, 2126, 6, 58),
  // The couch and beanbags, facing the TV.
  box("couch", 1720, 2090, 160, 34),
  box("beanbag", 1640, 2150, 34, 34),
  box("beanbag", 1926, 2150, 34, 34),
];


/**
 * The music wing, below the school on the left: the Band Room (through a door
 * at the bottom of the left cross hall), where the Band Kid spawns, and the
 * Orchestra Room (through a door at the bottom of the Cafeteria), where the
 * Orchestra Kid spawns. Both have a stage floor; the band sits on stepped
 * risers around a drum set, the orchestra in a half circle facing the
 * conductor's podium, with music stands in front.
 */
const BAND_ROOM: Rect = { x: 700, y: SH + T, w: 600, h: SMH - SH - T };
const ORCHESTRA_ROOM: Rect = { x: T, y: SH + T, w: 676 - T * 2, h: SMH - SH - T };
const BAND_DOOR: [number, number] = [940, 1060];
const ORCHESTRA_DOOR: [number, number] = [290, 410];
const BR = BAND_ROOM;
const OR = ORCHESTRA_ROOM;
/** Music stands in a row, each a little stand with a chair behind it (see DECOR). */
const BAND_STANDS = [
  ...[780, 880, 1120, 1220].map((x) => ({ x, y: 1920 })),
  ...[760, 860, 960, 1140, 1240].map((x) => ({ x, y: 2030 })),
];
const ORCHESTRA_STANDS = [0.12, 0.26, 0.4, 0.6, 0.74, 0.88].map((t) => {
  // A half circle around the podium near the top of the room.
  const a = Math.PI * (1 - t);
  return { x: OR.x + OR.w / 2 + Math.cos(a) * 230 - 12, y: OR.y + 70 + Math.sin(a) * 200 - 10 };
});
const MUSIC_WALLS: Wall[] = [
  // Band Room
  box("wall", BR.x + BR.w, BR.y, T, BR.h),
  box("bleacher", BR.x + 40, BR.y + BR.h - 110, BR.w - 80, 30), // the back riser
  box("table", BR.x + BR.w / 2 - 50, BR.y + BR.h - 70, 100, 50), // the drum set, up on the riser's edge
  box("shelf", BR.x + 6, BR.y + 160, 26, 160), // instrument lockers
  box("shelf", BR.x + BR.w - 32, BR.y + 160, 26, 160),
  ...BAND_STANDS.map(({ x, y }) => box("easel", x, y, 26, 14)),
  // Orchestra Room (the left wall is the school's outside wall; the right is shared with the Band Room)
  box("wall", 0, OR.y, T, OR.h),
  box("wall", OR.x + OR.w, OR.y, T * 2 + (BR.x - (OR.x + OR.w) - T * 2), OR.h),
  box("desk", OR.x + OR.w / 2 - 30, OR.y + 40, 60, 40), // the conductor's podium
  box("table", OR.x + OR.w - 150, OR.y + OR.h - 80, 130, 60), // the grand piano
  box("shelf", OR.x + 20, OR.y + OR.h - 40, 200, 26), // the cello and bass rack
  ...ORCHESTRA_STANDS.map(({ x, y }) => box("easel", x, y, 26, 14)),
];
const S_WALLS: Wall[] = [
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
  ...lockerWallH(HALL_B.x2 + T, SW, TOP_WALL_Y, "below", [[2000, 2130], [2370, 2500]]),
  box("desk", 2150, 60, 200, 40),
  ...CLASS_DESKS.map(({ x, y }) => box("desk", x, y, 50, 34)),

  // Cafeteria
  ...lockerWallH(0, HALL_A.x1 - T, BOTTOM_WALL_Y, "above", [[200, 330], [570, 700]]),
  ...lockerWallV(MAIN_HALL.y2, SH, HALL_A.x1 - T, "right", [[1400, 1520]]),
  ...CAFETERIA_TABLES.map(({ x, y }) => box("table", x, y, 200, 50)),

  // Detention
  ...lockerWallH(HALL_A.x2 + T, HALL_B.x1 - T, BOTTOM_WALL_Y, "above", [[1340, 1460]]),
  ...lockerWallV(MAIN_HALL.y2, SH, HALL_A.x2, "left", [[1380, 1500]]),
  ...lockerWallV(MAIN_HALL.y2, SH, HALL_B.x1 - T, "right", [[1380, 1500]]),
  ...DETENTION_DESKS.map(({ x, y }) => box("desk", x, y, 50, 34)),
  box("desk", 1330, 1700, 140, 40),

  // Art room
  ...lockerWallH(HALL_B.x2 + T, SW, BOTTOM_WALL_Y, "above", [[2000, 2130], [2370, 2500]]),
  ...lockerWallV(MAIN_HALL.y2, SH, HALL_B.x2, "left", [[1400, 1520]]),
  ...[1180, 1420, 1620].flatMap((y) => [2020, 2200, 2380].map((x) => box("easel", x, y, 80, 50))),

  // Locker banks in the main hall for cover, either side of the Nurse's Office
  box("locker", 420, 830, 160, 40),
  box("locker", 2020, 830, 160, 40),

  // Shh.
  S_TARDIS,
  ...TARDIS_ROOM,

  // The bottom wall of the school, with a door from the right cross hall down into the Game Room.
  ...stripH("wall", 0, SW, SH, T, [GAME_DOOR, BAND_DOOR, ORCHESTRA_DOOR]),
  ...MUSIC_WALLS,
  ...GAME_ROOM_WALLS,

  // The Nurse's Office building.
  ...stripH("clinic", NURSE.x, NURSE.x + NURSE.w, NURSE.y, NURSE_WALL, []),
  ...stripH("clinic", NURSE.x, NURSE.x + NURSE.w, NURSE.y + NURSE.h - NURSE_WALL, NURSE_WALL, []),
  ...stripV("clinic", NURSE.y + NURSE_WALL, NURSE.y + NURSE.h - NURSE_WALL, NURSE.x, NURSE_WALL, [NURSE_DOOR]),
  ...stripV("clinic", NURSE.y + NURSE_WALL, NURSE.y + NURSE.h - NURSE_WALL, NURSE.x + NURSE.w - NURSE_WALL, NURSE_WALL, [NURSE_DOOR]),
];

/** Benches beside the lunch tables and a chair behind every desk. */
const S_DECOR: Decor[] = [
  ...CAFETERIA_TABLES.flatMap(({ x, y }): Decor[] => [
    { kind: "bench", x: x + 10, y: y - 24, w: 180, h: 14 },
    { kind: "bench", x: x + 10, y: y + 60, w: 180, h: 14 },
  ]),
  ...[...CLASS_DESKS, ...DETENTION_DESKS].map(({ x, y }): Decor => ({ kind: "chair", x: x + 12, y: y + 40, w: 26, h: 22 })),
  { kind: "chair", x: 2235, y: 28, w: 30, h: 24 },
  { kind: "chair", x: 1385, y: 1748, w: 30, h: 24 },
  // A chair behind every music stand.
  ...[...BAND_STANDS, ...ORCHESTRA_STANDS].map(({ x, y }): Decor => ({ kind: "chair", x: x, y: y + 22, w: 26, h: 22 })),
];

/**
 * The Nurse's Office: heals and protects whoever stands in it, but they can't
 * throw from inside, and staying too long makes them pass out.
 */
const S_SAFE_ZONE: Rect & { name: string } = { name: "Nurse's Office", ...NURSE };

const S_SPAWNS: Record<ArchetypeId, Point[]> = {
  // The Principal starts at either end of the main hall, away from the classrooms.
  principal: [
    { x: 150, y: 850 },
    { x: 2450, y: 850 },
  ],
  // The duel mascots: Lenny on the Lemon (west) side, Peely on the Orange Peel (east) side.
  lemon: [
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
  // The Gamer lives in the Game Room.
  gamer: [
    { x: 1620, y: 1960 },
    { x: 1680, y: 2060 },
    { x: 1800, y: 1900 },
    { x: 1960, y: 1900 },
    { x: 1800, y: 2040 },
    { x: 1960, y: 2060 },
  ],
  // The Quiet Kid keeps to the back corners of the Library.
  quietkid: [
    { x: 1175, y: 300 },
    { x: 1625, y: 300 },
    { x: 1310, y: 600 },
    { x: 1440, y: 600 },
    { x: 1175, y: 450 },
    { x: 1625, y: 450 },
  ],
  // The Pyro lurks around the Cafeteria kitchen.
  pyro: [
    { x: 60, y: 1100 },
    { x: 820, y: 1100 },
    { x: 60, y: 1700 },
    { x: 820, y: 1700 },
    { x: 300, y: 1500 },
    { x: 600, y: 1260 },
  ],
  // The Band Kid warms up in the Band Room.
  bandkid: [
    { x: 760, y: 1880 },
    { x: 1240, y: 1880 },
    { x: 830, y: 1990 },
    { x: 1170, y: 1990 },
    { x: 1000, y: 2000 },
    { x: 1000, y: 1900 },
  ],
  // The Orchestra Kid rehearses in the Orchestra Room.
  orchestra: [
    { x: 338, y: 1950 },
    { x: 150, y: 2120 },
    { x: 430, y: 2150 },
    { x: 100, y: 1900 },
    { x: 580, y: 1900 },
    { x: 338, y: 2100 },
  ],
  // The Kindergartner plays among the Art Room easels.
  kindergartner: [
    { x: 2110, y: 1110 },
    { x: 2290, y: 1110 },
    { x: 2110, y: 1340 },
    { x: 2470, y: 1340 },
    { x: 2290, y: 1560 },
    { x: 2470, y: 1720 },
  ],
  // The Basketball Star shoots around in the Gym.
  baller: [
    { x: 300, y: 200 },
    { x: 580, y: 200 },
    { x: 200, y: 330 },
    { x: 680, y: 330 },
    { x: 300, y: 520 },
    { x: 580, y: 520 },
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

// ---------------------------------------------------------------- maps, and which one is in play

/** The maps: the school, and the big school for 50 v 50 (see bigmap.ts). */
export type MapId = "school" | "big";

/** Everything that makes up a map. */
export interface GameMap {
  id: MapId;
  width: number;
  height: number;
  /** The main building's height; anything below it is reachable only inside `below`. */
  schoolHeight: number;
  /** Rooms below the main building you can walk into. */
  below: Rect[];
  rooms: Room[];
  halls: Rect[];
  walls: Wall[];
  decor: Decor[];
  safeZone: Rect & { name: string };
  spawns: Record<ArchetypeId, Point[]>;
  tardis: Wall;
  tardisSpots: { name: string; x: number; y: number }[];
  tardisInside: Rect;
  schoolTables: { x: number; y: number; w: number; h: number; school: School }[];
  /** Which of tardisSpots the TARDIS is parked at. */
  tardisSpot: number;
}

const SCHOOL_MAP: GameMap = {
  id: "school",
  width: SW,
  height: SMH,
  schoolHeight: SH,
  below: [S_GAME_ROOM, BAND_ROOM, ORCHESTRA_ROOM],
  rooms: S_ROOMS,
  halls: S_HALLS,
  walls: S_WALLS,
  decor: S_DECOR,
  safeZone: S_SAFE_ZONE,
  spawns: S_SPAWNS,
  tardis: S_TARDIS,
  tardisSpots: S_TARDIS_SPOTS,
  tardisInside: S_TARDIS_INSIDE,
  schoolTables: S_SCHOOL_TABLES,
  tardisSpot: 0,
};

const MAPS = new Map<MapId, GameMap>([["school", SCHOOL_MAP]]);
let current: GameMap = SCHOOL_MAP;

/** The map in play. Everything below follows it; switch with switchMap. */
export let MAP_ID: MapId = "school";
export let MAP_WIDTH = SW;
export let MAP_HEIGHT = SMH;
/** The main building; the rooms in `below` hang off the bottom of it. */
export let SCHOOL_HEIGHT = SH;
export let ROOMS: Room[] = S_ROOMS;
/** Street-styled corridors, used for floor markings. */
export let HALLS: Rect[] = S_HALLS;
export let WALLS: Wall[] = S_WALLS;
/** Benches beside the lunch tables and a chair behind every desk. */
export let DECOR: Decor[] = S_DECOR;
/**
 * The Nurse's Office: heals and protects whoever stands in it, but they can't
 * throw from inside, and staying too long makes them pass out.
 */
export let SAFE_ZONE: Rect & { name: string } = S_SAFE_ZONE;
export let SPAWNS: Record<ArchetypeId, Point[]> = S_SPAWNS;
/** The police box. It's a wall like any other, but it moves: the server flies it between TARDIS_SPOTS and every client follows along. */
export let TARDIS: Wall = S_TARDIS;
export let TARDIS_SPOTS = S_TARDIS_SPOTS;
/**
 * Inside the TARDIS: a big console room, far bigger than the box. It sits
 * off the east edge of the school, closed in by its own walls; the inside
 * of the police box doors is in the middle of its south wall.
 */
export let TARDIS_INSIDE: Rect = S_TARDIS_INSIDE;
/** Cafeteria tables painted with a rival school's logo and name. */
export let SCHOOL_TABLES = S_SCHOOL_TABLES;
/** Where you end up going in to the TARDIS. */
export let TARDIS_ARRIVE_INSIDE: Point = arriveInside(S_TARDIS_INSIDE);

function arriveInside(ti: Rect): Point {
  return { x: ti.x + ti.w / 2, y: ti.y + ti.h - 90 };
}

/** Which map a mode is played on: 50 v 50 has the big school. */
export function mapIdFor(mode: string): MapId {
  return mode === "mega" ? "big" : "school";
}

/** Make this map the one in play (cheap: everything just points at it). */
export function switchMap(id: MapId) {
  if (id === current.id) return;
  let m = MAPS.get(id);
  if (!m) {
    m = buildBigMap();
    MAPS.set(id, m);
  }
  current = m;
  MAP_ID = m.id;
  MAP_WIDTH = m.width;
  MAP_HEIGHT = m.height;
  SCHOOL_HEIGHT = m.schoolHeight;
  ROOMS = m.rooms;
  HALLS = m.halls;
  WALLS = m.walls;
  DECOR = m.decor;
  SAFE_ZONE = m.safeZone;
  SPAWNS = m.spawns;
  TARDIS = m.tardis;
  TARDIS_SPOTS = m.tardisSpots;
  TARDIS_INSIDE = m.tardisInside;
  SCHOOL_TABLES = m.schoolTables;
  TARDIS_ARRIVE_INSIDE = arriveInside(m.tardisInside);
}

/** Which of TARDIS_SPOTS it's parked at. */
export function tardisSpotNow() {
  return current.tardisSpot;
}

/** Land the TARDIS at one of TARDIS_SPOTS. */
export function moveTardis(spot: number) {
  const s = TARDIS_SPOTS[spot];
  if (!s) return;
  current.tardisSpot = spot;
  TARDIS.x = s.x;
  TARDIS.y = s.y;
}

/** Walking into the TARDIS doors (in front of its south face) takes you inside. */
export function atTardisDoor(x: number, y: number) {
  return x > TARDIS.x + 6 && x < TARDIS.x + TARDIS.w - 6 && y > TARDIS.y + TARDIS.h && y < TARDIS.y + TARDIS.h + 26;
}

export function inTardis(x: number, y: number) {
  const ti = TARDIS_INSIDE;
  return x > ti.x - TI_WALL && x < ti.x + ti.w + TI_WALL && y > ti.y - TI_WALL && y < ti.y + ti.h + TI_WALL;
}

/** Walking back into the doors from inside takes you out to wherever the TARDIS has landed. */
export function atTardisExit(x: number, y: number) {
  const ti = TARDIS_INSIDE;
  return Math.abs(x - (ti.x + ti.w / 2)) < TI_DOOR - 6 && y > ti.y + ti.h - 26;
}

/** Standing at the console, where you choose where to fly. */
export function atTardisConsole(x: number, y: number) {
  const ti = TARDIS_INSIDE;
  return Math.hypot(x - (ti.x + ti.w / 2), y - (ti.y + ti.h / 2)) < 80;
}

/** Where you come back out (in front of wherever it's landed). */
export function tardisArriveOutside(): Point {
  return { x: TARDIS.x + TARDIS.w / 2, y: TARDIS.y + TARDIS.h + 60 };
}

/** For the minimap: anyone inside the TARDIS shows where the box is. */
export function onMap(x: number, y: number): Point {
  return inTardis(x, y) ? { x: TARDIS.x + TARDIS.w / 2, y: TARDIS.y + TARDIS.h / 2 } : { x, y };
}

export function inSafeZone(x: number, y: number) {
  return x >= SAFE_ZONE.x && x <= SAFE_ZONE.x + SAFE_ZONE.w && y >= SAFE_ZONE.y && y <= SAFE_ZONE.y + SAFE_ZONE.h;
}

/** Somewhere you can actually get to: the main building, or a room below it (not the closed-off space between them). */
export function reachable(x: number, y: number) {
  return y < SCHOOL_HEIGHT || current.below.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
}
