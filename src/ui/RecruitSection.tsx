import { MAX_SQUADS_PER_ARMY, MILITARY_TYPES, SQUAD_SIZE, armiesAt, bestMainEra, hasEra, unitFor, type Era, type MilitaryType } from "../engine";
import { TYPE_LABEL } from "../game/describe";
import type { GameSession } from "../game/session";
import { Cost } from "./Cost";

export function RecruitSection({ session, province }: { session: GameSession; province: string }) {
  const { state } = session;
  const me = state.activeFaction;
  const options: Array<{ type: MilitaryType; era: Era }> = MILITARY_TYPES.flatMap((type) => {
    const list: Array<{ type: MilitaryType; era: Era }> = [{ type, era: bestMainEra(state, me, type) }];
    if (hasEra(state, me, type, "fantastical")) list.push({ type, era: "fantastical" });
    return list;
  });
  const joinable = armiesAt(state, province).find((a) => a.owner === me && a.squads.length < MAX_SQUADS_PER_ARMY);

  return (
    <section>
      <h3>Recruit</h3>
      <div className="option-list">
        {options.map(({ type, era }) => {
          const unit = unitFor(type, era);
          const command = { kind: "recruit", province, type, era } as const;
          const problem = session.check(command);
          return (
            <button key={unit.id} className="option" disabled={problem !== null} title={problem ?? `Recruit ${unit.name}`} onClick={() => session.dispatch(command)}>
              <span className="option-main">
                <strong>{unit.name}</strong>
                <span className="muted small">
                  {TYPE_LABEL[type]} · {SQUAD_SIZE[type]} per squad · upkeep {unit.upkeep}
                </span>
              </span>
              <Cost cost={unit.cost} />
            </button>
          );
        })}
      </div>
      <p className="muted small">
        {joinable
          ? `New squads join the army here (${joinable.squads.length}/${MAX_SQUADS_PER_ARMY}).`
          : "New squads form a new army, which can move next turn."}
      </p>
    </section>
  );
}
