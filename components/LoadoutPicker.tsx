"use client";

import {
  ARCHETYPES,
  ARCHETYPE_IDS,
  SECTIONS,
  SUPERS,
  WEAPONS,
  classLimit,
  sanitizeLoadout,
  sectionOf,
  type ArchetypeId,
  type Loadout,
} from "@/shared/archetypes";
import { MAX_LEVEL, levelBonus, levelFromXp, xpForLevel } from "@/shared/progress";
import { useClassXp } from "@/lib/settings";
import SkinPortrait from "./SkinPortrait";

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

/** A class's level and progress toward the next one. */
export function LevelBar({ xp }: { xp: number }) {
  const level = levelFromXp(xp);
  const maxed = level >= MAX_LEVEL;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  const frac = maxed ? 1 : (xp - from) / (to - from);
  const bonus = Math.round((levelBonus(level) - 1) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-bold text-amber-300">Lv {level}</span>
        <span className="text-zinc-500">
          {maxed ? "MAX" : `${Math.floor(xp)} / ${to} XP`}
          {bonus > 0 && ` · +${bonus}% dmg & HP`}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.round(frac * 100)}%` }} />
      </div>
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
  const xp = useClassXp();
  const sections = SECTIONS[loadout.archetype];
  const current = sectionOf(loadout.archetype, loadout.section);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ARCHETYPE_IDS.map((id) => {
          const a = ARCHETYPES[id];
          const selected = loadout.archetype === id;
          const takenBy = selected ? undefined : taken.get(id);
          const classSections = SECTIONS[id];
          return (
            <button
              key={id}
              type="button"
              disabled={!!takenBy}
              onClick={() => !selected && onChange(sanitizeLoadout({ archetype: id }))}
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
                <SkinPortrait archetype={id} />
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
              {classSections ? (
                <p className="text-xs text-zinc-300">
                  <span className="text-zinc-500">Sections:</span>{" "}
                  {classSections.map((s) => `${s.emoji} ${s.name}`).join(" · ")}
                  {classLimit(id) > 1 && <span className="text-zinc-500"> · {classLimit(id)} per team</span>}
                </p>
              ) : (
                <p className="text-xs text-zinc-300">
                  <span className="text-zinc-500">Throws:</span> {WEAPONS[a.primary].name}
                  <span className="text-zinc-500"> · Backup:</span> {WEAPONS[a.secondary].name}
                </p>
              )}
              {SUPERS[id] && (
                <p className="text-xs text-zinc-300">
                  <span className="text-zinc-500">Super:</span> {SUPERS[id]!.emoji} {SUPERS[id]!.name}
                  <span className="text-zinc-500"> · {SUPERS[id]!.description}</span>
                </p>
              )}
              <LevelBar xp={xp[id] ?? 0} />
            </button>
          );
        })}
      </div>
      {sections && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-4">
          <p className="mb-3 font-bold text-white">
            Pick your section{" "}
            <span className="text-sm font-normal text-zinc-400">· it decides what you throw</span>
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {sections.map((s) => {
              const picked = current?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onChange({ archetype: loadout.archetype, section: s.id })}
                  className={`rounded-lg border p-3 text-left transition ${
                    picked ? "border-amber-400 bg-amber-400/15" : "border-white/10 bg-black/20 hover:border-white/30"
                  }`}
                >
                  <p className={`font-bold ${picked ? "text-amber-300" : "text-white"}`}>
                    {s.emoji} {s.name}
                  </p>
                  <p className="mt-1 text-xs text-zinc-300">{WEAPONS[s.primary].name}</p>
                  <p className="text-xs text-zinc-500">Backup: {WEAPONS[s.secondary].name}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
