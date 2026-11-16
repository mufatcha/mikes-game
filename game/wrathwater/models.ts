/** 3D models for Wrathwater, built from simple shapes: ships, people, loot. */
import * as THREE from "three";
import type { Faction } from "./data";
import type { Walker, WalkerKind } from "./foot";
import { FRUITS, WEAPONS, type FruitId, type WeaponId } from "./items";
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

/**
 * The helm on the stern castle roof, in the ship's own coordinates (x toward
 * the bow, y up, z to starboard): where you stand, the wheel in front of you,
 * three sail levers right beside its left handles (each pulled toward you lets
 * out one more set of sails), and the two cannon buttons beside its right
 * handles (PORT fires left, STARBOARD fires right).
 */
export function helmLayout(cls: { length: number; beam: number }) {
  const L = cls.length;
  const B = cls.beam;
  const roof = 5 + B * 0.14 + 22;
  // Just off the centerline, so the levers and buttons fit on the deck either side.
  const side = B * 0.05;
  const standX = -L * 0.42;
  return {
    /** Where your feet are. */
    stand: new THREE.Vector3(standX, roof, side),
    roof,
    wheel: new THREE.Vector3(standX + 7.5, roof + 10, side),
    wheelRadius: 4,
    /** Each lever's pivot at its base, on a stand beside the wheel; the knob is LEVER_LENGTH above. */
    levers: [7, 9.6, 12.2].map((dz) => new THREE.Vector3(standX + 5, roof + 6, side - dz)),
    /** The cannon buttons' tops: port (fires left) nearer the wheel, starboard (fires right) outside it. */
    buttons: [7, 9.8].map((dz) => new THREE.Vector3(standX + 5, roof + 11, side + dz)),
  };
}
export const LEVER_LENGTH = 6;
/** How far behind the wheel a helmsman stands so their hands are on it. */
const HELMSMAN_REACH = 5.8;
/** Lever angles (about the ship's z axis): sails in (pushed forward) and let out (pulled back toward you). */
export const LEVER_IN = -0.55;
export const LEVER_OUT = 0.55;
/** Wheel turns from straight ahead to hard over (radians). */
export const WHEEL_LOCK = Math.PI * 1.25;

export interface ShipVisual {
  group: THREE.Group;
  /** The ship's wheel (spins about the ship's x axis) and its three sail levers (tilt about z). */
  helm: { wheel: THREE.Object3D; levers: THREE.Object3D[]; buttons: { cap: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] };
  sails: THREE.Mesh[];
  flag: THREE.Mesh;
  cannons: THREE.Mesh[];
  cannonCount: number;
  recoil: { [side: number]: number };
  lanternMat: THREE.MeshBasicMaterial;
  /** On other crews' ships: the sailor standing at the wheel, steering. */
  helmsman: PersonVisual | null;
  /** On your ship: your hired crew, standing at their stations on deck. */
  crew: PersonVisual[];
  /** The ship class this was built for (your ship is rebuilt when you buy a bigger one). */
  cls: Ship["cls"];
}

const cannonGeo = new THREE.CylinderGeometry(0.9, 1.15, 6, 8);
cannonGeo.rotateX(Math.PI / 2);
const cannonMat = new THREE.MeshStandardMaterial({ color: "#151515", metalness: 0.7, roughness: 0.35 });
const ropeMat = new THREE.LineBasicMaterial({ color: "#2b2118", transparent: true, opacity: 0.8 });

/** The ship's wheel on a post, and the sail levers. */
function buildHelm(cls: { length: number; beam: number }, group: THREE.Group) {
  const h = helmLayout(cls);
  const wood = new THREE.MeshStandardMaterial({ color: "#6b4423", roughness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({ color: "#b8860b", metalness: 0.7, roughness: 0.35 });
  // The post holding the wheel up.
  const post = new THREE.Mesh(new THREE.BoxGeometry(2, h.wheel.y - h.roof, 2.4), wood);
  post.position.set(h.wheel.x + 1.6, (h.wheel.y + h.roof) / 2, h.wheel.z);
  group.add(post);
  // The wheel: a rim, a brass hub and eight spokes that stick out as handles.
  const wheel = new THREE.Group();
  wheel.position.copy(h.wheel);
  const R = h.wheelRadius;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.45, 8, 32), wood);
  rim.rotation.y = Math.PI / 2;
  wheel.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.6, 12), brass);
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, R + 1.6, 6), wood);
    spoke.position.set(0, Math.cos(a) * ((R + 1.6) / 2), Math.sin(a) * ((R + 1.6) / 2));
    spoke.rotation.x = -a;
    wheel.add(spoke);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), wood);
    knob.position.set(0, Math.cos(a) * (R + 1.6), Math.sin(a) * (R + 1.6));
    wheel.add(knob);
  }
  // A brass marker on the top spoke shows which way is straight ahead.
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.8), brass);
  mark.position.set(-0.3, R + 1.4, 0);
  wheel.add(mark);
  group.add(wheel);
  // Three sail levers on a stand right beside the wheel's left handles.
  const iron = new THREE.MeshStandardMaterial({ color: "#2b2b30", metalness: 0.6, roughness: 0.5 });
  const knobMats = ["#dc2626", "#f59e0b", "#16a34a"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
  const zs = h.levers.map((p) => p.z);
  const leverStand = new THREE.Mesh(new THREE.BoxGeometry(3, h.levers[0].y - h.roof, Math.max(...zs) - Math.min(...zs) + 2.4), wood);
  leverStand.position.set(h.levers[0].x, (h.levers[0].y + h.roof) / 2, (Math.max(...zs) + Math.min(...zs)) / 2);
  group.add(leverStand);
  const levers = h.levers.map((p, i) => {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.2), iron);
    base.position.set(p.x, p.y + 0.4, p.z);
    group.add(base);
    const lever = new THREE.Group();
    lever.position.copy(p);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, LEVER_LENGTH, 6), iron);
    arm.position.y = LEVER_LENGTH / 2;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), knobMats[i]);
    knob.position.y = LEVER_LENGTH;
    lever.add(arm, knob);
    lever.rotation.z = LEVER_IN;
    group.add(lever);
    return lever;
  });
  // The cannon buttons on a stand beside the wheel's right handles, each with a label facing you.
  const buttons = h.buttons.map((p, i) => {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(2.6, p.y - h.roof - 0.4, 2.6), wood);
    stand.position.set(p.x, (p.y - 0.4 + h.roof) / 2, p.z);
    group.add(stand);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.4, 16), brass);
    ring.position.set(p.x, p.y - 0.4, p.z);
    group.add(ring);
    const mat = new THREE.MeshStandardMaterial({ color: "#ef4444", emissive: new THREE.Color("#ef4444"), emissiveIntensity: 0.6, roughness: 0.4 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.8, 16), mat);
    cap.position.set(p.x, p.y, p.z);
    group.add(cap);
    const word = i === 0 ? "PORT" : "STARBOARD";
    const tex = canvasTexture(`helm-${word}`, 128, 48, (c) => {
      c.fillStyle = "#1c1208";
      c.fillRect(0, 0, 128, 48);
      c.fillStyle = "#fde68a";
      c.font = "bold 22px serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(word, 64, 25);
    });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: tex }));
    // On the stand's side that faces you (toward the stern).
    label.position.set(p.x - 1.31, p.y - 1.6, p.z);
    label.rotation.y = -Math.PI / 2;
    group.add(label);
    return { cap, mat };
  });
  return { wheel, levers, buttons };
}

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
  const rimGeo = new THREE.ExtrudeGeometry(rim, { depth: 6, bevelEnabled: false, curveSegments: 10 });
  rimGeo.rotateX(-Math.PI / 2);
  rimGeo.translate(0, freeboard, 0);
  group.add(new THREE.Mesh(rimGeo, faction === "marine" ? new THREE.MeshStandardMaterial({ color: "#1d4ed8", roughness: 0.6 }) : hullMat));

  const deckGeo = new THREE.ShapeGeometry(hullShape(L * 0.95, B * 0.86), 10);
  deckGeo.rotateX(-Math.PI / 2);
  deckGeo.translate(0, freeboard + 0.05, 0);
  const deckMap = woodTexture("deck", "#7b5d3d", "rgba(40,25,10,0.5)");
  group.add(new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ map: deckMap, roughness: 0.9 })));

  // Stern castle, bowsprit and a stern lantern.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.2, 22, B * 0.78), hullMat); // a cabin a person can stand in
  cabin.position.set(-L * 0.38, freeboard + 11, 0);
  group.add(cabin);
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.8, 0.7) });
  for (const zz of [-B * 0.2, B * 0.2]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4), winMat);
    win.position.set(-L * 0.48 - 0.1, freeboard + 13, zz);
    win.rotation.y = -Math.PI / 2;
    group.add(win);
  }
  const mastMat = new THREE.MeshStandardMaterial({ color: "#3b2a1c", roughness: 0.9 });
  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, L * 0.35, 6), mastMat);
  bowsprit.rotation.z = -Math.PI / 2 + 0.35;
  bowsprit.position.set(L * 0.58, freeboard + 4, 0);
  group.add(bowsprit);
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.4, 0.9) });
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(ship.fruitCarrier ? 2.4 : 1.3, 8, 6), lanternMat);
  lantern.position.set(-L * 0.5, freeboard + 25, 0);
  group.add(lantern);
  if (ship.fruitCarrier) {
    // A chest on deck with something faintly glowing inside. You have to look for it.
    const chest = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 6), new THREE.MeshStandardMaterial({ color: "#4a2c17", roughness: 0.8 }));
    chest.position.set(L * 0.08, freeboard + 2.5, 0);
    const glowBit = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.8, 5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.25, 1.8) }),
    );
    glowBit.position.set(L * 0.08, freeboard + 5.3, 0);
    group.add(chest, glowBit);
  }

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

  const helm = buildHelm(cls, group);
  // Someone is actually steering every other ship: a sailor at the wheel, hands on the spokes.
  let helmsman: PersonVisual | null = null;
  if (faction !== "player") {
    const big = cls.id === "marine_warship" || cls.id === "marine_flagship";
    helmsman = buildPerson(faction === "marine" ? (big ? "captain" : "marine") : faction === "pirate" ? "bandit" : "sailor");
    const lay = helmLayout(cls);
    helmsman.group.position.set(lay.wheel.x - HELMSMAN_REACH, lay.roof, lay.wheel.z);
    helmsman.armL.rotation.z = 1.25;
    helmsman.armR.rotation.z = 1.25;
    group.add(helmsman.group);
  }
  const visual: ShipVisual = { group, helm, sails, flag: flag!, cannons: [], cannonCount: 0, recoil: { 1: 0, [-1]: 0 }, lanternMat, helmsman, crew: [], cls };
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

/** People in the game, plus the merchant sailors who steer trading ships. */
export type PersonKind = WalkerKind | "sailor";

const PERSON_COLORS: Record<PersonKind, { coat: string; pants: string; hat: string; trim: string }> = {
  sailor: { coat: "#1e3a5f", pants: "#d6d3d1", hat: "#e7e5e4", trim: "#93c5fd" },
  hero: { coat: "#3b0d0d", pants: "#1c1917", hat: "#111111", trim: "#d4a017" },
  marine: { coat: "#f1f5f9", pants: "#1e3a8a", hat: "#f8fafc", trim: "#1d4ed8" },
  captain: { coat: "#f8fafc", pants: "#1e293b", hat: "#0f172a", trim: "#eab308" },
  bandit: { coat: "#6b3e1e", pants: "#3f3f46", hat: "#b91c1c", trim: "#b91c1c" },
};

const skinMat = new THREE.MeshStandardMaterial({ color: "#d9a17a", roughness: 0.8 });
const packMat = new THREE.MeshStandardMaterial({ color: "#6b4a2b", roughness: 0.9 });
const packFlapMat = new THREE.MeshStandardMaterial({ color: "#4a3220", roughness: 0.9 });

/** The backpack you pull off your back in VR (in meters, for your hand): a leather satchel with straps and a buckle. */
export function buildBackpack() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.14), packMat);
  body.position.y = -0.2;
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.12, 0.15), packFlapMat);
  flap.position.y = -0.08;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.02), new THREE.MeshStandardMaterial({ color: "#d4a017", metalness: 0.7, roughness: 0.3 }));
  buckle.position.set(0, -0.13, 0.08);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 16, Math.PI), packFlapMat);
  strap.position.y = -0.03;
  g.add(body, flap, buckle, strap);
  return g;
}
const steelMat = new THREE.MeshStandardMaterial({ color: "#cbd5e1", metalness: 0.85, roughness: 0.25 });
const darkWoodMat = new THREE.MeshStandardMaterial({ color: "#3f2a1a", roughness: 0.8 });
const ironMat = new THREE.MeshStandardMaterial({ color: "#27272a", metalness: 0.7, roughness: 0.4 });
const rustMat = new THREE.MeshStandardMaterial({ color: "#7a6a5c", metalness: 0.3, roughness: 0.9 });
const brassMat = new THREE.MeshStandardMaterial({ color: "#d4a017", metalness: 0.7, roughness: 0.35 });

function limb(w: number, h: number, d: number, mat: THREE.Material, pivotY: number) {
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = -h / 2;
  pivot.add(m);
  pivot.position.y = pivotY;
  return pivot;
}

/** A small low-poly person, about 17 units tall, facing +x. */
export function buildPerson(kind: PersonKind): PersonVisual {
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
    if (kind === "hero") {
      // Your backpack, where your loot goes.
      const pack = new THREE.Mesh(new THREE.BoxGeometry(1.8, 5, 4.2), packMat);
      pack.position.set(-2.7, 10.4, 0);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 4.4), packFlapMat);
      flap.position.set(-2.8, 12.6, 0);
      body.add(pack, flap);
    }
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
  weaponMeshes(v.weapon, id);
}

/** How far a weapon reaches from the hand to its tip (along -y in its own space). */
export const WEAPON_TIP: Record<WeaponId, number> = {
  fists: 0, dull_sword: 7.6, cutlass: 9, axe: 8.6, flintlock: 4.6, musket: 11.5, blunderbuss: 8.4, rapier: 10.5, hammer: 9.5, twin_pistols: 4.6,
};

/** A weapon's shapes, with the grip at the origin and the blade or barrel pointing down -y. */
export function weaponMeshes(group: THREE.Group, id: WeaponId) {
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
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
    case "rapier":
      add(new THREE.BoxGeometry(0.45, 1.4, 0.45), darkWoodMat, 0, 0);
      add(new THREE.SphereGeometry(0.9, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), brassMat, 0, -0.7);
      add(new THREE.BoxGeometry(0.16, 9.6, 0.3), steelMat, 0, -5.6);
      break;
    case "hammer":
      add(new THREE.BoxGeometry(0.6, 10, 0.6), darkWoodMat, 0, -4);
      add(new THREE.BoxGeometry(2.6, 2.6, 4.2), ironMat, 0, -8.6);
      break;
    case "twin_pistols":
      for (const z of [-0.9, 0.9]) {
        add(new THREE.BoxGeometry(0.8, 2, 1), darkWoodMat, -0.6, 0, z);
        add(new THREE.BoxGeometry(0.7, 4.5, 0.7), ironMat, -1.2, -2.4, z);
      }
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
  const isGun = WEAPONS[w.weapon].kind === "gun";
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
