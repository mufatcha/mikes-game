"use client";

import { ARCHETYPES, ARCHETYPE_IDS, WEAPONS, type ArchetypeId, type Loadout } from "@/shared/archetypes";

const STATS = [
  ["attack", "Attack"],
  ["defense", "Defense"],
  ["speed", "Speed"],
  ["range", "Range"],
] as const;

function Pips({ value }: { value: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-sm ${i < value ? "bg-amber-400" : "bg-white/10"}`} />
      ))}
    </div>
  );
}

export default function LoadoutPicker({
  loadout,
  taken,
  onChange,
}: {
  loadout: Loadout;
  /** Classes a teammate already has, mapped to that teammate's name. */
  taken: Map<ArchetypeId, string>;
  onChange: (l: Loadout) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ARCHETYPE_IDS.map((id) => {
        const a = ARCHETYPES[id];
        const selected = loadout.archetype === id;
        const takenBy = selected ? undefined : taken.get(id);
        return (
          <button
            key={id}
            type="button"
            disabled={!!takenBy}
            onClick={() => onChange({ archetype: id })}
            className={`relative flex flex-col gap-3 rounded-xl border p-4 text-left transition ${
              selected
                ? "border-amber-400 bg-amber-400/10"
                : takenBy
                  ? "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-40"
                  : "border-white/10 bg-white/[0.03] hover:border-white/30"
            }`}
          >
            {takenBy && (
              <span className="absolute right-3 top-3 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-200">
                Taken by {takenBy}
              </span>
            )}
            <div className="flex items-center gap-3">
              <span className="text-4xl leading-none">{a.emoji}</span>
              <div>
                <p className="text-lg font-bold text-white">{a.name}</p>
                <p className="text-xs text-zinc-400">{a.tagline}</p>
              </div>
            </div>
            <div className="grid grid-cols-[4rem_1fr] items-center gap-x-3 gap-y-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
              {STATS.map(([key, label]) => (
                <div key={key} className="contents">
                  <span>{label}</span>
                  <Pips value={a.ratings[key]} />
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-300">
              <span className="text-zinc-500">Throws:</span> {WEAPONS[a.primary].name}
              <span className="text-zinc-500"> · Backup:</span> {WEAPONS[a.secondary].name}
            </p>
          </button>
        );
      })}
    </div>
  );
}
