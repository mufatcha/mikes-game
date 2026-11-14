/** Islands in 3D: terrain matching world.ts heights, palms, rocks, towns and the haven. */
import * as THREE from "three";
import { canvasTexture, sailTexture } from "./models";
import { BEACH_TOP, ISLANDS, hillProfile, type Building, type Island } from "./world";

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

/** All islands as one group. Static, built once. */
export function buildIslands(): THREE.Group {
  const group = new THREE.Group();
  const sand = new THREE.MeshStandardMaterial({ map: repeat(sandTexture(), 6), roughness: 1 });
  const grass = new THREE.MeshStandardMaterial({ map: repeat(grassTexture(), 5), roughness: 1 });
  const rockMat = new THREE.MeshStandardMaterial({ color: "#5d6066", roughness: 1, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#6b4c2e", roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: "#3a7a3a", roughness: 0.9, side: THREE.DoubleSide });

  const trunks: THREE.Matrix4[] = [];
  const fronds: THREE.Matrix4[] = [];
  const rocks: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  for (const isl of ISLANDS) {
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
    const hill = new THREE.Mesh(new THREE.LatheGeometry(hp, 48), grass);
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
    if (isl.haven) group.add(buildHavenExtras(isl));
  }

  const trunkGeo = new THREE.CylinderGeometry(1.2, 1.7, 1, 7);
  const frondGeo = new THREE.PlaneGeometry(1, 1, 1, 4);
  frondGeo.rotateX(-Math.PI / 2);
  frondGeo.translate(0, 0, 0.5);
  // Droop the fronds.
  const fp = frondGeo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < fp.count; i++) fp.setY(i, -Math.pow(fp.getZ(i), 2) * 0.5);
  frondGeo.computeVertexNormals();
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  for (const [geo, mat, list] of [
    [trunkGeo, trunkMat, trunks],
    [frondGeo, leafMat, fronds],
    [rockGeo, rockMat, rocks],
  ] as const) {
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mat4, i) => inst.setMatrixAt(i, mat4));
    group.add(inst);
  }
  return group;
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

function buildBuilding(b: Building, isl: Island): THREE.Group {
  const g = new THREE.Group();
  const r = rng(Math.floor(b.x * 31 + b.z * 17));
  const wallColor =
    b.kind === "bank"
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
  face(6, 10, doorMat, 0, 5);
  const width = xFacing ? b.d : b.w;
  for (const lat of [-width * 0.3, width * 0.3]) face(3.5, 3.5, windowMat, lat, b.h * 0.55);
  if (b.kind !== "house") {
    const label = { bank: "BANK", shop: "SHOP", armory: "ARMORY", tavern: "TAVERN", shipwright: "SHIPWRIGHT", blacksmith: "BLACKSMITH", market: "BLACK MARKET" }[b.kind];
    const bg = { bank: "#1e3a5f", shop: "#7c2d12", armory: "#27272a", tavern: "#4a2c17", shipwright: "#1f3d2b", blacksmith: "#3f1d1d", market: "#2e1065" }[b.kind];
    face(label.length > 8 ? 22 : 16, 4, new THREE.MeshBasicMaterial({ map: signTexture(label, bg) }), 0, 12.5);
  }
  if (b.kind === "bank") {
    // Columns either side of the vault door.
    for (const lat of [-6, 6]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, b.h, 10), new THREE.MeshStandardMaterial({ color: "#e5e7eb" }));
      if (xFacing) col.position.set(b.x + sign * (faceOffset + 2), b.y + b.h / 2, b.z + lat);
      else col.position.set(b.x + lat, b.y + b.h / 2, b.z + sign * (faceOffset + 2));
      g.add(col);
    }
  }
  void isl;
  return g;
}

function lampPost(x: number, y: number, z: number) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 14, 6), new THREE.MeshStandardMaterial({ color: "#1f1f1f" }));
  post.position.set(x, y + 7, z);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), lampMat);
  lamp.position.set(x, y + 14.5, z);
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
  // A small pier.
  const pier = new THREE.Mesh(new THREE.BoxGeometry(90, 2, 14), new THREE.MeshStandardMaterial({ color: "#5a3f28", roughness: 1 }));
  pier.position.set(isl.x + isl.radius + 30, 4, isl.z + 20);
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
  const light = new THREE.PointLight("#ffa040", 3, 900, 1.2);
  light.position.set(isl.x + isl.radius, 60, isl.z);
  g.add(light);
  return g;
}
