// Shared projection + hit-testing machinery for rogue renderers.
// Pure: world coordinates -> grid cells. No ROT / DOM dependency.
//
// Per IMPLEMENTATION_PLAN.md §0, renderers never write hit-test data back onto
// the generated object — they return a TileIndex instead.

export class TileIndex {
  constructor() {
    this._map = new Map(); // "x,y" -> item[]
  }

  key(x, y) {
    return x + ',' + y;
  }

  add(x, y, item) {
    const k = this.key(x, y);
    const arr = this._map.get(k);
    if (arr) arr.push(item);
    else this._map.set(k, [item]);
  }

  /** All items at a tile (empty array if none). */
  at(x, y) {
    return this._map.get(this.key(x, y)) || [];
  }

  /** True if more than one item shares a tile. */
  isStacked(x, y) {
    return this.at(x, y).length > 1;
  }
}

/**
 * Project a list of world-space items onto an integer width×height grid.
 *
 * @param {Array} items
 * @param {Object} opts
 * @param {(item)=>{x:number,y:number}} opts.getPos - world position accessor
 * @param {{minX,maxX,minY,maxY}} opts.srcBounds - world-space bounds to map from
 * @param {number} opts.width - destination grid width (cells)
 * @param {number} opts.height - destination grid height (cells)
 * @returns {TileIndex}
 */
export function project(items, { getPos, srcBounds, width, height }) {
  const { minX, maxX, minY, maxY } = srcBounds;
  const spanX = (maxX - minX) || 1;
  const spanY = (maxY - minY) || 1;

  const index = new TileIndex();
  items.forEach(item => {
    const { x, y } = getPos(item);
    const nx = (x - minX) / spanX; // 0..1
    const ny = (y - minY) / spanY; // 0..1
    const gx = Math.min(width - 1, Math.max(0, Math.floor(nx * width)));
    const gy = Math.min(height - 1, Math.max(0, Math.floor(ny * height)));
    index.add(gx, gy, item);
  });
  return index;
}

/** Convenience: symmetric bounds [-r, r] on both axes (sphere-projected sectors). */
export function radialBounds(r) {
  return { minX: -r, maxX: r, minY: -r, maxY: r };
}

/** Convenience: origin-anchored bounds [0, w] x [0, h] (prism-projected sectors). */
export function rectBounds(w, h) {
  return { minX: 0, maxX: w, minY: 0, maxY: h };
}
