import { EYE_HEIGHT, MAX_PITCH } from "@/shared/constants";
import type { Renderer, VrArms } from "./renderer";
import {
  VR_HUD_ITEMS,
  VR_QUALITIES,
  VR_QUALITY_SCALE,
  VR_SPOTS,
  getVrHud,
  getVrQuality,
  resetVrHud,
  saveVrQuality,
  setVrSpot,
} from "@/lib/settings";
import { VrWorld } from "./vrworld";

/**
 * Playing the 3D view in a VR headset (WebXR: Meta Quest's browser, or a PC
 * headset with Chrome or Edge).
 *
 * The school is drawn in real 3D on the graphics chip (see vrworld.ts), at
 * the headset's own resolution, from each eye. Your head looks around, your
 * controllers are your hands (and carry screens with your health and the
 * rest), and the crosshair floats in the middle of your view.
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
  targetRaySpace?: XRSpace;
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
type XRWebGLLayerClass = new (
  session: XRSession,
  gl: WebGLRenderingContext,
  init?: { framebufferScaleFactor?: number; antialias?: boolean },
) => XRWebGLLayer;

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
  /** At the arcade machine (2D matches): the right stick, to aim with. */
  aimX?: number;
  aimY?: number;
  /** Buttons pressed this frame. */
  pressed: VrAction[];
}

// ---------------------------------------------------------------- sizes

/** Map units per meter: eyes at 48 units are about 1.6 m up. */
const UNITS_PER_METER = EYE_HEIGHT / 1.6;
/** The HUD in the middle of your view (crosshair, hurt flash, anything set to "In front"): canvas size, how far away, how wide (half-angle). */
const VIEW_W = 1024;
const VIEW_H = 720;
const VIEW_DIST = 1.5;
const VIEW_HALF_ANGLE = (38 * Math.PI) / 180;
/** If you walk around your real room, the game drifts you back to where you are in the match once you're this far off (meters). */
const ROOM_SLACK = 0.35;
/** The arm screens: canvas size, width in meters, how far back from the controller toward your elbow, and how high above it. */
const WRIST_W = 560;
const WRIST_H = 400;
const WRIST_SIZE = 0.22;
const WRIST_BACK = 0.08;
const WRIST_RAISE = 0.1;
/** Headset resolutions Auto steps down through if frames are being missed. */
const AUTO_SCALES = [1, 0.8, 0.65];
/** The settings menu: canvas width, title space, row height, width in meters and how far in front of you. */
const MENU_W = 900;
const MENU_TOP = 130;
const MENU_ROW = 62;
const MENU_SIZE = 0.9;
const MENU_DIST = 1.1;
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

/** One game frame in VR: where you aim (map angle, up or down), your controllers, and which way you face for walking. */
export type VrStep = (now: number, yaw: number, pitch: number, controls: VrControls, moveYaw: number) => void;

export class VrPlayer {
  private gl: WebGLRenderingContext;
  private layer: XRWebGLLayer;
  private space: XRReferenceSpace | null = null;
  private prog: WebGLProgram;
  /** Plain colored shapes (your arms), and their points. */
  private solidProg: WebGLProgram;
  private armBuf: WebGLBuffer;
  /** The school in 3D. */
  private world: VrWorld;
  /** The HUD in the middle of your view. */
  private view = { canvas: null as HTMLCanvasElement | null, tex: null as WebGLTexture | null, buf: null as WebGLBuffer | null, drawnAt: 0 };
  /** Where your spot in the match is in your real room (meters), and your head's height when you started. */
  private anchor: { x: number; y: number; z: number } | null = null;
  /** The headset resolution in use (1 = its normal), and Auto's watch on missed frames. */
  private layerScale = 1;
  private bestFrameMs = 1000;
  private slowFrames = 0;
  private raf = 0;
  private ended = false;
  /** Map angle that the headset's starting "straight ahead" points at; snap turns change it. */
  private baseYaw: number;
  private faceYaw: number | null = null;
  private headYaw = 0;
  private prevButtons = new Map<string, boolean>();
  private turnArmed = true;
  private abilityArmed = true;
  private frameMs = 1000 / 72;
  private lastT = 0;
  /** Each arm's controller this frame and its screen, and where your head is. */
  private arms: Record<Side, ArmScreen> = { left: newArm(), right: newArm() };
  private headPos: DOMPointReadOnly | null = null;
  /** Where your right controller points this frame (you aim with it), and the matrix placing the world. */
  private aimRay: XRRigidTransform | null = null;
  private lastM: Float32Array | null = null;
  private reticle = { tex: null as WebGLTexture | null, buf: null as WebGLBuffer | null, laser: null as WebGLBuffer | null };
  /** The settings menu (☰): open or not, its panel, where it hangs, and which row the laser is on. */
  private menu = {
    open: false,
    placed: false,
    hover: -1,
    canvas: null as HTMLCanvasElement | null,
    tex: null as WebGLTexture | null,
    buf: null as WebGLBuffer | null,
    center: [0, 0, 0] as V3,
    right: [1, 0, 0] as V3,
  };
  private sticksWere = false;
  /** 2D matches: the canvas the game draws on, shown on the arcade machine's screen (null in 3D). */
  private arcade: HTMLCanvasElement | null = null;
  private cabinet: { solid: WebGLBuffer; count: number; screen: WebGLBuffer; screenTex: WebGLTexture; marquee: WebGLBuffer; marqueeTex: WebGLTexture; floor: WebGLBuffer; floorTex: WebGLTexture } | null = null;

  private constructor(
    private session: XRSession,
    private renderer: Renderer,
    startYaw: number,
    private step: VrStep,
    private onEnd: () => void,
  ) {
    this.baseYaw = startYaw;
    const canvas = document.createElement("canvas");
    const attrs = { xrCompatible: true, alpha: false, antialias: true } as WebGLContextAttributes;
    // WebGL 2 where there is one (sharper textures in the distance), WebGL 1 otherwise.
    const gl = (canvas.getContext("webgl2", attrs) ?? canvas.getContext("webgl", attrs)) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL isn't available.");
    this.gl = gl;
    this.layerScale = this.wantedScale();
    this.layer = this.makeLayer(this.layerScale);
    this.prog = this.makeProgram(VERT, FRAG);
    this.solidProg = this.makeProgram(SOLID_VERT, SOLID_FRAG);
    this.armBuf = gl.createBuffer()!;
    this.world = new VrWorld(gl);
    session.addEventListener("end", this.handleEnd);
  }

  /** Put on the headset. Call straight from a click (browsers only allow VR from one). */
  static async start(
    renderer: Renderer,
    startYaw: number,
    step: VrStep,
    onEnd: () => void,
    /** 2D matches: play on an arcade machine whose screen shows this canvas (the 2D game). */
    opts?: { arcade?: HTMLCanvasElement },
  ): Promise<VrPlayer> {
    const xr = xrSystem();
    if (!xr) throw new Error("This browser doesn't support VR.");
    const session = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
    try {
      const vr = new VrPlayer(session, renderer, startYaw, step, onEnd);
      vr.arcade = opts?.arcade ?? null;
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
    // Aim with your right hand: where its controller points (or where you look, without one).
    this.aimRay = null;
    for (const src of this.session.inputSources) {
      if (src.handedness === "right" && src.targetRaySpace && this.space) {
        this.aimRay = frame.getPose(src.targetRaySpace, this.space)?.transform ?? null;
      }
    }
    const lookYaw = this.baseYaw + this.headYaw;
    const lookPitch = clampPitch(Math.asin(Math.max(-1, Math.min(1, hf.y))));
    let aimYaw = lookYaw;
    let aimPitch = lookPitch;
    if (this.aimRay) {
      const d = forwardOf(this.aimRay.orientation);
      aimYaw = this.baseYaw + Math.atan2(d.x, -d.z);
      aimPitch = clampPitch(Math.asin(Math.max(-1, Math.min(1, d.y))));
    }
    // You walk the way you look, and throw the way your hand points.
    this.step(t, aimYaw, aimPitch, controls, lookYaw);
    if (this.arcade) {
      // A 2D match: you're at the arcade machine, playing it on its screen.
      this.adjustResolution();
      this.drawArcadeFrame(pose.views, head, t);
      return;
    }

    this.adjustResolution();
    const views = pose.views;
    const scene = this.renderer.vrScene(aimYaw);

    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.layer.framebuffer);
    const fog = scene?.fog.color ?? [24, 24, 28];
    gl.clearColor(fog[0] / 255, fog[1] / 255, fog[2] / 255, 1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (scene) {
      this.lastM = this.worldMatrix(head.position, scene);
      this.world.draw(views, (i) => this.layer.getViewport(views[i]), scene, this.lastM);
    }
    // Your tracked arms, the screens on them, and the HUD in the middle of your view, on top.
    this.drawArms(views, t);
    gl.useProgram(this.prog);
    const locP = gl.getUniformLocation(this.prog, "P");
    const locV = gl.getUniformLocation(this.prog, "V");
    const locPos = gl.getAttribLocation(this.prog, "p");
    const locUv = gl.getAttribLocation(this.prog, "uv");
    for (const side of ["left", "right"] as const) this.drawArm(side, views, locP, locV, locPos, locUv, t);
    this.drawView(views, head, locP, locV, locPos, locUv, t);
    if (this.menu.open) this.drawMenu(views, head, locP, locV, locPos, locUv, t);
    else if (this.aimRay && scene && this.lastM) this.drawReticle(views, head, aimYaw, aimPitch, locP, locV, locPos, locUv);
  };

  /**
   * Where the world goes in your real room: your spot in the match sits under
   * where you're standing, the map's "ahead" lines up with the way the headset
   * first faced (turned by snap turns), and the floor is your eye height below
   * your eyes. Leaning moves your view a little; walk too far in your room and
   * your spot slides back under you.
   */
  private worldMatrix(head: DOMPointReadOnly, scene: { x: number; y: number; eyeZ: number }) {
    if (!this.anchor) this.anchor = { x: head.x, y: head.y, z: head.z };
    const a = this.anchor;
    const dx = head.x - a.x;
    const dz = head.z - a.z;
    const off = Math.hypot(dx, dz);
    if (off > ROOM_SLACK) {
      const k = (off - ROOM_SLACK) / off;
      a.x += dx * k;
      a.z += dz * k;
    }
    const U = UNITS_PER_METER;
    const b = this.baseYaw;
    const s = Math.sin(b);
    const c = Math.cos(b);
    const floorY = a.y - scene.eyeZ / U;
    // Columns: map x, map y, height, and where the map's origin lands.
    return new Float32Array([
      -s / U, 0, -c / U, 0,
      c / U, 0, -s / U, 0,
      0, 1 / U, 0, 0,
      a.x + (s * scene.x - c * scene.y) / U, floorY, a.z + (c * scene.x + s * scene.y) / U, 1,
    ]);
  }

  // ------------------------------------------------------------ resolution

  /** The headset resolution Settings asks for (Auto starts at the headset's normal). */
  private wantedScale() {
    const q = getVrQuality();
    return q === "auto" ? (AUTO_SCALES.includes(this.layerScale) ? this.layerScale : 1) : VR_QUALITY_SCALE[q];
  }

  private makeLayer(scale: number): XRWebGLLayer {
    const Layer = (window as unknown as { XRWebGLLayer: XRWebGLLayerClass }).XRWebGLLayer;
    const layer = new Layer(this.session, this.gl, { framebufferScaleFactor: scale, antialias: true });
    this.session.updateRenderState({ baseLayer: layer, depthNear: 0.05, depthFar: 300 });
    return layer;
  }

  /** Follow the setting; on Auto, step the resolution down if frames keep being missed. */
  private adjustResolution() {
    this.bestFrameMs = Math.min(this.bestFrameMs, Math.max(6, this.frameMs));
    let want = this.wantedScale();
    if (getVrQuality() === "auto") {
      this.slowFrames = this.frameMs > this.bestFrameMs * 1.3 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
      const level = AUTO_SCALES.indexOf(want);
      if (this.slowFrames > 150 && level >= 0 && level < AUTO_SCALES.length - 1) {
        want = AUTO_SCALES[level + 1];
        this.slowFrames = 0;
      }
    }
    if (want !== this.layerScale) {
      this.layerScale = want;
      this.layer = this.makeLayer(want);
    }
  }

  // ------------------------------------------------------------ the HUD in view

  /** The crosshair, the red flash when you're hit, and anything set to "In front", floating straight ahead. */
  private drawView(
    views: readonly XRView[],
    head: XRRigidTransform,
    locP: WebGLUniformLocation | null,
    locV: WebGLUniformLocation | null,
    locPos: number,
    locUv: number,
    t: number,
  ) {
    const gl = this.gl;
    const v = this.view;
    if (!v.tex) {
      v.canvas = document.createElement("canvas");
      v.canvas.width = VIEW_W;
      v.canvas.height = VIEW_H;
      v.tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, v.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      v.buf = gl.createBuffer()!;
    }
    if (t - v.drawnAt > 30) {
      const dt = v.drawnAt ? Math.min(0.1, (t - v.drawnAt) / 1000) : 0;
      v.drawnAt = t;
      this.renderer.drawVrView(v.canvas!.getContext("2d")!, VIEW_W, VIEW_H, dt, this.armsPresent(), !this.aimRay);
      gl.bindTexture(gl.TEXTURE_2D, v.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v.canvas!);
    }
    // A sheet straight in front of your face, turning with your head.
    const q = head.orientation;
    const p = head.position;
    const f = forwardOf(q);
    const r = rotateBy(q, [1, 0, 0]);
    const u = rotateBy(q, [0, 1, 0]);
    const hw = VIEW_DIST * Math.tan(VIEW_HALF_ANGLE);
    const hh = (hw * VIEW_H) / VIEW_W;
    const c: V3 = [p.x + f.x * VIEW_DIST, p.y + f.y * VIEW_DIST, p.z + f.z * VIEW_DIST];
    const pt = (sx: number, sy: number, tu: number, tv: number) => [
      c[0] + r[0] * sx + u[0] * sy,
      c[1] + r[1] * sx + u[1] * sy,
      c[2] + r[2] * sx + u[2] * sy,
      tu,
      tv,
    ];
    const verts = new Float32Array([...pt(-hw, hh, 0, 0), ...pt(-hw, -hh, 0, 1), ...pt(hw, hh, 1, 0), ...pt(hw, -hh, 1, 1)]);
    gl.bindBuffer(gl.ARRAY_BUFFER, v.buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
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
      gl.bindTexture(gl.TEXTURE_2D, v.tex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND);
  }

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

  // ------------------------------------------------------------ the reticle

  /**
   * Where your shooting hand is aiming: a ring out on whatever the aim hits
   * (a wall, the floor, a player's spot), always the same size to your eye,
   * and a short laser from the controller toward it.
   */
  private drawReticle(
    views: readonly XRView[],
    head: XRRigidTransform,
    yaw: number,
    pitch: number,
    locP: WebGLUniformLocation | null,
    locV: WebGLUniformLocation | null,
    locPos: number,
    locUv: number,
  ) {
    const gl = this.gl;
    const M = this.lastM!;
    const ray = this.aimRay!;
    const r = this.reticle;
    if (!r.tex) {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 128;
      const g = c.getContext("2d")!;
      for (const [width, color] of [
        [14, "rgba(0,0,0,0.6)"],
        [7, "#ffffff"],
      ] as const) {
        g.lineWidth = width;
        g.strokeStyle = color;
        g.beginPath();
        g.arc(64, 64, 40, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(64, 64, 7, 0, Math.PI * 2);
      g.fill();
      r.tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, r.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      r.buf = gl.createBuffer()!;
      r.laser = gl.createBuffer()!;
    }
    // The aim point in the world, then in your room.
    const w = this.renderer.vrAimPoint(yaw, pitch);
    const at: V3 = [
      M[0] * w.x + M[4] * w.y + M[8] * w.z + M[12],
      M[1] * w.x + M[5] * w.y + M[9] * w.z + M[13],
      M[2] * w.x + M[6] * w.y + M[10] * w.z + M[14],
    ];
    const hp = head.position;
    const toEye: V3 = [hp.x - at[0], hp.y - at[1], hp.z - at[2]];
    const dist = Math.hypot(...toEye) || 1;
    const n: V3 = [toEye[0] / dist, toEye[1] / dist, toEye[2] / dist];
    // Facing you: right = up x n, up = n x right.
    let right: V3 = [n[2], 0, -n[0]];
    const rl = Math.hypot(...right) || 1;
    right = [right[0] / rl, right[1] / rl, right[2] / rl];
    const up: V3 = [n[1] * right[2], n[2] * right[0] - n[0] * right[2], -n[1] * right[0]];
    const half = dist * 0.03;
    const pt = (sx: number, sy: number, u: number, v: number) => [
      at[0] + right[0] * sx + up[0] * sy,
      at[1] + right[1] * sx + up[1] * sy,
      at[2] + right[2] * sx + up[2] * sy,
      u,
      v,
    ];
    gl.bindBuffer(gl.ARRAY_BUFFER, r.buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([...pt(-half, half, 0, 0), ...pt(-half, -half, 0, 1), ...pt(half, half, 1, 0), ...pt(half, -half, 1, 1)]),
      gl.DYNAMIC_DRAW,
    );

    // The laser: a thin strip from the controller toward the aim point, fading out.
    const o = ray.position;
    const f = forwardOf(ray.orientation);
    const len = Math.min(1.2, Math.hypot(at[0] - o.x, at[1] - o.y, at[2] - o.z));
    const toHead: V3 = [hp.x - o.x, hp.y - o.y, hp.z - o.z];
    // Sideways across the beam, so it faces you.
    let sx = f.y * toHead[2] - f.z * toHead[1];
    let sy = f.z * toHead[0] - f.x * toHead[2];
    let sz = f.x * toHead[1] - f.y * toHead[0];
    const sl = Math.hypot(sx, sy, sz) || 1;
    const bw = 0.0025;
    sx = (sx / sl) * bw;
    sy = (sy / sl) * bw;
    sz = (sz / sl) * bw;
    const end: V3 = [o.x + f.x * len, o.y + f.y * len, o.z + f.z * len];
    // A white strip (the middle of the reticle texture is solid white).
    const beam = new Float32Array([
      o.x - sx, o.y - sy, o.z - sz, 0.5, 0.5,
      o.x + sx, o.y + sy, o.z + sz, 0.5, 0.5,
      end[0] - sx, end[1] - sy, end[2] - sz, 0.5, 0.5,
      end[0] + sx, end[1] + sy, end[2] + sz, 0.5, 0.5,
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.laser);
    gl.bufferData(gl.ARRAY_BUFFER, beam, gl.DYNAMIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    for (const view of views) {
      const vp = this.layer.getViewport(view);
      if (!vp) continue;
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      gl.uniformMatrix4fv(locP, false, view.projectionMatrix);
      gl.uniformMatrix4fv(locV, false, view.transform.inverse.matrix);
      gl.enableVertexAttribArray(locPos);
      gl.enableVertexAttribArray(locUv);
      gl.bindTexture(gl.TEXTURE_2D, r.tex);
      for (const buf of [r.laser, r.buf]) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(locUv, 2, gl.FLOAT, false, 20, 12);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    gl.disable(gl.BLEND);
  }

  /** Which hands have a controller this frame. */
  private armsPresent(): VrArms {
    return { left: !!this.arms.left.grip, right: !!this.arms.right.grip };
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
    // The menu: the ☰ button on the left controller (where the headset passes it on), or both sticks clicked together.
    let menuPress = false;
    let sticksBoth = true;
    let select = false;
    let back = false;
    for (const src of this.session.inputSources) {
      const pad = src.gamepad;
      if (!pad || src.handedness === "none") continue;
      const hand = src.handedness;
      const was = (i: number) => this.prevButtons.get(`${hand}${i}`) ?? false;
      const now = (i: number) => {
        const b = pad.buttons[i];
        return !!b && (b.pressed || b.value > 0.5);
      };
      sticksBoth &&= now(3);
      if (hand === "left") {
        for (let i = 6; i < pad.buttons.length; i++) if (pad.buttons[i]?.pressed && !was(i)) menuPress = true;
      } else {
        select = now(0) && !was(0);
        back = now(5) && !was(5);
      }
    }
    const bothNow = sticksBoth && [...this.session.inputSources].filter((s) => s.gamepad && s.handedness !== "none").length === 2;
    if (bothNow && !this.sticksWere) menuPress = true;
    this.sticksWere = bothNow;
    if (menuPress) this.setMenu(!this.menu.open);
    if (this.menu.open) {
      // While the menu is up the controllers work it, not the game: point and pull the trigger, B to close.
      if (select) this.menuSelect();
      if (back) this.setMenu(false);
      for (const src of this.session.inputSources) {
        const pad = src.gamepad;
        if (!pad || src.handedness === "none") continue;
        pad.buttons.forEach((b, i) => seen.set(`${src.handedness}${i}`, b.pressed || b.value > 0.5));
      }
      this.prevButtons = seen;
      return c;
    }
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
        if (this.arcade) {
          // At the arcade machine the right stick aims (top-down), instead of turning.
          c.aimX = sx;
          c.aimY = sy;
        } else if (this.turnArmed && Math.abs(sx) > 0.7) {
          this.turnArmed = false;
          this.baseYaw += Math.sign(sx) * SNAP_TURN;
        } else if (Math.abs(sx) < 0.3) {
          this.turnArmed = true;
        }
        if (!this.arcade && this.abilityArmed && Math.abs(sy) > 0.7) {
          this.abilityArmed = false;
          c.pressed.push(sy < 0 ? "ability1" : "ability2");
        } else if (Math.abs(sy) < 0.3) {
          this.abilityArmed = true;
        }
      }
      // Remember every button (the menu ones too) for next frame.
      pad.buttons.forEach((b, i) => {
        if (!seen.has(`${hand}${i}`)) seen.set(`${hand}${i}`, b.pressed || b.value > 0.5);
      });
    }
    this.prevButtons = seen;
    return c;
  }

  // ------------------------------------------------------------ the arcade machine (2D matches)

  /**
   * 2D matches in VR: you stand in a dark arcade in front of a School Wars
   * cabinet, and the match plays on its screen. Built once, in front of where
   * you were facing when you put the headset on.
   */
  private drawArcadeFrame(views: readonly XRView[], head: XRRigidTransform, t: number) {
    const gl = this.gl;
    if (!this.cabinet) this.cabinet = this.buildCabinet(head);
    const cab = this.cabinet;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.layer.framebuffer);
    gl.clearColor(0.04, 0.02, 0.08, 1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    // The game, onto the screen.
    gl.bindTexture(gl.TEXTURE_2D, cab.screenTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.arcade!);

    // The cabinet's body, buttons and stick.
    const solid = this.solidProg;
    gl.useProgram(solid);
    const sP = gl.getUniformLocation(solid, "P");
    const sV = gl.getUniformLocation(solid, "V");
    const sPos = gl.getAttribLocation(solid, "p");
    const sCol = gl.getAttribLocation(solid, "c");
    for (const view of views) {
      const vp = this.layer.getViewport(view);
      if (!vp) continue;
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      gl.uniformMatrix4fv(sP, false, view.projectionMatrix);
      gl.uniformMatrix4fv(sV, false, view.transform.inverse.matrix);
      gl.bindBuffer(gl.ARRAY_BUFFER, cab.solid);
      gl.enableVertexAttribArray(sPos);
      gl.enableVertexAttribArray(sCol);
      gl.vertexAttribPointer(sPos, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(sCol, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, cab.count);
    }
    // The floor, the marquee and the screen.
    gl.useProgram(this.prog);
    const locP = gl.getUniformLocation(this.prog, "P");
    const locV = gl.getUniformLocation(this.prog, "V");
    const locPos = gl.getAttribLocation(this.prog, "p");
    const locUv = gl.getAttribLocation(this.prog, "uv");
    for (const view of views) {
      const vp = this.layer.getViewport(view);
      if (!vp) continue;
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      gl.uniformMatrix4fv(locP, false, view.projectionMatrix);
      gl.uniformMatrix4fv(locV, false, view.transform.inverse.matrix);
      for (const [buf, tex] of [
        [cab.floor, cab.floorTex],
        [cab.marquee, cab.marqueeTex],
        [cab.screen, cab.screenTex],
      ] as const) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(locPos);
        gl.enableVertexAttribArray(locUv);
        gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(locUv, 2, gl.FLOAT, false, 20, 12);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    gl.disable(gl.DEPTH_TEST);
    // Your hands, and the menu if it's open.
    this.drawArms(views, t);
    gl.useProgram(this.prog);
    if (this.menu.open) this.drawMenu(views, head, locP, locV, locPos, locUv, t);
  }

  private buildCabinet(head: XRRigidTransform) {
    const gl = this.gl;
    const f = forwardOf(head.orientation);
    const fl = Math.hypot(f.x, f.z) || 1;
    const fwd: V3 = [f.x / fl, 0, f.z / fl];
    const right: V3 = [-fwd[2], 0, fwd[0]];
    const up: V3 = [0, 1, 0];
    const floorY = head.position.y - 1.55;
    const base: V3 = [head.position.x, floorY, head.position.z];
    // A spot in the arcade: across (right), up from the floor, and ahead of where you stood.
    const at = (x: number, y: number, z: number): V3 => [
      base[0] + right[0] * x + fwd[0] * z,
      base[1] + y,
      base[2] + right[2] * x + fwd[2] * z,
    ];
    const mesh: number[] = [];
    // A box from (x0, y0, z0) to (x1, y1, z1) in arcade coordinates.
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string) =>
      addBox(mesh, at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), right, up, fwd, [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], rgb(color));
    const near = 0.75; // the front of the cabinet, ahead of you
    box(-0.43, 0, near, 0.43, 0.95, near + 0.6, "#4c1d95"); // the lower body
    box(-0.43, 0.95, near + 0.3, 0.43, 1.95, near + 0.6, "#4c1d95"); // the upper body, behind the screen
    box(-0.44, 0.95, near - 0.05, 0.44, 1.02, near + 0.3, "#18181b"); // the control panel
    for (const s of [-1, 1]) box(s * 0.43 - 0.012, 0, near - 0.05, s * 0.43 + 0.012, 2.15, near + 0.62, "#d946ef"); // glowing side trim
    box(-0.16, 1.02, near + 0.08, -0.14, 1.1, near + 0.1, "#27272a"); // the joystick
    box(-0.175, 1.1, near + 0.065, -0.125, 1.15, near + 0.115, "#ef4444"); // its ball top
    ["#facc15", "#22d3ee", "#22c55e", "#f97316"].forEach((c, i) => box(0.04 + i * 0.075, 1.02, near + 0.08, 0.09 + i * 0.075, 1.04, near + 0.13, c)); // buttons
    box(-0.43, 1.95, near + 0.25, 0.43, 2.15, near + 0.6, "#4c1d95"); // the marquee housing
    // Other cabinets glowing in the dark around the room.
    for (const [x, z, c] of [
      [-1.6, 1.4, "#0e7490"],
      [1.6, 1.4, "#9d174d"],
      [-2.4, 0.2, "#166534"],
      [2.4, 0.2, "#854d0e"],
    ] as const) {
      box(x - 0.34, 0, z, x + 0.34, 1.95, z + 0.6, "#27272a");
      box(x - 0.3, 1.2, z - 0.01, x + 0.3, 1.6, z, c);
    }
    const solid = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, solid);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh), gl.STATIC_DRAW);

    const quad = (tl: V3, tr: V3, bl: V3, br: V3, uScale = 1, vScale = 1) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([...tl, 0, 0, ...bl, 0, vScale, ...tr, uScale, 0, ...br, uScale, vScale]), gl.STATIC_DRAW);
      return b;
    };
    const texture = (source: HTMLCanvasElement | null, repeat = false) => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return tex;
    };
    // The screen, set into the front of the upper body, shaped like the game's canvas.
    const aspect = this.arcade ? this.arcade.height / Math.max(1, this.arcade.width) : 9 / 16;
    const sw = 0.76;
    const sh = Math.min(0.75, sw * aspect);
    const sy = 1.2;
    const sz = near + 0.299;
    const screen = quad(at(-sw / 2, sy + sh, sz), at(sw / 2, sy + sh, sz), at(-sw / 2, sy, sz), at(sw / 2, sy, sz));
    // The marquee: the game's name in lights.
    const m = document.createElement("canvas");
    m.width = 512;
    m.height = 128;
    const g = m.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0, "#facc15");
    grad.addColorStop(1, "#f97316");
    g.fillStyle = "#0b0b12";
    g.fillRect(0, 0, 512, 128);
    g.font = "900 italic 62px ui-sans-serif, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = "#f472b6";
    g.shadowBlur = 18;
    g.fillStyle = grad;
    g.fillText("SCHOOL WARS", 256, 68);
    const marquee = quad(at(-0.43, 2.15, near + 0.249), at(0.43, 2.15, near + 0.249), at(-0.43, 1.95, near + 0.249), at(0.43, 1.95, near + 0.249));
    // A dark floor with a glowing grid, like the Game Room's.
    const fc = document.createElement("canvas");
    fc.width = 64;
    fc.height = 64;
    const fg = fc.getContext("2d")!;
    fg.fillStyle = "#120a24";
    fg.fillRect(0, 0, 64, 64);
    fg.fillStyle = "#d946ef";
    fg.fillRect(0, 0, 64, 2);
    fg.fillStyle = "#22d3ee";
    fg.fillRect(0, 0, 2, 64);
    const floor = quad(at(-6, 0, 8), at(6, 0, 8), at(-6, 0, -4), at(6, 0, -4), 24, 24);
    return {
      solid,
      count: mesh.length / 6,
      screen,
      screenTex: texture(null),
      marquee,
      marqueeTex: texture(m),
      floor,
      floorTex: texture(fc, true),
    };
  }

  // ------------------------------------------------------------ the VR menu

  private setMenu(open: boolean) {
    this.menu.open = open;
    this.menu.placed = false;
    this.menu.hover = -1;
  }

  /** The menu's rows: what each says, and what pulling the trigger on it does. */
  private menuRows(): { label: string; value?: string; act: () => void }[] {
    const quality = getVrQuality();
    const hud = getVrHud();
    const spotName = (s: string) => VR_SPOTS.find(([id]) => id === s)?.[1] ?? s;
    return [
      { label: "▶ Resume", act: () => this.setMenu(false) },
      {
        label: "VR resolution",
        value: VR_QUALITIES.find(([q]) => q === quality)?.[1] ?? "Auto",
        act: () => {
          const i = VR_QUALITIES.findIndex(([q]) => q === quality);
          saveVrQuality(VR_QUALITIES[(i + 1) % VR_QUALITIES.length][0]);
        },
      },
      ...VR_HUD_ITEMS.map(({ id, label }) => ({
        label: label.split(" (")[0],
        value: spotName(hud[id]),
        act: () => {
          const i = VR_SPOTS.findIndex(([s]) => s === hud[id]);
          setVrSpot(id, VR_SPOTS[(i + 1) % VR_SPOTS.length][0]);
        },
      })),
      { label: "Reset VR layout", act: () => resetVrHud() },
      { label: "🚪 Leave VR", act: () => this.end() },
    ];
  }

  private menuSelect() {
    const rows = this.menuRows();
    rows[this.menu.hover]?.act();
  }

  /** The menu panel, hung in front of where you were looking when you opened it; the laser picks a row. */
  private drawMenu(
    views: readonly XRView[],
    head: XRRigidTransform,
    locP: WebGLUniformLocation | null,
    locV: WebGLUniformLocation | null,
    locPos: number,
    locUv: number,
    t: number,
  ) {
    const gl = this.gl;
    const m = this.menu;
    const rows = this.menuRows();
    const H = MENU_TOP + rows.length * MENU_ROW + 30;
    if (!m.tex) {
      m.canvas = document.createElement("canvas");
      m.tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, m.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      m.buf = gl.createBuffer()!;
    }
    const halfW = MENU_SIZE / 2;
    const halfH = (MENU_SIZE * H) / MENU_W / 2;
    if (!m.placed) {
      // Level, straight ahead of your face, turned to face you.
      const f = forwardOf(head.orientation);
      const l = Math.hypot(f.x, f.z) || 1;
      const fx = f.x / l;
      const fz = f.z / l;
      const p = head.position;
      m.center = [p.x + fx * MENU_DIST, p.y - 0.05, p.z + fz * MENU_DIST];
      m.right = [-fz, 0, fx];
      m.placed = true;
    }
    const C = m.center;
    const R = m.right;
    const U: V3 = [0, 1, 0];
    const N: V3 = [-R[2], 0, R[0]]; // toward you (right x up)
    // Which row the laser points at.
    m.hover = -1;
    let dot: [number, number] | null = null;
    const ray = this.aimRay;
    if (ray) {
      const o = ray.position;
      const d = forwardOf(ray.orientation);
      const den = d.x * N[0] + d.y * N[1] + d.z * N[2];
      if (den < -1e-4) {
        const tHit = ((C[0] - o.x) * N[0] + (C[1] - o.y) * N[1] + (C[2] - o.z) * N[2]) / den;
        if (tHit > 0) {
          const px = o.x + d.x * tHit - C[0];
          const py = o.y + d.y * tHit - C[1];
          const pz = o.z + d.z * tHit - C[2];
          const sx = (px * R[0] + pz * R[2]) / halfW;
          const sy = py / halfH;
          if (Math.abs(sx) <= 1 && Math.abs(sy) <= 1) {
            dot = [((sx + 1) / 2) * MENU_W, ((1 - sy) / 2) * H];
            const row = Math.floor((dot[1] - MENU_TOP) / MENU_ROW);
            if (row >= 0 && row < rows.length) m.hover = row;
          }
        }
      }
    }
    // The panel's picture.
    const c = m.canvas!;
    if (c.width !== MENU_W || c.height !== H) {
      c.width = MENU_W;
      c.height = H;
    }
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, MENU_W, H);
    g.fillStyle = "rgba(9,9,11,0.94)";
    g.strokeStyle = "rgba(251,191,36,0.9)";
    g.lineWidth = 6;
    g.beginPath();
    g.roundRect(3, 3, MENU_W - 6, H - 6, 30);
    g.fill();
    g.stroke();
    g.fillStyle = "#fff";
    g.font = "bold 46px ui-sans-serif, system-ui, sans-serif";
    g.textBaseline = "middle";
    g.fillText("Settings", 40, 52);
    g.font = "22px ui-sans-serif, system-ui, sans-serif";
    g.fillStyle = "#a1a1aa";
    g.fillText("Point and pull the trigger · B or ☰ to close", 40, 96);
    rows.forEach((row, i) => {
      const y = MENU_TOP + i * MENU_ROW;
      if (i === m.hover) {
        g.fillStyle = "rgba(251,191,36,0.9)";
        g.beginPath();
        g.roundRect(24, y + 4, MENU_W - 48, MENU_ROW - 8, 14);
        g.fill();
      }
      g.fillStyle = i === m.hover ? "#000" : "#e4e4e7";
      g.font = "bold 30px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "left";
      g.fillText(row.label, 44, y + MENU_ROW / 2);
      if (row.value) {
        g.textAlign = "right";
        g.fillStyle = i === m.hover ? "#000" : "#fbbf24";
        g.fillText(`◀ ${row.value} ▶`, MENU_W - 44, y + MENU_ROW / 2);
      }
      g.textAlign = "left";
    });
    if (dot) {
      g.fillStyle = "#fff";
      g.strokeStyle = "#000";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(dot[0], dot[1], 9, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    gl.bindTexture(gl.TEXTURE_2D, m.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    void t;

    const pt = (sx: number, sy: number, u: number, v: number) => [
      C[0] + R[0] * sx + U[0] * sy,
      C[1] + R[1] * sx + U[1] * sy,
      C[2] + R[2] * sx + U[2] * sy,
      u,
      v,
    ];
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([...pt(-halfW, halfH, 0, 0), ...pt(-halfW, -halfH, 0, 1), ...pt(halfW, halfH, 1, 0), ...pt(halfW, -halfH, 1, 1)]),
      gl.DYNAMIC_DRAW,
    );
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
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
      gl.bindTexture(gl.TEXTURE_2D, m.tex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND);
  }

  // ------------------------------------------------------------ WebGL setup

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
