/**
 * The insides of Blackwater Cove's stores, which you walk into in VR: a plank
 * floor, walls and beams, a counter with the shopkeeper, hanging lanterns, a
 * price board on the back wall (filled in by the engine), and things that
 * suit the store: a model ship and timber at the shipwright's, an anvil and a
 * glowing forge at the blacksmith's, shelves of strange fruit at the black
 * market, barrels and tables in the tavern.
 */
import * as THREE from "three";
import { buildPerson, canvasTexture } from "./models";
import { COUNTER, doorAxis, type Building, type ServiceKind } from "./world";

function planks() {
  const t = canvasTexture("planks", 256, 256, (g) => {
    g.fillStyle = "#6b4a2b";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? "rgba(0,0,0,0.12)" : "rgba(255,220,170,0.06)";
      g.fillRect(0, i * 32, 256, 30);
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.fillRect(0, i * 32 + 30, 256, 2);
      g.fillRect(((i * 97) % 200) + 20, i * 32, 2, 30);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}

const WALLS: Record<ServiceKind, string> = { shipwright: "#7a5a3c", blacksmith: "#4b4038", market: "#4a3a66", tavern: "#6e4a2e", shop: "#7c6a4a" };
const KEEPER: Record<ServiceKind, "sailor" | "bandit" | "captain"> = { shipwright: "sailor", blacksmith: "bandit", market: "bandit", tavern: "sailor", shop: "sailor" };

export interface Interior {
  group: THREE.Group;
  /** Where the price board hangs on the back wall, and how big it can be. */
  board: { anchor: THREE.Object3D; width: number; height: number };
}

export function buildInterior(b: Building, kind: ServiceKind): Interior {
  const ax = doorAxis(b);
  const D = ax.depth;
  const Wd = ax.width;
  const H = b.h;
  const group = new THREE.Group();
  group.name = "interior";
  // Local space: +x toward the door, z across, y up from the floor.
  group.position.set(b.x, b.y, b.z);
  group.rotation.y = -ax.angle;
  // Lit by its own lanterns, not the sun outside: every surface glows a little with its own color.
  const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, emissive: new THREE.Color(color).multiplyScalar(0.32), ...extra });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // Floor, walls (seen from inside) and ceiling beams.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(D - 2, Wd - 2), new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.9, emissiveMap: planks(), emissive: new THREE.Color(0.38, 0.32, 0.26) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.4;
  group.add(floor);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(D - 1.6, H - 1, Wd - 1.6), mat(WALLS[kind], { side: THREE.BackSide }));
  walls.position.y = (H - 1) / 2 + 0.2;
  group.add(walls);
  const beamMat = mat("#3b2716");
  for (let i = -2; i <= 2; i++) box(2, 2, Wd - 2, beamMat, (i * D) / 6, H - 3, 0);

  // The door you came in by, with a glowing way out above it.
  const door = new THREE.Mesh(new THREE.PlaneGeometry(11, 23), mat("#2a1a0e"));
  door.position.set(D / 2 - 1, 11.9, 0);
  door.rotation.y = -Math.PI / 2;
  group.add(door);
  const exitTex = canvasTexture("store-exit", 256, 64, (g) => {
    g.fillStyle = "#1c120a";
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = "#4ade80";
    g.font = "bold 34px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("WAY OUT", 128, 34);
  });
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshBasicMaterial({ map: exitTex, toneMapped: false }));
  exit.position.set(D / 2 - 1.1, 26, 0);
  exit.rotation.y = -Math.PI / 2;
  group.add(exit);

  // The counter, and the shopkeeper behind it (off to one side, so the board stays in view).
  const back = -D / 2;
  const counterW = Math.min(Wd * 0.62, 50);
  box(6, 9, counterW, mat("#5a3a20"), back + COUNTER, 4.9, 0);
  box(7, 0.8, counterW + 1, mat("#8b5e34"), back + COUNTER, 9.6, 0);
  const keeper = buildPerson(KEEPER[kind]);
  keeper.group.position.set(back + 6, 0.4, counterW / 2 - 3);
  keeper.armL.rotation.z = 0.5;
  keeper.armR.rotation.z = 0.5;
  group.add(keeper.group);

  // Lanterns hanging from the beams.
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.5, 0.6) });
  const chain = mat("#1f1f1f");
  for (const [lx, lz] of [
    [-D / 4, -Wd / 4],
    [-D / 4, Wd / 4],
    [D / 5, -Wd / 4],
    [D / 5, Wd / 4],
  ]) {
    box(0.3, 5, 0.3, chain, lx, H - 5.5, lz);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), glow);
    lamp.position.set(lx, H - 8.5, lz);
    group.add(lamp);
  }

  // Things that suit the store, along the side walls.
  const side = Wd / 2 - 6;
  if (kind === "shipwright") {
    // A model ship on the counter.
    const hull = box(3, 2, 12, mat("#4a2c17"), back + COUNTER, 11, -counterW * 0.25);
    hull.rotation.y = 0.3;
    box(0.3, 8, 0.3, mat("#3b2716"), back + COUNTER, 15, -counterW * 0.25);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat("#f5f0e1", { side: THREE.DoubleSide }));
    sail.position.set(back + COUNTER, 15.5, -counterW * 0.25);
    sail.rotation.y = Math.PI / 2;
    group.add(sail);
    // Stacked timber and coils of rope.
    for (let i = 0; i < 5; i++) box(D * 0.35, 1.6, 3, mat(i % 2 ? "#8b6a48" : "#9c7a52"), 0, 1.2 + i * 1.7, side);
    for (const x of [-D / 6, D / 8]) {
      const rope = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.8, 8, 16), mat("#b49a6a"));
      rope.rotation.x = Math.PI / 2;
      rope.position.set(x, 1.2, -side);
      group.add(rope);
    }
  } else if (kind === "blacksmith") {
    // Anvil, and a forge glowing orange.
    box(5, 4, 3, mat("#1f2937", { metalness: 0.6 }), 0, 2.4, -side + 2);
    box(8, 2, 3.4, mat("#27272a", { metalness: 0.7 }), 0, 5.4, -side + 2);
    box(10, 8, 8, mat("#3f3f46"), -D / 5, 4.4, side - 2);
    box(8, 0.6, 6, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.1, 0.2) }), -D / 5, 8.7, side - 2);
    // Swords on the wall.
    for (let i = 0; i < 4; i++) {
      const blade = box(0.4, 9, 0.9, mat("#cbd5e1", { metalness: 0.8, roughness: 0.3 }), D / 8 + i * 5, 18, side + 4.6);
      blade.rotation.x = 0.15;
    }
  } else if (kind === "market") {
    // Shelves of strange, glowing fruit and locked crates.
    const shelf = mat("#3b2716");
    for (let k = 0; k < 3; k++) box(D * 0.45, 0.8, 5, shelf, 0, 6 + k * 7, side + 2);
    const fruitCols = ["#c084fc", "#f472b6", "#fbbf24", "#60a5fa", "#4ade80"];
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 6; i++) {
        const c = new THREE.Color(fruitCols[(i + k) % fruitCols.length]).multiplyScalar(1.6);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), new THREE.MeshBasicMaterial({ color: c }));
        orb.position.set(-D * 0.2 + i * (D * 0.08), 7.8 + k * 7, side + 2);
        group.add(orb);
      }
    }
    for (let i = 0; i < 3; i++) box(6, 6, 6, mat("#5a3f28"), -D / 6 + i * 8, 3.4, -side + 2);
  } else {
    if (kind === "shop") {
      // Sacks, barrels of biscuit, and strings of fish.
      for (let i = 0; i < 4; i++) {
        const sack = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), mat("#c2a878"));
        sack.scale.set(1, 1.2, 1);
        sack.position.set(-D / 4 + i * 7, 3.2, -side + 2);
        group.add(sack);
      }
      for (let k = 0; k < 2; k++) box(D * 0.45, 0.8, 5, mat("#3b2716"), 0, 8 + k * 8, side + 2);
      for (let i = 0; i < 6; i++) {
        const fish = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4, 6), mat("#9ca3af", { metalness: 0.4 }));
        fish.rotation.z = Math.PI / 2;
        fish.position.set(-D * 0.18 + i * (D * 0.07), 10, side + 2);
        group.add(fish);
      }
    }
    // Tavern: barrels, tables and stools, mugs.
    for (let i = 0; i < 4; i++) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 6, 12), mat("#6b4423"));
      barrel.position.set(-D / 4 + i * 6, 3.4, side);
      group.add(barrel);
    }
    for (const [tx, tz] of [
      [-D / 10, -Wd / 5],
      [D / 6, -Wd / 5],
    ]) {
      box(8, 0.8, 8, mat("#7a5230"), tx, 7, tz);
      box(1.2, 6.6, 1.2, mat("#5a3a20"), tx, 3.7, tz);
      for (const [sx, sz] of [
        [6, 0],
        [-6, 0],
      ]) {
        const stool = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 4.4, 8), mat("#5a3a20"));
        stool.position.set(tx + sx, 2.6, tz + sz);
        group.add(stool);
      }
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 8), mat("#d6d3d1"));
      mug.position.set(tx + 1.5, 8.2, tz + 1);
      group.add(mug);
    }
  }

  // The price board on the back wall, above the counter.
  const width = Math.min(Wd * 0.8, 46);
  const height = Math.min(26, H - 14);
  const anchor = new THREE.Object3D();
  anchor.position.set(back + 1.2, Math.min(25, H - 3 - height / 2), -counterW * 0.08);
  anchor.rotation.y = Math.PI / 2;
  group.add(anchor);
  return { group, board: { anchor, width, height } };
}

/** Free a store's insides (its own shapes and materials; shared textures stay). */
export function disposeInterior(g: THREE.Group) {
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.panel) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
}
