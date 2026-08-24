// Shared orbital layout helper — assigns a deterministic {au, angleDeg, x, y}
// position to an orbiting body. Layout is generation, not display
// (IMPLEMENTATION_PLAN.md §0): renderers only ever project x/y (or au/angleDeg)
// into screen space, they never invent positions. Used by galaxy/system.js (star +
// planets) and galaxy/planet.js (moons around their parent planet).

const GOLDEN_ANGLE = 137.50776405; // deg — deterministic, well-spread orbital placement

export function layoutPosition(au, index) {
  const angleDeg = (index * GOLDEN_ANGLE) % 360;
  const rad = angleDeg * Math.PI / 180;
  return {
    au,
    angleDeg,
    x: +(au * Math.cos(rad)).toFixed(4),
    y: +(au * Math.sin(rad)).toFixed(4)
  };
}
