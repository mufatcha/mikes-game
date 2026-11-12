"use client";

import { useEffect, useState } from "react";
import {
  KEY_ACTIONS,
  PAD_ACTIONS,
  PAD_RESERVED,
  PAD_START,
  padButtonLabel,
  resetPadSettings,
  savePadSettings,
  setPadButton,
  usePadSettings,
  type AimAssist,
  type PadAction,
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
import { connectedPad, padDown, setPadCapturing } from "@/lib/gamepad";

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
      <ControllerSettings />
    </>
  );
}

const ASSIST_LEVELS: [AimAssist, string][] = [
  ["off", "Off"],
  ["low", "Low"],
  ["high", "High"],
];

/** A labelled slider showing its value. */
function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  show,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  show: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 rounded-lg bg-white/5 px-4 py-2">
      <span className="flex items-baseline justify-between text-zinc-200">
        {label}
        <span className="font-mono text-sm text-amber-300">{show(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-amber-400"
      />
      <span className="text-xs text-zinc-500">{hint}</span>
    </label>
  );
}

/** An on/off switch row. */
function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-4 py-2">
      <span>
        <span className="block text-zinc-200">{label}</span>
        <span className="text-xs text-zinc-500">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`min-w-16 rounded-md px-3 py-1 text-sm font-semibold transition ${
          on ? "bg-amber-400 text-black" : "bg-white/10 text-zinc-300 hover:bg-white/20"
        }`}
      >
        {on ? "On" : "Off"}
      </button>
    </div>
  );
}

/** Game controller settings: sensitivity, dead zone, aim assist, vibration, and which button does what. */
function ControllerSettings() {
  const pad = usePadSettings();
  const [listening, setListening] = useState<PadAction | null>(null);
  const [padName, setPadName] = useState<string | null>(null);

  // Show which controller is plugged in.
  useEffect(() => {
    const update = () => setPadName(connectedPad()?.id ?? null);
    update();
    window.addEventListener("gamepadconnected", update);
    window.addEventListener("gamepaddisconnected", update);
    return () => {
      window.removeEventListener("gamepadconnected", update);
      window.removeEventListener("gamepaddisconnected", update);
    };
  }, []);

  // Waiting for a button: first let go of everything (the press that chose "Change"), then take the next press.
  useEffect(() => {
    if (!listening) return;
    setPadCapturing(true);
    let armed = false;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = connectedPad();
      if (!p) return;
      const downs = p.buttons.map((_, i) => padDown(p, i));
      if (!armed) {
        armed = !downs.some(Boolean);
        return;
      }
      const hit = downs.findIndex(Boolean);
      if (hit < 0) return;
      if (hit === PAD_START) {
        setListening(null); // Start cancels
      } else if (!PAD_RESERVED.includes(hit)) {
        setPadButton(listening, hit);
        setListening(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Let go of the button just bound before the menus react to it again.
      setTimeout(() => setPadCapturing(false), 250);
    };
  }, [listening]);

  return (
    <>
      <div className="mt-2 border-t border-white/10 pt-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">🎮 Controller</h3>
        <p className="mt-1 text-sm text-zinc-500">
          {padName ? `Connected: ${padName}` : "No controller connected. Plug one in (or pair it) and press any button."}
        </p>
      </div>
      <Slider
        label="Look sensitivity"
        hint="How fast the right stick turns you in 3D."
        value={pad.lookSpeed}
        min={0.3}
        max={3}
        step={0.1}
        show={(v) => `${v.toFixed(1)}×`}
        onChange={(lookSpeed) => savePadSettings({ lookSpeed })}
      />
      <Slider
        label="Aim reach"
        hint="How far out the crosshair goes when you push the right stick (top-down)."
        value={pad.aimReach}
        min={0.5}
        max={1.5}
        step={0.1}
        show={(v) => `${v.toFixed(1)}×`}
        onChange={(aimReach) => savePadSettings({ aimReach })}
      />
      <Slider
        label="Stick dead zone"
        hint="Raise it if your character drifts when you're not touching the sticks."
        value={pad.deadZone}
        min={0.05}
        max={0.4}
        step={0.01}
        show={(v) => `${Math.round(v * 100)}%`}
        onChange={(deadZone) => savePadSettings({ deadZone })}
      />
      <div className="rounded-lg bg-white/5 px-4 py-2">
        <span className="block text-zinc-200">Aim assist</span>
        <span className="text-xs text-zinc-500">Gently pulls your aim toward an enemy you&apos;re already aiming near.</span>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-black/30 p-1">
          {ASSIST_LEVELS.map(([level, label]) => (
            <button
              key={level}
              type="button"
              onClick={() => savePadSettings({ aimAssist: level })}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                pad.aimAssist === level ? "bg-amber-400 text-black" : "text-zinc-300 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <Toggle
        label="Invert look up/down"
        hint="Push the right stick up to look down in 3D."
        on={pad.invertY}
        onChange={(invertY) => savePadSettings({ invertY })}
      />
      <Toggle
        label="Swap sticks"
        hint="Move with the right stick and aim with the left."
        on={pad.swapSticks}
        onChange={(swapSticks) => savePadSettings({ swapSticks })}
      />
      <Toggle
        label="Vibration"
        hint="Rumble when you get hit."
        on={pad.vibration}
        onChange={(vibration) => savePadSettings({ vibration })}
      />
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Controller buttons</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Press Change, then the controller button you want. Start cancels. Start is always the menu and the D-pad is
          always the Principal&apos;s and mascots&apos; powers.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {PAD_ACTIONS.map(({ id, label }) => (
          <div key={id} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2">
            <span className="text-zinc-200">{label}</span>
            <button
              type="button"
              onClick={() => setListening(listening === id ? null : id)}
              className={`min-w-28 rounded-md border px-3 py-1 font-mono text-sm transition ${
                listening === id
                  ? "animate-pulse border-amber-400 bg-amber-400/15 text-amber-300"
                  : "border-white/20 bg-white/5 text-white hover:border-white/50"
              }`}
            >
              {listening === id ? "Press a button…" : padButtonLabel(pad.buttons[id])}
            </button>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setListening(null);
            resetPadSettings();
          }}
          className="rounded-md border border-white/20 px-3 py-1 text-sm text-zinc-200 hover:border-white/50"
        >
          Reset controller settings
        </button>
      </div>
    </>
  );
}
