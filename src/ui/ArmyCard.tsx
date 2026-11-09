import { useState } from "react";
import { SQUAD_SIZE, armiesAt, bestMainEra, rules, unitFor, upgradeCost, type Army, type Command } from "../engine";
import { armyBreakdown, compositionLabel } from "../game/describe";
import type { GameSession } from "../game/session";
import { Cost } from "./Cost";

interface Props {
  session: GameSession;
  army: Army;
  selected: boolean;
}

export function ArmyCard({ session, army, selected }: Props) {
  const { state } = session;
  const owner = state.factions[army.owner]!;
  const mine = army.owner === state.activeFaction && session.isHumanTurn;

  return (
    <div className={`army-card ${selected ? "selected" : ""}`}>
      <button className="army-summary" onClick={() => session.selectArmy(army.id)}>
        <div className="army-head">
          <span className="swatch" style={{ background: owner.color }} />
          <strong>{army.squads.length} squads</strong>
          {mine && (
            <span className="moves">
              Moves {army.movementLeft}/{rules.ARMY_MOVEMENT}
            </span>
          )}
        </div>
        <div className="composition">{compositionLabel(army.squads)}</div>
        {!(selected && mine) && (
          <ul className="units">
            {armyBreakdown(army).map((u) => (
              <li key={u.name}>
                <span>{u.name}</span>
                <span className="muted">
                  ×{u.squads} ({u.soldiers})
                </span>
              </li>
            ))}
          </ul>
        )}
      </button>
      {selected && mine && <ArmyManager key={`${army.id}:${army.squads.length}`} session={session} army={army} />}
    </div>
  );
}

function ArmyManager({ session, army }: { session: GameSession; army: Army }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const { state } = session;
  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const squads = [...picked];
  const split: Command = { kind: "split", army: army.id, squads };
  const disband: Command = { kind: "disband", army: army.id, squads };
  const others = armiesAt(state, army.location).filter((a) => a.owner === army.owner && a.id !== army.id);
  const merge: Command = { kind: "merge", armies: [army.id, ...others.map((a) => a.id)] };
  const splitProblem = squads.length ? session.check(split) : "Pick squads first";
  const disbandProblem = squads.length ? session.check(disband) : "Pick squads first";
  const mergeProblem = others.length ? session.check(merge) : null;

  return (
    <div className="army-manager">
      <ul className="squads">
        {army.squads.map((squad, i) => {
          const unit = unitFor(squad.type, squad.era);
          const full = SQUAD_SIZE[squad.type];
          const upgrade = { kind: "upgrade-squad", army: army.id, squad: i } as const;
          const canUpgrade = session.check(upgrade) === null;
          const target = bestMainEra(state, army.owner, squad.type);
          return (
            <li key={i} className={picked.has(i) ? "picked" : ""}>
              <label>
                <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} />
                <span className="squad-name">{unit.name}</span>
              </label>
              <span className="health" title={`${squad.soldiers}/${full} soldiers`}>
                <span style={{ width: `${(squad.soldiers / full) * 100}%` }} />
              </span>
              {canUpgrade && (
                <button className="small" title={`Upgrade to ${unitFor(squad.type, target).name} and refill`} onClick={() => session.dispatch(upgrade)}>
                  ↑ <Cost cost={upgradeCost(squad, target)} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="actions">
        <button className="small" disabled={splitProblem !== null} title={splitProblem ?? "Move the picked squads into a new army"} onClick={() => session.dispatch(split)}>
          Split off {squads.length || ""}
        </button>
        <button className="small danger" disabled={disbandProblem !== null} title={disbandProblem ?? "Remove the picked squads to save upkeep"} onClick={() => session.dispatch(disband)}>
          Disband {squads.length || ""}
        </button>
        {others.length > 0 && (
          <button className="small" disabled={mergeProblem !== null} title={mergeProblem ?? "Combine all your armies in this province"} onClick={() => session.dispatch(merge)}>
            Merge {others.length + 1} armies
          </button>
        )}
      </div>
    </div>
  );
}
