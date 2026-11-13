import { MAP_HEIGHT, MAP_WIDTH, TARDIS_INSIDE } from "@/shared/map";
import { GLOW, PPU, SURFACE_HEIGHT, TEX_UNITS, ceilingTexel, floorTexel, wallTexture, wallVariant } from "./schooltextures";
import { CEILING_HEIGHT, topColor, worldWalls } from "./firstperson";
import type { VrScene } from "./renderer";
import type { WorldQuad } from "./avatar3d";

/**
 * The school in real 3D for VR, drawn by the graphics chip: every wall and
 * piece of furniture as a textured box (the same textures as the 3D view), the
 * floor and ceiling baked into big textures once, and each frame everyone
 * you can see as 3D figures, the throws in the air, sparks, puddles and name
 * tags. Because it's real 3D, it's sharp at the headset's full resolution and
 * looks right from every angle, straight up and straight down included.
 *
 * Everything is in world units (x and y across the map, z up); the caller
 * gives the matrix that places the world around you in the headset.
 */

type V3 = [number, number, number];
type RGBA = [number, number, number, number];

const VERT = `attribute vec3 p; attribute vec2 uv; attribute vec4 c;
uniform mat4 P; uniform mat4 V; uniform mat4 M;
varying vec2 vuv; varying vec4 vc; varying vec3 wp;
void main() { vuv = uv; vc = c; wp = p; gl_Position = P * V * M * vec4(p, 1.0); }`;
const FRAG = `precision highp float;
varying vec2 vuv; varying vec4 vc; varying vec3 wp;
uniform sampler2D t; uniform vec3 eye; uniform vec3 fogColor; uniform float fogDist; uniform float fogMax;
void main() {
  vec4 col = texture2D(t, vuv) * vc;
  if (col.a < 0.02) discard;
  float f = min(fogMax, length(wp.xy - eye.xy) / fogDist);
  gl_FragColor = vec4(mix(col.rgb, fogColor, f), col.a);
}`;
/** Floats per point: position (3), texture spot (2), color (4). */
const STRIDE = 9;

/** A pile of triangles sharing one texture. */
class Batch {
  data: number[] = [];
  constructor(public tex: WebGLTexture) {}
  quad(a: V3, b: V3, c: V3, d: V3, uv: [number, number, number, number], col: RGBA) {
    // a b c d go around the quad; uv is [u0, v0, u1, v1] for a (u0,v0) -> c (u1,v1).
    const [u0, v0, u1, v1] = uv;
    const pt = (p: V3, u: number, v: number) => this.data.push(p[0], p[1], p[2], u, v, col[0], col[1], col[2], col[3]);
    pt(a, u0, v0);
    pt(b, u1, v0);
    pt(c, u1, v1);
    pt(a, u0, v0);
    pt(c, u1, v1);
    pt(d, u0, v1);
  }
  tri(a: V3, b: V3, c: V3, col: RGBA) {
    for (const p of [a, b, c]) this.data.push(p[0], p[1], p[2], 0.5, 0.5, col[0], col[1], col[2], col[3]);
  }
}

interface Uploaded {
  tex: WebGLTexture;
  buf: WebGLBuffer;
  count: number;
}

const colorCache = new Map<string, V3>();
function rgb(css: string): V3 {
  let c = colorCache.get(css);
  if (!c) {
    const g = document.createElement("canvas").getContext("2d")!;
    g.fillStyle = "#888888";
    g.fillStyle = css;
    const hex = String(g.fillStyle);
    if (hex.startsWith("#") && hex.length === 7) {
      c = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
    } else {
      const m = hex.match(/[\d.]+/g);
      c = m ? [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255] : [0.6, 0.6, 0.6];
    }
    colorCache.set(css, c);
  }
  return c;
}

export class VrWorld {
  private prog: WebGLProgram;
  private loc: {
    P: WebGLUniformLocation | null;
    V: WebGLUniformLocation | null;
    M: WebGLUniformLocation | null;
    eye: WebGLUniformLocation | null;
    fogColor: WebGLUniformLocation | null;
    fogDist: WebGLUniformLocation | null;
    fogMax: WebGLUniformLocation | null;
    p: number;
    uv: number;
    c: number;
  };
  private white: WebGLTexture;
  private textures = new WeakMap<HTMLCanvasElement, WebGLTexture>();
  private staticBatches: Uploaded[] = [];
  private dynBuf: WebGLBuffer;
  private webgl2: boolean;
  /** Name tag canvases, redrawn when what they show changes. */
  private tags = new Map<string, { canvas: HTMLCanvasElement; key: string; tex: WebGLTexture | null }>();

  constructor(private gl: WebGLRenderingContext) {
    this.webgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    this.prog = makeProgram(gl, VERT, FRAG);
    const u = (n: string) => gl.getUniformLocation(this.prog, n);
    this.loc = {
      P: u("P"),
      V: u("V"),
      M: u("M"),
      eye: u("eye"),
      fogColor: u("fogColor"),
      fogDist: u("fogDist"),
      fogMax: u("fogMax"),
      p: gl.getAttribLocation(this.prog, "p"),
      uv: gl.getAttribLocation(this.prog, "uv"),
      c: gl.getAttribLocation(this.prog, "c"),
    };
    this.white = this.rawTexture(1, 1, new Uint8Array([255, 255, 255, 255]), false);
    this.dynBuf = gl.createBuffer()!;
    this.buildStatic();
  }

  // ------------------------------------------------------------ textures

  private rawTexture(w: number, h: number, data: Uint8Array, mips: boolean): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    this.finishTexture(w, h, mips);
    return tex;
  }

  private finishTexture(w: number, h: number, mips: boolean) {
    const gl = this.gl;
    const pot = (n: number) => (n & (n - 1)) === 0;
    const canMip = mips && (this.webgl2 || (pot(w) && pot(h)));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (canMip) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
  }

  /** A canvas as a texture (uploaded once; the textures never change). */
  private canvasTexture(canvas: HTMLCanvasElement): WebGLTexture {
    let tex = this.textures.get(canvas);
    if (!tex) {
      const gl = this.gl;
      tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      this.finishTexture(canvas.width, canvas.height, true);
      this.textures.set(canvas, tex);
    }
    return tex;
  }

  /** Floor or ceiling colors over a rectangle of the map, one texel per `step` units. */
  private bake(x0: number, y0: number, w: number, h: number, step: number, texel: (x: number, y: number) => number) {
    const tw = Math.ceil(w / step);
    const th = Math.ceil(h / step);
    const px = new Uint32Array(tw * th);
    for (let j = 0; j < th; j++) {
      const y = y0 + (j + 0.5) * step;
      for (let i = 0; i < tw; i++) px[j * tw + i] = 0xff000000 | (texel(x0 + (i + 0.5) * step, y) & 0xffffff & ~GLOW);
    }
    return this.rawTexture(tw, th, new Uint8Array(px.buffer), true);
  }

  // ------------------------------------------------------------ the building

  private buildStatic() {
    const batches = new Map<WebGLTexture, Batch>();
    const batchFor = (tex: WebGLTexture) => {
      let b = batches.get(tex);
      if (!b) batches.set(tex, (b = new Batch(tex)));
      return b;
    };
    for (const { wall, surface, index } of worldWalls()) {
      if (wall.kind === "tardis") continue; // it travels: drawn each frame
      this.addBox(batchFor, wall, surface, index);
    }
    // Floor and ceiling: the school, and the TARDIS's console room.
    // One texel per unit, or coarser on the big school so the textures stay a size headsets can hold.
    const step = Math.max(1, Math.ceil(Math.max(MAP_WIDTH, MAP_HEIGHT) / 3000));
    const floor = this.bake(0, 0, MAP_WIDTH, MAP_HEIGHT, step, floorTexel);
    const ceiling = this.bake(0, 0, MAP_WIDTH, MAP_HEIGHT, step, ceilingTexel);
    const ti = TARDIS_INSIDE;
    const tFloor = this.bake(ti.x, ti.y, ti.w, ti.h, 1, floorTexel);
    const tCeiling = this.bake(ti.x, ti.y, ti.w, ti.h, 1, ceilingTexel);
    const flat = (tex: WebGLTexture, x: number, y: number, w: number, h: number, z: number, up: boolean) => {
      const b = batchFor(tex);
      const a: V3 = [x, y, z];
      const bb: V3 = [x + w, y, z];
      const c: V3 = [x + w, y + h, z];
      const d: V3 = [x, y + h, z];
      // Floors face up, ceilings face down (the order doesn't matter: nothing is culled).
      if (up) b.quad(a, bb, c, d, [0, 0, 1, 1], [1, 1, 1, 1]);
      else b.quad(a, bb, c, d, [0, 0, 1, 1], [1, 1, 1, 1]);
    };
    flat(floor, 0, 0, MAP_WIDTH, MAP_HEIGHT, 0, true);
    flat(ceiling, 0, 0, MAP_WIDTH, MAP_HEIGHT, CEILING_HEIGHT, false);
    flat(tFloor, ti.x, ti.y, ti.w, ti.h, 0, true);
    flat(tCeiling, ti.x, ti.y, ti.w, ti.h, CEILING_HEIGHT, false);

    const gl = this.gl;
    for (const b of batches.values()) {
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b.data), gl.STATIC_DRAW);
      this.staticBatches.push({ tex: b.tex, buf, count: b.data.length / STRIDE });
    }
  }

  /** One wall or piece of furniture: its four textured sides, and a top if you can see over it. */
  private addBox(batchFor: (t: WebGLTexture) => Batch, w: { x: number; y: number; w: number; h: number }, surface: keyof typeof SURFACE_HEIGHT, index: number) {
    const H = SURFACE_HEIGHT[surface];
    const units = TEX_UNITS[surface];
    // Each side, running the texture left to right as seen from outside (as the 3D view does).
    const sides: { from: [number, number]; to: [number, number]; len: number; xFace: boolean }[] = [
      { from: [w.x, w.y + w.h], to: [w.x + w.w, w.y + w.h], len: w.w, xFace: false }, // south
      { from: [w.x + w.w, w.y], to: [w.x, w.y], len: w.w, xFace: false }, // north
      { from: [w.x + w.w, w.y + w.h], to: [w.x + w.w, w.y], len: w.h, xFace: true }, // east
      { from: [w.x, w.y], to: [w.x, w.y + w.h], len: w.h, xFace: true }, // west
    ];
    for (const s of sides) {
      const shade = s.xFace ? 0.88 : 1;
      const dx = (s.to[0] - s.from[0]) / s.len;
      const dy = (s.to[1] - s.from[1]) / s.len;
      for (let u0 = 0; u0 < s.len - 0.01; ) {
        const seg = Math.floor(u0 / units + 1e-6);
        const u1 = Math.min(s.len, (seg + 1) * units);
        const variant = surface === "wall" ? wallVariant(index, seg) : "plain";
        const canvas = wallTexture(surface, variant);
        const scale = (units * PPU) / canvas.width;
        const ta = ((u0 - seg * units) / units) * scale;
        const tb = ((u1 - seg * units) / units) * scale;
        const p0x = s.from[0] + dx * u0;
        const p0y = s.from[1] + dy * u0;
        const p1x = s.from[0] + dx * u1;
        const p1y = s.from[1] + dy * u1;
        batchFor(this.canvasTexture(canvas)).quad(
          [p0x, p0y, H],
          [p1x, p1y, H],
          [p1x, p1y, 0],
          [p0x, p0y, 0],
          [ta, 0, tb, 1],
          [shade, shade, shade, 1],
        );
        u0 = u1;
      }
    }
    // The top of furniture you can see over.
    if (H < CEILING_HEIGHT - 1) {
      const c = topColor(surface);
      const col: RGBA = c ? [c[0] / 255, c[1] / 255, c[2] / 255, 1] : [0.33, 0.33, 0.36, 1];
      batchFor(this.white).quad([w.x, w.y, H], [w.x + w.w, w.y, H], [w.x + w.w, w.y + w.h, H], [w.x, w.y + w.h, H], [0, 0, 1, 1], col);
    }
  }

  // ------------------------------------------------------------ each frame

  /**
   * Draw the world for each eye. `M` places world units in the headset; `views`
   * gives each eye's viewport and matrices.
   */
  draw(
    views: readonly { projectionMatrix: Float32Array; transform: { inverse: { matrix: Float32Array } } }[],
    viewport: (i: number) => { x: number; y: number; width: number; height: number } | null,
    scene: VrScene,
    M: Float32Array,
  ) {
    const gl = this.gl;
    // This frame's moving things, by texture: solid, see-through, and seen through walls.
    const solid = new Map<WebGLTexture, Batch>();
    const clear = new Map<WebGLTexture, Batch>();
    const xray = new Map<WebGLTexture, Batch>();
    const into = (m: Map<WebGLTexture, Batch>, tex: WebGLTexture) => {
      let b = m.get(tex);
      if (!b) m.set(tex, (b = new Batch(tex)));
      return b;
    };

    // The TARDIS, wherever it is right now.
    for (const { wall, surface, index } of worldWalls()) {
      if (wall.kind === "tardis") this.addBox((t) => into(solid, t), wall, surface, index);
    }

    // Everyone you can see.
    for (const pl of scene.players) {
      const pulse = pl.targeted ? 0.35 + 0.25 * Math.sin(scene.now / 80) : 0;
      const target = pl.xray && !pl.targeted ? xray : pl.alpha < 1 ? clear : solid;
      this.addQuads(target, pl.model.quads, pl.alpha, pulse);
      if (pl.xray) this.addQuads(xray, pl.model.quads, 0.35, 0.6);
      if (pl.model.ball) {
        const b = pl.model.ball;
        this.addSphere(into(pl.alpha < 1 ? clear : solid, this.white), [b.x, b.y, b.z], b.r, rgb(b.color), pl.alpha);
      }
      // A shadow on the floor.
      this.addDisc(into(clear, this.white), pl.p.x, pl.p.y, 0.4, 15 * (pl.model.top > 70 ? 1.4 : 1), [0, 0, 0, 0.32], 12);
      // Name and health above their head, facing you.
      this.addTag(into, clear, pl, scene);
    }

    // Throws in the air, with shadows so you can judge them.
    for (const b of scene.bullets) {
      this.addSphere(into(solid, this.white), [b.x, b.y, b.z], b.r, rgb(b.color), 1);
      const shade = 0.35 * Math.max(0, 1 - b.z / 90);
      if (shade > 0.02) this.addDisc(into(clear, this.white), b.x, b.y, 0.3, b.r * 1.1, [0, 0, 0, shade], 10);
    }
    // Sparks where things hit.
    for (const s of scene.sparks) {
      const c = rgb(s.color);
      this.addSphere(into(clear, this.white), [s.x, s.y, s.z], Math.max(1.5, s.size * 0.5), c, s.alpha);
    }
    // Jam Puddles and Peel Traps.
    for (const z of scene.zones) {
      const b = into(clear, this.white);
      if (z.k === "jam") {
        this.addDisc(b, z.x, z.y, 0.6, z.r, [202 / 255, 138 / 255, 4 / 255, 0.7], 24);
        this.addDisc(b, z.x, z.y, 0.8, z.r * 0.7, [250 / 255, 204 / 255, 21 / 255, 0.55], 18);
      } else {
        this.addDisc(b, z.x, z.y, 0.6, z.r, [249 / 255, 115 / 255, 22 / 255, 1], 14);
        this.addDisc(b, z.x + 3, z.y - 2, 0.8, z.r * 0.55, [1, 247 / 255, 237 / 255, 0.9], 10);
      }
    }

    gl.useProgram(this.prog);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(this.loc.M, false, M);
    gl.uniform3f(this.loc.eye, scene.x, scene.y, scene.eyeZ);
    gl.uniform3f(this.loc.fogColor, scene.fog.color[0] / 255, scene.fog.color[1] / 255, scene.fog.color[2] / 255);
    gl.uniform1f(this.loc.fogDist, scene.fog.dist);
    gl.uniform1f(this.loc.fogMax, scene.fog.max);
    gl.activeTexture(gl.TEXTURE0);
    gl.enableVertexAttribArray(this.loc.p);
    gl.enableVertexAttribArray(this.loc.uv);
    gl.enableVertexAttribArray(this.loc.c);
    const pointers = () => {
      gl.vertexAttribPointer(this.loc.p, 3, gl.FLOAT, false, STRIDE * 4, 0);
      gl.vertexAttribPointer(this.loc.uv, 2, gl.FLOAT, false, STRIDE * 4, 12);
      gl.vertexAttribPointer(this.loc.c, 4, gl.FLOAT, false, STRIDE * 4, 20);
    };
    // Upload this frame's moving things once, then draw them for each eye.
    const upload = (m: Map<WebGLTexture, Batch>) =>
      [...m.values()].map((b) => ({ tex: b.tex, data: new Float32Array(b.data), count: b.data.length / STRIDE }));
    const dynSolid = upload(solid);
    const dynClear = upload(clear);
    const dynXray = upload(xray);
    const drawDyn = (list: { tex: WebGLTexture; data: Float32Array; count: number }[]) => {
      for (const b of list) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
        gl.bufferData(gl.ARRAY_BUFFER, b.data, gl.STREAM_DRAW);
        pointers();
        gl.bindTexture(gl.TEXTURE_2D, b.tex);
        gl.drawArrays(gl.TRIANGLES, 0, b.count);
      }
    };

    views.forEach((view, i) => {
      const vp = viewport(i);
      if (!vp) return;
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      gl.uniformMatrix4fv(this.loc.P, false, view.projectionMatrix);
      gl.uniformMatrix4fv(this.loc.V, false, view.transform.inverse.matrix);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      for (const b of this.staticBatches) {
        gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
        pointers();
        gl.bindTexture(gl.TEXTURE_2D, b.tex);
        gl.drawArrays(gl.TRIANGLES, 0, b.count);
      }
      drawDyn(dynSolid);
      // See-through things: blended, without hiding what's behind them.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      drawDyn(dynClear);
      // The Intercom: enemies show through walls.
      gl.disable(gl.DEPTH_TEST);
      drawDyn(dynXray);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    });
    gl.disable(gl.DEPTH_TEST);
  }

  /** A figure's faces, optionally see-through and tinted red (Detention, the Intercom). */
  private addQuads(m: Map<WebGLTexture, Batch>, quads: WorldQuad[], alpha: number, red: number) {
    for (const q of quads) {
      const tex = typeof q.look === "string" ? this.white : this.canvasTexture(q.look);
      let b = m.get(tex);
      if (!b) m.set(tex, (b = new Batch(tex)));
      const base: V3 = typeof q.look === "string" ? rgb(q.look) : [1, 1, 1];
      const col: RGBA = [
        (base[0] * (1 - red) + 0.97 * red) * q.light,
        (base[1] * (1 - red) + 0.44 * red) * q.light,
        (base[2] * (1 - red) + 0.44 * red) * q.light,
        alpha,
      ];
      const [tl, tr, br, bl] = q.c;
      b.quad(tl, tr, br, bl, [0, 0, 1, 1], col);
    }
  }

  /** A shaded ball. */
  private addSphere(b: Batch, c: V3, r: number, color: V3, alpha: number) {
    const at = (i: number, j: number): V3 => {
      const th = (i / 6) * Math.PI;
      const ph = (j / 8) * Math.PI * 2;
      return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
    };
    const p = (n: V3): V3 => [c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 8; j++) {
        const n = at(i + 0.5, j + 0.5);
        const light = 0.55 + 0.45 * Math.max(0, n[0] * 0.35 - n[1] * 0.45 + n[2] * 0.82);
        const col: RGBA = [color[0] * light, color[1] * light, color[2] * light, alpha];
        b.tri(p(at(i, j)), p(at(i + 1, j)), p(at(i + 1, j + 1)), col);
        b.tri(p(at(i, j)), p(at(i + 1, j + 1)), p(at(i, j + 1)), col);
      }
    }
  }

  /** A flat disc lying on the floor. */
  private addDisc(b: Batch, x: number, y: number, z: number, r: number, col: RGBA, sides: number) {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      b.tri([x, y, z], [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z], col);
    }
  }

  /** A name and health bar floating over a player, turned to face you. */
  private addTag(
    into: (m: Map<WebGLTexture, Batch>, t: WebGLTexture) => Batch,
    clear: Map<WebGLTexture, Batch>,
    pl: VrScene["players"][number],
    scene: VrScene,
  ) {
    const p = pl.p;
    const frac = Math.max(0, Math.min(1, p.hp / p.maxHp));
    const effects = `${p.stunned ? "⭐" : ""}${p.burning ? "🔥" : ""}${p.jailed > 0 ? "🔒" : ""}${p.protected || p.shielded ? "🛡️" : ""}`;
    const key = `${pl.name}|${Math.round(frac * 40)}|${pl.team}|${effects}`;
    let tag = this.tags.get(p.id);
    if (!tag) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      tag = { canvas, key: "", tex: null };
      this.tags.set(p.id, tag);
    }
    const gl = this.gl;
    if (tag.key !== key) {
      tag.key = key;
      const g = tag.canvas.getContext("2d")!;
      g.clearRect(0, 0, 256, 64);
      g.font = "bold 26px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "rgba(0,0,0,0.75)";
      g.fillText(`${effects}${pl.name}`, 129, 20);
      g.fillStyle = pl.team === 0 ? "#fef08a" : "#fed7aa";
      g.fillText(`${effects}${pl.name}`, 128, 19);
      g.fillStyle = "rgba(0,0,0,0.6)";
      g.fillRect(48, 42, 160, 12);
      g.fillStyle = frac > 0.5 ? "#4ade80" : frac > 0.25 ? "#facc15" : "#ef4444";
      g.fillRect(48, 42, 160 * frac, 12);
      if (!tag.tex) tag.tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tag.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tag.canvas);
      this.finishTexture(256, 64, false);
    }
    // Facing you: sideways is across your line of sight.
    let sx = -(p.y - scene.y);
    let sy = p.x - scene.x;
    const l = Math.hypot(sx, sy) || 1;
    sx /= l;
    sy /= l;
    const w = 40;
    const h = 10;
    const z = pl.model.top + 6;
    const b = into(clear, tag.tex!);
    b.quad(
      [p.x - sx * (w / 2), p.y - sy * (w / 2), z + h],
      [p.x + sx * (w / 2), p.y + sy * (w / 2), z + h],
      [p.x + sx * (w / 2), p.y + sy * (w / 2), z],
      [p.x - sx * (w / 2), p.y - sy * (w / 2), z],
      [0, 0, 1, 1],
      [1, 1, 1, 1],
    );
  }
}

function makeProgram(gl: WebGLRenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
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
