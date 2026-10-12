import { MAX_HP, PLAYER_RADIUS, type GameMode, type Team } from "./constants";

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
  // The duel mascots' weapons and powers.
  | "berry"
  | "bigberry"
  | "berryblast"
  | "rollout"
  | "jam"
  | "seeds"
  | "wedge"
  | "squirt"
  | "peel"
  | "bigorange"
  | "segment"
  // Band Kid sections.
  | "tuba"
  | "trombone"
  | "drumsticks"
  | "cymbal"
  | "trumpet"
  | "fanfare"
  | "reed"
  | "piccolo"
  // Orchestra Kid sections (all strings).
  | "violin"
  | "pizzicato"
  | "viola"
  | "tremolo"
  | "cello"
  | "spiccato"
  | "doublebass"
  | "slap"
  | "pixel"
  | "controller"
  | "fingergun"
  | "spreadshot"
  | "tankshell"
  | "flamethrower"
  | "flare"
  | "afterburn"
  | "airblast"
  | "note";

export type ArchetypeId =
  | "teacher"
  | "lunchlady"
  | "jock"
  | "artkid"
  | "nerd"
  | "clown"
  | "bandkid"
  | "orchestra"
  | "gamer"
  | "pyro"
  | "principal"
  | "blueberry"
  | "orangepeel";

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
  /** Seconds a hit sets the target on fire for (afterburn). */
  burn?: number;
  /** Overrides how much gravity pulls it in 3D (negative floats up, like flames). */
  gravity?: number;
  /** Seconds a hit slows the target for. */
  slow?: number;
  /** Bursts into this many of another projectile when it lands or hits something. */
  burst?: { weapon: WeaponId; count: number };
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
  // Barry the Blueberry (duel mascot).
  berry: {
    id: "berry", name: "Blueberries", damage: 16, fireRate: 6, magSize: 24, reloadTime: 1.6,
    projectileSpeed: 1350, spread: 0.05, pellets: 1, range: 850, auto: true,
    radius: 5, color: "#4f46e5", style: "ball",
  },
  bigberry: {
    id: "bigberry", name: "Giant Berry", damage: 55, fireRate: 1.3, magSize: 3, reloadTime: 2.2,
    projectileSpeed: 1000, spread: 0.02, pellets: 1, range: 1100, auto: false,
    radius: 11, color: "#3730a3", style: "ball", bounces: 2,
  },
  berryblast: {
    id: "berryblast", name: "Berry Blast", damage: 24, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1200, spread: 0, pellets: 1, range: 900, auto: false,
    radius: 6, color: "#6366f1", style: "ball", bounces: 2,
  },
  rollout: {
    id: "rollout", name: "Roll Out", damage: 45, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1, spread: 0, pellets: 1, range: 1, auto: false,
    radius: 0, color: "#4f46e5", style: "ball",
  },
  jam: {
    id: "jam", name: "Jam Puddle", damage: 20, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1, spread: 0, pellets: 1, range: 1, auto: false,
    radius: 0, color: "#7c3aed", style: "blob",
  },
  // Peely the Orange (duel mascot).
  seeds: {
    id: "seeds", name: "Orange Seeds", damage: 11, fireRate: 10, magSize: 32, reloadTime: 1.6,
    projectileSpeed: 1600, spread: 0.06, pellets: 1, range: 750, auto: true,
    radius: 2, color: "#fef3c7", style: "streak",
  },
  wedge: {
    id: "wedge", name: "Orange Wedge", damage: 42, fireRate: 1.8, magSize: 6, reloadTime: 2,
    projectileSpeed: 1500, spread: 0.015, pellets: 1, range: 950, auto: false,
    radius: 5, color: "#f97316", style: "blob",
  },
  squirt: {
    id: "squirt", name: "Juice Squirt", damage: 12, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1300, spread: 0, pellets: 1, range: 450, auto: false,
    radius: 4, color: "#fb923c", style: "blob", slow: 2,
  },
  peel: {
    id: "peel", name: "Peel Trap", damage: 30, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1, spread: 0, pellets: 1, range: 1, auto: false,
    radius: 0, color: "#f97316", style: "blob", stun: 1.5,
  },
  bigorange: {
    id: "bigorange", name: "Big Orange", damage: 60, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 850, spread: 0, pellets: 1, range: 750, auto: false,
    radius: 15, color: "#ea580c", style: "ball", burst: { weapon: "segment", count: 8 },
  },
  segment: {
    id: "segment", name: "Orange Segment", damage: 22, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1000, spread: 0, pellets: 1, range: 380, auto: false,
    radius: 5, color: "#fdba74", style: "blob",
  },
  // Band Kid: Low Brass.
  tuba: {
    id: "tuba", name: "Tuba Blast", damage: 34, fireRate: 1.8, magSize: 6, reloadTime: 2,
    projectileSpeed: 950, spread: 0.03, pellets: 1, range: 750, auto: false,
    radius: 9, color: "#ca8a04", style: "blob",
  },
  trombone: {
    id: "trombone", name: "Trombone Slide", damage: 15, fireRate: 6, magSize: 18, reloadTime: 1.6,
    projectileSpeed: 1300, spread: 0.06, pellets: 1, range: 500, auto: true,
    radius: 4, color: "#facc15", style: "streak",
  },
  // Band Kid: Percussion.
  drumsticks: {
    id: "drumsticks", name: "Drumsticks", damage: 10, fireRate: 11, magSize: 30, reloadTime: 1.5,
    projectileSpeed: 1500, spread: 0.07, pellets: 1, range: 650, auto: true,
    radius: 2, color: "#d6a76b", style: "streak",
  },
  cymbal: {
    id: "cymbal", name: "Cymbal Crash", damage: 38, fireRate: 1.1, magSize: 3, reloadTime: 2,
    projectileSpeed: 1100, spread: 0.02, pellets: 1, range: 800, auto: false,
    radius: 10, color: "#fbbf24", style: "ball", bounces: 1, stun: 0.5,
  },
  // Band Kid: Brass.
  trumpet: {
    id: "trumpet", name: "Trumpet Blast", damage: 19, fireRate: 5, magSize: 15, reloadTime: 1.4,
    projectileSpeed: 1700, spread: 0.025, pellets: 1, range: 900, auto: false,
    radius: 3, color: "#fde047", style: "streak",
  },
  fanfare: {
    id: "fanfare", name: "Fanfare", damage: 12, fireRate: 1.4, magSize: 5, reloadTime: 2,
    projectileSpeed: 1300, spread: 0.18, pellets: 4, range: 450, auto: false,
    radius: 4, color: "#fef08a", style: "blob",
  },
  // Band Kid: Woodwind.
  reed: {
    id: "reed", name: "Reed Darts", damage: 26, fireRate: 3, magSize: 10, reloadTime: 1.6,
    projectileSpeed: 1900, spread: 0.012, pellets: 1, range: 1200, auto: false,
    radius: 2, color: "#a3e635", style: "streak",
  },
  piccolo: {
    id: "piccolo", name: "Piccolo Trill", damage: 9, fireRate: 12, magSize: 36, reloadTime: 1.6,
    projectileSpeed: 1600, spread: 0.08, pellets: 1, range: 550, auto: true,
    radius: 2, color: "#e0f2fe", style: "streak",
  },
  // Orchestra Kid (all strings): Violin.
  violin: {
    id: "violin", name: "Violin Bow", damage: 12, fireRate: 9, magSize: 30, reloadTime: 1.6,
    projectileSpeed: 1500, spread: 0.05, pellets: 1, range: 750, auto: true,
    radius: 2, color: "#b45309", style: "streak",
  },
  pizzicato: {
    id: "pizzicato", name: "Pizzicato", damage: 13, fireRate: 1.5, magSize: 6, reloadTime: 1.8,
    projectileSpeed: 1350, spread: 0.16, pellets: 4, range: 450, auto: false,
    radius: 3, color: "#fcd34d", style: "ball",
  },
  // Orchestra Kid: Viola.
  viola: {
    id: "viola", name: "Viola Bow", damage: 16, fireRate: 6.5, magSize: 24, reloadTime: 1.6,
    projectileSpeed: 1450, spread: 0.04, pellets: 1, range: 800, auto: true,
    radius: 3, color: "#92400e", style: "streak",
  },
  tremolo: {
    id: "tremolo", name: "Tremolo", damage: 7, fireRate: 14, magSize: 40, reloadTime: 1.6,
    projectileSpeed: 1500, spread: 0.1, pellets: 1, range: 500, auto: true,
    radius: 2, color: "#fbbf24", style: "streak",
  },
  // Orchestra Kid: Cello.
  cello: {
    id: "cello", name: "Cello Bow", damage: 30, fireRate: 2.4, magSize: 8, reloadTime: 1.8,
    projectileSpeed: 1250, spread: 0.025, pellets: 1, range: 900, auto: false,
    radius: 6, color: "#78350f", style: "ball",
  },
  spiccato: {
    id: "spiccato", name: "Spiccato", damage: 14, fireRate: 1.6, magSize: 6, reloadTime: 1.8,
    projectileSpeed: 1300, spread: 0.12, pellets: 3, range: 500, auto: false,
    radius: 4, color: "#d97706", style: "ball", bounces: 1,
  },
  // Orchestra Kid: Double Bass.
  doublebass: {
    id: "doublebass", name: "Double Bass Thump", damage: 48, fireRate: 1.2, magSize: 3, reloadTime: 2.2,
    projectileSpeed: 900, spread: 0.02, pellets: 1, range: 900, auto: false,
    radius: 13, color: "#451a03", style: "ball", bounces: 1, stun: 0.4,
  },
  slap: {
    id: "slap", name: "Slap Bass", damage: 20, fireRate: 3, magSize: 10, reloadTime: 1.6,
    projectileSpeed: 1300, spread: 0.04, pellets: 1, range: 600, auto: false,
    radius: 5, color: "#a16207", style: "blob",
  },
  // The Gamer.
  pixel: {
    id: "pixel", name: "Pixel Blaster", damage: 12, fireRate: 8, magSize: 32, reloadTime: 1.6,
    projectileSpeed: 1550, spread: 0.05, pellets: 1, range: 750, auto: true,
    radius: 3, color: "#4ade80", style: "blob",
  },
  controller: {
    id: "controller", name: "Controller Toss", damage: 40, fireRate: 1.5, magSize: 4, reloadTime: 1.9,
    projectileSpeed: 1200, spread: 0.02, pellets: 1, range: 850, auto: false,
    radius: 7, color: "#1f2937", style: "ball",
  },
  // What the Gamer shoots while playing as Cuphead, Mugman or Captain Churchill (never runs out).
  fingergun: {
    id: "fingergun", name: "Cuphead's Peashooter", damage: 11, fireRate: 8, magSize: 1, reloadTime: 1,
    projectileSpeed: 1700, spread: 0.03, pellets: 1, range: 700, auto: true,
    radius: 3, color: "#93c5fd", style: "streak",
  },
  spreadshot: {
    id: "spreadshot", name: "Mugman's Spread", damage: 9, fireRate: 2.6, magSize: 1, reloadTime: 1,
    projectileSpeed: 1400, spread: 0.2, pellets: 3, range: 450, auto: true,
    radius: 4, color: "#c4b5fd", style: "blob",
  },
  tankshell: {
    id: "tankshell", name: "Churchill's Tank Shell", damage: 45, fireRate: 1.1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1100, spread: 0.01, pellets: 1, range: 900, auto: true,
    radius: 8, color: "#3f3f46", style: "ball",
  },
  // The Pyro.
  flamethrower: {
    id: "flamethrower", name: "Flamethrower", damage: 4, fireRate: 20, magSize: 200, reloadTime: 3,
    projectileSpeed: 700, spread: 0.18, pellets: 1, range: 270, auto: true,
    radius: 9, color: "#f97316", style: "blob", burn: 3, gravity: -0.15,
  },
  flare: {
    id: "flare", name: "Flare Gun", damage: 25, fireRate: 1.4, magSize: 16, reloadTime: 1.6,
    projectileSpeed: 1500, spread: 0.01, pellets: 1, range: 950, auto: false,
    radius: 4, color: "#fb7185", style: "streak", burn: 4,
  },
  afterburn: {
    id: "afterburn", name: "Afterburn", damage: 4, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1, spread: 0, pellets: 1, range: 1, auto: false,
    radius: 0, color: "#f97316", style: "blob",
  },
  airblast: {
    id: "airblast", name: "Airblast", damage: 15, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1, spread: 0, pellets: 1, range: 1, auto: false,
    radius: 0, color: "#e0f2fe", style: "blob",
  },
  // Orchestra Kid super.
  note: {
    id: "note", name: "Crescendo", damage: 32, fireRate: 1, magSize: 1, reloadTime: 1,
    projectileSpeed: 1300, spread: 0, pellets: 1, range: 900, auto: false,
    radius: 7, color: "#c084fc", style: "ball",
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
  // Their weapons come from the section you pick (see SECTIONS); these are the defaults.
  bandkid: {
    id: "bandkid", name: "Band Kid", emoji: "🎺",
    tagline: "Marches to the beat of their own drum. Pick your section.",
    defense: 0.15, speed: 1.05, primary: "tuba", secondary: "trombone",
    ratings: { attack: 3, defense: 2, speed: 4, range: 3 },
  },
  orchestra: {
    id: "orchestra", name: "Orchestra Kid", emoji: "🎻",
    tagline: "First chair, first strike. Strings only; two can play on a team.",
    defense: 0.1, speed: 1.0, primary: "violin", secondary: "pizzicato",
    ratings: { attack: 3, defense: 2, speed: 3, range: 4 },
  },
  gamer: {
    id: "gamer", name: "Gamer", emoji: "🎮",
    tagline: "Pixel-perfect aim, and a super that turns you into Cuphead, Mugman or Captain Churchill.",
    defense: 0.05, speed: 1.05, primary: "pixel", secondary: "controller",
    ratings: { attack: 3, defense: 1, speed: 4, range: 3 },
  },
  pyro: {
    id: "pyro", name: "Pyro", emoji: "🔥",
    tagline: "Mmph mmph! Sets everything up close on fire, and blasts your throws right back at you.",
    defense: 0.2, speed: 1.0, primary: "flamethrower", secondary: "flare",
    ratings: { attack: 5, defense: 3, speed: 3, range: 1 },
  },
  // Boss of the 7v1 mode; never in the class picker.
  principal: {
    id: "principal", name: "Principal", emoji: "👔",
    tagline: "Runs the school. Huge health, four special powers.",
    defense: 0.25, speed: 0.95, primary: "eraser", secondary: "redpen",
    maxHp: 10000, radius: 26,
    ratings: { attack: 5, defense: 5, speed: 2, range: 4 },
  },
  // The two school mascots, who fight each other in the 1v1 duel; never in the class picker.
  blueberry: {
    id: "blueberry", name: "Barry the Blueberry", emoji: "🫐",
    tagline: "The Blueberries' mascot. Round, bouncy and full of juice.",
    defense: 0.25, speed: 1.0, primary: "berry", secondary: "bigberry",
    maxHp: 1500, radius: 24,
    ratings: { attack: 4, defense: 4, speed: 3, range: 3 },
  },
  orangepeel: {
    id: "orangepeel", name: "Peely the Orange", emoji: "🍊",
    tagline: "The Orange Peels' mascot. Zesty, slippery and thick-skinned.",
    defense: 0.25, speed: 1.0, primary: "seeds", secondary: "wedge",
    maxHp: 1500, radius: 24,
    ratings: { attack: 4, defense: 4, speed: 3, range: 3 },
  },
};

/** Characters with four special powers instead of a class super: the Principal and the mascots. */
export const BOSS_ARCHETYPES: ArchetypeId[] = ["principal", "blueberry", "orangepeel"];

export function hasAbilities(archetype: ArchetypeId) {
  return BOSS_ARCHETYPES.includes(archetype);
}

/** The character a fixed seat plays: the 7v1 Principal, or each side's mascot in the duel. */
export function seatLoadout(mode: GameMode, team: Team): Loadout | null {
  if (mode === "boss" && team === 1) return { archetype: "principal" };
  if (mode === "duel") return { archetype: team === 0 ? "blueberry" : "orangepeel" };
  return null;
}

/** The classes students can pick (not the Principal or the mascots). */
export const ARCHETYPE_IDS: ArchetypeId[] = (Object.keys(ARCHETYPES) as ArchetypeId[]).filter((a) => !hasAbilities(a));

export type SectionId =
  | "lowbrass"
  | "percussion"
  | "brass"
  | "woodwind"
  | "violins"
  | "violas"
  | "cellos"
  | "basses";

/** A section of the band or orchestra: which instrument you play, and so what you throw. */
export interface SectionDef {
  id: SectionId;
  name: string;
  emoji: string;
  primary: WeaponId;
  secondary: WeaponId;
}

/** Classes where you also pick a section. */
export const SECTIONS: Partial<Record<ArchetypeId, SectionDef[]>> = {
  bandkid: [
    { id: "lowbrass", name: "Low Brass", emoji: "📯", primary: "tuba", secondary: "trombone" },
    { id: "percussion", name: "Percussion", emoji: "🥁", primary: "drumsticks", secondary: "cymbal" },
    { id: "brass", name: "Brass", emoji: "🎺", primary: "trumpet", secondary: "fanfare" },
    { id: "woodwind", name: "Woodwind", emoji: "🎷", primary: "reed", secondary: "piccolo" },
  ],
  orchestra: [
    { id: "violins", name: "Violin", emoji: "🎻", primary: "violin", secondary: "pizzicato" },
    { id: "violas", name: "Viola", emoji: "🎻", primary: "viola", secondary: "tremolo" },
    { id: "cellos", name: "Cello", emoji: "🎻", primary: "cello", secondary: "spiccato" },
    { id: "basses", name: "Double Bass", emoji: "🎻", primary: "doublebass", secondary: "slap" },
  ],
};

export function sectionOf(archetype: ArchetypeId, section?: SectionId): SectionDef | undefined {
  const list = SECTIONS[archetype];
  return list?.find((s) => s.id === section) ?? list?.[0];
}

/** How many of a class one team can have: just one, except the Orchestra Kid. */
export function classLimit(archetype: ArchetypeId) {
  return archetype === "orchestra" ? 2 : 1;
}

export interface Loadout {
  archetype: ArchetypeId;
  /** Band and Orchestra Kids: which section they play in. */
  section?: SectionId;
}

export const DEFAULT_LOADOUT: Loadout = { archetype: "teacher" };

export function sanitizeLoadout(value: unknown): Loadout {
  const v = (value ?? {}) as Partial<Loadout>;
  const archetype = ARCHETYPE_IDS.includes(v.archetype as ArchetypeId) ? v.archetype! : DEFAULT_LOADOUT.archetype;
  const section = sectionOf(archetype, v.section)?.id;
  return section ? { archetype, section } : { archetype };
}

/** A class's two weapons; for the band and orchestra, the section's instruments. */
export function weaponsOf(archetype: ArchetypeId, section?: SectionId): [WeaponId, WeaponId] {
  const a = sectionOf(archetype, section) ?? ARCHETYPES[archetype];
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

// ---------------------------------------------------------------- Principal and mascot abilities

export type AbilityId =
  | "detention"
  | "lecture"
  | "quiz"
  | "intercom"
  // Barry the Blueberry
  | "berryblast"
  | "rollout"
  | "jam"
  | "antioxidants"
  // Peely the Orange
  | "squirt"
  | "peel"
  | "rind"
  | "bigorange";

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

/** Barry the Blueberry's powers in the duel. */
export const BLUEBERRY_ABILITIES: AbilityDef[] = [
  {
    id: "berryblast", name: "Berry Blast", emoji: "🫐", cooldown: 6,
    description: "Throw a fan of 5 bouncy blueberries that ricochet off walls.",
  },
  {
    id: "rollout", name: "Roll Out", emoji: "🌀", cooldown: 8,
    description: "Curl up and roll where you aim, flattening anyone in the way: 45 damage and a 1-second stun.",
  },
  {
    id: "jam", name: "Jam Puddle", emoji: "🍇", cooldown: 14,
    description: "Splat a puddle of sticky jam where you aim. Enemies in it are slowed and take 40 damage a second for 5 seconds.",
  },
  {
    id: "antioxidants", name: "Antioxidants", emoji: "💙", cooldown: 18,
    description: "Heal 300 health and move 30% faster for 4 seconds.",
  },
];

/** Peely the Orange's powers in the duel. */
export const ORANGE_ABILITIES: AbilityDef[] = [
  {
    id: "squirt", name: "Juice Squirt", emoji: "💦", cooldown: 5,
    description: "Spray 7 drops of sticky juice in a cone. Every drop that hits slows them for 2 seconds.",
  },
  {
    id: "peel", name: "Peel Trap", emoji: "🟠", cooldown: 8,
    description: "Drop a slippery peel at your feet. The first enemy to step on it slips: 30 damage and stunned for 1.5 seconds. Up to 3 at once.",
  },
  {
    id: "rind", name: "Thick Rind", emoji: "🛡️", cooldown: 16,
    description: "Nothing can hurt you for 2.5 seconds.",
  },
  {
    id: "bigorange", name: "Big Orange", emoji: "🍊", cooldown: 9,
    description: "Lob a huge orange (60 damage) that bursts into 8 juicy segments when it hits something or lands.",
  },
];

/** A character's four powers, in ability-key order (none for student classes). */
export function abilitiesOf(archetype: ArchetypeId): AbilityDef[] {
  if (archetype === "principal") return ABILITIES;
  if (archetype === "blueberry") return BLUEBERRY_ABILITIES;
  if (archetype === "orangepeel") return ORANGE_ABILITIES;
  return [];
}

export const ABILITY_IDS = [...ABILITIES, ...BLUEBERRY_ABILITIES, ...ORANGE_ABILITIES].map((a) => a.id);

export const ROLL_DISTANCE = 420;
export const ROLL_STUN = 1;
/** Jam Puddle: thrown up to this far, this big, lasting this long; hurts every half second. */
export const JAM_RANGE = 320;
export const JAM_RADIUS = 110;
export const JAM_TIME = 5;
export const JAM_DPS = 40;
export const ANTIOXIDANT_HEAL = 300;
export const ANTIOXIDANT_TIME = 4;
export const ANTIOXIDANT_SPEED = 1.3;
export const SQUIRT_DROPS = 7;
export const PEEL_RADIUS = 26;
export const PEEL_TIME = 30;
export const MAX_PEELS = 3;
export const RIND_TIME = 2.5;
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

export type SuperId =
  | "extracredit"
  | "meatball"
  | "dash"
  | "paintbomb"
  | "overclock"
  | "pies"
  | "fightsong"
  | "crescendo"
  | "summon"
  | "airblast";

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
  bandkid: {
    id: "fightsong", name: "Fight Song", emoji: "📣",
    description: "Strike up the school song: you and every teammate nearby heal 25 and move 30% faster for 6 seconds.",
  },
  orchestra: {
    id: "crescendo", name: "Crescendo", emoji: "🎼",
    description: "Swell to a fortissimo: a wide fan of 9 big music notes.",
  },
  gamer: {
    id: "summon", name: "Character Select", emoji: "🎮",
    description: "Roll a character and play as them: Cuphead or Mugman for 12 seconds, or (rarer) Captain Churchill in his tank for 10.",
  },
  pyro: {
    id: "airblast", name: "Airblast", emoji: "💨",
    description: "A blast of compressed air: knocks back everyone in front of you and sends their throws flying back at them.",
  },
};

/** Who the Gamer's super can turn you into, and how likely each is. */
export type CompanionKind = "cuphead" | "mugman" | "churchill";
export const COMPANIONS: Record<
  CompanionKind,
  {
    name: string;
    emoji: string;
    chance: number;
    secs: number;
    /** What you shoot while you're them (no reloading). */
    weapon: WeaponId;
    /** Movement speed multiplier. */
    speed: number;
    /** Fraction of incoming damage ignored. */
    defense: number;
  }
> = {
  cuphead: { name: "Cuphead", emoji: "☕", chance: 0.4, secs: 12, weapon: "fingergun", speed: 1.15, defense: 0.1 },
  mugman: { name: "Mugman", emoji: "🍺", chance: 0.4, secs: 12, weapon: "spreadshot", speed: 1.15, defense: 0.1 },
  churchill: { name: "Captain Churchill", emoji: "🪖", chance: 0.2, secs: 10, weapon: "tankshell", speed: 0.8, defense: 0.55 },
};

/** Roll the Gamer's super. */
export function rollCompanion(r = Math.random()): CompanionKind {
  if (r < COMPANIONS.cuphead.chance) return "cuphead";
  if (r < COMPANIONS.cuphead.chance + COMPANIONS.mugman.chance) return "mugman";
  return "churchill";
}

export const AIRBLAST_RANGE = 230;
export const AIRBLAST_CONE = (40 * Math.PI) / 180;
export const AIRBLAST_PUSH = 200;
/** Afterburn: this much damage every half second while you're on fire. */
export const AFTERBURN_DAMAGE = 4;

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
export const FIGHT_SONG_RADIUS = 320;
export const FIGHT_SONG_TIME = 6;
export const FIGHT_SONG_HEAL = 25;

/** Weapons that only come from supers and abilities; they don't charge your super. */
export const SPECIAL_WEAPONS: WeaponId[] = [
  "meatball",
  "pie",
  "tackle",
  "paintbomb",
  "quiz",
  "lecture",
  "berryblast",
  "rollout",
  "jam",
  "squirt",
  "peel",
  "bigorange",
  "segment",
  "note",
  "fingergun",
  "spreadshot",
  "tankshell",
  "afterburn",
  "airblast",
];
