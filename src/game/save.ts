import { rules, validateScenario, type Difficulty, type GameState } from "../engine";
import type { BattleReport, LogEntry } from "./session";

export const SAVE_FORMAT = "petty-empires-save";
export const SAVE_VERSION = 1;

/** Everything needed to resume a game. Plain JSON, so it can be stored or exported as a file. */
export interface SaveData {
  format: typeof SAVE_FORMAT;
  version: typeof SAVE_VERSION;
  savedAt: number;
  state: GameState;
  log: LogEntry[];
  battleReports: BattleReport[];
}

export interface SaveSummary {
  id: string;
  savedAt: number;
  turn: number;
  scenario: string;
  faction: string;
  color: string;
  finished: boolean;
}

export function summarize(id: string, save: SaveData): SaveSummary {
  const { state } = save;
  const human = Object.values(state.factions).find((f) => f.controller === "human") ?? state.factions[state.factionOrder[0]!]!;
  return {
    id,
    savedAt: save.savedAt,
    turn: state.turn,
    scenario: state.scenario.name,
    faction: human.name,
    color: human.color,
    finished: !!state.winner || !Object.values(state.factions).some((f) => f.controller === "human" && f.alive),
  };
}

/** Reads a save from JSON text, with a readable error when it is not a usable save. */
export function parseSave(text: string): SaveData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not a Petty Empires save (it is not valid JSON).");
  }
  const save = data as Partial<SaveData> | null;
  if (!save || typeof save !== "object" || save.format !== SAVE_FORMAT) throw new Error("This file is not a Petty Empires save.");
  if (save.version !== SAVE_VERSION) throw new Error(`This save comes from an unsupported version (${String(save.version)}).`);
  const state = save.state;
  if (!state || state.version !== 1 || !state.scenario || !state.factions || !state.provinces || !state.armies || !state.relations) {
    throw new Error("This save is damaged: the game state is incomplete.");
  }
  const errors = validateScenario(state.scenario);
  if (errors.length > 0) throw new Error(`This save is damaged: ${errors[0]}`);
  if (!state.factions[state.activeFaction]) throw new Error("This save is damaged: the active faction is missing.");
  repairState(state);
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: typeof save.savedAt === "number" ? save.savedAt : Date.now(),
    state,
    log: Array.isArray(save.log) ? save.log : [],
    battleReports: Array.isArray(save.battleReports) ? save.battleReports : [],
  };
}

const DIFFICULTIES: readonly Difficulty[] = ["beginner", "easy", "normal", "hard", "petty"];

/** Older saves predate population and the wider difficulty list. */
function repairState(state: GameState): void {
  if (!DIFFICULTIES.includes(state.options.difficulty)) state.options.difficulty = "normal";
  for (const province of state.scenario.provinces) {
    const live = state.provinces[province.id];
    if (!live) continue;
    if (typeof live.population !== "number" || !Number.isFinite(live.population)) {
      const capital = state.scenario.factions.some((f) => f.capital === province.id);
      live.population = rules.startingPopulation(province.terrain, capital);
    }
  }
}

/** A file name like "petty-empires-crimson-horde-turn-12.json". */
export function saveFileName(save: SaveData): string {
  const summary = summarize("file", save);
  const slug = summary.faction.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `petty-empires-${slug}-turn-${summary.turn}.json`;
}
