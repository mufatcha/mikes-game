import { MAX_HP, PLAYER_RADIUS } from "./constants";

export type WeaponId =
  | "chalk"
  | "stapler"
  | "dodgeball"
  | "tennis"
  | "rubberband"
  | "pencil"
  | "spitball"
  | "peashooter"
  | "paint"
  | "crayon"
  | "food"
  | "tots"
  | "eraser"
  | "redpen"
  | "quiz"
  | "meatball"
  | "pie"
  | "tackle"
  | "paintbomb"
  | "lecture"
  | "suspension"
  | "reportcard";

export type ArchetypeId = "teacher" | "lunchlady" | "jock" | "artkid" | "nerd" | "clown" | "principal";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  damage: number;
  /** Shots per second. */
  fireRate: number;
  magSize: number;
  reloadTime: number;
  projectileSpeed: number;
  /** Max deviation either side of the aim line, in radians. */
  spread: number;
  pellets: number;
  range: number;
  auto: boolean;
  /** Projectile size: drawn this big and added to the hit radius. */
  radius: number;
  /** Fill color, or "rainbow" for a random color per projectile. */
  color: string;
  /** Times it bounces off walls before stopping (0 = stops on the first wall). */
  bounces?: number;
  /** Seconds a hit stuns the target for. */
  stun?: number;
  /** How the projectile is drawn. */
  style: "streak" | "ball" | "blob";
}

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  emoji: string;
  tagline: string;
  /** Fraction of incoming damage ignored. */
  defense: number;
  /** Movement speed multiplier. */
  speed: number;
  primary: WeaponId;
  secondary: WeaponId;
  /** Health; defaults to MAX_HP. */
  maxHp?: number;
  /** Body size; defaults to PLAYER_RADIUS. */
  radius?: number;
  /** 1–5 ratings shown in the class picker. */
  ratings: { attack: number; defense: number; speed: number; range: number };
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  chalk: {
    id: "chalk", name: "Chalk Toss", damage: 13, fireRate: 6, magSize: 20, reloadTime: 1.8,
    projectileSpeed: 1500, spread: 0.025, pellets: 1, range: 950, auto: true,
    radius: 3, color: "#f8fafc", style: "streak",
  },
  stapler: {
    id: "stapler", name: "Stapler", damage: 8, fireRate: 9, magSize: 25, reloadTime: 1.5,
    projectileSpeed: 1500, spread: 0.06, pellets: 1, range: 550, auto: true,
    radius: 2, color: "#94a3b8", style: "streak",
  },
  food: {
    id: "food", name: "Food Fight", damage: 13, fireRate: 10, magSize: 70, reloadTime: 4,
    projectileSpeed: 1400, spread: 0.08, pellets: 1, range: 900, auto: true,
    radius: 5, color: "#a16207", style: "blob",
  },
  tots: {
    id: "tots", name: "Tater Tots", damage: 10, fireRate: 15, magSize: 24, reloadTime: 1.4,
    projectileSpeed: 1300, spread: 0.1, pellets: 1, range: 550, auto: true,
    radius: 4, color: "#eab308", style: "blob",
  },
  dodgeball: {
    id: "dodgeball", name: "Dodgeball", damage: 56, fireRate: 1.3, magSize: 3, reloadTime: 2.2,
    projectileSpeed: 1000, spread: 0.02, pellets: 1, range: 1100, auto: false,
    radius: 11, color: "#dc2626", style: "ball", bounces: 2,
  },
  tennis: {
    id: "tennis", name: "Tennis Balls", damage: 20, fireRate: 4, magSize: 8, reloadTime: 1.4,
    projectileSpeed: 1300, spread: 0.04, pellets: 1, range: 800, auto: false,
    radius: 5, color: "#d9f99d", style: "ball",
  },
  paint: {
    id: "paint", name: "Paint Splatter", damage: 13, fireRate: 1.3, magSize: 6, reloadTime: 2.5,
    projectileSpeed: 1300, spread: 0.22, pellets: 8, range: 420, auto: false,
    radius: 4, color: "rainbow", style: "blob",
  },
  crayon: {
    id: "crayon", name: "Crayon Flick", damage: 42, fireRate: 1.8, magSize: 6, reloadTime: 2,
    projectileSpeed: 1800, spread: 0.015, pellets: 1, range: 950, auto: false,
    radius: 3, color: "#a855f7", style: "streak",
  },
  rubberband: {
    id: "rubberband", name: "Rubber Bands", damage: 13, fireRate: 13, magSize: 35, reloadTime: 1.6,
    projectileSpeed: 1500, spread: 0.08, pellets: 1, range: 700, auto: true,
    radius: 2, color: "#d6a76b", style: "streak",
  },
  pencil: {
    id: "pencil", name: "Pencil Darts", damage: 20, fireRate: 5, magSize: 12, reloadTime: 1.2,
    projectileSpeed: 1600, spread: 0.03, pellets: 1, range: 850, auto: false,
    radius: 2, color: "#facc15", style: "streak",
  },
  spitball: {
    id: "spitball", name: "Spitball Straw", damage: 85, fireRate: 0.75, magSize: 5, reloadTime: 3,
    projectileSpeed: 2700, spread: 0.003, pellets: 1, range: 2200, auto: false,
    radius: 3, color: "#e2e8f0", style: "ball",
  },
  peashooter: {
    id: "peashooter", name: "Pea Shooter", damage: 15, fireRate: 6, magSize: 15, reloadTime: 1.3,
    projectileSpeed: 1500, spread: 0.04, pellets: 1, range: 800, auto: false,
    radius: 3, color: "#4ade80", style: "ball",
  },
  // The Principal's weapons.
  eraser: {
    id: "eraser", name: "Chalkboard Eraser", damage: 30, fireRate: 3, magSize: 12, reloadTime: 1.6,
    projectileSpeed: 1300, spread: 0.04, pellets: 1, range: 850, auto: true,
    radius: 7, color: "#475569", style: "ball",
  },
  redpen: {
    id: "redpen", name: "Red Pen", damage: 12, fireRate: 9, magSize: 30, reloadTime: 1.4,
    projectileSpeed: 1600, spread: 0.06, pellets: 1, range: 700, auto: true,
    radius: 2, color: "#ef4444", style: "streak",
  },
  // Thrown by class supers, not held.
  meatball: {
    id: "meatball", name: "Mystery Meat", damage: 35, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1100, spread: 0, pellets: 1, range: 800, auto: false,
    radius: 9, color: "#7c2d12", style: "blob",
  },
  pie: {
    id: "pie", name: "Cream Pie", damage: 45, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1400, spread: 0, pellets: 1, range: 1000, auto: false,
    radius: 10, color: "#fef9c3", style: "ball",
  },
  tackle: {
    id: "tackle", name: "Touchdown Dash", damage: 50, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1, spread: 0, pellets: 1, range: 1, auto: false,
    radius: 0, color: "#dc2626", style: "ball",
  },
  paintbomb: {
    id: "paintbomb", name: "Paint Bomb", damage: 45, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1, spread: 0, pellets: 1, range: 1, auto: false,
    radius: 0, color: "rainbow", style: "blob",
  },
  // Thrown by the duel Principals' abilities.
  suspension: {
    id: "suspension", name: "Suspension Slip", damage: 20, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1700, spread: 0, pellets: 1, range: 1000, auto: false,
    radius: 6, color: "#f472b6", style: "streak", stun: 2,
  },
  reportcard: {
    id: "reportcard", name: "Report Card", damage: 90, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 750, spread: 0, pellets: 1, range: 1100, auto: false,
    radius: 16, color: "#fef2f2", style: "ball",
  },
  // Thrown by the Principal's abilities, not held.
  quiz: {
    id: "quiz", name: "Pop Quiz", damage: 18, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 900, spread: 0, pellets: 1, range: 650, auto: false,
    radius: 6, color: "#fefce8", style: "ball",
  },
  lecture: {
    id: "lecture", name: "Stern Lecture", damage: 20, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1, spread: 0, pellets: 1, range: 1, auto: false,
    radius: 0, color: "#fbbf24", style: "ball",
  },
};

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  teacher: {
    id: "teacher", name: "Teacher", emoji: "🍎",
    tagline: "Tough as tenure, but hits softly.",
    defense: 0.45, speed: 0.9, primary: "chalk", secondary: "stapler",
    ratings: { attack: 1, defense: 5, speed: 2, range: 4 },
  },
  lunchlady: {
    id: "lunchlady", name: "Lunch Lady", emoji: "🍔",
    tagline: "Starts a food fight that never ends. Slow on her feet.",
    defense: 0.3, speed: 0.82, primary: "food", secondary: "tots",
    ratings: { attack: 4, defense: 4, speed: 1, range: 3 },
  },
  jock: {
    id: "jock", name: "Jock", emoji: "🏈",
    tagline: "Hits hard up close with a dodgeball.",
    defense: 0.2, speed: 1.1, primary: "dodgeball", secondary: "tennis",
    ratings: { attack: 4, defense: 3, speed: 4, range: 2 },
  },
  artkid: {
    id: "artkid", name: "Art Kid", emoji: "🎨",
    tagline: "Splatters everything in front of them.",
    defense: 0.15, speed: 1.08, primary: "paint", secondary: "crayon",
    ratings: { attack: 5, defense: 2, speed: 4, range: 1 },
  },
  nerd: {
    id: "nerd", name: "Nerd", emoji: "🤓",
    tagline: "Fast hands, fast feet, glass jaw.",
    defense: 0, speed: 1.12, primary: "rubberband", secondary: "pencil",
    ratings: { attack: 3, defense: 1, speed: 5, range: 3 },
  },
  clown: {
    id: "clown", name: "Class Clown", emoji: "🤡",
    tagline: "Picks you off from across the gym.",
    defense: 0, speed: 1.0, primary: "spitball", secondary: "peashooter",
    ratings: { attack: 5, defense: 1, speed: 3, range: 5 },
  },
  // Boss of the 7v1 mode; never in the class picker.
  principal: {
    id: "principal", name: "Principal", emoji: "👔",
    tagline: "Runs the school. Huge health, four special powers.",
    defense: 0.25, speed: 0.95, primary: "eraser", secondary: "redpen",
    maxHp: 10000, radius: 26,
    ratings: { attack: 5, defense: 5, speed: 2, range: 4 },
  },
};

export const PRINCIPAL_LOADOUT: Loadout = { archetype: "principal" };

/** The classes students can pick (everything but the Principal). */
export const ARCHETYPE_IDS: ArchetypeId[] = (Object.keys(ARCHETYPES) as ArchetypeId[]).filter((a) => a !== "principal");

export interface Loadout {
  archetype: ArchetypeId;
}

export const DEFAULT_LOADOUT: Loadout = { archetype: "teacher" };

export function sanitizeLoadout(value: unknown): Loadout {
  const v = (value ?? {}) as Partial<Loadout>;
  return {
    archetype: ARCHETYPE_IDS.includes(v.archetype as ArchetypeId) ? v.archetype! : DEFAULT_LOADOUT.archetype,
  };
}

export function weaponsOf(archetype: ArchetypeId): [WeaponId, WeaponId] {
  const a = ARCHETYPES[archetype];
  return [a.primary, a.secondary];
}

export function moveSpeedFor(archetype: ArchetypeId): number {
  return ARCHETYPES[archetype].speed;
}

export function maxHpFor(archetype: ArchetypeId): number {
  return ARCHETYPES[archetype].maxHp ?? MAX_HP;
}

export function radiusFor(archetype: ArchetypeId): number {
  return ARCHETYPES[archetype].radius ?? PLAYER_RADIUS;
}

// ---------------------------------------------------------------- Principal abilities

export type AbilityId =
  | "detention"
  | "lecture"
  | "quiz"
  | "intercom"
  | "hallpass"
  | "suspension"
  | "staffmeeting"
  | "reportcard";

export interface AbilityDef {
  id: AbilityId;
  name: string;
  emoji: string;
  /** Seconds before it can be used again. */
  cooldown: number;
  description: string;
}

export const ABILITIES: AbilityDef[] = [
  {
    id: "detention", name: "Detention", emoji: "🔒", cooldown: 20,
    description: "Pick a student in sight and lock them in the Detention room for 20–30 seconds. Nail the skill check for the full 30.",
  },
  {
    id: "lecture", name: "Stern Lecture", emoji: "📣", cooldown: 10,
    description: "Shout at every nearby student you can see: 20 damage and stunned for 1.5 seconds.",
  },
  {
    id: "quiz", name: "Pop Quiz", emoji: "📝", cooldown: 6,
    description: "Throw a ring of 16 quiz papers in every direction.",
  },
  {
    id: "intercom", name: "Intercom", emoji: "📢", cooldown: 20,
    description: "See every student through walls for 6 seconds. They'll hear the announcement.",
  },
];

/** The 1v1 Principal Duel's powers: built for fighting another Principal, not a crowd. */
export const DUEL_ABILITIES: AbilityDef[] = [
  {
    id: "hallpass", name: "Hall Pass", emoji: "📋", cooldown: 7,
    description: "Teleport-dash 350 units where you're aiming. Great for dodging.",
  },
  {
    id: "suspension", name: "Suspension Slip", emoji: "⏸️", cooldown: 11,
    description: "A fast slip that stuns whoever it hits for 2 seconds.",
  },
  {
    id: "staffmeeting", name: "Staff Meeting", emoji: "🛡️", cooldown: 16,
    description: "Nothing can hurt you for 2.5 seconds.",
  },
  {
    id: "reportcard", name: "Report Card", emoji: "📉", cooldown: 9,
    description: "Throw a huge, slow report card for 90 damage.",
  },
];

/** The Principal's four abilities in a given mode (the duel has its own set). */
export function abilitiesFor(mode: string): AbilityDef[] {
  return mode === "duel" ? DUEL_ABILITIES : ABILITIES;
}

export const ABILITY_IDS = [...ABILITIES, ...DUEL_ABILITIES].map((a) => a.id);

export const HALL_PASS_DISTANCE = 350;
export const STAFF_MEETING_TIME = 2.5;
/** In the duel, each Principal has far less health than the 7v1 boss. */
export const DUEL_PRINCIPAL_HP = 1500;
/** 7v1 boss buff: moves this much faster than a duel Principal. */
export const BOSS_SPEED_BONUS = 1.12;
/** 7v1 buff: everything the boss Principal throws hits this much harder. */
export const BOSS_DAMAGE_BONUS = 1.2;
/** 7v1: each student can be knocked out this many times, then they're out. */
export const STUDENT_LIVES = 3;

export const DETENTION_RANGE = 800;
export const DETENTION_MIN = 20;
export const DETENTION_MAX = 30;
export const LECTURE_RADIUS = 260;
export const LECTURE_STUN = 1.5;
export const QUIZ_PAPERS = 16;
export const INTERCOM_TIME = 6;

/** Skill check score (0 to 1) to seconds in detention. */
export function detentionSeconds(score: number) {
  const s = Math.max(0, Math.min(1, Number(score) || 0));
  return Math.round(DETENTION_MIN + (DETENTION_MAX - DETENTION_MIN) * s);
}

// ---------------------------------------------------------------- class supers

export type SuperId = "extracredit" | "meatball" | "dash" | "paintbomb" | "overclock" | "pies";

export interface SuperDef {
  id: SuperId;
  name: string;
  emoji: string;
  description: string;
}

/** Each student class's super. The Principal has abilities instead. */
export const SUPERS: Partial<Record<ArchetypeId, SuperDef>> = {
  teacher: {
    id: "extracredit", name: "Extra Credit", emoji: "📚",
    description: "Heal yourself and every teammate nearby for 60.",
  },
  lunchlady: {
    id: "meatball", name: "Mystery Meat", emoji: "🍖",
    description: "Hurl a fan of 7 big meatballs.",
  },
  jock: {
    id: "dash", name: "Touchdown Dash", emoji: "🏈",
    description: "Charge forward, flattening anyone in your path: 50 damage and a 1-second stun.",
  },
  artkid: {
    id: "paintbomb", name: "Paint Bomb", emoji: "💥",
    description: "Splash everyone nearby you can see: 45 damage and slowed for 3 seconds.",
  },
  nerd: {
    id: "overclock", name: "Overclock", emoji: "⚡",
    description: "Double fire rate and move 35% faster for 6 seconds.",
  },
  clown: {
    id: "pies", name: "Pie Barrage", emoji: "🥧",
    description: "Throw five heavy cream pies in a fan.",
  },
};

/** Damage you need to deal to fill your super from empty. */
export const SUPER_CHARGE_DAMAGE = 450;
/** It also fills on its own, from empty to full in this many seconds. */
export const SUPER_PASSIVE_SECONDS = 75;

export const EXTRA_CREDIT_HEAL = 60;
export const EXTRA_CREDIT_RADIUS = 320;
export const DASH_DISTANCE = 420;
export const DASH_STUN = 1;
export const PAINT_BOMB_RADIUS = 220;
export const PAINT_BOMB_SLOW = 3;
export const OVERCLOCK_TIME = 6;
export const OVERCLOCK_SPEED = 1.35;

/** Weapons that only come from supers and abilities; they don't charge your super. */
export const SPECIAL_WEAPONS: WeaponId[] = ["meatball", "pie", "tackle", "paintbomb", "quiz", "lecture", "suspension", "reportcard"];
