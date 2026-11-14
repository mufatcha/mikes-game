/** Visual effects for Wrathwater: particles, lightning, shockwaves, the Gum-Gum arm. */
import * as THREE from "three";

const MAX_PARTICLES = 3000;

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  r: number;
  g: number;
  b: number;
  a: number;
  gravity: number;
  drag: number;
}

const particleVertex = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const particleFragment = /* glsl */ `
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * smoothstep(0.5, 0.05, d));
}`;

export class ParticleLayer {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  private list: Particle[] = [];
  private pos = new Float32Array(MAX_PARTICLES * 3);
  private col = new Float32Array(MAX_PARTICLES * 4);
  private size = new Float32Array(MAX_PARTICLES);
  private geometry = new THREE.BufferGeometry();

  constructor(additive: boolean) {
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  add(p: Omit<Particle, "max" | "drag"> & { drag?: number }) {
    if (this.list.length >= MAX_PARTICLES) this.list.shift();
    this.list.push({ drag: 0, ...p, max: p.life });
  }

  update(dt: number) {
    const alive: Particle[] = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.gravity * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size += p.grow * dt;
      alive.push(p);
    }
    this.list = alive;
    for (let i = 0; i < alive.length; i++) {
      const p = alive[i];
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      const fade = Math.min(1, (p.life / p.max) * 1.8);
      this.col[i * 4] = p.r;
      this.col[i * 4 + 1] = p.g;
      this.col[i * 4 + 2] = p.b;
      this.col[i * 4 + 3] = p.a * fade;
      this.size[i] = p.size;
    }
    this.geometry.setDrawRange(0, alive.length);
    for (const name of ["position", "aColor", "aSize"]) this.geometry.getAttribute(name).needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export type PuffKind =
  | "smoke"
  | "flash"
  | "splash"
  | "debris"
  | "fire"
  | "gold"
  | "wake"
  | "spray"
  | "dust"
  | "spark"
  | "blood"
  | "steam"
  | "bigsmoke";

/** The particle recipes, shared by every effect. */
export function puff(smoke: ParticleLayer, glow: ParticleLayer, kind: PuffKind, x: number, y: number, z: number, vx = 0, vz = 0) {
  const r = Math.random;
  switch (kind) {
    case "smoke":
      smoke.add({ x, y, z, vx: vx + (r() - 0.5) * 8, vy: 6 + r() * 6, vz: vz + (r() - 0.5) * 8, life: 2.4 + r(), size: 10, grow: 15, r: 0.75, g: 0.75, b: 0.75, a: 0.5, gravity: -1, drag: 0.8 });
      break;
    case "bigsmoke":
      smoke.add({ x: x + (r() - 0.5) * 30, y, z: z + (r() - 0.5) * 30, vx: (r() - 0.5) * 20, vy: 4 + r() * 8, vz: (r() - 0.5) * 20, life: 6 + r() * 2, size: 30, grow: 12, r: 0.82, g: 0.82, b: 0.85, a: 0.65, gravity: -0.5, drag: 0.6 });
      break;
    case "flash":
      glow.add({ x, y, z, vx: vx * 0.3, vy: 2, vz: vz * 0.3, life: 0.14, size: 22, grow: 40, r: 1.6, g: 0.9, b: 0.35, a: 1, gravity: 0 });
      break;
    case "splash":
      smoke.add({ x: x + (r() - 0.5) * 6, y, z: z + (r() - 0.5) * 6, vx: (r() - 0.5) * 30, vy: 34 + r() * 44, vz: (r() - 0.5) * 30, life: 0.9, size: 5 + r() * 4, grow: 4, r: 0.86, g: 0.93, b: 0.96, a: 0.85, gravity: 95 });
      break;
    case "debris":
      smoke.add({ x, y, z, vx: (r() - 0.5) * 70, vy: 20 + r() * 40, vz: (r() - 0.5) * 70, life: 1.3, size: 2.5 + r() * 2, grow: 0, r: 0.33, g: 0.21, b: 0.11, a: 1, gravity: 120 });
      break;
    case "fire":
      glow.add({ x: x + (r() - 0.5) * 16, y, z: z + (r() - 0.5) * 16, vx: (r() - 0.5) * 16, vy: 14 + r() * 20, vz: (r() - 0.5) * 16, life: 0.7 + r() * 0.6, size: 10, grow: 6, r: 1.6, g: 0.55 + r() * 0.3, b: 0.12, a: 0.9, gravity: -6 });
      break;
    case "gold":
      glow.add({ x, y, z, vx: (r() - 0.5) * 40, vy: 30 + r() * 30, vz: (r() - 0.5) * 40, life: 1, size: 4, grow: 0, r: 1.6, g: 1.2, b: 0.3, a: 1, gravity: 60 });
      break;
    case "wake":
      smoke.add({ x: x + (r() - 0.5) * 4, y: y + 0.5, z: z + (r() - 0.5) * 4, vx: vx + (r() - 0.5) * 6, vy: 0, vz: vz + (r() - 0.5) * 6, life: 2.5 + r(), size: 6, grow: 7, r: 0.85, g: 0.92, b: 0.95, a: 0.4, gravity: 0, drag: 1.2 });
      break;
    case "spray":
      smoke.add({ x, y, z, vx: vx + (r() - 0.5) * 20, vy: 18 + r() * 18, vz: vz + (r() - 0.5) * 20, life: 0.7, size: 3 + r() * 3, grow: 3, r: 0.9, g: 0.95, b: 1, a: 0.6, gravity: 60 });
      break;
    case "dust":
      smoke.add({ x: x + (r() - 0.5) * 4, y: y + 1, z: z + (r() - 0.5) * 4, vx: (r() - 0.5) * 10, vy: 4 + r() * 4, vz: (r() - 0.5) * 10, life: 0.8, size: 3, grow: 5, r: 0.78, g: 0.68, b: 0.5, a: 0.4, gravity: 0 });
      break;
    case "spark":
      glow.add({ x, y, z, vx: (r() - 0.5) * 80, vy: 10 + r() * 50, vz: (r() - 0.5) * 80, life: 0.35, size: 2, grow: 0, r: 2, g: 1.6, b: 0.8, a: 1, gravity: 100 });
      break;
    case "blood":
      smoke.add({ x, y, z, vx: (r() - 0.5) * 40, vy: 10 + r() * 30, vz: (r() - 0.5) * 40, life: 0.5, size: 2, grow: 0, r: 0.6, g: 0.05, b: 0.05, a: 0.9, gravity: 90 });
      break;
    case "steam":
      smoke.add({ x: x + (r() - 0.5) * 8, y, z: z + (r() - 0.5) * 8, vx: 0, vy: 10 + r() * 8, vz: 0, life: 1.5, size: 6, grow: 8, r: 0.9, g: 0.9, b: 0.92, a: 0.35, gravity: -2 });
      break;
  }
}

/** Short-lived 3D effects: lightning bolts, shockwave rings, stretching arms. */
export class Effects {
  group = new THREE.Group();
  private items: { obj: THREE.Object3D; life: number; max: number; update: (k: number) => void }[] = [];

  lightning(x: number, y: number, z: number, tx: number, ty: number, tz: number) {
    const pts: number[] = [];
    const segs = 14;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const jitter = i === 0 || i === segs ? 0 : 14;
      pts.push(x + (tx - x) * t + (Math.random() - 0.5) * jitter, y + (ty - y) * t, z + (tz - z) * t + (Math.random() - 0.5) * jitter);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(3, 3.5, 5), transparent: true, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat);
    this.add(line, 0.3, (k) => (mat.opacity = 1 - k));
  }

  ring(x: number, y: number, z: number, radius: number, color: string, duration = 0.8) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    this.add(mesh, duration, (k) => {
      const s = radius * (0.1 + 0.9 * k);
      mesh.scale.set(s, s, s);
      mat.opacity = 1 - k;
    });
  }

  stretch(x: number, y: number, z: number, tx: number, tz: number) {
    const len = Math.hypot(tx - x, tz - z);
    const mat = new THREE.MeshStandardMaterial({ color: "#d9a17a" });
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6), mat);
    arm.rotation.z = Math.PI / 2;
    const pivot = new THREE.Group();
    pivot.add(arm);
    pivot.position.set(x, y, z);
    pivot.rotation.y = -Math.atan2(tz - z, tx - x);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), mat);
    pivot.add(fist);
    this.add(pivot, 0.28, (k) => {
      const ext = Math.sin(k * Math.PI) * len;
      arm.scale.set(1, Math.max(0.01, ext), 1);
      arm.position.x = ext / 2;
      fist.position.x = ext;
    });
  }

  private add(obj: THREE.Object3D, life: number, update: (k: number) => void) {
    this.group.add(obj);
    this.items.push({ obj, life, max: life, update });
    update(0);
  }

  update(dt: number) {
    this.items = this.items.filter((it) => {
      it.life -= dt;
      if (it.life <= 0) {
        this.group.remove(it.obj);
        it.obj.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
        return false;
      }
      it.update(1 - it.life / it.max);
      return true;
    });
  }
}
