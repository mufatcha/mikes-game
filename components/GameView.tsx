"use client";

import { useEffect, useRef, useState } from "react";
import { TICK_MS, TEAM_NAMES } from "@/shared/constants";
import type { ResultsMessage } from "@/shared/protocol";
import { WEAPONS, type ArchetypeId, type Loadout } from "@/shared/archetypes";
import { Sfx } from "@/game/audio";
import type { GameConnection } from "@/game/connection";
import { InputController } from "@/game/input";
import { Renderer } from "@/game/renderer";
import KeybindSettings, { SettingsButton } from "./KeybindSettings";
import LoadoutPicker from "./LoadoutPicker";
import { CopyButton, inviteLink } from "./Lobby";
import { useTouchControlsMode } from "@/lib/settings";
import Modal from "./Modal";
import TouchControls, { useMediaQuery } from "./TouchControls";

type Overlay = "none" | "menu" | "loadout" | "settings";

export default function GameView({
  conn,
  code,
  isHost,
  results,
  loadout,
  taken,
  onLoadoutChange,
  onLeave,
}: {
  conn: GameConnection;
  code: string;
  isHost: boolean;
  results: ResultsMessage | null;
  loadout: Loadout;
  taken: Map<ArchetypeId, string>;
  onLoadoutChange: (l: Loadout) => void;
  onLeave: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<InputController | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const touchMode = useTouchControlsMode();
  const coarsePointer = useMediaQuery("(pointer: coarse)");
  const isTouch = touchMode === "on" || (touchMode === "auto" && coarsePointer);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const sfx = new Sfx();
    const renderer = new Renderer(canvas, conn, sfx);
    const input = new InputController(canvas, {
      onMenu: () => setOverlay((o) => (o === "none" || o === "settings" ? "menu" : "none")),
      onLoadout: () => setOverlay("loadout"),
      onActivity: () => sfx.unlock(),
    });
    inputRef.current = input;
    input.attach();

    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      acc += Math.min(250, now - last);
      last = now;
      const touch = input.touchMode;
      if (touch) {
        // No mouse: look ahead the way the thumbstick aims.
        const a = input.touchAimAngle();
        input.mouseX = canvas.clientWidth / 2 + Math.cos(a) * canvas.clientWidth * 0.3;
        input.mouseY = canvas.clientHeight / 2 + Math.sin(a) * canvas.clientHeight * 0.3;
      }
      const dt = renderer.updateCamera(now, input.mouseX, input.mouseY);
      const aim = touch ? input.touchAimAngle() : renderer.aimFrom(input.mouseX, input.mouseY);
      const me = conn.me;
      let steps = 0;
      while (acc >= TICK_MS && steps < 5) {
        acc -= TICK_MS;
        steps++;
        conn.sendInput(input.frame(aim, me?.slot ?? 0, me ? WEAPONS[me.weapon].auto : true));
      }
      if (steps === 5) acc = 0;
      renderer.draw(now, dt, {
        mouseX: input.mouseX,
        mouseY: input.mouseY,
        aim,
        scoreboard: input.scoreboard,
        crosshair: !touch,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      input.detach();
      sfx.dispose();
      inputRef.current = null;
    };
  }, [conn]);

  useEffect(() => {
    inputRef.current?.setEnabled(overlay === "none" && !results);
  }, [overlay, results]);

  useEffect(() => {
    if (inputRef.current) inputRef.current.touchMode = isTouch;
  }, [isTouch, conn]);

  return (
    <div className="fixed inset-0 select-none bg-black [-webkit-touch-callout:none]">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        style={{ cursor: overlay === "none" ? "none" : "auto" }}
      />

      {isTouch && (
        <TouchControls
          inputRef={inputRef}
          canvasRef={canvasRef}
          active={overlay === "none" && !results}
          onMenu={() => setOverlay("menu")}
        />
      )}

      {overlay === "menu" && !results && (
        <Modal onClose={() => setOverlay("none")}>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Menu</h2>
            <SettingsButton onClick={() => setOverlay("settings")} />
          </div>
          <div className="flex flex-col gap-2">
            <MenuButton onClick={() => setOverlay("none")}>Resume</MenuButton>
            <MenuButton onClick={() => setOverlay("loadout")}>Change class</MenuButton>
            <div className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2.5">
              <span className="text-zinc-300">
                Code <span className="font-mono font-bold tracking-widest text-white">{code}</span>
              </span>
              <CopyButton text={() => inviteLink(code)} label="Copy invite link" />
            </div>
            {isHost && (
              <MenuButton
                onClick={() => {
                  conn.send({ t: "end" });
                  setOverlay("none");
                }}
              >
                End match for everyone
              </MenuButton>
            )}
            <MenuButton danger onClick={onLeave}>
              Leave match
            </MenuButton>
          </div>
        </Modal>
      )}

      {overlay === "loadout" && !results && (
        <Modal wide onClose={() => setOverlay("none")}>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Change class</h2>
            <button
              type="button"
              onClick={() => setOverlay("none")}
              className="rounded-md bg-amber-400 px-4 py-1.5 font-semibold text-black hover:bg-amber-300"
            >
              Done
            </button>
          </div>
          <p className="text-sm text-zinc-400">Changes apply the next time you respawn. Each team can have only one of each class.</p>
          <LoadoutPicker loadout={loadout} taken={taken} onChange={onLoadoutChange} />
        </Modal>
      )}

      {overlay === "settings" && !results && (
        <Modal onClose={() => setOverlay("menu")}>
          <KeybindSettings onDone={() => setOverlay("menu")} />
        </Modal>
      )}

      {results && <Results results={results} myId={conn.myId} />}
    </div>
  );
}

function MenuButton({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2.5 text-left font-medium transition ${
        danger ? "bg-red-500/15 text-red-300 hover:bg-red-500/25" : "bg-white/5 text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function Results({ results, myId }: { results: ResultsMessage; myId: string | null }) {
  const [secondsLeft, setSecondsLeft] = useState(results.returnIn);
  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const me = results.players.find((p) => p.id === myId);
  const title =
    results.winner === null
      ? "Draw"
      : me && me.team === results.winner
        ? "Victory"
        : me
          ? "Defeat"
          : `${TEAM_NAMES[results.winner]} wins`;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-zinc-950 p-6">
        <p className="text-center text-sm uppercase tracking-widest text-zinc-400">Match over</p>
        <h2 className="text-center text-5xl font-black text-white">{title}</h2>
        <p className="mt-2 text-center text-3xl font-bold">
          <span className="text-blue-400">{results.scores[0]}</span>
          <span className="mx-3 text-zinc-500">–</span>
          <span className="text-orange-400">{results.scores[1]}</span>
        </p>
        <table className="mt-6 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="py-1">Player</th>
              <th className="py-1 text-right">Kills</th>
              <th className="py-1 text-right">Deaths</th>
            </tr>
          </thead>
          <tbody>
            {results.players.map((p) => (
              <tr key={p.id} className={p.id === myId ? "bg-white/5" : ""}>
                <td className={`py-1.5 font-medium ${p.team === 0 ? "text-blue-300" : "text-orange-300"}`}>{p.name}</td>
                <td className="py-1.5 text-right text-white">{p.kills}</td>
                <td className="py-1.5 text-right text-zinc-400">{p.deaths}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-6 text-center text-sm text-zinc-400">Back to the lobby in {secondsLeft}s…</p>
      </div>
    </div>
  );
}
