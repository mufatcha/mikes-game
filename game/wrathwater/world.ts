/**
 * The sea of Wrathwater: islands (terrain, palms, towns, loot), the pirate
 * haven, and the wave math shared by physics and rendering.
 */

/** The playable sea is a square from -WORLD_HALF to +WORLD_HALF; beyond it is a storm wall. */
export const WORLD_HALF = 12000;
/**
 * Shore-to-shore distance kept between islands: more than you can see through
 * the sea haze, so from one island you can't see the next.
 */
export const ISLAND_GAP = 2900;
/** Height of a beach above the water. */
export const BEACH_TOP = 6;

export type IslandKind = "haven" | "town" | "wild" | "mystery" | "fortress" | "volcano" | "tribe";
export type BuildingKind = "house" | "bank" | "shop" | "armory" | "tavern" | "shipwright" | "blacksmith" | "market" | "vault" | "hut";

/**
 * The Tempest Reach: a wilder sea east of the old edge of the world, behind
 * the Stormwall (a band of endless storm along x = REACH_X). Small ships get
 * torn apart crossing it. Out there: a volcano, tribal islands, sirens, a sea
 * serpent and the pirate lord Cinder Mawgrave.
 */
export const REACH_X = WORLD_HALF;
export const REACH_EAST = WORLD_HALF + 14000;
/** Half the Stormwall's width. */
export const STORMWALL = 700;
/** The edges of the whole sea. */
export const WORLD_MIN_X = -WORLD_HALF;
export const WORLD_MAX_X = REACH_EAST;

export function inReach(x: number) {
  return x > REACH_X + STORMWALL;
}
export function inStormwall(x: number) {
  return Math.abs(x - REACH_X) < STORMWALL;
}
/** How far a point is from the edge of the sea. */
export function edgeDistance(x: number, z: number) {
  return Math.min(x - WORLD_MIN_X, WORLD_MAX_X - x, z + WORLD_HALF, WORLD_HALF - z);
}
/** Keep a point inside the sea, `pad` in from the edge. */
export function clampToWorld(x: number, z: number, pad: number) {
  return {
    x: Math.max(WORLD_MIN_X + pad, Math.min(WORLD_MAX_X - pad, x)),
    z: Math.max(-WORLD_HALF + pad, Math.min(WORLD_HALF - pad, z)),
  };
}
/** Blackwater Cove's stores (and its tavern, where you hire crew): tap E to visit, hold E to rob. */
export type ServiceKind = "shipwright" | "blacksmith" | "market" | "tavern" | "shop";

/**
 * The wall a building's door is in: the map angle it faces (one of the four
 * sides), how deep the building is from that wall to the back, and how wide.
 */
/** Inside a store: how far the counter stands out from the back wall (you can't walk past its front, COUNTER + 3). */
export const COUNTER = 12;

export function doorAxis(b: Building) {
  const fx = Math.cos(b.facing);
  const fz = Math.sin(b.facing);
  const xFacing = Math.abs(fx) > Math.abs(fz);
  const angle = xFacing ? (fx > 0 ? 0 : Math.PI) : fz > 0 ? Math.PI / 2 : -Math.PI / 2;
  return { angle, depth: xFacing ? b.w : b.d, width: xFacing ? b.d : b.w };
}

export interface Building {
  kind: BuildingKind;
  x: number;
  z: number;
  /** Size along x and z (buildings are axis-aligned). */
  w: number;
  d: number;
  h: number;
  /** Ground height under the building. */
  y: number;
  /** Where you stand to rob it. */
  door: { x: number; z: number };
  /** Direction the door faces (radians). */
  facing: number;
}

export type SpotKind = "chest" | "buried" | "crate" | "fruit";

export interface LootSpot {
  id: string;
  kind: SpotKind;
  x: number;
  z: number;
}

export interface Island {
  index: number;
  name: string;
  kind: IslandKind;
  x: number;
  z: number;
  radius: number;
  seed: number;
  haven?: boolean;
  hill: { x: number; z: number; r: number; h: number };
  palms: { x: number; z: number; h: number; lean: number; turn: number }[];
  rocks: { x: number; z: number; s: number }[];
  buildings: Building[];
  spots: LootSpot[];
  /** Where Marine guards (towns) or bandits (camps) stand. */
  guards: { x: number; z: number }[];
  bandits: { x: number; z: number }[];
  /** Towns: where the Vault Warden stands, a tough Marine captain carrying one of the three vault keys. */
  warden?: { x: number; z: number };
  /** Out in the Tempest Reach. */
  reach?: boolean;
  /** Towns and Blackwater Cove: someone outside the tavern who hands out quests. */
  questGiver?: { x: number; z: number; facing: number };
}

/** Inside this radius around the haven nobody can fire, Marines turn back, and your wanted level drops fast. */
export const HAVEN_SAFE_RADIUS = 760;

const WILD_NAMES = [
  "Skull Reef", "Gallows Key", "Rum Isle", "Driftwood Atoll", "Saltbone Cay", "Widow's Rock",
  "Cutlass Shoal", "Ember Isle", "Hangman's Spit", "Coral Crown", "Lantern Key", "Ironjaw Bluff", "Pearl Hollow",
];
const TOWN_NAMES = ["Port Sterling", "Gildhaven", "Saint Marrow", "Brightwater"];
const MYSTERY_NAME = "Kraken's Tooth";
/** The secret island fortress, far out in the southeast, where the vault is. */
export const FORTRESS_NAME = "Ironmaw Bastion";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Height of an island's ground at distance `d` from its center (beach + hill), ignoring other islands. */
function terrainHeight(isl: Pick<Island, "x" | "z" | "radius" | "hill">, x: number, z: number) {
  const d = Math.hypot(x - isl.x, z - isl.z);
  const R = isl.radius;
  if (d >= R) return -1;
  const beach = d > R * 0.86 ? BEACH_TOP * ((R - d) / (R * 0.14)) : BEACH_TOP;
  const dh = Math.hypot(x - isl.hill.x, z - isl.hill.z);
  const hill = dh < isl.hill.r ? BEACH_TOP + isl.hill.h * (0.5 + 0.5 * Math.cos((Math.PI * dh) / isl.hill.r)) : 0;
  return Math.max(beach, hill);
}

/** The cosine dome used for hills; the 3D view builds its hill mesh from this too. */
export function hillProfile(h: number, r: number, dist: number) {
  return BEACH_TOP + h * (0.5 + 0.5 * Math.cos((Math.PI * Math.min(dist, r)) / r));
}

function makeIslands(): Island[] {
  const r = rng(20261113);
  type Raw = { name: string; x: number; z: number; radius: number; seed: number; haven?: boolean; fortress?: boolean };
  const raw: Raw[] = [
    { name: "Blackwater Cove", x: 0, z: 0, radius: 420, seed: 7, haven: true },
    // The secret fortress, out in the far southeast corner of the sea.
    { name: FORTRESS_NAME, x: WORLD_HALF - 1100, z: WORLD_HALF - 1100, radius: 400, seed: 666, fortress: true },
  ];
  let tries = 0;
  while (raw.length < 19 && tries++ < 20000) {
    const radius = 140 + r() * 300;
    const x = (r() * 2 - 1) * (WORLD_HALF - 700);
    const z = (r() * 2 - 1) * (WORLD_HALF - 700);
    // Allow for towns growing (below) so the gap still holds afterwards.
    const clear = raw.every((o) => Math.hypot(o.x - x, o.z - z) > (o.radius + radius) * 1.4 + (o.haven ? ISLAND_GAP + 400 : ISLAND_GAP));
    if (clear) raw.push({ name: "", x, z, radius, seed: Math.floor(r() * 1e9) });
  }
  // The four biggest islands (besides the haven) become towns; the farthest wild one hides a Devil Fruit.
  const others = raw.filter((o) => !o.haven && !o.fortress);
  const towns = new Set([...others].sort((a, b) => b.radius - a.radius).slice(0, 4));
  const wild = others.filter((o) => !towns.has(o));
  const mystery = [...wild].sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z))[0];
  let townI = 0;
  let wildI = 0;

  return raw.map((o, index) => {
    const kind: IslandKind = o.haven ? "haven" : o.fortress ? "fortress" : towns.has(o) ? "town" : o === mystery ? "mystery" : "wild";
    const name =
      kind === "haven" || kind === "fortress" ? o.name : kind === "town" ? TOWN_NAMES[townI++] : kind === "mystery" ? MYSTERY_NAME : WILD_NAMES[wildI++ % WILD_NAMES.length];
    // Towns are bigger, so their person-sized houses fit.
    const radius = kind === "town" ? Math.max(420, o.radius * 1.4) : o.radius;
    return decorate({ ...o, radius, index, name, kind });
  });
}

/** Lay out an island's hill, palms, rocks, buildings, loot and guards, deterministically from its seed. */
function decorate(o: { index: number; name: string; kind: IslandKind; x: number; z: number; radius: number; seed: number; haven?: boolean }): Island {
  const r = rng(o.seed);
  const R = o.radius;
  const flat = o.kind === "town" || o.kind === "haven" || o.kind === "fortress" || o.kind === "tribe";
  const ha = r() * Math.PI * 2;
  const hd = r() * R * 0.15;
  const volcano = o.kind === "volcano";
  const hill = {
    x: volcano ? o.x : o.x + Math.cos(ha) * hd,
    z: volcano ? o.z : o.z + Math.sin(ha) * hd,
    r: R * (volcano ? 0.78 : flat ? 0.35 : 0.66),
    // A volcano towers over everything.
    h: volcano ? 300 : flat ? 10 + r() * 6 : 22 + R * (0.12 + r() * 0.2),
  };
  const isl: Island = { ...o, hill, palms: [], rocks: [], buildings: [], spots: [], guards: [], bandits: [] };

  const occupied: { x: number; z: number; r: number }[] = [];
  const free = (x: number, z: number, rad: number) =>
    occupied.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + rad) &&
    !isl.buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + rad && Math.abs(z - b.z) < b.d / 2 + rad);
  const landPoint = (minF: number, maxF: number, rad: number) => {
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2;
      const d = R * (minF + r() * (maxF - minF));
      const x = o.x + Math.cos(a) * d;
      const z = o.z + Math.sin(a) * d;
      if (free(x, z, rad)) return { x, z };
    }
    return null;
  };

  // Buildings (towns and the haven), placed in a ring facing the shore.
  if (flat) {
    const kinds: BuildingKind[] =
      o.kind === "tribe"
        ? Array<BuildingKind>(6).fill("hut")
        : o.kind === "fortress"
        ? ["vault", "armory", "armory"]
        : o.kind === "town"
        ? ["bank", "armory", "shop", "shop", "tavern", ...Array<BuildingKind>(Math.round(R / 60)).fill("house")]
        : ["shipwright", "blacksmith", "market", "tavern", ...Array<BuildingKind>(5).fill("house")];
    let a0 = r() * Math.PI * 2;
    for (const kind of kinds) {
      const big = kind === "bank" || kind === "tavern" || kind === "armory" || kind === "shipwright" || kind === "vault";
      // Huts are small and round-ish.
      const hut = kind === "hut";
      // Sized for people: a person stands about 19 tall, so houses are two storeys and the big halls taller.
      const w = hut ? 36 + r() * 6 : kind === "vault" ? 130 : big ? 90 + r() * 20 : 52 + r() * 24;
      const dd = hut ? 36 + r() * 6 : kind === "vault" ? 110 : big ? 70 + r() * 16 : 44 + r() * 20;
      for (let attempt = 0; attempt < 60; attempt++) {
        const a = a0 + attempt * 0.37;
        const dist = R * (0.38 + r() * 0.4);
        const x = o.x + Math.cos(a) * dist;
        const z = o.z + Math.sin(a) * dist;
        const rotated = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
        const bw = rotated ? dd : w;
        const bd = rotated ? w : dd;
        if (!free(x, z, Math.max(bw, bd) * 0.6 + 8)) continue;
        const y = terrainHeight(isl, x, z);
        const facing = a; // door faces outward, toward the shore
        const half = rotated ? bw / 2 : bd / 2;
        isl.buildings.push({
          kind,
          x,
          z,
          w: bw,
          d: bd,
          h: hut ? 24 : kind === "vault" ? 64 : big ? 50 : 34 + r() * 10,
          y,
          door: { x: x + Math.cos(facing) * (half + 14), z: z + Math.sin(facing) * (half + 14) },
          facing,
        });
        a0 = a + 0.9 + r() * 0.4;
        break;
      }
    }
  }

  // Palms and rocks.
  const palmCount = Math.round(R / (flat ? 45 : 26));
  for (let i = 0; i < palmCount; i++) {
    const p = landPoint(flat ? 0.78 : 0.3, 0.84, 6);
    if (!p) continue;
    occupied.push({ ...p, r: 6 });
    isl.palms.push({ ...p, h: 28 + r() * 24, lean: (r() - 0.5) * 0.45, turn: r() * Math.PI * 2 });
  }
  const rockCount = 4 + Math.floor(r() * 6);
  for (let i = 0; i < rockCount; i++) {
    const a = r() * Math.PI * 2;
    const d = R * (0.88 + r() * 0.25);
    isl.rocks.push({ x: o.x + Math.cos(a) * d, z: o.z + Math.sin(a) * d, s: 7 + r() * 16 });
  }

  // Loot and people.
  let spotN = 0;
  const spot = (kind: SpotKind, minF = 0.15, maxF = 0.8) => {
    const p = landPoint(minF, maxF, 10);
    if (!p) return;
    occupied.push({ ...p, r: 10 });
    isl.spots.push({ id: `${o.index}:${spotN++}`, kind, ...p });
  };
  if (o.kind === "tribe" || o.kind === "volcano") {
    // Tribal villages: warriors all around, and their treasure by the totem.
    spot("chest", 0, 0.3);
    spot("chest", 0.3, 0.7);
    spot("buried", 0.2, 0.7);
    if (o.kind === "tribe") {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        isl.bandits.push({ x: o.x + Math.cos(a) * R * 0.3, z: o.z + Math.sin(a) * R * 0.3 });
      }
    } else {
      // The volcano's slopes hold rare loot.
      spot("chest", 0.5, 0.8);
      spot("crate", 0.6, 0.84);
    }
  }
  if (o.kind === "wild" || o.kind === "mystery") {
    const chests = o.kind === "mystery" ? 2 : 1 + Math.floor(r() * 2);
    for (let i = 0; i < chests; i++) spot("chest");
    if (o.kind === "mystery" || r() < 0.6) spot("buried", 0.2, 0.7);
    const crates = 1 + Math.floor(r() * 3);
    for (let i = 0; i < crates; i++) spot("crate", 0.5, 0.84);
    if (o.kind === "mystery") spot("fruit", 0, 0.25);
    const camp = o.kind === "mystery" ? 4 : r() < 0.5 ? 2 + Math.floor(r() * 2) : 0;
    const centre = isl.spots[0] ?? { x: o.x, z: o.z };
    for (let i = 0; i < camp; i++) {
      const a = r() * Math.PI * 2;
      isl.bandits.push({ x: centre.x + Math.cos(a) * 40, z: centre.z + Math.sin(a) * 40 });
    }
  }
  if (o.kind === "town") {
    spot("crate", 0.6, 0.84);
    const posts = 3 + Math.floor(R / 130);
    for (let i = 0; i < posts; i++) {
      const b = isl.buildings[i % isl.buildings.length];
      const a = r() * Math.PI * 2;
      isl.guards.push({ x: b.door.x + Math.cos(a) * 35, z: b.door.z + Math.sin(a) * 35 });
    }
  }
  // A quest giver beside the tavern door, in the towns and at the haven.
  const tavern = isl.buildings.find((b) => b.kind === "tavern");
  if (tavern && (o.kind === "town" || o.kind === "haven")) {
    const side = tavern.facing + Math.PI / 2;
    isl.questGiver = { x: tavern.door.x + Math.cos(side) * 20, z: tavern.door.z + Math.sin(side) * 20, facing: tavern.facing };
  }
  // Three towns each have a Vault Warden guarding one of the vault's three keys.
  if (o.kind === "town" && TOWN_NAMES.slice(0, 3).includes(o.name) && isl.buildings[0]) {
    const b = isl.buildings[0];
    isl.warden = { x: b.door.x + Math.cos(b.facing) * 30, z: b.door.z + Math.sin(b.facing) * 30 };
  }
  // The fortress: Marines everywhere, all round the vault and its armories.
  if (o.kind === "fortress") {
    for (let i = 0; i < 16; i++) {
      const b = isl.buildings[i % isl.buildings.length];
      const a = (i / 16) * Math.PI * 2;
      if (b) isl.guards.push({ x: b.x + Math.cos(a) * (b.w / 2 + 50), z: b.z + Math.sin(a) * (b.d / 2 + 50) });
    }
  }
  return isl;
}

const REACH_NAMES = ["Brineteeth", "Howling Spire", "Wreckers' Shoal", "Moonglass Atoll", "Thornreef", "Salt Widow Key", "Gullscream Rock", "Bonewhistle Cay"];
const TRIBE_NAMES = ["Totem Isle", "Drumhollow", "Feathercrown Cay"];
/** The volcano where Cinder Mawgrave keeps his lair. */
export const VOLCANO_NAME = "Mount Cindermaw";

/** The Tempest Reach's islands: one volcano, three tribal islands and the rest wild. */
function makeReach(start: number): Island[] {
  const r = rng(77031);
  type Raw = { x: number; z: number; radius: number; seed: number };
  const raw: Raw[] = [
    // The volcano, deep in the Reach.
    { x: REACH_X + 9000, z: -2500, radius: 560, seed: 4242 },
  ];
  let tries = 0;
  while (raw.length < 12 && tries++ < 20000) {
    const radius = 160 + r() * 280;
    const x = REACH_X + STORMWALL + 900 + r() * (REACH_EAST - REACH_X - STORMWALL - 1800);
    const z = (r() * 2 - 1) * (WORLD_HALF - 900);
    if (raw.every((o) => Math.hypot(o.x - x, o.z - z) > o.radius + radius + ISLAND_GAP)) raw.push({ x, z, radius, seed: Math.floor(r() * 1e9) });
  }
  let wi = 0;
  return raw.map((o, i) => {
    const kind: IslandKind = i === 0 ? "volcano" : i <= 3 ? "tribe" : "wild";
    const name = kind === "volcano" ? VOLCANO_NAME : kind === "tribe" ? TRIBE_NAMES[i - 1] : REACH_NAMES[wi++ % REACH_NAMES.length];
    const isl = decorate({ ...o, index: start + i, name, kind });
    isl.reach = true;
    return isl;
  });
}

const MAIN = makeIslands();
export const ISLANDS = [...MAIN, ...makeReach(MAIN.length)];
/** Cinder Mawgrave's volcano. */
export const VOLCANO = ISLANDS.find((i) => i.kind === "volcano")!;
export const HAVEN = ISLANDS[0];
/** The secret fortress island that holds the vault. */
export const FORTRESS = ISLANDS.find((i) => i.kind === "fortress")!;

/** The island under or nearest this point, if you're within `pad` of its shore. */
export function islandAt(x: number, z: number, pad = 0): Island | null {
  for (const i of ISLANDS) if (Math.hypot(i.x - x, i.z - z) < i.radius + pad) return i;
  return null;
}

/** Ground height at a point, or null if it's open water. */
export function groundHeight(x: number, z: number): number | null {
  const isl = islandAt(x, z);
  if (!isl) return null;
  const h = terrainHeight(isl, x, z);
  return h > 0.5 ? h : null;
}

/**
 * Sea surface height. The GPU shader uses the same waves (see render.ts), so
 * ships bob in time with the water you see.
 */
export const WAVES: [dirX: number, dirZ: number, amplitude: number, wavelength: number, speed: number][] = [
  [1, 0.3, 2.4, 230, 1.0],
  [-0.4, 1, 1.7, 150, 1.2],
  [0.7, -0.7, 1.0, 95, 1.45],
  [-1, -0.2, 0.65, 60, 1.8],
  [0.2, -1, 0.4, 37, 2.3],
  [-0.8, 0.6, 0.25, 23, 2.9],
];

export function waveHeight(x: number, z: number, t: number) {
  let h = 0;
  for (const [dx, dz, a, l, s] of WAVES) {
    const len = Math.hypot(dx, dz);
    const k = (Math.PI * 2) / l;
    h += a * Math.sin(k * ((dx / len) * x + (dz / len) * z) + t * s);
  }
  return h;
}
