"use client";

import { useEffect, useState } from "react";
import {
  KEY_ACTIONS,
  RESERVED_KEY,
  keyLabel,
  resetKeybinds,
  saveTouchControlsMode,
  setKeybind,
  useKeybinds,
  useTouchControlsMode,
  type KeyAction,
  type TouchControlsMode,
} from "@/lib/settings";

const TOUCH_MODES: [TouchControlsMode, string][] = [
  ["auto", "Auto"],
  ["on", "On"],
  ["off", "Off"],
];

/** A gear button that opens the settings. */
export function SettingsButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Settings"
      title="Settings"
      className={`rounded-lg p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white ${className}`}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}

/** Settings panel: click an action, then press the key you want for it. */
export default function KeybindSettings({ onDone }: { onDone: () => void }) {
  const binds = useKeybinds();
  const touchMode = useTouchControlsMode();
  const [listening, setListening] = useState<KeyAction | null>(null);

  useEffect(() => {
    if (!listening) return;
    // Capture phase so the game doesn't also react to the key being bound.
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code !== RESERVED_KEY) setKeybind(listening, e.code);
      setListening(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [listening]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md bg-amber-400 px-4 py-1.5 font-semibold text-black hover:bg-amber-300"
        >
          Done
        </button>
      </div>
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Mobile controls</h3>
        <p className="mt-1 text-sm text-zinc-500">
          On-screen thumbsticks and buttons. Auto shows them on phones and tablets; turn them on for a touchscreen laptop.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-white/5 p-1">
          {TOUCH_MODES.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => saveTouchControlsMode(mode)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                touchMode === mode ? "bg-amber-400 text-black" : "text-zinc-300 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Key binds</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Click a key, then press the new one. Esc cancels. If the key is already used, the two actions swap.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {KEY_ACTIONS.map(({ id, label }) => (
          <div key={id} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2">
            <span className="text-zinc-200">{label}</span>
            <button
              type="button"
              onClick={() => setListening(listening === id ? null : id)}
              className={`min-w-24 rounded-md border px-3 py-1 font-mono text-sm transition ${
                listening === id
                  ? "animate-pulse border-amber-400 bg-amber-400/15 text-amber-300"
                  : "border-white/20 bg-white/5 text-white hover:border-white/50"
              }`}
            >
              {listening === id ? "Press a key…" : keyLabel(binds[id])}
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          Esc always opens the menu. Mouse: aim, left click shoots, wheel switches weapon.
        </span>
        <button
          type="button"
          onClick={() => {
            setListening(null);
            resetKeybinds();
          }}
          className="ml-4 shrink-0 rounded-md border border-white/20 px-3 py-1 text-zinc-200 hover:border-white/50"
        >
          Reset
        </button>
      </div>
    </>
  );
}
