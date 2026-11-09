import { useState } from "react";
import { MAIN_ERAS, MILITARY_TYPES, factionIncome, unitFor, type Era, type MilitaryType } from "../engine";
import { ERA_LABEL, TYPE_LABEL } from "../game/describe";
import { researchCell } from "../game/research";
import type { GameSession } from "../game/session";
import { RESOURCE_ICON } from "./Cost";
import { UnitCard } from "./UnitCard";

const ERAS: Era[] = [...MAIN_ERAS, "fantastical"];

export function ResearchScreen({ session, onClose }: { session: GameSession; onClose(): void }) {
  const { state } = session;
  const me = session.viewer;
  const faction = state.factions[me]!;
  const perTurn = factionIncome(state, me).knowledge;
  const canAct = session.isHumanTurn && state.activeFaction === me;
  const [focus, setFocus] = useState<{ type: MilitaryType; era: Era }>({ type: "infantry", era: "ancient" });

  const focusCell = researchCell(state, me, focus.type, focus.era);
  const command = { kind: "research", type: focus.type, era: focus.era } as const;
  const problem = canAct ? session.check(command) : "Wait for your turn";
  const turnsAway = perTurn > 0 ? Math.ceil((focusCell.cost - faction.resources.knowledge) / perTurn) : Infinity;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel research" onClick={(e) => e.stopPropagation()}>
        <header className="research-head">
          <h2>Research</h2>
          <div className="resource knowledge">
            <span className="icon">{RESOURCE_ICON.knowledge}</span>
            <strong>{faction.resources.knowledge}</strong>
            <span className="delta">+{perTurn}/turn</span>
          </div>
          <div className="spacer" />
          <button className="ghost icon-button" onClick={onClose} title="Close (Esc)">
            ×
          </button>
        </header>
        <p className="muted small">
          Each military type advances through the eras on its own. Fantastical is a side branch that opens after Medieval and costs Mana to recruit.
        </p>

        <div className="research-body">
          <table className="research-grid">
            <thead>
              <tr>
                <th />
                {ERAS.map((era) => (
                  <th key={era} className={era === "fantastical" ? "branch" : ""}>
                    {ERA_LABEL[era]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MILITARY_TYPES.map((type) => (
                <tr key={type}>
                  <th>{TYPE_LABEL[type]}</th>
                  {ERAS.map((era) => {
                    const cell = researchCell(state, me, type, era);
                    const affordable = cell.status === "available" && cell.cost <= faction.resources.knowledge;
                    const focused = focus.type === type && focus.era === era;
                    return (
                      <td key={era} className={era === "fantastical" ? "branch" : ""}>
                        <button
                          className={`cell ${cell.status} ${affordable ? "affordable" : ""} ${focused ? "focused" : ""}`}
                          onClick={() => setFocus({ type, era })}
                        >
                          <span className="cell-name">{unitFor(type, era).name}</span>
                          <span className="cell-status">
                            {cell.status === "researched" ? "✓ Known" : `${RESOURCE_ICON.knowledge} ${cell.cost}`}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <aside className="research-detail">
            <UnitCard type={focus.type} era={focus.era} />
            {focusCell.status === "researched" ? (
              <p className="good small">Researched. Recruit it at any Barracks.</p>
            ) : focusCell.status === "locked" ? (
              <p className="muted small">Research {focusCell.requires} first.</p>
            ) : (
              <>
                <button className="primary" disabled={problem !== null} onClick={() => session.dispatch(command)}>
                  Research for {RESOURCE_ICON.knowledge} {focusCell.cost}
                </button>
                {problem && (
                  <p className="muted small">
                    {problem}
                    {problem === "Not enough knowledge" && Number.isFinite(turnsAway) && ` (about ${turnsAway} more turn${turnsAway === 1 ? "" : "s"})`}
                  </p>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
