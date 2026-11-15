"use client";

import { useRef, useState } from "react";
import type { HudState, WrathwaterEngine } from "@/game/wrathwater/engine";

/**
 * Phones and tablets: a move stick on the left, buttons on the right, and
 * dragging anywhere else looks around. At sea the stick steers and the
 * sail buttons set your speed.
 */
export default function WrathwaterTouch({ engine, hud, onVr }: { engine: WrathwaterEngine; hud: HudState; onVr: (() => void) | null }) {
  const foot = hud.mode === "foot";
  const gomu = hud.fruit?.id === "gomu";
  return (
    <div className="absolute inset-0 touch-none">
      <LookPad engine={engine} />
      <Stick engine={engine} label={foot ? "Move" : "Steer"} />

      {/* Menu buttons, top right under the gold. */}
      <div className="absolute right-2 top-[6.5rem] flex gap-2">
        <Small label="☰" title="Pause" onTap={() => engine.press("pause")} />
        <Small label="🎒" title="Inventory" onTap={() => engine.press("inventory")} />
        <Small label={hud.firstPerson ? "1st" : "3rd"} title="Switch view" onTap={() => engine.press("view")} />
        {onVr && <Small label="VR" title="Play in VR" onTap={onVr} />}
      </div>

      {/* Action buttons, bottom right. */}
      <div className="absolute bottom-4 right-4 grid grid-cols-3 items-end gap-2">
        {foot ? (
          <>
            <Hold label="Aim" onHold={(on) => engine.setTouchHeld("aim", on)} />
            <Hold label="Use" sub="hold to rob" onHold={(on) => { engine.setTouchHeld("interact", on); if (on) engine.press("interact"); }} />
            <Hold big label="Attack" tone="red" onHold={(on) => engine.setTouchHeld("attack", on)} />
            <Tap label="Weapon" onTap={() => engine.press("weaponNext")} />
            <Hold label="Run" onHold={(on) => engine.setTouchHeld("sprint", on)} />
            <Tap label="Board" sub="ship" onTap={() => engine.press("board")} />
          </>
        ) : (
          <>
            <Tap label="Sails +" onTap={() => engine.press("sailsUp")} />
            <Tap label="Port" sub="fire left" onTap={() => engine.press("firePort")} />
            <Tap big label="Fire" tone="red" sub="where you look" onTap={() => engine.press("fireLook")} />
            <Tap label="Sails −" onTap={() => engine.press("sailsDown")} />
            <Tap label="Starbd" sub="fire right" onTap={() => engine.press("fireStarboard")} />
            <Tap label={hud.landing ? "Land" : "Ashore"} sub={hud.landing ?? "near land"} onTap={() => engine.press("board")} />
          </>
        )}
        {hud.fruit && (
          <Tap
            label={gomu ? hud.fruit.power.split(" ")[0] : "Power"}
            sub={hud.fruit.ready >= 0.999 ? "ready" : `${Math.round(hud.fruit.ready * 100)}%`}
            tone="purple"
            onTap={() => engine.press("power")}
          />
        )}
        {gomu && <Tap label="Switch" sub="move" tone="purple" onTap={() => engine.press("switchMove")} />}
        {hud.awaken && (
          <Tap
            label="Awaken"
            sub={hud.awaken.active > 0 ? "ON" : hud.awaken.ready >= 0.999 ? "ready" : "resting"}
            tone="red"
            onTap={() => engine.press("awaken")}
          />
        )}
      </div>
    </div>
  );
}

/** Drag anywhere that isn't a button to look around. */
function LookPad({ engine }: { engine: WrathwaterEngine }) {
  const last = useRef<{ id: number; x: number; y: number } | null>(null);
  return (
    <div
      className="absolute inset-0"
      onPointerDown={(e) => {
        if (last.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        engine.useTouch();
      }}
      onPointerMove={(e) => {
        const l = last.current;
        if (!l || l.id !== e.pointerId) return;
        engine.touchLook(e.clientX - l.x, e.clientY - l.y);
        last.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (last.current?.id === e.pointerId) last.current = null;
      }}
      onPointerCancel={() => (last.current = null)}
    />
  );
}

/** The move stick: drag from its center. */
function Stick({ engine, label }: { engine: WrathwaterEngine; label: string }) {
  const R = 44;
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const center = useRef<{ id: number; x: number; y: number } | null>(null);
  const end = () => {
    center.current = null;
    setKnob({ x: 0, y: 0 });
    engine.setTouchMove(0, 0);
  };
  return (
    <div
      className="absolute bottom-28 left-6 flex h-28 w-28 items-center justify-center rounded-full bg-white/10 ring-2 ring-white/25"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        center.current = { id: e.pointerId, x: r.left + r.width / 2, y: r.top + r.height / 2 };
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (center.current?.id === e.pointerId) move(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className="pointer-events-none absolute -top-5 text-[10px] font-semibold uppercase tracking-widest text-white/60">{label}</span>
      <div className="pointer-events-none h-14 w-14 rounded-full bg-white/40 ring-2 ring-white/60" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
  function move(x: number, y: number) {
    const c = center.current;
    if (!c) return;
    let dx = x - c.x;
    let dy = y - c.y;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob({ x: dx, y: dy });
    // Screen up is forward.
    engine.setTouchMove(dx / R, -dy / R);
  }
}

const TONES = {
  plain: "bg-black/55 ring-white/30 active:bg-white/30",
  red: "bg-red-800/70 ring-red-400/50 active:bg-red-600",
  purple: "bg-purple-900/70 ring-purple-400/50 active:bg-purple-600",
};

function face(big: boolean | undefined, tone: keyof typeof TONES, pressed = false) {
  return `flex select-none flex-col items-center justify-center rounded-full font-bold text-white ring-2 backdrop-blur ${TONES[tone]} ${
    big ? "h-20 w-20 text-sm" : "h-14 w-14 text-[11px]"
  } ${pressed ? "scale-95 brightness-150" : ""}`;
}

function Label({ label, sub }: { label: string; sub?: string }) {
  return (
    <>
      <span className="leading-tight">{label}</span>
      {sub && <span className="max-w-[4.5rem] truncate text-[8px] font-medium leading-tight text-white/70">{sub}</span>}
    </>
  );
}

function Tap({ label, sub, big, tone = "plain", onTap }: { label: string; sub?: string; big?: boolean; tone?: keyof typeof TONES; onTap: () => void }) {
  return (
    <button
      type="button"
      className={face(big, tone)}
      onPointerDown={(e) => {
        e.stopPropagation();
        onTap();
      }}
    >
      <Label label={label} sub={sub} />
    </button>
  );
}

function Small({ label, title, onTap }: { label: string; title: string; onTap: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/55 text-xs font-bold text-white ring-1 ring-white/25 active:bg-white/30"
      onPointerDown={(e) => {
        e.stopPropagation();
        onTap();
      }}
    >
      {label}
    </button>
  );
}

function Hold({ label, sub, big, tone = "plain", onHold }: { label: string; sub?: string; big?: boolean; tone?: keyof typeof TONES; onHold: (on: boolean) => void }) {
  const [down, setDown] = useState(false);
  const set = (on: boolean) => {
    setDown(on);
    onHold(on);
  };
  return (
    <button
      type="button"
      className={face(big, tone, down)}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Label label={label} sub={sub} />
    </button>
  );
}
