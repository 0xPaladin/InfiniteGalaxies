// Fibonacci sphere mesh generation with Delaunay triangulation and Voronoi dual
import { Delaunator, TriangleMesh } from '../../lib/redblob.lib.js';

let _randomLat = [], _randomLon = [];
// Generate N approximately-equally-spaced points on a sphere using the Fibonacci spiral method with optional jitter
function generateFibonacciSphere(N, jitter, randFloat) {
    let a_latlong = [];

    const s = 3.6/Math.sqrt(N);
    const dlong = Math.PI * (3-Math.sqrt(5));
    const dz = 2.0 / N;
    for (let k = 0, long = 0, z = 1 - dz/2; k !== N; k++, z -= dz) {
        let r = Math.sqrt(1 - z*z);
        let latDeg = Math.asin(z) * 180 / Math.PI;
        let lonDeg = long * 180 / Math.PI;
        if (_randomLat[k] === undefined) _randomLat[k] = randFloat() - randFloat();
        if (_randomLon[k] === undefined) _randomLon[k] = randFloat() - randFloat();
        latDeg += jitter * _randomLat[k] * (latDeg - Math.asin(Math.max(-1, z - dz * 2 * Math.PI * r / s)) * 180 / Math.PI);
        lonDeg += jitter * _randomLon[k] * (s/r * 180 / Math.PI);
        a_latlong.push(latDeg, lonDeg % 360.0);
        long += dlong;
    }
    return a_latlong;
}

// Convert lat/lon degrees to unit sphere Cartesian xyz and append to out array
function pushCartesianFromSpherical(out, latDeg, lonDeg) {
    let latRad = latDeg / 180.0 * Math.PI,
        lonRad = lonDeg / 180.0 * Math.PI;
    out.push(Math.cos(latRad) * Math.cos(lonRad),
             Math.cos(latRad) * Math.sin(lonRad),
             Math.sin(latRad));
    return out;
}

// Close the Delaunay triangulation by adding a south-pole vertex and stitching unpaired boundary edges
function addSouthPoleToMesh(southPoleId, {triangles, halfedges}) {
    let numSides = triangles.length;
    function s_next_s(s) { return (s % 3 == 2) ? s-2 : s+1; }

    let numUnpairedSides = 0, firstUnpairedSide = -1;
    let pointIdToSideId = [];
    for (let s = 0; s < numSides; s++) {
        if (halfedges[s] === -1) {
            numUnpairedSides++;
            pointIdToSideId[triangles[s]] = s;
            firstUnpairedSide = s;
        }
    }
    
    let newTriangles = new Int32Array(numSides + 3 * numUnpairedSides);
    let newHalfedges = new Int32Array(numSides + 3 * numUnpairedSides);
    newTriangles.set(triangles);
    newHalfedges.set(halfedges);

    for (let i = 0, s = firstUnpairedSide;
         i < numUnpairedSides;
         i++, s = pointIdToSideId[newTriangles[s_next_s(s)]]) {

        let newSide = numSides + 3 * i;
        newHalfedges[s] = newSide;
        newHalfedges[newSide] = s;
        newTriangles[newSide] = newTriangles[s_next_s(s)];
        
        newTriangles[newSide + 1] = newTriangles[s];
        newTriangles[newSide + 2] = southPoleId;
        let k = numSides + (3 * i + 4) % (3 * numUnpairedSides);
        newHalfedges[newSide + 2] = k;
        newHalfedges[k] = newSide + 2;
    }

    return {
        triangles: newTriangles,
        halfedges: newHalfedges,
    };
}

// Stereographic projection from unit sphere to 2D plane (from north pole) for Delaunay input
function stereographicProjection(r_xyz) {
    const degToRad = Math.PI / 180;
    let numPoints = r_xyz.length / 3;
    let r_XY = [];
    for (let r = 0; r < numPoints; r++) {
        let x = r_xyz[3*r],
            y = r_xyz[3*r + 1],
            z = r_xyz[3*r + 2];
        let X = x / (1-z),
            Y = y / (1-z);
        r_XY.push(X, Y);
    }
    return r_XY;
}

// Full pipeline: Fibonacci points → stereographic projection → Delaunay → south pole closure → dual mesh
export function makeSphere(N, jitter, randFloat) {
    _randomLat = []; _randomLon = [];
    let latlong = generateFibonacciSphere(N, jitter, randFloat);
    let r_xyz = [];
    for (let r = 0; r < latlong.length/2; r++) {
        pushCartesianFromSpherical(r_xyz, latlong[2*r], latlong[2*r+1]);
    }

    let delaunay = new Delaunator(stereographicProjection(r_xyz));
    
    r_xyz.push(0, 0, 1);
    delaunay = addSouthPoleToMesh(r_xyz.length/3 - 1, delaunay);

    let dummy_r_vertex = [[0, 0]];
    for (let i = 1; i < N+1; i++) {
        dummy_r_vertex[i] = dummy_r_vertex[0];
    }
    
    let mesh = new TriangleMesh({
        numBoundaryRegions: 0,
        numSolidSides: delaunay.triangles.length,
        _r_vertex: dummy_r_vertex,
        _triangles: delaunay.triangles,
        _halfedges: delaunay.halfedges,
    });

    return {mesh, r_xyz};
}
