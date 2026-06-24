// Three.js DataTexture wrapper for per-type biome colormap lookup
import * as THREE from 'three';
import { getData, width, height, data as colormapData } from '../constants/colormap.js';

// Wrap raw RGBA Uint8Array into a Three.js DataTexture with nearest-neighbor sampling
function makeTexture(data) {
    const texture = new THREE.DataTexture(
        data,
        width,
        height,
        THREE.RGBAFormat
    );
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
}

// Generate a fresh DataTexture for the given planet type, with optional user colors
export function rebuildColormapTexture(type, colorA, colorB, colorC) {
    return makeTexture(getData(type, colorA, colorB, colorC));
}

const defaultTexture = makeTexture(colormapData);
export default defaultTexture;
