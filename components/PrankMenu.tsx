"use client";

import { useEffect, useState } from "react";
import type { GameConnection } from "@/game/connection";
import { ARCHETYPES } from "@/shared/archetypes";
import { teamNamesFor } from "@/shared/constants";
import { SELF_PRANKS, TARGET_PRANKS, type PrankAction } from "@/shared/pranks";

/** The secret prank menu, unlocked by typing the cheat code in a match. */
export default function PrankMenu({ conn, onClose }: { conn: GameConnection; onClose: () => void }) {
  const [target, setTarget] = useState<string | null>(null);
  // Player list and our own toggles come from live snapshots, so refresh a few times a second.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 300);
    return () => clearInterval(id);
  }, []);

  const roster = conn.room?.roster ?? [];
  const players = conn.latest?.players ?? [];
  const me = conn.me;
  const names = teamNamesFor(conn.room?.mode ?? "teams");
  const others = roster.filter((r) => r.id !== conn.myId);
  const send = (action: PrankAction, t?: string) => conn.send({ t: "prank", action, target: t });
  const selfOn: Record<string, boolean> = {
    god: !!me?.god,
    ammo: !!me?.infAmmo,
    turbo: !!me?.turbo,
    super: !!me?.superSpeed,
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">🤡 Prank menu</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-amber-400 px-4 py-1.5 font-semibold text-black hover:bg-amber-300"
        >
          Done
        </button>
      </div>
      <p className="-mt-2 text-sm text-zinc-500">Nothing shows in the kill feed. Your friends just see it happen.</p>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">You</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {SELF_PRANKS.map((p) => {
            const on = p.toggle && selfOn[p.id];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => send(p.id)}
                className={`rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                  on ? "bg-green-500/25 text-green-200 ring-1 ring-green-400/60" : "bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                {p.emoji} {p.label}
                {p.toggle && <span className="float-right text-xs opacity-70">{on ? "ON" : "off"}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Pick a victim</h3>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {others.map((r) => {
            const snap = players.find((p) => p.id === r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setTarget(r.id)}
                className={`truncate rounded-lg px-3 py-1.5 text-left text-sm transition ${
                  target === r.id ? "bg-amber-400 font-semibold text-black" : "bg-white/5 text-zinc-200 hover:bg-white/10"
                } ${snap && !snap.alive ? "opacity-50" : ""}`}
              >
                {ARCHETYPES[r.loadout.archetype].emoji} {r.name}
                <span className="ml-1 text-xs opacity-60">{names[r.team]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {TARGET_PRANKS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={!target}
            onClick={() => target && send(p.id, target)}
            className="rounded-lg bg-red-500/15 px-3 py-2 text-left text-sm font-semibold text-red-200 transition enabled:hover:bg-red-500/25 disabled:opacity-40"
          >
            {p.emoji} {p.label}
          </button>
        ))}
      </div>
    </>
  );
}
