import { EYE_HEIGHT, MAX_PITCH } from "@/shared/constants";
import type { Renderer, VrArms } from "./renderer";
import { VR_QUALITY_SCALE, getVrQuality } from "@/lib/settings";

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
type XRSpace = EventTarget;
interface XRFrame {
  getViewerPose(space: XRReferenceSpace): XRViewerPose | null;
  getPose(space: XRSpace, base: XRReferenceSpace): { transform: XRRigidTransform } | null;
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
  gripSpace?: XRSpace;
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
const EYE_W = 1440;
const EYE_H = 1260;
const PROJ = EYE_W / 2 / Math.tan(EYE_FOV / 2);
/** How far in front of your eye the picture hangs (any distance looks the same; this keeps it clear of your face). */
const SHEET_DIST = 3;
/** How far the sheet carries on above and below the picture, in meters. */
const SHEET_REACH = 60;
/** The HUD box in the middle of your view, and how far away it seems. */
const HUD_W = 520;
const HUD_H = 380;
const HUD_DIST = 1.5;
/** The arm screens: canvas size, width in meters, how far back from the controller toward your elbow, and how high above it. */
const WRIST_W = 560;
const WRIST_H = 400;
const WRIST_SIZE = 0.22;
const WRIST_BACK = 0.08;
const WRIST_RAISE = 0.1;
/** The flat floor and ceiling past the sheet's reach: how far below and above your eyes, and how wide. */
/** The game's floor is this far below your eyes and its ceiling this far above (80 units up), in meters. */
const FLOOR_DROP = EYE_HEIGHT / UNITS_PER_METER;
const CEILING_RISE = (80 - EYE_HEIGHT) / UNITS_PER_METER;
const CAP_SIZE = 100;
/** Picture sizes to drop to if the computer can't keep up (fractions of full size). */
const SCALES = [1, 0.85, 0.7, 0.55, 0.45];
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


type Side = "left" | "right";

/** A screen strapped to one arm. */
interface ArmScreen {
  grip: XRRigidTransform | null;
  canvas: HTMLCanvasElement | null;
  tex: WebGLTexture | null;
  buf: WebGLBuffer | null;
  drawnAt: number;
  /** Something is set to go on this arm. */
  showing: boolean;
}

const newArm = (): ArmScreen => ({ grip: null, canvas: null, tex: null, buf: null, drawnAt: 0, showing: false });

// ---------------------------------------------------------------- arm meshes

const SOLID_VERT = `attribute vec3 p; attribute vec3 c; uniform mat4 P; uniform mat4 V; varying vec3 vc;
void main() { vc = c; gl_Position = P * V * vec4(p, 1.0); }`;
const SOLID_FRAG = `precision mediump float; varying vec3 vc;
void main() { gl_FragColor = vec4(vc, 1.0); }`;

type V3 = [number, number, number];
/** Forearm length, wrist to elbow, in meters. */
const FOREARM = 0.25;
/** Light from above and a little in front, for shading the arms. */
const SUN: V3 = (() => {
  const v: V3 = [0.3, 0.9, 0.35];
  const l = Math.hypot(...v);
  return v.map((x) => x / l) as V3;
})();

function rotateBy(q: DOMPointReadOnly, v: V3): V3 {
  const { x, y, z, w } = q;
  return [
    (1 - 2 * (y * y + z * z)) * v[0] + 2 * (x * y - w * z) * v[1] + 2 * (x * z + w * y) * v[2],
    2 * (x * y + w * z) * v[0] + (1 - 2 * (x * x + z * z)) * v[1] + 2 * (y * z - w * x) * v[2],
    2 * (x * z - w * y) * v[0] + 2 * (y * z + w * x) * v[1] + (1 - 2 * (x * x + y * y)) * v[2],
  ];
}
const add = (p: V3, dir: V3, by: number): V3 => [p[0] + dir[0] * by, p[1] + dir[1] * by, p[2] + dir[2] * by];

const colorCache = new Map<string, V3>();
/** Any CSS color as 0-1 RGB. */
function rgb(css: string): V3 {
  let c = colorCache.get(css);
  if (!c) {
    const g = document.createElement("canvas").getContext("2d")!;
    g.fillStyle = "#888888";
    g.fillStyle = css;
    const hex = String(g.fillStyle);
    c =
      hex.startsWith("#") && hex.length === 7
        ? [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]
        : [0.6, 0.6, 0.6];
    colorCache.set(css, c);
  }
  return c;
}

/** Shade a color for a surface facing `n`. */
function lit(color: V3, n: V3): V3 {
  const f = 0.5 + 0.5 * Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]);
  return [color[0] * f, color[1] * f, color[2] * f];
}

function tri(out: number[], a: V3, b: V3, c: V3, col: V3) {
  out.push(...a, ...col, ...b, ...col, ...c, ...col);
}

/** A box centered at `c`, with half-sizes `h` along the axes `ax`, `ay`, `az`. */
function addBox(out: number[], c: V3, ax: V3, ay: V3, az: V3, h: V3, color: V3) {
  const corner = ([sx, sy, sz]: V3): V3 => add(add(add(c, ax, sx * h[0]), ay, sy * h[1]), az, sz * h[2]);
  const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
  const faces: [V3, V3[]][] = [
    [ax, [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
    [neg(ax), [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [ay, [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
    [neg(ay), [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
    [az, [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [neg(az), [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
  ];
  for (const [n, quad] of faces) {
    const [a, b, cc, d] = quad.map(corner);
    const col = lit(color, n);
    tri(out, a, b, cc, col);
    tri(out, a, cc, d, col);
  }
}

/** A round ball (8 slices, 6 rings). */
function addBall(out: number[], c: V3, r: number, color: V3) {
  const at = (i: number, j: number): V3 => {
    const th = (i / 6) * Math.PI;
    const ph = (j / 8) * Math.PI * 2;
    return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
  };
  const p = (n: V3): V3 => [c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r];
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 8; j++) {
      const col = lit(color, at(i + 0.5, j + 0.5));
      tri(out, p(at(i, j)), p(at(i + 1, j)), p(at(i + 1, j + 1)), col);
      tri(out, p(at(i, j)), p(at(i + 1, j + 1)), p(at(i, j + 1)), col);
    }
  }
}
interface Eye {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: WebGLTexture;
  buf: WebGLBuffer;
  drawn: boolean;
  /** Out of date (you turned, respawned or the size changed): draw it again next frame, but keep showing it until then. */
  stale: boolean;
}

/** One game frame in VR: where you're facing (map angle) and looking up or down. */
export type VrStep = (now: number, yaw: number, pitch: number, controls: VrControls) => void;

export class VrPlayer {
  private gl: WebGLRenderingContext;
  private layer: XRWebGLLayer;
  private space: XRReferenceSpace | null = null;
  private prog: WebGLProgram;
  /** Plain colored shapes (your arms), and their points. */
  private solidProg: WebGLProgram;
  private armBuf: WebGLBuffer;
  /** Triangles joining the 6 x 4 grid of points each eye's sheet is made of. */
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
  /** Each arm's controller this frame and its screen, and where your head is. */
  private arms: Record<Side, ArmScreen> = { left: newArm(), right: newArm() };
  private headPos: DOMPointReadOnly | null = null;

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
    this.prog = this.makeProgram(VERT, FRAG);
    this.solidProg = this.makeProgram(SOLID_VERT, SOLID_FRAG);
    this.armBuf = gl.createBuffer()!;
    // First the floor and ceiling caps (points 24-31), then the sheet drawn over them.
    const tris: number[] = [24, 25, 26, 26, 25, 27, 28, 29, 30, 30, 29, 31];
    for (let r = 0; r < 5; r++) {
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
      this.eyes.forEach((e) => (e.stale = true));
    }
    const controls = this.readControls();
    // Each controller's grip, for the arm screens.
    this.headPos = head.position;
    this.arms.left.grip = null;
    this.arms.right.grip = null;
    for (const src of this.session.inputSources) {
      if (src.handedness !== "none" && src.gripSpace && this.space) {
        this.arms[src.handedness].grip = frame.getPose(src.gripSpace, this.space)?.transform ?? null;
      }
    }
    this.step(t, this.baseYaw + this.headYaw, clampPitch(Math.asin(Math.max(-1, Math.min(1, hf.y)))), controls);

    const views = pose.views;
    while (this.eyes.length < views.length) this.eyes.push(this.makeEye());
    // Draw each eye's picture (or just one of them, taking turns, if the computer is struggling).
    const all = !this.alternate || this.eyes.some((e, i) => i < views.length && (!e.drawn || e.stale));
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
    // Settings picks the resolution; on Auto it drops a step at a time if the headset struggles.
    const quality = getVrQuality();
    if (quality !== "auto") {
      if (this.scale !== VR_QUALITY_SCALE[quality]) this.setScale(VR_QUALITY_SCALE[quality]);
    } else {
      const level = Math.max(0, SCALES.indexOf(this.scale));
      if (!SCALES.includes(this.scale)) this.setScale(SCALES[0]);
      else if (this.alternate && this.eyeMs > this.frameMs * 0.7 && level < SCALES.length - 1) this.setScale(SCALES[level + 1]);
      else if (!this.alternate && this.eyeMs * 2 < this.frameMs * 0.3 && level > 0) this.setScale(SCALES[level - 1]);
    }

    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.layer.framebuffer);
    gl.clearColor(0.09, 0.09, 0.11, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
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
      gl.drawElements(gl.TRIANGLES, 102, gl.UNSIGNED_SHORT, 0);
    });
    // Your tracked arms, then the screens on them, on top of everything, in both eyes.
    this.drawArms(views, t);
    for (const side of ["left", "right"] as const) this.drawArm(side, views, locP, locV, locPos, locUv, t);
  };

  // ------------------------------------------------------------ your tracked arms

  /**
   * Your arms, where your real ones are: a hand around each controller and a
   * sleeved forearm reaching back toward your elbow, in your class's colors,
   * with the ball in your throwing (right) hand.
   */
  private drawArms(views: readonly XRView[], t: number) {
    const look = this.renderer.vrArmLook(t);
    const left = this.arms.left.grip;
    const right = this.arms.right.grip;
    if (!look || (!left && !right)) return;
    const mesh: number[] = [];
    const sleeve = rgb(look.sleeve);
    const skin = rgb(look.skin);
    for (const [grip, throwing] of [
      [left, false],
      [right, true],
    ] as const) {
      if (!grip) continue;
      const q = grip.orientation;
      const g: V3 = [grip.position.x, grip.position.y, grip.position.z];
      const ax = rotateBy(q, [1, 0, 0]);
      const ay = rotateBy(q, [0, 1, 0]);
      const az = rotateBy(q, [0, 0, 1]); // back along your forearm, toward the elbow
      // Your fist around the controller.
      addBox(mesh, add(g, az, 0.01), ax, ay, az, [0.035, 0.045, 0.05], skin);
      // The forearm, from the wrist back to the elbow, in your sleeve.
      addBox(mesh, add(g, az, 0.06 + FOREARM / 2), ax, ay, az, [0.033, 0.033, FOREARM / 2], sleeve);
      if (throwing && look.ball) addBall(mesh, add(add(g, az, -0.075), ay, 0.015), 0.045, rgb(look.ball));
    }
    const gl = this.gl;
    const prog = this.solidProg;
    gl.useProgram(prog);
    gl.enable(gl.DEPTH_TEST);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.armBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh), gl.DYNAMIC_DRAW);
    const locP = gl.getUniformLocation(prog, "P");
    const locV = gl.getUniformLocation(prog, "V");
    const locPos = gl.getAttribLocation(prog, "p");
    const locCol = gl.getAttribLocation(prog, "c");
    gl.enableVertexAttribArray(locPos);
    gl.enableVertexAttribArray(locCol);
    for (const view of views) {
      const vp = this.layer.getViewport(view);
      if (!vp) continue;
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      gl.uniformMatrix4fv(locP, false, view.projectionMatrix);
      gl.uniformMatrix4fv(locV, false, view.transform.inverse.matrix);
      gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(locCol, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.length / 6);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.prog);
  }

  // ------------------------------------------------------------ the arm screens

  /** The screen strapped to one arm, showing whatever Settings puts on that arm. */
  private drawArm(
    side: Side,
    views: readonly XRView[],
    locP: WebGLUniformLocation | null,
    locV: WebGLUniformLocation | null,
    locPos: number,
    locUv: number,
    t: number,
  ) {
    const arm = this.arms[side];
    const grip = arm.grip;
    const head = this.headPos;
    if (!grip || !head) return;
    const gl = this.gl;
    if (!arm.tex) {
      arm.canvas = document.createElement("canvas");
      arm.canvas.width = WRIST_W;
      arm.canvas.height = WRIST_H;
      arm.tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, arm.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      arm.buf = gl.createBuffer()!;
    }
    // Redraw the screen's contents about 30 times a second (it's small, and that's plenty).
    if (t - arm.drawnAt > 30) {
      arm.drawnAt = t;
      arm.showing = this.renderer.drawVrArm(arm.canvas!.getContext("2d")!, WRIST_W, WRIST_H, this.baseYaw + this.headYaw, side, this.armsPresent());
      if (arm.showing) {
        gl.bindTexture(gl.TEXTURE_2D, arm.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, arm.canvas!);
      }
    }
    if (!arm.showing) return;

    // Just above your wrist (back from the controller toward your elbow), turned to face your eyes.
    const q = grip.orientation;
    const back = { x: 2 * (q.x * q.z + q.w * q.y), y: 2 * (q.y * q.z - q.w * q.x), z: 1 - 2 * (q.x * q.x + q.y * q.y) };
    const c = {
      x: grip.position.x + back.x * WRIST_BACK,
      y: grip.position.y + back.y * WRIST_BACK + WRIST_RAISE,
      z: grip.position.z + back.z * WRIST_BACK,
    };
    let nx = head.x - c.x;
    let ny = head.y - c.y;
    let nz = head.z - c.z;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    // Right = up x facing; screen-up = facing x right.
    let rx = nz;
    let rz = -nx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    const ux = ny * rz;
    const uy = nz * rx - nx * rz;
    const uz = -ny * rx;
    const hw = WRIST_SIZE / 2;
    const hh = (WRIST_SIZE * WRIST_H) / WRIST_W / 2;
    const pt = (sx: number, sy: number, u: number, v: number) => [c.x + rx * sx + ux * sy, c.y + uy * sy, c.z + rz * sx + uz * sy, u, v];
    const verts = new Float32Array([...pt(-hw, hh, 0, 0), ...pt(-hw, -hh, 0, 1), ...pt(hw, hh, 1, 0), ...pt(hw, -hh, 1, 1)]);
    gl.bindBuffer(gl.ARRAY_BUFFER, arm.buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const view of views) {
      const vp = this.layer.getViewport(view);
      if (!vp) continue;
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      gl.uniformMatrix4fv(locP, false, view.projectionMatrix);
      gl.uniformMatrix4fv(locV, false, view.transform.inverse.matrix);
      gl.enableVertexAttribArray(locPos);
      gl.enableVertexAttribArray(locUv);
      gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(locUv, 2, gl.FLOAT, false, 20, 12);
      gl.bindTexture(gl.TEXTURE_2D, arm.tex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND);
  }

  /** Which hands have a controller this frame. */
  private armsPresent(): VrArms {
    return { left: !!this.arms.left.grip, right: !!this.arms.right.grip };
  }


  private setScale(s: number) {
    this.scale = s;
    this.eyes.forEach((e) => (e.stale = true));
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
      hudScale: s * (EYE_W / 960),
      primary: i === 0,
      arms: this.armsPresent(),
    });

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, eye.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, eye.canvas);

    // The picture's corners, out in the room: an upright sheet facing the way the eye looked.
    const fx = Math.sin(look);
    const fz = -Math.cos(look);
    const rx = Math.cos(look);
    const rz = Math.sin(look);
    // Past its top and bottom edges the sheet folds onto the real ceiling and floor (at the right
    // height above and below your head, the same for both eyes, so they look solid, not like a
    // hole), stretching the picture's edge rows over them, all the way to straight above and below
    // you. Six rows of points: [over your head, edge's ceiling spot, top edge, bottom edge, edge's
    // floor spot, under your feet], each across [far left, left edge, right edge, far right].
    const hp = head.position;
    const floorY = hp.y - FLOOR_DROP;
    const ceilY = hp.y + CEILING_RISE;
    const verts = new Float32Array(32 * 5);
    let n = 0;
    const put = (x: number, y: number, z: number, u: number, v: number) => {
      verts.set([x, y, z, u, v], n);
      n += 5;
    };
    const cols: [number, number][] = [
      [0, -SHEET_REACH],
      [0, 0],
      [W, 0],
      [W, SHEET_REACH],
    ];
    const edge = (px: number, slide: number, py: number) => {
      const a = (px - W / 2) / proj;
      const up = (horizon - py) / proj;
      return {
        x: p.x + SHEET_DIST * (fx + rx * a) + rx * slide,
        y: p.y + SHEET_DIST * up,
        z: p.z + SHEET_DIST * (fz + rz * a) + rz * slide,
        side: SHEET_DIST * a + slide,
      };
    };
    // Where the ray from this eye through an edge point meets the plane at height `planeY`
    // (or, if it never does, a point far straight up or down from the edge).
    const meet = (e: { x: number; y: number; z: number }, planeY: number) => {
      const dy = e.y - p.y;
      const towards = planeY > p.y ? dy > 0.02 : dy < -0.02;
      if (!towards) return { x: e.x, y: e.y + Math.sign(planeY - p.y) * SHEET_REACH, z: e.z };
      const k = (planeY - p.y) / dy;
      return { x: p.x + (e.x - p.x) * k, y: planeY, z: p.z + (e.z - p.z) * k };
    };
    for (const [row, v] of [
      ["overhead", 0],
      ["ceiling", 0],
      ["top", 0],
      ["bottom", 1],
      ["floor", 1],
      ["underfoot", 1],
    ] as const) {
      for (const [px, slide] of cols) {
        const u = px / W;
        const top = edge(px, slide, 0);
        const bottom = edge(px, slide, H);
        if (row === "top") put(top.x, top.y, top.z, u, v);
        else if (row === "bottom") put(bottom.x, bottom.y, bottom.z, u, v);
        else if (row === "ceiling" || row === "floor") {
          const m = meet(row === "ceiling" ? top : bottom, row === "ceiling" ? ceilY : floorY);
          put(m.x, m.y, m.z, u, v);
        } else {
          // Straight over your head or under your feet, at the same distance to the side.
          const e = row === "overhead" ? top : bottom;
          put(hp.x + rx * e.side, row === "overhead" ? ceilY : floorY, hp.z + rz * e.side, u, v);
        }
      }
    }
    // Everywhere else: a flat floor and ceiling in the color of the middle of the picture's bottom
    // and top edges, around your head.
    for (const [y, v] of [
      [floorY, 0.999],
      [ceilY, 0.001],
    ]) {
      for (const [cx, cz] of [
        [-CAP_SIZE, -CAP_SIZE],
        [CAP_SIZE, -CAP_SIZE],
        [-CAP_SIZE, CAP_SIZE],
        [CAP_SIZE, CAP_SIZE],
      ]) {
        put(hp.x + cx, y, hp.z + cz, 0.5, v);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, eye.buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    eye.drawn = true;
    eye.stale = false;
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
          this.eyes.forEach((e) => (e.stale = true));
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
    return { canvas, ctx, tex, buf: gl.createBuffer()!, drawn: false, stale: false };
  }

  private makeProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader failed");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link failed");
    return prog;
  }
}
