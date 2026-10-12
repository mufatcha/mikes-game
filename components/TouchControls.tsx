"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import type { InputController } from "@/game/input";
import { abilitySlots } from "@/game/layout";
import { ABILITIES } from "@/shared/archetypes";

/** How far, in screen pixels, a thumbstick can be pushed. */
const STICK = 60;
/** Ignore tiny pushes so a resting thumb doesn't drift. */
const DEAD_ZONE = 0.15;
/** Push the aim stick at least this far (0 to 1) to start throwing. */
const FIRE_AT = 0.45;

interface Stick {
  id: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

/** True when a media query matches, kept up to date. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Thumbsticks and buttons for phones and tablets. Touch the left half of the
 * screen to move and the right half to aim; push the right stick further to throw.
 */
export default function TouchControls({
  inputRef,
  canvasRef,
  active,
  onMenu,
  onAbility,
}: {
  inputRef: RefObject<InputController | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  active: boolean;
  onMenu: () => void;
  /** Set when you're the Principal: tap targets over the ability bar. */
  onAbility?: (index: number) => void;
}) {
  const [move, setMove] = useState<Stick | null>(null);
  const [aim, setAim] = useState<Stick | null>(null);
  const portrait = useMediaQuery("(orientation: portrait)");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sticks: { move: Stick | null; aim: Stick | null } = { move: null, aim: null };
    // The game creates its input after this effect first runs, so look it up when needed.
    const release = () => inputRef.current?.releaseTouch();

    const apply = () => {
      const input = inputRef.current;
      if (input) {
        const m = sticks.move;
        if (m) {
          const dx = (m.x - m.ox) / STICK;
          const dy = (m.y - m.oy) / STICK;
          const mag = Math.hypot(dx, dy);
          if (mag < DEAD_ZONE) input.setTouchMove(0, 0);
          else input.setTouchMove(dx, dy);
        } else {
          input.setTouchMove(0, 0);
        }
        const a = sticks.aim;
        if (a) {
          const dx = a.x - a.ox;
          const dy = a.y - a.oy;
          const mag = Math.hypot(dx, dy) / STICK;
          input.setTouchAim(mag > DEAD_ZONE ? Math.atan2(dy, dx) : null, mag >= FIRE_AT);
        } else {
          input.setTouchAim(null, false);
        }
      }
      setMove(sticks.move && { ...sticks.move });
      setAim(sticks.aim && { ...sticks.aim });
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      // Stops the browser from also sending a mouse click, which would throw.
      e.preventDefault();
      const s: Stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      if (e.clientX < window.innerWidth / 2) sticks.move ??= s;
      else sticks.aim ??= s;
      apply();
    };
    const onMove = (e: PointerEvent) => {
      let changed = false;
      for (const s of [sticks.move, sticks.aim]) {
        if (!s || s.id !== e.pointerId) continue;
        s.x = e.clientX;
        s.y = e.clientY;
        // Drag the stick's center along when the thumb goes past the edge.
        const d = Math.hypot(s.x - s.ox, s.y - s.oy);
        if (d > STICK) {
          s.ox = s.x - ((s.x - s.ox) / d) * STICK;
          s.oy = s.y - ((s.y - s.oy) / d) * STICK;
        }
        changed = true;
      }
      if (changed) apply();
    };
    const onUp = (e: PointerEvent) => {
      if (sticks.move?.id === e.pointerId) sticks.move = null;
      else if (sticks.aim?.id === e.pointerId) sticks.aim = null;
      else return;
      apply();
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      release();
    };
  }, [canvasRef, inputRef]);

  if (!active) return null;

  const canFullscreen = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
  const setScoreboard = (on: boolean) => {
    if (inputRef.current) inputRef.current.scoreboard = on;
  };

  return (
    <div className="pointer-events-none absolute inset-0 touch-none select-none">
      {move && <StickView stick={move} color="rgba(255,255,255,0.5)" />}
      {aim && <StickView stick={aim} color="rgba(251,191,36,0.7)" />}

      <div className="pointer-events-auto absolute left-4 top-[160px] flex gap-2">
        <TouchButton
          onPointerDown={(e) => {
            stop(e);
            onMenu();
          }}
        >
          ☰
        </TouchButton>
        <TouchButton
          onPointerDown={(e) => {
            stop(e);
            setScoreboard(true);
          }}
          onPointerUp={() => setScoreboard(false)}
          onPointerCancel={() => setScoreboard(false)}
          onPointerLeave={() => setScoreboard(false)}
        >
          🏆
        </TouchButton>
        {canFullscreen && (
          <TouchButton
            onPointerDown={(e) => {
              stop(e);
              if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
              else document.documentElement.requestFullscreen().catch(() => {});
            }}
          >
            ⛶
          </TouchButton>
        )}
      </div>

      <div className="pointer-events-auto absolute bottom-[96px] right-4 flex gap-3">
        <TouchButton
          big
          onPointerDown={(e) => {
            stop(e);
            inputRef.current?.switchWeapon();
          }}
        >
          ⇄
        </TouchButton>
        <TouchButton
          big
          onPointerDown={(e) => {
            stop(e);
            inputRef.current?.reload();
          }}
        >
          ↻
        </TouchButton>
      </div>

      {onAbility &&
        abilitySlots(window.innerWidth, window.innerHeight).map((s, i) => (
          <button
            key={i}
            type="button"
            aria-label={ABILITIES[i].name}
            className="pointer-events-auto absolute touch-none rounded-lg active:bg-white/20"
            style={{ left: s.x, top: s.y, width: s.w, height: s.h }}
            onPointerDown={(e) => {
              stop(e);
              onAbility(i);
            }}
          />
        ))}

      {!move && !aim && !onAbility && (
        <p className="absolute bottom-[96px] left-1/2 -translate-x-1/2 text-center text-xs text-white/50">
          Left side: move · Right side: aim, push further to throw
        </p>
      )}
      {portrait && (
        <p className="absolute inset-x-4 top-[210px] rounded-lg bg-black/70 px-3 py-2 text-center text-sm text-amber-200">
          Turn your phone sideways for a bigger view
        </p>
      )}
    </div>
  );
}

/** Keep a button tap from also reaching the game or turning into a mouse click. */
function stop(e: React.PointerEvent) {
  e.preventDefault();
  e.stopPropagation();
}

function StickView({ stick, color }: { stick: Stick; color: string }) {
  return (
    <>
      <div
        className="absolute rounded-full border-2 border-white/30 bg-white/5"
        style={{ left: stick.ox - STICK, top: stick.oy - STICK, width: STICK * 2, height: STICK * 2 }}
      />
      <div
        className="absolute rounded-full"
        style={{ left: stick.x - 24, top: stick.y - 24, width: 48, height: 48, background: color }}
      />
    </>
  );
}

function TouchButton({
  children,
  big,
  ...handlers
}: {
  children: React.ReactNode;
  big?: boolean;
} & Pick<
  React.HTMLAttributes<HTMLButtonElement>,
  "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onPointerLeave"
>) {
  return (
    <button
      type="button"
      {...handlers}
      className={`flex touch-none items-center justify-center rounded-full border border-white/20 bg-black/50 text-white active:bg-white/20 ${
        big ? "h-16 w-16 text-2xl" : "h-11 w-11 text-lg"
      }`}
    >
      {children}
    </button>
  );
}
