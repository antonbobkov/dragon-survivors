// Spatial hash over enemy centres (§15). Cells are GRID_CELL px, keyed by a packed integer.
import { GRID_CELL } from './content.js';

const OFFSET = 32768; // cell coords in [-32768, 32767] -> 16 bits each
const key = (cx, cy) => (cx + OFFSET) * 65536 + (cy + OFFSET);
const cellScratch = [];

export class Grid {
  constructor(cell = GRID_CELL) {
    this.cell = cell;
    this.cells = new Map();
    this.used = [];
    this.maxR = 0; // largest radius among inserted items, so queries can add it as a margin
  }

  clear() {
    if (this.cells.size > 4096) this.cells.clear();
    else for (const arr of this.used) arr.length = 0;
    this.used.length = 0;
    this.maxR = 0;
  }

  insert(item) {
    const k = key(Math.floor(item.x / this.cell), Math.floor(item.y / this.cell));
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    if (arr.length === 0) this.used.push(arr);
    arr.push(item);
    if (item.r > this.maxR) this.maxR = item.r;
  }

  build(items) {
    this.clear();
    for (const item of items) this.insert(item);
  }

  // The non-empty cell arrays touching the square around (x, y) +- radius, in a fixed order.
  // Callers must not modify them.
  cellsNear(x, y, radius, out = []) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - radius) / c), x1 = Math.floor((x + radius) / c);
    const y0 = Math.floor((y - radius) / c), y1 = Math.floor((y + radius) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(key(cx, cy));
        if (arr && arr.length) out.push(arr);
      }
    }
    return out;
  }

  // Candidates whose centre lies in a cell touching the square around (x, y) +- radius.
  // A superset of the items within `radius`; callers do the circle test.
  nearby(x, y, radius, out = []) {
    const cells = this.cellsNear(x, y, radius, cellScratch);
    out.length = 0;
    for (const arr of cells) for (let i = 0; i < arr.length; i++) out.push(arr[i]);
    return out;
  }
}
