import { EYE_HEIGHT, MAX_PITCH } from "@/shared/constants";
import type { Renderer } from "./renderer";

/**
 * Playing the 3D view in a VR headset (WebXR: Meta Quest's browser, or a PC
 * headset with Chrome or Edge).
 *
 * The 3D view is our own raycaster, which draws a flat picture on a canvas.
 * Each frame we draw it once per eye, from that eye's spot and the way that
 * eye is looking, and hang the picture in the headset exactly where it was
 * seen from: on a big upright sheet in front of that eye. The sheet stays put
 * in the room even if the next picture is a frame late, so the world stays
 * steady as you turn your head, and the two eyes' pictures give real depth.
 */

// ---------------------------------------------------------------- WebXR types (not in TypeScript's own lib)

interface XRRigidTransform {
  position: DOMPointReadOnly;
  orientation: DOMPointReadOnly;
  matrix: Float32Array;
  inverse: XRRigidTransform;
}
interface XRView {
  eye: "left" | "right" | "none";
  projectionMatrix: Float32Array;
  transform: XRRigidTransform;
}
interface XRViewerPose {
  transform: XRRigidTransform;
  views: readonly XRView[];
}
type XRReferenceSpace = EventTarget;
interface XRFrame {
  getViewerPose(space: XRReferenceSpace): XRViewerPose | null;
}
interface XRViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface XRWebGLLayer {
  framebuffer: WebGLFramebuffer | null;
  getViewport(view: XRView): XRViewport | null;
}
interface XRHaptic {
  pulse?(value: number, ms: number): Promise<boolean>;
}
interface XRInputSource {
  handedness: "left" | "right" | "none";
  gamepad?: Gamepad & { hapticActuators?: XRHaptic[] };
}
interface XRSession extends EventTarget {
  inputSources: Iterable<XRInputSource>;
  requestAnimationFrame(cb: (time: number, frame: XRFrame) => void): number;
  cancelAnimationFrame(id: number): void;
  requestReferenceSpace(type: string): Promise<XRReferenceSpace>;
  updateRenderState(state: { baseLayer?: XRWebGLLayer; depthNear?: number; depthFar?: number }): void;
  end(): Promise<void>;
}
interface XRSystem {
  isSessionSupported(mode: string): Promise<boolean>;
  requestSession(mode: string, init?: { optionalFeatures?: string[] }): Promise<XRSession>;
}
type XRWebGLLayerClass = new (session: XRSession, gl: WebGLRenderingContext) => XRWebGLLayer;

function xrSystem(): XRSystem | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { xr?: XRSystem }).xr ?? null;
}

/** Whether this browser can show the game in a VR headset. */
export async function vrSupported(): Promise<boolean> {
  const xr = xrSystem();
  if (!xr) return false;
  try {
    return await xr.isSessionSupported("immersive-vr");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- controls

export type VrAction = "reload" | "swap" | "super" | "ability0" | "ability1" | "ability2" | "ability3";

/** The VR controllers this frame. */
export interface VrControls {
  /** Left stick: -1..1, up is negative (forward). */
  moveX: number;
  moveY: number;
  fire: boolean;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  scoreboard: boolean;
  /** Buttons pressed this frame. */
  pressed: VrAction[];
}

// ---------------------------------------------------------------- sizes

/** Map units per meter: eyes at 48 units are about 1.6 m up. */
const UNITS_PER_METER = EYE_HEIGHT / 1.6;
/** Each eye's picture covers this much side to side (a little more than a headset shows). */
const EYE_FOV = (110 * Math.PI) / 180;
const EYE_W = 960;
const EYE_H = 840;
const PROJ = EYE_W / 2 / Math.tan(EYE_FOV / 2);
/** How far in front of your eye the picture hangs (any distance looks the same; this keeps it clear of your face). */
const SHEET_DIST = 3;
/** How far the sheet carries on above and below the picture, in meters. */
const SHEET_REACH = 60;
/** The HUD box in the middle of your view, and how far away it seems. */
const HUD_W = 520;
const HUD_H = 380;
const HUD_DIST = 1.5;
/** The flat floor and ceiling past the sheet's reach: how far below and above your eyes, and how wide. */
const CAP_GAP = 2;
const CAP_SIZE = 100;
/** Picture sizes to drop to if the computer can't keep up (fractions of full size). */
const SCALES = [1, 0.8, 0.65, 0.5];
const SNAP_TURN = Math.PI / 6;
const DEAD = 0.15;

const VERT = `attribute vec3 p; attribute vec2 uv; uniform mat4 P; uniform mat4 V; varying vec2 v;
void main() { v = uv; gl_Position = P * V * vec4(p, 1.0); }`;
const FRAG = `precision mediump float; varying vec2 v; uniform sampler2D t;
void main() { gl_FragColor = texture2D(t, v); }`;

/** Which way a rotation faces: (0, 0, -1) turned by the quaternion. */
function forwardOf(q: DOMPointReadOnly) {
  return {
    x: -2 * (q.x * q.z + q.w * q.y),
    y: -2 * (q.y * q.z - q.w * q.x),
    z: -(1 - 2 * (q.x * q.x + q.y * q.y)),
  };
}

const clampPitch = (p: number) => Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p));
const dead = (v: number | undefined) => (Math.abs(v ?? 0) < DEAD ? 0 : (v ?? 0));

interface Eye {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: WebGLTexture;
  buf: WebGLBuffer;
  drawn: boolean;
}

/** One game frame in VR: where you're facing (map angle) and looking up or down. */
export type VrStep = (now: number, yaw: number, pitch: number, controls: VrControls) => void;

export class VrPlayer {
  private gl: WebGLRenderingContext;
  private layer: XRWebGLLayer;
  private space: XRReferenceSpace | null = null;
  private prog: WebGLProgram;
  /** Triangles joining the 4 x 4 grid of points each eye's sheet is made of. */
  private grid: WebGLBuffer;
  private eyes: Eye[] = [];
  private raf = 0;
  private ended = false;
  /** Map angle that the headset's starting "straight ahead" points at; snap turns change it. */
  private baseYaw: number;
  private faceYaw: number | null = null;
  private headYaw = 0;
  private prevButtons = new Map<string, boolean>();
  private turnArmed = true;
  private abilityArmed = true;
  /** Drawing both eyes every frame is too slow: draw one each frame, taking turns. */
  private alternate = false;
  private nextEye = 0;
  private eyeMs = 4;
  private frameMs = 1000 / 72;
  private lastT = 0;
  /** How big the eye pictures are drawn, from SCALES. */
  private scale = 1;

  private constructor(
    private session: XRSession,
    private renderer: Renderer,
    startYaw: number,
    private step: VrStep,
    private onEnd: () => void,
  ) {
    this.baseYaw = startYaw;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", { xrCompatible: true, alpha: false, antialias: false, depth: false } as WebGLContextAttributes);
    if (!gl) throw new Error("WebGL isn't available.");
    this.gl = gl;
    const Layer = (window as unknown as { XRWebGLLayer: XRWebGLLayerClass }).XRWebGLLayer;
    this.layer = new Layer(session, gl);
    session.updateRenderState({ baseLayer: this.layer, depthNear: 0.1, depthFar: 400 });
    this.prog = this.makeProgram();
    // First the floor and ceiling caps (points 16-23), then the sheet drawn over them.
    const tris: number[] = [16, 17, 18, 18, 17, 19, 20, 21, 22, 22, 21, 23];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const i = r * 4 + c;
        tris.push(i, i + 4, i + 1, i + 1, i + 4, i + 5);
      }
    }
    this.grid = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.grid);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(tris), gl.STATIC_DRAW);
    session.addEventListener("end", this.handleEnd);
  }

  /** Put on the headset. Call straight from a click (browsers only allow VR from one). */
  static async start(renderer: Renderer, startYaw: number, step: VrStep, onEnd: () => void): Promise<VrPlayer> {
    const xr = xrSystem();
    if (!xr) throw new Error("This browser doesn't support VR.");
    const session = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
    try {
      const vr = new VrPlayer(session, renderer, startYaw, step, onEnd);
      vr.space = await session.requestReferenceSpace("local");
      vr.raf = session.requestAnimationFrame(vr.onFrame);
      return vr;
    } catch (err) {
      session.end().catch(() => {});
      throw err;
    }
  }

  /** Take the headset view off (back to the screen). */
  end() {
    if (!this.ended) this.session.end().catch(() => this.handleEnd());
  }

  /** Face this map direction (when you respawn), whichever way your head is turned. */
  face(yaw: number) {
    this.faceYaw = yaw;
  }

  /** Buzz both controllers (getting hit). */
  rumble(strength: number, ms: number) {
    for (const src of this.session.inputSources) {
      src.gamepad?.hapticActuators?.[0]?.pulse?.(Math.min(1, strength), ms).catch(() => {});
    }
  }

  private handleEnd = () => {
    if (this.ended) return;
    this.ended = true;
    this.session.cancelAnimationFrame(this.raf);
    this.session.removeEventListener("end", this.handleEnd);
    this.onEnd();
  };

  // ------------------------------------------------------------ the frame

  private onFrame = (t: number, frame: XRFrame) => {
    if (this.ended) return;
    this.raf = this.session.requestAnimationFrame(this.onFrame);
    if (this.lastT) this.frameMs = this.frameMs * 0.95 + Math.min(50, t - this.lastT) * 0.05;
    this.lastT = t;
    const pose = this.space && frame.getViewerPose(this.space);
    if (!pose) return;

    const head = pose.transform;
    const hf = forwardOf(head.orientation);
    this.headYaw = Math.atan2(hf.x, -hf.z);
    if (this.faceYaw !== null) {
      this.baseYaw = this.faceYaw - this.headYaw;
      this.faceYaw = null;
      this.eyes.forEach((e) => (e.drawn = false));
    }
    const controls = this.readControls();
    this.step(t, this.baseYaw + this.headYaw, clampPitch(Math.asin(Math.max(-1, Math.min(1, hf.y)))), controls);

    const views = pose.views;
    while (this.eyes.length < views.length) this.eyes.push(this.makeEye());
    // Draw each eye's picture (or just one of them, taking turns, if the computer is struggling).
    const all = !this.alternate || this.eyes.some((e, i) => i < views.length && !e.drawn);
    const start = performance.now();
    let drawnNow = 0;
    views.forEach((view, i) => {
      if (!all && i !== this.nextEye % views.length) return;
      this.drawEye(i, view, head);
      drawnNow++;
    });
    this.nextEye++;
    if (drawnNow) this.eyeMs = this.eyeMs * 0.9 + ((performance.now() - start) / drawnNow) * 0.1;
    // Switch between both-eyes and taking-turns with some slack so it doesn't flip back and forth.
    if (!this.alternate && this.eyeMs * 2 > this.frameMs * 0.75) this.alternate = true;
    else if (this.alternate && this.eyeMs * 2 < this.frameMs * 0.45) this.alternate = false;
    // Still too slow even taking turns: make the pictures smaller (and bigger again when there's room).
    const level = SCALES.indexOf(this.scale);
    if (this.alternate && this.eyeMs > this.frameMs * 0.7 && level < SCALES.length - 1) this.setScale(SCALES[level + 1]);
    else if (!this.alternate && this.eyeMs * 2 < this.frameMs * 0.3 && level > 0) this.setScale(SCALES[level - 1]);

    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.layer.framebuffer);
    gl.clearColor(0.09, 0.09, 0.11, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    const locP = gl.getUniformLocation(this.prog, "P");
    const locV = gl.getUniformLocation(this.prog, "V");
    const locPos = gl.getAttribLocation(this.prog, "p");
    const locUv = gl.getAttribLocation(this.prog, "uv");
    views.forEach((view, i) => {
      const vp = this.layer.getViewport(view);
      const eye = this.eyes[i];
      if (!vp || !eye.drawn) return;
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      gl.uniformMatrix4fv(locP, false, view.projectionMatrix);
      gl.uniformMatrix4fv(locV, false, view.transform.inverse.matrix);
      gl.bindBuffer(gl.ARRAY_BUFFER, eye.buf);
      gl.enableVertexAttribArray(locPos);
      gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(locUv);
      gl.vertexAttribPointer(locUv, 2, gl.FLOAT, false, 20, 12);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, eye.tex);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.grid);
      gl.drawElements(gl.TRIANGLES, 66, gl.UNSIGNED_SHORT, 0);
    });
  };


  private setScale(s: number) {
    this.scale = s;
    this.eyes.forEach((e) => (e.drawn = false));
    // Give the new size a moment before judging it.
    this.eyeMs = this.frameMs * 0.4;
  }
  /** Draw what one eye sees and hang it in front of that eye. */
  private drawEye(i: number, view: XRView, head: XRRigidTransform) {
    const eye = this.eyes[i];
    const f = forwardOf(view.transform.orientation);
    const look = Math.atan2(f.x, -f.z);
    const pitch = clampPitch(Math.asin(Math.max(-1, Math.min(1, f.y))));
    const s = this.scale;
    const W = Math.round(EYE_W * s);
    const H = Math.round(EYE_H * s);
    const proj = PROJ * (W / EYE_W);
    if (eye.canvas.width !== W || eye.canvas.height !== H) {
      eye.canvas.width = W;
      eye.canvas.height = H;
    }
    const horizon = H / 2 + Math.tan(pitch) * proj;
    // Where this eye is next to the middle of your head, turned into map units and directions.
    const p = view.transform.position;
    const ex = p.x - head.position.x;
    const ez = p.z - head.position.z;
    const b = this.baseYaw;
    const dx = (ex * -Math.sin(b) + -ez * Math.cos(b)) * UNITS_PER_METER;
    const dy = (ex * Math.cos(b) + -ez * Math.sin(b)) * UNITS_PER_METER;
    // Slide the HUD inward a little in each eye so it seems to float at arm's length.
    const side = view.eye === "right" ? -1 : 1;
    const hudShift = view.eye === "none" ? 0 : side * (Math.hypot(ex, ez) / HUD_DIST) * proj;

    this.renderer.drawVrEye(eye.ctx, W, H, {
      dx,
      dy,
      yaw: b + look,
      pitch,
      fov: EYE_FOV,
      hudW: HUD_W,
      hudH: HUD_H,
      hudShift,
      hudScale: s,
      primary: i === 0,
    });

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, eye.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, eye.canvas);

    // The picture's corners, out in the room: an upright sheet facing the way the eye looked.
    const fx = Math.sin(look);
    const fz = -Math.cos(look);
    const rx = Math.cos(look);
    const rz = Math.sin(look);
    // Past its edges the sheet carries on far out in every direction, stretching the picture's edge
    // pixels (ceiling above, floor below), so looking steeply up or down never shows a gap.
    // A 4 x 4 grid of points: [far, edge, edge, far] across and down.
    const verts = new Float32Array(24 * 5);
    let n = 0;
    for (const [py, lift] of [
      [0, SHEET_REACH],
      [0, 0],
      [H, 0],
      [H, -SHEET_REACH],
    ]) {
      for (const [px, slide] of [
        [0, -SHEET_REACH],
        [0, 0],
        [W, 0],
        [W, SHEET_REACH],
      ]) {
        const a = (px - W / 2) / proj;
        const up = (horizon - py) / proj;
        verts.set(
          [
            p.x + SHEET_DIST * (fx + rx * a) + rx * slide,
            p.y + SHEET_DIST * up + lift,
            p.z + SHEET_DIST * (fz + rz * a) + rz * slide,
            px / W,
            py / H,
          ],
          n,
        );
        n += 5;
      }
    }
    // Straight down and straight up (past where the sheet reaches): a flat floor and ceiling in
    // the color of the middle of the picture's bottom and top edges.
    for (const [dy, v] of [
      [-CAP_GAP, 0.999],
      [CAP_GAP, 0.001],
    ]) {
      for (const [cx, cz] of [
        [-CAP_SIZE, -CAP_SIZE],
        [CAP_SIZE, -CAP_SIZE],
        [-CAP_SIZE, CAP_SIZE],
        [CAP_SIZE, CAP_SIZE],
      ]) {
        verts.set([p.x + cx, p.y + dy, p.z + cz, 0.5, v], n);
        n += 5;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, eye.buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    eye.drawn = true;
  }

  // ------------------------------------------------------------ controllers

  /**
   * Left stick moves, left trigger (or clicking the stick) sprints, left grip
   * holds the scoreboard, X reloads, Y switches weapon. Right trigger throws,
   * right grip is your super (or the Principal's first power), A jumps, B
   * crouches, the right stick snap-turns left and right, and up, down and
   * clicking it are the Principal's other powers.
   */
  private readControls(): VrControls {
    const c: VrControls = { moveX: 0, moveY: 0, fire: false, jump: false, sprint: false, crouch: false, scoreboard: false, pressed: [] };
    const seen = new Map<string, boolean>();
    for (const src of this.session.inputSources) {
      const pad = src.gamepad;
      if (!pad || src.handedness === "none") continue;
      const hand = src.handedness;
      const down = (i: number) => {
        const b = pad.buttons[i];
        return !!b && (b.pressed || b.value > 0.5);
      };
      const press = (i: number) => {
        const key = `${hand}${i}`;
        const d = down(i);
        seen.set(key, d);
        return d && !this.prevButtons.get(key);
      };
      // Sticks are axes 2 and 3 on most controllers (0 and 1 on a few).
      const sx = dead(pad.axes.length >= 4 ? pad.axes[2] : pad.axes[0]);
      const sy = dead(pad.axes.length >= 4 ? pad.axes[3] : pad.axes[1]);
      if (hand === "left") {
        c.moveX = sx;
        c.moveY = sy;
        c.sprint = down(0) || down(3);
        c.scoreboard = down(1);
        if (press(4)) c.pressed.push("reload");
        if (press(5)) c.pressed.push("swap");
      } else {
        c.fire = down(0);
        c.jump = down(4);
        c.crouch = down(5);
        if (press(1)) c.pressed.push("super", "ability0");
        if (press(3)) c.pressed.push("ability3");
        // Snap turn, once per push.
        if (this.turnArmed && Math.abs(sx) > 0.7) {
          this.turnArmed = false;
          this.baseYaw += Math.sign(sx) * SNAP_TURN;
          this.eyes.forEach((e) => (e.drawn = false));
        } else if (Math.abs(sx) < 0.3) {
          this.turnArmed = true;
        }
        if (this.abilityArmed && Math.abs(sy) > 0.7) {
          this.abilityArmed = false;
          c.pressed.push(sy < 0 ? "ability1" : "ability2");
        } else if (Math.abs(sy) < 0.3) {
          this.abilityArmed = true;
        }
      }
    }
    this.prevButtons = seen;
    return c;
  }

  // ------------------------------------------------------------ WebGL setup

  private makeEye(): Eye {
    const gl = this.gl;
    const canvas = document.createElement("canvas");
    canvas.width = EYE_W;
    canvas.height = EYE_H;
    const ctx = canvas.getContext("2d")!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return { canvas, ctx, tex, buf: gl.createBuffer()!, drawn: false };
  }

  private makeProgram(): WebGLProgram {
    const gl = this.gl;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader failed");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link failed");
    return prog;
  }
}
