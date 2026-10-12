"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { DETENTION_MAX, DETENTION_MIN, detentionSeconds } from "@/shared/archetypes";

/** How long the needle takes to sweep across and back. */
const SWEEP_MS = 1100;
/** Stop on your own or the needle stops for you. */
const TIMEOUT_MS = 3500;

export interface SkillCheckHandle {
  stop(): void;
}

/** Where the needle is, 0 (left) to 1 (right), bouncing back and forth. */
function needleAt(elapsed: number) {
  const t = (elapsed % SWEEP_MS) / SWEEP_MS;
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

/** 1 when stopped dead center, falling to 0 at either end. */
function scoreOf(pos: number) {
  return Math.max(0, 1 - Math.abs(pos - 0.5) * 2);
}

/**
 * The Principal's Detention skill check: stop the sweeping needle as close to
 * the middle as you can. Dead center locks the student up for the full time.
 */
export default function SkillCheck({
  targetName,
  keyLabel,
  touch,
  onDone,
  ref,
}: {
  targetName: string;
  keyLabel: string;
  touch: boolean;
  onDone: (score: number) => void;
  ref?: Ref<SkillCheckHandle>;
}) {
  const [pos, setPos] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const start = useRef(0);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const score = scoreOf(needleAt(performance.now() - start.current));
    setResult(score);
    // Let them see where it landed for a moment.
    setTimeout(() => onDone(score), 450);
  };

  useImperativeHandle(ref, () => ({ stop: finish }));

  useEffect(() => {
    start.current = performance.now();
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - start.current;
      if (!done.current) setPos(needleAt(elapsed));
      if (!done.current && elapsed > TIMEOUT_MS) finish();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // finish only reads refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const secs = result === null ? null : detentionSeconds(result);
  const grade = result === null ? null : result > 0.85 ? "Perfect!" : result > 0.5 ? "Good" : "Sloppy";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[22%] flex justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-red-400/40 bg-zinc-950/90 p-4 text-center shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-300">🔒 Detention</p>
        <p className="mt-1 font-bold text-white">
          Sending <span className="text-red-300">{targetName}</span> to detention
        </p>
        <div className="relative mt-3 h-8 overflow-hidden rounded-md bg-white/10">
          {/* Worse toward the ends, best in the middle. */}
          <div className="absolute inset-y-0 left-[25%] right-[25%] bg-amber-400/30" />
          <div className="absolute inset-y-0 left-[42.5%] right-[42.5%] bg-green-400/60" />
          <div
            className="absolute inset-y-0 w-1.5 -translate-x-1/2 rounded bg-white shadow-[0_0_8px_white]"
            style={{ left: `${pos * 100}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-zinc-300">
          {secs === null ? (
            <>
              {touch ? "Tap 🔒 again" : <>Press <b className="text-white">{keyLabel}</b> again</>} to stop in the green:{" "}
              {DETENTION_MIN}–{DETENTION_MAX} seconds
            </>
          ) : (
            <b className={result! > 0.5 ? "text-green-300" : "text-amber-300"}>
              {grade} {secs} seconds
            </b>
          )}
        </p>
      </div>
    </div>
  );
}
