import type { BattleResolver } from "../engine";
import type { Rapier } from "./rapier";
import { simulateBattle } from "./sim";

/** A battle resolver backed by the physics simulation, for headless battles and Skip. */
export function createPhysicsResolver(R: Rapier): BattleResolver {
  return (battle, terrain) => simulateBattle(R, battle, terrain);
}
