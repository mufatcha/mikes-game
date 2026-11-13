import { useSyncExternalStore } from "react";
import { ARCHETYPE_IDS, DEFAULT_LOADOUT, sanitizeLoadout, type Loadout } from "@/shared/archetypes";
import { levelsFromXp, type ClassXp } from "@/shared/progress";

export const GAME_TITLE = "School Wars";

const NAME_KEY = "mg.name";
const LOADOUT_KEY = "mg.loadout";

const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); settings just won't persist.
  }
  listeners.forEach((fn) => fn());
}

export function useSavedName() {
  return useSyncExternalStore(subscribe, () => read(NAME_KEY) ?? "", () => "");
}

export function saveName(name: string) {
  write(NAME_KEY, name.trim().slice(0, 16));
}

// Cache the parsed object so useSyncExternalStore sees a stable reference.
let cachedRaw: string | null | undefined;
let cachedLoadout: Loadout = DEFAULT_LOADOUT;

function readLoadout(): Loadout {
  const raw = read(LOADOUT_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedLoadout = raw ? sanitizeLoadout(JSON.parse(raw)) : DEFAULT_LOADOUT;
    } catch {
      cachedLoadout = DEFAULT_LOADOUT;
    }
  }
  return cachedLoadout;
}

export function useSavedLoadout() {
  return useSyncExternalStore(subscribe, readLoadout, () => DEFAULT_LOADOUT);
}

export function getSavedLoadout() {
  return readLoadout();
}

export function saveLoadout(loadout: Loadout) {
  write(LOADOUT_KEY, JSON.stringify(loadout));
}

export const KEY_ACTIONS = [
  { id: "up", label: "Move up" },
  { id: "down", label: "Move down" },
  { id: "left", label: "Move left" },
  { id: "right", label: "Move right" },
  { id: "reload", label: "Reload" },
  { id: "weapon1", label: "Weapon 1" },
  { id: "weapon2", label: "Weapon 2" },
  { id: "swap", label: "Switch weapon" },
  { id: "scoreboard", label: "Scoreboard (hold)" },
  { id: "loadout", label: "Change class" },
  { id: "jump", label: "Jump" },
  { id: "sprint", label: "Sprint (hold)" },
  { id: "crouch", label: "Crouch (hold)" },
  { id: "super", label: "Super" },
  { id: "ability1", label: "Power 1 (Detention / Berry Blast / Juice Squirt)" },
  { id: "ability2", label: "Power 2 (Lecture / Roll Out / Peel Trap)" },
  { id: "ability3", label: "Power 3 (Pop Quiz / Jam Puddle / Thick Rind)" },
  { id: "ability4", label: "Power 4 (Intercom / Antioxidants / Big Orange)" },
] as const;

/** Key actions for the Principal's or a mascot's four powers, in abilitiesOf(archetype) order. */
export const ABILITY_ACTIONS = ["ability1", "ability2", "ability3", "ability4"] as const;

export type KeyAction = (typeof KEY_ACTIONS)[number]["id"];
export type Keybinds = Record<KeyAction, string>;

/** Key binds are stored as KeyboardEvent.code values, so they follow key position, not layout. */
export const DEFAULT_KEYBINDS: Keybinds = {
  up: "KeyW",
  down: "KeyS",
  left: "KeyA",
  right: "KeyD",
  reload: "KeyR",
  weapon1: "Digit1",
  weapon2: "Digit2",
  swap: "KeyQ",
  scoreboard: "Tab",
  loadout: "KeyB",
  jump: "Space",
  sprint: "ShiftLeft",
  crouch: "KeyC",
  super: "KeyV",
  ability1: "KeyE",
  ability2: "KeyF",
  ability3: "KeyZ",
  ability4: "KeyX",
};

/** Esc always opens the menu, so it can't be bound to anything else. */
export const RESERVED_KEY = "Escape";

const KEYBINDS_KEY = "mg.keybinds";
let cachedBindsRaw: string | null | undefined;
let cachedBinds: Keybinds = DEFAULT_KEYBINDS;

function readKeybinds(): Keybinds {
  const raw = read(KEYBINDS_KEY);
  if (raw !== cachedBindsRaw) {
    cachedBindsRaw = raw;
    cachedBinds = DEFAULT_KEYBINDS;
    try {
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      cachedBinds = { ...DEFAULT_KEYBINDS };
      for (const { id } of KEY_ACTIONS) {
        const code = parsed[id];
        if (typeof code === "string" && code && code !== RESERVED_KEY) cachedBinds[id] = code;
      }
      // Binds saved before jump and crouch existed had Super on Space and Power 3 on C;
      // move those to their new defaults so Space jumps and C crouches.
      if (parsed.jump === undefined && cachedBinds.super === cachedBinds.jump) cachedBinds.super = DEFAULT_KEYBINDS.super;
      if (parsed.crouch === undefined && cachedBinds.ability3 === cachedBinds.crouch) {
        cachedBinds.ability3 = DEFAULT_KEYBINDS.ability3;
      }
    } catch {
      cachedBinds = DEFAULT_KEYBINDS;
    }
  }
  return cachedBinds;
}

export function useKeybinds() {
  return useSyncExternalStore(subscribe, readKeybinds, () => DEFAULT_KEYBINDS);
}

export function getKeybinds() {
  return readKeybinds();
}

/** Bind a key to an action. If another action already uses that key, the two swap keys. */
export function setKeybind(action: KeyAction, code: string) {
  if (code === RESERVED_KEY) return;
  const current = readKeybinds();
  const next = { ...current, [action]: code };
  for (const { id } of KEY_ACTIONS) {
    if (id !== action && current[id] === code) next[id] = current[action];
  }
  write(KEYBINDS_KEY, JSON.stringify(next));
}

export function resetKeybinds() {
  write(KEYBINDS_KEY, JSON.stringify(DEFAULT_KEYBINDS));
}

// ---------------------------------------------------------------- class XP

const XP_KEY = "mg.xp";
let cachedXpRaw: string | null | undefined;
let cachedXp: ClassXp = {};

function readXp(): ClassXp {
  const raw = read(XP_KEY);
  if (raw !== cachedXpRaw) {
    cachedXpRaw = raw;
    cachedXp = {};
    try {
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      for (const id of ARCHETYPE_IDS) {
        const v = Number(parsed[id]);
        if (Number.isFinite(v) && v > 0) cachedXp[id] = Math.floor(v);
      }
    } catch {
      cachedXp = {};
    }
  }
  return cachedXp;
}

/** XP earned with each class, saved in this browser. */
export function useClassXp() {
  return useSyncExternalStore(subscribe, readXp, () => ({}) as ClassXp);
}

export function getClassLevels() {
  return levelsFromXp(readXp());
}

/** Add XP earned in a match. */
export function addClassXp(earned: ClassXp) {
  const next: ClassXp = { ...readXp() };
  for (const id of ARCHETYPE_IDS) {
    const gain = Math.floor(Number(earned[id]) || 0);
    if (gain > 0) next[id] = (next[id] ?? 0) + gain;
  }
  write(XP_KEY, JSON.stringify(next));
}

/** Thumbsticks and buttons: "auto" shows them on phones and tablets only. */
export type TouchControlsMode = "auto" | "on" | "off";
const TOUCH_KEY = "mg.touch";

function readTouchMode(): TouchControlsMode {
  const raw = read(TOUCH_KEY);
  return raw === "on" || raw === "off" ? raw : "auto";
}

export function useTouchControlsMode() {
  return useSyncExternalStore(subscribe, readTouchMode, () => "auto" as const);
}

export function saveTouchControlsMode(mode: TouchControlsMode) {
  write(TOUCH_KEY, mode);
}

// ---------------------------------------------------------------- game controller

/** Controller actions you can move to another button. (Start is always the menu; the D-pad is the four powers.) */
export const PAD_ACTIONS = [
  { id: "fire", label: "Throw" },
  { id: "jump", label: "Jump" },
  { id: "crouch", label: "Crouch (hold)" },
  { id: "sprint", label: "Sprint (hold)" },
  { id: "reload", label: "Reload" },
  { id: "swap", label: "Switch weapon" },
  { id: "super", label: "Super" },
  { id: "scoreboard", label: "Scoreboard (hold)" },
] as const;
export type PadAction = (typeof PAD_ACTIONS)[number]["id"];

/** Standard controller button numbers, as the browser reports them. */
export const PAD_START = 9;
export const PAD_DPAD = [12, 15, 13, 14] as const; // up, right, down, left: powers 1-4
/** Buttons that can't be given to an action (the menu, the D-pad, the home button). */
export const PAD_RESERVED = [PAD_START, 12, 13, 14, 15, 16];
const PAD_BUTTON_NAMES = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Back", "Start", "L3", "R3", "D-pad ↑", "D-pad ↓", "D-pad ←", "D-pad →", "Home"];

export function padButtonLabel(index: number) {
  return PAD_BUTTON_NAMES[index] ?? `Button ${index}`;
}

export type AimAssist = "off" | "low" | "high";

export interface PadSettings {
  /** First-person turning speed, as a multiple of normal (0.3 to 3). */
  lookSpeed: number;
  /** How far out the top-down crosshair goes, as a multiple of normal (0.5 to 1.5). */
  aimReach: number;
  /** How far a stick must move before it counts (0.05 to 0.4), to stop drift. */
  deadZone: number;
  /** Push the right stick up to look down in first person. */
  invertY: boolean;
  /** Gently pull your aim toward an enemy you're already aiming near. */
  aimAssist: AimAssist;
  vibration: boolean;
  /** Aim with the left stick and move with the right. */
  swapSticks: boolean;
  buttons: Record<PadAction, number>;
}

export const DEFAULT_PAD_SETTINGS: PadSettings = {
  lookSpeed: 1,
  aimReach: 1,
  deadZone: 0.18,
  invertY: false,
  aimAssist: "low",
  vibration: true,
  swapSticks: false,
  buttons: { fire: 7, jump: 0, crouch: 1, sprint: 6, reload: 2, swap: 3, super: 5, scoreboard: 8 },
};

const PAD_KEY = "mg.pad";
let cachedPadRaw: string | null | undefined;
let cachedPad: PadSettings = DEFAULT_PAD_SETTINGS;

const clampNum = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

function readPadSettings(): PadSettings {
  const raw = read(PAD_KEY);
  if (raw !== cachedPadRaw) {
    cachedPadRaw = raw;
    cachedPad = DEFAULT_PAD_SETTINGS;
    try {
      const p = raw ? (JSON.parse(raw) as Partial<PadSettings>) : {};
      const d = DEFAULT_PAD_SETTINGS;
      const buttons = { ...d.buttons };
      for (const { id } of PAD_ACTIONS) {
        const b = Number(p.buttons?.[id]);
        if (Number.isInteger(b) && b >= 0 && b < 32 && !PAD_RESERVED.includes(b)) buttons[id] = b;
      }
      cachedPad = {
        lookSpeed: clampNum(p.lookSpeed, 0.3, 3, d.lookSpeed),
        aimReach: clampNum(p.aimReach, 0.5, 1.5, d.aimReach),
        deadZone: clampNum(p.deadZone, 0.05, 0.4, d.deadZone),
        invertY: typeof p.invertY === "boolean" ? p.invertY : d.invertY,
        aimAssist: p.aimAssist === "off" || p.aimAssist === "high" || p.aimAssist === "low" ? p.aimAssist : d.aimAssist,
        vibration: typeof p.vibration === "boolean" ? p.vibration : d.vibration,
        swapSticks: typeof p.swapSticks === "boolean" ? p.swapSticks : d.swapSticks,
        buttons,
      };
    } catch {
      cachedPad = DEFAULT_PAD_SETTINGS;
    }
  }
  return cachedPad;
}

export function usePadSettings() {
  return useSyncExternalStore(subscribe, readPadSettings, () => DEFAULT_PAD_SETTINGS);
}

export function getPadSettings() {
  return readPadSettings();
}

export function savePadSettings(patch: Partial<Omit<PadSettings, "buttons">>) {
  write(PAD_KEY, JSON.stringify({ ...readPadSettings(), ...patch }));
}

/** Put an action on a controller button. If another action already uses it, the two swap. */
export function setPadButton(action: PadAction, button: number) {
  if (PAD_RESERVED.includes(button)) return;
  const current = readPadSettings();
  const buttons = { ...current.buttons, [action]: button };
  for (const { id } of PAD_ACTIONS) {
    if (id !== action && current.buttons[id] === button) buttons[id] = current.buttons[action];
  }
  write(PAD_KEY, JSON.stringify({ ...current, buttons }));
}

export function resetPadSettings() {
  write(PAD_KEY, JSON.stringify(DEFAULT_PAD_SETTINGS));
}


// ---------------------------------------------------------------- VR HUD

/** The pieces of the HUD you can place in VR. */
export const VR_HUD_ITEMS = [
  { id: "status", label: "Health & ammo" },
  { id: "powers", label: "Powers & super" },
  { id: "score", label: "Team score / boss bar" },
  { id: "minimap", label: "Minimap" },
  { id: "feed", label: "Kill feed" },
  { id: "messages", label: "Messages (knocked out, respawning…)" },
  { id: "scoreboard", label: "Scoreboard" },
] as const;
export type VrHudItem = (typeof VR_HUD_ITEMS)[number]["id"];
/** Where a HUD piece goes in VR: on an arm, floating in front of you, or not shown. */
export type VrSpot = "left" | "right" | "view" | "off";
export const VR_SPOTS: [VrSpot, string][] = [
  ["left", "Left arm"],
  ["right", "Right arm"],
  ["view", "In front"],
  ["off", "Hidden"],
];

export const DEFAULT_VR_HUD: Record<VrHudItem, VrSpot> = {
  status: "left",
  powers: "left",
  score: "left",
  minimap: "left",
  feed: "left",
  messages: "left",
  scoreboard: "right",
};

const VR_KEY = "mg.vrhud";
let cachedVrRaw: string | null | undefined;
let cachedVr: Record<VrHudItem, VrSpot> = DEFAULT_VR_HUD;

function readVrHud(): Record<VrHudItem, VrSpot> {
  const raw = read(VR_KEY);
  if (raw !== cachedVrRaw) {
    cachedVrRaw = raw;
    const out = { ...DEFAULT_VR_HUD };
    try {
      const p = raw ? (JSON.parse(raw) as Partial<Record<VrHudItem, string>>) : {};
      for (const { id } of VR_HUD_ITEMS) {
        const spot = p[id];
        if (VR_SPOTS.some(([s]) => s === spot)) out[id] = spot as VrSpot;
      }
    } catch {
      // Bad saved data: use the defaults.
    }
    cachedVr = out;
  }
  return cachedVr;
}

export function useVrHud() {
  return useSyncExternalStore(subscribe, readVrHud, () => DEFAULT_VR_HUD);
}

export function getVrHud() {
  return readVrHud();
}

export function setVrSpot(item: VrHudItem, spot: VrSpot) {
  write(VR_KEY, JSON.stringify({ ...readVrHud(), [item]: spot }));
}

export function resetVrHud() {
  write(VR_KEY, JSON.stringify(DEFAULT_VR_HUD));
}

/** VR picture resolution. Auto starts sharp and drops only if the headset can't keep up. */
export type VrQuality = "auto" | "low" | "medium" | "high" | "ultra";
export const VR_QUALITIES: [VrQuality, string, string][] = [
  ["auto", "Auto", "The headset's own resolution, lowered only if it keeps missing frames"],
  ["low", "Low", "Softer, smoothest on slow headsets"],
  ["medium", "Medium", "A bit softer than the headset's own"],
  ["high", "High", "The headset's own resolution"],
  ["ultra", "Ultra", "Extra sharp (drawn bigger than the screens); needs a fast headset or PC"],
];
/** The headset resolution for each fixed setting, as a multiple of its own (Auto starts at 1). */
export const VR_QUALITY_SCALE: Record<Exclude<VrQuality, "auto">, number> = { low: 0.6, medium: 0.8, high: 1, ultra: 1.4 };

const VRQ_KEY = "mg.vrquality";

function readVrQuality(): VrQuality {
  const raw = read(VRQ_KEY);
  return VR_QUALITIES.some(([q]) => q === raw) ? (raw as VrQuality) : "auto";
}

export function useVrQuality() {
  return useSyncExternalStore(subscribe, readVrQuality, () => "auto" as VrQuality);
}

export function getVrQuality() {
  return readVrQuality();
}

export function saveVrQuality(q: VrQuality) {
  write(VRQ_KEY, q);
}

const KEY_NAMES: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ShiftLeft: "L Shift",
  ShiftRight: "R Shift",
  ControlLeft: "L Ctrl",
  ControlRight: "R Ctrl",
  AltLeft: "L Alt",
  AltRight: "R Alt",
  CapsLock: "Caps",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Space: "Space",
};

/** A short readable name for a KeyboardEvent.code, like "W", "1" or "L Shift". */
export function keyLabel(code: string) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return code;
}

/** Base HTTP URL of the game server. */
export function gameServerUrl() {
  const configured = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (configured) return configured.replace(/\/$/, "");
  return `${window.location.protocol}//${window.location.hostname}:4001`;
}

/**
 * Ping the game server until it answers. Free hosts put it to sleep when
 * nobody is playing, and waking it takes up to about a minute.
 * `onWaiting` fires once if the server doesn't answer straight away.
 */
export async function wakeGameServer(onWaiting?: () => void, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const slow = setTimeout(() => onWaiting?.(), 1500);
  try {
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${gameServerUrl()}/health`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        if (res.ok) return true;
      } catch {
        // Still asleep or starting up; try again.
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    return false;
  } finally {
    clearTimeout(slow);
  }
}

export function gameSocketUrl(code: string) {
  return `${gameServerUrl().replace(/^http/, "ws")}/ws?code=${encodeURIComponent(code)}`;
}
