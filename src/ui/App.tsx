import { lazy, Suspense, useEffect, useState } from "react";
import { loadRapier, type Rapier } from "../battle/rapier";
import { createPhysicsResolver } from "../battle/resolver";
import type { SaveData } from "../game/save";
import { GameSession, type NewGameSettings } from "../game/session";
import { NewGameMenu } from "./NewGameMenu";
import { useSoundSettings } from "./services";

const GameScreen = lazy(() => import("./GameScreen").then((m) => ({ default: m.GameScreen })));

const schedule = (fn: () => void) => window.setTimeout(fn, 0);

type Request = { kind: "new"; settings: NewGameSettings } | { kind: "load"; save: SaveData };

export function App() {
  useSoundSettings();
  const [session, setSession] = useState<GameSession | null>(null);
  const [rapier, setRapier] = useState<Rapier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<Request | null>(null);

  useEffect(() => {
    loadRapier().then(setRapier, (e: unknown) => setError(`Could not load the physics engine: ${e instanceof Error ? e.message : String(e)}`));
    // Fetch the map and battle code while the player is still on the menu.
    void import("./GameScreen");
  }, []);

  useEffect(() => {
    if (!request || !rapier) return;
    const options = { resolver: createPhysicsResolver(rapier), schedule };
    try {
      setSession(request.kind === "new" ? GameSession.newRandomGame(request.settings, options) : GameSession.fromSave(request.save, options));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setRequest(null);
  }, [request, rapier]);

  const loading = <div className="loading-screen">Loading…</div>;

  if (!session || !rapier) {
    return (
      <>
        <NewGameMenu onStart={(settings) => setRequest({ kind: "new", settings })} onLoad={(save) => setRequest({ kind: "load", save })} />
        {(request || error) && (
          <div className="overlay" onClick={() => setError(null)}>
            <div className="panel loading">{error ?? "Loading the physics engine…"}</div>
          </div>
        )}
      </>
    );
  }
  return (
    <Suspense fallback={loading}>
      <GameScreen key={session.state.scenario.id + session.state.options.seed} session={session} rapier={rapier} onQuit={() => setSession(null)} />
    </Suspense>
  );
}
