import { factionIncome, factionUpkeep, type ResourceKind } from "../engine";
import { incomingProposals } from "../game/diplomacy";
import { affordableResearch } from "../game/research";
import type { GameSession } from "../game/session";
import { victoryGoal } from "../game/victory";

const RESOURCES: Array<{ key: ResourceKind; label: string; icon: string }> = [
  { key: "gold", label: "Gold", icon: "◆" },
  { key: "knowledge", label: "Knowledge", icon: "✦" },
  { key: "mana", label: "Mana", icon: "✧" },
  { key: "energy", label: "Energy", icon: "⚡" },
];

interface Props {
  session: GameSession;
  onMenu(): void;
  onToggleTreasury(): void;
  onOpenResearch(): void;
  onOpenDiplomacy(): void;
}

export function TopBar({ session, onMenu, onToggleTreasury, onOpenResearch, onOpenDiplomacy }: Props) {
  const { state } = session;
  const me = state.factions[session.viewer]!;
  const income = factionIncome(state, me.id);
  const upkeep = factionUpkeep(state, me.id);
  const active = state.factions[state.activeFaction]!;
  const researchable = affordableResearch(state, me.id).length;
  const goal = victoryGoal(state, me.id);
  const proposals = incomingProposals(state, me.id).length;

  return (
    <div className="topbar panel">
      <div className="faction">
        <span className="swatch" style={{ background: me.color }} />
        <strong>{me.name}</strong>
      </div>
      <div className="turn">Turn {state.turn}</div>
      <div className="goal muted" title={goal.detail}>
        {goal.text}
      </div>
      <button className="resources ghost" onClick={onToggleTreasury} title="Show income and upkeep">
        {RESOURCES.map(({ key, label, icon }) => {
          const delta = income[key] - (key === "gold" ? upkeep : 0);
          return (
            <div key={key} className={`resource ${key}`} title={key === "gold" ? `${label}: +${income.gold} income, -${upkeep} upkeep` : label}>
              <span className="icon">{icon}</span>
              <span>{me.resources[key]}</span>
              <span className={delta < 0 ? "delta negative" : "delta"}>
                {delta >= 0 ? "+" : ""}
                {delta}
              </span>
            </div>
          );
        })}
      </button>
      <div className="spacer" />
      {!session.isHumanTurn && !state.winner && !session.defeated && <span className="muted">{active.name} is thinking…</span>}
      <button className="ghost research-button" onClick={onOpenResearch} title="Research (R)">
        Research
        {researchable > 0 && <span className="badge">{researchable}</span>}
      </button>
      <button className="ghost" onClick={onOpenDiplomacy} title="Diplomacy (D)">
        Diplomacy
        {proposals > 0 && <span className="badge alert">{proposals}</span>}
      </button>
      <button className="ghost" onClick={onMenu} title="Menu (Esc)">
        Menu
      </button>
      <button className="primary" disabled={!session.isHumanTurn || !!session.battlePrompt} onClick={() => session.dispatch({ kind: "end-turn" })}>
        End turn
      </button>
    </div>
  );
}
