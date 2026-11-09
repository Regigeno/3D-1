import { ALL_ERAS, MILITARY_TYPES, type Cost, type Era, type MilitaryType } from "../types";

export interface UnitDef {
  id: string;
  name: string;
  type: MilitaryType;
  era: Era;
  cost: Cost;
  upkeep: number;
  health: number;
  /** Fraction of incoming damage absorbed, 0..1. */
  armor: number;
  mass: number;
  speed: number;
  weapon: {
    kind: "melee" | "projectile" | "beam" | "area" | "magic";
    damage: number;
    range: number;
    cooldown: number;
    /** Magic goes straight through armor. */
    ignoresArmor: boolean;
  };
}

/**
 * Rock-paper-scissors between military types: damage multipliers against the
 * listed defender types. Keeps older, cheaper eras useful against the right target.
 */
export const TYPE_BONUS: Record<MilitaryType, Partial<Record<MilitaryType, number>>> = {
  infantry: { cavalry: 1.6 },
  ranged: { infantry: 1.35, special: 1.25 },
  cavalry: { ranged: 1.7, artillery: 1.7 },
  artillery: { infantry: 1.5, special: 1.5 },
  special: { infantry: 1.3, cavalry: 1.3 },
};

const ERA_ARMOR: Record<Era, number> = {
  prehistoric: 0,
  ancient: 0.1,
  medieval: 0.2,
  modern: 0.25,
  futuristic: 0.4,
  fantastical: 0.05,
};

/** Fantastical units hit hard and ignore armor, but are a little fragile. */
const ERA_HEALTH_FACTOR: Partial<Record<Era, number>> = { fantastical: 0.9 };
const ERA_DAMAGE_FACTOR: Partial<Record<Era, number>> = { fantastical: 1.6 };

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
  weapon: Omit<UnitDef["weapon"], "ignoresArmor">;
}

// Per-soldier stats at Prehistoric; higher eras scale these up. Tuned so a full
// squad of each type gives roughly the same health and damage per gold, leaving
// the type counters (TYPE_BONUS) to decide fights between equal budgets.
const ARCHETYPES: Record<MilitaryType, Archetype> = {
  infantry: { baseGold: 4, health: 80, mass: 70, speed: 3, weapon: { kind: "melee", damage: 10, range: 1.5, cooldown: 1 } },
  ranged: { baseGold: 5, health: 85, mass: 60, speed: 3, weapon: { kind: "projectile", damage: 32, range: 25, cooldown: 1.5 } },
  cavalry: { baseGold: 7, health: 250, mass: 300, speed: 7, weapon: { kind: "melee", damage: 34, range: 2, cooldown: 1.2 } },
  artillery: { baseGold: 10, health: 600, mass: 500, speed: 0.5, weapon: { kind: "area", damage: 640, range: 45, cooldown: 4 } },
  special: { baseGold: 14, health: 1650, mass: 1500, speed: 2.5, weapon: { kind: "melee", damage: 300, range: 3, cooldown: 2 } },
};

function weaponKindFor(type: MilitaryType, era: Era): UnitDef["weapon"]["kind"] {
  if (era === "fantastical") return "magic";
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

/** Guns mounted on what are otherwise melee archetypes (tanks, drones, hover bikes) shoot from this far. */
const MOUNTED_GUN_RANGE = 20;

function buildUnit(type: MilitaryType, era: Era): UnitDef {
  const a = ARCHETYPES[type];
  const scale = 1 + ERA_TIER[era] * 0.5;
  const kind = weaponKindFor(type, era);
  const shoots = kind === "projectile" || kind === "beam";
  return {
    id: `${era}-${type}`,
    name: UNIT_NAMES[type][era],
    type,
    era,
    cost: eraCost(type, era),
    upkeep: eraUpkeep(era),
    health: Math.round(a.health * scale * (ERA_HEALTH_FACTOR[era] ?? 1)),
    armor: ERA_ARMOR[era],
    mass: a.mass,
    speed: a.speed,
    weapon: {
      kind,
      damage: Math.round(a.weapon.damage * scale * (ERA_DAMAGE_FACTOR[era] ?? 1)),
      range: shoots ? Math.max(a.weapon.range, MOUNTED_GUN_RANGE) : a.weapon.range,
      cooldown: a.weapon.cooldown,
      ignoresArmor: era === "fantastical",
    },
  };
}

/** Multiplier applied to `attacker`'s damage against `defender`: type counters times armor. */
export function damageMultiplier(attacker: UnitDef, defender: UnitDef): number {
  const counter = TYPE_BONUS[attacker.type][defender.type] ?? 1;
  const armor = attacker.weapon.ignoresArmor ? 0 : defender.armor;
  return counter * (1 - armor);
}

/** Types this type deals bonus damage to, strongest first. */
export function strongAgainst(type: MilitaryType): MilitaryType[] {
  return (Object.entries(TYPE_BONUS[type]) as [MilitaryType, number][]).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** Types that deal bonus damage to this type. */
export function weakAgainst(type: MilitaryType): MilitaryType[] {
  return MILITARY_TYPES.filter((t) => (TYPE_BONUS[t][type] ?? 1) > 1);
}

export const UNITS: Record<string, UnitDef> = Object.fromEntries(
  MILITARY_TYPES.flatMap((type) => ALL_ERAS.map((era) => [`${era}-${type}`, buildUnit(type, era)])),
);

export function unitFor(type: MilitaryType, era: Era): UnitDef {
  const unit = UNITS[`${era}-${type}`];
  if (!unit) throw new Error(`Unknown unit ${era}-${type}`);
  return unit;
}
