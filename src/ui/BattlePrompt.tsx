import { scenarioProvince, type BattleSide, type PendingBattle } from "../engine";
import { TERRAIN_LABEL, TYPE_LABEL, factionName, provinceName, squadBreakdown } from "../game/describe";
import type { GameSession } from "../game/session";

function Side({ session, title, side }: { session: GameSession; title: string; side: BattleSide }) {
  const color = side.faction ? session.state.factions[side.faction]?.color : "#888";
  const total = side.squads.reduce((n, s) => n + s.soldiers, 0);
  return (
    <div className="battle-side">
      <div className="owner">
        <span className="swatch" style={{ background: color }} />
        <strong>{factionName(session.state, side.faction)}</strong>
        <span className="muted small">{title}</span>
      </div>
      <table>
        <tbody>
          {squadBreakdown(side.squads).map((g) => (
            <tr key={g.name}>
              <td>
                {g.name} <span className="muted small">{TYPE_LABEL[g.type]}</span>
              </td>
              <td className="num">{g.soldiers}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Soldiers</td>
            <td className="num">{total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function BattlePrompt({ session, battle, onWatch }: { session: GameSession; battle: PendingBattle; onWatch(): void }) {
  const terrain = scenarioProvince(session.state, battle.province).terrain;
  const mine = battle.attacker.faction === session.viewer ? "attacking" : "defending";
  return (
    <div className="overlay">
      <div className="panel battle-report battle-prompt">
        <h2>Battle of {provinceName(session.state, battle.province)}</h2>
        <p className="muted">
          You are {mine}. {TERRAIN_LABEL[terrain]}
          {battle.fortified && " · the defender holds a fort"}
        </p>
        <div className="battle-sides">
          <Side session={session} title="Attacker" side={battle.attacker} />
          <Side session={session} title="Defender" side={battle.defender} />
        </div>
        <div className="actions">
          <button className="primary" onClick={onWatch} autoFocus>
            Watch <kbd>W</kbd>
          </button>
          <button onClick={() => session.skipBattle()}>
            Skip <kbd>S</kbd>
          </button>
        </div>
        <p className="muted small">Both run the same simulation, so the outcome is identical either way.</p>
      </div>
    </div>
  );
}
