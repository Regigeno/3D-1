import { ALL_ERAS, MILITARY_TYPES, type Cost, type Era, type MilitaryType } from "../types";

export interface UnitDef {
  id: string;
  name: string;
  type: MilitaryType;
  era: Era;
  cost: Cost;
  upkeep: number;
  health: number;
  mass: number;
  speed: number;
  weapon: {
    kind: "melee" | "projectile" | "beam" | "area";
    damage: number;
    range: number;
    cooldown: number;
  };
}

export const SQUAD_SIZE: Record<MilitaryType, number> = {
  infantry: 5,
  ranged: 4,
  cavalry: 3,
  artillery: 1,
  special: 1,
};

export const MAX_SQUADS_PER_ARMY = 15;

const UNIT_NAMES: Record<MilitaryType, Record<Era, string>> = {
  infantry: {
    prehistoric: "Clubman",
    ancient: "Hoplite",
    medieval: "Knight-at-arms",
    modern: "Rifleman",
    futuristic: "Exo-trooper",
    fantastical: "Orc Warband",
  },
  ranged: {
    prehistoric: "Slinger",
    ancient: "Archer",
    medieval: "Longbowman",
    modern: "Sniper",
    futuristic: "Laser Gunner",
    fantastical: "Elf Archer",
  },
  cavalry: {
    prehistoric: "Wolf Sled",
    ancient: "Chariot",
    medieval: "Heavy Horse",
    modern: "Tank",
    futuristic: "Hover Bike",
    fantastical: "Griffin Rider",
  },
  artillery: {
    prehistoric: "Tree",
    ancient: "Ballista",
    medieval: "Trebuchet",
    modern: "Howitzer",
    futuristic: "Railgun",
    fantastical: "Fireball Tower",
  },
  special: {
    prehistoric: "Giant Sloth",
    ancient: "War Elephant",
    medieval: "Siege Ram",
    modern: "Drone",
    futuristic: "Mech",
    fantastical: "Dragon",
  },
};

/** Power tier used to scale stats and costs. Fantastical sits between Medieval and Modern. */
export const ERA_TIER: Record<Era, number> = {
  prehistoric: 0,
  ancient: 1,
  medieval: 2,
  modern: 3,
  futuristic: 4,
  fantastical: 2.5,
};

interface Archetype {
  baseGold: number;
  health: number;
  mass: number;
  speed: number;
  weapon: UnitDef["weapon"];
}

// Per-soldier stats at Prehistoric; higher eras scale these up.
const ARCHETYPES: Record<MilitaryType, Archetype> = {
  infantry: { baseGold: 4, health: 100, mass: 70, speed: 3, weapon: { kind: "melee", damage: 12, range: 1.5, cooldown: 1 } },
  ranged: { baseGold: 5, health: 60, mass: 60, speed: 3, weapon: { kind: "projectile", damage: 10, range: 25, cooldown: 1.5 } },
  cavalry: { baseGold: 7, health: 160, mass: 300, speed: 7, weapon: { kind: "melee", damage: 16, range: 2, cooldown: 1.2 } },
  artillery: { baseGold: 10, health: 200, mass: 500, speed: 0.5, weapon: { kind: "area", damage: 60, range: 45, cooldown: 4 } },
  special: { baseGold: 14, health: 600, mass: 1500, speed: 2.5, weapon: { kind: "melee", damage: 50, range: 3, cooldown: 2 } },
};

function weaponKindFor(type: MilitaryType, era: Era): UnitDef["weapon"]["kind"] {
  if (era === "futuristic" && (type === "ranged" || type === "artillery")) return "beam";
  if (era === "modern" && (type === "cavalry" || type === "special")) return "projectile";
  if (era === "futuristic" && type === "cavalry") return "projectile";
  return ARCHETYPES[type].weapon.kind;
}

function eraCost(type: MilitaryType, era: Era): Cost {
  const tier = ERA_TIER[era];
  const gold = Math.round(ARCHETYPES[type].baseGold * (1 + tier * 0.6));
  if (era === "fantastical") return { gold, mana: 2 };
  if (era === "modern") return { gold, energy: 1 };
  if (era === "futuristic") return { gold, energy: 2 };
  return { gold };
}

function eraUpkeep(era: Era): number {
  return 1 + Math.floor(ERA_TIER[era] / 2);
}

function buildUnit(type: MilitaryType, era: Era): UnitDef {
  const a = ARCHETYPES[type];
  const scale = 1 + ERA_TIER[era] * 0.5;
  return {
    id: `${era}-${type}`,
    name: UNIT_NAMES[type][era],
    type,
    era,
    cost: eraCost(type, era),
    upkeep: eraUpkeep(era),
    health: Math.round(a.health * scale),
    mass: a.mass,
    speed: a.speed,
    weapon: {
      kind: weaponKindFor(type, era),
      damage: Math.round(a.weapon.damage * scale),
      range: a.weapon.range,
      cooldown: a.weapon.cooldown,
    },
  };
}

export const UNITS: Record<string, UnitDef> = Object.fromEntries(
  MILITARY_TYPES.flatMap((type) => ALL_ERAS.map((era) => [`${era}-${type}`, buildUnit(type, era)])),
);

export function unitFor(type: MilitaryType, era: Era): UnitDef {
  const unit = UNITS[`${era}-${type}`];
  if (!unit) throw new Error(`Unknown unit ${era}-${type}`);
  return unit;
}
