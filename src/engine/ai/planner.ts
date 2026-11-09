import { BUILDING_COST, LIBRARY_KNOWLEDGE, MARKET_GOLD, MIN_PEACE_TURNS, MOVE_COST, POWER_PLANT_ENERGY, POWER_PLANT_ENERGY_POWER_SITE, RESEARCH_COST, SHRINE_MANA_LEY_LINE } from "../data/rules";
import { MAX_SQUADS_PER_ARMY, TYPE_BONUS, unitFor } from "../data/units";
import {
  armiesAt,
  bestMainEra,
  canAfford,
  factionIncome,
  factionUpkeep,
  hasAnyModern,
  hasEra,
  isAllied,
  isHostile,
  ownedProvinces,
  relationBetween,
  scenarioProvince,
  visibleProvinces,
} from "../queries";
import { Rng } from "../rng";
import {
  MAIN_ERAS,
  MILITARY_TYPES,
  type AiPersonality,
  type Army,
  type Building,
  type Command,
  type Era,
  type GameState,
  type MilitaryType,
} from "../types";
import { AI_INCOME_MULTIPLIER } from "../data/rules";
import { adjacentThreat, factionPower, knownDefenders, squadsPower, winChance } from "./evaluate";

interface Profile {
  /** Minimum estimated win chance before attacking a defended province. */
  attackThreshold: number;
  /** Gold kept back when constructing buildings. */
  buildReserve: number;
  buildsPerTurn: number;
  /** Lowest acceptable net gold per turn after recruiting. */
  upkeepFloor: number;
  /** How keen the faction is on war, declaring it, and taking enemy land. */
  warlike: number;
  typeWeights: Record<MilitaryType, number>;
}

const PROFILES: Record<AiPersonality, Profile> = {
  aggressive: {
    attackThreshold: 0.5,
    buildReserve: 12,
    buildsPerTurn: 1,
    upkeepFloor: -1,
    warlike: 1.5,
    typeWeights: { infantry: 1.1, ranged: 0.9, cavalry: 1.3, artillery: 0.8, special: 1.1 },
  },
  builder: {
    attackThreshold: 0.7,
    buildReserve: 4,
    buildsPerTurn: 2,
    upkeepFloor: 1,
    warlike: 0.6,
    typeWeights: { infantry: 1, ranged: 1.2, cavalry: 0.9, artillery: 1.2, special: 0.9 },
  },
  opportunist: {
    attackThreshold: 0.6,
    buildReserve: 8,
    buildsPerTurn: 1,
    upkeepFloor: 0,
    warlike: 1,
    typeWeights: { infantry: 1, ranged: 1, cavalry: 1, artillery: 1, special: 1 },
  },
};

const DIFFICULTY_THRESHOLD_SHIFT = { easy: 0.12, normal: 0, hard: -0.08 } as const;
const STRATEGIC_SEARCH_DEPTH = 8;

type Phase = "respond" | "diplomacy" | "research" | "build" | "recruit" | "move" | "merge" | "end";
const PHASES: Phase[] = ["respond", "diplomacy", "research", "build", "recruit", "move", "merge", "end"];

/** Per-turn scratch memory for one AI faction. Not part of the saved game. */
export interface AiTurn {
  me: string;
  profile: Profile;
  threshold: number;
  rng: Rng;
  phase: number;
  failed: Set<string>;
  handledArmies: Set<string>;
  moves: Map<string, number>;
  builds: number;
  diplomacyDone: boolean;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}

export function startAiTurn(state: GameState): AiTurn {
  const me = state.activeFaction;
  const faction = state.factions[me]!;
  const profile = PROFILES[faction.aiPersonality ?? "opportunist"];
  return {
    me,
    profile,
    threshold: profile.attackThreshold + DIFFICULTY_THRESHOLD_SHIFT[state.options.difficulty],
    rng: new Rng(state.options.seed ^ hashString(me) ^ Math.imul(state.turn, 0x9e3779b1)),
    phase: 0,
    failed: new Set(),
    handledArmies: new Set(),
    moves: new Map(),
    builds: 0,
    diplomacyDone: false,
  };
}

/** Marks a command the engine rejected so the planner does not suggest it again this turn. */
export function rejectAiCommand(turn: AiTurn, command: Command): void {
  turn.failed.add(JSON.stringify(command));
}

/** The next command the AI wants to issue. Always ends with `end-turn`. */
export function nextAiCommand(state: GameState, turn: AiTurn): Command {
  const visible = visibleProvinces(state, turn.me);
  while (turn.phase < PHASES.length) {
    const command = PHASE_HANDLERS[PHASES[turn.phase]!](state, turn, visible);
    if (command && !turn.failed.has(JSON.stringify(command))) return command;
    // Nothing left to do in this phase, or the engine already rejected its best idea.
    turn.phase++;
  }
  return { kind: "end-turn" };
}

type Handler = (state: GameState, turn: AiTurn, visible: Set<string>) => Command | null;

// ---------- Helpers ----------

function provinceValue(state: GameState, me: string, id: string, warlike: number): number {
  const p = scenarioProvince(state, id);
  const ps = state.provinces[id]!;
  let value = 1 + p.baseIncome * 2 + ps.buildings.length * 2;
  if (p.special) value += 3;
  const owner = ps.owner;
  if (owner && state.factions[owner]?.capital === id) value += 12;
  if (owner && owner !== me) value += 2 * warlike;
  return value;
}

function neighborsOf(state: GameState, id: string): string[] {
  return scenarioProvince(state, id).neighbors;
}

function bordering(state: GameState, a: string, b: string): boolean {
  return ownedProvinces(state, a).some((p) => neighborsOf(state, p).some((n) => state.provinces[n]?.owner === b));
}

function isFrontier(state: GameState, me: string, id: string): boolean {
  return neighborsOf(state, id).some((n) => {
    const owner = state.provinces[n]?.owner ?? null;
    return owner !== me && (owner === null || isHostile(state, me, owner));
  });
}

/** Steps from each province to the nearest province not owned by me or my allies. */
function frontierDistance(state: GameState, me: string): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const id of Object.keys(state.provinces)) {
    const owner = state.provinces[id]!.owner;
    if (!owner || !isAllied(state, me, owner)) {
      dist.set(id, 0);
      queue.push(id);
    }
  }
  while (queue.length) {
    const id = queue.shift()!;
    for (const n of neighborsOf(state, id)) {
      if (!dist.has(n)) {
        dist.set(n, dist.get(id)! + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

function netGold(state: GameState, me: string): number {
  return Math.round(factionIncome(state, me).gold * AI_INCOME_MULTIPLIER[state.options.difficulty]) - factionUpkeep(state, me);
}

function canEnter(state: GameState, me: string, to: string): boolean {
  const owner = state.provinces[to]?.owner ?? null;
  return (owner !== null && isAllied(state, me, owner)) || isHostile(state, me, owner);
}

// ---------- Phases ----------

const respond: Handler = (state, turn) => {
  const proposal = state.proposals.find((p) => p.to === turn.me);
  if (!proposal) return null;
  const relation = relationBetween(state, proposal.from, turn.me)!;
  const mine = factionPower(state, turn.me);
  const theirs = factionPower(state, proposal.from);
  const wars = Object.keys(state.factions).filter(
    (f) => f !== turn.me && state.factions[f]!.alive && relationBetween(state, f, turn.me)?.status === "war" && bordering(state, turn.me, f),
  ).length;

  let accept = false;
  if (proposal.kind === "peace") {
    const needed = turn.profile.warlike >= 1.5 ? 1 : 0.7;
    accept = relation.trust >= 30 && (theirs >= mine * needed || wars >= 2);
  } else {
    const commonEnemy = Object.keys(state.factions).some(
      (f) => state.factions[f]!.alive && relationBetween(state, f, turn.me)?.status === "war" && relationBetween(state, f, proposal.from)?.status === "war",
    );
    accept = relation.trust >= 55 && commonEnemy;
  }
  return { kind: "respond-proposal", from: proposal.from, accept };
};

const diplomacy: Handler = (state, turn) => {
  if (turn.diplomacyDone) return null;
  turn.diplomacyDone = true;
  const me = turn.me;
  const mine = factionPower(state, me);
  const others = state.factionOrder.filter((f) => f !== me && state.factions[f]!.alive);

  // An alliance outlives its purpose once no common enemy is left.
  for (const f of others) {
    const r = relationBetween(state, me, f)!;
    if (r.status !== "alliance" || state.turn - r.sinceTurn < 5) continue;
    const shared = others.some((e) => e !== f && relationBetween(state, me, e)?.status === "war" && relationBetween(state, f, e)?.status === "war");
    if (!shared) return { kind: "diplomacy", target: f, action: "declare-war" };
  }

  // Break a long peace with a weak neighbor, or with anyone once there is no war left to fight.
  const atWar = others.some((f) => relationBetween(state, me, f)!.status === "war" && bordering(state, me, f));
  const peaceTargets = others
    .filter((f) => {
      const r = relationBetween(state, me, f)!;
      return r.status === "peace" && state.turn - r.sinceTurn >= MIN_PEACE_TURNS && bordering(state, me, f);
    })
    .sort((a, b) => factionPower(state, a) - factionPower(state, b));
  for (const f of peaceTargets) {
    if (!atWar || mine > factionPower(state, f) * (2.4 / turn.profile.warlike)) {
      return { kind: "diplomacy", target: f, action: "declare-war" };
    }
  }

  // Ask for peace when fighting on several fronts. Humans answer proposals in a later build step.
  const borderWars = others.filter((f) => relationBetween(state, me, f)!.status === "war" && bordering(state, me, f));
  if (borderWars.length >= 2 && (state.turn + state.factionOrder.indexOf(me)) % 4 === 0) {
    const strongest = borderWars
      .filter((f) => state.factions[f]!.controller === "ai")
      .sort((a, b) => factionPower(state, b) - factionPower(state, a))[0];
    if (strongest && factionPower(state, strongest) >= mine * 0.8) {
      return { kind: "diplomacy", target: strongest, action: "propose-peace" };
    }
  }

  // Propose an alliance to a peaceful AI neighbor that shares an enemy.
  for (const f of others) {
    const r = relationBetween(state, me, f)!;
    if (r.status !== "peace" || state.factions[f]!.controller !== "ai" || state.turn - r.sinceTurn < 3) continue;
    const shared = others.some((e) => e !== f && relationBetween(state, me, e)?.status === "war" && relationBetween(state, f, e)?.status === "war");
    if (shared && (state.turn + state.factionOrder.indexOf(me)) % 5 === 0) return { kind: "diplomacy", target: f, action: "propose-alliance" };
  }
  return null;
};

const research: Handler = (state, turn) => {
  const me = turn.me;
  const faction = state.factions[me]!;
  const income = factionIncome(state, me);
  let best: { type: MilitaryType; era: Era; score: number } | null = null;

  for (const type of MILITARY_TYPES) {
    const next = MAIN_ERAS[MAIN_ERAS.indexOf(bestMainEra(state, me, type)) + 1];
    const options: Era[] = next ? [next] : [];
    if (hasEra(state, me, type, "medieval") && !hasEra(state, me, type, "fantastical") && income.mana > 0) options.push("fantastical");
    for (const era of options) {
      const cost = RESEARCH_COST[era as Exclude<Era, "prehistoric">];
      if (cost > faction.resources.knowledge) continue;
      let score = turn.profile.typeWeights[type] / cost;
      // Modern and Futuristic units need Energy; without a power source they cannot be fielded.
      if (era === "futuristic" && income.energy < 2) score *= 0.3;
      if (era === "modern" && !hasAnyModern(state, me)) score *= 1.3;
      if (!best || score > best.score) best = { type, era, score };
    }
  }
  return best ? { kind: "research", type: best.type, era: best.era } : null;
};

const build: Handler = (state, turn, visible) => {
  const me = turn.me;
  if (turn.builds >= turn.profile.buildsPerTurn) return null;
  const faction = state.factions[me]!;
  const owned = ownedProvinces(state, me);
  const capital = faction.capital;
  const income = factionIncome(state, me);
  const libraries = owned.filter((p) => state.provinces[p]!.buildings.includes("library")).length;
  const capitalThreat = owned.includes(capital) ? adjacentThreat(state, me, capital, visible) : 0;
  const dist = frontierDistance(state, me);

  let best: { province: string; building: Building; score: number } | null = null;
  const consider = (province: string, building: Building, score: number) => {
    if (score <= 0 || state.provinces[province]!.buildings.includes(building)) return;
    const cost = BUILDING_COST[building];
    if (faction.resources.gold - (cost.gold ?? 0) < turn.profile.buildReserve) return;
    if (!best || score > best.score) best = { province, building, score };
  };

  const hasBarracks = owned.some((p) => state.provinces[p]!.buildings.includes("barracks"));
  for (const p of owned) {
    const info = scenarioProvince(state, p);
    const safe = (dist.get(p) ?? 0) >= 2;
    if (!hasBarracks) consider(p, "barracks", 5 + (dist.get(p) ?? 0));
    consider(p, "market", (MARKET_GOLD / 15) * (safe ? 1.1 : 0.8));
    if (libraries < Math.max(1, Math.floor(owned.length / 6))) consider(p, "library", (LIBRARY_KNOWLEDGE / 15) * 0.9 * (p === capital ? 1.2 : 1));
    if (info.special === "ley-line") consider(p, "shrine", (SHRINE_MANA_LEY_LINE / 15) * 0.6);
    if (hasAnyModern(state, me) && income.energy < 4) {
      consider(p, "power-plant", ((info.special === "power-site" ? POWER_PLANT_ENERGY_POWER_SITE : POWER_PLANT_ENERGY) / 25) * 1.4);
    }
    if (p !== capital && isFrontier(state, me, p) && owned.length >= 6) {
      const nearBarracks = owned.some(
        (q) => state.provinces[q]!.buildings.includes("barracks") && (q === p || neighborsOf(state, p).includes(q)),
      );
      if (!nearBarracks) consider(p, "barracks", 0.18);
    }
  }
  if (capitalThreat > 0 && owned.includes(capital)) consider(capital, "fort", 0.5);

  if (!best) return null;
  turn.builds++;
  const choice = best as { province: string; building: Building };
  return { kind: "build", province: choice.province, building: choice.building };
};

const recruit: Handler = (state, turn, visible) => {
  const me = turn.me;
  const faction = state.factions[me]!;
  const barracks = ownedProvinces(state, me).filter((p) => state.provinces[p]!.buildings.includes("barracks"));
  if (barracks.length === 0) return null;

  // Recruit where the action is: the barracks closest to land we do not hold.
  const dist = frontierDistance(state, me);
  const where = [...barracks].sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99) || (a === faction.capital ? -1 : 1))[0]!;

  // Counter what we can see of the enemy, while keeping our own mix varied.
  const enemyCounts = new Map<MilitaryType, number>();
  let enemyTotal = 0;
  for (const a of Object.values(state.armies)) {
    if (!visible.has(a.location) || !isHostile(state, me, a.owner)) continue;
    for (const s of a.squads) {
      enemyCounts.set(s.type, (enemyCounts.get(s.type) ?? 0) + 1);
      enemyTotal++;
    }
  }
  const ownCounts = new Map<MilitaryType, number>();
  let ownTotal = 0;
  for (const a of Object.values(state.armies)) {
    if (a.owner !== me) continue;
    for (const s of a.squads) {
      ownCounts.set(s.type, (ownCounts.get(s.type) ?? 0) + 1);
      ownTotal++;
    }
  }

  let best: { type: MilitaryType; era: Era; score: number } | null = null;
  for (const type of MILITARY_TYPES) {
    const eras: Era[] = [bestMainEra(state, me, type)];
    if (hasEra(state, me, type, "fantastical")) eras.push("fantastical");
    for (const era of eras) {
      const unit = unitFor(type, era);
      if (!canAfford(faction.resources, unit.cost)) continue;
      if (netGold(state, me) - unit.upkeep < turn.profile.upkeepFloor) continue;
      let counter = 1;
      for (const [enemyType, count] of enemyCounts) {
        const share = count / enemyTotal;
        counter += share * ((TYPE_BONUS[type][enemyType] ?? 1) - 1);
        counter -= share * ((TYPE_BONUS[enemyType][type] ?? 1) - 1);
      }
      const share = ownTotal ? (ownCounts.get(type) ?? 0) / ownTotal : 0;
      const variety = 1.15 - share;
      const score = turn.profile.typeWeights[type] * Math.max(0.2, counter) * variety * (1 + turn.rng.next() * 0.15);
      if (!best || score > best.score) best = { type, era, score };
    }
  }
  return best ? { kind: "recruit", province: where, type: best.type, era: best.era } : null;
};

function moveCommandFor(state: GameState, turn: AiTurn, army: Army, visible: Set<string>): Command | null {
  const me = turn.me;
  if (army.movementLeft <= 0) return null;
  const here = army.location;
  const power = squadsPower(army.squads);

  const reachable = neighborsOf(state, here).filter(
    (n) => canEnter(state, me, n) && (army.movementLeft >= MOVE_COST[scenarioProvince(state, n).terrain] || army.movementLeft >= 2),
  );

  // Grab several undefended neighbors at once by splitting off single squads.
  const freeTargets = reachable.filter((n) => {
    const owner = state.provinces[n]?.owner ?? null;
    return owner !== me && !(owner && isAllied(state, me, owner)) && knownDefenders(state, me, n, visible).length === 0;
  });
  const readyHere = armiesAt(state, here).filter((a) => a.owner === me && a.movementLeft > 0).length;
  if (freeTargets.length > readyHere && army.squads.length >= 2) {
    const cheapest = army.squads
      .map((s, i) => ({ i, cost: unitFor(s.type, s.era).cost.gold ?? 0 }))
      .sort((a, b) => a.cost - b.cost)[0]!;
    return { kind: "split", army: army.id, squads: [cheapest.i] };
  }

  // Stay home if the capital is under threat and we are what holds it.
  const capital = state.factions[me]!.capital;
  const threat = adjacentThreat(state, me, here, visible);
  const holdingCapital = here === capital && threat > power * 0.6;

  let best: { to: string; score: number } | null = null;
  for (const n of reachable) {
    const owner = state.provinces[n]?.owner ?? null;
    const friendly = owner !== null && isAllied(state, me, owner);
    if (friendly) continue;
    const defenders = knownDefenders(state, me, n, visible);
    const value = provinceValue(state, me, n, turn.profile.warlike);
    let score: number;
    if (defenders.length === 0) {
      score = value;
    } else {
      const chance = winChance(army.squads, defenders, turn.rng.int(0, 1 << 30));
      if (chance < turn.threshold) continue;
      score = value * chance * (1 + 0.3 * turn.profile.warlike) - (1 - chance) * power * 0.05;
    }
    if (!best || score > best.score) best = { to: n, score };
  }
  if (best && !(holdingCapital && best.score < 15)) return { kind: "move", army: army.id, to: best.to };
  if (holdingCapital) return null;

  // Nothing adjacent worth taking: march through friendly land toward the best goal.
  const step = strategicStep(state, turn, army, visible);
  return step ? { kind: "move", army: army.id, to: step } : null;
}

/** First step on the path to the most attractive target, searching through friendly territory. */
function strategicStep(state: GameState, turn: AiTurn, army: Army, visible: Set<string>): string | null {
  const me = turn.me;
  const start = army.location;
  const first = new Map<string, string>();
  const depth = new Map<string, number>([[start, 0]]);
  const queue = [start];
  let best: { step: string; score: number } | null = null;

  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    if (d >= STRATEGIC_SEARCH_DEPTH) continue;
    for (const n of neighborsOf(state, id)) {
      if (depth.has(n)) continue;
      depth.set(n, d + 1);
      const owner = state.provinces[n]?.owner ?? null;
      const friendly = owner !== null && isAllied(state, me, owner);
      const step = d === 0 ? n : first.get(id)!;
      if (friendly) {
        first.set(n, step);
        queue.push(n);
        // Reinforce threatened friendly land, especially the capital.
        if (owner === me) {
          const threat = adjacentThreat(state, me, n, visible);
          const local = armiesAt(state, n).filter((a) => a.owner === me).reduce((s, a) => s + squadsPower(a.squads), 0);
          if (threat > local) {
            const weight = state.factions[me]!.capital === n ? 3 : 1;
            const score = (weight * 10 * Math.min(2, threat / Math.max(1, local + 1))) / (d + 1);
            if (d > 0 && (!best || score > best.score)) best = { step, score };
          }
        }
      } else if (isHostile(state, me, owner) && d > 0) {
        const defenders = knownDefenders(state, me, n, visible);
        const chance = winChance(army.squads, defenders, turn.rng.int(0, 1 << 30), 3);
        if (chance < turn.threshold) continue;
        const score = (provinceValue(state, me, n, turn.profile.warlike) * chance) / (d + 1);
        if (!best || score > best.score) best = { step, score };
      }
    }
  }
  if (!best) return null;
  const terrainCost = MOVE_COST[scenarioProvince(state, best.step).terrain];
  return army.movementLeft >= terrainCost || army.movementLeft >= 2 ? best.step : null;
}

const MAX_MOVES_PER_ARMY = 2;

const move: Handler = (state, turn, visible) => {
  const armies = Object.values(state.armies)
    .filter((a) => a.owner === turn.me && !turn.handledArmies.has(a.id) && a.movementLeft > 0)
    .sort((a, b) => squadsPower(b.squads) - squadsPower(a.squads));
  for (const army of armies) {
    const command = moveCommandFor(state, turn, army, visible);
    if (!command || turn.failed.has(JSON.stringify(command))) {
      turn.handledArmies.add(army.id);
      continue;
    }
    if (command.kind === "move") {
      const moves = (turn.moves.get(army.id) ?? 0) + 1;
      turn.moves.set(army.id, moves);
      if (moves >= MAX_MOVES_PER_ARMY) turn.handledArmies.add(army.id);
    }
    return command;
  }
  return null;
};

const merge: Handler = (state, turn) => {
  const byProvince = new Map<string, Army[]>();
  for (const a of Object.values(state.armies)) {
    if (a.owner !== turn.me) continue;
    byProvince.set(a.location, [...(byProvince.get(a.location) ?? []), a]);
  }
  for (const armies of byProvince.values()) {
    if (armies.length < 2) continue;
    const sorted = [...armies].sort((a, b) => b.squads.length - a.squads.length);
    const group = [sorted[0]!];
    let total = sorted[0]!.squads.length;
    for (const a of sorted.slice(1)) {
      if (total + a.squads.length <= MAX_SQUADS_PER_ARMY) {
        group.push(a);
        total += a.squads.length;
      }
    }
    if (group.length >= 2) return { kind: "merge", armies: group.map((a) => a.id) };
  }
  return null;
};

const PHASE_HANDLERS: Record<Phase, Handler> = {
  respond,
  diplomacy,
  research,
  build,
  recruit,
  move,
  merge,
  end: () => null,
};
