import { useSyncExternalStore } from "react";
import { DEFAULT_LOADOUT, sanitizeLoadout, type Loadout } from "@/shared/archetypes";

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
