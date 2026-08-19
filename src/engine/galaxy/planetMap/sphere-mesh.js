// Fibonacci sphere mesh generation with spherical Delaunay triangulation and Voronoi dual
import { geoDelaunay } from "https://cdn.skypack.dev/d3-geo-voronoi@2";
import { HalfedgeMesh } from './halfedge-mesh.js';

let _randomLat = [], _randomLon = [];

function generateFibonacciSphere(N, jitter, randFloat) {
    let a_latlong = [];

    const s = 3.6 / Math.sqrt(N);
    const dlong = Math.PI * (3 - Math.sqrt(5));
    const dz = 2.0 / N;
    for (let k = 0, long = 0, z = 1 - dz / 2; k !== N; k++, z -= dz) {
        let r = Math.sqrt(1 - z * z);
        let latDeg = Math.asin(z) * 180 / Math.PI;
        let lonDeg = long * 180 / Math.PI;
        if (_randomLat[k] === undefined) _randomLat[k] = randFloat() - randFloat();
        if (_randomLon[k] === undefined) _randomLon[k] = randFloat() - randFloat();
        latDeg += jitter * _randomLat[k] * (latDeg - Math.asin(Math.max(-1, z - dz * 2 * Math.PI * r / s)) * 180 / Math.PI);
        lonDeg += jitter * _randomLon[k] * (s / r * 180 / Math.PI);
        a_latlong.push(latDeg, lonDeg % 360.0);
        long += dlong;
    }
    return a_latlong;
}

function pushCartesianFromSpherical(out, latDeg, lonDeg) {
    let latRad = latDeg / 180.0 * Math.PI,
        lonRad = lonDeg / 180.0 * Math.PI;
    out.push(Math.cos(latRad) * Math.cos(lonRad),
        Math.cos(latRad) * Math.sin(lonRad),
        Math.sin(latRad));
    return out;
}

function buildHalfedges(triangles, numPoints) {
    const numSides = triangles.length * 3;
    const halfedges = new Int32Array(numSides);
    halfedges.fill(-1);

    const edgeMap = new Map();
    for (let t = 0; t < triangles.length; t++) {
        const a = triangles[t][0], b = triangles[t][1], c = triangles[t][2];
        const verts = [a, b, c];
        for (let i = 0; i < 3; i++) {
            const v1 = verts[i];
            const v2 = verts[(i + 1) % 3];
            const key = v1 < v2 ? v1 * numPoints + v2 : v2 * numPoints + v1;
            const side = 3 * t + i;
            const existing = edgeMap.get(key);
            if (existing !== undefined) {
                halfedges[existing] = side;
                halfedges[side] = existing;
            } else {
                edgeMap.set(key, side);
            }
        }
    }
    return halfedges;
}

export function makeSphere(N, jitter, randFloat) {
    _randomLat = []; _randomLon = [];
    let latlong = generateFibonacciSphere(N, jitter, randFloat);
    let r_xyz = [];
    let lonlat = [];
    for (let r = 0; r < latlong.length / 2; r++) {
        const latDeg = latlong[2 * r];
        const lonDeg = latlong[2 * r + 1];
        pushCartesianFromSpherical(r_xyz, latDeg, lonDeg);
        lonlat.push([lonDeg, latDeg]);
    }

    const del = geoDelaunay(lonlat);
    const triangles = del.triangles;
    const numTriangles = triangles.length;
    const _triangles = new Int32Array(3 * numTriangles);
    for (let t = 0; t < numTriangles; t++) {
        _triangles[3 * t] = triangles[t][0];
        _triangles[3 * t + 1] = triangles[t][1];
        _triangles[3 * t + 2] = triangles[t][2];
    }
    const _halfedges = buildHalfedges(triangles, N);

    const mesh = new HalfedgeMesh({
        _triangles,
        _halfedges,
        numRegions: N,
        numSolidSides: _triangles.length,
    });
    mesh._delaunay = del;

    return { mesh, r_xyz };
}
