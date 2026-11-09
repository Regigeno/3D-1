import type { ResourceKind } from "../engine";
import { ledger } from "../game/economy";
import type { GameSession } from "../game/session";
import { RESOURCE_ICON } from "./Cost";

const KINDS: ResourceKind[] = ["gold", "knowledge", "mana", "energy"];

function Amounts({ amount }: { amount: Partial<Record<ResourceKind, number>> }) {
  const parts = KINDS.filter((k) => (amount[k] ?? 0) !== 0);
  if (parts.length === 0) return <span className="muted">0</span>;
  return (
    <span className="cost">
      {parts.map((k) => (
        <span key={k} className={`resource ${k}`}>
          <span className="icon">{RESOURCE_ICON[k]}</span>
          {amount[k]! > 0 ? "+" : ""}
          {amount[k]}
        </span>
      ))}
    </span>
  );
}

export function TreasuryPanel({ session, onClose }: { session: GameSession; onClose(): void }) {
  const l = ledger(session.state, session.viewer);
  return (
    <div className="treasury panel">
      <header>
        <h3>Treasury, per turn</h3>
        <button className="ghost icon-button" onClick={onClose} title="Close">
          ×
        </button>
      </header>
      <table>
        <tbody>
          {l.income.map((line) => (
            <tr key={line.label}>
              <td>{line.label}</td>
              <td>
                <Amounts amount={line.amount} />
              </td>
            </tr>
          ))}
          {l.upkeep.map((line, i) => (
            <tr key={`u${i}`} className="upkeep">
              <td>{line.label}</td>
              <td>
                <Amounts amount={{ gold: -line.gold }} />
              </td>
            </tr>
          ))}
          <tr className="total">
            <td>Net</td>
            <td>
              <Amounts amount={l.net} />
            </td>
          </tr>
        </tbody>
      </table>
      {l.net.gold < 0 && <p className="warning small">You are losing gold. When it runs out, unpaid squads desert.</p>}
    </div>
  );
}
