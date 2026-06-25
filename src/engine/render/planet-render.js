import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  SPECTRAL_COLORS, SPECTRAL_DEFAULTS, SUN_DEFAULTS,
  GAS_GIANT_DEFAULTS, SHADER_DEFAULTS,
} from '../constants/defaults.js';
import { generateSunSphereMaterial, generateSunGlowGeometry, createSunGlowMaterial } from './sun-shaders.js';
import { getData as getColormapData, width, height } from '../constants/colormap.js';
import {
  createPlanetSurfaceMaterial, createLineMaterial, createOverlayMaterial,
  createCloudMaterial, createGasGiantMaterial,
} from './planet-shaders.js';
import {
  generateVoronoiGeometry,
} from '../system/we-planet.js';

function makeDataTexture(data) {
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
}

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

  planet.generatePlanet({ N: config.N, jitter: 0.5 });
  const qd = planet._quadData;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(qd.xyz), 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(qd.tm), 2));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(qd.I), 1));

  const colormapTex = makeDataTexture(getColormapData(engineType));
  const mat = createPlanetSurfaceMaterial();
  mat.uniforms.u_colormap.value = colormapTex;

  const mesh = new THREE.Mesh(geom, mat);
  mesh.scale.setScalar(1);
  mesh.userData.__engineType = engineType;
  mesh.userData.__type = 'planet';
  mesh.userData.__seed = planet._seedToNum();

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

  const config = LOD_CONFIG.high;
  planet.generatePlanet({ N: config.N, jitter: 0.75 });
  const qd = planet._quadData;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(qd.xyz), 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(qd.tm), 2));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(qd.I), 1));

  const engineType = planet._engineType;
  const colormapTex = makeDataTexture(getColormapData(engineType));
  const mat = createPlanetSurfaceMaterial();
  mat.uniforms.u_colormap.value = colormapTex;

  const scale = oldMesh.scale.x;
  const newMesh = new THREE.Mesh(geom, mat);
  newMesh.scale.setScalar(scale);
  newMesh.userData.__type = 'planet';
  newMesh.userData.__seed = planet._seedToNum();
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
  const engineType = getPlanetEngineType(moon);

  moon.generatePlanet({ N: config.N, jitter: 0.3 });
  const qd = moon._quadData;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(qd.xyz), 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(qd.tm), 2));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(qd.I), 1));

  const colormapTex = makeDataTexture(getColormapData(engineType));
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

/* ========== WE renderer integration ========== */

let renderer, scene, camera, controls;
let planetMaterial, lineMaterial, overlayMaterial;

let quadsMesh = null;
let centroidMesh = null;
let gasGiantMesh = null;
let gasGiantMaterial = null;
let riversLine = null;
let plateVectorLines = null;
let plateBoundaryLines = null;
let overlayMesh = null;
let stateBorderLines = null;
let stateOverlayMesh = null;
let provinceOverlayMesh = null;
let provinceBorderLines = null;
let burgOverlayGroup = null;
let cloudMesh = null;
let cloudMaterial = null;

let sunGroup = null;
let sunSphereMaterial = null;
let sunGlowMesh = null;

let currentDrawMode = 'quads';
let _initialized = false;

// Return the Three.js PerspectiveCamera
export function getCamera() {
    return camera;
}

// Return the Three.js WebGLRenderer
export function getRenderer() {
    return renderer;
}

// Return the OrbitControls instance
export function getControls() {
    return controls;
}

// Set camera azimuth angle (radians) from initial planet rotation
export function setCameraRotation(angle) {
    const radius = 2.5;
    controls.azimuthAngle = -angle;
    controls.update();
}

// Initialize Three.js renderer, scene, camera, OrbitControls, and default materials
export function initRenderer(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(canvas.width, canvas.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080c);

    camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 50);
    camera.position.set(0, 0, 2.5);

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.5;
    controls.minDistance = 0.8;
    controls.maxDistance = 8;
    controls.target.set(0, 0, 0);
    controls.update();

    planetMaterial = createPlanetSurfaceMaterial();
    lineMaterial = createLineMaterial();
    overlayMaterial = createOverlayMaterial();

    _initialized = true;
}

let _gasGiantParams = {
    scale: GAS_GIANT_DEFAULTS.scale,
    turbulence: GAS_GIANT_DEFAULTS.turbulence,
    blur: GAS_GIANT_DEFAULTS.blur,
    colorA: new THREE.Color(GAS_GIANT_DEFAULTS.colorA),
    colorB: new THREE.Color(GAS_GIANT_DEFAULTS.colorB),
    colorC: new THREE.Color(GAS_GIANT_DEFAULTS.colorC),
    seed: 0,
};

// Update gas giant procedural uniforms (scale, turbulence, blur, colors, seed) on live material
export function updateGasGiantParams(params) {
    Object.assign(_gasGiantParams, params);
    if (gasGiantMaterial) {
        const p = _gasGiantParams;
        gasGiantMaterial.uniforms.u_scale.value = p.scale;
        gasGiantMaterial.uniforms.u_turbulence.value = p.turbulence;
        gasGiantMaterial.uniforms.u_blur.value = p.blur;
        gasGiantMaterial.uniforms.u_colorA.value.copy(p.colorA);
        gasGiantMaterial.uniforms.u_colorB.value.copy(p.colorB);
        gasGiantMaterial.uniforms.u_colorC.value.copy(p.colorC);
        gasGiantMaterial.uniforms.u_seed.value = p.seed;
    }
}

let _colormapColorParams = {};

// Regenerate colormap texture for a type with user colors and swap it on the planet material
export function updateColormapColors(type, colors) {
    _colormapColorParams = colors || {};
    const newTexture = makeDataTexture(getColormapData(
        type,
        _colormapColorParams.colorA,
        _colormapColorParams.colorB,
        _colormapColorParams.colorC,
    ));
    if (planetMaterial) {
        if (planetMaterial.uniforms.u_colormap.value) {
            planetMaterial.uniforms.u_colormap.value.dispose();
        }
        planetMaterial.uniforms.u_colormap.value = newTexture;
    }
}

let _clock = new THREE.Clock();

// Per-frame: update controls, animate cloud/star uniforms, sync camera to sun shaders, render scene
export function render() {
    if (!_initialized) return;
    controls.update();
    const t = _clock.getElapsedTime();
    if (cloudMaterial) {
        cloudMaterial.uniforms.u_time.value = t;
    }
    if (sunSphereMaterial) {
        sunSphereMaterial.uniforms.uTime.value = t;
    }
    const vpMatrix = new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix, camera.matrixWorldInverse
    );
    if (sunGlowMesh && sunGlowMesh.material) {
        sunGlowMesh.material.uniforms.uCamPos.value.copy(camera.position);
        sunGlowMesh.material.uniforms.uCamUp.value.copy(camera.up);
        sunGlowMesh.material.uniforms.uViewProjection.value.copy(vpMatrix);
    }
    renderer.render(scene, camera);
}

// Remove object from scene and dispose its geometry
function removeFromScene(obj) {
    if (obj) {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
    }
}

// Rebuild planet 3D mesh: remove old, create quads/centroid/gas-giant/sun geometry and materials
export function rebuildPlanet(meshData, mapData, quadGeom, mode, tempOff, rainOff, waterLvl, planetType) {
    const _mesh = meshData;
    const _map = mapData;

    removeFromScene(quadsMesh);
    removeFromScene(centroidMesh);
    removeFromScene(gasGiantMesh);
    removeFromScene(sunGroup);
    quadsMesh = null;
    centroidMesh = null;
    gasGiantMesh = null;
    gasGiantMaterial = null;
    sunGroup = null;
    sunSphereMaterial = null;

    if (planetType === 'sun') {
        rebuildSun(meshData, mapData, quadGeom, mode);
        return;
    }

    if (planetType === 'gasgiant') {
        const p = _gasGiantParams;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(quadGeom.xyz), 3));
        geom.setIndex(new THREE.BufferAttribute(new Uint32Array(quadGeom.I), 1));
        gasGiantMaterial = createGasGiantMaterial(p);
        gasGiantMesh = new THREE.Mesh(geom, gasGiantMaterial);
        scene.add(gasGiantMesh);
        return;
    }

    if (mode === 'quads') {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(quadGeom.xyz), 3));
        geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(quadGeom.tm), 2));
        geom.setIndex(new THREE.BufferAttribute(new Uint32Array(quadGeom.I), 1));
        quadsMesh = new THREE.Mesh(geom, planetMaterial);
        quadsMesh.visible = true;
        scene.add(quadsMesh);
    } else if (mode === 'centroid') {
        const r_color_fn = (r) => {
            let m = Math.min(1, Math.max(0, _map.r_moisture[r] + (rainOff || 0)));
            let e = _map.r_elevation[r] - (waterLvl || 0);
            if (e > 0) {
                e = (tempOff || 0) > 0 ? e / (1 + (tempOff || 0) * 3) : e * (1 + Math.abs(tempOff || 0) * 2);
            }
            return [e, m];
        };
        const { xyz, tm } = generateVoronoiGeometry(_mesh, _map, r_color_fn);
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(xyz, 3));
        geom.setAttribute('uv', new THREE.BufferAttribute(tm, 2));
        centroidMesh = new THREE.Mesh(geom, planetMaterial);
        centroidMesh.visible = true;
        scene.add(centroidMesh);
    }

    currentDrawMode = mode;
}

// Push updated climate UV data to quads mesh (in-place attribute update, no geometry rebuild)
export function updateClimate(quadGeom) {
    if (gasGiantMesh || sunGroup) return;
    if (quadsMesh && quadsMesh.geometry) {
        const uvAttr = quadsMesh.geometry.attributes.uv;
        uvAttr.array.set(quadGeom.tm);
        uvAttr.needsUpdate = true;
    }
    if (centroidMesh && centroidMesh.geometry) {
    }
}

// Check whether a mesh exists for the given draw mode
export function hasMesh(mode) {
    return mode === 'quads' ? !!quadsMesh : !!centroidMesh;
}

let _sunParams = {
    glowTint: SUN_DEFAULTS.glowTint,
    glowBrightness: SUN_DEFAULTS.glowBrightness,
    glowFalloff: SUN_DEFAULTS.glowFalloff,
    glowRadius: SUN_DEFAULTS.glowRadius,
    sphereBrightness: SUN_DEFAULTS.sphereBrightness,
    noiseScale: SUN_DEFAULTS.noiseScale,
    glowPower: SUN_DEFAULTS.glowPower,
    fresnelPower: SUN_DEFAULTS.fresnelPower,
    spectralColor: new THREE.Color(1, 1, 1),
};

// Return the current sun/star parameter object (for GUI binding)
export function getSunParams() { return _sunParams; }

// Update sun/star uniforms on sphere and glow materials
export function updateSunParams(params) {
    Object.assign(_sunParams, params);
    if (_sunParams.spectralColor && !_sunParams.spectralColor.isColor) {
        _sunParams.spectralColor = new THREE.Color(_sunParams.spectralColor);
    }
    if (sunSphereMaterial) {
        sunSphereMaterial.uniforms.uBrightness.value = _sunParams.sphereBrightness;
        sunSphereMaterial.uniforms.uNoiseScale.value = _sunParams.noiseScale;
        sunSphereMaterial.uniforms.uGlowPower.value = _sunParams.glowPower;
        sunSphereMaterial.uniforms.uFresnelPower.value = _sunParams.fresnelPower;
        sunSphereMaterial.uniforms.uSpectralColor.value.copy(_sunParams.spectralColor);
    }
    if (sunGlowMesh && sunGlowMesh.material) {
        sunGlowMesh.material.uniforms.uTint.value = _sunParams.glowTint;
        sunGlowMesh.material.uniforms.uBrightness.value = _sunParams.glowBrightness;
        sunGlowMesh.material.uniforms.uFalloffColor.value = _sunParams.glowFalloff;
        sunGlowMesh.material.uniforms.uRadius.value = _sunParams.glowRadius;
        sunGlowMesh.material.uniforms.uSpectralColor.value.copy(_sunParams.spectralColor);
    }
}

// Build full sun group: procedural sphere material + camera-facing glow
function rebuildSun(meshData, mapData, quadGeom, mode) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(quadGeom.xyz), 3));
    geom.setIndex(new THREE.BufferAttribute(new Uint32Array(quadGeom.I), 1));
    geom.computeVertexNormals();

    sunSphereMaterial = generateSunSphereMaterial(_sunParams.spectralColor);
    sunSphereMaterial.uniforms.uBrightness.value = _sunParams.sphereBrightness;
    sunSphereMaterial.uniforms.uNoiseScale.value = _sunParams.noiseScale;
    sunSphereMaterial.uniforms.uGlowPower.value = _sunParams.glowPower;
    sunSphereMaterial.uniforms.uFresnelPower.value = _sunParams.fresnelPower;
    const sphereMesh = new THREE.Mesh(geom, sunSphereMaterial);

    const glowGeom = generateSunGlowGeometry();
    const glowMat = createSunGlowMaterial({
        tint: _sunParams.glowTint,
        brightness: _sunParams.glowBrightness,
        falloffColor: _sunParams.glowFalloff,
        radius: _sunParams.glowRadius,
        spectralColor: _sunParams.spectralColor,
    });
    sunGlowMesh = new THREE.Mesh(glowGeom, glowMat);

    sunGroup = new THREE.Group();
    sunGroup.add(sphereMesh);
    sunGroup.add(sunGlowMesh);
    scene.add(sunGroup);
}

// Toggle visibility between quads and centroid draw modes
export function setDrawMode(mode) {
    currentDrawMode = mode;
    if (quadsMesh) quadsMesh.visible = (mode === 'quads');
    if (centroidMesh) centroidMesh.visible = (mode === 'centroid');
    if (gasGiantMesh) gasGiantMesh.visible = true;
    if (sunGroup) sunGroup.visible = true;
}

// Build a THREE.LineSegments BufferGeometry from parallel position and RGBA color arrays
function buildLineGeometryFromArrays(positions, colors) {
    const vertCount = positions.length;
    if (vertCount === 0) return null;
    const posArr = new Float32Array(vertCount * 3);
    const colArr = new Float32Array(vertCount * 4);
    for (let i = 0; i < vertCount; i++) {
        posArr[3 * i] = positions[i][0];
        posArr[3 * i + 1] = positions[i][1];
        posArr[3 * i + 2] = positions[i][2];
        colArr[4 * i] = colors[i][0];
        colArr[4 * i + 1] = colors[i][1];
        colArr[4 * i + 2] = colors[i][2];
        colArr[4 * i + 3] = colors[i][3];
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geom.setAttribute('a_rgba', new THREE.BufferAttribute(colArr, 4));
    return geom;
}

// Draw river lines where s_flow > 2, color by flow magnitude; skip non-earthlike types
export function rebuildRivers(meshData, mapData, waterLvl, planetType) {
    removeFromScene(riversLine);
    riversLine = null;

    if (planetType && planetType !== 'earthlike') return;

    const line_xyz = [];
    const line_rgba = [];
    const _mesh = meshData;
    const { t_xyz, s_flow, r_elevation } = mapData;

    for (let s = 0; s < _mesh.numSides; s++) {
        if (s_flow[s] > 2.0) {
            const begin_r = _mesh.s_begin_r(s);
            const end_r = _mesh.s_end_r(s);
            if (r_elevation[begin_r] - waterLvl < 0 && r_elevation[end_r] - waterLvl < 0) continue;
            let flow = 0.3 * Math.sqrt(s_flow[s]);
            const inner_t = _mesh.s_inner_t(s);
            const outer_t = _mesh.s_outer_t(s);
            line_xyz.push(
                t_xyz.slice(3 * inner_t, 3 * inner_t + 3),
                t_xyz.slice(3 * outer_t, 3 * outer_t + 3)
            );
            if (flow > 1) flow = 1;
            const premul = [0.2 * flow, 0.6 * flow, 0.9 * flow, flow];
            line_rgba.push(premul, premul);
        }
    }

    if (line_xyz.length === 0) return;

    const geom = buildLineGeometryFromArrays(line_xyz, line_rgba);
    riversLine = new THREE.LineSegments(geom, lineMaterial);
    scene.add(riversLine);
}

// Create or update translucent noise cloud sphere for barren hostile subtype; skip for other types
export function rebuildCloudSphere(type, seed, barrenSubtype) {
    removeFromScene(cloudMesh);
    cloudMesh = null;
    cloudMaterial = null;

    if (type === 'sun') return;

    const isHostile = type === 'hostile' || (type === 'barren' && barrenSubtype === 'hostile');
    if (!isHostile) return;

    cloudMaterial = createCloudMaterial(seed);
    const geom = new THREE.SphereGeometry(1.008, 48, 24);
    cloudMesh = new THREE.Mesh(geom, cloudMaterial);
    cloudMesh.renderOrder = 1;
    scene.add(cloudMesh);
}

// Regenerate the colormap DataTexture for the given planet type and swap on planet material
export function updateColormapTexture(type) {
    if (type === 'gasgiant' || type === 'sun') return;
    const newTexture = makeDataTexture(getColormapData(
        type,
        _colormapColorParams.colorA,
        _colormapColorParams.colorB,
        _colormapColorParams.colorC,
    ));
    if (planetMaterial) {
        if (planetMaterial.uniforms.u_colormap.value) {
            planetMaterial.uniforms.u_colormap.value.dispose();
        }
        planetMaterial.uniforms.u_colormap.value = newTexture;
    }
}

// Draw white → red arrow lines showing plate movement direction per region
export function rebuildPlateVectors(meshData, mapData) {
    removeFromScene(plateVectorLines);
    plateVectorLines = null;

    const line_xyz = [];
    const line_rgba = [];
    const { r_xyz, r_plate, plate_vec } = mapData;

    for (let r = 0; r < meshData.numRegions; r++) {
        line_xyz.push(r_xyz.slice(3 * r, 3 * r + 3));
        line_rgba.push([1, 1, 1, 1]);
        const dir = new Float32Array(3);
        const base = r_xyz.slice(3 * r, 3 * r + 3);
        const vec = plate_vec[r_plate[r]];
        dir[0] = base[0] + vec[0] * (2 / Math.sqrt(meshData.numRegions));
        dir[1] = base[1] + vec[1] * (2 / Math.sqrt(meshData.numRegions));
        dir[2] = base[2] + vec[2] * (2 / Math.sqrt(meshData.numRegions));
        line_xyz.push([dir[0], dir[1], dir[2]]);
        line_rgba.push([1, 0, 0, 0]);
    }

    const geom = buildLineGeometryFromArrays(line_xyz, line_rgba);
    plateVectorLines = new THREE.LineSegments(geom, lineMaterial);
    scene.add(plateVectorLines);
}

// Draw white lines along edges where adjacent regions belong to different plates
export function rebuildPlateBoundaries(meshData, mapData) {
    removeFromScene(plateBoundaryLines);
    plateBoundaryLines = null;

    const line_xyz = [];
    const line_rgba = [];
    const { t_xyz, r_plate } = mapData;

    for (let s = 0; s < meshData.numSides; s++) {
        const begin_r = meshData.s_begin_r(s);
        const end_r = meshData.s_end_r(s);
        if (r_plate[begin_r] !== r_plate[end_r]) {
            const inner_t = meshData.s_inner_t(s);
            const outer_t = meshData.s_outer_t(s);
            line_xyz.push(
                t_xyz.slice(3 * inner_t, 3 * inner_t + 3),
                t_xyz.slice(3 * outer_t, 3 * outer_t + 3)
            );
            line_rgba.push([1, 1, 1, 1], [1, 1, 1, 1]);
        }
    }

    if (line_xyz.length === 0) return;
    const geom = buildLineGeometryFromArrays(line_xyz, line_rgba);
    plateBoundaryLines = new THREE.LineSegments(geom, lineMaterial);
    scene.add(plateBoundaryLines);
}

// Build culture-colored Voronoi overlay mesh + state border lines from population data
export function rebuildOverlay(meshData, population, mapData) {
    removeFromScene(overlayMesh);
    removeFromScene(stateBorderLines);
    overlayMesh = null;
    stateBorderLines = null;

    if (!population) return;

    const cultureColors = population.cultures.map(c => {
        const hue = (c.i * 0.618033988749895) % 1;
        const r = hue + 1/3, g = hue, b = hue - 1/3;
        const sat = 0.7, light = 0.55;
        function toRgb(t) {
            t = ((t % 1) + 1) % 1;
            const c2 = (1 - Math.abs(2 * light - 1)) * sat;
            const x = c2 * (1 - Math.abs((t * 6) % 2 - 1));
            const m = light - c2 / 2;
            let r2, g2, b2;
            if (t < 1/6) [r2,g2,b2]=[c2,x,0];
            else if (t < 2/6) [r2,g2,b2]=[x,c2,0];
            else if (t < 3/6) [r2,g2,b2]=[0,c2,x];
            else if (t < 4/6) [r2,g2,b2]=[0,x,c2];
            else if (t < 5/6) [r2,g2,b2]=[x,0,c2];
            else [r2,g2,b2]=[c2,0,x];
            return [r2+m, g2+m, b2+m];
        }
        return toRgb(hue);
    });

    const _mesh = meshData;
    const { t_xyz, r_xyz } = mapData;
    const { numSides } = _mesh;

    const xyz = new Float32Array(3 * 3 * numSides);
    const rgb = new Float32Array(3 * 3 * numSides);

    for (let s = 0; s < numSides; s++) {
        const inner_t = _mesh.s_inner_t(s);
        const outer_t = _mesh.s_outer_t(s);
        const begin_r = _mesh.s_begin_r(s);
        const col = cultureColors[population.cellCulture[begin_r]] || [0.2, 0.2, 0.2];

        const i0 = 9 * s;
        const i1 = 9 * s + 3;
        const i2 = 9 * s + 6;
        let l0 = 0, l2 = 0;
        for (let i = 0; i < 3; i++) { const v = t_xyz[3 * inner_t + i]; xyz[i0 + i] = v; l0 += v * v; }
        for (let i = 0; i < 3; i++) { xyz[i1 + i] = r_xyz[3 * begin_r + i]; }
        for (let i = 0; i < 3; i++) { const v = t_xyz[3 * outer_t + i]; xyz[i2 + i] = v; l2 += v * v; }
        l0 = Math.sqrt(l0); l2 = Math.sqrt(l2);
        for (let i = 0; i < 3; i++) { xyz[i0 + i] /= l0; xyz[i2 + i] /= l2; }

        for (let j = 0; j < 3; j++) {
            for (let i = 0; i < 3; i++) { rgb[9 * s + 3 * j + i] = col[i]; }
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(xyz, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    overlayMesh = new THREE.Mesh(geom, overlayMaterial);
    scene.add(overlayMesh);

    const lxyz = [];
    const lrgba = [];
    for (let s = 0; s < numSides; s++) {
        const begin_r = _mesh.s_begin_r(s);
        const end_r = _mesh.s_end_r(s);
        if (population.cellState[begin_r] !== population.cellState[end_r] &&
            population.cellState[begin_r] >= 0 && population.cellState[end_r] >= 0) {
            const inner_t = _mesh.s_inner_t(s);
            const outer_t = _mesh.s_outer_t(s);
            const col = [1, 1, 1, 0.8];
            lxyz.push(t_xyz.slice(3 * inner_t, 3 * inner_t + 3), t_xyz.slice(3 * outer_t, 3 * outer_t + 3));
            lrgba.push(col, col);
        }
    }

    if (lxyz.length > 0) {
        const lineGeom = buildLineGeometryFromArrays(lxyz, lrgba);
        stateBorderLines = new THREE.LineSegments(lineGeom, lineMaterial);
        scene.add(stateBorderLines);
    }
}

// Convert hex color string to [r,g,b] float triple (0-1)
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
}

// Build per-vertex colored Voronoi overlay geometry from a cell→color lookup function
function buildColoredOverlayGeometry(mesh, mapData, cellArray, colorLookup) {
    const _mesh = mesh;
    const { t_xyz, r_xyz } = mapData;
    const { numSides } = _mesh;

    const xyz = new Float32Array(3 * 3 * numSides);
    const rgb = new Float32Array(3 * 3 * numSides);

    for (let s = 0; s < numSides; s++) {
        const inner_t = _mesh.s_inner_t(s);
        const outer_t = _mesh.s_outer_t(s);
        const begin_r = _mesh.s_begin_r(s);
        const col = colorLookup(cellArray[begin_r]);

        const i0 = 9 * s;
        const i1 = 9 * s + 3;
        const i2 = 9 * s + 6;
        let l0 = 0, l2 = 0;
        for (let i = 0; i < 3; i++) { const v = t_xyz[3 * inner_t + i]; xyz[i0 + i] = v; l0 += v * v; }
        for (let i = 0; i < 3; i++) { xyz[i1 + i] = r_xyz[3 * begin_r + i]; }
        for (let i = 0; i < 3; i++) { const v = t_xyz[3 * outer_t + i]; xyz[i2 + i] = v; l2 += v * v; }
        l0 = Math.sqrt(l0); l2 = Math.sqrt(l2);
        for (let i = 0; i < 3; i++) { xyz[i0 + i] /= l0; xyz[i2 + i] /= l2; }

        for (let j = 0; j < 3; j++) {
            for (let i = 0; i < 3; i++) { rgb[9 * s + 3 * j + i] = col[i]; }
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(xyz, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    return geom;
}

// Rebuild state-colored overlay mesh (per-vertex colors from state palette)
export function rebuildStateOverlay(meshData, population, mapData) {
    removeFromScene(stateOverlayMesh);
    stateOverlayMesh = null;
    if (!population) return;

    const stateColors = population.states.map(s => hexToRgb(s.color));
    const lookup = (si) => si >= 0 && si < stateColors.length ? stateColors[si] : [0.2, 0.2, 0.2];

    const geom = buildColoredOverlayGeometry(meshData, mapData, population.cellState, lookup);
    stateOverlayMesh = new THREE.Mesh(geom, overlayMaterial);
    scene.add(stateOverlayMesh);
}

// Rebuild province-colored overlay mesh (golden-angle hue distribution)
export function rebuildProvinceOverlay(meshData, population, mapData) {
    removeFromScene(provinceOverlayMesh);
    provinceOverlayMesh = null;
    if (!population) return;

    const provinceColors = population.provinces.map((p, i) => {
        const hue = (i * 0.618033988749895) % 1;
        const sat = 0.7, light = 0.55;
        function toRgb(t) {
            t = ((t % 1) + 1) % 1;
            const c2 = (1 - Math.abs(2 * light - 1)) * sat;
            const x = c2 * (1 - Math.abs((t * 6) % 2 - 1));
            const m = light - c2 / 2;
            let r2, g2, b2;
            if (t < 1/6) [r2,g2,b2]=[c2,x,0];
            else if (t < 2/6) [r2,g2,b2]=[x,c2,0];
            else if (t < 3/6) [r2,g2,b2]=[0,c2,x];
            else if (t < 4/6) [r2,g2,b2]=[0,x,c2];
            else if (t < 5/6) [r2,g2,b2]=[x,0,c2];
            else [r2,g2,b2]=[c2,0,x];
            return [r2+m, g2+m, b2+m];
        }
        return toRgb(hue);
    });
    const lookup = (pi) => pi >= 0 && pi < provinceColors.length ? provinceColors[pi] : [0.2, 0.2, 0.2];

    const geom = buildColoredOverlayGeometry(meshData, mapData, population.cellProvince, lookup);
    provinceOverlayMesh = new THREE.Mesh(geom, overlayMaterial);
    scene.add(provinceOverlayMesh);
}

// Draw white lines between regions in different provinces
export function rebuildProvinceBorders(meshData, population, mapData) {
    removeFromScene(provinceBorderLines);
    provinceBorderLines = null;
    if (!population) return;

    const _mesh = meshData;
    const { t_xyz } = mapData;
    const lxyz = [];
    const lrgba = [];

    for (let s = 0; s < _mesh.numSides; s++) {
        const begin_r = _mesh.s_begin_r(s);
        const end_r = _mesh.s_end_r(s);
        if (population.cellProvince[begin_r] !== population.cellProvince[end_r] &&
            population.cellProvince[begin_r] >= 0 && population.cellProvince[end_r] >= 0) {
            const inner_t = _mesh.s_inner_t(s);
            const outer_t = _mesh.s_outer_t(s);
            const col = [1, 1, 1, 0.8];
            lxyz.push(t_xyz.slice(3 * inner_t, 3 * inner_t + 3), t_xyz.slice(3 * outer_t, 3 * outer_t + 3));
            lrgba.push(col, col);
        }
    }

    if (lxyz.length > 0) {
        const lineGeom = buildLineGeometryFromArrays(lxyz, lrgba);
        provinceBorderLines = new THREE.LineSegments(lineGeom, lineMaterial);
        scene.add(provinceBorderLines);
    }
}

// Toggle plate vector arrow visibility
export function togglePlateVectors(visible) {
    if (plateVectorLines) plateVectorLines.visible = visible;
}

// Toggle plate boundary line visibility
export function togglePlateBoundaries(visible) {
    if (plateBoundaryLines) plateBoundaryLines.visible = visible;
}

// Toggle culture overlay visibility
export function toggleOverlay(visible) {
    if (overlayMesh) overlayMesh.visible = visible;
}

// Toggle state border line visibility
export function toggleStateBorders(visible) {
    if (stateBorderLines) stateBorderLines.visible = visible;
}

// Toggle state overlay visibility
export function toggleStateOverlay(visible) {
    if (stateOverlayMesh) stateOverlayMesh.visible = visible;
}

// Toggle province overlay visibility
export function toggleProvinceOverlay(visible) {
    if (provinceOverlayMesh) provinceOverlayMesh.visible = visible;
}

// Toggle province border line visibility
export function toggleProvinceBorders(visible) {
    if (provinceBorderLines) provinceBorderLines.visible = visible;
}

// Build burg overlay: white town dots + gold capital dots with circular sprite texture, offset 1.003x radius
export function rebuildBurgOverlay(meshData, population, mapData) {
    removeFromScene(burgOverlayGroup);
    burgOverlayGroup = null;
    if (!population || !population.burgs) return;

    const { r_xyz } = mapData;
    const group = new THREE.Group();
    group.name = 'burgOverlay';

    const offset = 1.003;
    const provinceCapitalBurgs = new Set(population.provinces.map(p => p.burg));

    const townPos = [];
    const capPos = [];

    for (let b of population.burgs) {
        const r = b.cell;
        const x = r_xyz[3*r] * offset, y = r_xyz[3*r+1] * offset, z = r_xyz[3*r+2] * offset;
        if (b.capital || provinceCapitalBurgs.has(b.i)) {
            capPos.push(x, y, z);
        } else {
            townPos.push(x, y, z);
        }
    }

    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = 64;
    spriteCanvas.height = 64;
    const ctx = spriteCanvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    const spriteTexture = new THREE.CanvasTexture(spriteCanvas);

    if (townPos.length > 0) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(townPos, 3));
        const mat = new THREE.PointsMaterial({
            map: spriteTexture,
            color: 0xcccccc,
            size: 0.015,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
        });
        group.add(new THREE.Points(geom, mat));
    }

    if (capPos.length > 0) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
        const mat = new THREE.PointsMaterial({
            map: spriteTexture,
            color: 0xffd700,
            size: 0.04,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
        });
        group.add(new THREE.Points(geom, mat));
    }

    burgOverlayGroup = group;
    scene.add(group);
}

// Toggle burg overlay visibility
export function toggleBurgOverlay(visible) {
    if (burgOverlayGroup) burgOverlayGroup.visible = visible;
}

// Resize renderer and camera aspect ratio to match new canvas dimensions
export function resize(w, h) {
    if (!_initialized) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
