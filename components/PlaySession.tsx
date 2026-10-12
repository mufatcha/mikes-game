"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ResultsMessage, RoomState } from "@/shared/protocol";
import type { ArchetypeId, Loadout } from "@/shared/archetypes";
import { GameConnection } from "@/game/connection";
import {
  GAME_TITLE,
  gameServerUrl,
  wakeGameServer,
  addClassXp,
  getClassLevels,
  getSavedLoadout,
  saveLoadout,
  saveName,
  useSavedLoadout,
  useClassXp,
  useSavedName,
} from "@/lib/settings";
import { levelsFromXp } from "@/shared/progress";
import GameView from "./GameView";
import Lobby from "./Lobby";

const noopSubscribe = () => () => {};

function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export default function PlaySession({ code: rawCode }: { code: string }) {
  const code = rawCode.toUpperCase();
  const hydrated = useHydrated();
  const savedName = useSavedName();
  const [name, setName] = useState<string | null>(null);
  const activeName = name ?? (savedName || null);

  if (!hydrated) return <Centered>Loading…</Centered>;
  if (!activeName) return <NameGate onSubmit={setName} code={code} />;
  return <Session code={code} name={activeName} />;
}

function Session({ code, name }: { code: string; name: string }) {
  const router = useRouter();
  const savedLoadout = useSavedLoadout();
  const [conn, setConn] = useState<GameConnection | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [results, setResults] = useState<ResultsMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);

  // The server has the final say on our class (one of each per team, except in boss mode).
  const meEntry = room?.roster.find((r) => r.id === myId);
  const loadout = meEntry?.loadout ?? savedLoadout;
  const taken = new Map<ArchetypeId, string>(
    (room?.roster ?? [])
      .filter((r) => room?.mode !== "boss" && meEntry && r.team === meEntry.team && r.id !== myId)
      .map((r) => [r.loadout.archetype, r.name]),
  );

  // Tell the server our class levels whenever our saved XP changes (e.g. after a match).
  const classXp = useClassXp();
  useEffect(() => {
    conn?.send({ t: "levels", levels: levelsFromXp(classXp) });
  }, [conn, classXp]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    let cancelled = false;
    let connection: GameConnection | null = null;

    // Wake the server if it's asleep, then check the code so a bad code gets a clear message.
    wakeGameServer(() => !cancelled && setWaking(true))
      .then((awake) => {
        if (!awake) throw new Error("offline");
        if (!cancelled) setWaking(false);
        return fetch(`${gameServerUrl()}/rooms/${encodeURIComponent(code)}`);
      })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setError("No match with that code. Check the code or ask for a new invite.");
        const info = (await res.json()) as { full?: boolean };
        if (info.full) return setError("This match is full.");
        connection = new GameConnection(
          code,
          { name, loadout: getSavedLoadout(), levels: getClassLevels() },
          {
            onWelcome: setMyId,
            onRoom: (r) => {
              setRoom(r);
              if (r.phase !== "results") setResults(null);
            },
            onResults: (r) => {
              // Bank the XP we earned before showing the results.
              const mine = r.players.find((p) => p.id === connection?.myId);
              if (mine) addClassXp(mine.xp);
              setResults(r);
            },
            onError: (message, fatal) => {
              if (fatal) setError(message);
              else setNotice(message);
            },
            onClose: () => setError((e) => e ?? "Disconnected from the game server."),
          },
        );
        setConn(connection);
      })
      .catch(() => {
        if (!cancelled) setError("The game server is offline. Try again in a moment.");
      });

    return () => {
      cancelled = true;
      connection?.close();
    };
  }, [code, name]);

  const changeLoadout = (l: Loadout) => {
    saveLoadout(l);
    conn?.send({ t: "loadout", loadout: l });
  };

  if (error) {
    return (
      <Centered>
        <p className="max-w-md text-center text-lg text-zinc-200">{error}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-white/15 px-4 py-2 text-zinc-200 hover:border-white/40"
          >
            Retry
          </button>
          <Link href="/" className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-black hover:bg-amber-300">
            Home
          </Link>
        </div>
      </Centered>
    );
  }

  if (!conn || !room) {
    return (
      <Centered>
        {waking ? (
          <>
            <p className="text-lg text-zinc-200">Waking up the game server…</p>
            <p className="text-sm text-zinc-400">It sleeps when nobody is playing. This can take up to a minute.</p>
          </>
        ) : (
          <>Connecting to match {code}…</>
        )}
      </Centered>
    );
  }

  const toast = notice && (
    <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg bg-red-500/90 px-4 py-2 text-sm font-semibold text-white shadow-lg">
      {notice}
    </div>
  );

  if (room.phase === "lobby") {
    return (
      <main className="min-h-screen">
        {toast}
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-6 sm:px-6">
          <Link href="/" className="text-lg font-black tracking-tight text-white">
            {GAME_TITLE}
          </Link>
          <span className="text-sm text-zinc-400">Playing as {name}</span>
        </div>
        <Lobby
          room={room}
          myId={myId}
          loadout={loadout}
          taken={taken}
          onLoadoutChange={changeLoadout}
          onTeam={(team) => conn.send({ t: "team", team })}
          onStart={() => conn.send({ t: "start" })}
          onMode={(mode) => conn.send({ t: "mode", mode })}
        />
      </main>
    );
  }

  return (
    <>
      {toast}
      <GameView
      conn={conn}
      code={code}
      isHost={room.hostId === myId}
      results={room.phase === "results" ? results : null}
      loadout={loadout}
      taken={taken}
      onLoadoutChange={changeLoadout}
      onLeave={() => router.push("/")}
      />
    </>
  );
}

function NameGate({ onSubmit, code }: { onSubmit: (name: string) => void; code: string }) {
  const [value, setValue] = useState("");
  return (
    <Centered>
      <h1 className="text-3xl font-black text-white">{GAME_TITLE}</h1>
      <p className="text-zinc-400">
        You&apos;ve been invited to match <span className="font-mono font-bold text-white">{code}</span>
      </p>
      <form
        className="flex w-full max-w-sm flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const n = value.trim();
          if (!n) return;
          saveName(n);
          onSubmit(n);
        }}
      >
        <input
          autoFocus
          value={value}
          maxLength={16}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your name"
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-amber-400"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="rounded-lg bg-amber-400 px-4 py-3 font-bold text-black hover:bg-amber-300 disabled:opacity-40"
        >
          Join match
        </button>
      </form>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 text-zinc-300">{children}</main>
  );
}
