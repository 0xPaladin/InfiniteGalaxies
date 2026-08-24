// Shared live-binding state for the generation pipeline.
// Modules import these bindings (live in ES modules) and read them at call-time.
// main.js updates them via the setters below.

export let grid = null;
export let pack = null;
export let seed = null;
export let graphWidth = 1000;
export let graphHeight = 1000;

export const config = {
  seed: null,
  cells: 20000,
  template: null,
  width: 5000,
  height: 5000,
  tempRange: [0, 12, 20], // [north edge, center, south edge] in °C
  prec: 50,
  winds: [225, 45, 90, 90, 45, 225], // Wind directions across vertical tiers (N to S)
  heightExponent: 1,
  lakeElevationLimit: 5,
  resolveDepressionsSteps: 100,
  //planet data
  planetRadius: 6371, // Planet radius in km (Earth default = 6,371 km)
  nPlates: 30,
  mountainPower: 1  //was 1.2
};

export const setGrid = g => {
  grid = g;
};
export const setPack = p => {
  pack = p;
};
export const setSeed = s => {
  seed = s;
};
export const setGraphSize = (w, h) => {
  graphWidth = w;
  graphHeight = h;
};
