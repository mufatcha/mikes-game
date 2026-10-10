import { PLAYER_RADIUS } from "../shared/constants";
import { MAP_HEIGHT, MAP_WIDTH, WALLS, type Point } from "../shared/map";
import { hasLineOfSight } from "../shared/physics";

const CELL = 20;
const COLS = Math.ceil(MAP_WIDTH / CELL);
const ROWS = Math.ceil(MAP_HEIGHT / CELL);
const INFLATE = PLAYER_RADIUS + 3;

const blocked = new Uint8Array(COLS * ROWS);

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const x = c * CELL + CELL / 2;
    const y = r * CELL + CELL / 2;
    let b = x < INFLATE || y < INFLATE || x > MAP_WIDTH - INFLATE || y > MAP_HEIGHT - INFLATE;
    for (const w of WALLS) {
      if (b) break;
      b =
        x > w.x - INFLATE && x < w.x + w.w + INFLATE && y > w.y - INFLATE && y < w.y + w.h + INFLATE;
    }
    blocked[r * COLS + c] = b ? 1 : 0;
  }
}

function cellIndex(x: number, y: number) {
  const c = Math.min(COLS - 1, Math.max(0, Math.floor(x / CELL)));
  const r = Math.min(ROWS - 1, Math.max(0, Math.floor(y / CELL)));
  return r * COLS + c;
}

function center(i: number): Point {
  return { x: (i % COLS) * CELL + CELL / 2, y: Math.floor(i / COLS) * CELL + CELL / 2 };
}

/** Breadth-first search outward for the closest walkable cell. */
function nearestOpen(i: number): number {
  if (!blocked[i]) return i;
  const seen = new Uint8Array(COLS * ROWS);
  const queue = [i];
  seen[i] = 1;
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q];
    if (!blocked[cur]) return cur;
    const c = cur % COLS;
    const r = Math.floor(cur / COLS);
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const n = nr * COLS + nc;
      if (!seen[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  return i;
}

class MinHeap {
  private items: number[] = [];
  constructor(private score: Float32Array) {}
  get size() {
    return this.items.length;
  }
  push(v: number) {
    const a = this.items;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.score[a[p]] <= this.score[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const NEIGHBORS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** A* over the walkable grid, then smoothed. Returns waypoints excluding the start. */
export function findPath(from: Point, to: Point): Point[] {
  const start = nearestOpen(cellIndex(from.x, from.y));
  const goal = nearestOpen(cellIndex(to.x, to.y));
  if (start === goal) return [to];

  const n = COLS * ROWS;
  const g = new Float32Array(n).fill(Infinity);
  const f = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const gc = goal % COLS;
  const gr = Math.floor(goal / COLS);
  const h = (i: number) => Math.hypot((i % COLS) - gc, Math.floor(i / COLS) - gr);

  const open = new MinHeap(f);
  g[start] = 0;
  f[start] = h(start);
  open.push(start);

  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const c = cur % COLS;
    const r = Math.floor(cur / COLS);
    for (const [dc, dr, cost] of NEIGHBORS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const ni = nr * COLS + nc;
      if (blocked[ni] || closed[ni]) continue;
      // No corner cutting.
      if (dc !== 0 && dr !== 0 && (blocked[r * COLS + nc] || blocked[nr * COLS + c])) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        f[ni] = ng + h(ni);
        came[ni] = cur;
        open.push(ni);
      }
    }
  }

  if (came[goal] === -1) return [to];

  const cells: Point[] = [];
  for (let i = goal; i !== start && i !== -1; i = came[i]) cells.push(center(i));
  cells.reverse();
  cells[cells.length - 1] = to;
  return smooth(from, cells);
}

function smooth(from: Point, pts: Point[]): Point[] {
  const out: Point[] = [];
  let anchor = from;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !hasLineOfSight(anchor.x, anchor.y, pts[j].x, pts[j].y, PLAYER_RADIUS)) j--;
    out.push(pts[j]);
    anchor = pts[j];
    i = j + 1;
  }
  return out;
}

export function isOpen(p: Point) {
  return !blocked[cellIndex(p.x, p.y)];
}
