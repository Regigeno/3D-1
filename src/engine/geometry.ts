import { Delaunay } from "d3-delaunay";

export type Point = [number, number];
export type Polygon = Point[];

export interface Bounds {
  width: number;
  height: number;
}

export interface VoronoiCells {
  polygons: Polygon[];
  neighbors: number[][];
}

/** Voronoi cells clipped to the bounds. Neighbors are cells that share an edge after clipping. */
export function voronoiCells(points: Point[], bounds: Bounds): VoronoiCells {
  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi([0, 0, bounds.width, bounds.height]);
  const polygons: Polygon[] = points.map((_, i) => {
    const cell = voronoi.cellPolygon(i) as Point[] | null;
    if (!cell) return [];
    // d3 closes the ring by repeating the first point.
    return cell.slice(0, -1).map(([x, y]) => [x, y] as Point);
  });
  const neighbors = points.map((_, i) => [...voronoi.neighbors(i)]);
  return { polygons, neighbors };
}

export function polygonCentroid(polygon: Polygon): Point {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x0, y0] = polygon[i]!;
    const [x1, y1] = polygon[(i + 1) % polygon.length]!;
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    const n = polygon.length || 1;
    return [polygon.reduce((s, p) => s + p[0], 0) / n, polygon.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

/** Moves every vertex toward the centroid. Exact for convex polygons such as Voronoi cells. */
export function shrinkPolygon(polygon: Polygon, amount: number): Polygon {
  const [cx, cy] = polygonCentroid(polygon);
  return polygon.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy);
    if (len <= amount) return [cx, cy] as Point;
    const k = (len - amount) / len;
    return [cx + dx * k, cy + dy * k] as Point;
  });
}
