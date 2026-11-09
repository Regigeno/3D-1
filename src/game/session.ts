import {
  applyCommand,
  createGame,
  generateRandomScenario,
  runPendingBattle,
  type Command,
  type GameEvent,
  type GameState,
  type Scenario,
} from "../engine";
import { describeEvent } from "./describe";

export interface Selection {
  province: string | null;
  army: string | null;
}

/** "capture" takes an undefended province; "attack" starts a battle. */
export type MoveKind = "move" | "capture" | "attack";

export interface LogEntry {
  id: number;
  turn: number;
  text: string;
  faction: string | null;
}

export interface NewGameSettings {
  seed: number;
  provinces: number;
  factions: number;
}

const MAX_LOG = 60;

/**
 * Owns the current game for the UI: applies commands, keeps the selection and
 * a readable event log, and plays non-human turns. Listeners are notified after
 * every change; `version` lets React detect it.
 */
export class GameSession {
  state: GameState;
  selection: Selection = { province: null, army: null };
  log: LogEntry[] = [];
  lastError: string | null = null;
  version = 0;

  private listeners = new Set<() => void>();
  private nextLogId = 1;

  constructor(state: GameState, initialEvents: GameEvent[] = []) {
    this.state = state;
    this.record(initialEvents);
    this.playAiTurns();
  }

  static newRandomGame(settings: NewGameSettings): GameSession {
    const scenario = generateRandomScenario({
      seed: settings.seed,
      provinces: settings.provinces,
      factions: settings.factions,
    });
    return GameSession.fromScenario(scenario, settings.seed);
  }

  static fromScenario(scenario: Scenario, seed: number): GameSession {
    const human = scenario.factions[0]!.id;
    const { state, events } = createGame(scenario, {
      seed,
      difficulty: "normal",
      victory: { kind: "domination", percent: 70 },
      controllers: { [human]: "human" },
    });
    return new GameSession(state, events);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  /** The faction whose eyes the map is drawn through: the active human, else the first human. */
  get viewer(): string {
    const active = this.state.factions[this.state.activeFaction];
    if (active?.controller === "human") return active.id;
    return Object.values(this.state.factions).find((f) => f.controller === "human")?.id ?? this.state.factionOrder[0]!;
  }

  get isHumanTurn(): boolean {
    return this.state.factions[this.state.activeFaction]?.controller === "human" && !this.state.winner;
  }

  dispatch(command: Command): boolean {
    const result = applyCommand(this.state, command);
    if (!result.ok) {
      this.lastError = result.error;
      this.emit();
      return false;
    }
    this.lastError = null;
    this.state = result.state;
    this.record(result.events);
    this.resolveBattles();
    this.fixSelection();
    if (command.kind === "end-turn") {
      this.selection = { province: null, army: null };
      this.playAiTurns();
    }
    this.emit();
    return true;
  }

  selectProvince(province: string | null): void {
    this.selection = { province, army: null };
    this.lastError = null;
    this.emit();
  }

  selectArmy(armyId: string): void {
    const army = this.state.armies[armyId];
    if (!army) return;
    this.selection = { province: army.location, army: armyId };
    this.lastError = null;
    this.emit();
  }

  clearSelection(): void {
    this.selectProvince(null);
  }

  /** Handles a click on a province: moves the selected army there if possible, otherwise selects it. */
  clickProvince(province: string): void {
    const armyId = this.selection.army;
    if (armyId && this.isHumanTurn && this.moveTargets(armyId).has(province)) {
      this.dispatch({ kind: "move", army: armyId, to: province });
      return;
    }
    this.selectProvince(province);
  }

  /** Neighbors the army can legally move into, and whether that move starts a fight or capture. */
  moveTargets(armyId: string): Map<string, MoveKind> {
    const targets = new Map<string, MoveKind>();
    const army = this.state.armies[armyId];
    if (!army || army.owner !== this.state.activeFaction || this.state.pendingBattle) return targets;
    const province = this.state.scenario.provinces.find((p) => p.id === army.location);
    for (const to of province?.neighbors ?? []) {
      const result = applyCommand(this.state, { kind: "move", army: armyId, to });
      if (!result.ok) continue;
      const kind: MoveKind = result.events.some((e) => e.kind === "battle-started")
        ? "attack"
        : result.events.some((e) => e.kind === "captured")
          ? "capture"
          : "move";
      targets.set(to, kind);
    }
    return targets;
  }

  private resolveBattles(): void {
    // Placeholder until physics battles (build step 6): resolve instantly.
    while (this.state.pendingBattle) {
      const result = runPendingBattle(this.state);
      if (!result.ok) throw new Error(result.error);
      this.state = result.state;
      this.record(result.events);
    }
  }

  private playAiTurns(): void {
    // Placeholder AI until build step 5: computer factions pass.
    let guard = 0;
    while (!this.state.winner && this.state.factions[this.state.activeFaction]?.controller === "ai" && guard++ < 100) {
      const result = applyCommand(this.state, { kind: "end-turn" });
      if (!result.ok) throw new Error(result.error);
      this.state = result.state;
      this.record(result.events);
    }
  }

  private fixSelection(): void {
    const { army } = this.selection;
    if (army) {
      const current = this.state.armies[army];
      if (!current) this.selection = { province: this.selection.province, army: null };
      else this.selection = { province: current.location, army };
    }
  }

  private record(events: GameEvent[]): void {
    for (const event of events) {
      const described = describeEvent(this.state, event);
      if (!described) continue;
      this.log.push({ id: this.nextLogId++, turn: this.state.turn, ...described });
    }
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
  }

  private emit(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}
