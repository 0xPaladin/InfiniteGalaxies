class Voronoi {
  delaunay;
  points;
  pointsN;
  cells = { v: [], c: [], b: [], i: new Uint32Array() }; // voronoi cells: v = cell vertices, c = adjacent cells, b = near-border cell, i = cell indexes;
  vertices = { p: [], v: [], c: [] }; // cells vertices: p = vertex coordinates, v = neighboring vertices, c = adjacent cells

  constructor(delaunay, points, pointsN) {
    this.delaunay = delaunay;
    this.points = points;
    this.pointsN = pointsN;
    this.vertices;

    // Half-edges are the indices into the delaunator outputs:
    // delaunay.triangles[e] gives the point ID where the half-edge starts
    // delaunay.halfedges[e] returns either the opposite half-edge in the adjacent triangle, or -1 if there's not an adjacent triangle.
    for (let e = 0; e < this.delaunay.triangles.length; e++) {
      const p = this.delaunay.triangles[this.nextHalfedge(e)];
      if (p < this.pointsN && !this.cells.c[p]) {
        const edges = this.edgesAroundPoint(e);
        this.cells.v[p] = edges.map(e => this.triangleOfEdge(e)); // cell: adjacent vertex
        this.cells.c[p] = edges.map(e => this.delaunay.triangles[e]).filter(c => c < this.pointsN); // cell: adjacent valid cells
        this.cells.b[p] = edges.length > this.cells.c[p].length ? 1 : 0; // cell: is border
      }

      const t = this.triangleOfEdge(e);
      if (!this.vertices.p[t]) {
        this.vertices.p[t] = this.triangleCenter(t); // vertex: coordinates
        this.vertices.v[t] = this.trianglesAdjacentToTriangle(t); // vertex: adjacent vertices
        this.vertices.c[t] = this.pointsOfTriangle(t); // vertex: adjacent cells
      }
    }
  }

  /**
   * Gets the IDs of the points comprising the given triangle.
   */
  pointsOfTriangle(triangleIndex) {
    return this.edgesOfTriangle(triangleIndex).map(edge => this.delaunay.triangles[edge]);
  }

  /**
   * Identifies what triangles are adjacent to the given triangle.
   */
  trianglesAdjacentToTriangle(triangleIndex) {
    const triangles = [];
    for (const edge of this.edgesOfTriangle(triangleIndex)) {
      const opposite = this.delaunay.halfedges[edge];
      triangles.push(this.triangleOfEdge(opposite));
    }
    return triangles;
  }

  /**
   * Gets the indices of all the incoming and outgoing half-edges that touch the given point.
   */
  edgesAroundPoint(start) {
    const result = [];
    let incoming = start;
    do {
      result.push(incoming);
      const outgoing = this.nextHalfedge(incoming);
      incoming = this.delaunay.halfedges[outgoing];
    } while (incoming !== -1 && incoming !== start && result.length < 20);
    return result;
  }

  /**
   * Returns the center of the triangle located at the given index.
   */
  triangleCenter(triangleIndex) {
    const vertices = this.pointsOfTriangle(triangleIndex).map(p => this.points[p]);
    return this.circumcenter(vertices[0], vertices[1], vertices[2]);
  }

  /**
   * Retrieves all of the half-edges for a specific triangle `triangleIndex`.
   */
  edgesOfTriangle(triangleIndex) {
    return [3 * triangleIndex, 3 * triangleIndex + 1, 3 * triangleIndex + 2];
  }

  /**
   * Enables lookup of a triangle, given one of the half-edges of that triangle.
   */
  triangleOfEdge(e) {
    return Math.floor(e / 3);
  }

  /**
   * Moves to the next half-edge of a triangle, given the current half-edge's index.
   */
  nextHalfedge(e) {
    return e % 3 === 2 ? e - 2 : e + 1;
  }

  /**
   * Finds the circumcenter of the triangle identified by points a, b, and c.
   */
  circumcenter(a, b, c) {
    const [ax, ay] = a;
    const [bx, by] = b;
    const [cx, cy] = c;
    const ad = ax * ax + ay * ay;
    const bd = bx * bx + by * by;
    const cd = cx * cx + cy * cy;
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    return [
      (1 / D) * (ad * (by - cy) + bd * (cy - ay) + cd * (ay - by)),
      (1 / D) * (ad * (cx - bx) + bd * (ax - cx) + cd * (bx - ax))
    ];
  }
}

export { Voronoi };
