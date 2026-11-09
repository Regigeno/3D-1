import type { Scenario } from "../types";
import { FANTASY_EARTH } from "./fantasyEarth";
import { buildPreset, type PresetDefinition } from "./preset";
import { SHATTERED_CROWN } from "./shatteredCrown";

export { buildPreset, type PresetDefinition, type PresetProvince } from "./preset";

export const PRESETS: readonly PresetDefinition[] = [FANTASY_EARTH, SHATTERED_CROWN];

const built = new Map<string, Scenario>();

/** The preset's scenario, built once. Callers get a fresh copy they may keep. */
export function presetScenario(id: string): Scenario {
  let scenario = built.get(id);
  if (!scenario) {
    const def = PRESETS.find((p) => p.id === id);
    if (!def) throw new Error(`Unknown preset map ${id}`);
    scenario = buildPreset(def);
    built.set(id, scenario);
  }
  return structuredClone(scenario);
}
