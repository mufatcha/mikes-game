/** On-foot gear for Wrathwater: weapons, Devil Fruits, crafting materials and recipes. */

export type WeaponId = "fists" | "cutlass" | "axe" | "flintlock" | "musket" | "blunderbuss";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  kind: "melee" | "gun";
  damage: number;
  /** Melee reach or gun range, in world units. */
  range: number;
  /** Seconds between swings or shots (guns include reloading). */
  cooldown: number;
  /** Shot pellets (blunderbuss) and their spread in radians. */
  pellets: number;
  spread: number;
  description: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fists: { id: "fists", name: "Fists", kind: "melee", damage: 12, range: 26, cooldown: 0.45, pellets: 1, spread: 0, description: "Better than nothing." },
  cutlass: { id: "cutlass", name: "Cutlass", kind: "melee", damage: 34, range: 34, cooldown: 0.55, pellets: 1, spread: 0, description: "A pirate's best friend." },
  axe: { id: "axe", name: "Boarding Axe", kind: "melee", damage: 55, range: 32, cooldown: 0.95, pellets: 1, spread: 0, description: "Slow, brutal swings." },
  flintlock: { id: "flintlock", name: "Flintlock Pistol", kind: "gun", damage: 42, range: 380, cooldown: 1.2, pellets: 1, spread: 0.03, description: "Quick shots at range." },
  musket: { id: "musket", name: "Musket", kind: "gun", damage: 90, range: 700, cooldown: 2.4, pellets: 1, spread: 0.008, description: "Long range, long reload." },
  blunderbuss: { id: "blunderbuss", name: "Blunderbuss", kind: "gun", damage: 17, range: 190, cooldown: 1.6, pellets: 7, spread: 0.22, description: "Point blank devastation." },
};

export const WEAPON_ORDER: WeaponId[] = ["fists", "cutlass", "axe", "flintlock", "musket", "blunderbuss"];

export type MaterialId = "wood" | "iron" | "powder";
export type Materials = Record<MaterialId, number>;
export const NO_MATERIALS: Materials = { wood: 0, iron: 0, powder: 0 };
export const MATERIAL_NAMES: Record<MaterialId, string> = { wood: "Timber", iron: "Iron", powder: "Gunpowder" };

export interface Recipe {
  weapon: WeaponId;
  materials: Partial<Materials>;
  gold: number;
}

export const RECIPES: Recipe[] = [
  { weapon: "cutlass", materials: { iron: 3, wood: 1 }, gold: 40 },
  { weapon: "axe", materials: { iron: 4, wood: 3 }, gold: 80 },
  { weapon: "flintlock", materials: { iron: 3, wood: 2, powder: 3 }, gold: 120 },
  { weapon: "blunderbuss", materials: { iron: 5, wood: 3, powder: 5 }, gold: 200 },
  { weapon: "musket", materials: { iron: 6, wood: 5, powder: 6 }, gold: 260 },
];

export type FruitId = "mera" | "goro" | "gomu" | "moku" | "gura";

export interface FruitDef {
  id: FruitId;
  name: string;
  power: string;
  /** What the power does on foot and at sea. */
  description: string;
  cooldown: number;
  color: string;
  swirl: string;
}

/**
 * Devil Fruits: one power each. Like in One Piece, eating one means you can
 * never swim again, and a second fruit would kill you.
 */
export const FRUITS: Record<FruitId, FruitDef> = {
  mera: {
    id: "mera", name: "Flame-Flame Fruit", power: "Fire Fist",
    description: "Hurl a blazing fireball that sets ships and foes alight.",
    cooldown: 6, color: "#f97316", swirl: "#fde047",
  },
  goro: {
    id: "goro", name: "Rumble-Rumble Fruit", power: "Thunderbolt",
    description: "Call lightning down on the nearest enemy you're facing.",
    cooldown: 8, color: "#60a5fa", swirl: "#e0f2fe",
  },
  gomu: {
    id: "gomu", name: "Gum-Gum Fruit", power: "Gum-Gum Pistol",
    description: "On foot: a stretching punch with huge reach. At sea: fire both broadsides at once. Bullets bounce off rubber (half damage).",
    cooldown: 7, color: "#a855f7", swirl: "#f0abfc",
  },
  moku: {
    id: "moku", name: "Smoke-Smoke Fruit", power: "Smoke Screen",
    description: "Vanish into smoke for 8 seconds: Marines lose track of you and you move faster.",
    cooldown: 25, color: "#9ca3af", swirl: "#f3f4f6",
  },
  gura: {
    id: "gura", name: "Tremor-Tremor Fruit", power: "Seaquake",
    description: "Crack the air: a shockwave hits everything around you, on land or at sea.",
    cooldown: 15, color: "#e5e7eb", swirl: "#a5b4fc",
  },
};

export const FRUIT_IDS = Object.keys(FRUITS) as FruitId[];

export const PLAYER_FOOT_HP = 120;
export const FRUIT_SELL_PRICE = 2500;
