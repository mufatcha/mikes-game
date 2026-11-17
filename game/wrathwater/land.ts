/** Islands in 3D: terrain matching world.ts heights, palms, rocks, towns and the haven. */
import * as THREE from "three";
import { buildPerson, canvasTexture, sailTexture } from "./models";
import { BEACH_TOP, hillProfile, type Building, type Island } from "./world";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sandTexture() {
  return canvasTexture("sand", 256, 256, (g) => {
    g.fillStyle = "#c9b085";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? "rgba(120,95,60,0.15)" : "rgba(255,245,220,0.15)";
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
  });
}

function grassTexture() {
  return canvasTexture("grass", 256, 256, (g) => {
    g.fillStyle = "#3d6b35";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4000; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.4 ? "rgba(20,50,20,0.25)" : v < 0.8 ? "rgba(110,150,70,0.2)" : "rgba(160,140,80,0.2)";
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
    }
  });
}

const repeat = (t: THREE.Texture, n: number) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(n, n);
  return t;
};

/** Materials and shapes every island shares (made once, never thrown away). */
let shared: ReturnType<typeof makeShared> | null = null;
function makeShared() {
  const trunkGeo = new THREE.CylinderGeometry(1.2, 1.7, 1, 7);
  const frondGeo = new THREE.PlaneGeometry(1, 1, 1, 4);
  frondGeo.rotateX(-Math.PI / 2);
  frondGeo.translate(0, 0, 0.5);
  // Droop the fronds.
  const fp = frondGeo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < fp.count; i++) fp.setY(i, -Math.pow(fp.getZ(i), 2) * 0.5);
  frondGeo.computeVertexNormals();
  return {
    sand: new THREE.MeshStandardMaterial({ map: repeat(sandTexture(), 6), roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ map: repeat(grassTexture(), 5), roughness: 1 }),
    rockMat: new THREE.MeshStandardMaterial({ color: "#5d6066", roughness: 1, flatShading: true }),
    trunkMat: new THREE.MeshStandardMaterial({ color: "#6b4c2e", roughness: 1 }),
    leafMat: new THREE.MeshStandardMaterial({ color: "#3a7a3a", roughness: 0.9, side: THREE.DoubleSide }),
    trunkGeo,
    frondGeo,
    rockGeo: new THREE.DodecahedronGeometry(1, 1),
  };
}

/**
 * One island in 3D: beach, hill, palms, rocks, buildings and extras. The
 * renderer builds an island when you sail near it and throws it away when
 * you're far off (see disposeIsland), so only what you can see is loaded.
 */
export function buildIsland(isl: Island): THREE.Group {
  shared ??= makeShared();
  const { sand, grass, rockMat, trunkMat, leafMat, trunkGeo, frondGeo, rockGeo } = shared;
  const group = new THREE.Group();
  group.name = `island-${isl.index}`;

  const trunks: THREE.Matrix4[] = [];
  const fronds: THREE.Matrix4[] = [];
  const rocks: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  {
    const R = isl.radius;
    // Beach: a lathe whose profile matches world.ts (flat top at BEACH_TOP, sloping into the sea).
    const beachPts = [
      new THREE.Vector2(R * 1.12, -26),
      new THREE.Vector2(R * 1.02, -4),
      new THREE.Vector2(R, 0),
      new THREE.Vector2(R * 0.93, BEACH_TOP * 0.55),
      new THREE.Vector2(R * 0.86, BEACH_TOP),
      new THREE.Vector2(0.01, BEACH_TOP),
    ];
    const beach = new THREE.Mesh(new THREE.LatheGeometry(beachPts, 64), sand);
    beach.position.set(isl.x, 0, isl.z);
    group.add(beach);

    // Hill: the same cosine dome the physics uses, a touch above so it doesn't flicker with the beach.
    const hp: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const r = isl.hill.r * (1 - i / 16);
      hp.push(new THREE.Vector2(Math.max(0.01, r), hillProfile(isl.hill.h, isl.hill.r, r) + 0.15));
    }
    // A volcano is bare black rock; everywhere else is grass.
    const hill = new THREE.Mesh(new THREE.LatheGeometry(hp, 48), isl.kind === "volcano" ? volcanicRock() : grass);
    if (isl.kind === "volcano") group.add(buildCrater(isl));
    if (isl.kind === "tribe") group.add(buildTotem(isl));
    hill.position.set(isl.hill.x, 0, isl.hill.z);
    group.add(hill);

    for (const p of isl.palms) {
      const base = groundY(isl, p.x, p.z);
      // Curved trunk: three stacked, leaning segments.
      let px = p.x;
      let pz = p.z;
      let py = base;
      const seg = p.h / 3;
      for (let k = 0; k < 3; k++) {
        const lean = p.lean * (0.6 + k * 0.4);
        e.set(Math.sin(p.turn) * lean, 0, Math.cos(p.turn) * lean);
        q.setFromEuler(e);
        v.set(0, seg / 2, 0).applyQuaternion(q);
        m.compose(new THREE.Vector3(px + v.x, py + v.y, pz + v.z), q, sc.set(1 - k * 0.15, seg, 1 - k * 0.15));
        trunks.push(m.clone());
        px += v.x * 2;
        py += v.y * 2;
        pz += v.z * 2;
      }
      for (let k = 0; k < 7; k++) {
        e.set(0.75 + (k % 2) * 0.25, (k / 7) * Math.PI * 2 + p.turn, 0, "YXZ");
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(px, py, pz), q, sc.set(6, 1, 20));
        fronds.push(m.clone());
      }
    }
    for (const rk of isl.rocks) {
      const r = rng(Math.floor(rk.x * 7 + rk.z * 13));
      e.set(r() * 3, r() * 3, r() * 3);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(rk.x, -2, rk.z), q, sc.set(rk.s, rk.s * 0.75, rk.s));
      rocks.push(m.clone());
    }
    for (const b of isl.buildings) group.add(buildBuilding(b, isl));
    if (isl.kind === "town") group.add(buildTownExtras(isl));
    if (isl.kind === "fortress") group.add(buildFortressExtras(isl));
    if (isl.haven) group.add(buildHavenExtras(isl));
    if (isl.questGiver) group.add(buildQuestGiver(isl));
  }

  for (const [geo, mat, list] of [
    [trunkGeo, trunkMat, trunks],
    [frondGeo, leafMat, fronds],
    [rockGeo, rockMat, rocks],
  ] as const) {
    if (!list.length) continue;
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mat4, i) => inst.setMatrixAt(i, mat4));
    group.add(inst);
  }
  return group;
}

let rockCache: THREE.MeshStandardMaterial | null = null;
function volcanicRock() {
  rockCache ??= new THREE.MeshStandardMaterial({ color: "#2a2422", roughness: 1, flatShading: true });
  return rockCache;
}

/** Free an island built by buildIsland (its own shapes and materials; shared ones and textures stay). */
export function disposeIsland(g: THREE.Group) {
  const keep = shared ? new Set<unknown>([shared.sand, shared.grass, shared.rockMat, shared.trunkMat, shared.leafMat, shared.trunkGeo, shared.frondGeo, shared.rockGeo, windowMat, doorMat, lampMat, rockCache]) : new Set();
  g.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) {
      o.dispose();
      return;
    }
    if (!(o instanceof THREE.Mesh)) return;
    if (!keep.has(o.geometry)) o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!keep.has(m)) m.dispose();
  });
}

function groundY(isl: Island, x: number, z: number) {
  const dh = Math.hypot(x - isl.hill.x, z - isl.hill.z);
  const hill = dh < isl.hill.r ? hillProfile(isl.hill.h, isl.hill.r, dh) : 0;
  return Math.max(BEACH_TOP, hill);
}

// ---------------------------------------------------------------- buildings

const WALL_COLORS = ["#e8dcc4", "#d9c6a5", "#c7d4dc", "#e3c9b4", "#d6dccb"];

function signTexture(text: string, bg: string) {
  return canvasTexture(`sign-${text}`, 256, 64, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = "#e5c07b";
    g.lineWidth = 6;
    g.strokeRect(3, 3, 250, 58);
    g.fillStyle = "#fef3c7";
    // Shrink long names until they fit the board.
    let size = 38;
    do g.font = `bold ${size--}px Georgia, serif`;
    while (g.measureText(text).width > 228 && size > 14);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 128, 34);
  });
}

const windowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.65) });
const doorMat = new THREE.MeshStandardMaterial({ color: "#3b2414", roughness: 0.9 });
const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.5, 0.6) });

/** A tribal hut: round walls of woven reeds under a tall thatched cone. */
function buildHut(b: Building) {
  const g = new THREE.Group();
  const r = Math.min(b.w, b.d) / 2;
  const walls = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, b.h * 0.6, 12), new THREE.MeshStandardMaterial({ color: "#a07a4a", roughness: 1 }));
  walls.position.set(b.x, b.y + b.h * 0.3, b.z);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.25, b.h * 0.75, 12), new THREE.MeshStandardMaterial({ color: "#c2a35a", roughness: 1, flatShading: true }));
  roof.position.set(b.x, b.y + b.h * 0.6 + b.h * 0.37, b.z);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(9, 16), doorMat);
  door.position.set(b.x + Math.cos(b.facing) * (r * 0.97), b.y + 8, b.z + Math.sin(b.facing) * (r * 0.97));
  door.rotation.y = Math.PI / 2 - b.facing;
  g.add(walls, roof, door);
  return g;
}

/** The tribe's totem in the middle of the village, with a bonfire. */
function buildTotem(isl: Island) {
  const g = new THREE.Group();
  const y = groundY(isl, isl.x, isl.z);
  const colors = ["#7c2d12", "#15803d", "#facc15", "#1d4ed8", "#7c2d12"];
  colors.forEach((c, i) => {
    const block = new THREE.Mesh(new THREE.BoxGeometry(7, 9, 7), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
    block.position.set(isl.x, y + 4.5 + i * 9, isl.z);
    block.rotation.y = i * 0.4;
    g.add(block);
  });
  const wings = new THREE.Mesh(new THREE.BoxGeometry(26, 3, 4), new THREE.MeshStandardMaterial({ color: "#b45309" }));
  wings.position.set(isl.x, y + 40, isl.z);
  g.add(wings);
  const fire = new THREE.Mesh(new THREE.ConeGeometry(4, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.3, 0.3) }));
  fire.position.set(isl.x + 26, y + 4, isl.z);
  g.add(fire);
  return g;
}

/** The volcano's glowing crater. */
function buildCrater(isl: Island) {
  const top = hillProfile(isl.hill.h, isl.hill.r, 0);
  const lava = new THREE.Mesh(new THREE.CylinderGeometry(isl.hill.r * 0.12, isl.hill.r * 0.16, 8, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.0, 0.15) }));
  lava.position.set(isl.hill.x, top - 2, isl.hill.z);
  return lava;
}

function buildBuilding(b: Building, isl: Island): THREE.Group {
  if (b.kind === "hut") return buildHut(b);
  const g = new THREE.Group();
  const r = rng(Math.floor(b.x * 31 + b.z * 17));
  const wallColor =
    b.kind === "vault"
      ? "#3a3d42"
      : b.kind === "bank"
      ? "#cfd2d6"
      : b.kind === "armory" || b.kind === "blacksmith"
        ? "#6b6f76"
        : b.kind === "tavern" || b.kind === "shipwright"
          ? "#8b6a48"
          : b.kind === "market"
            ? "#3f3a4a"
            : WALL_COLORS[Math.floor(r() * WALL_COLORS.length)];
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(b.w, b.h + 10, b.d),
    new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 }),
  );
  walls.position.set(b.x, b.y + (b.h - 10) / 2, b.z);
  g.add(walls);

  // The vault is a stone keep: flat top, battlements, no gabled roof.
  if (b.kind === "vault") return buildVault(b, g, walls);

  // Gabled roof along the longer side.
  const along = b.w >= b.d;
  const span = along ? b.d : b.w;
  const len = along ? b.w : b.d;
  const tri = new THREE.Shape();
  tri.moveTo(-span / 2 - 2, 0);
  tri.lineTo(0, span * 0.45);
  tri.lineTo(span / 2 + 2, 0);
  tri.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: len + 4, bevelEnabled: false });
  roofGeo.translate(0, 0, -(len + 4) / 2);
  if (along) roofGeo.rotateY(Math.PI / 2);
  const roofColor = b.kind === "bank" ? "#334155" : b.kind === "armory" ? "#27272a" : r() < 0.5 ? "#8b2e1f" : "#5a3a24";
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8, flatShading: true }));
  roof.position.set(b.x, b.y + b.h, b.z);
  g.add(roof);

  // Door, windows and a sign on the side facing the shore.
  const fx = Math.cos(b.facing);
  const fz = Math.sin(b.facing);
  const xFacing = Math.abs(fx) > Math.abs(fz);
  const sign = xFacing ? Math.sign(fx) : Math.sign(fz);
  const faceOffset = (xFacing ? b.w : b.d) / 2 + 0.2;
  const rotY = xFacing ? (sign > 0 ? Math.PI / 2 : -Math.PI / 2) : sign > 0 ? 0 : Math.PI;
  const face = (w: number, h: number, mat: THREE.Material, lateral: number, y: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.rotation.y = rotY;
    if (xFacing) mesh.position.set(b.x + sign * faceOffset, b.y + y, b.z + lateral);
    else mesh.position.set(b.x + lateral, b.y + y, b.z + sign * faceOffset);
    g.add(mesh);
  };
  // A door you can walk through: wider and taller than a person (who stands about 19).
  face(11, 23, doorMat, 0, 11.5);
  const width = xFacing ? b.d : b.w;
  // Windows on two floors.
  for (const lat of [-width * 0.3, width * 0.3]) {
    face(7, 7, windowMat, lat, 13);
    if (b.h > 30) face(7, 7, windowMat, lat, b.h * 0.72);
  }
  if (b.kind !== "house") {
    const label = { bank: "BANK", shop: "SHOP", armory: "ARMORY", tavern: "TAVERN", shipwright: "SHIPWRIGHT", blacksmith: "BLACKSMITH", market: "BLACK MARKET", vault: "RESTRICTED" }[b.kind];
    const bg = { bank: "#1e3a5f", shop: "#7c2d12", armory: "#27272a", tavern: "#4a2c17", shipwright: "#1f3d2b", blacksmith: "#3f1d1d", market: "#2e1065", vault: "#450a0a" }[b.kind];
    face(label.length > 8 ? 40 : 30, 7.5, new THREE.MeshBasicMaterial({ map: signTexture(label, bg) }), 0, 28);
  }
  if (b.kind === "bank") {
    // Columns either side of the vault door.
    for (const lat of [-11, 11]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, b.h, 10), new THREE.MeshStandardMaterial({ color: "#e5e7eb" }));
      if (xFacing) col.position.set(b.x + sign * (faceOffset + 3), b.y + b.h / 2, b.z + lat);
      else col.position.set(b.x + lat, b.y + b.h / 2, b.z + sign * (faceOffset + 3));
      g.add(col);
    }
  }
  void isl;
  return g;
}

const stoneMat = new THREE.MeshStandardMaterial({ color: "#45484e", roughness: 0.95 });
const ironMat = new THREE.MeshStandardMaterial({ color: "#1c1c1f", metalness: 0.6, roughness: 0.5 });

/** Battlements along the top edge of a box (crenels every few units). */
function crenellate(g: THREE.Group, cx: number, top: number, cz: number, w: number, d: number) {
  const block = new THREE.BoxGeometry(6, 7, 6);
  const edge = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 12));
    for (let i = 0; i <= n; i++) {
      const m = new THREE.Mesh(block, stoneMat);
      m.position.set(x0 + ((x1 - x0) * i) / n, top + 3.5, z0 + ((z1 - z0) * i) / n);
      g.add(m);
    }
  };
  const hw = w / 2 - 3, hd = d / 2 - 3;
  edge(cx - hw, cz - hd, cx + hw, cz - hd);
  edge(cx - hw, cz + hd, cx + hw, cz + hd);
  edge(cx - hw, cz - hd, cx - hw, cz + hd);
  edge(cx + hw, cz - hd, cx + hw, cz + hd);
}

/** The vault at Ironmaw Bastion: a squat stone keep with a barred iron door and corner towers. */
function buildVault(b: Building, g: THREE.Group, walls: THREE.Mesh) {
  walls.material = stoneMat;
  const top = b.y + b.h;
  crenellate(g, b.x, top, b.z, b.w, b.d);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tx = b.x + (sx * b.w) / 2, tz = b.z + (sz * b.d) / 2;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, b.h + 26, 12), stoneMat);
    tower.position.set(tx, b.y + (b.h + 26) / 2 - 5, tz);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(14, 18, 12), new THREE.MeshStandardMaterial({ color: "#450a0a", roughness: 0.8 }));
    cap.position.set(tx, b.y + b.h + 30, tz);
    g.add(tower, cap);
  }
  const fx = Math.cos(b.facing), fz = Math.sin(b.facing);
  const xFacing = Math.abs(fx) > Math.abs(fz);
  const sign = xFacing ? Math.sign(fx) : Math.sign(fz);
  const off = (xFacing ? b.w : b.d) / 2 + 0.3;
  const rotY = xFacing ? (sign > 0 ? Math.PI / 2 : -Math.PI / 2) : sign > 0 ? 0 : Math.PI;
  const face = (w: number, h: number, mat: THREE.Material, lateral: number, y: number, out = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.rotation.y = rotY;
    if (xFacing) m.position.set(b.x + sign * (off + out), b.y + y, b.z + lateral);
    else m.position.set(b.x + lateral, b.y + y, b.z + sign * (off + out));
    g.add(m);
  };
  // A huge iron door with bars, and the warning sign above it.
  face(18, 28, ironMat, 0, 14);
  for (let i = -3; i <= 3; i++) face(1.2, 28, new THREE.MeshStandardMaterial({ color: "#71717a", metalness: 0.8 }), i * 2.6, 14, 0.2);
  face(40, 7.5, new THREE.MeshBasicMaterial({ map: signTexture("RESTRICTED", "#450a0a") }), 0, 36);
  return g;
}

/** Ironmaw Bastion: a stone wall ring with watchtowers and the Marine flag. */
function buildFortressExtras(isl: Island) {
  const g = new THREE.Group();
  // Out at the island's edge, so you land inside it.
  const R = isl.radius * 0.95;
  const towers = 12;
  for (let i = 0; i < towers; i++) {
    const a = (i / towers) * Math.PI * 2;
    const x = isl.x + Math.cos(a) * R, z = isl.z + Math.sin(a) * R;
    const y = groundY(isl, x, z);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(10, 12, 60, 10), stoneMat);
    t.position.set(x, y + 25, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), lampMat);
    lamp.position.set(x, y + 60, z);
    g.add(t, lamp);
    // Wall to the next tower, with two sea gates and nothing in front of a door.
    if (i % 6 === 0) continue;
    const a2 = ((i + 1) / towers) * Math.PI * 2;
    const x2 = isl.x + Math.cos(a2) * R, z2 = isl.z + Math.sin(a2) * R;
    if (isl.buildings.some((b) => Math.hypot(b.door.x - (x + x2) / 2, b.door.z - (z + z2) / 2) < 110)) continue;
    const len = Math.hypot(x2 - x, z2 - z);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 34, 6), stoneMat);
    wall.position.set((x + x2) / 2, y + 12, (z + z2) / 2);
    wall.rotation.y = -Math.atan2(z2 - z, x2 - x);
    g.add(wall);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 110, 6), new THREE.MeshStandardMaterial({ color: "#d1d5db" }));
  pole.position.set(isl.x, BEACH_TOP + 55, isl.z);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(40, 22), new THREE.MeshStandardMaterial({ map: sailTexture("marine"), side: THREE.DoubleSide }));
  flag.position.set(isl.x + 20, BEACH_TOP + 98, isl.z);
  g.add(pole, flag);
  return g;
}

/** Someone outside the tavern with work for you: a sailor under a glowing "!". */
function buildQuestGiver(isl: Island) {
  const q = isl.questGiver!;
  const p = buildPerson("sailor");
  p.group.position.set(q.x, groundY(isl, q.x, q.z), q.z);
  p.group.rotation.y = -q.facing;
  p.armR.rotation.z = 1.2;
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.9, 0.3) });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4, 1.2), glow);
  bar.position.y = 25;
  const dot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), glow);
  dot.position.y = 21.8;
  p.group.add(bar, dot);
  return p.group;
}

function lampPost(x: number, y: number, z: number) {
  const g = new THREE.Group();
  // A street lamp a bit taller than a person.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 26, 6), new THREE.MeshStandardMaterial({ color: "#1f1f1f" }));
  post.position.set(x, y + 13, z);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), lampMat);
  lamp.position.set(x, y + 26.5, z);
  g.add(post, lamp);
  return g;
}

function buildTownExtras(isl: Island) {
  const g = new THREE.Group();
  // Marine flag over the town.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 70, 6), new THREE.MeshStandardMaterial({ color: "#d1d5db" }));
  pole.position.set(isl.x, BEACH_TOP + 35, isl.z);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(28, 16), new THREE.MeshStandardMaterial({ map: sailTexture("marine"), side: THREE.DoubleSide }));
  flag.position.set(isl.x + 14, BEACH_TOP + 62, isl.z);
  g.add(pole, flag);
  for (const b of isl.buildings) g.add(lampPost(b.door.x + 8, groundY(isl, b.door.x + 8, b.door.z), b.door.z));
  // A pier, long enough to tie up a ship.
  const pier = new THREE.Mesh(new THREE.BoxGeometry(170, 3, 26), new THREE.MeshStandardMaterial({ color: "#5a3f28", roughness: 1 }));
  pier.position.set(isl.x + isl.radius + 70, 4, isl.z + 20);
  g.add(pier);
  return g;
}

/** Blackwater Cove's dock, lanterns and its huge black flag. */
function buildHavenExtras(isl: Island) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: "#4a3422", roughness: 1 });
  const dockLen = 130;
  const dock = new THREE.Mesh(new THREE.BoxGeometry(dockLen, 2, 18), wood);
  dock.position.set(isl.x + isl.radius + dockLen / 2 - 30, 5, isl.z - 40);
  g.add(dock);
  for (let i = 0; i < 6; i++) {
    const x = isl.x + isl.radius - 20 + i * 22;
    const z = isl.z - 40 + (i % 2 ? 9 : -9);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 16, 5), wood);
    post.position.set(x, 0, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), lampMat);
    lamp.position.set(x, 10, z);
    g.add(post, lamp);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 110, 6), wood);
  pole.position.set(isl.x, 60, isl.z);
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(50, 30), new THREE.MeshStandardMaterial({ map: sailTexture("player"), side: THREE.DoubleSide }));
  flag.position.set(isl.x + 25, 100, isl.z);
  g.add(flag);
  for (const b of isl.buildings) g.add(lampPost(b.door.x + 6, groundY(isl, b.door.x + 6, b.door.z), b.door.z));
  // (The haven's warm dock light lives in the renderer, so adding and removing the island doesn't rebuild every shader.)
  return g;
}
