// Single seed-chain contract used by every generator under src/engine/.
// One delimiter, escaped parts, deterministic and collision-free.

const SEP = '|';

function escapePart(part) {
  return String(part).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

/**
 * Derive a child seed from a parent seed + a kind label + free-form parts
 * (index, name, etc). Use for a single labeled child, e.g. one system in a sector.
 *
 * childSeed('GALAXY', 'system', 3) -> "GALAXY|system|3"
 */
export function childSeed(parentSeed, ...parts) {
  return [parentSeed, ...parts.map(escapePart)].join(SEP);
}

/**
 * Derive a child seed from a parent seed + a kind label + coordinates.
 * Use for grid-addressed children, e.g. a sector at (gx,gy) or a region at (rx,ry).
 *
 * coordSeed('GALAXY', 'sector', 3, -2) -> "GALAXY|sector|3,-2"
 */
export function coordSeed(parentSeed, kind, ...coords) {
  return childSeed(parentSeed, kind, coords.join(','));
}
