import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { Rng, type Scenario, type ScenarioProvince, type Terrain } from "../engine";
import { polygonCentroid, shrinkPolygon, voronoiCells, type Point, type Polygon } from "../engine/geometry";
import { LAND_BASE_COLOR, TERRAIN_COLOR, TERRAIN_HEIGHT } from "./palette";

const BORDER_GAP = 0.22;
const BASE_HEIGHT = 0.45;
/** Keeps props out of the middle of a province, where army figures stand. */
const ARMY_CLEARANCE = 2.4;

export interface ProvinceVisual {
  id: string;
  terrain: Terrain;
  height: number;
  /** World-space point on the province top where armies stand. */
  center: Vector3;
  top: Mesh;
  topMaterial: MeshStandardMaterial;
  outline: LineLoop;
  outlineMaterial: LineBasicMaterial;
  capitalFlag: MeshStandardMaterial | null;
}

export interface Board {
  group: Group;
  provinces: Map<string, ProvinceVisual>;
  width: number;
  height: number;
  pickables: Mesh[];
}

const shared = {
  tree: new ConeGeometry(0.45, 1.3, 6),
  trunk: new CylinderGeometry(0.08, 0.1, 0.35, 5),
  peak: new ConeGeometry(1.1, 2.0, 5),
  snow: new ConeGeometry(0.42, 0.75, 5),
  hill: new SphereGeometry(1, 7, 5),
  rock: new DodecahedronGeometry(0.35),
  dune: new SphereGeometry(1, 8, 4),
  crystal: new OctahedronGeometry(0.4),
  pylon: new CylinderGeometry(0.12, 0.2, 1.6, 6),
  keep: new BoxGeometry(1.3, 0.9, 1.3),
  tower: new CylinderGeometry(0.24, 0.26, 1.35, 8),
  pole: new CylinderGeometry(0.035, 0.035, 1.3, 5),
  flag: new BoxGeometry(0.6, 0.38, 0.03),
};

const materials = {
  tree: new MeshStandardMaterial({ color: "#2f6b2a", flatShading: true, roughness: 0.9 }),
  trunk: new MeshStandardMaterial({ color: "#5a3c22", flatShading: true }),
  peak: new MeshStandardMaterial({ color: "#7d7a76", flatShading: true, roughness: 1 }),
  snow: new MeshStandardMaterial({ color: "#f4f6f8", flatShading: true }),
  hill: new MeshStandardMaterial({ color: "#8f8e4f", flatShading: true, roughness: 1 }),
  rock: new MeshStandardMaterial({ color: "#4e4740", flatShading: true }),
  dune: new MeshStandardMaterial({ color: "#d6b469", flatShading: true, roughness: 1 }),
  crystal: new MeshStandardMaterial({ color: "#b06cff", emissive: "#7a2fff", emissiveIntensity: 0.9, flatShading: true }),
  pylon: new MeshStandardMaterial({ color: "#f2d03b", emissive: "#d9a400", emissiveIntensity: 0.7, flatShading: true }),
  stone: new MeshStandardMaterial({ color: "#b9b2a6", flatShading: true, roughness: 0.9 }),
  pole: new MeshStandardMaterial({ color: "#3a3a3a" }),
  base: new MeshStandardMaterial({ color: LAND_BASE_COLOR, flatShading: true, roughness: 1 }),
};

const sideMaterials = new Map<Terrain, MeshStandardMaterial>();
function sideMaterial(terrain: Terrain): MeshStandardMaterial {
  let m = sideMaterials.get(terrain);
  if (!m) {
    m = new MeshStandardMaterial({ color: new Color(TERRAIN_COLOR[terrain]).multiplyScalar(0.55), flatShading: true, roughness: 1 });
    sideMaterials.set(terrain, m);
  }
  return m;
}

function pointInPolygon([x, y]: Point, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function samplePoints(rng: Rng, polygon: Polygon, count: number, keepOut: Point, keepOutRadius: number, spacing: number): Point[] {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const shrunk = shrinkPolygon(polygon, 0.6);
  const out: Point[] = [];
  for (let tries = 0; tries < count * 30 && out.length < count; tries++) {
    const p: Point = [rng.range(minX, maxX), rng.range(minY, maxY)];
    if (!pointInPolygon(p, shrunk)) continue;
    if (Math.hypot(p[0] - keepOut[0], p[1] - keepOut[1]) < keepOutRadius) continue;
    if (out.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < spacing)) continue;
    out.push(p);
  }
  return out;
}

function polygonArea(polygon: Polygon): number {
  let a = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x0, y0] = polygon[i]!;
    const [x1, y1] = polygon[(i + 1) % polygon.length]!;
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}

function prism(polygon: Polygon, depth: number): ExtrudeGeometry {
  // Shape lives in XY; rotating -90 deg about X maps shape (x, -z) onto the ground plane with the extrusion pointing up.
  const shape = new Shape(polygon.map(([x, z]) => new Vector2(x, -z)));
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function outlineGeometry(polygon: Polygon, y: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(polygon.flatMap(([x, z]) => [x, y, z]), 3));
  return g;
}

function add(group: Group, geometry: BufferGeometry, material: MeshStandardMaterial, x: number, y: number, z: number, scale: [number, number, number] = [1, 1, 1], rotY = 0): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(...scale);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function decorate(group: Group, rng: Rng, terrain: Terrain, polygon: Polygon, center: Point, top: number): void {
  const area = polygonArea(polygon);
  const density = (n: number) => Math.max(1, Math.round((area / 100) * n));
  switch (terrain) {
    case "forest":
      for (const [x, z] of samplePoints(rng, polygon, density(14), center, ARMY_CLEARANCE, 0.9)) {
        const s = rng.range(0.75, 1.25);
        add(group, shared.trunk, materials.trunk, x, top + 0.17 * s, z, [s, s, s]);
        add(group, shared.tree, materials.tree, x, top + 0.95 * s, z, [s, s, s], rng.range(0, 6));
      }
      break;
    case "mountains":
      for (const [x, z] of samplePoints(rng, polygon, density(4), center, ARMY_CLEARANCE, 2.0)) {
        const s = rng.range(0.8, 1.35);
        add(group, shared.peak, materials.peak, x, top + 1.0 * s, z, [s, s, s], rng.range(0, 6));
        add(group, shared.snow, materials.snow, x, top + 1.68 * s, z, [s, s, s]);
      }
      break;
    case "hills":
      for (const [x, z] of samplePoints(rng, polygon, density(5), center, ARMY_CLEARANCE, 1.8)) {
        const s = rng.range(0.9, 1.4);
        add(group, shared.hill, materials.hill, x, top, z, [s, 0.45 * s, s]);
      }
      break;
    case "desert":
      for (const [x, z] of samplePoints(rng, polygon, density(4), center, ARMY_CLEARANCE, 2.0)) {
        add(group, shared.dune, materials.dune, x, top, z, [rng.range(1.2, 1.8), 0.3, rng.range(0.7, 1.0)], rng.range(0, 3));
      }
      break;
    case "wasteland":
      for (const [x, z] of samplePoints(rng, polygon, density(7), center, ARMY_CLEARANCE, 1.0)) {
        const s = rng.range(0.6, 1.4);
        add(group, shared.rock, materials.rock, x, top + 0.15 * s, z, [s, s * 0.7, s], rng.range(0, 6));
      }
      break;
    case "plains":
    case "coast":
      for (const [x, z] of samplePoints(rng, polygon, density(2), center, ARMY_CLEARANCE, 2.5)) {
        const s = rng.range(0.6, 0.9);
        add(group, shared.trunk, materials.trunk, x, top + 0.17 * s, z, [s, s, s]);
        add(group, shared.tree, materials.tree, x, top + 0.95 * s, z, [s, s, s]);
      }
      break;
  }
}

function addCapital(group: Group, x: number, z: number, top: number, flagColor: string): MeshStandardMaterial {
  add(group, shared.keep, materials.stone, x, top + 0.45, z);
  for (const [dx, dz] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]] as const) {
    add(group, shared.tower, materials.stone, x + dx, top + 0.67, z + dz);
  }
  add(group, shared.pole, materials.pole, x, top + 1.5, z);
  const flagMaterial = new MeshStandardMaterial({ color: flagColor, flatShading: true });
  add(group, shared.flag, flagMaterial, x + 0.3, top + 1.95, z);
  return flagMaterial;
}

function provincePolygons(scenario: Scenario): { polygons: Map<string, Polygon>; width: number; height: number } {
  const width = scenario.bounds?.width ?? Math.max(...scenario.provinces.map((p) => p.position.x)) + 6;
  const height = scenario.bounds?.height ?? Math.max(...scenario.provinces.map((p) => p.position.y)) + 6;
  const polygons = new Map<string, Polygon>();
  const missing = scenario.provinces.filter((p) => !p.polygon || p.polygon.length < 3);
  if (missing.length > 0) {
    const cells = voronoiCells(scenario.provinces.map((p) => [p.position.x, p.position.y]), { width, height });
    scenario.provinces.forEach((p, i) => polygons.set(p.id, cells.polygons[i]!));
  }
  for (const p of scenario.provinces) if (p.polygon && p.polygon.length >= 3) polygons.set(p.id, p.polygon);
  return { polygons, width, height };
}

/** Builds the static board: land base, province prisms, terrain props, capitals, and resource markers. */
export function buildBoard(scenario: Scenario): Board {
  const group = new Group();
  const provinces = new Map<string, ProvinceVisual>();
  const pickables: Mesh[] = [];
  const { polygons, width, height } = provincePolygons(scenario);
  const toWorld = ([x, y]: Point): Point => [x - width / 2, y - height / 2];
  const capitals = new Map(scenario.factions.map((f) => [f.capital, f.color]));

  scenario.provinces.forEach((p: ScenarioProvince, index) => {
    const polygon = polygons.get(p.id)!.map(toWorld);
    const inner = shrinkPolygon(polygon, BORDER_GAP);
    const topHeight = TERRAIN_HEIGHT[p.terrain];
    const center = polygonCentroid(inner);

    const base = new Mesh(prism(polygon, BASE_HEIGHT), materials.base);
    base.receiveShadow = true;
    base.userData.provinceId = p.id;
    group.add(base);
    pickables.push(base);

    const topMaterial = new MeshStandardMaterial({ color: TERRAIN_COLOR[p.terrain], flatShading: true, roughness: 0.85 });
    const top = new Mesh(prism(inner, topHeight), [topMaterial, sideMaterial(p.terrain)]);
    top.castShadow = true;
    top.receiveShadow = true;
    top.userData.provinceId = p.id;
    group.add(top);
    pickables.push(top);

    const outlineMaterial = new LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95 });
    const outline = new LineLoop(outlineGeometry(shrinkPolygon(inner, 0.08), topHeight + 0.03), outlineMaterial);
    outline.visible = false;
    group.add(outline);

    const rng = new Rng(index * 7919 + 17);
    const props = new Group();
    decorate(props, rng, p.terrain, inner, center, topHeight);

    let capitalFlag: MeshStandardMaterial | null = null;
    const capitalColor = capitals.get(p.id);
    if (capitalColor) {
      const [spot] = samplePoints(rng, inner, 1, center, ARMY_CLEARANCE + 0.6, 0);
      const [cx, cz] = spot ?? [center[0] + ARMY_CLEARANCE, center[1]];
      capitalFlag = addCapital(props, cx, cz, topHeight, capitalColor);
    }
    if (p.special) {
      const [spot] = samplePoints(rng, inner, 1, center, ARMY_CLEARANCE + 0.2, 0);
      if (spot) {
        if (p.special === "ley-line") add(props, shared.crystal, materials.crystal, spot[0], topHeight + 0.7, spot[1], [1, 1.5, 1]);
        else add(props, shared.pylon, materials.pylon, spot[0], topHeight + 0.8, spot[1]);
      }
    }
    group.add(props);

    provinces.set(p.id, {
      id: p.id,
      terrain: p.terrain,
      height: topHeight,
      center: new Vector3(center[0], topHeight, center[1]),
      top,
      topMaterial,
      outline,
      outlineMaterial,
      capitalFlag,
    });
  });

  return { group, provinces, width, height, pickables };
}
