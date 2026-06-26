import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { starTypeData } from '../constants/astrophysics.js';
import {
  createStarGroup, createPlanetMesh, createMoonMesh,
  disposeStarGroup, disposePlanetGroup,
  updateStarUniforms, upgradePlanetMesh,
} from './planet-render.js';

let renderer, scene, viewGroup, camera, controls;
let animationId = null;
let containerEl = null;
let raycaster = new THREE.Raycaster();
let pointer = new THREE.Vector2();

// Object storage for cross-view interaction
let claimsGroup = null;
let crosshairGroup = null;
let currentView = null;
let clickHandlerRef = null;

// System view star state
let systemStarGroup = null;
let starTimeUniform = null;

// Galaxy star data cache for sector density queries
let galaxyStarPositions = [];

const disposeObject = (obj) => {
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) {
    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
    else obj.material.dispose();
  }
  if (obj.children) {
    while (obj.children.length > 0) {
      disposeObject(obj.children[0]);
      obj.remove(obj.children[0]);
    }
  }
};

const animate = () => {
  animationId = requestAnimationFrame(animate);
  if (controls) controls.update();
  if (systemStarGroup) {
    systemStarGroup.rotation.y += 0.002;
    updateStarUniforms(systemStarGroup, camera);
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
};

const startLoop = () => {
  if (!animationId) animate();
};

const stopLoop = () => {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
};

export function init(container) {
  containerEl = container;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  viewGroup = new THREE.Group();
  scene.add(viewGroup);

  camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 1, 1000000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 1;
  controls.maxDistance = 500000;

  window.addEventListener('resize', onResize);
  startLoop();
}

export function dispose() {
  stopLoop();
  clearView();
  if (renderer) {
    renderer.dispose();
    if (containerEl && renderer.domElement.parentNode === containerEl) {
      containerEl.removeChild(renderer.domElement);
    }
  }
  window.removeEventListener('resize', onResize);
  renderer = scene = viewGroup = camera = controls = null;
}

const onResize = () => {
  if (!containerEl || !renderer || !camera) return;
  const w = containerEl.clientWidth;
  const h = containerEl.clientHeight;
  renderer.setSize(w, h);
  if (camera.isOrthographicCamera) {
    const aspect = w / h;
    const centerX = (camera.left + camera.right) / 2;
    const centerY = (camera.top + camera.bottom) / 2;
    const frustumH = camera.top - camera.bottom;
    const halfH = frustumH / 2;
    const halfW = halfH * aspect;
    camera.left = centerX - halfW;
    camera.right = centerX + halfW;
    camera.top = centerY + halfH;
    camera.bottom = centerY - halfH;
    camera.updateProjectionMatrix();
  } else {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
};

export function clearView() {
  if (clickHandlerRef && renderer) {
    renderer.domElement.removeEventListener('click', clickHandlerRef);
    clickHandlerRef = null;
  }

  if (systemStarGroup) {
    disposeStarGroup(systemStarGroup);
  }
  if (systemPlanetGroups.length > 0) {
    systemPlanetGroups.forEach(g => disposePlanetGroup(g));
    systemPlanetGroups = [];
  }

  disposeObject(viewGroup);
  claimsGroup = null;
  crosshairGroup = null;
  currentView = null;
  systemStarGroup = null;
  starTimeUniform = null;
}

/*
  Galaxy View
*/
const SPECTRAL = ["O", "B", "A", "F", "G", "K", "M"];

function distValue(rng, dev) {
  return rng.normal({ dev });
}

function generateGalaxyStars(seed, starR, twist) {
  const rng = new window.Chance(seed + ".StarryHost");
  const armCount = 2;
  const armInterval = Math.PI;
  const armRadius = starR * 0.1;
  const radius = starR;
  const starCount = 10000;
  const points = [];

  const makeStar = (j, dev) => {
    const center = [0, 0];
    const armMiddle = armRadius / 2;
    const relX = (distValue(rng, dev) * armMiddle) + armMiddle;
    const relY = Math.abs(rng.random() - rng.random()) * radius;
    const jAngle = armInterval * j;

    const xCenterRemoved = (relY * Math.cos(jAngle)) + (relX - armRadius / 2) * Math.cos(jAngle + Math.PI / 2);
    const yCenterRemoved = (relY * Math.sin(jAngle)) + (relX - armRadius / 2) * Math.sin(jAngle + Math.PI / 2);

    const rotationAmount = (relY * twist) * (Math.PI / 180);
    const rotatedX = xCenterRemoved * Math.cos(rotationAmount) - yCenterRemoved * Math.sin(rotationAmount);
    const rotatedY = xCenterRemoved * Math.sin(rotationAmount) + yCenterRemoved * Math.cos(rotationAmount);

    let px = (rotatedX + center[0]) * rng.randBetween(985, 1015) / 1000;
    let py = (rotatedY + center[1]) * rng.randBetween(985, 1015) / 1000;

    return [px, py];
  };

  const distConfigs = [
    [starCount * 0.15, 5],
    [starCount * 0.25, 1.5],
    [starCount * 0.15, 1],
    [starCount * 0.1, 0.6],
    [starCount * 0.15, 0.4],
    [starCount * 0.2, 0.2]
  ];

  window._.fromN(armCount, () => {
    distConfigs.forEach(([count, dev]) => {
      window._.fromN(Math.floor(count / armCount), (j) => {
        points.push(makeStar(j, dev));
      });
    });
  });

  // Bulge stars
  window._.fromN(2500, () => {
    let r = starR * Math.abs(distValue(rng, 0.1));
    let phi = rng.randBetween(1, 360);
    points.push([r * Math.cos(phi), r * Math.sin(phi)]);
  });

  return points;
}

function resetControls(newCamera) {
  controls.dispose();
  controls = new OrbitControls(newCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
}

export function setGalaxyView(galaxy, { onSectorClick } = {}) {
  clearView();
  currentView = 'galaxy';

  const R = galaxy._R;
  const starR = R / 100;
  const twist = (galaxy._twist || 5) / 10;

  // Camera at 45° to the galactic plane, rotate around vertical (Z) axis
  const aspect = containerEl.clientWidth / containerEl.clientHeight;
  const camDist = starR * 2.5;
  camera = new THREE.PerspectiveCamera(60, aspect, 1, camDist * 10);
  camera.position.set(0, -camDist, camDist);
  camera.up.set(0, 0, 1);
  resetControls(camera);
  controls.target.set(0, 0, 0);
  controls.minPolarAngle = Math.PI / 4;
  controls.maxPolarAngle = Math.PI / 4;
  controls.update();

  // Background
  scene.background = new THREE.Color(0x000011);

  // Generate stars
  const starPositions = generateGalaxyStars(galaxy.seed, starR, twist);
  const positions = [];
  const colors = [];

  starPositions.forEach(([px, py]) => {
    positions.push(px, py, 0);
    colors.push(1, 1, 1);
  });

  // Add colored stars (weighted spectral distribution)
  const rng = new window.Chance(galaxy.seed + ".StarryHost.Colored");
  window._.fromN(5000, () => {
    const si = rng.weighted([0, 1, 2, 3, 4, 5, 6], [0.0001, 0.2, 1, 3, 8, 12, 20]);
    const colorStr = starTypeData[SPECTRAL[si]].color;
    const c = new THREE.Color(colorStr);
    let r = starR * Math.abs(distValue(rng, .3));
    let phi = rng.randBetween(1, 360);
    const px = r * Math.cos(phi);
    const py = r * Math.sin(phi);
    positions.push(px, py, 0);
    colors.push(c.r, c.g, c.b);
  });

  const posArray = new Float32Array(positions);
  const colArray = new Float32Array(colors);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colArray, 3));

  // Glow texture (same radial gradient used by sector sprites)
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 64;
  glowCanvas.height = 64;
  const gctx = glowCanvas.getContext('2d');
  const ggrad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  ggrad.addColorStop(0, 'rgba(255,255,255,1)');
  ggrad.addColorStop(0.15, 'rgba(255,255,255,0.9)');
  ggrad.addColorStop(1, 'rgba(255,255,255,0)');
  gctx.fillStyle = ggrad;
  gctx.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);

  const starMaterial = new THREE.PointsMaterial({
    size: 4,
    map: glowTexture,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.9
  });
  const starPoints = new THREE.Points(geom, starMaterial);
  viewGroup.add(starPoints);

  // Store star positions for sector density queries
  galaxyStarPositions = starPositions;

  // Culture claims (InstancedMesh for performance)
  claimsGroup = new THREE.Group();
  claimsGroup.name = 'claims';
  viewGroup.add(claimsGroup);

  const C = galaxy._cultures;
  if (C) {
    const SIZE = 10;
    const claimGeom = new THREE.PlaneGeometry(SIZE, SIZE);
    const matrix = new THREE.Matrix4();

    const addClaimGroup = (cells, opacity) => {
      const byColor = new Map();
      cells.forEach(cell => {
        const colorKey = C._colors[cell._claims[0]];
        if (!byColor.has(colorKey)) byColor.set(colorKey, []);
        byColor.get(colorKey).push(cell);
      });

      byColor.forEach((group, colorKey) => {
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(colorKey),
          transparent: opacity < 1,
          opacity,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const mesh = new THREE.InstancedMesh(claimGeom, mat, group.length);
        group.forEach((cell, i) => {
          matrix.makeTranslation(cell.x * SIZE, cell.y * SIZE, 0);
          mesh.setMatrixAt(i, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData = { type: 'claim' };
        claimsGroup.add(mesh);
      });
    };

    const aliveCells = [...C._cells.values()].filter(c => c._claims.length > 0 && c.state === 1);
    const deadCells = [...C._cells.values()].filter(c => c._claims.length > 0 && c.state === 0);
    addClaimGroup(aliveCells, 1.0);
    addClaimGroup(deadCells, 0.4);
  }
  claimsGroup.visible = false;

  // Crosshair group
  crosshairGroup = new THREE.Group();
  crosshairGroup.name = 'crosshairs';
  viewGroup.add(crosshairGroup);

  // Raycaster
  const clickHandler = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    if (onSectorClick) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const intersection = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, intersection);
      const gx = Math.round(intersection.x);
      const gy = Math.round(intersection.y);
      onSectorClick(gx, gy);
    }
  };

  clickHandlerRef = clickHandler;
  renderer.domElement.addEventListener('click', clickHandler);

  startLoop();
}

export function setClaimsVisible(visible) {
  if (claimsGroup) claimsGroup.visible = visible;
}

export function getClaimsVisible() {
  return claimsGroup ? claimsGroup.visible : false;
}

/*
  Sector View
*/
export function setSectorView(sector, { filter, onStarClick } = {}) {
  clearView();
  currentView = 'sector';

  const SECTOR = 1000;
  const half = SECTOR / 2;
  const n = 5;
  const grid = SECTOR / n;

  // Camera — centered frustum so resize handler preserves alignment
  const halfH = half;
  const aspect = containerEl.clientWidth / containerEl.clientHeight;
  const halfW = halfH * aspect;
  camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, -1000, 1000);
  camera.position.set(0, 0, 500);
  resetControls(camera);
  controls.target.set(0, 0, 0);
  controls.update();
  controls.minZoom = 0.5;
  controls.maxZoom = 20;

  // Grid — centered
  const gridMat = new THREE.LineBasicMaterial({ color: 0x444466, transparent: true, opacity: 0.5 });
  const gridPoints = [];
  for (let i = 0; i <= n; i++) {
    const p = i * grid - half;
    gridPoints.push(-half, p, 0, half, p, 0);
    gridPoints.push(p, -half, 0, p, half, 0);
  }
  const gridGeom = new THREE.BufferGeometry();
  gridGeom.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  const gridLines = new THREE.LineSegments(gridGeom, gridMat);
  viewGroup.add(gridLines);

  // Systems / stars — centered
  const systems = sector.showSystems(filter || 'All');
  const starGroup = new THREE.Group();
  starGroup.name = 'stars';

  systems.forEach((s) => {
    const loc = s.point.map(xyz => xyz - half);
    const color = new THREE.Color(s._color || '#ffffff');
    const size = Math.max(1, s._r * 0.6);

    const mat = new THREE.SpriteMaterial({
      map: createStarSprite(color, size),
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(...loc);
    sprite.scale.set(size * 6, size * 6, 1);
    sprite.userData = { type: 'star', system: s, seed: s._seed };
    starGroup.add(sprite);
  });
  viewGroup.add(starGroup);

  // Crosshair
  crosshairGroup = new THREE.Group();
  crosshairGroup.name = 'crosshairs';
  viewGroup.add(crosshairGroup);

  // Click handler
  const clickHandler = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(starGroup.children, true);
    if (hits.length > 0) {
      const obj = hits[0].object;
      if (obj.userData && obj.userData.type === 'star' && onStarClick) {
        onStarClick(obj.userData.system);
      }
    }
  };
  clickHandlerRef = clickHandler;
  renderer.domElement.addEventListener('click', clickHandler);

  startLoop();
}

function createStarSprite(color, size) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.2, color.getStyle());
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/*
  System View
*/
let systemPlanetGroups = [];

export function setSystemView(system, { onPlanetClick } = {}) {
  clearView();
  currentView = 'system';

  const planetGroup = new THREE.Group();
  planetGroup.name = 'planets';
  viewGroup.add(planetGroup);

  systemPlanetGroups = [];
  const planetGroupBySeed = new Map();

  // Compute planet X positions using fixed display sizes
  let xCursor = 16;
  const planetPositions = system.objects.map(o => {
    const r = o.classification === 'gas giant' || o.classification === 'brown dwarf' ? 3 : 1;
    xCursor += r;
    const cx = xCursor;
    xCursor += r + 10;
    return { seed: o._seed, cx, r };
  });

  const maxX = planetPositions.length > 0 ? planetPositions[planetPositions.length - 1].cx + 20 : 100;
  const padExtent = Math.max(maxX, 100);
  camera = new THREE.PerspectiveCamera(60, containerEl.clientWidth / containerEl.clientHeight, 1, padExtent * 4);
  camera.position.set(0, padExtent * 0.3, padExtent * 1.2);
  resetControls(camera);
  controls.target.set(padExtent * 0.3, 0, 0);
  controls.update();
  controls.minDistance = 10;
  controls.maxDistance = padExtent * 5;

  scene.background = new THREE.Color(0x000011);

  // Star with engine sun shader (full LOD)
  systemStarGroup = createStarGroup(system, system.seed);
  systemStarGroup.position.set(0, 0, 0);

  systemStarGroup.scale.setScalar(6);
  viewGroup.add(systemStarGroup);

  system.setGradients();
  system.objects.forEach((o, i) => {
    const entry = planetPositions[i];
    if (!entry) return;
    const cx = entry.cx;

    const bodyGroup = createPlanetMesh(o, 'medium');
    bodyGroup.position.set(cx, 0, 0);

    bodyGroup.children.forEach(child => {
      if (child.userData && (child.userData.__type === 'planet' || child.userData.__type === 'gasgiant' || child.userData.__type === 'moon')) {
        child.userData.planet = o;
      }
    });

    planetGroup.add(bodyGroup);
    systemPlanetGroups.push(bodyGroup);
    planetGroupBySeed.set(o._seed, bodyGroup);

    // Moons
    if (o._moons) {
      const parentRadius = o.classification === 'gas giant' || o.classification === 'brown dwarf' ? 3 : 1;
      let moonCumul = parentRadius;
      o._moons.forEach((m, mi) => {
        const mr = 0.5;
        if (mi > 0) {
          moonCumul += 2;
        }
        moonCumul += mr;
        const moonGroup = createMoonMesh(m, 'low');
        moonGroup.position.set(cx, -moonCumul, 0);
        moonCumul += mr;
        moonGroup.children.forEach(child => {
          if (child.userData && (child.userData.__type === 'moon')) {
            child.userData.planet = m;
          }
        });
        planetGroup.add(moonGroup);
        systemPlanetGroups.push(moonGroup);
        planetGroupBySeed.set(m._seed, moonGroup);
      });
    }
  });

  // Click handler — picks engine mesh children, passes planet + its group
  const clickHandler = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(planetGroup.children, true);
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && !obj.userData?.planet && obj.parent) obj = obj.parent;
      if (obj && obj.userData && obj.userData.planet && onPlanetClick) {
        const planet = obj.userData.planet;
        const group = planetGroupBySeed.get(planet._seed);
        onPlanetClick(planet, group);
      }
    }
  };
  clickHandlerRef = clickHandler;
  renderer.domElement.addEventListener('click', clickHandler);

  startLoop();
}

export function zoomToPlanet(planetGroup, planet) {
  const pos = new THREE.Vector3();
  planetGroup.getWorldPosition(pos);
  const radius = planet.classification === 'gas giant' || planet.classification === 'brown dwarf' ? 3 : 1;

  controls.target.copy(pos);
  const dist = radius * 3.5;
  camera.position.set(pos.x + dist * 0.3, pos.y + dist * 0.2, pos.z + dist);
  controls.update();

  controls.minDistance = radius * 1.5;
  controls.maxDistance = radius * 10;
}

export function upgradeSystemPlanet(planetGroup, planet, cb) {
  upgradePlanetMesh(planetGroup, planet, cb);
}



/*
  Crosshair
*/
export function setCrosshair(x, y, z = 0) {
  if (!crosshairGroup) return;
  // Sector view uses a centered frustum; offset caller coords (0..SECTOR)
  if (currentView === 'sector') {
    x -= 500;
    y -= 500;
    z -= 500;
  }
  while (crosshairGroup.children.length > 0) {
    const child = crosshairGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
    crosshairGroup.remove(child);
  }

  const range = currentView === 'sector' ? 1000 : 200000;
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff });

  // Vertical line through (x, y, z) along Y
  const xGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x, y - range, z),
    new THREE.Vector3(x, y + range, z)
  ]);
  crosshairGroup.add(new THREE.Line(xGeom, mat));

  // Horizontal line through (x, y, z) along X
  const yGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x - range, y, z),
    new THREE.Vector3(x + range, y, z)
  ]);
  crosshairGroup.add(new THREE.Line(yGeom, mat));

  // Z-axis line through (x, y, z) — sector view only (stars are in 3D)
  if (currentView === 'sector') {
    const zGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, y, z - range),
      new THREE.Vector3(x, y, z + range)
    ]);
    crosshairGroup.add(new THREE.Line(zGeom, mat));
  }
}

/*
  Resize handling for views
*/
export function resizeView() {
  onResize();
}
