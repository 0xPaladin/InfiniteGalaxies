// 64x64 RGBA biome colormap per planet type (elevation x moisture lookup)
export const width = 64;
export const height = 64;

// Parse hex color string (#rrggbb) to [r,g,b] byte triple
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
}

// Linearly interpolate two [r,g,b] triples by factor t
function lerpColor(c1, c2, t) {
    return [
        c1[0] + (c2[0] - c1[0]) * t,
        c1[1] + (c2[1] - c1[1]) * t,
        c1[2] + (c2[2] - c1[2]) * t,
    ];
}

// Generate RGBA Uint8Array palette (width×height) from a function mapping elevation → [r,g,b]
function makeColormap(width, height, colorFn) {
    const pixels = new Uint8Array(width * height * 4);
    for (var y = 0, p = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let e = 2 * x / width - 1;
            let [r, g, b] = colorFn(e);
            pixels[p++] = Math.min(255, Math.max(0, Math.round(r)));
            pixels[p++] = Math.min(255, Math.max(0, Math.round(g)));
            pixels[p++] = Math.min(255, Math.max(0, Math.round(b)));
            pixels[p++] = 255;
        }
    }
    return pixels;
}

// Earthlike biome colormap: deep ocean → shallow → green lowlands → brown highlands → white peaks
function earthlikeColormap() {
    return makeColormap(width, height, (e) => {
        let m = 0.5;
        let r, g, b;

        if (e < -0.135) {
            r = 41.5; g = 55.3; b = 139;
        } else if (e < 0.0) {
            r = 48 + 48 * e; g = 64 + 64 * e; b = 127 - 12 * e;
        } else {
            m = m * (1 - e);
            r = 210 - 100 * m; g = 185 - 45 * m; b = 139 - 45 * m;
            r = 255 * e + r * (1 - e);
            g = 255 * e + g * (1 - e);
            b = 255 * e + b * (1 - e);
        }

        return [r, g, b];
    });
}

// Airless colormap: user-colorable 3-stop gradient (low/mid/high elevation)
function airlessColormap(colorA, colorB, colorC) {
    const cLow = hexToRgb(colorA);
    const cMid = hexToRgb(colorB);
    const cHigh = hexToRgb(colorC);
    return makeColormap(width, height, (e) => {
        let t = (e + 1) / 2;
        if (t < 0.5) {
            return lerpColor(cLow, cMid, t * 2);
        } else {
            return lerpColor(cMid, cHigh, (t - 0.5) * 2);
        }
    });
}

// Barren colormap: user-colorable 3-stop gradient (low/mid/high elevation)
function barrenColormap(colorA, colorB, colorC) {
    const cLow = hexToRgb(colorA);
    const cMid = hexToRgb(colorB);
    const cHigh = hexToRgb(colorC);
    return makeColormap(width, height, (e) => {
        let t = (e + 1) / 2;
        if (t < 0.5) {
            return lerpColor(cLow, cMid, t * 2);
        } else {
            return lerpColor(cMid, cHigh, (t - 0.5) * 2);
        }
    });
}

import { BARREN_DEFAULTS, AIRLESS_DEFAULTS } from './defaults.js';

// Return colormap data for a given planet type, with optional user colors for airless/barren
export function getData(type, colorA, colorB, colorC) {
    switch (type) {
        case 'airless': return airlessColormap(colorA || AIRLESS_DEFAULTS.colorA, colorB || AIRLESS_DEFAULTS.colorB, colorC || AIRLESS_DEFAULTS.colorC);
        case 'barren': return barrenColormap(colorA || BARREN_DEFAULTS.colorA, colorB || BARREN_DEFAULTS.colorB, colorC || BARREN_DEFAULTS.colorC);
        case 'gasgiant': return earthlikeColormap();
        default: return earthlikeColormap();
    }
}

export const data = earthlikeColormap();
