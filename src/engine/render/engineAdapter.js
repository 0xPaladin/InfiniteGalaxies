import * as THREE from 'three';
import {
  SPECTRAL_COLORS, SPECTRAL_DEFAULTS, SUN_DEFAULTS,
} from '../constants/defaults.js';
import { generateSunSphereMaterial, generateSunGlowGeometry, createSunGlowMaterial } from './sun-shaders.js';
import { rebuildColormapTexture } from './colormap-texture.js';
import { createPlanetSurfaceMaterial, createGasGiantMaterial } from './shaders.js';
import {
  setSeed, setN, setJitter, setPlanetType, setBarrenSubtype, generateMesh, quadGeometry,
} from '../system/planet.js';

const LOD_CONFIG = {
  low: { N: 1000, sphereSegs: 12 },
  medium: { N: 3000, sphereSegs: 20 },
  high: { N: 20000, sphereSegs: 48 },
};

export function getPlanetEngineType(planet) {
  if (planet.classification === 'gas giant' || planet.classification === 'brown dwarf') {
    return 'gasgiant';
  }
  const atmo = planet.atmosphere || '';
  if (atmo === 'Trace') return 'airless';
  if (['Corrosive', 'Toxic', 'Crushing'].includes(atmo)) return 'barren';
  if (planet.HI <= 2) return 'earthlike';
  if (planet.HI <= 4) return 'barren';
  return 'airless';
}

const HOSTILE_ATMOS = ['Corrosive', 'Toxic', 'Crushing'];

export function createStarGroup(starData, seed) {
  const spectralClass = starData.starClass || 'G';
  const spectralColorHex = SPECTRAL_COLORS[spectralClass] || '#ffffff';
  const spectralColor = new THREE.Color(spectralColorHex);

  const spectralOverrides = SPECTRAL_DEFAULTS[spectralClass] || {};
  const params = { ...SUN_DEFAULTS, ...spectralOverrides, spectralColor };

  const group = new THREE.Group();

  const sphereMat = generateSunSphereMaterial(spectralColor);
  sphereMat.uniforms.uBrightness.value = params.sphereBrightness;
  sphereMat.uniforms.uNoiseScale.value = params.noiseScale;
  sphereMat.uniforms.uGlowPower.value = params.glowPower;
  sphereMat.uniforms.uFresnelPower.value = params.fresnelPower;
  const sphereGeom = new THREE.SphereGeometry(1, 64, 64);
  const sphereMesh = new THREE.Mesh(sphereGeom, sphereMat);
  group.add(sphereMesh);

  const glowGeom = generateSunGlowGeometry();
  const glowMat = createSunGlowMaterial({
    tint: params.glowTint,
    brightness: params.glowBrightness,
    falloffColor: params.glowFalloff,
    radius: params.glowRadius,
    spectralColor,
  });
  const glowMesh = new THREE.Mesh(glowGeom, glowMat);
  glowMat.userData.baseRadius = params.glowRadius;
  group.add(glowMesh);

  const state = {
    sphereMat, glowMat,
    sphereGeom, glowGeom,
    sphereMesh, glowMesh,
  };

  group.userData.__starState = state;
  group.userData.__type = 'star';

  return group;
}

export function disposeStarGroup(group) {
  if (!group || !group.userData.__starState) return;
  const s = group.userData.__starState;
  Object.values(s).forEach(obj => {
    if (obj instanceof THREE.Material) obj.dispose();
    if (obj instanceof THREE.BufferGeometry) obj.dispose();
  });
  group.userData.__starState = null;
}

export function createPlanetGlowSprite(color, radius) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.3)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: color || '#ffffff',
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(radius * 3);
  return sprite;
}

export function createPlanetMesh(planet, lod = 'medium') {
  const config = LOD_CONFIG[lod] || LOD_CONFIG.medium;
  const engineType = getPlanetEngineType(planet);

  if (engineType === 'gasgiant') {
    return createGasGiantMesh(planet, config);
  }

  const seedNum = planet.seed ? planet.seed.split('.').reduce((a, s) => a + s.charCodeAt(0), 0) : planet._seed ? planet._seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : Date.now();

  const barrenSubtype = engineType === 'barren' && HOSTILE_ATMOS.includes(planet.atmosphere) ? 'hostile' : 'barren';
  setSeed(seedNum);
  setN(config.N);
  setJitter(0.5);
  setPlanetType(engineType);
  setBarrenSubtype(barrenSubtype);
  generateMesh();

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(quadGeometry.xyz), 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(quadGeometry.tm), 2));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(quadGeometry.I), 1));

  const colormapTex = rebuildColormapTexture(engineType);
  const mat = createPlanetSurfaceMaterial();
  mat.uniforms.u_colormap.value = colormapTex;

  const mesh = new THREE.Mesh(geom, mat);
  mesh.scale.setScalar(1);
  mesh.userData.__engineType = engineType;
  mesh.userData.__type = 'planet';
  mesh.userData.__seed = seedNum;

  const glow = createPlanetGlowSprite(new THREE.Color(planet.color || '#888888'), 1);
  glow.position.set(0, 0, 0);

  const group = new THREE.Group();
  group.add(mesh);
  group.add(glow);
  group.userData.__planetData = { mesh, glow, mat, geom };
  group.userData.__type = 'planetGroup';

  return group;
}

export function upgradePlanetMesh(planetGroup, planet, onComplete) {
  const oldData = planetGroup.userData.__planetData;
  if (!oldData) return;
  const oldMesh = oldData.mesh;

  // Gas giants use a procedural shader — no terrain mesh to upgrade
  if (oldMesh.userData.__type === 'gasgiant') {
    if (onComplete) onComplete(oldMesh);
    return;
  }

  const seedNum = oldMesh.userData.__seed;
  const engineType = oldMesh.userData.__engineType || 'earthlike';
  const config = LOD_CONFIG.high;
  const barrenSubtype = engineType === 'barren' && planet && HOSTILE_ATMOS.includes(planet.atmosphere) ? 'hostile' : 'barren';

  setSeed(seedNum);
  setN(config.N);
  setJitter(0.75);
  setPlanetType(engineType);
  setBarrenSubtype(barrenSubtype);
  generateMesh();

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(quadGeometry.xyz), 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(quadGeometry.tm), 2));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(quadGeometry.I), 1));

  const colormapTex = rebuildColormapTexture(engineType);
  const mat = createPlanetSurfaceMaterial();
  mat.uniforms.u_colormap.value = colormapTex;

  const scale = oldMesh.scale.x;
  const newMesh = new THREE.Mesh(geom, mat);
  newMesh.scale.setScalar(scale);
  newMesh.userData.__type = 'planet';
  newMesh.userData.__seed = seedNum;
  newMesh.userData.__engineType = engineType;

  planetGroup.remove(oldMesh);
  oldMesh.geometry.dispose();
  if (oldMesh.material) {
    if (oldMesh.material.uniforms?.u_colormap?.value) {
      oldMesh.material.uniforms.u_colormap.value.dispose();
    }
    oldMesh.material.dispose();
  }

  planetGroup.add(newMesh);
  planetGroup.userData.__planetData.mesh = newMesh;
  planetGroup.userData.__planetData.mat = mat;
  planetGroup.userData.__planetData.geom = geom;

  if (onComplete) onComplete(newMesh);
}

function createGasGiantMesh(planet, config) {
  const seedNum = planet.seed ? planet.seed.split('.').reduce((a, s) => a + s.charCodeAt(0), 0) : Date.now();
  const sceneRadius = 3;

  const gradient = planet._gradient || [
    [0, '#888888'],
    [0.5, '#aa8866'],
    [1, '#665544'],
  ];

  const toColor = v => v && typeof v === 'object' && v.r != null
    ? new THREE.Color(v.r / 255, v.g / 255, v.b / 255)
    : new THREE.Color(v || '#888888');
  const colorA = toColor(gradient[0]?.[1]);
  const colorB = toColor(gradient[1]?.[1]);
  const colorC = toColor(gradient[2]?.[1]);

  const gasMat = createGasGiantMaterial({
    scale: 1,
    turbulence: 2,
    blur: 0.5,
    colorA,
    colorB,
    colorC,
    seed: seedNum,
  });

  const segs = config.sphereSegs || 20;
  const geom = new THREE.SphereGeometry(1, segs, segs);

  const mesh = new THREE.Mesh(geom, gasMat);
  mesh.scale.setScalar(sceneRadius);
  mesh.userData.__type = 'gasgiant';
  mesh.userData.__seed = seedNum;
  mesh.userData.__engineType = 'gasgiant';

  const glow = createPlanetGlowSprite(colorA, sceneRadius);
  glow.position.set(0, 0, 0);

  const group = new THREE.Group();
  group.add(mesh);
  group.add(glow);
  group.userData.__planetData = { mesh, glow, mat: gasMat, geom };
  group.userData.__type = 'planetGroup';

  return group;
}

export function createMoonMesh(moon, lod = 'low') {
  const config = LOD_CONFIG[lod] || LOD_CONFIG.low;
  const seedNum = moon.seed ? moon.seed.split('.').reduce((a, s) => a + s.charCodeAt(0), 0) : Date.now();
  const engineType = getPlanetEngineType(moon);
  const barrenSubtype = engineType === 'barren' && HOSTILE_ATMOS.includes(moon.atmosphere) ? 'hostile' : 'barren';

  setSeed(seedNum);
  setN(config.N);
  setJitter(0.3);
  setPlanetType(engineType);
  setBarrenSubtype(barrenSubtype);
  generateMesh();

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(quadGeometry.xyz), 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(quadGeometry.tm), 2));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(quadGeometry.I), 1));

  const colormapTex = rebuildColormapTexture(engineType);
  const mat = createPlanetSurfaceMaterial();
  mat.uniforms.u_colormap.value = colormapTex;

  const mesh = new THREE.Mesh(geom, mat);
  mesh.scale.setScalar(0.5);
  mesh.userData.__type = 'moon';

  const group = new THREE.Group();
  group.add(mesh);
  group.userData.__planetData = { mesh, mat, geom };
  group.userData.__type = 'planetGroup';

  return group;
}

export function disposePlanetGroup(group) {
  if (!group || !group.userData.__planetData) return;
  const d = group.userData.__planetData;
  if (d.mesh) {
    d.mesh.geometry?.dispose();
    if (d.mesh.material) {
      if (d.mesh.material.uniforms?.u_colormap?.value) {
        d.mesh.material.uniforms.u_colormap.value.dispose();
      }
      d.mesh.material.dispose();
    }
  }
  if (d.glow) {
    if (d.glow.material?.map) d.glow.material.map.dispose();
    if (d.glow.material) d.glow.material.dispose();
  }
  if (d.mat && d.mat !== d.mesh?.material) {
    d.mat.dispose();
  }
  group.userData.__planetData = null;
}

export function updateStarUniforms(group, camera) {
  if (!group || !group.userData.__starState) return;
  const s = group.userData.__starState;
  const t = performance.now() / 1000;
  if (s.sphereMat) s.sphereMat.uniforms.uTime.value = t;
  if (s.glowMat) {
    s.glowMat.uniforms.uCamPos.value.copy(camera.position);
    s.glowMat.uniforms.uCamUp.value.copy(camera.up);
    const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    s.glowMat.uniforms.uViewProjection.value.copy(vp);
    const baseRadius = s.glowMat.userData.baseRadius ?? 1.5;
    const worldScale = group.scale.x || 1;
    s.glowMat.uniforms.uRadius.value = baseRadius * worldScale;
  }
}
