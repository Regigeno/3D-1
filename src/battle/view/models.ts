import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from "three";
import type { UnitDef } from "../../engine";
import { battleProfile } from "../profiles";

const G = {
  body: new CapsuleGeometry(0.3, 0.42, 4, 10),
  head: new SphereGeometry(0.27, 14, 10),
  eye: new SphereGeometry(0.045, 6, 5),
  arm: new CapsuleGeometry(0.08, 0.34, 3, 6),
  leg: new CapsuleGeometry(0.1, 0.28, 3, 6),
  box: new BoxGeometry(1, 1, 1),
  sphere: new SphereGeometry(1, 14, 10),
  cylinder: new CylinderGeometry(1, 1, 1, 12),
  cone: new ConeGeometry(1, 1, 10),
  rock: new DodecahedronGeometry(1, 0),
};

const solid = (color: string, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) =>
  new MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, ...extra });

const M = {
  skin: solid("#e8b48a"),
  orcSkin: solid("#6f9a45"),
  elfSkin: solid("#f1d2b0"),
  black: solid("#141414"),
  white: solid("#f2f2f2"),
  wood: solid("#7a5230"),
  darkWood: solid("#4e3420"),
  stone: solid("#8d8a84"),
  bronze: solid("#c08a3e", { metalness: 0.5, roughness: 0.4 }),
  steel: solid("#c7ccd3", { metalness: 0.6, roughness: 0.35 }),
  gun: solid("#2f3236", { metalness: 0.4, roughness: 0.5 }),
  olive: solid("#55613a"),
  fur: solid("#8a6a48"),
  wolf: solid("#8f9396"),
  horse: solid("#6b4630"),
  elephant: solid("#8a8780"),
  leaf: solid("#4f8a3a"),
  sloth: solid("#9a8466"),
  ivory: solid("#efe6cf"),
  griffin: solid("#c9a560"),
  glow: new MeshStandardMaterial({ color: "#7fe9ff", emissive: "#38d6ff", emissiveIntensity: 1.6 }),
  magic: new MeshStandardMaterial({ color: "#ffb26b", emissive: "#ff6a00", emissiveIntensity: 1.6 }),
  fire: new MeshStandardMaterial({ color: "#ffd36b", emissive: "#ff7a00", emissiveIntensity: 2.2 }),
};

const teamMaterials = new Map<string, { team: MeshStandardMaterial; dark: MeshStandardMaterial }>();
function team(color: string) {
  let m = teamMaterials.get(color);
  if (!m) {
    m = { team: solid(color), dark: solid(`#${new Color(color).multiplyScalar(0.6).getHexString()}`) };
    teamMaterials.set(color, m);
  }
  return m;
}

/** Limbs and parts that the battle view animates. */
export interface UnitRig {
  root: Group;
  rightArm: Group | null;
  leftArm: Group | null;
  legs: Group[];
  /** Spins: rotors, wheels. */
  spinners: Mesh[];
  /** Height of the bottom of the physics capsule below its center. */
  footY: number;
}

function part(parent: Group, geometry: BufferGeometry, material: Material, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx): Mesh {
  const m = new Mesh(geometry, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function pivot(parent: Group, x: number, y: number, z: number): Group {
  const g = new Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

type Weapon = "club" | "sling" | "spear" | "sword" | "bow" | "longbow" | "rifle" | "longrifle" | "blaster" | "axe" | "lance" | "none";

interface HumanOptions {
  skin?: Material;
  body: Material;
  helmet?: Material;
  visor?: Material;
  weapon: Weapon;
  shield?: Material;
  ears?: boolean;
  bulk?: number;
}

/** A wobbly little soldier, feet at y = 0, facing +z. */
function human(parent: Group, o: HumanOptions): { group: Group; rightArm: Group; leftArm: Group; legs: Group[] } {
  const g = pivot(parent, 0, 0, 0);
  const bulk = o.bulk ?? 1;
  g.scale.setScalar(bulk);
  const legs = [-0.13, 0.13].map((x) => {
    const leg = pivot(g, x, 0.5, 0);
    part(leg, G.leg, o.body, 0, -0.24, 0).castShadow = false;
    return leg;
  });
  part(g, G.body, o.body, 0, 0.88, 0);
  const skin = o.skin ?? M.skin;
  part(g, G.head, skin, 0, 1.42, 0);
  part(g, G.eye, M.black, -0.09, 1.47, 0.24).castShadow = false;
  part(g, G.eye, M.black, 0.09, 1.47, 0.24).castShadow = false;
  if (o.helmet) part(g, G.sphere, o.helmet, 0, 1.52, -0.01, 0.29, 0.2, 0.29);
  if (o.visor) part(g, G.box, o.visor, 0, 1.46, 0.2, 0.36, 0.1, 0.12);
  if (o.ears) {
    part(g, G.cone, skin, -0.28, 1.5, 0, 0.06, 0.25, 0.06).rotation.z = 1.1;
    part(g, G.cone, skin, 0.28, 1.5, 0, 0.06, 0.25, 0.06).rotation.z = -1.1;
  }

  const rightArm = pivot(g, 0.36, 1.12, 0);
  part(rightArm, G.arm, skin, 0, -0.22, 0).castShadow = false;
  const leftArm = pivot(g, -0.36, 1.12, 0);
  part(leftArm, G.arm, skin, 0, -0.22, 0).castShadow = false;

  const hand = pivot(rightArm, 0, -0.42, 0.05);
  switch (o.weapon) {
    case "club":
      part(hand, G.cylinder, M.wood, 0, 0.25, 0.1, 0.07, 0.75, 0.07).rotation.x = 0.4;
      part(hand, G.sphere, M.wood, 0, 0.58, 0.25, 0.14);
      break;
    case "sling":
      part(hand, G.sphere, M.stone, 0, 0, 0.12, 0.08);
      break;
    case "spear":
    case "lance":
      part(hand, G.cylinder, M.wood, 0, 0.1, 0.35, 0.03, o.weapon === "lance" ? 2.6 : 1.8, 0.03).rotation.x = Math.PI / 2;
      part(hand, G.cone, M.steel, 0, 0.1, o.weapon === "lance" ? 1.7 : 1.3, 0.06, 0.25, 0.06).rotation.x = Math.PI / 2;
      break;
    case "sword":
      part(hand, G.box, M.steel, 0, 0.35, 0.1, 0.06, 0.75, 0.02).rotation.x = 0.3;
      break;
    case "axe":
      part(hand, G.cylinder, M.wood, 0, 0.3, 0.05, 0.04, 0.9, 0.04);
      part(hand, G.box, M.steel, 0.12, 0.65, 0.05, 0.26, 0.22, 0.04);
      break;
    case "bow":
    case "longbow": {
      const h = o.weapon === "longbow" ? 1.5 : 1.05;
      part(leftArm, G.cylinder, M.wood, 0, -0.42, 0.12, 0.03, h, 0.03);
      break;
    }
    case "rifle":
    case "longrifle":
      part(hand, G.box, M.gun, 0, 0.08, 0.3, 0.07, 0.1, o.weapon === "longrifle" ? 1.3 : 0.9);
      break;
    case "blaster":
      part(hand, G.box, M.white, 0, 0.08, 0.25, 0.1, 0.14, 0.7);
      part(hand, G.box, M.glow, 0, 0.08, 0.62, 0.06, 0.06, 0.06);
      break;
    case "none":
      break;
  }
  if (o.shield) {
    const s = part(leftArm, G.cylinder, o.shield, 0.02, -0.3, 0.16, 0.3, 0.05, 0.3);
    s.rotation.x = Math.PI / 2;
  }
  return { group: g, rightArm, leftArm, legs };
}

/** Four-legged mount or beast, feet at y = 0, facing +z. */
function beast(parent: Group, material: Material, length: number, height: number, width: number, legs: Group[]): Group {
  const g = pivot(parent, 0, 0, 0);
  const legLength = height * 0.45;
  part(g, G.sphere, material, 0, legLength + height * 0.28, 0, width / 2, height * 0.3, length / 2);
  part(g, G.sphere, material, 0, legLength + height * 0.5, length * 0.52, width * 0.32, height * 0.22, length * 0.2);
  part(g, G.eye, M.black, -width * 0.18, legLength + height * 0.56, length * 0.66).castShadow = false;
  part(g, G.eye, M.black, width * 0.18, legLength + height * 0.56, length * 0.66).castShadow = false;
  for (const [x, z] of [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ] as const) {
    const leg = pivot(g, (x * width) / 3, legLength, (z * length) / 3);
    part(leg, G.cylinder, material, 0, -legLength / 2, 0, width * 0.1, legLength, width * 0.1).castShadow = false;
    legs.push(leg);
  }
  return g;
}

function wheel(parent: Group, material: Material, x: number, y: number, z: number, r: number, spinners: Mesh[]): void {
  const w = part(parent, G.cylinder, material, x, y, z, r, 0.12, r);
  w.rotation.z = Math.PI / 2;
  spinners.push(w);
}

/** Builds the model for a unit, in the faction's color. Origin is the physics capsule's center. */
export function buildUnitModel(unit: UnitDef, color: string): UnitRig {
  const root = new Group();
  const { team: T, dark: D } = team(color);
  const profile = battleProfile(unit);
  const footY = -(profile.halfHeight + profile.radius);
  const base = pivot(root, 0, footY, 0);
  const rig: UnitRig = { root, rightArm: null, leftArm: null, legs: [], spinners: [], footY };
  const rider = (parent: Group, o: HumanOptions, y: number, z = 0) => {
    const seat = pivot(parent, 0, y, z);
    const h = human(seat, o);
    h.legs.forEach((l) => (l.rotation.x = -1.2));
    rig.rightArm = h.rightArm;
    rig.leftArm = h.leftArm;
  };
  const soldier = (o: HumanOptions) => {
    const h = human(base, o);
    rig.rightArm = h.rightArm;
    rig.leftArm = h.leftArm;
    rig.legs.push(...h.legs);
  };

  const key = `${unit.era}-${unit.type}`;
  switch (key) {
    // ----- Infantry -----
    case "prehistoric-infantry":
      soldier({ body: M.fur, weapon: "club", helmet: undefined, shield: undefined });
      part(base, G.box, T, 0, 0.95, 0.28, 0.42, 0.18, 0.04);
      break;
    case "ancient-infantry":
      soldier({ body: T, helmet: M.bronze, weapon: "spear", shield: M.bronze });
      break;
    case "medieval-infantry":
      soldier({ body: T, helmet: M.steel, visor: M.steel, weapon: "sword", shield: D });
      break;
    case "modern-infantry":
      soldier({ body: M.olive, helmet: M.olive, weapon: "rifle" });
      part(base, G.box, T, 0, 1.0, 0.27, 0.3, 0.12, 0.04);
      break;
    case "futuristic-infantry":
      soldier({ body: M.white, helmet: M.white, visor: M.glow, weapon: "blaster", bulk: 1.2 });
      part(base, G.box, T, 0, 1.2, 0.33, 0.4, 0.16, 0.05);
      break;
    case "fantastical-infantry":
      soldier({ body: T, skin: M.orcSkin, weapon: "axe", bulk: 1.25 });
      break;

    // ----- Ranged -----
    case "prehistoric-ranged":
      soldier({ body: M.fur, weapon: "sling" });
      part(base, G.box, T, 0, 0.95, 0.28, 0.42, 0.18, 0.04);
      break;
    case "ancient-ranged":
      soldier({ body: T, weapon: "bow" });
      break;
    case "medieval-ranged":
      soldier({ body: D, helmet: T, weapon: "longbow" });
      break;
    case "modern-ranged":
      soldier({ body: M.olive, helmet: D, weapon: "longrifle" });
      break;
    case "futuristic-ranged":
      soldier({ body: M.white, helmet: T, visor: M.glow, weapon: "blaster" });
      break;
    case "fantastical-ranged":
      soldier({ body: T, skin: M.elfSkin, ears: true, weapon: "bow" });
      break;

    // ----- Cavalry -----
    case "prehistoric-cavalry": {
      const wolf = beast(base, M.wolf, 1.3, 0.9, 0.55, rig.legs);
      wolf.position.z = 0.7;
      part(base, G.box, M.wood, 0, 0.25, -0.5, 0.9, 0.12, 1.2);
      rider(base, { body: M.fur, weapon: "spear" }, 0.3, -0.5);
      part(base, G.box, T, 0, 0.45, -1.1, 0.8, 0.3, 0.05);
      break;
    }
    case "ancient-cavalry": {
      const horse = beast(base, M.horse, 1.4, 1.2, 0.5, rig.legs);
      horse.position.z = 0.8;
      part(base, G.box, T, 0, 0.6, -0.5, 1, 0.5, 0.9);
      wheel(base, M.wood, -0.6, 0.45, -0.5, 0.45, rig.spinners);
      wheel(base, M.wood, 0.6, 0.45, -0.5, 0.45, rig.spinners);
      rider(base, { body: T, helmet: M.bronze, weapon: "spear" }, 0.55, -0.5);
      break;
    }
    case "medieval-cavalry": {
      beast(base, M.horse, 1.7, 1.5, 0.55, rig.legs);
      part(base, G.sphere, T, 0, 1.0, 0, 0.34, 0.3, 0.75);
      rider(base, { body: M.steel, helmet: M.steel, visor: M.steel, weapon: "lance", shield: T }, 1.05, -0.1);
      break;
    }
    case "modern-cavalry": {
      part(base, G.box, M.olive, 0, 0.55, 0, 1.4, 0.6, 2.2);
      part(base, G.box, D, -0.75, 0.35, 0, 0.25, 0.5, 2.3);
      part(base, G.box, D, 0.75, 0.35, 0, 0.25, 0.5, 2.3);
      const turret = pivot(base, 0, 1.05, -0.1);
      part(turret, G.box, T, 0, 0, 0, 0.9, 0.4, 0.9);
      part(turret, G.cylinder, M.gun, 0, 0, 0.9, 0.08, 1.4, 0.08).rotation.x = Math.PI / 2;
      rig.rightArm = turret;
      break;
    }
    case "futuristic-cavalry": {
      part(base, G.box, M.white, 0, 0.7, 0, 0.6, 0.3, 1.9);
      part(base, G.box, T, 0, 0.85, 0.6, 0.5, 0.25, 0.6);
      part(base, G.box, M.glow, 0, 0.45, 0, 0.5, 0.06, 1.6);
      rider(base, { body: M.white, helmet: T, visor: M.glow, weapon: "blaster" }, 0.75, -0.2);
      break;
    }
    case "fantastical-cavalry": {
      beast(base, M.griffin, 1.6, 1.3, 0.6, rig.legs);
      for (const side of [-1, 1]) {
        const wing = part(base, G.box, M.griffin, side * 1.0, 1.1, 0, 1.5, 0.06, 0.8);
        wing.rotation.z = side * 0.35;
        rig.spinners.push(wing);
      }
      rider(base, { body: T, skin: M.elfSkin, ears: true, weapon: "spear" }, 0.95, -0.2);
      break;
    }

    // ----- Artillery -----
    case "prehistoric-artillery": {
      part(base, G.cylinder, M.darkWood, 0, 1.6, 0, 0.3, 3.2, 0.3);
      part(base, G.sphere, M.leaf, 0, 3.4, 0, 1.3, 0.9, 1.3);
      const perch = pivot(base, 0, 3.7, 0.2);
      const h = human(perch, { body: M.fur, weapon: "sling" });
      h.group.scale.setScalar(0.8);
      rig.rightArm = h.rightArm;
      part(base, G.box, T, 0.3, 1.4, 0.3, 0.05, 0.8, 0.5);
      break;
    }
    case "ancient-artillery": {
      part(base, G.box, M.wood, 0, 0.6, 0, 1.0, 0.25, 1.8);
      wheel(base, M.darkWood, -0.6, 0.4, -0.5, 0.4, rig.spinners);
      wheel(base, M.darkWood, 0.6, 0.4, -0.5, 0.4, rig.spinners);
      const bow = part(base, G.box, M.wood, 0, 1.0, 0.6, 2.0, 0.12, 0.12);
      bow.rotation.y = 0;
      part(base, G.cylinder, M.steel, 0, 1.0, 0.2, 0.05, 1.6, 0.05).rotation.x = Math.PI / 2;
      part(base, G.box, T, 0, 0.75, -0.8, 0.9, 0.3, 0.05);
      break;
    }
    case "medieval-artillery": {
      part(base, G.box, M.wood, -0.6, 1.2, 0, 0.18, 2.4, 0.18);
      part(base, G.box, M.wood, 0.6, 1.2, 0, 0.18, 2.4, 0.18);
      part(base, G.box, M.wood, 0, 0.15, 0, 1.6, 0.25, 2.2);
      const arm = pivot(base, 0, 2.3, 0);
      part(arm, G.box, M.darkWood, 0, 0, 0.6, 0.15, 0.15, 3.4);
      part(arm, G.box, M.stone, 0, -0.35, -1.0, 0.7, 0.7, 0.7);
      rig.rightArm = arm;
      part(base, G.box, T, 0, 0.6, 1.1, 1.2, 0.5, 0.05);
      break;
    }
    case "modern-artillery": {
      part(base, G.box, M.olive, 0, 0.7, -0.3, 1.2, 0.4, 1.2);
      wheel(base, M.gun, -0.75, 0.55, -0.3, 0.55, rig.spinners);
      wheel(base, M.gun, 0.75, 0.55, -0.3, 0.55, rig.spinners);
      const barrel = pivot(base, 0, 1.0, 0);
      part(barrel, G.cylinder, M.gun, 0, 0, 1.0, 0.13, 2.6, 0.13).rotation.x = Math.PI / 2 - 0.5;
      rig.rightArm = barrel;
      part(base, G.box, T, 0, 0.95, -0.95, 1.0, 0.4, 0.05);
      break;
    }
    case "futuristic-artillery": {
      part(base, G.cylinder, M.white, 0, 0.4, 0, 1.1, 0.5, 1.1);
      part(base, G.box, T, 0, 1.0, 0, 0.8, 0.6, 0.8);
      part(base, G.box, M.gun, -0.2, 1.3, 1.2, 0.12, 0.2, 2.6);
      part(base, G.box, M.gun, 0.2, 1.3, 1.2, 0.12, 0.2, 2.6);
      part(base, G.box, M.glow, 0, 1.3, 1.2, 0.1, 0.08, 2.4);
      break;
    }
    case "fantastical-artillery": {
      part(base, G.cylinder, M.stone, 0, 1.3, 0, 0.8, 2.6, 0.8);
      part(base, G.cone, T, 0, 3.0, 0, 1.0, 0.9, 1.0);
      part(base, G.sphere, M.fire, 0, 3.9, 0, 0.35);
      break;
    }

    // ----- Special -----
    case "prehistoric-special": {
      beast(base, M.sloth, 2.6, 2.6, 1.8, rig.legs);
      part(base, G.box, M.ivory, -0.5, 0.4, 1.4, 0.08, 0.5, 0.08);
      part(base, G.box, M.ivory, 0.5, 0.4, 1.4, 0.08, 0.5, 0.08);
      part(base, G.box, T, 0, 2.3, 0, 1.2, 0.08, 1.0);
      break;
    }
    case "ancient-special": {
      beast(base, M.elephant, 3.0, 2.8, 1.9, rig.legs);
      const trunk = part(base, G.cylinder, M.elephant, 0, 1.4, 2.0, 0.14, 1.4, 0.14);
      trunk.rotation.x = 0.3;
      part(base, G.cone, M.ivory, -0.4, 1.6, 2.0, 0.08, 0.8, 0.08).rotation.x = 1.9;
      part(base, G.cone, M.ivory, 0.4, 1.6, 2.0, 0.08, 0.8, 0.08).rotation.x = 1.9;
      part(base, G.box, T, 0, 2.75, -0.2, 1.2, 0.7, 1.3);
      break;
    }
    case "medieval-special": {
      part(base, G.box, M.wood, 0, 1.2, 0, 2.0, 0.2, 3.4);
      const roof = part(base, G.box, T, 0, 2.0, 0, 2.2, 0.15, 3.6);
      roof.rotation.z = 0;
      part(base, G.cylinder, M.darkWood, 0, 0.9, 0.6, 0.35, 4.2, 0.35).rotation.x = Math.PI / 2;
      part(base, G.sphere, M.steel, 0, 0.9, 2.7, 0.42);
      for (const z of [-1.2, 1.2]) {
        wheel(base, M.darkWood, -1.1, 0.5, z, 0.5, rig.spinners);
        wheel(base, M.darkWood, 1.1, 0.5, z, 0.5, rig.spinners);
      }
      break;
    }
    case "modern-special": {
      const body = pivot(base, 0, profile.halfHeight + profile.radius, 0);
      part(body, G.box, M.gun, 0, 0, 0, 0.6, 0.2, 0.6);
      part(body, G.box, T, 0, 0.12, 0, 0.35, 0.08, 0.35);
      for (const [x, z] of [
        [-0.5, 0.5],
        [0.5, 0.5],
        [-0.5, -0.5],
        [0.5, -0.5],
      ] as const) {
        part(body, G.box, M.gun, x * 0.6, 0, z * 0.6, 0.06, 0.05, 0.5).rotation.y = Math.PI / 4;
        const rotor = part(body, G.cylinder, M.steel, x, 0.08, z, 0.3, 0.02, 0.3);
        rig.spinners.push(rotor);
      }
      part(body, G.sphere, M.gun, 0, -0.18, 0.2, 0.1);
      break;
    }
    case "futuristic-special": {
      const legs = [-0.5, 0.5].map((x) => {
        const leg = pivot(base, x, 1.8, 0);
        part(leg, G.box, M.gun, 0, -0.9, 0, 0.35, 1.8, 0.45);
        part(leg, G.box, M.white, 0, -1.75, 0.15, 0.5, 0.15, 0.8);
        return leg;
      });
      rig.legs.push(...legs);
      part(base, G.box, M.white, 0, 2.6, 0, 1.6, 1.0, 1.1);
      part(base, G.box, T, 0, 3.0, 0.3, 1.0, 0.4, 0.6);
      part(base, G.box, M.glow, 0, 3.0, 0.62, 0.6, 0.12, 0.05);
      const arm = pivot(base, 1.0, 2.6, 0);
      part(arm, G.box, M.gun, 0, -0.2, 0.5, 0.3, 0.3, 1.4);
      rig.rightArm = arm;
      const left = pivot(base, -1.0, 2.6, 0);
      part(left, G.box, M.gun, 0, -0.2, 0.5, 0.3, 0.3, 1.4);
      rig.leftArm = left;
      break;
    }
    case "fantastical-special": {
      const body = pivot(base, 0, 0.6, 0);
      part(body, G.sphere, T, 0, 1.2, 0, 0.9, 0.7, 1.6);
      part(body, G.cylinder, T, 0, 1.6, 1.6, 0.28, 1.2, 0.28).rotation.x = 0.9;
      part(body, G.sphere, D, 0, 2.1, 2.2, 0.4, 0.32, 0.55);
      part(body, G.eye, M.fire, -0.18, 2.25, 2.55).castShadow = false;
      part(body, G.eye, M.fire, 0.18, 2.25, 2.55).castShadow = false;
      part(body, G.cone, D, 0, 1.0, -2.0, 0.3, 2.2, 0.3).rotation.x = -1.6;
      for (const side of [-1, 1]) {
        const wing = part(body, G.box, D, side * 2.0, 1.5, 0, 3.2, 0.08, 1.6);
        wing.rotation.z = side * 0.25;
        rig.spinners.push(wing);
      }
      break;
    }
  }
  return rig;
}

export function projectileMaterial(unit: UnitDef): Material {
  if (unit.era === "fantastical") return M.magic;
  if (unit.era === "futuristic") return M.glow;
  if (unit.era === "modern") return M.gun;
  if (unit.type === "ranged" && unit.era !== "prehistoric") return M.wood;
  return M.stone;
}

export const sharedGeometry = G;
export const sharedMaterials = M;
