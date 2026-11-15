import { useSyncExternalStore } from "react";

/**
 * One profile for both games, kept in this browser. There's no password and nothing goes online:
 * to take your progress to another computer you copy a save code (or download a save file) here
 * and load it there. The code holds every School Wars setting and level ("mg.*") and your
 * Wrathwater voyage ("ww.*").
 */

const PROFILE_KEY = "mg.profile";
const PREFIXES = ["mg.", "ww."];
const CODE_PREFIX = "SWW1-";

export interface Profile {
  name: string;
  /** When the profile was made (ms since 1970). */
  created: number;
}

const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}
const changed = () => listeners.forEach((fn) => fn());

let cachedRaw: string | null | undefined;
let cached: Profile | null = null;
function readProfile(): Profile | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PROFILE_KEY);
  } catch {
    // Storage blocked.
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const p = raw ? (JSON.parse(raw) as Partial<Profile>) : null;
      cached = p && typeof p.name === "string" && p.name.trim() ? { name: p.name.slice(0, 16), created: Number(p.created) || 0 } : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function useProfile() {
  return useSyncExternalStore(subscribe, readProfile, () => null);
}

/** Make (or rename) the profile. The name is used in both games. */
export function createProfile(name: string) {
  const clean = name.trim().slice(0, 16);
  if (!clean) return;
  const old = readProfile();
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: clean, created: old?.created ?? Date.now() }));
    // School Wars uses the same name in matches.
    localStorage.setItem("mg.name", clean);
  } catch {
    // Storage blocked: the profile just won't stick.
  }
  changed();
  window.dispatchEvent(new StorageEvent("storage"));
}

function ourKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && PREFIXES.some((p) => k.startsWith(p))) keys.push(k);
    }
  } catch {
    // Storage blocked.
  }
  return keys.sort();
}

// ---------------------------------------------------------------- the save code

const toBase64Url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64Url = (text: string) => {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const s = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function squash(bytes: Uint8Array, inflate: boolean) {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(inflate ? new DecompressionStream("deflate-raw") : new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A short checksum so a mistyped code is caught instead of loading junk. */
function check(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36).slice(-4).padStart(4, "0");
}

/** Everything this profile has saved, packed into one code. */
export async function exportCode(): Promise<string> {
  const data: Record<string, string> = {};
  for (const k of ourKeys()) {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  }
  const json = JSON.stringify({ v: 1, data });
  const body = toBase64Url(await squash(new TextEncoder().encode(json), false));
  return `${CODE_PREFIX}${body}.${check(body)}`;
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  name?: string;
}

/** Load a save code (or save file text), replacing this browser's progress in both games. */
export async function importCode(code: string): Promise<ImportResult> {
  const text = code.replace(/\s+/g, "");
  if (!text.startsWith(CODE_PREFIX)) return { ok: false, error: "That isn't a save code. It should start with SWW1-." };
  const [body, sum] = text.slice(CODE_PREFIX.length).split(".");
  if (!body || sum !== check(body)) return { ok: false, error: "The code is incomplete or has a typo. Copy the whole thing and try again." };
  let data: Record<string, unknown>;
  try {
    const json = new TextDecoder().decode(await squash(fromBase64Url(body), true));
    const parsed = JSON.parse(json) as { v?: number; data?: Record<string, unknown> };
    if (parsed.v !== 1 || !parsed.data || typeof parsed.data !== "object") throw new Error("bad");
    data = parsed.data;
  } catch {
    return { ok: false, error: "That code couldn't be read." };
  }
  const entries = Object.entries(data).filter(
    (e): e is [string, string] => PREFIXES.some((p) => e[0].startsWith(p)) && typeof e[1] === "string" && e[1].length < 200_000,
  );
  try {
    for (const k of ourKeys()) localStorage.removeItem(k);
    for (const [k, v] of entries) localStorage.setItem(k, v);
  } catch {
    return { ok: false, error: "This browser won't let the game save (private mode?)." };
  }
  changed();
  // Let the School Wars settings hooks see the new values too.
  window.dispatchEvent(new StorageEvent("storage"));
  return { ok: true, name: readProfile()?.name };
}

/** Forget this profile and both games' progress on this computer. */
export function signOut() {
  try {
    for (const k of ourKeys()) localStorage.removeItem(k);
  } catch {
    // Nothing to remove.
  }
  changed();
  window.dispatchEvent(new StorageEvent("storage"));
}

/** A quick look at what the profile holds, for the profile screen. */
export function profileSummary() {
  let wrathwater: { captain: string; bounty: number } | null = null;
  let classesPlayed = 0;
  try {
    const ww = localStorage.getItem("ww.save.v1");
    if (ww) {
      const s = JSON.parse(ww) as { captain?: string; bounty?: number };
      if (typeof s.captain === "string") wrathwater = { captain: s.captain, bounty: Number(s.bounty) || 0 };
    }
    const xp = localStorage.getItem("mg.xp");
    if (xp) classesPlayed = Object.values(JSON.parse(xp) as Record<string, number>).filter((n) => Number(n) > 0).length;
  } catch {
    // Unreadable: show nothing.
  }
  return { wrathwater, classesPlayed, keys: ourKeys().length };
}
