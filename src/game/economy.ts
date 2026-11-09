import { armyUpkeep, ownedProvinces, rules, scenarioProvince, type Building, type GameState, type Resources } from "../engine";
import { provinceName } from "./describe";

export interface LedgerLine {
  label: string;
  amount: Resources;
}

export interface Ledger {
  income: LedgerLine[];
  upkeep: Array<{ label: string; gold: number }>;
  net: Resources;
}

const zero = (): Resources => ({ gold: 0, knowledge: 0, mana: 0, energy: 0 });

/** Per-turn income and upkeep for a faction, split into readable lines. */
export function ledger(state: GameState, faction: string): Ledger {
  const owned = ownedProvinces(state, faction);
  const count = (b: Building) => owned.filter((id) => state.provinces[id]!.buildings.includes(b));

  const base = zero();
  base.gold = owned.reduce((sum, id) => sum + scenarioProvince(state, id).baseIncome, 0);
  const income: LedgerLine[] = [{ label: `Provinces (${owned.length})`, amount: base }];

  const capital = state.factions[faction]?.capital;
  if (capital && state.provinces[capital]?.owner === faction) {
    income.push({ label: "Capital", amount: { ...zero(), ...rules.CAPITAL_INCOME } });
  }

  const markets = count("market");
  if (markets.length) income.push({ label: `Markets (${markets.length})`, amount: { ...zero(), gold: markets.length * rules.MARKET_GOLD } });

  const libraries = count("library");
  if (libraries.length) {
    income.push({ label: `Libraries (${libraries.length})`, amount: { ...zero(), knowledge: libraries.length * rules.LIBRARY_KNOWLEDGE } });
  }

  const shrines = count("shrine");
  if (shrines.length) {
    const mana = shrines.reduce((n, id) => n + (scenarioProvince(state, id).special === "ley-line" ? rules.SHRINE_MANA_LEY_LINE : rules.SHRINE_MANA), 0);
    income.push({ label: `Shrines (${shrines.length})`, amount: { ...zero(), mana } });
  }

  const plants = count("power-plant");
  if (plants.length) {
    const energy = plants.reduce(
      (n, id) => n + (scenarioProvince(state, id).special === "power-site" ? rules.POWER_PLANT_ENERGY_POWER_SITE : rules.POWER_PLANT_ENERGY),
      0,
    );
    income.push({ label: `Power plants (${plants.length})`, amount: { ...zero(), energy } });
  }

  const upkeep = Object.values(state.armies)
    .filter((a) => a.owner === faction)
    .map((a) => ({ label: `Army at ${provinceName(state, a.location)} (${a.squads.length} squads)`, gold: armyUpkeep(a) }));

  const net = zero();
  for (const line of income) {
    net.gold += line.amount.gold;
    net.knowledge += line.amount.knowledge;
    net.mana += line.amount.mana;
    net.energy += line.amount.energy;
  }
  net.gold -= upkeep.reduce((n, u) => n + u.gold, 0);

  return { income, upkeep, net };
}

export const BUILDING_INFO: Record<Building, { name: string; effect: string }> = {
  market: { name: "Market", effect: `+${rules.MARKET_GOLD} gold per turn` },
  library: { name: "Library", effect: `+${rules.LIBRARY_KNOWLEDGE} knowledge per turn` },
  shrine: { name: "Shrine", effect: `+${rules.SHRINE_MANA} mana per turn (+${rules.SHRINE_MANA_LEY_LINE} on a ley line)` },
  "power-plant": {
    name: "Power Plant",
    effect: `+${rules.POWER_PLANT_ENERGY} energy per turn (+${rules.POWER_PLANT_ENERGY_POWER_SITE} on a power site)`,
  },
  fort: { name: "Fort", effect: `${rules.FORT_GARRISON_SQUADS} garrison squads defend this province` },
  barracks: { name: "Barracks", effect: "Recruit squads here" },
};
