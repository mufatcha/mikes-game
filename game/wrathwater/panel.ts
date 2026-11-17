/**
 * A board in the 3D world you point at with a VR hand: a title and a list of
 * rows, each optionally something you can pick with the trigger. Used for the
 * price boards inside Blackwater Cove's stores and the list in your backpack.
 */
import * as THREE from "three";

export interface PanelRow {
  text: string;
  /** Shown on the right: a price, a count. */
  right?: string;
  /** A smaller second line. */
  sub?: string;
  color?: string;
  /** A section heading (never picked). */
  header?: boolean;
  /** Greyed out: can't be picked right now (and says why in `sub`). */
  disabled?: boolean;
  /** What picking it does. Rows without one are just information. */
  act?: () => void;
}

const PX_W = 1024;

export class WorldPanel {
  readonly mesh: THREE.Mesh;
  private canvas = document.createElement("canvas");
  private tex: THREE.CanvasTexture;
  private title = "";
  private subtitle = "";
  rows: PanelRow[] = [];
  private hover = -1;
  private sig = "";
  private layout = { top: 0, rowH: 1, cols: 1, perCol: 1 };

  constructor(width: number, height: number, private maxRows = 8) {
    this.canvas.width = PX_W;
    this.canvas.height = Math.round((PX_W * height) / width);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    this.mesh.userData.panel = this;
  }

  /** Replace what the board shows (it only redraws when something changed). */
  set(title: string, subtitle: string, rows: PanelRow[]) {
    this.title = title;
    this.subtitle = subtitle;
    this.rows = rows;
    if (this.hover >= rows.length) this.hover = -1;
    this.redraw();
  }

  /** Highlight the row a hand is pointing at (-1 for none). */
  setHover(i: number) {
    if (i === this.hover) return;
    this.hover = i;
    this.redraw();
  }

  /** The row (that can be picked) at a point on the board, from a raycast's uv; -1 if none. */
  rowAt(uv: THREE.Vector2) {
    const y = (1 - uv.y) * this.canvas.height;
    if (y < this.layout.top) return -1;
    const row = Math.floor((y - this.layout.top) / this.layout.rowH);
    const col = this.layout.cols > 1 && uv.x >= 0.5 ? 1 : 0;
    if (row >= this.layout.perCol) return -1;
    const i = col * this.layout.perCol + row;
    const r = this.rows[i];
    return r && !r.header && !r.disabled && r.act ? i : -1;
  }

  private redraw() {
    const sig = JSON.stringify([this.title, this.subtitle, this.hover, this.rows.map((r) => [r.text, r.right, r.sub, r.color, r.header, r.disabled, !!r.act])]);
    if (sig === this.sig) return;
    this.sig = sig;
    const g = this.canvas.getContext("2d")!;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    // Dark wood with a brass frame.
    g.fillStyle = "#1c120a";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#b8860b";
    g.lineWidth = 12;
    g.strokeRect(6, 6, W - 12, H - 12);
    g.textBaseline = "middle";
    g.fillStyle = "#fde68a";
    g.font = "bold 58px Georgia, serif";
    g.textAlign = "left";
    g.fillText(this.title, 40, 62, W - 80);
    g.fillStyle = "#d6d3d1";
    g.font = "28px sans-serif";
    g.fillText(this.subtitle, 40, 116, W - 80);
    const top = 150;
    // Too many rows to read in one column: split them into two.
    const fit = Math.floor((H - top - 24) / 56);
    const cols = this.rows.length > Math.max(this.maxRows, fit) ? 2 : 1;
    const perCol = Math.ceil(this.rows.length / cols);
    const rowH = Math.max(cols > 1 ? 44 : 56, Math.min(96, (H - top - 24) / Math.max(this.maxRows, perCol)));
    this.layout = { top, rowH, cols, perCol };
    const colW = (W - 48) / cols;
    this.rows.forEach((r, i) => {
      const c = Math.floor(i / perCol);
      const y = top + (i % perCol) * rowH;
      const x0 = 24 + c * colW;
      const pickable = !r.header && !r.disabled && !!r.act;
      if (i === this.hover && pickable) {
        g.fillStyle = "rgba(245,158,11,0.35)";
        g.fillRect(x0, y + 3, colW - 8, rowH - 6);
        g.strokeStyle = "#fbbf24";
        g.lineWidth = 4;
        g.strokeRect(x0, y + 3, colW - 8, rowH - 6);
      } else if (pickable) {
        g.fillStyle = "rgba(255,255,255,0.06)";
        g.fillRect(x0, y + 3, colW - 8, rowH - 6);
      }
      const textW = colW - 220;
      const right = x0 + colW - 28;
      const big = Math.round(rowH * (r.sub ? 0.4 : 0.48));
      g.textAlign = "left";
      g.fillStyle = r.disabled ? "#71717a" : r.header ? "#fbbf24" : (r.color ?? "#f4f4f5");
      g.font = `${r.header ? "bold " : pickable ? "bold " : ""}${big}px sans-serif`;
      g.fillText(r.text, x0 + 20, y + (r.sub ? rowH * 0.36 : rowH / 2), textW);
      if (r.sub) {
        g.fillStyle = r.disabled ? "#52525b" : "#a1a1aa";
        g.font = `${Math.round(rowH * 0.28)}px sans-serif`;
        g.fillText(r.sub, x0 + 20, y + rowH * 0.74, textW);
      }
      if (r.right) {
        g.textAlign = "right";
        g.fillStyle = r.disabled ? "#71717a" : "#fcd34d";
        g.font = `bold ${big}px sans-serif`;
        g.fillText(r.right, right, y + rowH / 2, 200);
      }
    });
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.tex.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
