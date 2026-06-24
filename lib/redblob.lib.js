var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/simplex-noise/simplex-noise.js
var require_simplex_noise = __commonJS({
  "node_modules/simplex-noise/simplex-noise.js"(exports, module) {
    (function() {
      "use strict";
      var F2 = 0.5 * (Math.sqrt(3) - 1);
      var G2 = (3 - Math.sqrt(3)) / 6;
      var F3 = 1 / 3;
      var G3 = 1 / 6;
      var F4 = (Math.sqrt(5) - 1) / 4;
      var G4 = (5 - Math.sqrt(5)) / 20;
      function SimplexNoise(randomOrSeed) {
        var random2;
        if (typeof randomOrSeed == "function") {
          random2 = randomOrSeed;
        } else if (randomOrSeed) {
          random2 = alea(randomOrSeed);
        } else {
          random2 = Math.random;
        }
        this.p = buildPermutationTable(random2);
        this.perm = new Uint8Array(512);
        this.permMod12 = new Uint8Array(512);
        for (var i = 0; i < 512; i++) {
          this.perm[i] = this.p[i & 255];
          this.permMod12[i] = this.perm[i] % 12;
        }
      }
      SimplexNoise.prototype = {
        grad3: new Float32Array([
          1,
          1,
          0,
          -1,
          1,
          0,
          1,
          -1,
          0,
          -1,
          -1,
          0,
          1,
          0,
          1,
          -1,
          0,
          1,
          1,
          0,
          -1,
          -1,
          0,
          -1,
          0,
          1,
          1,
          0,
          -1,
          1,
          0,
          1,
          -1,
          0,
          -1,
          -1
        ]),
        grad4: new Float32Array([
          0,
          1,
          1,
          1,
          0,
          1,
          1,
          -1,
          0,
          1,
          -1,
          1,
          0,
          1,
          -1,
          -1,
          0,
          -1,
          1,
          1,
          0,
          -1,
          1,
          -1,
          0,
          -1,
          -1,
          1,
          0,
          -1,
          -1,
          -1,
          1,
          0,
          1,
          1,
          1,
          0,
          1,
          -1,
          1,
          0,
          -1,
          1,
          1,
          0,
          -1,
          -1,
          -1,
          0,
          1,
          1,
          -1,
          0,
          1,
          -1,
          -1,
          0,
          -1,
          1,
          -1,
          0,
          -1,
          -1,
          1,
          1,
          0,
          1,
          1,
          1,
          0,
          -1,
          1,
          -1,
          0,
          1,
          1,
          -1,
          0,
          -1,
          -1,
          1,
          0,
          1,
          -1,
          1,
          0,
          -1,
          -1,
          -1,
          0,
          1,
          -1,
          -1,
          0,
          -1,
          1,
          1,
          1,
          0,
          1,
          1,
          -1,
          0,
          1,
          -1,
          1,
          0,
          1,
          -1,
          -1,
          0,
          -1,
          1,
          1,
          0,
          -1,
          1,
          -1,
          0,
          -1,
          -1,
          1,
          0,
          -1,
          -1,
          -1,
          0
        ]),
        noise2D: function(xin, yin) {
          var permMod12 = this.permMod12;
          var perm = this.perm;
          var grad3 = this.grad3;
          var n0 = 0;
          var n1 = 0;
          var n2 = 0;
          var s = (xin + yin) * F2;
          var i = Math.floor(xin + s);
          var j = Math.floor(yin + s);
          var t = (i + j) * G2;
          var X0 = i - t;
          var Y0 = j - t;
          var x0 = xin - X0;
          var y0 = yin - Y0;
          var i1, j1;
          if (x0 > y0) {
            i1 = 1;
            j1 = 0;
          } else {
            i1 = 0;
            j1 = 1;
          }
          var x1 = x0 - i1 + G2;
          var y1 = y0 - j1 + G2;
          var x2 = x0 - 1 + 2 * G2;
          var y2 = y0 - 1 + 2 * G2;
          var ii = i & 255;
          var jj = j & 255;
          var t0 = 0.5 - x0 * x0 - y0 * y0;
          if (t0 >= 0) {
            var gi0 = permMod12[ii + perm[jj]] * 3;
            t0 *= t0;
            n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0);
          }
          var t1 = 0.5 - x1 * x1 - y1 * y1;
          if (t1 >= 0) {
            var gi1 = permMod12[ii + i1 + perm[jj + j1]] * 3;
            t1 *= t1;
            n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1);
          }
          var t2 = 0.5 - x2 * x2 - y2 * y2;
          if (t2 >= 0) {
            var gi2 = permMod12[ii + 1 + perm[jj + 1]] * 3;
            t2 *= t2;
            n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2);
          }
          return 70 * (n0 + n1 + n2);
        },
        // 3D simplex noise
        noise3D: function(xin, yin, zin) {
          var permMod12 = this.permMod12;
          var perm = this.perm;
          var grad3 = this.grad3;
          var n0, n1, n2, n3;
          var s = (xin + yin + zin) * F3;
          var i = Math.floor(xin + s);
          var j = Math.floor(yin + s);
          var k = Math.floor(zin + s);
          var t = (i + j + k) * G3;
          var X0 = i - t;
          var Y0 = j - t;
          var Z0 = k - t;
          var x0 = xin - X0;
          var y0 = yin - Y0;
          var z0 = zin - Z0;
          var i1, j1, k1;
          var i2, j2, k2;
          if (x0 >= y0) {
            if (y0 >= z0) {
              i1 = 1;
              j1 = 0;
              k1 = 0;
              i2 = 1;
              j2 = 1;
              k2 = 0;
            } else if (x0 >= z0) {
              i1 = 1;
              j1 = 0;
              k1 = 0;
              i2 = 1;
              j2 = 0;
              k2 = 1;
            } else {
              i1 = 0;
              j1 = 0;
              k1 = 1;
              i2 = 1;
              j2 = 0;
              k2 = 1;
            }
          } else {
            if (y0 < z0) {
              i1 = 0;
              j1 = 0;
              k1 = 1;
              i2 = 0;
              j2 = 1;
              k2 = 1;
            } else if (x0 < z0) {
              i1 = 0;
              j1 = 1;
              k1 = 0;
              i2 = 0;
              j2 = 1;
              k2 = 1;
            } else {
              i1 = 0;
              j1 = 1;
              k1 = 0;
              i2 = 1;
              j2 = 1;
              k2 = 0;
            }
          }
          var x1 = x0 - i1 + G3;
          var y1 = y0 - j1 + G3;
          var z1 = z0 - k1 + G3;
          var x2 = x0 - i2 + 2 * G3;
          var y2 = y0 - j2 + 2 * G3;
          var z2 = z0 - k2 + 2 * G3;
          var x3 = x0 - 1 + 3 * G3;
          var y3 = y0 - 1 + 3 * G3;
          var z3 = z0 - 1 + 3 * G3;
          var ii = i & 255;
          var jj = j & 255;
          var kk = k & 255;
          var t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
          if (t0 < 0) n0 = 0;
          else {
            var gi0 = permMod12[ii + perm[jj + perm[kk]]] * 3;
            t0 *= t0;
            n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0 + grad3[gi0 + 2] * z0);
          }
          var t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
          if (t1 < 0) n1 = 0;
          else {
            var gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
            t1 *= t1;
            n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1 + grad3[gi1 + 2] * z1);
          }
          var t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
          if (t2 < 0) n2 = 0;
          else {
            var gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
            t2 *= t2;
            n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2 + grad3[gi2 + 2] * z2);
          }
          var t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
          if (t3 < 0) n3 = 0;
          else {
            var gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
            t3 *= t3;
            n3 = t3 * t3 * (grad3[gi3] * x3 + grad3[gi3 + 1] * y3 + grad3[gi3 + 2] * z3);
          }
          return 32 * (n0 + n1 + n2 + n3);
        },
        // 4D simplex noise, better simplex rank ordering method 2012-03-09
        noise4D: function(x, y, z, w) {
          var perm = this.perm;
          var grad4 = this.grad4;
          var n0, n1, n2, n3, n4;
          var s = (x + y + z + w) * F4;
          var i = Math.floor(x + s);
          var j = Math.floor(y + s);
          var k = Math.floor(z + s);
          var l = Math.floor(w + s);
          var t = (i + j + k + l) * G4;
          var X0 = i - t;
          var Y0 = j - t;
          var Z0 = k - t;
          var W0 = l - t;
          var x0 = x - X0;
          var y0 = y - Y0;
          var z0 = z - Z0;
          var w0 = w - W0;
          var rankx = 0;
          var ranky = 0;
          var rankz = 0;
          var rankw = 0;
          if (x0 > y0) rankx++;
          else ranky++;
          if (x0 > z0) rankx++;
          else rankz++;
          if (x0 > w0) rankx++;
          else rankw++;
          if (y0 > z0) ranky++;
          else rankz++;
          if (y0 > w0) ranky++;
          else rankw++;
          if (z0 > w0) rankz++;
          else rankw++;
          var i1, j1, k1, l1;
          var i2, j2, k2, l2;
          var i3, j3, k3, l3;
          i1 = rankx >= 3 ? 1 : 0;
          j1 = ranky >= 3 ? 1 : 0;
          k1 = rankz >= 3 ? 1 : 0;
          l1 = rankw >= 3 ? 1 : 0;
          i2 = rankx >= 2 ? 1 : 0;
          j2 = ranky >= 2 ? 1 : 0;
          k2 = rankz >= 2 ? 1 : 0;
          l2 = rankw >= 2 ? 1 : 0;
          i3 = rankx >= 1 ? 1 : 0;
          j3 = ranky >= 1 ? 1 : 0;
          k3 = rankz >= 1 ? 1 : 0;
          l3 = rankw >= 1 ? 1 : 0;
          var x1 = x0 - i1 + G4;
          var y1 = y0 - j1 + G4;
          var z1 = z0 - k1 + G4;
          var w1 = w0 - l1 + G4;
          var x2 = x0 - i2 + 2 * G4;
          var y2 = y0 - j2 + 2 * G4;
          var z2 = z0 - k2 + 2 * G4;
          var w2 = w0 - l2 + 2 * G4;
          var x3 = x0 - i3 + 3 * G4;
          var y3 = y0 - j3 + 3 * G4;
          var z3 = z0 - k3 + 3 * G4;
          var w3 = w0 - l3 + 3 * G4;
          var x4 = x0 - 1 + 4 * G4;
          var y4 = y0 - 1 + 4 * G4;
          var z4 = z0 - 1 + 4 * G4;
          var w4 = w0 - 1 + 4 * G4;
          var ii = i & 255;
          var jj = j & 255;
          var kk = k & 255;
          var ll = l & 255;
          var t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
          if (t0 < 0) n0 = 0;
          else {
            var gi0 = perm[ii + perm[jj + perm[kk + perm[ll]]]] % 32 * 4;
            t0 *= t0;
            n0 = t0 * t0 * (grad4[gi0] * x0 + grad4[gi0 + 1] * y0 + grad4[gi0 + 2] * z0 + grad4[gi0 + 3] * w0);
          }
          var t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
          if (t1 < 0) n1 = 0;
          else {
            var gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]] % 32 * 4;
            t1 *= t1;
            n1 = t1 * t1 * (grad4[gi1] * x1 + grad4[gi1 + 1] * y1 + grad4[gi1 + 2] * z1 + grad4[gi1 + 3] * w1);
          }
          var t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
          if (t2 < 0) n2 = 0;
          else {
            var gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]] % 32 * 4;
            t2 *= t2;
            n2 = t2 * t2 * (grad4[gi2] * x2 + grad4[gi2 + 1] * y2 + grad4[gi2 + 2] * z2 + grad4[gi2 + 3] * w2);
          }
          var t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
          if (t3 < 0) n3 = 0;
          else {
            var gi3 = perm[ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]]] % 32 * 4;
            t3 *= t3;
            n3 = t3 * t3 * (grad4[gi3] * x3 + grad4[gi3 + 1] * y3 + grad4[gi3 + 2] * z3 + grad4[gi3 + 3] * w3);
          }
          var t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
          if (t4 < 0) n4 = 0;
          else {
            var gi4 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]] % 32 * 4;
            t4 *= t4;
            n4 = t4 * t4 * (grad4[gi4] * x4 + grad4[gi4 + 1] * y4 + grad4[gi4 + 2] * z4 + grad4[gi4 + 3] * w4);
          }
          return 27 * (n0 + n1 + n2 + n3 + n4);
        }
      };
      function buildPermutationTable(random2) {
        var i;
        var p = new Uint8Array(256);
        for (i = 0; i < 256; i++) {
          p[i] = i;
        }
        for (i = 0; i < 255; i++) {
          var r = i + ~~(random2() * (256 - i));
          var aux = p[i];
          p[i] = p[r];
          p[r] = aux;
        }
        return p;
      }
      SimplexNoise._buildPermutationTable = buildPermutationTable;
      function alea() {
        var s0 = 0;
        var s1 = 0;
        var s2 = 0;
        var c = 1;
        var mash = masher();
        s0 = mash(" ");
        s1 = mash(" ");
        s2 = mash(" ");
        for (var i = 0; i < arguments.length; i++) {
          s0 -= mash(arguments[i]);
          if (s0 < 0) {
            s0 += 1;
          }
          s1 -= mash(arguments[i]);
          if (s1 < 0) {
            s1 += 1;
          }
          s2 -= mash(arguments[i]);
          if (s2 < 0) {
            s2 += 1;
          }
        }
        mash = null;
        return function() {
          var t = 2091639 * s0 + c * 23283064365386963e-26;
          s0 = s1;
          s1 = s2;
          return s2 = t - (c = t | 0);
        };
      }
      function masher() {
        var n = 4022871197;
        return function(data) {
          data = data.toString();
          for (var i = 0; i < data.length; i++) {
            n += data.charCodeAt(i);
            var h = 0.02519603282416938 * n;
            n = h >>> 0;
            h -= n;
            h *= n;
            n = h >>> 0;
            h -= n;
            n += h * 4294967296;
          }
          return (n >>> 0) * 23283064365386963e-26;
        };
      }
      if (typeof define !== "undefined" && define.amd) define(function() {
        return SimplexNoise;
      });
      if (typeof exports !== "undefined") exports.SimplexNoise = SimplexNoise;
      else if (typeof window !== "undefined") window.SimplexNoise = SimplexNoise;
      if (typeof module !== "undefined") {
        module.exports = SimplexNoise;
      }
    })();
  }
});

// node_modules/@redblobgames/dual-mesh/index.js
var require_dual_mesh = __commonJS({
  "node_modules/@redblobgames/dual-mesh/index.js"(exports, module) {
    "use strict";
    var TriangleMesh = class _TriangleMesh {
      static s_to_t(s) {
        return s / 3 | 0;
      }
      static s_prev_s(s) {
        return s % 3 === 0 ? s + 2 : s - 1;
      }
      static s_next_s(s) {
        return s % 3 === 2 ? s - 2 : s + 1;
      }
      /**
       * Constructor takes partial mesh information and fills in the rest; the
       * partial information is generated in create.js or in fromDelaunator.
       */
      constructor({ numBoundaryRegions, numSolidSides, _r_vertex, _triangles, _halfedges }) {
        Object.assign(this, {
          numBoundaryRegions,
          numSolidSides,
          _r_vertex,
          _triangles,
          _halfedges
        });
        this._t_vertex = [];
        this._update();
      }
      /**
       * Update internal data structures from Delaunator 
       */
      update(points, delaunator) {
        this._r_vertex = points;
        this._triangles = delaunator.triangles;
        this._halfedges = delaunator.halfedges;
        this._update();
      }
      /**
       * Update internal data structures to match the input mesh.
       *
       * Use if you have updated the triangles/halfedges with Delaunator
       * and want the dual mesh to match the updated data. Note that
       * this DOES not update boundary regions or ghost elements.
       */
      _update() {
        let { _triangles, _halfedges, _r_vertex, _t_vertex } = this;
        this.numSides = _triangles.length;
        this.numRegions = _r_vertex.length;
        this.numSolidRegions = this.numRegions - 1;
        this.numTriangles = this.numSides / 3;
        this.numSolidTriangles = this.numSolidSides / 3;
        if (this._t_vertex.length < this.numTriangles) {
          const numOldTriangles = _t_vertex.length;
          const numNewTriangles = this.numTriangles - numOldTriangles;
          _t_vertex = _t_vertex.concat(new Array(numNewTriangles));
          for (let t = numOldTriangles; t < this.numTriangles; t++) {
            _t_vertex[t] = [0, 0];
          }
          this._t_vertex = _t_vertex;
        }
        this._r_in_s = new Int32Array(this.numRegions);
        for (let s = 0; s < _triangles.length; s++) {
          let endpoint = _triangles[_TriangleMesh.s_next_s(s)];
          if (this._r_in_s[endpoint] === 0 || _halfedges[s] === -1) {
            this._r_in_s[endpoint] = s;
          }
        }
        for (let s = 0; s < _triangles.length; s += 3) {
          let t = s / 3, a = _r_vertex[_triangles[s]], b = _r_vertex[_triangles[s + 1]], c = _r_vertex[_triangles[s + 2]];
          if (this.s_ghost(s)) {
            let dx = b[0] - a[0], dy = b[1] - a[1];
            let scale2 = 10 / Math.sqrt(dx * dx + dy * dy);
            _t_vertex[t][0] = 0.5 * (a[0] + b[0]) + dy * scale2;
            _t_vertex[t][1] = 0.5 * (a[1] + b[1]) - dx * scale2;
          } else {
            _t_vertex[t][0] = (a[0] + b[0] + c[0]) / 3;
            _t_vertex[t][1] = (a[1] + b[1] + c[1]) / 3;
          }
        }
      }
      /**
       * Construct a DualMesh from a Delaunator object, without any
       * additional boundary regions.
       */
      static fromDelaunator(points, delaunator) {
        return new _TriangleMesh({
          numBoundaryRegions: 0,
          numSolidSides: delaunator.triangles.length,
          _r_vertex: points,
          _triangles: delaunator.triangles,
          _halfedges: delaunator.halfedges
        });
      }
      r_x(r) {
        return this._r_vertex[r][0];
      }
      r_y(r) {
        return this._r_vertex[r][1];
      }
      t_x(r) {
        return this._t_vertex[r][0];
      }
      t_y(r) {
        return this._t_vertex[r][1];
      }
      r_pos(out, r) {
        out.length = 2;
        out[0] = this.r_x(r);
        out[1] = this.r_y(r);
        return out;
      }
      t_pos(out, t) {
        out.length = 2;
        out[0] = this.t_x(t);
        out[1] = this.t_y(t);
        return out;
      }
      s_begin_r(s) {
        return this._triangles[s];
      }
      s_end_r(s) {
        return this._triangles[_TriangleMesh.s_next_s(s)];
      }
      s_inner_t(s) {
        return _TriangleMesh.s_to_t(s);
      }
      s_outer_t(s) {
        return _TriangleMesh.s_to_t(this._halfedges[s]);
      }
      s_next_s(s) {
        return _TriangleMesh.s_next_s(s);
      }
      s_prev_s(s) {
        return _TriangleMesh.s_prev_s(s);
      }
      s_opposite_s(s) {
        return this._halfedges[s];
      }
      t_circulate_s(out_s, t) {
        out_s.length = 3;
        for (let i = 0; i < 3; i++) {
          out_s[i] = 3 * t + i;
        }
        return out_s;
      }
      t_circulate_r(out_r, t) {
        out_r.length = 3;
        for (let i = 0; i < 3; i++) {
          out_r[i] = this._triangles[3 * t + i];
        }
        return out_r;
      }
      t_circulate_t(out_t, t) {
        out_t.length = 3;
        for (let i = 0; i < 3; i++) {
          out_t[i] = this.s_outer_t(3 * t + i);
        }
        return out_t;
      }
      r_circulate_s(out_s, r) {
        const s0 = this._r_in_s[r];
        let incoming = s0;
        out_s.length = 0;
        do {
          out_s.push(this._halfedges[incoming]);
          let outgoing = _TriangleMesh.s_next_s(incoming);
          incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_s;
      }
      r_circulate_r(out_r, r) {
        const s0 = this._r_in_s[r];
        let incoming = s0;
        out_r.length = 0;
        do {
          out_r.push(this.s_begin_r(incoming));
          let outgoing = _TriangleMesh.s_next_s(incoming);
          incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_r;
      }
      r_circulate_t(out_t, r) {
        const s0 = this._r_in_s[r];
        let incoming = s0;
        out_t.length = 0;
        do {
          out_t.push(_TriangleMesh.s_to_t(incoming));
          let outgoing = _TriangleMesh.s_next_s(incoming);
          incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_t;
      }
      ghost_r() {
        return this.numRegions - 1;
      }
      s_ghost(s) {
        return s >= this.numSolidSides;
      }
      r_ghost(r) {
        return r === this.numRegions - 1;
      }
      t_ghost(t) {
        return this.s_ghost(3 * t);
      }
      s_boundary(s) {
        return this.s_ghost(s) && s % 3 === 0;
      }
      r_boundary(r) {
        return r < this.numBoundaryRegions;
      }
    };
    module.exports = TriangleMesh;
  }
});

// engine/lib/_vendor-entry.js
var import_simplex_noise = __toESM(require_simplex_noise());

// node_modules/flatqueue/index.js
var FlatQueue = class {
  /**
   * Creates an empty queue. If `capacity` is provided, the queue is backed by fixed-size typed
   * arrays for better performance and memory use, but can't grow beyond `capacity`. `values` uses
   * `ValuesArray` (default `Float64Array`) and `ids` uses `IdsArray` (default `Uint32Array`); pass
   * narrower constructors like `Uint16Array` if your values or ids are known to fit them.
   *
   * @param {number} [capacity]
   * @param {TypedArrayConstructor} [ValuesArray]
   * @param {TypedArrayConstructor} [IdsArray]
   */
  constructor(capacity = Infinity, ValuesArray = Float64Array, IdsArray = Uint32Array) {
    const fixed = capacity !== Infinity;
    this.ids = fixed ? (
      /** @type {T[]} */
      /** @type {unknown} */
      new IdsArray(capacity)
    ) : [];
    this.values = fixed ? (
      /** @type {number[]} */
      /** @type {unknown} */
      new ValuesArray(capacity)
    ) : [];
    this.capacity = capacity;
    this.length = 0;
  }
  /** Removes all items from the queue. */
  clear() {
    this.length = 0;
  }
  /**
   * Adds `item` to the queue with the specified `priority`.
   *
   * `priority` must be a number. Items are sorted and returned from low to high priority. Multiple items
   * with the same priority value can be added to the queue, but there is no guaranteed order between these items.
   *
   * For fixed-capacity queues, throws a `RangeError` if the queue is already full.
   *
   * @param {T} item
   * @param {number} priority
   */
  push(item, priority) {
    if (this.length === this.capacity) throw new RangeError("Queue is at capacity.");
    let pos = this.length++;
    while (pos > 0) {
      const parent = pos - 1 >> 1;
      const parentValue = this.values[parent];
      if (priority >= parentValue) break;
      this.ids[pos] = this.ids[parent];
      this.values[pos] = parentValue;
      pos = parent;
    }
    this.ids[pos] = item;
    this.values[pos] = priority;
  }
  /**
   * Removes and returns the item from the head of this queue, which is one of
   * the items with the lowest priority. If this queue is empty, returns `undefined`.
   */
  pop() {
    if (this.length === 0) return void 0;
    const ids = this.ids, values = this.values, top = ids[0], last = --this.length;
    if (last > 0) {
      const id = ids[last];
      const value = values[last];
      let pos = 0;
      const halfLen = last >> 1;
      while (pos < halfLen) {
        const left = (pos << 1) + 1;
        const right = left + 1;
        const child = left + (+(right < last) & +(values[right] < values[left]));
        if (values[child] >= value) break;
        ids[pos] = ids[child];
        values[pos] = values[child];
        pos = child;
      }
      ids[pos] = id;
      values[pos] = value;
    }
    return top;
  }
  /** Returns the item from the head of this queue without removing it. If this queue is empty, returns `undefined`. */
  peek() {
    return this.length > 0 ? this.ids[0] : void 0;
  }
  /**
   * Returns the priority value of the item at the head of this queue without
   * removing it. If this queue is empty, returns `undefined`.
   */
  peekValue() {
    return this.length > 0 ? this.values[0] : void 0;
  }
  /**
   * Shrinks the internal arrays to `this.length`. No-op for queues with fixed capacity.
   *
   * `pop()` and `clear()` calls don't free memory automatically to avoid unnecessary resize operations.
   * This also means that items that have been added to the queue can't be garbage collected until
   * a new item is pushed in their place, or this method is called.
   */
  shrink() {
    if (Array.isArray(this.ids)) this.ids.length = this.length;
    if (Array.isArray(this.values)) this.values.length = this.length;
  }
};

// node_modules/gl-matrix/esm/common.js
var EPSILON = 1e-6;
var ARRAY_TYPE = typeof Float32Array !== "undefined" ? Float32Array : Array;
var RANDOM = Math.random;
function round(a) {
  if (a >= 0) return Math.round(a);
  return a % 0.5 === 0 ? Math.floor(a) : Math.round(a);
}
var degree = Math.PI / 180;
var radian = 180 / Math.PI;

// node_modules/gl-matrix/esm/vec3.js
var vec3_exports = {};
__export(vec3_exports, {
  add: () => add,
  angle: () => angle,
  bezier: () => bezier,
  ceil: () => ceil,
  clone: () => clone,
  copy: () => copy,
  create: () => create,
  cross: () => cross,
  dist: () => dist,
  distance: () => distance,
  div: () => div,
  divide: () => divide,
  dot: () => dot,
  equals: () => equals,
  exactEquals: () => exactEquals,
  floor: () => floor,
  forEach: () => forEach,
  fromValues: () => fromValues,
  hermite: () => hermite,
  inverse: () => inverse,
  len: () => len,
  length: () => length,
  lerp: () => lerp,
  max: () => max,
  min: () => min,
  mul: () => mul,
  multiply: () => multiply,
  negate: () => negate,
  normalize: () => normalize,
  random: () => random,
  rotateX: () => rotateX,
  rotateY: () => rotateY,
  rotateZ: () => rotateZ,
  round: () => round2,
  scale: () => scale,
  scaleAndAdd: () => scaleAndAdd,
  set: () => set,
  slerp: () => slerp,
  sqrDist: () => sqrDist,
  sqrLen: () => sqrLen,
  squaredDistance: () => squaredDistance,
  squaredLength: () => squaredLength,
  str: () => str,
  sub: () => sub,
  subtract: () => subtract,
  transformMat3: () => transformMat3,
  transformMat4: () => transformMat4,
  transformQuat: () => transformQuat,
  zero: () => zero
});
function create() {
  var out = new ARRAY_TYPE(3);
  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
  }
  return out;
}
function clone(a) {
  var out = new ARRAY_TYPE(3);
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}
function length(a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  return Math.sqrt(x * x + y * y + z * z);
}
function fromValues(x, y, z) {
  var out = new ARRAY_TYPE(3);
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}
function copy(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}
function set(out, x, y, z) {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}
function add(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  return out;
}
function subtract(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}
function multiply(out, a, b) {
  out[0] = a[0] * b[0];
  out[1] = a[1] * b[1];
  out[2] = a[2] * b[2];
  return out;
}
function divide(out, a, b) {
  out[0] = a[0] / b[0];
  out[1] = a[1] / b[1];
  out[2] = a[2] / b[2];
  return out;
}
function ceil(out, a) {
  out[0] = Math.ceil(a[0]);
  out[1] = Math.ceil(a[1]);
  out[2] = Math.ceil(a[2]);
  return out;
}
function floor(out, a) {
  out[0] = Math.floor(a[0]);
  out[1] = Math.floor(a[1]);
  out[2] = Math.floor(a[2]);
  return out;
}
function min(out, a, b) {
  out[0] = Math.min(a[0], b[0]);
  out[1] = Math.min(a[1], b[1]);
  out[2] = Math.min(a[2], b[2]);
  return out;
}
function max(out, a, b) {
  out[0] = Math.max(a[0], b[0]);
  out[1] = Math.max(a[1], b[1]);
  out[2] = Math.max(a[2], b[2]);
  return out;
}
function round2(out, a) {
  out[0] = round(a[0]);
  out[1] = round(a[1]);
  out[2] = round(a[2]);
  return out;
}
function scale(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  return out;
}
function scaleAndAdd(out, a, b, scale2) {
  out[0] = a[0] + b[0] * scale2;
  out[1] = a[1] + b[1] * scale2;
  out[2] = a[2] + b[2] * scale2;
  return out;
}
function distance(a, b) {
  var x = b[0] - a[0];
  var y = b[1] - a[1];
  var z = b[2] - a[2];
  return Math.sqrt(x * x + y * y + z * z);
}
function squaredDistance(a, b) {
  var x = b[0] - a[0];
  var y = b[1] - a[1];
  var z = b[2] - a[2];
  return x * x + y * y + z * z;
}
function squaredLength(a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  return x * x + y * y + z * z;
}
function negate(out, a) {
  out[0] = -a[0];
  out[1] = -a[1];
  out[2] = -a[2];
  return out;
}
function inverse(out, a) {
  out[0] = 1 / a[0];
  out[1] = 1 / a[1];
  out[2] = 1 / a[2];
  return out;
}
function normalize(out, a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  var len2 = x * x + y * y + z * z;
  if (len2 > 0) {
    len2 = 1 / Math.sqrt(len2);
  }
  out[0] = a[0] * len2;
  out[1] = a[1] * len2;
  out[2] = a[2] * len2;
  return out;
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(out, a, b) {
  var ax = a[0], ay = a[1], az = a[2];
  var bx = b[0], by = b[1], bz = b[2];
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}
function lerp(out, a, b, t) {
  var ax = a[0];
  var ay = a[1];
  var az = a[2];
  out[0] = ax + t * (b[0] - ax);
  out[1] = ay + t * (b[1] - ay);
  out[2] = az + t * (b[2] - az);
  return out;
}
function slerp(out, a, b, t) {
  var angle2 = Math.acos(Math.min(Math.max(dot(a, b), -1), 1));
  var sinTotal = Math.sin(angle2);
  var ratioA = Math.sin((1 - t) * angle2) / sinTotal;
  var ratioB = Math.sin(t * angle2) / sinTotal;
  out[0] = ratioA * a[0] + ratioB * b[0];
  out[1] = ratioA * a[1] + ratioB * b[1];
  out[2] = ratioA * a[2] + ratioB * b[2];
  return out;
}
function hermite(out, a, b, c, d, t) {
  var factorTimes2 = t * t;
  var factor1 = factorTimes2 * (2 * t - 3) + 1;
  var factor2 = factorTimes2 * (t - 2) + t;
  var factor3 = factorTimes2 * (t - 1);
  var factor4 = factorTimes2 * (3 - 2 * t);
  out[0] = a[0] * factor1 + b[0] * factor2 + c[0] * factor3 + d[0] * factor4;
  out[1] = a[1] * factor1 + b[1] * factor2 + c[1] * factor3 + d[1] * factor4;
  out[2] = a[2] * factor1 + b[2] * factor2 + c[2] * factor3 + d[2] * factor4;
  return out;
}
function bezier(out, a, b, c, d, t) {
  var inverseFactor = 1 - t;
  var inverseFactorTimesTwo = inverseFactor * inverseFactor;
  var factorTimes2 = t * t;
  var factor1 = inverseFactorTimesTwo * inverseFactor;
  var factor2 = 3 * t * inverseFactorTimesTwo;
  var factor3 = 3 * factorTimes2 * inverseFactor;
  var factor4 = factorTimes2 * t;
  out[0] = a[0] * factor1 + b[0] * factor2 + c[0] * factor3 + d[0] * factor4;
  out[1] = a[1] * factor1 + b[1] * factor2 + c[1] * factor3 + d[1] * factor4;
  out[2] = a[2] * factor1 + b[2] * factor2 + c[2] * factor3 + d[2] * factor4;
  return out;
}
function random(out, scale2) {
  scale2 = scale2 === void 0 ? 1 : scale2;
  var r = RANDOM() * 2 * Math.PI;
  var z = RANDOM() * 2 - 1;
  var zScale = Math.sqrt(1 - z * z) * scale2;
  out[0] = Math.cos(r) * zScale;
  out[1] = Math.sin(r) * zScale;
  out[2] = z * scale2;
  return out;
}
function transformMat4(out, a, m) {
  var x = a[0], y = a[1], z = a[2];
  var w = m[3] * x + m[7] * y + m[11] * z + m[15];
  w = w || 1;
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}
function transformMat3(out, a, m) {
  var x = a[0], y = a[1], z = a[2];
  out[0] = x * m[0] + y * m[3] + z * m[6];
  out[1] = x * m[1] + y * m[4] + z * m[7];
  out[2] = x * m[2] + y * m[5] + z * m[8];
  return out;
}
function transformQuat(out, a, q) {
  var qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  var vx = a[0], vy = a[1], vz = a[2];
  var tx = qy * vz - qz * vy;
  var ty = qz * vx - qx * vz;
  var tz = qx * vy - qy * vx;
  tx = tx + tx;
  ty = ty + ty;
  tz = tz + tz;
  out[0] = vx + qw * tx + qy * tz - qz * ty;
  out[1] = vy + qw * ty + qz * tx - qx * tz;
  out[2] = vz + qw * tz + qx * ty - qy * tx;
  return out;
}
function rotateX(out, a, b, rad) {
  var p = [], r = [];
  p[0] = a[0] - b[0];
  p[1] = a[1] - b[1];
  p[2] = a[2] - b[2];
  r[0] = p[0];
  r[1] = p[1] * Math.cos(rad) - p[2] * Math.sin(rad);
  r[2] = p[1] * Math.sin(rad) + p[2] * Math.cos(rad);
  out[0] = r[0] + b[0];
  out[1] = r[1] + b[1];
  out[2] = r[2] + b[2];
  return out;
}
function rotateY(out, a, b, rad) {
  var p = [], r = [];
  p[0] = a[0] - b[0];
  p[1] = a[1] - b[1];
  p[2] = a[2] - b[2];
  r[0] = p[2] * Math.sin(rad) + p[0] * Math.cos(rad);
  r[1] = p[1];
  r[2] = p[2] * Math.cos(rad) - p[0] * Math.sin(rad);
  out[0] = r[0] + b[0];
  out[1] = r[1] + b[1];
  out[2] = r[2] + b[2];
  return out;
}
function rotateZ(out, a, b, rad) {
  var p = [], r = [];
  p[0] = a[0] - b[0];
  p[1] = a[1] - b[1];
  p[2] = a[2] - b[2];
  r[0] = p[0] * Math.cos(rad) - p[1] * Math.sin(rad);
  r[1] = p[0] * Math.sin(rad) + p[1] * Math.cos(rad);
  r[2] = p[2];
  out[0] = r[0] + b[0];
  out[1] = r[1] + b[1];
  out[2] = r[2] + b[2];
  return out;
}
function angle(a, b) {
  var ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2], mag = Math.sqrt((ax * ax + ay * ay + az * az) * (bx * bx + by * by + bz * bz)), cosine = mag && dot(a, b) / mag;
  return Math.acos(Math.min(Math.max(cosine, -1), 1));
}
function zero(out) {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  return out;
}
function str(a) {
  return "vec3(" + a[0] + ", " + a[1] + ", " + a[2] + ")";
}
function exactEquals(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
function equals(a, b) {
  var a0 = a[0], a1 = a[1], a2 = a[2];
  var b0 = b[0], b1 = b[1], b2 = b[2];
  return Math.abs(a0 - b0) <= EPSILON * Math.max(1, Math.abs(a0), Math.abs(b0)) && Math.abs(a1 - b1) <= EPSILON * Math.max(1, Math.abs(a1), Math.abs(b1)) && Math.abs(a2 - b2) <= EPSILON * Math.max(1, Math.abs(a2), Math.abs(b2));
}
var sub = subtract;
var mul = multiply;
var div = divide;
var dist = distance;
var sqrDist = squaredDistance;
var len = length;
var sqrLen = squaredLength;
var forEach = (function() {
  var vec = create();
  return function(a, stride, offset, count, fn, arg) {
    var i, l;
    if (!stride) {
      stride = 3;
    }
    if (!offset) {
      offset = 0;
    }
    if (count) {
      l = Math.min(count * stride + offset, a.length);
    } else {
      l = a.length;
    }
    for (i = offset; i < l; i += stride) {
      vec[0] = a[i];
      vec[1] = a[i + 1];
      vec[2] = a[i + 2];
      fn(vec, vec, arg);
      a[i] = vec[0];
      a[i + 1] = vec[1];
      a[i + 2] = vec[2];
    }
    return a;
  };
})();

// node_modules/delaunator/index.js
var EPSILON2 = Math.pow(2, -52);
var Delaunator = class _Delaunator {
  static from(points, getX = defaultGetX, getY = defaultGetY) {
    const n = points.length;
    const coords = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      coords[2 * i] = getX(p);
      coords[2 * i + 1] = getY(p);
    }
    return new _Delaunator(coords);
  }
  constructor(coords) {
    const n = coords.length >> 1;
    if (n > 0 && typeof coords[0] !== "number") throw new Error("Expected coords to contain numbers.");
    this.coords = coords;
    const maxTriangles = 2 * n - 5;
    const triangles = this.triangles = new Uint32Array(maxTriangles * 3);
    const halfedges = this.halfedges = new Int32Array(maxTriangles * 3);
    this._hashSize = Math.ceil(Math.sqrt(n));
    const hullPrev = this.hullPrev = new Uint32Array(n);
    const hullNext = this.hullNext = new Uint32Array(n);
    const hullTri = this.hullTri = new Uint32Array(n);
    const hullHash = new Int32Array(this._hashSize).fill(-1);
    const ids = new Uint32Array(n);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = coords[2 * i];
      const y = coords[2 * i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      ids[i] = i;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    let minDist = Infinity;
    let i0, i1, i2;
    for (let i = 0; i < n; i++) {
      const d = dist2(cx, cy, coords[2 * i], coords[2 * i + 1]);
      if (d < minDist) {
        i0 = i;
        minDist = d;
      }
    }
    const i0x = coords[2 * i0];
    const i0y = coords[2 * i0 + 1];
    minDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (i === i0) continue;
      const d = dist2(i0x, i0y, coords[2 * i], coords[2 * i + 1]);
      if (d < minDist && d > 0) {
        i1 = i;
        minDist = d;
      }
    }
    let i1x = coords[2 * i1];
    let i1y = coords[2 * i1 + 1];
    let minRadius = Infinity;
    for (let i = 0; i < n; i++) {
      if (i === i0 || i === i1) continue;
      const r = circumradius(i0x, i0y, i1x, i1y, coords[2 * i], coords[2 * i + 1]);
      if (r < minRadius) {
        i2 = i;
        minRadius = r;
      }
    }
    let i2x = coords[2 * i2];
    let i2y = coords[2 * i2 + 1];
    if (minRadius === Infinity) {
      throw new Error("No Delaunay triangulation exists for this input.");
    }
    if (orient(i0x, i0y, i1x, i1y, i2x, i2y)) {
      const i = i1;
      const x = i1x;
      const y = i1y;
      i1 = i2;
      i1x = i2x;
      i1y = i2y;
      i2 = i;
      i2x = x;
      i2y = y;
    }
    const center = circumcenter(i0x, i0y, i1x, i1y, i2x, i2y);
    this._cx = center.x;
    this._cy = center.y;
    const dists = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      dists[i] = dist2(coords[2 * i], coords[2 * i + 1], center.x, center.y);
    }
    quicksort(ids, dists, 0, n - 1);
    this.hullStart = i0;
    let hullSize = 3;
    hullNext[i0] = hullPrev[i2] = i1;
    hullNext[i1] = hullPrev[i0] = i2;
    hullNext[i2] = hullPrev[i1] = i0;
    hullTri[i0] = 0;
    hullTri[i1] = 1;
    hullTri[i2] = 2;
    hullHash[this._hashKey(i0x, i0y)] = i0;
    hullHash[this._hashKey(i1x, i1y)] = i1;
    hullHash[this._hashKey(i2x, i2y)] = i2;
    this.trianglesLen = 0;
    this._addTriangle(i0, i1, i2, -1, -1, -1);
    for (let k = 0, xp, yp; k < ids.length; k++) {
      const i = ids[k];
      const x = coords[2 * i];
      const y = coords[2 * i + 1];
      if (k > 0 && Math.abs(x - xp) <= EPSILON2 && Math.abs(y - yp) <= EPSILON2) continue;
      xp = x;
      yp = y;
      if (i === i0 || i === i1 || i === i2) continue;
      let start = 0;
      for (let j = 0, key = this._hashKey(x, y); j < this._hashSize; j++) {
        start = hullHash[(key + j) % this._hashSize];
        if (start !== -1 && start !== hullNext[start]) break;
      }
      start = hullPrev[start];
      let e = start, q;
      while (q = hullNext[e], !orient(x, y, coords[2 * e], coords[2 * e + 1], coords[2 * q], coords[2 * q + 1])) {
        e = q;
        if (e === start) {
          e = -1;
          break;
        }
      }
      if (e === -1) continue;
      let t = this._addTriangle(e, i, hullNext[e], -1, -1, hullTri[e]);
      hullTri[i] = this._legalize(t + 2);
      hullTri[e] = t;
      hullSize++;
      let n2 = hullNext[e];
      while (q = hullNext[n2], orient(x, y, coords[2 * n2], coords[2 * n2 + 1], coords[2 * q], coords[2 * q + 1])) {
        t = this._addTriangle(n2, i, q, hullTri[i], -1, hullTri[n2]);
        hullTri[i] = this._legalize(t + 2);
        hullNext[n2] = n2;
        hullSize--;
        n2 = q;
      }
      if (e === start) {
        while (q = hullPrev[e], orient(x, y, coords[2 * q], coords[2 * q + 1], coords[2 * e], coords[2 * e + 1])) {
          t = this._addTriangle(q, i, e, -1, hullTri[e], hullTri[q]);
          this._legalize(t + 2);
          hullTri[q] = t;
          hullNext[e] = e;
          hullSize--;
          e = q;
        }
      }
      this.hullStart = hullPrev[i] = e;
      hullNext[e] = hullPrev[n2] = i;
      hullNext[i] = n2;
      hullHash[this._hashKey(x, y)] = i;
      hullHash[this._hashKey(coords[2 * e], coords[2 * e + 1])] = e;
    }
    this.hull = new Uint32Array(hullSize);
    for (let i = 0, e = this.hullStart; i < hullSize; i++) {
      this.hull[i] = e;
      e = hullNext[e];
    }
    this.hullPrev = this.hullNext = this.hullTri = null;
    this.triangles = triangles.subarray(0, this.trianglesLen);
    this.halfedges = halfedges.subarray(0, this.trianglesLen);
  }
  _hashKey(x, y) {
    return Math.floor(pseudoAngle(x - this._cx, y - this._cy) * this._hashSize) % this._hashSize;
  }
  _legalize(a) {
    const { triangles, coords, halfedges } = this;
    const b = halfedges[a];
    const a0 = a - a % 3;
    const b0 = b - b % 3;
    const al = a0 + (a + 1) % 3;
    const ar = a0 + (a + 2) % 3;
    const bl = b0 + (b + 2) % 3;
    if (b === -1) return ar;
    const p0 = triangles[ar];
    const pr = triangles[a];
    const pl = triangles[al];
    const p1 = triangles[bl];
    const illegal = inCircle(
      coords[2 * p0],
      coords[2 * p0 + 1],
      coords[2 * pr],
      coords[2 * pr + 1],
      coords[2 * pl],
      coords[2 * pl + 1],
      coords[2 * p1],
      coords[2 * p1 + 1]
    );
    if (illegal) {
      triangles[a] = p1;
      triangles[b] = p0;
      const hbl = halfedges[bl];
      if (hbl === -1) {
        let e = this.hullStart;
        do {
          if (this.hullTri[e] === bl) {
            this.hullTri[e] = a;
            break;
          }
          e = this.hullNext[e];
        } while (e !== this.hullStart);
      }
      this._link(a, hbl);
      this._link(b, halfedges[ar]);
      this._link(ar, bl);
      const br = b0 + (b + 1) % 3;
      this._legalize(a);
      return this._legalize(br);
    }
    return ar;
  }
  _link(a, b) {
    this.halfedges[a] = b;
    if (b !== -1) this.halfedges[b] = a;
  }
  // add a new triangle given vertex indices and adjacent half-edge ids
  _addTriangle(i0, i1, i2, a, b, c) {
    const t = this.trianglesLen;
    this.triangles[t] = i0;
    this.triangles[t + 1] = i1;
    this.triangles[t + 2] = i2;
    this._link(t, a);
    this._link(t + 1, b);
    this._link(t + 2, c);
    this.trianglesLen += 3;
    return t;
  }
};
function pseudoAngle(dx, dy) {
  const p = dx / (Math.abs(dx) + Math.abs(dy));
  return (dy > 0 ? 3 - p : 1 + p) / 4;
}
function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
function orient(px, py, qx, qy, rx, ry) {
  return (qy - py) * (rx - qx) - (qx - px) * (ry - qy) < 0;
}
function inCircle(ax, ay, bx, by, cx, cy, px, py) {
  const dx = ax - px;
  const dy = ay - py;
  const ex = bx - px;
  const ey = by - py;
  const fx = cx - px;
  const fy = cy - py;
  const ap = dx * dx + dy * dy;
  const bp = ex * ex + ey * ey;
  const cp = fx * fx + fy * fy;
  return dx * (ey * cp - bp * fy) - dy * (ex * cp - bp * fx) + ap * (ex * fy - ey * fx) < 0;
}
function circumradius(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax;
  const dy = by - ay;
  const ex = cx - ax;
  const ey = cy - ay;
  const bl = dx * dx + dy * dy;
  const cl = ex * ex + ey * ey;
  const d = 0.5 / (dx * ey - dy * ex);
  const x = (ey * bl - dy * cl) * d;
  const y = (dx * cl - ex * bl) * d;
  return x * x + y * y;
}
function circumcenter(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax;
  const dy = by - ay;
  const ex = cx - ax;
  const ey = cy - ay;
  const bl = dx * dx + dy * dy;
  const cl = ex * ex + ey * ey;
  const d = 0.5 / (dx * ey - dy * ex);
  const x = ax + (ey * bl - dy * cl) * d;
  const y = ay + (dx * cl - ex * bl) * d;
  return { x, y };
}
function quicksort(ids, dists, left, right) {
  if (right - left <= 20) {
    for (let i = left + 1; i <= right; i++) {
      const temp = ids[i];
      const tempDist = dists[temp];
      let j = i - 1;
      while (j >= left && dists[ids[j]] > tempDist) ids[j + 1] = ids[j--];
      ids[j + 1] = temp;
    }
  } else {
    const median = left + right >> 1;
    let i = left + 1;
    let j = right;
    swap(ids, median, i);
    if (dists[ids[left]] > dists[ids[right]]) swap(ids, left, right);
    if (dists[ids[i]] > dists[ids[right]]) swap(ids, i, right);
    if (dists[ids[left]] > dists[ids[i]]) swap(ids, left, i);
    const temp = ids[i];
    const tempDist = dists[temp];
    while (true) {
      do
        i++;
      while (dists[ids[i]] < tempDist);
      do
        j--;
      while (dists[ids[j]] > tempDist);
      if (j < i) break;
      swap(ids, i, j);
    }
    ids[left + 1] = ids[j];
    ids[j] = temp;
    if (right - i + 1 >= j - left) {
      quicksort(ids, dists, i, right);
      quicksort(ids, dists, left, j - 1);
    } else {
      quicksort(ids, dists, left, j - 1);
      quicksort(ids, dists, i, right);
    }
  }
}
function swap(arr, i, j) {
  const tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
}
function defaultGetX(p) {
  return p[0];
}
function defaultGetY(p) {
  return p[1];
}

// engine/lib/_vendor-entry.js
var import_dual_mesh = __toESM(require_dual_mesh());
var export_SimplexNoise = import_simplex_noise.default;
var export_TriangleMesh = import_dual_mesh.default;
export {
  Delaunator,
  FlatQueue,
  export_SimplexNoise as SimplexNoise,
  export_TriangleMesh as TriangleMesh,
  vec3_exports as vec3
};
