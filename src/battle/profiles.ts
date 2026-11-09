import type { UnitDef } from "../engine";

export type AttackStyle = "melee" | "missile" | "lob" | "beam" | "pierce";

/** How a unit exists and fights in the physics battle. Derived from its unit definition. */
export interface BattleProfile {
  /** Capsule radius and half-height of the cylinder part, in meters. */
  radius: number;
  halfHeight: number;
  /** Hover height above the ground for flying units; 0 walks. */
  flyHeight: number;
  /** Meters per second. 0 means it never moves (a Tree). */
  speed: number;
  /** How fast it can change velocity, m/s². Big units turn like boats. */
  accel: number;
  attack: AttackStyle;
  /** Launch speed for missiles, m/s. */
  muzzleSpeed: number;
  /** Explosion radius for lobbed shots; cleave radius for big melee units. */
  splash: number;
  projectileRadius: number;
}

export function battleProfile(unit: UnitDef): BattleProfile {
  const { type, era } = unit;
  const p: BattleProfile = {
    radius: 0.35,
    halfHeight: 0.45,
    flyHeight: 0,
    speed: unit.speed,
    accel: 12,
    attack: "melee",
    muzzleSpeed: 30,
    splash: 0,
    projectileRadius: 0.1,
  };

  if (type === "cavalry") Object.assign(p, { radius: 0.75, halfHeight: 0.35, accel: 7 });
  if (type === "artillery") Object.assign(p, { radius: 1, halfHeight: 0.8, accel: 3 });
  if (type === "special") Object.assign(p, { radius: 1.3, halfHeight: 0.9, accel: 4, splash: 2.2 });

  // Siege engines crawl, but not so slowly that two of them can never meet.
  if (type === "artillery") p.speed = era === "prehistoric" ? 0 : Math.max(p.speed, 1.5);
  if (type === "special" && era === "modern") Object.assign(p, { radius: 0.6, halfHeight: 0.15, flyHeight: 3.2, accel: 8, splash: 0 });
  if (type === "special" && era === "futuristic") Object.assign(p, { radius: 1.2, halfHeight: 1.3 });
  if (type === "special" && era === "fantastical") Object.assign(p, { radius: 1.5, halfHeight: 0.8, flyHeight: 4.5 });
  if (type === "cavalry" && era === "fantastical") Object.assign(p, { flyHeight: 3 });

  const kind = unit.weapon.kind;
  if (unit.weapon.range <= 3.5) p.attack = "melee";
  else if (type === "artillery") p.attack = kind === "beam" ? "pierce" : "lob";
  else if (kind === "beam") p.attack = "beam";
  else p.attack = "missile";

  if (p.attack === "missile") {
    p.muzzleSpeed = era === "modern" || era === "futuristic" ? 90 : era === "prehistoric" ? 24 : 32;
    if (type !== "ranged") p.projectileRadius = 0.18;
  }
  if (p.attack === "lob") {
    p.projectileRadius = era === "prehistoric" ? 0.45 : 0.3;
    p.splash = { prehistoric: 2.4, ancient: 2, medieval: 3, modern: 4, futuristic: 4, fantastical: 3.6 }[era];
  }
  return p;
}
