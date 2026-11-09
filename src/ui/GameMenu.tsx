import { useState } from "react";
import { saveFileName } from "../game/save";
import type { GameSession } from "../game/session";
import { downloadJson, saves } from "./services";

interface Props {
  session: GameSession;
  onResume(): void;
  onSettings(): void;
  onHelp(): void;
  onQuit(): void;
}

export function GameMenu({ session, onResume, onSettings, onHelp, onQuit }: Props) {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const canSave = session.settled;

  const save = () => {
    try {
      saves.write(session.toSave());
      setStatus({ ok: true, text: `Saved turn ${session.state.turn}. Load it from the title screen.` });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="overlay" onClick={onResume}>
      <div className="panel dialog game-menu" onClick={(e) => e.stopPropagation()}>
        <h2>Paused</h2>
        <p className="muted small">
          {session.state.scenario.name} · turn {session.state.turn}
        </p>
        <button className="primary" onClick={onResume} autoFocus>
          Resume
        </button>
        <button onClick={save} disabled={!canSave || !saves.available} title={canSave ? undefined : "Wait until the computer players finish their turns"}>
          Save game
        </button>
        <button onClick={() => downloadJson(saveFileName(session.toSave()), session.toSave())} disabled={!canSave}>
          Export save file
        </button>
        <button onClick={onSettings}>Settings</button>
        <button onClick={onHelp}>How to play</button>
        <button className="ghost" onClick={onQuit}>
          Quit to title
        </button>
        {status && <p className={`small ${status.ok ? "good" : "bad"}`}>{status.text}</p>}
        <p className="muted small">Your game is also saved automatically at the start of every turn you play.</p>
      </div>
    </div>
  );
}
