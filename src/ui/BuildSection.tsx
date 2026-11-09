import { BUILDINGS, rules } from "../engine";
import { BUILDING_INFO } from "../game/economy";
import type { GameSession } from "../game/session";
import { Cost } from "./Cost";

export function BuildSection({ session, province }: { session: GameSession; province: string }) {
  const built = session.state.provinces[province]!.buildings;
  const available = BUILDINGS.filter((b) => !built.includes(b));
  if (available.length === 0) return null;

  return (
    <section>
      <h3>Build</h3>
      <div className="option-list">
        {available.map((building) => {
          const info = BUILDING_INFO[building];
          const command = { kind: "build", province, building } as const;
          const problem = session.check(command);
          return (
            <button key={building} className="option" disabled={problem !== null} title={problem ?? `Build ${info.name}`} onClick={() => session.dispatch(command)}>
              <span className="option-main">
                <strong>{info.name}</strong>
                <span className="muted small">{problem && problem !== "Not enough gold" ? problem : info.effect}</span>
              </span>
              <Cost cost={rules.BUILDING_COST[building]} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
