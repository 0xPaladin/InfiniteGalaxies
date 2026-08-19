// Halfedge mesh adapter: provides the TriangleMesh method surface over
// _triangles / _halfedges arrays built from d3-geo-voronoi output.
// Ported from @redblobgames/dual-mesh TriangleMesh.

const s_to_t = s => (s / 3) | 0;
const s_prev_s = s => (s % 3 === 0 ? s + 2 : s - 1);
const s_next_s = s => (s % 3 === 2 ? s - 2 : s + 1);

export class HalfedgeMesh {
    constructor({ _triangles, _halfedges, numRegions, numSolidSides }) {
        this._triangles = _triangles;
        this._halfedges = _halfedges;
        this.numRegions = numRegions;
        this.numSolidSides = numSolidSides;
        this._t_vertex = [];
        this._update();
    }

    _update() {
        const { _triangles, _halfedges } = this;
        this.numSides = _triangles.length;
        this.numSolidRegions = this.numRegions;
        this.numTriangles = this.numSides / 3;
        this.numSolidTriangles = this.numSolidSides / 3;

        if (this._t_vertex.length < this.numTriangles) {
            const numOld = this._t_vertex.length;
            const numNew = this.numTriangles - numOld;
            for (let i = 0; i < numNew; i++) this._t_vertex.push([0, 0]);
        }

        this._r_in_s = new Int32Array(this.numRegions);
        for (let s = 0; s < _triangles.length; s++) {
            const endpoint = _triangles[s_next_s(s)];
            if (this._r_in_s[endpoint] === 0 || _halfedges[s] === -1) {
                this._r_in_s[endpoint] = s;
            }
        }
    }

    r_x(r) { return this._r_vertex ? this._r_vertex[r][0] : 0; }
    r_y(r) { return this._r_vertex ? this._r_vertex[r][1] : 0; }
    t_x(r) { return this._t_vertex[r][0]; }
    t_y(r) { return this._t_vertex[r][1]; }
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

    s_begin_r(s) { return this._triangles[s]; }
    s_end_r(s) { return this._triangles[s_next_s(s)]; }
    s_inner_t(s) { return s_to_t(s); }
    s_outer_t(s) { return s_to_t(this._halfedges[s]); }
    s_next_s(s) { return s_next_s(s); }
    s_prev_s(s) { return s_prev_s(s); }
    s_opposite_s(s) { return this._halfedges[s]; }

    t_circulate_s(out_s, t) {
        out_s.length = 3;
        for (let i = 0; i < 3; i++) out_s[i] = 3 * t + i;
        return out_s;
    }
    t_circulate_r(out_r, t) {
        out_r.length = 3;
        for (let i = 0; i < 3; i++) out_r[i] = this._triangles[3 * t + i];
        return out_r;
    }
    t_circulate_t(out_t, t) {
        out_t.length = 3;
        for (let i = 0; i < 3; i++) out_t[i] = this.s_outer_t(3 * t + i);
        return out_t;
    }

    r_circulate_s(out_s, r) {
        const s0 = this._r_in_s[r];
        let incoming = s0;
        out_s.length = 0;
        do {
            out_s.push(this._halfedges[incoming]);
            const outgoing = s_next_s(incoming);
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
            const outgoing = s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_r;
    }
    r_circulate_t(out_t, r) {
        const s0 = this._r_in_s[r];
        let incoming = s0;
        out_t.length = 0;
        do {
            out_t.push(s_to_t(incoming));
            const outgoing = s_next_s(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== s0);
        return out_t;
    }

    ghost_r() { return this.numRegions - 1; }
    s_ghost(s) { return s >= this.numSolidSides; }
    r_ghost(r) { return r === this.numRegions - 1; }
    t_ghost(t) { return this.s_ghost(3 * t); }
    s_boundary(s) { return this.s_ghost(s) && s % 3 === 0; }
    r_boundary(r) { return r < 0; }

    findRegion(lon, lat) {
        if (!this._delaunay) return -1;
        return this._delaunay.find(lon, lat);
    }
}
