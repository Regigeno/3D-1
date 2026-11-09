import { applyCommand } from "../commands";
import type { Command, GameEvent, GameState } from "../types";
import { nextAiCommand, rejectAiCommand, startAiTurn } from "./planner";

/** Settles `state.pendingBattle`, e.g. with the placeholder resolver or a physics simulation. */
export type BattleSettler = (state: GameState) => { state: GameState; events: GameEvent[] };

export interface AiTurnResult {
  state: GameState;
  events: GameEvent[];
  commands: Command[];
}

const MAX_COMMANDS_PER_TURN = 400;

/**
 * Plays the active computer faction's whole turn, ending with `end-turn`.
 * The planner only reads what that faction can see; every action goes through
 * `applyCommand`, so the AI follows exactly the same rules as a human.
 */
export function playAiTurn(state: GameState, settle: BattleSettler): AiTurnResult {
  const turn = startAiTurn(state);
  const events: GameEvent[] = [];
  const commands: Command[] = [];
  let current = state;

  for (let i = 0; i < MAX_COMMANDS_PER_TURN; i++) {
    const command: Command = i === MAX_COMMANDS_PER_TURN - 1 ? { kind: "end-turn" } : nextAiCommand(current, turn);
    const result = applyCommand(current, command);
    if (!result.ok) {
      if (command.kind === "end-turn") throw new Error(`AI could not end its turn: ${result.error}`);
      rejectAiCommand(turn, command);
      continue;
    }
    commands.push(command);
    current = result.state;
    events.push(...result.events);
    if (current.pendingBattle) {
      const settled = settle(current);
      current = settled.state;
      events.push(...settled.events);
    }
    if (command.kind === "end-turn" || current.winner) break;
  }
  return { state: current, events, commands };
}

export { nextAiCommand, rejectAiCommand, startAiTurn, type AiTurn } from "./planner";
export { factionPower, knownDefenders, squadPower, squadsPower, winChance } from "./evaluate";
