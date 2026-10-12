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
  super: "Space",
  ability1: "KeyE",
  ability2: "KeyF",
  ability3: "KeyC",
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
