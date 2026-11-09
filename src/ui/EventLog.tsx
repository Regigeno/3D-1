import type { GameSession } from "../game/session";

const VISIBLE = 7;

export function EventLog({ session }: { session: GameSession }) {
  const entries = session.log.slice(-VISIBLE);
  return (
    <div className="eventlog panel">
      {entries.map((entry) => {
        const color = entry.faction ? session.state.factions[entry.faction]?.color : undefined;
        return (
          <div key={entry.id} className="entry">
            <span className="swatch small" style={{ background: color ?? "#888" }} />
            {entry.text}
          </div>
        );
      })}
    </div>
  );
}
