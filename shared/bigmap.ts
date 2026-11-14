import type { ArchetypeId } from "./archetypes";
import type { Decor, GameMap, Point, Rect, Room, School, Wall } from "./map";
import { T, box, lockerWallH, lockerWallV, musicRoom, spawnsIn, stripH, stripV, tardisRoom } from "./mapkit";

/**
 * The big school, for 50 v 50: a whole campus under one roof. Twelve blocks
 * between two long main halls (north and south) and three cross halls, with
 * a big atrium in the middle around the Nurse's Office:
 *
 *   Gym        | Library     | Kindergarten | Classroom
 *   ------------------ North Hall ----------------------
 *   Cafeteria  |          Atrium            | Art Room
 *   ------------------ South Hall ----------------------
 *   Detention  | Band Room   | Orchestra    | Game Room
 *
 * Every room has doors onto each hall it touches, lockers line the hall
 * walls, and locker banks and planters give cover out in the open.
 */

const W = 4800;
const H = 3000;
/** The cross halls (x ranges) and main halls (y ranges). */
const CROSS: [number, number][] = [
  [1100, 1300],
  [2300, 2500],
  [3500, 3700],
];
const NORTH: [number, number] = [900, 1150];
const SOUTH: [number, number] = [1850, 2100];
/** The atrium: the middle two blocks of the middle row, open to the halls. */
const ATRIUM: Rect = { x: 1300, y: NORTH[1], w: 2200, h: SOUTH[0] - NORTH[1] };
const DOOR = 130;

interface Block {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Two doors per side, a quarter of the way in from each end. */
function doors(from: number, to: number): [number, number][] {
  const len = to - from;
  return [0.25, 0.75].map((f) => {
    const c = from + len * f;
    return [c - DOOR / 2, c + DOOR / 2];
  });
}

/** The walls round a block (lockers on their hallway side, doors onto every hall), and the room inside them. */
function walledRoom(b: Block, walls: Wall[]): Rect {
  const top = b.y0 > 0;
  const bottom = b.y1 < H;
  const left = b.x0 > 0;
  const right = b.x1 < W;
  if (top) walls.push(...lockerWallH(b.x0, b.x1, b.y0, "above", doors(b.x0, b.x1)));
  if (bottom) walls.push(...lockerWallH(b.x0, b.x1, b.y1 - T, "below", doors(b.x0, b.x1)));
  if (left) walls.push(...lockerWallV(b.y0, b.y1, b.x0, "left", doors(b.y0, b.y1)));
  if (right) walls.push(...lockerWallV(b.y0, b.y1, b.x1 - T, "right", doors(b.y0, b.y1)));
  const x = b.x0 + (left ? T : 0);
  const y = b.y0 + (top ? T : 0);
  return { x, y, w: b.x1 - (right ? T : 0) - x, h: b.y1 - (bottom ? T : 0) - y };
}


export function buildBigMap(): GameMap {
  const walls: Wall[] = [];
  const decor: Decor[] = [];
  const cols: [number, number][] = [
    [0, CROSS[0][0]],
    [CROSS[0][1], CROSS[1][0]],
    [CROSS[1][1], CROSS[2][0]],
    [CROSS[2][1], W],
  ];
  const rows: [number, number][] = [
    [0, NORTH[0]],
    [NORTH[1], SOUTH[0]],
    [SOUTH[1], H],
  ];
  const block = (c: number, r: number): Block => ({ x0: cols[c][0], y0: rows[r][0], x1: cols[c][1], y1: rows[r][1] });

  const room = (
    name: string,
    archetype: ArchetypeId,
    b: Block,
    floor: string,
    pattern: Room["pattern"],
  ): Room => {
    const r = walledRoom(b, walls);
    // Music rooms have the podium at the front (the bottom), so their name goes at the back.
    const labelY = pattern === "stage" ? r.y + 45 : r.y + r.h - 50;
    return { name, archetype, ...r, floor, pattern, label: { x: r.x + r.w / 2, y: labelY } };
  };
  const gym = room("Gym", "jock", block(0, 0), "#283246", "court");
  const library = room("Library", "nerd", block(1, 0), "#1d2740", "carpet");
  const kinder = room("Kindergarten", "kindergartner", block(2, 0), "#3a2f4a", "carpet");
  const classroom = room("Classroom", "teacher", block(3, 0), "#2a3240", "checker");
  const cafeteria = room("Cafeteria", "lunchlady", block(0, 1), "#323843", "tiles");
  const art = room("Art Room", "artkid", block(3, 1), "#25304a", "splatter");
  const detention = room("Detention", "clown", block(0, 2), "#262b35", "stripes");
  const band = room("Band Room", "bandkid", block(1, 2), "#3b2a1a", "stage");
  const orchestra = room("Orchestra Room", "orchestra", block(2, 2), "#3b2a1a", "stage");
  const gameRoom = room("Game Room", "gamer", block(3, 2), "#0f0a1e", "neon");
  const rooms = [gym, library, kinder, classroom, cafeteria, art, detention, band, orchestra, gameRoom];

  // ---- furniture
  // Gym: bleachers along the back wall and some cover on the court.
  walls.push(box("bleacher", gym.x + 80, gym.y + 60, gym.w - 160, 36));
  for (const [fx, fy] of [
    [0.2, 0.45],
    [0.7, 0.45],
    [0.45, 0.65],
  ])
    walls.push(box("bleacher", gym.x + gym.w * fx, gym.y + gym.h * fy, 200, 30));
  // Library: rows of tall shelves.
  for (let i = 0; i < 4; i++) {
    const x = library.x + 160 + i * ((library.w - 320) / 3);
    walls.push(box("shelf", x, library.y + 80, 30, 260), box("shelf", x, library.y + 470, 30, 260));
  }
  // Kindergarten: little tables, easels, beanbags and a toy shelf.
  for (const [fx, fy] of [
    [0.2, 0.3],
    [0.55, 0.3],
    [0.2, 0.62],
    [0.55, 0.62],
  ])
    walls.push(box("table", kinder.x + kinder.w * fx, kinder.y + kinder.h * fy, 120, 50));
  walls.push(box("shelf", kinder.x + kinder.w - 60, kinder.y + 100, 30, 300));
  walls.push(box("easel", kinder.x + 80, kinder.y + 80, 80, 50), box("easel", kinder.x + 260, kinder.y + 80, 80, 50));
  for (const fx of [0.3, 0.5, 0.7]) walls.push(box("beanbag", kinder.x + kinder.w * fx, kinder.y + kinder.h - 150, 34, 34));
  // Classroom: rows of desks and the teacher's desk.
  walls.push(box("desk", classroom.x + classroom.w / 2 - 100, classroom.y + 60, 200, 40));
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 6; i++) {
      const x = classroom.x + 90 + i * ((classroom.w - 230) / 5);
      const y = classroom.y + 200 + j * 130;
      walls.push(box("desk", x, y, 50, 34));
      decor.push({ kind: "chair", x: x + 12, y: y + 40, w: 26, h: 22 });
    }
  }
  // Cafeteria: lunch tables painted with each school's logo, with benches.
  const tables: GameMap["schoolTables"] = [];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 2; i++) {
      const x = cafeteria.x + 120 + i * (cafeteria.w - 440);
      const y = cafeteria.y + 120 + j * 180;
      const school: School = i === 0 ? "lemons" : "orangepeels";
      tables.push({ x, y, w: 200, h: 50, school });
      walls.push(box("table", x, y, 200, 50));
      decor.push({ kind: "bench", x: x + 10, y: y - 24, w: 180, h: 14 }, { kind: "bench", x: x + 10, y: y + 60, w: 180, h: 14 });
    }
  }
  // Art Room: easels.
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) walls.push(box("easel", art.x + 150 + i * 280, art.y + 120 + j * 170, 80, 50));
  // Detention: desks in rows facing the front.
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 4; i++) {
      const x = detention.x + 150 + i * 220;
      const y = detention.y + 160 + j * 200;
      walls.push(box("desk", x, y, 50, 34));
      decor.push({ kind: "chair", x: x + 12, y: y + 40, w: 26, h: 22 });
    }
  walls.push(box("desk", detention.x + detention.w / 2 - 70, detention.y + detention.h - 90, 140, 40));
  // The Band Room and Orchestra Room, each set up round their conductor (see musicRoom).
  for (const [r, kind] of [
    [band, "band"],
    [orchestra, "orchestra"],
  ] as const) {
    const m = musicRoom(r, kind);
    walls.push(...m.walls);
    decor.push(...m.decor);
    r.focus = m.focus;
  }
  // Game Room: arcade cabinets, a big TV with a couch and beanbags, and gaming PCs.
  for (let i = 0; i < 5; i++) walls.push(box("arcade", gameRoom.x + 6, gameRoom.y + 80 + i * 70, 26, 34));
  walls.push(box("tvscreen", gameRoom.x + gameRoom.w / 2 - 100, gameRoom.y + gameRoom.h - 8, 200, 8));
  walls.push(box("couch", gameRoom.x + gameRoom.w / 2 - 90, gameRoom.y + gameRoom.h - 180, 180, 34));
  walls.push(box("beanbag", gameRoom.x + gameRoom.w / 2 - 170, gameRoom.y + gameRoom.h - 110, 34, 34));
  walls.push(box("beanbag", gameRoom.x + gameRoom.w / 2 + 136, gameRoom.y + gameRoom.h - 110, 34, 34));
  for (const fy of [0.2, 0.45]) {
    walls.push(box("pcdesk", gameRoom.x + gameRoom.w - 70, gameRoom.y + gameRoom.h * fy, 54, 70));
    walls.push(box("monitor", gameRoom.x + gameRoom.w - 22, gameRoom.y + gameRoom.h * fy + 6, 6, 58));
  }

  // ---- the halls: locker banks for cover along the main halls, and planters in the atrium
  for (const [y0, y1] of [NORTH, SOUTH]) {
    const mid = (y0 + y1) / 2;
    for (const x of [500, 1800, 3000, 4200]) walls.push(box("locker", x, mid - 20, 160, 40));
  }
  for (const [fx, fy] of [
    [0.12, 0.25],
    [0.12, 0.75],
    [0.88, 0.25],
    [0.88, 0.75],
    [0.3, 0.15],
    [0.7, 0.85],
  ])
    walls.push(box("shelf", ATRIUM.x + ATRIUM.w * fx - 60, ATRIUM.y + ATRIUM.h * fy - 20, 120, 40));
  for (const fx of [0.3, 0.7]) walls.push(box("bleacher", ATRIUM.x + ATRIUM.w * fx - 80, ATRIUM.y + ATRIUM.h / 2 - 15, 160, 30));

  // ---- the Nurse's Office, in the middle of the atrium, with a door at each end
  const nurse = { x: ATRIUM.x + ATRIUM.w / 2 - 130, y: ATRIUM.y + ATRIUM.h / 2 - 85, w: 260, h: 170 };
  const nw = 10;
  const nDoor: [number, number] = [nurse.y + nurse.h / 2 - 35, nurse.y + nurse.h / 2 + 35];
  walls.push(
    ...stripH("clinic", nurse.x, nurse.x + nurse.w, nurse.y, nw, []),
    ...stripH("clinic", nurse.x, nurse.x + nurse.w, nurse.y + nurse.h - nw, nw, []),
    ...stripV("clinic", nurse.y + nw, nurse.y + nurse.h - nw, nurse.x, nw, [nDoor]),
    ...stripV("clinic", nurse.y + nw, nurse.y + nurse.h - nw, nurse.x + nurse.w - nw, nw, [nDoor]),
  );

  // ---- the TARDIS: parked in the Library, with its console room off the east edge
  const tardisSpots = [
    { name: "📚 Library", x: library.x + library.w - 50, y: library.y + 6 },
    { name: "🏈 Gym", x: gym.x + 30, y: gym.y + gym.h - 130 },
    { name: "🧸 Kindergarten", x: kinder.x + 20, y: kinder.y + kinder.h - 120 },
    { name: "🍎 Classroom", x: classroom.x + 20, y: classroom.y + 100 },
    { name: "🍔 Cafeteria", x: cafeteria.x + cafeteria.w / 2, y: cafeteria.y + cafeteria.h - 130 },
    { name: "🏫 Atrium", x: ATRIUM.x + 300, y: ATRIUM.y + 40 },
    { name: "🎨 Art Room", x: art.x + art.w - 70, y: art.y + 20 },
    { name: "🤡 Detention", x: detention.x + 30, y: detention.y + 30 },
    { name: "🥁 Band Room", x: band.x + 50, y: band.y + 40 },
    { name: "🎻 Orchestra Room", x: orchestra.x + 30, y: orchestra.y + 30 },
    { name: "🎮 Game Room", x: gameRoom.x + 100, y: gameRoom.y + 40 },
  ];
  const tardis: Wall = { x: tardisSpots[0].x, y: tardisSpots[0].y, w: 38, h: 38, kind: "tardis" };
  const tardisInside: Rect = { x: W + 400, y: 300, w: 560, h: 420 };
  walls.push(tardis, ...tardisRoom(tardisInside));

  // ---- where everyone spawns: each class in its own room (the Principal and mascots, out in the halls)
  const solid = walls.filter((w) => w.kind !== "tardis");
  const halls: Rect[] = [
    { x: 0, y: NORTH[0], w: W, h: NORTH[1] - NORTH[0] },
    { x: 0, y: SOUTH[0], w: W, h: SOUTH[1] - SOUTH[0] },
    ...CROSS.map(([x0, x1]) => ({ x: x0, y: 0, w: x1 - x0, h: H })),
    ATRIUM,
  ];
  const at = (r: Rect) => spawnsIn(r, solid);
  const hallSpots: Point[] = [
    { x: 300, y: (NORTH[0] + NORTH[1]) / 2 },
    { x: W - 300, y: (SOUTH[0] + SOUTH[1]) / 2 },
    { x: 300, y: (SOUTH[0] + SOUTH[1]) / 2 },
    { x: W - 300, y: (NORTH[0] + NORTH[1]) / 2 },
  ];
  const spawns: Record<ArchetypeId, Point[]> = {
    jock: at(gym),
    baller: at(gym),
    nerd: at(library),
    quietkid: at(library),
    kindergartner: at(kinder),
    teacher: at(classroom),
    lunchlady: at(cafeteria),
    pyro: at(cafeteria),
    artkid: at(art),
    clown: at(detention),
    bandkid: at(band),
    orchestra: at(orchestra),
    gamer: at(gameRoom),
    principal: hallSpots,
    lemon: hallSpots.slice(0, 2),
    orangepeel: hallSpots.slice(2),
  };

  return {
    id: "big",
    width: W,
    height: H,
    schoolHeight: H,
    below: [],
    rooms,
    halls,
    walls,
    decor,
    safeZone: { name: "Nurse's Office", ...nurse },
    spawns,
    tardis,
    tardisSpots,
    tardisInside,
    schoolTables: tables,
    tardisSpot: 0,
  };
}
