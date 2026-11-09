import { useEffect, useState } from "react";
import { createPhysicsResolver, loadRapier, type Rapier } from "../battle";
import { GameSession, type NewGameSettings } from "../game/session";
import { GameScreen } from "./GameScreen";
import { NewGameMenu } from "./NewGameMenu";

const schedule = (fn: () => void) => window.setTimeout(fn, 0);

export function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [rapier, setRapier] = useState<Rapier | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<NewGameSettings | null>(null);

  useEffect(() => {
    loadRapier().then(setRapier, (e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!waiting || !rapier) return;
    setSession(GameSession.newRandomGame(waiting, { resolver: createPhysicsResolver(rapier), schedule }));
    setWaiting(null);
  }, [waiting, rapier]);

  if (!session || !rapier) {
    return (
      <>
        <NewGameMenu onStart={setWaiting} />
        {waiting && (
          <div className="overlay">
            <div className="panel loading">{loadError ? `Could not load the physics engine: ${loadError}` : "Loading the physics engine…"}</div>
          </div>
        )}
      </>
    );
  }
  return (
    <GameScreen key={session.state.scenario.id + session.state.options.seed} session={session} rapier={rapier} onQuit={() => setSession(null)} />
  );
}
