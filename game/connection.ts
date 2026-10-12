import { BASE_SPEED, DT, TICK_MS } from "@/shared/constants";
import { movePlayer } from "@/shared/physics";
import { moveTardis, tardisSpotNow } from "@/shared/map";
import type {
  ClientMessage,
  GameEvent,
  InputFrame,
  PlayerSnap,
  ResultsMessage,
  RoomState,
  ServerMessage,
  Snapshot,
} from "@/shared/protocol";
import { moveSpeedFor, radiusFor, type Loadout } from "@/shared/archetypes";
import { gameSocketUrl } from "@/lib/settings";
import type { ClassLevels } from "@/shared/progress";

/** How far behind the newest snapshot other entities are drawn. */
const INTERP_DELAY_MS = 100;
const MAX_SNAPSHOTS = 30;

export interface ConnectionEvents {
  onWelcome(id: string): void;
  onRoom(room: RoomState): void;
  onResults(results: ResultsMessage): void;
  onError(message: string, fatal: boolean): void;
  onClose(): void;
}

export interface TimedEvent {
  tick: number;
  event: GameEvent;
}

export class GameConnection {
  myId: string | null = null;
  room: RoomState | null = null;
  snapshots: Snapshot[] = [];
  /** Events waiting for the render clock to reach their tick. */
  pendingEvents: TimedEvent[] = [];

  /** Locally predicted position of our own player. */
  predicted: { x: number; y: number } | null = null;
  /** Visual offset left over from server corrections; decays to zero. */
  correction = { x: 0, y: 0 };
  /** Set once the server accepts the cheat code. */
  prankUnlocked = false;
  private prankListener: (() => void) | null = null;

  /** Call `fn` whenever the server accepts the cheat code. Returns an unsubscribe function. */
  listenForPrankUnlock(fn: () => void) {
    this.prankListener = fn;
    return () => {
      if (this.prankListener === fn) this.prankListener = null;
    };
  }

  private ws: WebSocket;
  private seq = 0;
  private unacked: InputFrame[] = [];
  /** Smoothed estimate of (local time - server tick time). */
  private clockOffset: number | null = null;
  private closed = false;

  constructor(
    code: string,
    private hello: { name: string; loadout: Loadout; levels?: ClassLevels },
    private events: ConnectionEvents,
  ) {
    this.ws = new WebSocket(gameSocketUrl(code));
    this.ws.onopen = () => this.send({ t: "hello", ...this.hello });
    this.ws.onmessage = (e) => this.onMessage(JSON.parse(e.data as string) as ServerMessage);
    this.ws.onclose = () => {
      if (!this.closed) this.events.onClose();
    };
    this.ws.onerror = () => {
      if (!this.closed) this.events.onError("Could not reach the game server.", true);
    };
  }

  close() {
    this.closed = true;
    this.ws.close();
  }

  send(msg: ClientMessage) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  get latest(): Snapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  get me(): PlayerSnap | undefined {
    return this.latest?.players.find((p) => p.id === this.myId);
  }

  /** Send one fixed-step input and apply it to our predicted position. */
  sendInput(frame: Omit<InputFrame, "seq">) {
    const input: InputFrame = { ...frame, seq: ++this.seq };
    this.send({ t: "input", ...input });

    const me = this.me;
    if (!me || !me.alive) {
      this.predicted = null;
      this.unacked = [];
      return;
    }
    this.predicted ??= { x: me.x, y: me.y };
    const flip = me.reversed ? -1 : 1;
    movePlayer(this.predicted, flip * input.mx, flip * input.my, this.speedOf(me), DT, radiusFor(me.archetype));
    this.unacked.push(input);
  }

  /** Server tick (fractional) that should be on screen right now. */
  renderTick(now: number) {
    if (this.clockOffset === null) return this.latest?.tick ?? 0;
    return (now - this.clockOffset - INTERP_DELAY_MS) / TICK_MS;
  }

  /** The two snapshots that bracket a render tick, plus the blend factor between them. */
  bracket(tick: number): { a: Snapshot; b: Snapshot; f: number } | null {
    const s = this.snapshots;
    if (s.length === 0) return null;
    if (tick >= s[s.length - 1].tick) return { a: s[s.length - 1], b: s[s.length - 1], f: 0 };
    for (let i = s.length - 1; i > 0; i--) {
      if (s[i - 1].tick <= tick) {
        const a = s[i - 1];
        const b = s[i];
        return { a, b, f: (tick - a.tick) / (b.tick - a.tick) };
      }
    }
    return { a: s[0], b: s[0], f: 0 };
  }

  /**
   * Events whose tick the render clock has reached. Events matching `immediate`
   * (e.g. our own shots) skip the interpolation delay so they feel responsive.
   */
  takeEvents(tick: number, immediate: (e: GameEvent) => boolean): GameEvent[] {
    const ready: GameEvent[] = [];
    this.pendingEvents = this.pendingEvents.filter(({ tick: t, event }) => {
      if (t <= tick || immediate(event)) {
        ready.push(event);
        return false;
      }
      return true;
    });
    return ready;
  }

  /** Our move speed; zero while locked in detention or stunned, so prediction matches the server. */
  private speedOf(me: PlayerSnap) {
    if (me.jailed > 0 || me.stunned) return 0;
    return BASE_SPEED * moveSpeedFor(me.archetype) * (me.speed ?? 1);
  }

  private onMessage(msg: ServerMessage) {
    switch (msg.t) {
      case "welcome":
        this.myId = msg.id;
        this.events.onWelcome(msg.id);
        break;
      case "room":
        this.room = msg;
        if (msg.phase === "lobby") this.resetMatchState();
        this.events.onRoom(msg);
        break;
      case "snap":
        this.onSnapshot(msg);
        break;
      case "results":
        this.events.onResults(msg);
        break;
      case "prank-unlocked":
        this.prankUnlocked = true;
        this.prankListener?.();
        break;
      case "error":
        this.events.onError(msg.message, !!msg.fatal);
        break;
    }
  }

  private resetMatchState() {
    this.snapshots = [];
    this.pendingEvents = [];
    this.predicted = null;
    this.unacked = [];
    this.clockOffset = null;
  }

  private onSnapshot(snap: Snapshot) {
    const now = performance.now();
    if (this.latest && snap.tick <= this.latest.tick) {
      // A new match restarted the tick counter.
      if (snap.tick < this.latest.tick - 30) this.resetMatchState();
      else return;
    }

    // Track the server clock. Early arrivals pull the estimate down quickly,
    // late ones (jitter) only nudge it up.
    const offset = now - snap.tick * TICK_MS;
    if (this.clockOffset === null) this.clockOffset = offset;
    else if (offset < this.clockOffset) this.clockOffset += (offset - this.clockOffset) * 0.2;
    else this.clockOffset += (offset - this.clockOffset) * 0.02;

    this.snapshots.push(snap);
    if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.shift();
    for (const event of snap.events) this.pendingEvents.push({ tick: snap.tick, event });

    // The TARDIS is a wall that moves: put it where the server says it is.
    if (snap.tardis !== tardisSpotNow()) moveTardis(snap.tardis);

    this.reconcile(snap);
  }

  /** Rewind our predicted position to the server's, then replay unacknowledged inputs. */
  private reconcile(snap: Snapshot) {
    const me = snap.players.find((p) => p.id === this.myId);
    this.unacked = this.unacked.filter((f) => f.seq > snap.ack);
    if (!me || !me.alive) {
      this.predicted = null;
      this.correction = { x: 0, y: 0 };
      return;
    }
    const pos = { x: me.x, y: me.y };
    const speed = this.speedOf(me);
    const flip = me.reversed ? -1 : 1;
    for (const f of this.unacked) movePlayer(pos, flip * f.mx, flip * f.my, speed, DT, radiusFor(me.archetype));

    if (this.predicted) {
      const dx = this.predicted.x + this.correction.x - pos.x;
      const dy = this.predicted.y + this.correction.y - pos.y;
      // Small errors are smoothed out visually; big ones (respawn, teleport) snap.
      this.correction = Math.hypot(dx, dy) > 120 ? { x: 0, y: 0 } : { x: dx, y: dy };
    }
    this.predicted = pos;
  }
}
