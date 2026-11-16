/** Wrathwater's 3D view, drawn with Three.js. Reads the simulation each frame; never changes it. */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { Effects, ParticleLayer, puff, type PuffKind } from "./fx";
import { WEAPONS, type WeaponId } from "./items";
import { buildInterior, disposeInterior } from "./interior";
import { buildIsland, disposeIsland } from "./land";
import { WorldPanel } from "./panel";
import {
  buildBackpack,
  buildBuriedMark,
  buildChest,
  buildCrate,
  buildFruit,
  buildPerson,
  buildShip,
  buildSupplyCrate,
  helmLayout,
  WHEEL_LOCK,
  disposePerson,
  disposeShip,
  posePerson,
  setCannons,
  weaponMeshes,
  WEAPON_TIP,
  type PersonVisual,
  type ShipVisual,
} from "./models";
import { forward, sideNormal, type Sim, type SimEvent, type Side } from "./sim";
import { HAVEN, ISLANDS, WAVES, groundHeight, islandAt, waveHeight } from "./world";

/**
 * Islands are built when you come within this distance of their shore and
 * thrown away again past ISLAND_UNLOAD. The sea haze ends at about 2700, and
 * islands are spaced further apart than that, so you only ever have the
 * island you're at (or sailing toward) loaded.
 */
const ISLAND_LOAD = 3200;
const ISLAND_UNLOAD = 4000;
/**
 * A real swing in VR: over the last SWING_WINDOW seconds your weapon's tip
 * must have travelled a full arc, moving fast at the end. Fists need a full
 * punch rather than a full swing.
 */
const SWING_WINDOW = 0.35;
export const VR_SWING = {
  blade: { speed: 4, arc: 0.95, chord: 0.65 },
  fist: { speed: 3, arc: 0.45, chord: 0.38 },
  /** Your hand has to slow down to this (m/s) before the next swing can count. */
  rearm: 1.2,
};

const OCEAN_SIZE = 4400;
const OCEAN_SEGMENTS = 300;
/** Length of a full day at sea, in seconds. */
const DAY_LENGTH = 720;

export interface CameraView {
  /** Map angle the camera looks along. */
  yaw: number;
  pitch: number;
  distance: number;
  /** Side the guns would fire to, if you're looking sideways (at sea). */
  aimSide: Side | null;
  /** On foot and aiming a gun or power. */
  aiming: boolean;
  /** Seen through your own eyes (on foot) or from the helm (at sea). */
  firstPerson: boolean;
  /** In VR: the map angle your play space faces (head turning is added on top). */
  vrYaw: number;
  /** Your ship's wheel angle, the three sail levers' angles, and the cannon buttons (how far pushed in, and loaded or not). */
  helm: { wheel: number; levers: number[]; buttons: { pushed: number; ready: boolean }[] };
}

/** In VR, one real meter is this many world units (a person is about 18 units tall). */
export const VR_SCALE = 10;

/** One VR hand controller: where it is, what it's pointing at, and its buttons. */
export interface VrHandState {
  gamepad: Gamepad | null;
  /** Map angle the controller points along. */
  yaw: number;
}

/** Where your eyes are when you stand at the helm: behind the wheel on the stern castle roof. */
function helmLocal(s: { cls: { length: number; beam: number } }, eye: number) {
  return helmLayout(s.cls).stand.clone().add(new THREE.Vector3(0, eye, 0));
}

// ---------------------------------------------------------------- shaders

const oceanVertex = /* glsl */ `
uniform float uTime;
uniform vec4 uWaves[6];
uniform float uSpeeds[6];
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float h = 0.0;
  vec2 grad = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    vec2 dir = normalize(uWaves[i].xy);
    float k = 6.2831853 / uWaves[i].w;
    float ph = k * dot(dir, world.xz) + uTime * uSpeeds[i];
    h += uWaves[i].z * sin(ph);
    grad += uWaves[i].z * k * cos(ph) * dir;
  }
  world.y += h;
  vHeight = h;
  vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const oceanFragment = /* glsl */ `
#define ISLAND_COUNT ${ISLANDS.length}
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uLagoon;
uniform vec3 uSky;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uIslands[ISLAND_COUNT];
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
#include <fog_pars_fragment>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  // Small ripples on top of the big waves.
  vec2 rp = vWorld.xz * 0.05 + vec2(uTime * 0.3, uTime * 0.2);
  vec3 N = normalize(vNormal + vec3(noise(rp) - 0.5, 0.0, noise(rp + 7.3) - 0.5) * 0.18);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);

  // Distance to the nearest shore, for lagoon colour and surf.
  float shore = 1e5;
  for (int i = 0; i < ISLAND_COUNT; i++) {
    shore = min(shore, length(vWorld.xz - uIslands[i].xy) - uIslands[i].z);
  }
  vec3 col = mix(uDeep, uShallow, clamp(vHeight * 0.12 + 0.45, 0.0, 1.0));
  col = mix(col, uLagoon, smoothstep(140.0, 0.0, shore) * 0.75);
  col = mix(col, uSky, fresnel * 0.7);
  vec3 H = normalize(uLightDir + V);
  col += uLightColor * pow(max(dot(N, H), 0.0), 220.0) * 2.4;
  // Foam: on high crests, and in bands of surf along the shore.
  float crest = smoothstep(4.6, 6.2, vHeight) * 0.35;
  float surf = smoothstep(46.0, 0.0, shore) * (0.55 + 0.45 * sin(shore * 0.25 - uTime * 2.2));
  surf *= smoothstep(0.35, 0.75, noise(vWorld.xz * 0.08 + uTime * 0.15));
  col = mix(col, vec3(0.85, 0.9, 0.92), clamp(crest + surf, 0.0, 0.9));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const skyFragment = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uLightColor;
uniform float uNight;
uniform float uTime;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.5));
  // Sun and moon.
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uLightColor * (smoothstep(0.9985, 0.9992, s) * 6.0 + pow(s, 180.0) * 0.8 + pow(s, 8.0) * 0.12) * (1.0 - uNight);
  float m = max(dot(d, normalize(uMoonDir)), 0.0);
  col += vec3(1.6, 1.7, 1.9) * smoothstep(0.9993, 0.9996, m) * uNight;
  col += vec3(0.2, 0.25, 0.35) * pow(m, 40.0) * uNight;
  // Stars.
  vec2 sp = d.xz / (d.y + 0.25) * 140.0;
  float star = step(0.9965, hash(floor(sp))) * (0.6 + 0.4 * sin(uTime * 3.0 + hash(floor(sp) + 3.1) * 40.0));
  col += vec3(star) * uNight * smoothstep(0.05, 0.3, d.y) * 1.4;
  // Drifting clouds.
  if (d.y > 0.0) {
    vec2 cp = d.xz / (d.y + 0.15) * 1.6 + vec2(uTime * 0.008, uTime * 0.004);
    float c = smoothstep(0.48, 0.85, fbm(cp));
    vec3 cloudCol = mix(uHorizon * 1.15, uLightColor * 0.9 + 0.1, 0.35) * (1.0 - uNight * 0.7);
    col = mix(col, cloudCol, c * smoothstep(0.0, 0.18, d.y) * 0.85);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- day and night

interface SkyKey {
  horizon: string;
  zenith: string;
  fog: string;
  light: string;
  lightI: number;
  hemiSky: string;
  hemiI: number;
  deep: string;
  shallow: string;
  lagoon: string;
  exposure: number;
}

// Midnight, dawn, noon, dusk.
const SKY_KEYS: SkyKey[] = [
  { horizon: "#1b2739", zenith: "#03060d", fog: "#1a2535", light: "#9fb4ff", lightI: 0.8, hemiSky: "#6d84a8", hemiI: 0.7, deep: "#04121c", shallow: "#123c4a", lagoon: "#17525a", exposure: 1.25 },
  { horizon: "#e2a27c", zenith: "#3a5684", fog: "#a8908a", light: "#ffc08a", lightI: 1.8, hemiSky: "#ffd6b8", hemiI: 1.0, deep: "#0f3346", shallow: "#2c6a78", lagoon: "#3f9a9a", exposure: 1.05 },
  { horizon: "#acd0e6", zenith: "#3d7fbf", fog: "#a3c3d8", light: "#fff3dc", lightI: 2.8, hemiSky: "#d4e8ff", hemiI: 1.3, deep: "#0c4864", shallow: "#2a8aa4", lagoon: "#3fc1c0", exposure: 0.95 },
  { horizon: "#e58a5c", zenith: "#2b2c56", fog: "#94695f", light: "#ff9454", lightI: 1.9, hemiSky: "#ffb48e", hemiI: 1.0, deep: "#12324a", shallow: "#2f5f70", lagoon: "#3d8b8b", exposure: 1.05 },
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function blendKey(phase: number) {
  const f = (((phase % 1) + 1) % 1) * 4;
  const i = Math.floor(f);
  const a = SKY_KEYS[i % 4];
  const b = SKY_KEYS[(i + 1) % 4];
  const t = f - i;
  const k = t * t * (3 - 2 * t);
  const c = (x: string, y: string) => new THREE.Color().copy(tmpA.set(x)).lerp(tmpB.set(y), k);
  const n = (x: number, y: number) => x + (y - x) * k;
  return {
    horizon: c(a.horizon, b.horizon),
    zenith: c(a.zenith, b.zenith),
    fog: c(a.fog, b.fog),
    light: c(a.light, b.light),
    lightI: n(a.lightI, b.lightI),
    hemiSky: c(a.hemiSky, b.hemiSky),
    hemiI: n(a.hemiI, b.hemiI),
    deep: c(a.deep, b.deep),
    shallow: c(a.shallow, b.shallow),
    lagoon: c(a.lagoon, b.lagoon),
    exposure: n(a.exposure, b.exposure),
  };
}

// ---------------------------------------------------------------- renderer

export class SeaRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 1, 3400);
  /** Holds the camera (and, in VR, your hands): moved to where you stand. */
  private rig = new THREE.Group();
  private vrHands: { left: THREE.Group | null; right: THREE.Group | null } = { left: null, right: null };
  private vrGrips: { left: THREE.Group | null; right: THREE.Group | null } = { left: null, right: null };
  private vrSources: { left: XRInputSource | null; right: XRInputSource | null } = { left: null, right: null };
  private vrHud: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; mesh: THREE.Mesh } | null = null;
  private firstPersonSails = false;
  private ocean: THREE.Mesh;
  private oceanUniforms: Record<string, THREE.IUniform>;
  private sky: THREE.Mesh;
  private skyUniforms: Record<string, THREE.IUniform>;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private fog: THREE.Fog;
  private ships = new Map<number, ShipVisual>();
  private people = new Map<number, PersonVisual>();
  private balls: THREE.InstancedMesh;
  private fireballs: THREE.InstancedMesh;
  private bullets: THREE.InstancedMesh;
  private crates = new Map<number, THREE.Group>();
  private spots = new Map<string, THREE.Object3D>();
  /** The islands currently built, by index. */
  private islands = new Map<number, THREE.Group>();
  /** Your weapon in first person: held at the bottom right of your view (holder, tilted, turned, model). */
  private fpHolder = new THREE.Group();
  private fpTilt = new THREE.Group();
  private fpSpin = new THREE.Group();
  private fpId: WeaponId | null = null;
  private fpPos = new THREE.Vector3(3.8, -3.8, -7.5);
  private fpModels = new Map<WeaponId, THREE.Group>();
  /** Your weapon in VR, in your right hand. */
  private vrWeapon = new THREE.Group();
  private vrTilt = new THREE.Group();
  private vrSpin = new THREE.Group();
  private vrWeaponId: WeaponId | null = null;
  private vrModels = new Map<WeaponId, THREE.Group>();
  /** Where your weapon's tip has been lately (meters, relative to you), to tell a real swing from a flick. */
  private vrTipHist: { t: number; p: THREE.Vector3 }[] = [];
  /**
   * In VR on foot: where your weapon's tip is, how fast it's moving (meters a
   * second, relative to you), how far it has travelled over the last third of
   * a second (`arc`) and how far that is in a straight line (`chord`).
   */
  vrTip: { pos: THREE.Vector3; speed: number; arc: number; chord: number } | null = null;
  /** The store you're standing in (VR), and the price board on its back wall. */
  private interior: { key: string; group: THREE.Group; panel: WorldPanel } | null = null;
  /** Your backpack, pulled off your back into one hand, with its list above it. */
  private backpack = new THREE.Group();
  readonly packPanel = new WorldPanel(0.46, 0.62, 12);
  private packHand: "left" | "right" | null = null;
  /** The map strapped to your left forearm in VR. */
  readonly vrMap = { canvas: document.createElement("canvas"), tex: null as THREE.CanvasTexture | null };
  private raycaster = new THREE.Raycaster();
  private smoke = new ParticleLayer(false);
  private glow = new ParticleLayer(true);
  private effects = new Effects();
  private aimMarker: THREE.Mesh;
  private shake = 0;
  private matrix = new THREE.Matrix4();
  private camPos = new THREE.Vector3();
  private camTarget = new THREE.Vector3();
  private camReady = false;
  private wakeTimer = 0;
  private dustTimer = 0;
  private time = 0;
  /** 0 by day, 1 at night. */
  night = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.fog = new THREE.Fog("#1a2535", 650, 2700);
    this.scene.fog = this.fog;
    this.scene.background = this.fog.color;

    this.skyUniforms = {
      uHorizon: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uLightColor: { value: new THREE.Color() },
      uNight: { value: 0 },
      uTime: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(3100, 40, 20),
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight("#9fb3c8", "#0b1218", 1.2);
    this.sun = new THREE.DirectionalLight("#ffffff", 2);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.oceanUniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uWaves: { value: WAVES.map(([dx, dz, a, l]) => new THREE.Vector4(dx, dz, a, l)) },
        uSpeeds: { value: WAVES.map((w) => w[4]) },
        uDeep: { value: new THREE.Color() },
        uShallow: { value: new THREE.Color() },
        uLagoon: { value: new THREE.Color() },
        uSky: { value: new THREE.Color() },
        uLightDir: { value: new THREE.Vector3(0, 1, 0) },
        uLightColor: { value: new THREE.Color() },
        uIslands: { value: ISLANDS.map((i) => new THREE.Vector3(i.x, i.z, i.radius)) },
      },
    ]);
    const oceanGeo = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEGMENTS, OCEAN_SEGMENTS);
    oceanGeo.rotateX(-Math.PI / 2);
    this.ocean = new THREE.Mesh(
      oceanGeo,
      new THREE.ShaderMaterial({ vertexShader: oceanVertex, fragmentShader: oceanFragment, uniforms: this.oceanUniforms, fog: true }),
    );
    this.ocean.frustumCulled = false;
    this.scene.add(this.ocean);

    // Blackwater Cove's warm dock light stays in the scene (adding and removing lights rebuilds every shader).
    const havenLight = new THREE.PointLight("#ffa040", 3, 900, 1.2);
    havenLight.position.set(HAVEN.x + HAVEN.radius, 60, HAVEN.z);
    this.scene.add(havenLight);

    // Your weapon in first person, and in VR.
    this.fpSpin.rotation.y = -Math.PI / 2;
    this.fpTilt.add(this.fpSpin);
    this.fpHolder.add(this.fpTilt);
    this.fpHolder.visible = false;
    this.camera.add(this.fpHolder);
    this.vrSpin.rotation.y = -Math.PI / 2;
    this.vrTilt.add(this.vrSpin);
    this.vrWeapon.add(this.vrTilt);
    this.vrWeapon.scale.setScalar(1 / VR_SCALE);
    this.vrWeapon.visible = false;
    this.backpack.add(buildBackpack());
    this.packPanel.mesh.position.set(0, 0.36, 0);
    this.backpack.add(this.packPanel.mesh);
    this.backpack.visible = false;
    this.vrMap.canvas.width = 512;
    this.vrMap.canvas.height = 512;

    const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    this.balls = instanced(new THREE.SphereGeometry(2.2, 10, 8), new THREE.MeshStandardMaterial({ color: "#151515", metalness: 0.6, roughness: 0.35 }), 800);
    this.fireballs = instanced(new THREE.SphereGeometry(5, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.4) }), 50);
    this.bullets = instanced(new THREE.SphereGeometry(0.8, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.6) }), 200);

    this.scene.add(this.smoke.points, this.glow.points, this.effects.group);

    this.aimMarker = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.aimMarker.visible = false;
    this.scene.add(this.aimMarker);

    // VR: the camera and hands ride on a rig that's moved to where you stand.
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.setupVr();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const scale = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.smoke.material.uniforms.uScale.value = scale;
    this.glow.material.uniforms.uScale.value = scale;
  }

  dispose() {
    this.composer.dispose();
    this.renderer.dispose();
    this.smoke.dispose();
    this.glow.dispose();
    this.renderer.domElement.remove();
  }

  render(sim: Sim, view: CameraView, dt: number) {
    this.time = sim.time;
    this.oceanUniforms.uTime.value = sim.time;
    this.skyUniforms.uTime.value = sim.time;
    this.updateSky(sim);
    this.syncShips(sim, dt, view);
    this.syncPeople(sim, view, dt);
    this.syncProjectiles(sim, dt);
    this.syncCrates(sim);
    this.streamIslands(sim);
    this.syncInterior(sim);
    this.syncSpots(sim);
    this.emitAmbient(sim, dt);
    this.smoke.update(dt);
    this.glow.update(dt);
    this.effects.update(dt);
    this.updateFirstPersonSails(sim, view);
    this.poseViewWeapon(sim, view, dt);
    if (this.renderer.xr.isPresenting) {
      this.placeVrRig(sim, view);
      this.poseVrWeapon(sim, dt);
      this.placeAimMarker(sim, view);
      // No bloom in VR: the headset draws each eye directly.
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.placeCamera(sim, view, dt);
    this.placeAimMarker(sim, view);
    this.composer.render(dt);
  }

  /** Run the game loop through the renderer, so it keeps going inside a VR headset. */
  setLoop(fn: ((time: number) => void) | null) {
    this.renderer.setAnimationLoop(fn);
  }

  get inVr() {
    return this.renderer.xr.isPresenting;
  }

  async startVr(session: XRSession) {
    this.renderer.xr.setReferenceSpaceType("local-floor");
    await this.renderer.xr.setSession(session);
    this.camera.near = 0.1;
    this.camera.updateProjectionMatrix();
  }

  endVr() {
    this.renderer.xr.getSession()?.end().catch(() => {});
  }

  /** Called when the headset session ends. */
  vrEnded() {
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.rig.scale.setScalar(1);
    this.camera.near = 1;
    this.camera.position.set(0, 0, 0);
    this.camReady = false;
    this.resize();
  }

  /** Map angle your head is facing in VR. */
  vrHeadYaw(): number | null {
    if (!this.renderer.xr.isPresenting) return null;
    // Use the scene camera (inside the rig), not the raw XR camera: the XR
    // camera has no parent, so asking it for a world direction drops the rig's
    // turn (snap turns, facing a counter) and walking would go the wrong way.
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    return Math.atan2(d.z, d.x);
  }

  /** A VR hand's position in your ship's own coordinates (for the wheel and levers). */
  vrHandOnShip(hand: "left" | "right", sim: Sim): THREE.Vector3 | null {
    const grip = this.vrGrips[hand];
    const v = this.ships.get(sim.player.id);
    if (!grip || !v || !this.renderer.xr.isPresenting) return null;
    return v.group.worldToLocal(grip.getWorldPosition(new THREE.Vector3()));
  }

  /** A short buzz in a VR hand. */
  vrBuzz(hand: "left" | "right", strength: number, ms: number) {
    const act = (this.vrSources[hand]?.gamepad as (Gamepad & { hapticActuators?: { pulse?: (v: number, t: number) => Promise<boolean> }[] }) | undefined)?.hapticActuators?.[0];
    act?.pulse?.(strength, ms).catch(() => {});
  }

  vrHand(hand: "left" | "right"): VrHandState {
    const src = this.vrSources[hand];
    const g = this.vrHands[hand];
    let yaw = this.vrHeadYaw() ?? 0;
    if (g) {
      const d = new THREE.Vector3(0, 0, -1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()));
      if (Math.hypot(d.x, d.z) > 0.2) yaw = Math.atan2(d.z, d.x);
    }
    return { gamepad: src?.gamepad ?? null, yaw };
  }

  private setupVr() {
    this.renderer.xr.enabled = true;
    this.renderer.xr.setFoveation(1);
    const fistMat = new THREE.MeshStandardMaterial({ color: "#d9a17a", roughness: 0.7 });
    for (const i of [0, 1]) {
      const ray = this.renderer.xr.getController(i);
      const grip = this.renderer.xr.getControllerGrip(i);
      this.rig.add(ray, grip);
      // A fist where your hand is, and your forearm in your coat sleeve.
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), fistMat);
      fist.scale.set(1, 0.85, 1.3);
      grip.add(fist, this.makeForearm());
      ray.addEventListener("connected", (e) => {
        const src = (e as unknown as { data: XRInputSource }).data;
        const hand = src.handedness === "left" ? "left" : "right";
        this.vrSources[hand] = src;
        this.vrHands[hand] = ray;
        this.vrGrips[hand] = grip;
        if (hand === "right") {
          // An aiming line from your right hand.
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2.5)]),
            new THREE.LineBasicMaterial({ color: "#fde68a", transparent: true, opacity: 0.5 }),
          );
          line.name = "aim";
          ray.add(line);
          // Your health and the rest, on a screen strapped to your right forearm.
          grip.add(this.makeVrHud());
        } else {
          // The map, strapped to your left forearm: raise your arm to read it.
          grip.add(this.makeVrMapScreen());
        }
      });
      ray.addEventListener("disconnected", () => {
        for (const h of ["left", "right"] as const) if (this.vrHands[h] === ray) {
          this.vrHands[h] = null;
          this.vrSources[h] = null;
          this.vrGrips[h] = null;
        }
        ray.getObjectByName("aim")?.removeFromParent();
      });
    }
  }

  /** A forearm in your red coat sleeve with a gold cuff, running back from the hand (meters, in the hand's space). */
  private makeForearm() {
    const g = new THREE.Group();
    const dir = new THREE.Vector3(0, -0.3, 1).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.3, 12), new THREE.MeshStandardMaterial({ color: "#3b0d0d", roughness: 0.85 }));
    sleeve.quaternion.copy(q);
    sleeve.position.copy(dir.clone().multiplyScalar(0.21));
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.035, 12), new THREE.MeshStandardMaterial({ color: "#d4a017", metalness: 0.5, roughness: 0.4 }));
    cuff.quaternion.copy(q);
    cuff.position.copy(dir.clone().multiplyScalar(0.07));
    g.add(sleeve, cuff);
    return g;
  }

  /** The map screen on your left forearm. */
  private makeVrMapScreen() {
    const tex = new THREE.CanvasTexture(this.vrMap.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.vrMap.tex = tex;
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.085, 40),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }),
    );
    mesh.renderOrder = 10;
    mesh.position.set(0, 0.035, 0.17);
    mesh.rotation.x = -Math.PI / 2.4;
    return mesh;
  }

  /** The engine drew a fresh map onto vrMap.canvas. */
  vrMapDrawn() {
    if (this.vrMap.tex) this.vrMap.tex.needsUpdate = true;
  }

  /** Is this hand reaching back over your shoulder (where your backpack is)? */
  vrHandAtBack(hand: "left" | "right") {
    const grip = this.vrGrips[hand];
    if (!grip || !this.renderer.xr.isPresenting) return false;
    // In your head's own space, which (inside the scaled rig) is already in meters.
    this.camera.updateWorldMatrix(true, false);
    const p = this.camera.worldToLocal(grip.getWorldPosition(new THREE.Vector3()));
    // Behind your head's front, no lower than your shoulders, and not far out to the side.
    return p.z > 0.02 && p.y > -0.35 && p.y < 0.3 && Math.abs(p.x) < 0.45;
  }

  /** Show your backpack in a hand (or put it away). */
  holdBackpack(hand: "left" | "right" | null) {
    if (hand === this.packHand) return;
    this.packHand = hand;
    const grip = hand ? this.vrGrips[hand] : null;
    if (grip) {
      grip.add(this.backpack);
      this.backpack.visible = true;
    } else {
      this.backpack.removeFromParent();
      this.backpack.visible = false;
      this.packPanel.setHover(-1);
    }
  }

  /** The price board in the store you're in. */
  get storePanel() {
    return this.interior?.panel ?? null;
  }

  /**
   * What a VR hand is pointing at: a row on the store's board or in your
   * backpack (which also lights up), or null.
   */
  vrPointAt(hand: "left" | "right"): { panel: WorldPanel; row: number } | null {
    const ray = this.vrHands[hand];
    const panels = [this.interior?.panel, this.packHand ? this.packPanel : null].filter((p): p is WorldPanel => !!p);
    for (const p of panels) p.setHover(-1);
    if (!ray || !panels.length || !this.renderer.xr.isPresenting) return null;
    const origin = ray.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ray.getWorldQuaternion(new THREE.Quaternion()));
    this.raycaster.set(origin, dir);
    this.raycaster.far = 600;
    const hit = this.raycaster.intersectObjects(panels.map((p) => p.mesh), false)[0];
    if (!hit?.uv) return null;
    const panel = hit.object.userData.panel as WorldPanel;
    const row = panel.rowAt(hit.uv);
    panel.setHover(row);
    return row >= 0 ? { panel, row } : null;
  }

  /** Build the inside of the store you've walked into (and take it down when you leave). */
  private syncInterior(sim: Sim) {
    const at = sim.mode === "foot" ? sim.shore.inside : null;
    const key = at ? `${at.island}:${at.index}` : "";
    if (this.interior && this.interior.key !== key) {
      this.scene.remove(this.interior.group);
      disposeInterior(this.interior.group);
      this.interior.panel.dispose();
      this.interior = null;
    }
    if (!at || this.interior) return;
    const b = ISLANDS[at.island].buildings[at.index];
    const inside = buildInterior(b, at.kind);
    const panel = new WorldPanel(inside.board.width, inside.board.height, 7);
    inside.board.anchor.add(panel.mesh);
    this.scene.add(inside.group);
    this.interior = { key, group: inside.group, panel };
  }

  private makeVrHud() {
    if (this.vrHud) return this.vrHud.mesh;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 384;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.15),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }),
    );
    mesh.renderOrder = 10;
    mesh.position.set(0, 0.04, 0.16);
    mesh.rotation.x = -Math.PI / 2.6;
    this.vrHud = { canvas, tex, mesh };
    return mesh;
  }

  /** Redraw the wrist screen: one line per entry, with an optional color. */
  drawVrHud(lines: { text: string; color?: string; size?: number }[]) {
    const h = this.vrHud;
    if (!h || !this.renderer.xr.isPresenting) return;
    const g = h.canvas.getContext("2d")!;
    g.clearRect(0, 0, 512, 384);
    g.fillStyle = "rgba(0,0,0,0.72)";
    g.beginPath();
    g.roundRect(4, 4, 504, 376, 24);
    g.fill();
    let y = 20;
    for (const l of lines) {
      const size = l.size ?? 30;
      g.font = `bold ${size}px sans-serif`;
      g.fillStyle = l.color ?? "#f4f4f5";
      g.textBaseline = "top";
      g.fillText(l.text, 22, y, 470);
      y += size + 10;
    }
    h.tex.needsUpdate = true;
  }

  /** In VR you stand where your hero (or your helm) is, and the rig turns with your ship. */
  private placeVrRig(sim: Sim, view: CameraView) {
    const hero = sim.mode === "foot" ? sim.shore.hero : null;
    let feet: THREE.Vector3;
    if (hero) feet = new THREE.Vector3(hero.x, hero.y, hero.z);
    else {
      const v = this.ships.get(sim.player.id);
      feet = v ? v.group.localToWorld(helmLocal(sim.player, 0)) : new THREE.Vector3(sim.player.x, 30, sim.player.z);
    }
    this.rig.position.copy(feet);
    this.rig.rotation.set(0, -view.vrYaw - Math.PI / 2, 0);
    this.rig.scale.setScalar(VR_SCALE);
    this.rig.updateMatrixWorld(true);
    this.camTarget.set(feet.x, feet.y, feet.z);
    const cell = OCEAN_SIZE / OCEAN_SEGMENTS;
    this.ocean.position.set(Math.round(feet.x / cell) * cell, 0, Math.round(feet.z / cell) * cell);
    this.sky.position.copy(feet);
    // Your backpack's list turns to face you.
    if (this.packHand) {
      this.backpack.updateMatrixWorld(true);
      this.packPanel.mesh.lookAt(this.camera.getWorldPosition(new THREE.Vector3()));
    }
  }

  /** From the helm your own sails would fill the view, so they turn see-through. */
  private updateFirstPersonSails(sim: Sim, view: CameraView) {
    const want = (view.firstPerson || this.renderer.xr.isPresenting) && sim.mode === "ship";
    const v = this.ships.get(sim.player.id);
    if (!v || !v.sails.length) return;
    if (want === this.firstPersonSails && (v.sails[0].material as THREE.Material).transparent === want) return;
    this.firstPersonSails = want;
    const mat = v.sails[0].material as THREE.MeshStandardMaterial;
    mat.transparent = want;
    mat.opacity = want ? 0.28 : 1;
    mat.depthWrite = !want;
    mat.needsUpdate = true;
  }

  // ---------------------------------------------------------------- sky

  private updateSky(sim: Sim) {
    const phase = 0.66 + sim.time / DAY_LENGTH;
    const k = blendKey(phase);
    const theta = (phase - 0.25) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(theta) * 0.85, Math.sin(theta), 0.4).normalize();
    const moonDir = sunDir.clone().multiplyScalar(-1);
    this.night = THREE.MathUtils.smoothstep(-sunDir.y, -0.1, 0.18);
    const lightDir = sunDir.y > -0.05 ? sunDir : moonDir;

    this.fog.color.copy(k.fog);
    this.skyUniforms.uHorizon.value.copy(k.horizon);
    this.skyUniforms.uZenith.value.copy(k.zenith);
    this.skyUniforms.uSunDir.value.copy(sunDir);
    this.skyUniforms.uMoonDir.value.copy(moonDir);
    this.skyUniforms.uLightColor.value.copy(k.light);
    this.skyUniforms.uNight.value = this.night;
    this.sun.color.copy(k.light);
    this.sun.intensity = k.lightI;
    this.sun.position.copy(lightDir).multiplyScalar(1000).add(this.camTarget);
    this.sun.target.position.copy(this.camTarget);
    this.hemi.color.copy(k.hemiSky);
    this.hemi.intensity = k.hemiI;
    this.renderer.toneMappingExposure = k.exposure;
    this.oceanUniforms.uDeep.value.copy(k.deep);
    this.oceanUniforms.uShallow.value.copy(k.shallow);
    this.oceanUniforms.uLagoon.value.copy(k.lagoon);
    this.oceanUniforms.uSky.value.copy(k.horizon);
    this.oceanUniforms.uLightDir.value.copy(lightDir);
    this.oceanUniforms.uLightColor.value.copy(k.light).multiplyScalar(this.night > 0.5 ? 0.6 : 1);
    this.bloom.strength = 0.3 + this.night * 0.35;
  }

  // ---------------------------------------------------------------- events

  handleEvents(events: SimEvent[], sim: Sim) {
    const p = (kind: PuffKind, x: number, y: number, z: number, vx = 0, vz = 0) => puff(this.smoke, this.glow, kind, x, y, z, vx, vz);
    for (const e of events) {
      switch (e.k) {
        case "fire": {
          const ship = sim.ships.find((s) => s.id === e.shipId);
          if (!ship) break;
          const v = this.ships.get(ship.id);
          if (v) v.recoil[e.side] = 1;
          const f = forward(ship.heading);
          const sn = sideNormal(ship.heading, e.side);
          for (let i = 0; i < e.count; i++) {
            const along = e.count === 1 ? 0 : (i / (e.count - 1) - 0.5) * ship.cls.length * 0.6;
            const x = ship.x + f.x * along + sn.x * (ship.cls.beam / 2 + 4);
            const z = ship.z + f.z * along + sn.z * (ship.cls.beam / 2 + 4);
            p("flash", x, 8, z, sn.x * 40, sn.z * 40);
            for (let k = 0; k < 4; k++) p("smoke", x, 8, z, sn.x * (18 + k * 12), sn.z * (18 + k * 12));
            p("spark", x, 8, z);
          }
          if (e.byPlayer) this.shake = Math.min(1, this.shake + 0.25);
          break;
        }
        case "hit":
          for (let i = 0; i < 7; i++) p("debris", e.x, e.y, e.z);
          p("flash", e.x, e.y, e.z);
          for (let i = 0; i < 3; i++) p("spark", e.x, e.y, e.z);
          if (e.onPlayer) this.shake = Math.min(1.5, this.shake + 0.5);
          break;
        case "splash":
          for (let i = 0; i < 6; i++) p("splash", e.x, 1, e.z);
          break;
        case "impact":
          for (let i = 0; i < 4; i++) p(e.fire ? "fire" : "dust", e.x, e.y, e.z);
          p("spark", e.x, e.y, e.z);
          break;
        case "sunk":
          for (let i = 0; i < 22; i++) p(i % 3 ? "debris" : "fire", e.x, 6, e.z);
          for (let i = 0; i < 10; i++) p("smoke", e.x, 8, e.z);
          this.effects.ring(e.x, 2, e.z, 90, "#cbd5e1", 1.2);
          break;
        case "crate":
          for (let i = 0; i < 18; i++) p("gold", e.x, 6, e.z);
          break;
        case "explosion":
          for (let i = 0; i < Math.min(40, 10 + e.radius / 10); i++) p("fire", e.x + (Math.random() - 0.5) * e.radius * 0.5, 6, e.z + (Math.random() - 0.5) * e.radius * 0.5);
          for (let i = 0; i < 6; i++) p("smoke", e.x, 10, e.z);
          this.effects.ring(e.x, (groundHeight(e.x, e.z) ?? 1) + 1, e.z, e.radius, e.radius > 300 ? "#e0e7ff" : "#fb923c", e.radius > 300 ? 1.2 : 0.5);
          if (e.radius > 300) {
            this.shake = 1.4;
            for (let i = 0; i < 60; i++) {
              const a = Math.random() * Math.PI * 2;
              p("spray", e.x + Math.cos(a) * e.radius * 0.6, 2, e.z + Math.sin(a) * e.radius * 0.6, Math.cos(a) * 60, Math.sin(a) * 60);
            }
          }
          break;
        case "gunshot": {
          const who = e.byHero ? sim.shore.hero : null;
          const aim = who ? who.heading : 0;
          const x = e.x + Math.cos(aim) * 10;
          const z = e.z + Math.sin(aim) * 10;
          const y = (groundHeight(e.x, e.z) ?? 0) + 13;
          p("flash", x, y, z);
          p("smoke", x, y, z, Math.cos(aim) * 10, Math.sin(aim) * 10);
          break;
        }
        case "walkerHit":
          for (let i = 0; i < 5; i++) p("blood", e.x, e.y, e.z);
          p("spark", e.x, e.y, e.z);
          break;
        case "walkerDown":
          for (let i = 0; i < 6; i++) p("dust", e.x, groundHeight(e.x, e.z) ?? 6, e.z);
          break;
        case "heroHit":
          this.shake = Math.min(0.8, this.shake + 0.25);
          break;
        case "power":
          this.powerEffect(e, sim);
          break;
        case "loot":
        case "robbed": {
          // A crate you smashed bursts into splinters.
          if (e.k === "loot" && e.smashed) {
            const y = (groundHeight(e.x, e.z) ?? 6) + 5;
            for (let i = 0; i < 14; i++) p("debris", e.x, y, e.z);
            p("dust", e.x, y, e.z);
            this.shake = Math.min(0.5, this.shake + 0.2);
          }
          const h = sim.shore.hero;
          if (h) for (let i = 0; i < 24; i++) p("gold", h.x, h.y + 10, h.z);
          break;
        }
        case "fruitFound": {
          const h = sim.shore.hero;
          if (h) {
            this.effects.ring(h.x, h.y + 1, h.z, 60, "#c084fc", 1.2);
            for (let i = 0; i < 30; i++) p("gold", h.x, h.y + 10, h.z);
          }
          break;
        }
        case "playerSunk":
          this.shake = 1.5;
          break;
      }
    }
  }

  private powerEffect(e: Extract<SimEvent, { k: "power" }>, sim: Sim) {
    const p = (kind: PuffKind, x: number, y: number, z: number, vx = 0, vz = 0) => puff(this.smoke, this.glow, kind, x, y, z, vx, vz);
    const y0 = e.atSea ? 14 : (sim.shore.hero?.y ?? 6) + 12;
    switch (e.fruit) {
      case "mera":
        for (let i = 0; i < 16; i++) p("fire", e.x, y0, e.z);
        break;
      case "goro": {
        const ty = e.atSea ? 4 : (groundHeight(e.tx, e.tz) ?? 2) + 1;
        this.effects.lightning(e.tx + 40, 420, e.tz - 30, e.tx, ty, e.tz);
        this.effects.lightning(e.tx - 20, 380, e.tz + 25, e.tx, ty, e.tz);
        this.effects.ring(e.tx, ty + 1, e.tz, 60, "#bfdbfe", 0.5);
        for (let i = 0; i < 20; i++) p("spark", e.tx, ty + 4, e.tz);
        this.shake = Math.max(this.shake, 0.6);
        break;
      }
      case "gomu": {
        // Awakened, the arms burn crimson; at sea they're giant.
        const color = e.awake ? "#dc2626" : "#d9a17a";
        const thick = (e.atSea ? 4 : 1) * (e.awake ? 1.8 : 1);
        const ground = e.atSea ? 4 : (sim.shore.hero?.y ?? 6) + 1;
        switch (e.move) {
          case "bounce":
            this.effects.ring(e.x, ground + 2, e.z, e.atSea ? 140 : 45, e.awake ? "#ef4444" : "#c084fc", 0.5);
            if (e.tx !== e.x || e.tz !== e.z) this.effects.stretch(e.tx, y0, e.tz, e.x, e.z, thick, "#c084fc", 0.2);
            break;
          case "sling":
            this.effects.stretch(e.x, y0, e.z, e.tx, e.tz, thick * 1.3, color, 0.35);
            this.effects.ring(e.x, ground + 2, e.z, e.atSea ? 200 : 60, color, 0.5);
            this.shake = Math.max(this.shake, e.awake ? 1 : 0.4);
            break;
          case "flurry":
            this.effects.stretch(e.x, y0 + (Math.random() - 0.5) * 6, e.z, e.tx, e.tz, thick, color, 0.14);
            this.shake = Math.max(this.shake, e.awake ? 0.5 : 0.15);
            break;
          default:
            this.effects.stretch(e.x, y0, e.z, e.tx, e.tz, thick, color);
            if (e.awake) {
              this.effects.ring(e.tx, ground + 2, e.tz, e.atSea ? 280 : 90, "#ef4444", 0.6);
              this.shake = Math.max(this.shake, 0.9);
            }
        }
        break;
      }
      case "moku":
        for (let i = 0; i < 40; i++) p("bigsmoke", e.x, y0, e.z);
        break;
      case "gura":
        this.effects.ring(e.x, y0 - 10, e.z, e.atSea ? 520 : 170, "#e0e7ff", 0.9);
        this.shake = 1.5;
        break;
    }
  }

  // ---------------------------------------------------------------- ships

  private syncShips(sim: Sim, dt: number, view: CameraView) {
    const seen = new Set<number>();
    const t = sim.time;
    for (const s of sim.ships) {
      seen.add(s.id);
      let v = this.ships.get(s.id);
      if (v && v.cls !== s.cls) {
        // You bought a bigger ship.
        this.scene.remove(v.group);
        disposeShip(v);
        v = undefined;
      }
      if (!v) {
        v = buildShip(s);
        this.ships.set(s.id, v);
        this.scene.add(v.group);
      }
      if (s === sim.player) {
        setCannons(v, s);
        this.syncCrew(v, s, sim.save.crew, t);
        v.helm.wheel.rotation.x = view.helm.wheel;
        view.helm.levers.forEach((a, i) => (v.helm.levers[i].rotation.z = a));
        // Cannon buttons glow when that side is loaded, and sink in when pressed.
        view.helm.buttons.forEach((b, i) => {
          const btn = v.helm.buttons[i];
          const lay = helmLayout(s.cls).buttons[i];
          btn.cap.position.y = lay.y - b.pushed * 0.5;
          btn.mat.emissiveIntensity = b.ready ? 0.9 + 0.3 * Math.sin(t * 6) : 0.05;
          btn.mat.color.set(b.ready ? "#ef4444" : "#4b1d1d");
        });
      } else {
        // Other crews' wheels turn as they steer, and their helmsman leans into the turn.
        v.helm.wheel.rotation.x += (s.rudder * WHEEL_LOCK * 0.5 - v.helm.wheel.rotation.x) * Math.min(1, dt * 3);
        if (v.helmsman) {
          v.helmsman.body.rotation.x += (-s.rudder * 0.12 - v.helmsman.body.rotation.x) * Math.min(1, dt * 3);
          // Hands follow the spokes a little.
          const turn = v.helm.wheel.rotation.x * 0.15;
          v.helmsman.armL.rotation.x = turn;
          v.helmsman.armR.rotation.x = turn;
        }
      }
      const f = forward(s.heading);
      const L = s.cls.length / 2;
      const B = s.cls.beam / 2;
      const bow = waveHeight(s.x + f.x * L, s.z + f.z * L, t);
      const stern = waveHeight(s.x - f.x * L, s.z - f.z * L, t);
      const port = waveHeight(s.x + f.z * B, s.z - f.x * B, t);
      const star = waveHeight(s.x - f.z * B, s.z + f.x * B, t);
      let y = (bow + stern + port + star) / 4;
      let pitch = Math.atan2(bow - stern, s.cls.length) * 0.8;
      let roll = Math.atan2(port - star, s.cls.beam) * 0.6 + s.rudder * (s.speed / s.stats.speed) * 0.13;
      if (s.sinking >= 0) {
        const k = Math.min(1, s.sinking / 5);
        y -= k * k * 48;
        roll += k * 0.9;
        pitch += k * 0.35;
      }
      v.group.position.set(s.x, y, s.z);
      v.group.rotation.set(roll, -s.heading, pitch);
      // Sails fill as they're raised; furled at anchor.
      const target = s.sinking >= 0 ? 0.3 : 0.25 + 0.75 * Math.min(1, s.throttle);
      for (const sail of v.sails) sail.scale.y += (target - sail.scale.y) * Math.min(1, dt * 2);
      v.flag.rotation.y = Math.sin(t * 3 + s.id) * 0.3;
      for (const c of v.cannons) {
        const side = c.userData.side as Side;
        c.position.z = c.userData.baseZ - side * v.recoil[side] * 2.5;
      }
      for (const side of [1, -1]) v.recoil[side] = Math.max(0, v.recoil[side] - dt * 2.5);
      const glow = 0.3 + this.night;
      // The fruit brig's lantern burns purple.
      if (s.fruitCarrier) v.lanternMat.color.setRGB(1.1 * (glow + 0.6), 0.2 * (glow + 0.6), 2.2 * (glow + 0.6));
      else v.lanternMat.color.setRGB(4 * glow, 2.4 * glow, 0.9 * glow);
      v.group.visible = !(s === sim.player && sim.hidden && sim.mode === "ship" && Math.sin(t * 20) > 0.6);
    }
    for (const [id, v] of this.ships) {
      if (seen.has(id)) continue;
      this.scene.remove(v.group);
      disposeShip(v);
      this.ships.delete(id);
    }
  }

  // ---------------------------------------------------------------- people

  private syncPeople(sim: Sim, view: CameraView, dt: number) {
    const shore = sim.shore;
    const list = shore.hero ? [shore.hero, ...shore.walkers] : shore.walkers;
    const seen = new Set<number>();
    for (const w of list) {
      seen.add(w.id);
      let v = this.people.get(w.id);
      if (!v) {
        v = buildPerson(w.kind);
        this.people.set(w.id, v);
        this.scene.add(v.group);
      }
      const isHero = w === shore.hero;
      posePerson(v, w, dt, isHero ? view.aiming : w.swing < 0.6);
      // Smoke-Smoke: you flicker in and out of sight. Also hide yourself if the camera is pressed right up against you.
      const tooClose = isHero && (view.firstPerson || this.renderer.xr.isPresenting || this.camPos.distanceTo(v.group.position) < 22);
      v.group.visible = !tooClose && !(isHero && sim.hidden && Math.sin(sim.time * 18) > 0.3);
      // Bounce Body: you puff up like a ball.
      const puffed = isHero && sim.bouncing ? 1 + 0.08 * Math.sin(sim.time * 14) : 0;
      if (puffed) v.group.scale.set(1.7 * puffed, 1.25, 1.7 * puffed);
      else if (isHero) v.group.scale.set(1, 1, 1);
    }
    for (const [id, v] of this.people) {
      if (seen.has(id)) continue;
      this.scene.remove(v.group);
      disposePerson(v);
      this.people.delete(id);
    }
  }

  // ---------------------------------------------------------------- projectiles and loot

  private syncProjectiles(sim: Sim, dt: number) {
    let nb = 0;
    let nf = 0;
    for (const b of sim.balls) {
      this.matrix.makeTranslation(b.x, b.y, b.z);
      if (b.fire && nf < 50) {
        this.fireballs.setMatrixAt(nf++, this.matrix);
        if (Math.random() < dt * 40) puff(this.smoke, this.glow, "fire", b.x, b.y, b.z);
      } else if (nb < 800) this.balls.setMatrixAt(nb++, this.matrix);
    }
    let ns = 0;
    for (const s of sim.shore.shots) {
      this.matrix.makeTranslation(s.x, s.y, s.z);
      if (s.fire && nf < 50) {
        this.fireballs.setMatrixAt(nf++, this.matrix);
        if (Math.random() < dt * 40) puff(this.smoke, this.glow, "fire", s.x, s.y, s.z);
      } else if (ns < 200) this.bullets.setMatrixAt(ns++, this.matrix);
    }
    for (const [mesh, n] of [
      [this.balls, nb],
      [this.fireballs, nf],
      [this.bullets, ns],
    ] as const) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private syncCrates(sim: Sim) {
    const seen = new Set<number>();
    for (const c of sim.crates) {
      seen.add(c.id);
      let g = this.crates.get(c.id);
      if (!g) {
        g = buildCrate();
        // The fruit brig's chest: the fruit glows on top.
        if (c.fruit) {
          const f = buildFruit(c.fruit);
          f.scale.setScalar(1.6);
          f.position.y = 2;
          g.add(f);
        }
        this.crates.set(c.id, g);
        this.scene.add(g);
      }
      g.position.set(c.x, waveHeight(c.x, c.z, sim.time) + 1, c.z);
      g.rotation.y = sim.time * 0.6 + c.id;
    }
    for (const [id, g] of this.crates) {
      if (seen.has(id)) continue;
      this.scene.remove(g);
      this.crates.delete(id);
    }
  }

  /** Your hired crew stand at their stations along the deck, facing the guns, swaying with the ship. */
  private syncCrew(v: ShipVisual, s: Sim["player"], n: number, t: number) {
    if (v.crew.length !== n) {
      for (const p of v.crew) {
        v.group.remove(p.group);
        disposePerson(p);
      }
      v.crew = [];
      const L = s.cls.length;
      const B = s.cls.beam;
      const deck = 5 + B * 0.14;
      const perSide = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const k = Math.floor(i / 2);
        const along = perSide <= 1 ? L * 0.05 : L * (0.28 - (0.5 * k) / (perSide - 1));
        const p = buildPerson("sailor");
        p.group.position.set(along + (side > 0 ? 3 : -3), deck, side * B * 0.3);
        p.group.rotation.y = -side * (Math.PI / 2);
        v.group.add(p.group);
        v.crew.push(p);
      }
    }
    v.crew.forEach((p, i) => {
      p.armR.rotation.z = 0.25 + 0.2 * Math.sin(t * 1.3 + i);
      p.armL.rotation.z = 0.15 * Math.sin(t * 1.1 + i * 2);
    });
  }

  /** Build the islands you're near, and throw away the ones you've left far behind. */
  private streamIslands(sim: Sim) {
    const at = sim.mode === "foot" && sim.shore.hero ? sim.shore.hero : sim.player;
    for (const isl of ISLANDS) {
      const shore = Math.hypot(isl.x - at.x, isl.z - at.z) - isl.radius;
      const built = this.islands.get(isl.index);
      if (!built && shore < ISLAND_LOAD) {
        const g = buildIsland(isl);
        this.scene.add(g);
        this.islands.set(isl.index, g);
      } else if (built && shore > ISLAND_UNLOAD) {
        this.scene.remove(built);
        disposeIsland(built);
        this.islands.delete(isl.index);
        for (const s of isl.spots) {
          const obj = this.spots.get(s.id);
          if (obj) this.scene.remove(obj);
          this.spots.delete(s.id);
        }
      }
    }
  }

  /** Islands loaded right now (for tests). */
  get loadedIslands() {
    return [...this.islands.keys()];
  }

  /** A weapon model for your own hands, made once per weapon. On screen it draws over everything, so it never pokes into walls. */
  private handWeapon(cache: Map<WeaponId, THREE.Group>, id: WeaponId, onScreen: boolean) {
    let g = cache.get(id);
    if (g) return g;
    g = new THREE.Group();
    weaponMeshes(g, id);
    if (id === "fists" && onScreen) {
      const fist = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.6), new THREE.MeshStandardMaterial({ color: "#d9a17a", roughness: 0.8 }));
      fist.position.y = -0.6;
      g.add(fist);
    }
    if (onScreen) {
      g.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const m = (o.material as THREE.Material).clone();
        // Held up close it would sit in your own shadow: give it a little light of its own.
        if (m instanceof THREE.MeshStandardMaterial) {
          m.emissive.copy(m.color).multiplyScalar(0.3);
          m.metalness = Math.min(m.metalness, 0.35);
          m.roughness = Math.max(m.roughness, 0.4);
        }
        m.depthTest = false;
        m.depthWrite = false;
        o.material = m;
        o.renderOrder = 20;
      });
    }
    cache.set(id, g);
    return g;
  }

  /** First person on foot: the weapon you're holding, at the bottom right, swinging, firing and bobbing as you walk. */
  private poseViewWeapon(sim: Sim, view: CameraView, dt: number) {
    const h = sim.mode === "foot" ? sim.shore.hero : null;
    const show = !!h && h.dead < 0 && !h.swimming && view.firstPerson && !this.renderer.xr.isPresenting;
    this.fpHolder.visible = show;
    if (!show || !h) return;
    if (this.fpId !== h.weapon) {
      this.fpSpin.clear();
      this.fpSpin.add(this.handWeapon(this.fpModels, h.weapon, true));
      this.fpId = h.weapon;
    }
    const gun = WEAPONS[h.weapon].kind === "gun";
    const fists = h.weapon === "fists";
    // Guns come up to the middle of your view when you aim.
    const base =
      gun && view.aiming
        ? new THREE.Vector3(0, -2.3, -7)
        : gun
          ? new THREE.Vector3(3, -3, -7.5)
          : fists
            ? new THREE.Vector3(3, -3, -6.5)
            : new THREE.Vector3(3.8, -3.8, -7.5);
    this.fpPos.lerp(base, Math.min(1, dt * 12));
    const step = sim.time * (sim.input.sprint ? 15 : 10);
    const bob = h.moving
      ? new THREE.Vector3(Math.sin(step / 2) * 0.35, -Math.abs(Math.sin(step / 2)) * 0.4, 0)
      : new THREE.Vector3(0, Math.sin(sim.time * 1.6) * 0.08, 0);
    // Blades point forward and up; guns and fists straight ahead.
    this.fpTilt.rotation.x = gun || fists ? Math.PI / 2 : 2.2;
    let rx = 0;
    let ry = 0;
    let push = 0;
    if (gun) {
      if (h.swing < 0.15) {
        // Kick: back toward you, muzzle up.
        const k = 1 - h.swing / 0.15;
        rx = 0.35 * k;
        push = 1.2 * k;
      }
    } else if (h.swing < 0.3) {
      // A quick chop down and across (or a punch straight out), then back.
      const k = h.swing / 0.3;
      const a = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
      if (fists) push = -3 * a;
      else {
        rx = -0.9 * a;
        ry = 0.9 * a;
        bob.x -= 3 * a;
      }
    }
    this.fpHolder.position.copy(this.fpPos).add(bob);
    this.fpHolder.position.z += push;
    this.fpHolder.rotation.set(rx, ry, 0);
  }

  /** VR on foot: your weapon is in your right hand, and we track how fast its tip moves so a real swing can hit. */
  private clock = 0;
  private poseVrWeapon(sim: Sim, dt: number) {
    this.clock += dt;
    const h = sim.mode === "foot" ? sim.shore.hero : null;
    const grip = this.vrGrips.right;
    if (!h || h.dead >= 0 || !grip) {
      this.vrWeapon.visible = false;
      this.vrTip = null;
      this.vrTipHist = [];
      return;
    }
    if (this.vrWeapon.parent !== grip) grip.add(this.vrWeapon);
    if (this.vrWeaponId !== h.weapon) {
      this.vrSpin.clear();
      this.vrSpin.add(this.handWeapon(this.vrModels, h.weapon, false));
      this.vrWeaponId = h.weapon;
    }
    const gun = WEAPONS[h.weapon].kind === "gun";
    this.vrWeapon.visible = h.weapon !== "fists";
    // Along your hand, like holding the controller: blades tilt up a little, barrels point where you aim.
    this.vrTilt.rotation.x = gun ? Math.PI / 2 : 1.85;
    this.vrWeapon.updateMatrixWorld(true);
    const model = this.vrSpin.children[0];
    const tip = model.localToWorld(new THREE.Vector3(0, -WEAPON_TIP[h.weapon], 0));
    // Speed measured relative to you, so walking or turning doesn't count as swinging.
    const local = this.rig.worldToLocal(tip.clone());
    const hist = this.vrTipHist;
    const prev = hist[hist.length - 1];
    const speed = prev ? local.distanceTo(prev.p) / Math.max(dt, 1e-3) : 0;
    hist.push({ t: this.clock, p: local });
    while (hist.length && hist[0].t < this.clock - SWING_WINDOW) hist.shift();
    let arc = 0;
    for (let i = 1; i < hist.length; i++) arc += hist[i].p.distanceTo(hist[i - 1].p);
    const chord = hist.length ? local.distanceTo(hist[0].p) : 0;
    this.vrTip = { pos: tip, speed, arc, chord };
  }

  /** Chests, supply crates, X marks and Devil Fruits on islands; hidden once emptied. */
  private syncSpots(sim: Sim) {
    const fruitsLeft = sim.save.fruitsFound.length < 5;
    for (const isl of ISLANDS) {
      if (!this.islands.has(isl.index)) continue;
      for (const s of isl.spots) {
        let obj = this.spots.get(s.id);
        if (!obj) {
          obj =
            s.kind === "chest" ? buildChest() : s.kind === "crate" ? buildSupplyCrate() : s.kind === "buried" ? buildBuriedMark() : buildFruit(null);
          obj.position.set(s.x, groundHeight(s.x, s.z) ?? 6, s.z);
          obj.rotation.y = (s.x * 7) % 6.28;
          this.spots.set(s.id, obj);
          this.scene.add(obj);
        }
        const spent = (sim.shore.spentUntil.get(s.id) ?? 0) > sim.time || (s.kind === "fruit" && !fruitsLeft);
        obj.visible = !spent;
        if (s.kind === "fruit" && !spent) {
          const fruit = obj.getObjectByName("fruit");
          if (fruit) {
            fruit.position.y = 8 + Math.sin(sim.time * 2) * 1.2;
            fruit.rotation.y = sim.time;
          }
        }
      }
    }
  }

  /** Wakes behind moving ships, spray at the bow, smoke from damage, dust under your feet. */
  private emitAmbient(sim: Sim, dt: number) {
    const p = (kind: PuffKind, x: number, y: number, z: number, vx = 0, vz = 0) => puff(this.smoke, this.glow, kind, x, y, z, vx, vz);
    this.wakeTimer += dt;
    if (this.wakeTimer > 0.06) {
      this.wakeTimer = 0;
      for (const s of sim.ships) {
        if (Math.hypot(s.x - this.camTarget.x, s.z - this.camTarget.z) > 1600) continue;
        const hp = s.hp / s.stats.hull;
        if (hp < 0.5 || s.sinking >= 0) {
          const x = s.x + (Math.random() - 0.5) * s.cls.length * 0.5;
          const z = s.z + (Math.random() - 0.5) * s.cls.beam * 0.5;
          p("smoke", x, 10, z);
          if (hp < 0.25 || s.burn > 0) p("fire", x, 9, z);
        }
        if (s.sinking >= 0 || s.speed < 8) continue;
        const f = forward(s.heading);
        const L = s.cls.length / 2;
        for (const side of [1, -1] as Side[]) {
          const sn = sideNormal(s.heading, side);
          p("wake", s.x - f.x * L + sn.x * 4, waveHeight(s.x, s.z, sim.time), s.z - f.z * L + sn.z * 4, sn.x * 8, sn.z * 8);
        }
        if (s.speed > 40 && Math.random() < 0.6) {
          const sn = sideNormal(s.heading, Math.random() < 0.5 ? 1 : -1);
          p("spray", s.x + f.x * L, 3, s.z + f.z * L, sn.x * 25 + f.x * s.speed * 0.4, sn.z * 25 + f.z * s.speed * 0.4);
        }
      }
      if (sim.hidden) {
        const at = sim.mode === "foot" && sim.shore.hero ? sim.shore.hero : sim.player;
        p("bigsmoke", at.x, 10, at.z);
      }
    }
    if (sim.awakened && Math.random() < dt * 60) {
      const hero = sim.mode === "foot" ? sim.shore.hero : null;
      if (hero) p("aura", hero.x, hero.y + 2, hero.z);
      else {
        // At sea the aura wraps the whole ship.
        const s = sim.player;
        const f = forward(s.heading);
        const along = (Math.random() - 0.5) * s.cls.length;
        p("aura", s.x + f.x * along, 12, s.z + f.z * along);
        p("aura", s.x + f.x * along, 12, s.z + f.z * along);
      }
    }
    const h = sim.shore.hero;
    this.dustTimer += dt;
    if (h && h.moving && this.dustTimer > 0.18 && h.dead < 0) {
      this.dustTimer = 0;
      p(h.swimming ? "splash" : "dust", h.x, h.swimming ? 1 : h.y, h.z);
    }
  }

  // ---------------------------------------------------------------- camera

  private placeCamera(sim: Sim, view: CameraView, dt: number) {
    const hero = sim.mode === "foot" ? sim.shore.hero : null;
    if (view.firstPerson) {
      let eye: THREE.Vector3;
      let fovBoost = 0;
      if (hero) {
        // Your eyes, with a little bob as you walk.
        const bob = hero.moving && !hero.swimming ? Math.sin(sim.time * (sim.input.sprint ? 15 : 10)) * 0.6 : 0;
        eye = new THREE.Vector3(hero.x, hero.y + 17 + bob, hero.z);
        if (sim.input.sprint && hero.moving) fovBoost = 6;
      } else {
        const v = this.ships.get(sim.player.id);
        eye = v ? v.group.localToWorld(helmLocal(sim.player, 17)) : new THREE.Vector3(sim.player.x, 45, sim.player.z);
        fovBoost = (sim.player.speed / sim.player.stats.speed) * 5;
      }
      const cp = Math.cos(view.pitch);
      const dir = new THREE.Vector3(Math.cos(view.yaw) * cp, -Math.sin(view.pitch), Math.sin(view.yaw) * cp);
      const shook = eye.clone();
      if (this.shake > 0.01) {
        shook.x += (Math.random() - 0.5) * this.shake * 2;
        shook.y += (Math.random() - 0.5) * this.shake * 2;
        this.shake *= Math.exp(-dt * 5);
      }
      this.camera.position.copy(shook);
      this.camera.lookAt(shook.clone().add(dir));
      this.camPos.copy(eye);
      this.camTarget.copy(eye);
      this.camReady = false;
      const fov = 72 + fovBoost;
      if (Math.abs(this.camera.fov - fov) > 0.05) {
        this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
        this.camera.updateProjectionMatrix();
      }
      const cell = OCEAN_SIZE / OCEAN_SEGMENTS;
      this.ocean.position.set(Math.round(eye.x / cell) * cell, 0, Math.round(eye.z / cell) * cell);
      this.sky.position.copy(eye);
      return;
    }
    let target: THREE.Vector3;
    let dist = view.distance;
    let fovBoost = 0;
    if (hero) {
      // Over the right shoulder.
      const rx = -Math.sin(view.yaw);
      const rz = Math.cos(view.yaw);
      target = new THREE.Vector3(hero.x + rx * 7, hero.y + 15, hero.z + rz * 7);
      dist = Math.min(view.distance, 110);
      if (view.aiming) dist *= 0.65;
      if (sim.input.sprint && hero.moving) fovBoost = 6;
    } else {
      const s = sim.player;
      target = new THREE.Vector3(s.x, 30, s.z);
      fovBoost = (s.speed / s.stats.speed) * 7;
    }
    const cosP = Math.cos(view.pitch);
    const cam = new THREE.Vector3(
      target.x - Math.cos(view.yaw) * dist * cosP,
      target.y + Math.sin(view.pitch) * dist,
      target.z - Math.sin(view.yaw) * dist * cosP,
    );
    // Don't let a building get between the camera and you: pull in close instead.
    if (hero) {
      const isl = islandAt(hero.x, hero.z, 60);
      if (isl && isl.buildings.length) {
        for (let i = 1; i <= 16; i++) {
          const t = i / 16;
          const x = target.x + (cam.x - target.x) * t;
          const y = target.y + (cam.y - target.y) * t;
          const z = target.z + (cam.z - target.z) * t;
          const blocked = isl.buildings.some(
            (b) => Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(z - b.z) < b.d / 2 + 3 && y < b.y + b.h + Math.min(b.w, b.d) * 0.45 + 3,
          );
          if (blocked) {
            const k = Math.max(0.12, t - 0.1);
            cam.set(target.x + (cam.x - target.x) * k, target.y + (cam.y - target.y) * k, target.z + (cam.z - target.z) * k);
            break;
          }
        }
      }
    }
    const floor = Math.max(waveHeight(cam.x, cam.z, sim.time), groundHeight(cam.x, cam.z) ?? -99) + 4;
    cam.y = Math.max(cam.y, floor);

    // Ease toward the wanted spot so the camera glides instead of snapping.
    const k = this.camReady ? 1 - Math.exp(-dt * (hero ? 16 : 9)) : 1;
    this.camReady = true;
    this.camPos.lerp(cam, k);
    this.camTarget.lerp(target, k);
    const shook = this.camPos.clone();
    if (this.shake > 0.01) {
      shook.x += (Math.random() - 0.5) * this.shake * 5;
      shook.y += (Math.random() - 0.5) * this.shake * 5;
      this.shake *= Math.exp(-dt * 5);
    }
    this.camera.position.copy(shook);
    this.camera.lookAt(this.camTarget);
    const fov = 60 + fovBoost;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
    // Keep the ocean and sky centered on you, snapped to the wave grid so the water doesn't swim.
    const cell = OCEAN_SIZE / OCEAN_SEGMENTS;
    this.ocean.position.set(Math.round(this.camTarget.x / cell) * cell, 0, Math.round(this.camTarget.z / cell) * cell);
    this.sky.position.copy(this.camera.position);
  }

  private placeAimMarker(sim: Sim, view: CameraView) {
    const p = sim.player;
    if (sim.mode !== "ship" || view.aimSide === null || p.sinking >= 0 || sim.inHaven) {
      this.aimMarker.visible = false;
      return;
    }
    const sn = sideNormal(p.heading, view.aimSide);
    const range = p.stats.range;
    const ready = p.reload[view.aimSide] <= 0;
    const mat = this.aimMarker.material as THREE.MeshBasicMaterial;
    mat.color.set(ready ? "#fde68a" : "#ef4444");
    mat.opacity = ready ? 0.18 : 0.08;
    this.aimMarker.visible = true;
    this.aimMarker.position.set(p.x + sn.x * range * 0.6, waveHeight(p.x, p.z, this.time) + 1.5, p.z + sn.z * range * 0.6);
    this.aimMarker.rotation.set(-Math.PI / 2, 0, -p.heading);
    this.aimMarker.scale.set(p.cls.length * 0.9, range * 0.85, 1);
  }
}
