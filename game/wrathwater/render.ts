/** Wrathwater's 3D view, drawn with Three.js. Reads the simulation each frame; never changes it. */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { Effects, ParticleLayer, puff, type PuffKind } from "./fx";
import { buildIslands } from "./land";
import {
  buildBuriedMark,
  buildChest,
  buildCrate,
  buildFruit,
  buildPerson,
  buildShip,
  buildSupplyCrate,
  disposePerson,
  disposeShip,
  posePerson,
  setCannons,
  type PersonVisual,
  type ShipVisual,
} from "./models";
import { forward, sideNormal, type Sim, type SimEvent, type Side } from "./sim";
import { ISLANDS, WAVES, groundHeight, islandAt, waveHeight } from "./world";

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

    this.scene.add(buildIslands());

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
    this.syncShips(sim, dt);
    this.syncPeople(sim, view, dt);
    this.syncProjectiles(sim, dt);
    this.syncCrates(sim);
    this.syncSpots(sim);
    this.emitAmbient(sim, dt);
    this.smoke.update(dt);
    this.glow.update(dt);
    this.effects.update(dt);
    this.placeCamera(sim, view, dt);
    this.placeAimMarker(sim, view);
    this.composer.render(dt);
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
      case "gomu":
        if (!e.atSea) this.effects.stretch(e.x, y0, e.z, e.tx, e.tz);
        break;
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

  private syncShips(sim: Sim, dt: number) {
    const seen = new Set<number>();
    const t = sim.time;
    for (const s of sim.ships) {
      seen.add(s.id);
      let v = this.ships.get(s.id);
      if (!v) {
        v = buildShip(s);
        this.ships.set(s.id, v);
        this.scene.add(v.group);
      }
      if (s === sim.player) setCannons(v, s);
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
      v.lanternMat.color.setRGB(4 * glow, 2.4 * glow, 0.9 * glow);
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
      const tooClose = isHero && this.camPos.distanceTo(v.group.position) < 22;
      v.group.visible = !tooClose && !(isHero && sim.hidden && Math.sin(sim.time * 18) > 0.3);
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

  /** Chests, supply crates, X marks and Devil Fruits on islands; hidden once emptied. */
  private syncSpots(sim: Sim) {
    const fruitsLeft = sim.save.fruitsFound.length < 5;
    for (const isl of ISLANDS) {
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
      target = new THREE.Vector3(s.x, 16, s.z);
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
