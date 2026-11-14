/** 3D models for Wrathwater, built from simple shapes: ships, people, loot. */
import * as THREE from "three";
import type { Faction } from "./data";
import type { Walker, WalkerKind } from "./foot";
import { FRUITS, type FruitId, type WeaponId } from "./items";
import type { Ship } from "./sim";

// ---------------------------------------------------------------- textures

const textureCache = new Map<string, THREE.Texture>();

export function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = textureCache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  textureCache.set(key, t);
  return t;
}

export function drawSkull(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  g.save();
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineCap = "round";
  g.lineWidth = s * 0.16;
  g.beginPath();
  g.moveTo(cx - s, cy + s * 0.2);
  g.lineTo(cx + s, cy + s * 1.2);
  g.moveTo(cx + s, cy + s * 0.2);
  g.lineTo(cx - s, cy + s * 1.2);
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, s * 0.55, 0, Math.PI * 2);
  g.fill();
  g.fillRect(cx - s * 0.32, cy + s * 0.2, s * 0.64, s * 0.42);
  g.globalCompositeOperation = "destination-out";
  g.beginPath();
  g.arc(cx - s * 0.2, cy - s * 0.02, s * 0.14, 0, Math.PI * 2);
  g.arc(cx + s * 0.2, cy - s * 0.02, s * 0.14, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function sailTexture(faction: Faction) {
  return canvasTexture(`sail-${faction}`, 256, 256, (g) => {
    const base = { player: "#1a1716", merchant: "#ece2c8", pirate: "#5e2b22", marine: "#f5f7fa" }[faction];
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    // Weathering and canvas seams.
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 12, 2 + Math.random() * 6);
    }
    g.strokeStyle = "rgba(0,0,0,0.13)";
    g.lineWidth = 2;
    for (let x = 32; x < 256; x += 32) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 256);
      g.stroke();
    }
    if (faction === "player") drawSkull(g, 128, 108, 64, "#ece6d8");
    if (faction === "pirate") drawSkull(g, 128, 110, 42, "#dccab0");
    if (faction === "marine") {
      g.fillStyle = "#1d4ed8";
      g.fillRect(0, 200, 256, 22);
      g.font = "bold 46px Georgia, serif";
      g.textAlign = "center";
      g.fillText("MARINE", 128, 122);
      g.beginPath();
      g.moveTo(98, 150);
      g.quadraticCurveTo(128, 132, 158, 150);
      g.lineWidth = 6;
      g.strokeStyle = "#1d4ed8";
      g.stroke();
    }
    if (faction === "merchant") {
      g.fillStyle = "rgba(150,90,30,0.4)";
      g.fillRect(0, 96, 256, 20);
      g.fillRect(0, 140, 256, 10);
    }
  });
}

function woodTexture(key: string, base: string, stripe: string) {
  return canvasTexture(key, 128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 8) {
      g.fillStyle = stripe;
      g.fillRect(0, y, 128, 1);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
        g.fillRect(Math.random() * 128, y + 1, 10 + Math.random() * 30, 6);
      }
    }
  });
}

// ---------------------------------------------------------------- ships

const HULL_COLORS: Record<Faction, string> = {
  player: "#2a1a12",
  merchant: "#7a5532",
  pirate: "#3d2418",
  marine: "#e8edf2",
};

function hullShape(length: number, beam: number) {
  const L = length / 2;
  const B = beam / 2;
  const s = new THREE.Shape();
  s.moveTo(-L, -B * 0.78);
  s.lineTo(L * 0.2, -B);
  s.quadraticCurveTo(L * 0.82, -B * 0.88, L, 0);
  s.quadraticCurveTo(L * 0.82, B * 0.88, L * 0.2, B);
  s.lineTo(-L, B * 0.78);
  s.closePath();
  return s;
}

export interface ShipVisual {
  group: THREE.Group;
  sails: THREE.Mesh[];
  flag: THREE.Mesh;
  cannons: THREE.Mesh[];
  cannonCount: number;
  recoil: { [side: number]: number };
  lanternMat: THREE.MeshBasicMaterial;
}

const cannonGeo = new THREE.CylinderGeometry(0.9, 1.15, 6, 8);
cannonGeo.rotateX(Math.PI / 2);
const cannonMat = new THREE.MeshStandardMaterial({ color: "#151515", metalness: 0.7, roughness: 0.35 });
const ropeMat = new THREE.LineBasicMaterial({ color: "#2b2118", transparent: true, opacity: 0.8 });

export function buildShip(ship: Ship): ShipVisual {
  const { cls, faction } = ship;
  const L = cls.length;
  const B = cls.beam;
  const group = new THREE.Group();
  group.rotation.order = "YXZ";
  const depth = Math.max(11, B * 1.0);
  const freeboard = 5 + B * 0.14;

  // Hull: extruded outline, tapered toward the keel.
  const hullGeo = new THREE.ExtrudeGeometry(hullShape(L, B), { depth, bevelEnabled: false, steps: 5, curveSegments: 10 });
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.translate(0, freeboard, 0);
  const pos = hullGeo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const below = (freeboard - pos.getY(i)) / depth; // 0 at deck, 1 at keel
    const taper = 1 - 0.55 * Math.pow(Math.max(0, below), 1.6);
    pos.setZ(i, pos.getZ(i) * taper);
    pos.setX(i, pos.getX(i) * (1 - 0.12 * below));
  }
  hullGeo.computeVertexNormals();
  const woodMap = faction === "marine" ? null : woodTexture(`hull-${faction}`, HULL_COLORS[faction], "rgba(0,0,0,0.35)");
  const hullMat = new THREE.MeshStandardMaterial({ color: woodMap ? "#ffffff" : HULL_COLORS[faction], map: woodMap, roughness: 0.85 });
  if (woodMap) hullMat.color.set(HULL_COLORS[faction]).multiplyScalar(2.2);
  group.add(new THREE.Mesh(hullGeo, hullMat));

  // Bulwark (the low wall around the deck).
  const rim = hullShape(L, B);
  rim.holes.push(hullShape(L * 0.95, B * 0.86) as unknown as THREE.Path);
  const rimGeo = new THREE.ExtrudeGeometry(rim, { depth: 3.2, bevelEnabled: false, curveSegments: 10 });
  rimGeo.rotateX(-Math.PI / 2);
  rimGeo.translate(0, freeboard, 0);
  group.add(new THREE.Mesh(rimGeo, faction === "marine" ? new THREE.MeshStandardMaterial({ color: "#1d4ed8", roughness: 0.6 }) : hullMat));

  const deckGeo = new THREE.ShapeGeometry(hullShape(L * 0.95, B * 0.86), 10);
  deckGeo.rotateX(-Math.PI / 2);
  deckGeo.translate(0, freeboard + 0.05, 0);
  const deckMap = woodTexture("deck", "#7b5d3d", "rgba(40,25,10,0.5)");
  group.add(new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ map: deckMap, roughness: 0.9 })));

  // Stern castle, bowsprit and a stern lantern.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.2, 7, B * 0.78), hullMat);
  cabin.position.set(-L * 0.38, freeboard + 3.5, 0);
  group.add(cabin);
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.8, 0.7) });
  for (const zz of [-B * 0.2, B * 0.2]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2), winMat);
    win.position.set(-L * 0.48 - 0.1, freeboard + 4, zz);
    win.rotation.y = -Math.PI / 2;
    group.add(win);
  }
  const mastMat = new THREE.MeshStandardMaterial({ color: "#3b2a1c", roughness: 0.9 });
  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, L * 0.35, 6), mastMat);
  bowsprit.rotation.z = -Math.PI / 2 + 0.35;
  bowsprit.position.set(L * 0.58, freeboard + 4, 0);
  group.add(bowsprit);
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.4, 0.9) });
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6), lanternMat);
  lantern.position.set(-L * 0.5, freeboard + 9, 0);
  group.add(lantern);

  // Masts, yards, sails and rigging.
  const sailMat = new THREE.MeshStandardMaterial({ map: sailTexture(faction), side: THREE.DoubleSide, roughness: 0.95 });
  const mastH = L * 0.88;
  const positions = cls.masts === 1 ? [0.05] : cls.masts === 2 ? [0.2, -0.15] : [0.28, 0.0, -0.25];
  const sails: THREE.Mesh[] = [];
  let flag: THREE.Mesh | null = null;
  const rigging: number[] = [];
  positions.forEach((p, i) => {
    const h = mastH * (i === 0 && cls.masts > 1 ? 0.9 : 1);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.95, h, 7), mastMat);
    mast.position.set(L * p, freeboard + h / 2, 0);
    group.add(mast);
    // Crow's nest on the main mast.
    if (i === (cls.masts === 3 ? 1 : 0)) {
      const nest = new THREE.Mesh(new THREE.CylinderGeometry(3, 2.4, 2.2, 10, 1, true), mastMat);
      nest.position.set(L * p, freeboard + h * 0.78, 0);
      group.add(nest);
    }
    for (const [frac, width] of [
      [0.5, 1.6],
      [0.82, 1.2],
    ] as const) {
      const sw = B * width;
      const sh = h * 0.3;
      const geo = new THREE.PlaneGeometry(sw, sh, 8, 4);
      geo.translate(0, -sh / 2, 0); // hang from the yard
      const pa = geo.getAttribute("position") as THREE.BufferAttribute;
      for (let v = 0; v < pa.count; v++) {
        const x = pa.getX(v);
        const y = pa.getY(v);
        pa.setZ(v, Math.cos((x / sw) * Math.PI) * sw * 0.14 * Math.sin((-y / sh) * Math.PI * 0.9 + 0.2));
      }
      geo.rotateY(Math.PI / 2);
      geo.computeVertexNormals();
      const sail = new THREE.Mesh(geo, sailMat);
      const top = freeboard + h * frac + sh / 2;
      sail.position.set(L * p + 1.6, top, 0);
      sails.push(sail);
      group.add(sail);
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, sw * 1.08, 5), mastMat);
      yard.rotation.x = Math.PI / 2;
      yard.position.set(L * p + 0.8, top, 0);
      group.add(yard);
      // Rigging from the yard ends down to the rails.
      for (const side of [-1, 1]) rigging.push(L * p + 0.8, top, (side * sw) / 2, L * p - 6, freeboard + 2, (side * B) / 2);
    }
    if (i === 0) {
      flag = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 6, 6, 1),
        new THREE.MeshStandardMaterial({ map: faction === "player" ? sailTexture("player") : null, color: flagColor(faction), side: THREE.DoubleSide }),
      );
      flag.geometry.translate(-5, 0, 0);
      flag.position.set(L * p, freeboard + h + 2.5, 0);
      group.add(flag);
    }
  });
  // Forestays from the bow to the top of the foremast.
  rigging.push(L * 0.62, freeboard + 6, 0, L * positions[0], freeboard + mastH * 0.9, 0);
  const rigGeo = new THREE.BufferGeometry();
  rigGeo.setAttribute("position", new THREE.Float32BufferAttribute(rigging, 3));
  group.add(new THREE.LineSegments(rigGeo, ropeMat));

  const visual: ShipVisual = { group, sails, flag: flag!, cannons: [], cannonCount: 0, recoil: { 1: 0, [-1]: 0 }, lanternMat };
  setCannons(visual, ship);
  return visual;
}

function flagColor(faction: Faction) {
  return { player: "#ffffff", merchant: "#d1a54a", pirate: "#7f1d1d", marine: "#1d4ed8" }[faction];
}

/** Cannon barrels poking out each side; rebuilt when you buy more. */
export function setCannons(v: ShipVisual, ship: Ship) {
  const n = ship.stats.cannonsPerSide;
  if (v.cannonCount === n) return;
  for (const c of v.cannons) v.group.remove(c);
  v.cannons = [];
  const L = ship.cls.length;
  const B = ship.cls.beam;
  const y = 5 + B * 0.14 + 1.6;
  for (const side of [1, -1]) {
    for (let i = 0; i < n; i++) {
      const along = n === 1 ? 0 : (i / (n - 1) - 0.5) * L * 0.6;
      const c = new THREE.Mesh(cannonGeo, cannonMat);
      c.rotation.y = side > 0 ? 0 : Math.PI;
      c.position.set(along, y, side * (B / 2 + 0.5));
      c.userData = { side, baseZ: side * (B / 2 + 0.5) };
      v.cannons.push(c);
      v.group.add(c);
    }
  }
  v.cannonCount = n;
}

export function disposeShip(v: ShipVisual) {
  v.group.traverse((o) => {
    if ((o instanceof THREE.Mesh || o instanceof THREE.LineSegments) && o.geometry !== cannonGeo) o.geometry.dispose();
  });
}

// ---------------------------------------------------------------- people

export interface PersonVisual {
  group: THREE.Group;
  body: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  weapon: THREE.Group;
  weaponId: WeaponId | null;
  walkPhase: number;
  hurtMat: THREE.MeshStandardMaterial[];
}

const PERSON_COLORS: Record<WalkerKind, { coat: string; pants: string; hat: string; trim: string }> = {
  hero: { coat: "#3b0d0d", pants: "#1c1917", hat: "#111111", trim: "#d4a017" },
  marine: { coat: "#f1f5f9", pants: "#1e3a8a", hat: "#f8fafc", trim: "#1d4ed8" },
  captain: { coat: "#f8fafc", pants: "#1e293b", hat: "#0f172a", trim: "#eab308" },
  bandit: { coat: "#6b3e1e", pants: "#3f3f46", hat: "#b91c1c", trim: "#b91c1c" },
};

const skinMat = new THREE.MeshStandardMaterial({ color: "#d9a17a", roughness: 0.8 });
const steelMat = new THREE.MeshStandardMaterial({ color: "#cbd5e1", metalness: 0.85, roughness: 0.25 });
const darkWoodMat = new THREE.MeshStandardMaterial({ color: "#3f2a1a", roughness: 0.8 });
const ironMat = new THREE.MeshStandardMaterial({ color: "#27272a", metalness: 0.7, roughness: 0.4 });
const rustMat = new THREE.MeshStandardMaterial({ color: "#7a6a5c", metalness: 0.3, roughness: 0.9 });

function limb(w: number, h: number, d: number, mat: THREE.Material, pivotY: number) {
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = -h / 2;
  pivot.add(m);
  pivot.position.y = pivotY;
  return pivot;
}

/** A small low-poly person, about 17 units tall, facing +x. */
export function buildPerson(kind: WalkerKind): PersonVisual {
  const c = PERSON_COLORS[kind];
  const coat = new THREE.MeshStandardMaterial({ color: c.coat, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: c.pants, roughness: 0.9 });
  const hatMat = new THREE.MeshStandardMaterial({ color: c.hat, roughness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: c.trim, roughness: 0.5, metalness: 0.3 });
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const legL = limb(2.2, 7, 2.2, pants, 7);
  legL.position.z = -1.3;
  const legR = limb(2.2, 7, 2.2, pants, 7);
  legR.position.z = 1.3;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(3.6, 6, 5.2), coat);
  torso.position.y = 10;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.9, 5.4), trim);
  belt.position.y = 7.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.1, 12, 10), skinMat);
  head.position.y = 15;
  const armL = limb(1.6, 6, 1.6, coat, 12.6);
  armL.position.z = -3.4;
  const armR = limb(1.6, 6, 1.6, coat, 12.6);
  armR.position.z = 3.4;
  body.add(legL, legR, torso, belt, head, armL, armR);

  // Hats tell factions apart at a glance.
  if (kind === "hero" || kind === "captain") {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.5, 3), hatMat);
    brim.position.y = 16.8;
    brim.rotation.y = Math.PI / 6;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 2.2, 10), hatMat);
    crown.position.y = 17.9;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 0.5, 10), trim);
    band.position.y = 17.2;
    body.add(brim, crown, band);
    // A long coat tail.
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 5), coat);
    tail.position.set(-1.9, 6.5, 0);
    body.add(tail);
  } else if (kind === "marine") {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 1.6, 12), hatMat);
    cap.position.y = 16.8;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 3), trim);
    visor.position.set(2, 16.2, 0);
    body.add(cap, visor);
  } else {
    const bandana = new THREE.Mesh(new THREE.SphereGeometry(2.25, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hatMat);
    bandana.position.y = 15.2;
    body.add(bandana);
  }

  const weapon = new THREE.Group();
  armR.add(weapon);
  weapon.position.set(0.6, -6, 0);
  const v: PersonVisual = {
    group,
    body,
    legL,
    legR,
    armL,
    armR,
    weapon,
    weaponId: null,
    walkPhase: Math.random() * 6,
    hurtMat: [coat, pants],
  };
  return v;
}

function setWeapon(v: PersonVisual, id: WeaponId) {
  if (v.weaponId === id) return;
  v.weaponId = id;
  v.weapon.clear();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    v.weapon.add(m);
    return m;
  };
  switch (id) {
    case "dull_sword":
      add(new THREE.BoxGeometry(0.5, 1.4, 0.5), darkWoodMat, 0, 0);
      add(new THREE.BoxGeometry(1.4, 0.3, 0.9), rustMat, 0, -0.8);
      add(new THREE.BoxGeometry(0.35, 6.5, 0.7), rustMat, 0.1, -4.3);
      break;
    case "cutlass":
      add(new THREE.BoxGeometry(0.5, 1.4, 0.5), darkWoodMat, 0, 0);
      add(new THREE.BoxGeometry(1.8, 0.3, 1.2), ironMat, 0, -0.8);
      add(new THREE.BoxGeometry(0.3, 8, 0.9), steelMat, 0.2, -5);
      break;
    case "axe":
      add(new THREE.BoxGeometry(0.6, 9, 0.6), darkWoodMat, 0, -3.5);
      add(new THREE.BoxGeometry(3.4, 2.8, 0.4), steelMat, 1.6, -7.2);
      break;
    case "flintlock":
      add(new THREE.BoxGeometry(0.8, 2, 1.2), darkWoodMat, -0.6, 0);
      add(new THREE.BoxGeometry(0.8, 4.5, 0.8), ironMat, -1.2, -2.4);
      break;
    case "musket":
      add(new THREE.BoxGeometry(0.9, 14, 0.9), darkWoodMat, -0.8, -3.5);
      add(new THREE.BoxGeometry(0.5, 9, 0.5), ironMat, -0.3, -7);
      break;
    case "blunderbuss":
      add(new THREE.BoxGeometry(1.2, 8, 1.2), darkWoodMat, -0.8, -2.6);
      add(new THREE.CylinderGeometry(0.6, 1.4, 2.4, 8), ironMat, -0.8, -7.2);
      break;
    default:
      break;
  }
}

/** Pose a person for this frame: walk cycle, attacks, death, being hurt. */
export function posePerson(v: PersonVisual, w: Walker, dt: number, aimingGun: boolean) {
  setWeapon(v, w.weapon);
  v.group.position.set(w.x, w.y, w.z);
  v.group.rotation.y = -w.heading;
  const isGun = w.weapon === "flintlock" || w.weapon === "musket" || w.weapon === "blunderbuss";
  if (w.dead >= 0) {
    const k = Math.min(1, w.dead / 0.6);
    v.body.rotation.z = (-Math.PI / 2) * k;
    v.body.position.y = -Math.max(0, w.dead - 4) * 3;
    return;
  }
  v.body.rotation.z = 0;
  v.body.position.y = w.swimming ? -9 : 0;
  if (w.moving) v.walkPhase += dt * (w.swimming ? 5 : 11);
  const s = w.moving ? Math.sin(v.walkPhase) : 0;
  v.legL.rotation.z = s * 0.7;
  v.legR.rotation.z = -s * 0.7;
  v.armL.rotation.z = -s * 0.6;
  // Right arm: swing, aim or walk.
  if (w.swing < 0.3 && !isGun) {
    const k = w.swing / 0.3;
    v.armR.rotation.z = 2.6 - k * 3.4;
    v.armR.rotation.x = -0.4;
  } else if (isGun && (aimingGun || w.swing < 0.6)) {
    v.armR.rotation.z = Math.PI / 2 + (w.swing < 0.15 ? 0.3 : 0);
    v.armR.rotation.x = 0;
  } else {
    v.armR.rotation.z = s * 0.6;
    v.armR.rotation.x = 0;
  }
  const flash = w.hurt > 0;
  for (const m of v.hurtMat) m.emissive.setRGB(flash ? 0.8 : 0, 0, 0);
}

export function disposePerson(v: PersonVisual) {
  v.group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}

// ---------------------------------------------------------------- loot

export function buildCrate() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(9, 7, 9),
    new THREE.MeshStandardMaterial({ map: woodTexture("crate", "#7a5328", "rgba(0,0,0,0.4)"), roughness: 0.9 }),
  );
  g.add(box);
  const gold = new THREE.Mesh(new THREE.BoxGeometry(7, 2, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.3, 0.5) }));
  gold.position.y = 4;
  g.add(gold);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.5, 160, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: "#fcd34d", transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beam.position.y = 80;
  g.add(beam);
  return g;
}

export function buildChest() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture("chest", "#6b3f1d", "rgba(0,0,0,0.4)"), roughness: 0.8 });
  const band = new THREE.MeshStandardMaterial({ color: "#c9a227", metalness: 0.8, roughness: 0.3 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 6.5), wood);
  base.position.y = 2.5;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.25, 10, 10, 1, false, 0, Math.PI), wood);
  lid.rotation.z = Math.PI / 2;
  lid.rotation.y = Math.PI / 2;
  lid.position.y = 5;
  for (const x of [-3.5, 3.5]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.6, 6.8), band);
    b.position.set(x, 4.1, 0);
    g.add(b);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.6), band);
  lock.position.set(0, 4.6, 3.4);
  g.add(base, lid, lock);
  return g;
}

export function buildSupplyCrate() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: woodTexture("supply", "#8a6a3f", "rgba(0,0,0,0.35)"), roughness: 0.9 });
  for (const [x, z, s] of [
    [0, 0, 8],
    [7, 2, 6],
    [2, 7, 5],
  ] as const) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat);
    b.position.set(x, s / 2, z);
    b.rotation.y = x * 0.3;
    g.add(b);
  }
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 6, 10), new THREE.MeshStandardMaterial({ color: "#5b3a1f", roughness: 0.8 }));
  barrel.position.set(-6, 3, 4);
  g.add(barrel);
  return g;
}

/** An X on the sand over a little mound. */
export function buildBuriedMark() {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(
    new THREE.SphereGeometry(7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: "#c4a875", roughness: 1 }),
  );
  mound.scale.y = 0.25;
  g.add(mound);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.15, 0.1) });
  for (const r of [Math.PI / 4, -Math.PI / 4]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 2), mat);
    bar.position.y = 1.9;
    bar.rotation.y = r;
    g.add(bar);
  }
  return g;
}

/** A Devil Fruit: a swirling, glowing fruit on a rock. */
export function buildFruit(fruit: FruitId | null) {
  const def = fruit ? FRUITS[fruit] : FRUITS.gomu;
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(5, 0), new THREE.MeshStandardMaterial({ color: "#3f3f46", roughness: 1, flatShading: true }));
  rock.scale.y = 0.6;
  rock.position.y = 2;
  g.add(rock);
  const tex = canvasTexture(`fruit-${def.id}`, 128, 128, (c) => {
    c.fillStyle = def.color;
    c.fillRect(0, 0, 128, 128);
    c.strokeStyle = def.swirl;
    c.lineWidth = 7;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      for (let a = 0; a < Math.PI * 6; a += 0.2) {
        const r = a * 3.2;
        c.lineTo(20 + i * 22 + Math.cos(a) * r * 0.4, 64 + Math.sin(a) * r * 0.4);
      }
      c.stroke();
    }
  });
  const fruitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 16, 12),
    new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color(def.color), emissiveIntensity: 0.6, roughness: 0.4 }),
  );
  fruitMesh.position.y = 8;
  fruitMesh.name = "fruit";
  g.add(fruitMesh);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 5), new THREE.MeshStandardMaterial({ color: "#3f6212" }));
  stem.position.y = 11.6;
  g.add(stem);
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 220, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glow.position.y = 110;
  g.add(glow);
  return g;
}
