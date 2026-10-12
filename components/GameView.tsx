"use client";

import { useEffect, useRef, useState } from "react";
import { TICK_MS, teamNamesFor } from "@/shared/constants";
import type { ResultsMessage } from "@/shared/protocol";
import { ARCHETYPES, WEAPONS, abilitiesOf, hasAbilities, type ArchetypeId, type Loadout } from "@/shared/archetypes";
import { levelFromXp, type ClassXp } from "@/shared/progress";
import { Sfx } from "@/game/audio";
import type { GameConnection } from "@/game/connection";
import { InputController } from "@/game/input";
import { Renderer } from "@/game/renderer";
import KeybindSettings, { SettingsButton } from "./KeybindSettings";
import LoadoutPicker, { LevelBar } from "./LoadoutPicker";
import { CopyButton, inviteLink } from "./Lobby";
import { keyLabel, useClassXp, useKeybinds, useTouchControlsMode } from "@/lib/settings";
import Modal from "./Modal";
import PrankMenu from "./PrankMenu";
import { CHEAT_CODE } from "@/shared/pranks";
import PrincipalCard from "./PrincipalCard";
import SkillCheck, { type SkillCheckHandle } from "./SkillCheck";
import TouchControls, { useMediaQuery } from "./TouchControls";

type Overlay = "none" | "menu" | "loadout" | "settings" | "pranks";

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
  // The Principal or a duel mascot: four powers instead of a class to pick.
  const isPrincipal = hasAbilities(loadout.archetype);
  const binds = useKeybinds();
  // Detention skill check in progress: who's being sent, and a handle to stop the needle.
  const [skill, setSkill] = useState<{ target: string; name: string } | null>(null);
  const skillRef = useRef<SkillCheckHandle>(null);
  const abilityRef = useRef<((index: number) => void) | null>(null);
  const finishSkillRef = useRef<((score: number) => void) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isFps = !!conn.room?.view3d;
  const [locked, setLocked] = useState(false);
  const lastUnlockRef = useRef(0);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const sfx = new Sfx();
    const renderer = new Renderer(canvas, conn, sfx);
    let aimNow = 0;
    let skillTarget: string | null = null;
    let wasAlive = false;

    /** A Principal ability key or button. Detention opens the skill check (or stops it if it's open). */
    const useAbility = (index: number) => {
      const me = conn.me;
      const ability = me ? abilitiesOf(me.archetype)[index] : undefined;
      if (!me || !ability || !me.alive) return;
      if (ability.id !== "detention") {
        conn.send({ t: "ability", ability: ability.id });
        return;
      }
      if (skillTarget) {
        skillRef.current?.stop();
        return;
      }
      if ((me.cds?.[index] ?? 0) > 0) return;
      const target = renderer.pickDetentionTarget(input.mouseX, input.mouseY, aimNow, input.touchMode);
      if (!target) {
        setNotice("No student in sight to send to detention.");
        return;
      }
      skillTarget = target;
      renderer.detentionTarget = target;
      const name = conn.room?.roster.find((r) => r.id === target)?.name ?? "a student";
      setSkill({ target, name });
    };
    abilityRef.current = useAbility;
    // Typing the cheat code (again) opens the prank menu once the server accepts it.
    const stopPrankListener = conn.listenForPrankUnlock(() => setOverlay("pranks"));
    finishSkillRef.current = (score) => {
      if (skillTarget) conn.send({ t: "ability", ability: "detention", target: skillTarget, score });
      skillTarget = null;
      renderer.detentionTarget = null;
      setSkill(null);
    };

    const input = new InputController(canvas, {
      onMenu: () => {
        // In first person, Esc first releases the mouse (which opens the menu); don't also toggle it shut.
        if (performance.now() - lastUnlockRef.current < 300) return;
        setOverlay((o) => (o === "none" || o === "settings" ? "menu" : "none"));
      },
      onLoadout: () => setOverlay("loadout"),
      onActivity: () => sfx.unlock(),
      onAbility: useAbility,
      onCheatCode: () => conn.send({ t: "prank", action: "unlock", code: CHEAT_CODE }),
      onSuper: () => conn.send({ t: "super" }),
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
      const fps = !!conn.room?.view3d;
      input.fpsMode = fps;
      const me = conn.me;
      if (fps) {
        // First person: face where the server spawned you each time you (re)spawn, looking straight ahead.
        if (me?.alive && !wasAlive) {
          input.yaw = me.aim;
          input.pitch = 0;
        }
        wasAlive = !!me?.alive;
        input.mouseX = canvas.clientWidth / 2;
        input.mouseY = canvas.clientHeight / 2;
      } else if (touch) {
        // No mouse: look ahead the way the thumbstick aims.
        const a = input.touchAimAngle();
        input.mouseX = canvas.clientWidth / 2 + Math.cos(a) * canvas.clientWidth * 0.3;
        input.mouseY = canvas.clientHeight / 2 + Math.sin(a) * canvas.clientHeight * 0.3;
      }
      const dt = renderer.updateCamera(now, input.mouseX, input.mouseY);
      if (fps) input.updateFps(dt);
      const aim = fps ? input.yaw : touch ? input.touchAimAngle() : renderer.aimFrom(input.mouseX, input.mouseY);
      aimNow = aim;
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
        pitch: input.pitch,
        scoreboard: input.scoreboard,
        crosshair: !touch || fps,
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
      abilityRef.current = null;
      stopPrankListener();
      finishSkillRef.current = null;
    };
  }, [conn]);

  useEffect(() => {
    inputRef.current?.setEnabled(overlay === "none" && !results);
    // First person: give the mouse back whenever a menu or the results are up.
    if ((overlay !== "none" || results) && document.pointerLockElement) document.exitPointerLock();
  }, [overlay, results]);

  // First person: track the mouse lock; losing it mid-game (Esc, alt-tab) opens the menu.
  useEffect(() => {
    const onChange = () => {
      const isLocked = document.pointerLockElement === canvasRef.current;
      setLocked(isLocked);
      if (!isLocked) {
        lastUnlockRef.current = performance.now();
        if (conn.room?.view3d) setOverlay((o) => (o === "none" ? "menu" : o));
      }
    };
    document.addEventListener("pointerlockchange", onChange);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, [conn]);

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
          onAbility={isPrincipal ? (i) => abilityRef.current?.(i) : undefined}
          onSuper={isPrincipal ? undefined : () => conn.send({ t: "super" })}
        />
      )}

      {skill && !results && (
        <SkillCheck
          ref={skillRef}
          targetName={skill.name}
          keyLabel={keyLabel(binds.ability1)}
          touch={isTouch}
          onDone={(score) => finishSkillRef.current?.(score)}
        />
      )}

      {isFps && !locked && !isTouch && overlay === "none" && !results && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
          <p className="rounded-lg bg-black/75 px-5 py-3 text-center font-semibold text-white">
            🎯 Click to look around
            <span className="block text-sm font-normal text-zinc-400">Move the mouse to look in any direction · Esc for the menu</span>
          </p>
        </div>
      )}

      {notice && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-sm font-semibold text-amber-200">
          {notice}
        </div>
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
          {isPrincipal ? (
            <PrincipalCard mode={conn.room?.mode ?? "boss"} archetype={loadout.archetype} />
          ) : (
            <>
              <p className="text-sm text-zinc-400">
                Changes apply the next time you respawn.
                {conn.room?.mode === "boss" ? "" : " Each team can have only one of each class."}
              </p>
              <LoadoutPicker loadout={loadout} taken={taken} onChange={onLoadoutChange} />
            </>
          )}
        </Modal>
      )}

      {overlay === "pranks" && !results && (
        <Modal onClose={() => setOverlay("none")}>
          <PrankMenu conn={conn} onClose={() => setOverlay("none")} />
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

/** XP you earned this match, per class, with your new level (already saved). */
function XpEarned({ earned }: { earned: ClassXp }) {
  const total = useClassXp();
  const rows = Object.entries(earned).filter(([, v]) => (v ?? 0) > 0) as [ArchetypeId, number][];
  if (rows.length === 0) return null;
  return (
    <div className="mt-5 flex flex-col gap-3 rounded-lg bg-white/5 p-4">
      {rows.map(([id, gained]) => {
        const now = total[id] ?? gained;
        const before = levelFromXp(now - gained);
        const after = levelFromXp(now);
        return (
          <div key={id}>
            <p className="mb-1 text-sm text-zinc-200">
              {ARCHETYPES[id].emoji} {ARCHETYPES[id].name} <b className="text-amber-300">+{gained} XP</b>
              {after > before && <b className="ml-2 text-green-300">LEVEL UP! Lv {before} → {after}</b>}
            </p>
            <LevelBar xp={now} />
          </div>
        );
      })}
    </div>
  );
}

function Results({ results, myId }: { results: ResultsMessage; myId: string | null }) {
  const [secondsLeft, setSecondsLeft] = useState(results.returnIn);
  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const me = results.players.find((p) => p.id === myId);
  const names = teamNamesFor(results.mode);
  const title =
    results.winner === null
      ? "Draw"
      : me && me.team === results.winner
        ? "Victory"
        : me
          ? "Defeat"
          : `${names[results.winner]} ${results.mode === "duel" || (results.mode === "boss" && results.winner === 1) ? "wins" : "win"}`;
  const subtitle =
    results.mode !== "boss" || results.winner === null
      ? null
      : results.winner === 0
        ? "The Principal has been knocked out!"
        : results.reason === "wipe"
          ? "Every student ran out of lives."
          : "The Principal survived until the bell.";

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-zinc-950 p-6">
        <p className="text-center text-sm uppercase tracking-widest text-zinc-400">Match over</p>
        <h2 className="text-center text-5xl font-black text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-center text-zinc-300">{subtitle}</p>}
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
        {me && <XpEarned earned={me.xp} />}
        <p className="mt-6 text-center text-sm text-zinc-400">Back to the lobby in {secondsLeft}s…</p>
      </div>
    </div>
  );
}
