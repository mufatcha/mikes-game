"use client";

import { useState } from "react";
import { GAME_MODES, VIEWS, isPrincipalSeat, teamNamesFor, teamSizeFor, type GameMode, type Team } from "@/shared/constants";
import type { RoomState } from "@/shared/protocol";
import { ARCHETYPES, type ArchetypeId, type Loadout } from "@/shared/archetypes";
import { keyLabel, useKeybinds } from "@/lib/settings";
import LoadoutPicker from "./LoadoutPicker";
import PrincipalCard from "./PrincipalCard";

const TEAM_STYLES = [
  { text: "text-blue-400", border: "border-blue-500/40", bg: "bg-blue-500/10", button: "bg-blue-500 hover:bg-blue-400" },
  { text: "text-orange-400", border: "border-orange-500/40", bg: "bg-orange-500/10", button: "bg-orange-500 hover:bg-orange-400" },
];

export function inviteLink(code: string) {
  return `${window.location.origin}/play/${code}`;
}

export function CopyButton({ text, label }: { text: () => string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text());
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("Copy this:", text());
        }
      }}
      className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-white/40"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

export default function Lobby({
  room,
  myId,
  loadout,
  taken,
  onLoadoutChange,
  onTeam,
  onStart,
  onMode,
  onView,
}: {
  room: RoomState;
  myId: string | null;
  loadout: Loadout;
  taken: Map<ArchetypeId, string>;
  onLoadoutChange: (l: Loadout) => void;
  onTeam: (t: Team) => void;
  onStart: () => void;
  onMode: (mode: GameMode) => void;
  onView: (view3d: boolean) => void;
}) {
  const me = room.roster.find((r) => r.id === myId);
  const isHost = room.hostId === myId;
  const humans = room.roster.length;
  const mode = room.mode;
  const names = teamNamesFor(mode);
  const bots = teamSizeFor(mode, 0) + teamSizeFor(mode, 1) - humans;
  const amPrincipal = !!me && isPrincipalSeat(mode, me.team);
  const binds = useKeybinds();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Invite code</p>
          <p className="font-mono text-4xl font-bold tracking-[0.2em] text-white">{room.code}</p>
          <p className="mt-1 text-sm text-zinc-400">Only people with this code can join.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={() => inviteLink(room.code)} label="Copy invite link" />
          <CopyButton text={() => room.code} label="Copy code" />
        </div>
      </header>

      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-white">Game mode</h2>
          {!isHost && <p className="text-sm text-zinc-500">The host picks the mode.</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {GAME_MODES.map((m) => {
            const selected = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                disabled={!isHost}
                onClick={() => onMode(m.id)}
                className={`rounded-xl border p-4 text-left transition ${
                  selected
                    ? "border-amber-400 bg-amber-400/10"
                    : "border-white/10 bg-black/20 enabled:hover:border-white/30"
                } disabled:cursor-default`}
              >
                <p className={`font-bold ${selected ? "text-amber-300" : "text-white"}`}>
                  {m.emoji}{" "}
                  {m.name}
                </p>
                <p className="mt-1 text-sm text-zinc-400">{m.blurb}</p>
              </button>
            );
          })}
        </div>
        <div className="mb-3 mt-6 flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-white">View</h2>
          <p className="text-sm text-zinc-500">Every mode works in both.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {VIEWS.map((v) => {
            const selected = v.view3d === room.view3d;
            return (
              <button
                key={v.name}
                type="button"
                disabled={!isHost}
                onClick={() => onView(v.view3d)}
                className={`rounded-xl border p-4 text-left transition ${
                  selected
                    ? "border-amber-400 bg-amber-400/10"
                    : "border-white/10 bg-black/20 enabled:hover:border-white/30"
                } disabled:cursor-default`}
              >
                <p className={`font-bold ${selected ? "text-amber-300" : "text-white"}`}>
                  {v.emoji} {v.name}
                </p>
                <p className="mt-1 text-sm text-zinc-400">{v.blurb}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {([0, 1] as Team[]).map((team) => {
          const members = room.roster.filter((r) => r.team === team);
          const style = TEAM_STYLES[team];
          const size = teamSizeFor(mode, team);
          const canJoin = me && me.team !== team && members.length < size;
          return (
            <div key={team} className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className={`text-lg font-bold uppercase tracking-wider ${style.text}`}>
                  {names[team]}
                </h2>
                {canJoin && (
                  <button
                    type="button"
                    onClick={() => onTeam(team)}
                    className={`rounded-md px-3 py-1 text-sm font-semibold text-white ${style.button}`}
                  >
                    {mode === "boss" && team === 1 ? "Be the Principal" : "Switch here"}
                  </button>
                )}
              </div>
              <ul className="flex flex-col gap-2">
                {Array.from({ length: size }, (_, i) => {
                  const m = members[i];
                  if (!m) {
                    return (
                      <li
                        key={`empty-${i}`}
                        className="rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-sm text-zinc-500"
                      >
                        {isPrincipalSeat(mode, team) ? "Open: a bot Principal will play" : "Open slot (a bot will play)"}
                      </li>
                    );
                  }
                  return (
                    <li
                      key={m.id}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                        m.id === myId ? "bg-white/10 ring-1 ring-white/30" : "bg-black/30"
                      }`}
                    >
                      <div>
                        <p className="font-semibold text-white">
                          {m.name}
                          {m.id === myId && <span className="ml-2 text-xs text-zinc-400">(you)</span>}
                          {m.isHost && <span className="ml-2 text-xs text-amber-400">HOST</span>}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {ARCHETYPES[m.loadout.archetype].emoji} {ARCHETYPES[m.loadout.archetype].name}
                          {m.loadout.archetype !== "principal" && <span className="ml-1.5 font-semibold text-amber-300">Lv {m.level}</span>}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col items-center gap-2">
        {isHost ? (
          <>
            <button
              type="button"
              onClick={onStart}
              className="rounded-xl bg-amber-400 px-10 py-3 text-lg font-bold text-black transition hover:bg-amber-300"
            >
              Start match
            </button>
            <p className="text-sm text-zinc-400">
              {bots > 0 ? `${bots} bot${bots === 1 ? "" : "s"} will fill the open slots.` : "Every seat is taken, no bots needed."}{" "}
              Friends can still join mid-match and take over a bot.
            </p>
          </>
        ) : (
          <p className="text-zinc-300">Waiting for the host to start the match…</p>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        {amPrincipal ? (
          <PrincipalCard mode={mode} />
        ) : (
          <>
            <h2 className="mb-4 text-lg font-bold text-white">Pick your class</h2>
            <p className="-mt-2 mb-4 text-sm text-zinc-400">
              {mode === "boss"
                ? "Students can share classes. Work together to take down the Principal."
                : "Each team can have only one of each class."}
            </p>
            <LoadoutPicker loadout={loadout} taken={taken} onChange={onLoadoutChange} />
          </>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-zinc-300">
        <h2 className="mb-3 text-lg font-bold text-white">Controls</h2>
        <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <li><Key>{[binds.up, binds.left, binds.down, binds.right].map(keyLabel).join(" ")}</Key> move</li>
          <li><Key>Mouse</Key> aim, <Key>Left click</Key> shoot</li>
          <li><Key>{keyLabel(binds.reload)}</Key> reload</li>
          <li><Key>{keyLabel(binds.weapon1)}</Key> <Key>{keyLabel(binds.weapon2)}</Key> / <Key>{keyLabel(binds.swap)}</Key> / <Key>Wheel</Key> switch weapon</li>
          <li><Key>{keyLabel(binds.scoreboard)}</Key> scoreboard</li>
          <li><Key>{keyLabel(binds.loadout)}</Key> change class (applies on respawn)</li>
          <li><Key>Esc</Key> menu</li>
        </ul>
      </section>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-white/20 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-zinc-200">
      {children}
    </kbd>
  );
}
