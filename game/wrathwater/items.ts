/** On-foot gear for Wrathwater: weapons, Devil Fruits, crafting materials and recipes. */

export type WeaponId = "fists" | "dull_sword" | "cutlass" | "axe" | "flintlock" | "musket" | "blunderbuss" | "rapier" | "hammer" | "twin_pistols";

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
  dull_sword: { id: "dull_sword", name: "Dull Sword", kind: "melee", damage: 18, range: 30, cooldown: 0.6, pellets: 1, spread: 0, description: "Rusty and chipped. Every pirate starts somewhere." },
  cutlass: { id: "cutlass", name: "Cutlass", kind: "melee", damage: 34, range: 34, cooldown: 0.55, pellets: 1, spread: 0, description: "A pirate's best friend." },
  axe: { id: "axe", name: "Boarding Axe", kind: "melee", damage: 55, range: 32, cooldown: 0.95, pellets: 1, spread: 0, description: "Slow, brutal swings." },
  flintlock: { id: "flintlock", name: "Flintlock Pistol", kind: "gun", damage: 42, range: 380, cooldown: 1.2, pellets: 1, spread: 0.03, description: "Quick shots at range." },
  musket: { id: "musket", name: "Musket", kind: "gun", damage: 90, range: 700, cooldown: 2.4, pellets: 1, spread: 0.008, description: "Long range, long reload." },
  blunderbuss: { id: "blunderbuss", name: "Blunderbuss", kind: "gun", damage: 17, range: 190, cooldown: 1.6, pellets: 7, spread: 0.22, description: "Point blank devastation." },
  rapier: { id: "rapier", name: "Rapier", kind: "melee", damage: 24, range: 36, cooldown: 0.32, pellets: 1, spread: 0, description: "Quick, light thrusts: strike before they can blink." },
  hammer: { id: "hammer", name: "War Hammer", kind: "melee", damage: 80, range: 30, cooldown: 1.35, pellets: 1, spread: 0, description: "A slow, crushing swing that flattens anyone it lands on." },
  twin_pistols: { id: "twin_pistols", name: "Twin Flintlocks", kind: "gun", damage: 34, range: 360, cooldown: 1.0, pellets: 2, spread: 0.05, description: "Two pistols, fired together." },
};

export const WEAPON_ORDER: WeaponId[] = ["fists", "dull_sword", "cutlass", "rapier", "axe", "hammer", "flintlock", "twin_pistols", "musket", "blunderbuss"];

/** Every gun fires the same lead shot. A blunderbuss blast uses one. */
export const STARTING_AMMO = 10;
export const STARTING_WEAPONS: WeaponId[] = ["dull_sword", "blunderbuss"];
/** Pressing one shot at the blacksmith: this many rounds for these materials. */
export const SHOT_RECIPE = { rounds: 5, materials: { iron: 1, powder: 2 } as Partial<Record<MaterialId, number>> };

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
  { weapon: "rapier", materials: { iron: 4, wood: 1 }, gold: 150 },
  { weapon: "hammer", materials: { iron: 7, wood: 4 }, gold: 220 },
  { weapon: "twin_pistols", materials: { iron: 6, wood: 3, powder: 6 }, gold: 320 },
];

// ---------------------------------------------------------------- items you carry

/** Things you carry and use up: bombs, tonics, smoke. */
export type ItemId = "bomb" | "tonic" | "smoke";
export interface ItemDef {
  id: ItemId;
  name: string;
  /** The keyboard key that uses it. */
  key: string;
  description: string;
  /** Gold at a shop (towns and Blackwater Cove). */
  price: number;
  /** Or make it at the blacksmith from materials. */
  recipe?: Partial<Materials>;
}
export const ITEMS: Record<ItemId, ItemDef> = {
  bomb: { id: "bomb", name: "Powder Bomb", key: "G", description: "Throw it where you're looking: it bursts and hurts everyone nearby.", price: 60, recipe: { iron: 1, powder: 2 } },
  tonic: { id: "tonic", name: "Healing Tonic", key: "H", description: "Drink it to get 60 health back.", price: 45 },
  smoke: { id: "smoke", name: "Smoke Bomb", key: "X", description: "Vanish for 5 seconds: Marines lose track of you.", price: 80, recipe: { powder: 2, wood: 1 } },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const NO_ITEMS: Record<ItemId, number> = { bomb: 0, tonic: 0, smoke: 0 };

// ---------------------------------------------------------------- food

/**
 * You get hungry as you sail. Food you buy goes off after a while (counted in
 * minutes you've played): spoiled food still fills you up, but it can give
 * you food poisoning.
 */
export type FoodId = "biscuit" | "fish" | "fruit" | "meat";
export interface FoodDef {
  id: FoodId;
  name: string;
  /** How much it fills you (hunger is 0..100). */
  fill: number;
  price: number;
  /** Minutes of play before it spoils. */
  fresh: number;
}
export const FOODS: Record<FoodId, FoodDef> = {
  biscuit: { id: "biscuit", name: "Ship's Biscuit", fill: 15, price: 8, fresh: 30 },
  fish: { id: "fish", name: "Salted Fish", fill: 30, price: 18, fresh: 15 },
  fruit: { id: "fruit", name: "Fresh Fruit", fill: 25, price: 14, fresh: 8 },
  meat: { id: "meat", name: "Roast Meat", fill: 50, price: 35, fresh: 5 },
};
export const FOOD_IDS = Object.keys(FOODS) as FoodId[];
/** Food in your pack: what it is and the play time (seconds) when it spoils. */
export interface FoodItem {
  food: FoodId;
  spoils: number;
}
/** Hunger drains from 100 to 0 over this many seconds of play. */
export const HUNGER_TIME = 900;
/** Food poisoning lasts this long (seconds). */
export const POISON_TIME = 45;

// ---------------------------------------------------------------- you: levels and skills

/** Skills you put points into as you level up (one point a level). */
export type SkillId = "vitality" | "strength" | "agility" | "marksman" | "mastery";
export const SKILLS: Record<SkillId, { id: SkillId; name: string; per: string }> = {
  vitality: { id: "vitality", name: "Vitality", per: "+15 health" },
  strength: { id: "strength", name: "Strength", per: "+10% blade and fist damage" },
  agility: { id: "agility", name: "Agility", per: "+5% running speed" },
  marksman: { id: "marksman", name: "Marksmanship", per: "+10% gun damage, guns ready 5% sooner" },
  mastery: { id: "mastery", name: "Fruit Mastery", per: "Devil Fruit powers 6% sooner and 8% harder" },
};
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
export const SKILL_MAX = 10;
export const NO_SKILLS: Record<SkillId, number> = { vitality: 0, strength: 0, agility: 0, marksman: 0, mastery: 0 };

/** XP needed to reach level n + 1 from level n. */
export function xpForLevel(level: number) {
  return Math.round(80 * Math.pow(level, 1.45));
}
/** Your level from total XP, and how far into the next one you are. */
export function levelFromXp(xp: number) {
  let level = 1;
  let left = xp;
  while (left >= xpForLevel(level)) {
    left -= xpForLevel(level);
    level++;
  }
  return { level, into: left, need: xpForLevel(level) };
}

/** What your skills do, as multipliers. */
export function skillEffects(skills: Partial<Record<SkillId, number>>) {
  const s = (k: SkillId) => skills[k] ?? 0;
  return {
    maxHp: PLAYER_FOOT_HP + s("vitality") * 15,
    melee: 1 + s("strength") * 0.1,
    speed: 1 + s("agility") * 0.05,
    gunDamage: 1 + s("marksman") * 0.1,
    gunCooldown: 1 - s("marksman") * 0.05,
    fruitCooldown: 1 - s("mastery") * 0.06,
    fruitDamage: 1 + s("mastery") * 0.08,
  };
}

export type FruitId = "mera" | "goro" | "gomu" | "moku" | "gura" | "gale" | "iron" | "venom";

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
    id: "gomu", name: "Stretch Fruit", power: "Stretch Punch",
    description: "Your body turns stretchy: five moves, switch with T and use with R. Bullets bounce off you (half damage). Some say \"Stretch\" isn't its real name...",
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
  gale: {
    id: "gale", name: "Gale-Gale Fruit", power: "Gale Slash",
    description: "Command the wind: blades of air, tornadoes, and a tailwind at your back.",
    cooldown: 5, color: "#5eead4", swirl: "#ecfeff",
  },
  iron: {
    id: "iron", name: "Iron-Iron Fruit", power: "Iron Skin",
    description: "Turn your body to iron: shrug off blows, punch like a cannonball, and rain down iron.",
    cooldown: 16, color: "#71717a", swirl: "#d4d4d8",
  },
  venom: {
    id: "venom", name: "Venom-Venom Fruit", power: "Venom Spit",
    description: "Your body makes poison: spit it, breathe it out in clouds, and taint the sea.",
    cooldown: 4, color: "#65a30d", swirl: "#d9f99d",
  },
};

/**
 * Every fruit's moves (the Stretch Fruit's five are below, in STRETCH): T
 * switches between them, R uses the one selected. Each has its own cooldown.
 */
export type FruitMove =
  | "fireball" | "flameRing" | "fireRain"
  | "bolt" | "chain" | "thunderDash"
  | "screen" | "smokeFist" | "smokeBind"
  | "seaquake" | "quakePunch" | "tsunami"
  | "galeSlash" | "tornado" | "tailwind"
  | "ironSkin" | "ironFist" | "ironRain"
  | "venomSpit" | "poisonCloud" | "toxicTide";
export interface MoveDef {
  id: FruitMove;
  name: string;
  cooldown: number;
  foot: string;
  sea: string;
}
export const FRUIT_MOVES: Record<Exclude<FruitId, "gomu">, MoveDef[]> = {
  mera: [
    { id: "fireball", name: "Fire Fist", cooldown: 6, foot: "Hurl a blazing fireball.", sea: "Lob a fireball that sets a ship alight." },
    { id: "flameRing", name: "Flame Ring", cooldown: 12, foot: "A ring of fire bursts out all around you.", sea: "Set every ship near you burning." },
    { id: "fireRain", name: "Fire Rain", cooldown: 16, foot: "Fire falls in a line ahead of you.", sea: "Five fireballs rain down on the ship you aim at." },
  ],
  goro: [
    { id: "bolt", name: "Thunderbolt", cooldown: 8, foot: "Lightning strikes the nearest enemy you're facing.", sea: "Lightning strikes the ship you aim at." },
    { id: "chain", name: "Chain Lightning", cooldown: 12, foot: "Lightning jumps between up to four enemies near you.", sea: "Lightning jumps between up to three ships." },
    { id: "thunderDash", name: "Thunder Dash", cooldown: 9, foot: "Become lightning and flash forward, shocking everyone you pass.", sea: "Lightning drives your ship forward at huge speed." },
  ],
  moku: [
    { id: "screen", name: "Smoke Screen", cooldown: 25, foot: "Vanish into smoke for 8 seconds: Marines lose you and you move faster.", sea: "Your ship vanishes into smoke for 8 seconds." },
    { id: "smokeFist", name: "Smoke Fist", cooldown: 5, foot: "A fist of smoke punches whoever you aim at.", sea: "A smoke fist pounds the ship you aim at." },
    { id: "smokeBind", name: "Smoke Bind", cooldown: 14, foot: "Smoke wraps everyone near you: they can't fight back for 4 seconds.", sea: "Smoke chokes the guns of every ship near you for 6 seconds." },
  ],
  gura: [
    { id: "seaquake", name: "Seaquake", cooldown: 15, foot: "A shockwave hits everything around you.", sea: "A shockwave hits every ship near you." },
    { id: "quakePunch", name: "Quake Punch", cooldown: 9, foot: "Crack the air in front of you: a crushing blast where you aim.", sea: "A huge blast hits the ship you aim at." },
    { id: "tsunami", name: "Tsunami", cooldown: 22, foot: "Knock everyone around you flying.", sea: "A wave smashes every ship near you and drives them away." },
  ],
  gale: [
    { id: "galeSlash", name: "Gale Slash", cooldown: 5, foot: "A blade of wind flies a long way.", sea: "A blade of wind slices the ship you aim at." },
    { id: "tornado", name: "Tornado", cooldown: 14, foot: "A tornado flings everyone near you away.", sea: "A tornado shoves every ship near you away and batters them." },
    { id: "tailwind", name: "Tailwind", cooldown: 18, foot: "Run like the wind for 6 seconds.", sea: "The wind fills your sails: much faster for 5 seconds." },
  ],
  iron: [
    { id: "ironSkin", name: "Iron Skin", cooldown: 16, foot: "For 8 seconds you take a quarter of the damage.", sea: "For 8 seconds your hull takes a third of the damage." },
    { id: "ironFist", name: "Iron Fist", cooldown: 7, foot: "A punch like a cannonball on whoever's in front of you.", sea: "Fire both broadsides at once with iron-hard shot." },
    { id: "ironRain", name: "Iron Rain", cooldown: 15, foot: "Iron spikes crash down where you aim.", sea: "Four iron balls crash down on the ship you aim at." },
  ],
  venom: [
    { id: "venomSpit", name: "Venom Spit", cooldown: 4, foot: "Spit venom: it hurts and keeps poisoning.", sea: "Venom eats at the ship you aim at." },
    { id: "poisonCloud", name: "Poison Cloud", cooldown: 13, foot: "Breathe out a cloud that poisons everyone near you.", sea: "A poison cloud rolls over every ship near you." },
    { id: "toxicTide", name: "Toxic Tide", cooldown: 20, foot: "Poison seeps out across the ground in a wide ring.", sea: "The sea turns to poison around you, eating at every hull." },
  ],
};

/** The Stretch Fruit's real name, read in the vault at Ironmaw Bastion. */
export const KILL_ORDER = {
  name: "Kill Order Fruit",
  power: "Kill Order Punch",
  awakened: "Kill Order Awakening",
  color: "#b91c1c",
  swirl: "#0a0a0a",
  description:
    "Its real name, kept secret by the Marines: the Kill Order Fruit. Press V to awaken its secret form for 45 seconds: a crimson-and-black aura, bullets and cannonballs bounce off, blades only scratch, and every move becomes monstrous (far bigger, far harder, and back almost at once). Then it rests for 75 seconds.",
};

/** The Stretch Fruit's five moves. T switches between them, R uses the one selected. */
export type StretchMove = "punch" | "sling" | "grab" | "bounce" | "flurry";
export const STRETCH_MOVES: StretchMove[] = ["punch", "sling", "grab", "bounce", "flurry"];
export const STRETCH: Record<StretchMove, { name: string; cooldown: number; foot: string; sea: string; awakened: string }> = {
  punch: {
    name: "Stretch Punch", cooldown: 6,
    foot: "A punch that reaches across the street.",
    sea: "Fire both broadsides at once, reloaded or not.",
    awakened: "Reaches twice as far, hits five times as hard and ends in a shockwave. At sea it also smashes the ship you aim at.",
  },
  sling: {
    name: "Slingshot Launch", cooldown: 8,
    foot: "Stretch back and fling yourself forward, bowling over anyone in the way and slamming down where you land.",
    sea: "Sling your ship forward at huge speed and ram anything in the way.",
    awakened: "Twice the distance; the landing (or the ram) flattens everything around it.",
  },
  grab: {
    name: "Grab and Swing", cooldown: 9,
    foot: "Grab an enemy from far away, swing them through everyone around you and hurl them.",
    sea: "Grab an enemy ship, spin it around and fling it away.",
    awakened: "Grabs from twice as far and hurls them like a cannonball. Ships get torn apart.",
  },
  bounce: {
    name: "Bounce Body", cooldown: 16,
    foot: "Puff up for 6 seconds: bullets and blades bounce off and hit back the ones who threw them.",
    sea: "For 6 seconds, cannonballs bounce off your hull.",
    awakened: "Lasts 15 seconds and sends five times the damage back.",
  },
  flurry: {
    name: "Spinning Punch Flurry", cooldown: 11,
    foot: "A storm of fists for 1.5 seconds, pounding everything in front of you.",
    sea: "Pound the ship you aim at with a rain of giant fists.",
    awakened: "Spins all the way around you for 3 seconds, hitting everything in reach, three times as hard.",
  },
};

/** A fruit's name and power as you know them (the Stretch Fruit's changes once you know its real name). */
export function fruitInfo(id: FruitId, trueName: boolean): FruitDef {
  return id === "gomu" && trueName ? { ...FRUITS.gomu, ...KILL_ORDER } : FRUITS[id];
}

export const FRUIT_IDS = Object.keys(FRUITS) as FruitId[];

export const PLAYER_FOOT_HP = 120;
export const FRUIT_SELL_PRICE = 2500;
