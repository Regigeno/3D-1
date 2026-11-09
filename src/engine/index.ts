export * from "./types";
export { createGame, validateScenario } from "./setup";
export { applyCommand } from "./commands";
export { placeholderResolver, resolveBattle, runPendingBattle } from "./battle";
export { generateRandomScenario, type RandomMapOptions } from "./mapgen";
export * from "./queries";
export {
  UNITS,
  SQUAD_SIZE,
  MAX_SQUADS_PER_ARMY,
  ERA_TIER,
  TYPE_BONUS,
  damageMultiplier,
  strongAgainst,
  unitFor,
  weakAgainst,
  type UnitDef,
} from "./data/units";
export * as rules from "./data/rules";
export * from "./ai";
export { Rng } from "./rng";
