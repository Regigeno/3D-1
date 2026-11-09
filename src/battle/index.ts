import type { BattleResolver } from "../engine";
import type { Rapier } from "./rapier";
import { simulateBattle } from "./sim";

/** A battle resolver backed by the physics simulation, for headless battles and Skip. */
export function createPhysicsResolver(R: Rapier): BattleResolver {
  return (battle, terrain) => simulateBattle(R, battle, terrain);
}

export { loadRapier, type Rapier } from "./rapier";
export { BattleSim, simulateBattle, STEP_SECONDS, MAX_BATTLE_SECONDS, type BattleEffect, type EndReason, type Soldier, type Projectile } from "./sim";
export { BattleView, BATTLE_SPEEDS } from "./view/BattleView";
export { buildArena, groundHeight, FIELD_LENGTH, FIELD_WIDTH, type ArenaLayout } from "./arena";
