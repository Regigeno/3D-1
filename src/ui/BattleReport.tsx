import { unitFor, type Squad } from "../engine";
import { factionName, provinceName } from "../game/describe";
import type { BattleReport as Report, GameSession } from "../game/session";

interface Row {
  name: string;
  before: number;
  after: number;
}

function rows(squads: Squad[], survivors: number[]): Row[] {
  const byName = new Map<string, Row>();
  squads.forEach((s, i) => {
    const name = unitFor(s.type, s.era).name;
    const row = byName.get(name) ?? { name, before: 0, after: 0 };
    row.before += s.soldiers;
    row.after += survivors[i] ?? 0;
    byName.set(name, row);
  });
  return [...byName.values()];
}

function Side({ session, title, faction, list }: { session: GameSession; title: string; faction: string | null; list: Row[] }) {
  const color = faction ? session.state.factions[faction]?.color : "#888";
  const before = list.reduce((n, r) => n + r.before, 0);
  const after = list.reduce((n, r) => n + r.after, 0);
  return (
    <div className="battle-side">
      <div className="owner">
        <span className="swatch" style={{ background: color }} />
        <strong>{factionName(session.state, faction)}</strong>
        <span className="muted small">{title}</span>
      </div>
      <table>
        <tbody>
          {list.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="num">
                {r.after}/{r.before}
              </td>
            </tr>
          ))}
          <tr className="total">
            <td>Survivors</td>
            <td className="num">
              {after}/{before}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function BattleReport({ session, report }: { session: GameSession; report: Report }) {
  const { battle, result } = report;
  const winner = result.winner === "attacker" ? battle.attacker.faction : battle.defender.faction;
  const iWon = winner === session.viewer;
  return (
    <div className="overlay" onClick={() => session.dismissBattleReport()}>
      <div className="panel battle-report" onClick={(e) => e.stopPropagation()}>
        <h2>Battle of {provinceName(session.state, battle.province)}</h2>
        <p className={iWon ? "outcome win" : "outcome loss"}>
          {factionName(session.state, winner)} {result.winner === "attacker" ? "captured the province" : "held the province"}
        </p>
        <div className="battle-sides">
          <Side session={session} title="Attacker" faction={battle.attacker.faction} list={rows(battle.attacker.squads, result.attackerSurvivors)} />
          <Side session={session} title="Defender" faction={battle.defender.faction} list={rows(battle.defender.squads, result.defenderSurvivors)} />
        </div>
        <p className="muted small">Battles are auto-resolved for now. The 3D physics battle comes in a later build step.</p>
        <button className="primary" onClick={() => session.dismissBattleReport()} autoFocus>
          Continue
        </button>
      </div>
    </div>
  );
}
