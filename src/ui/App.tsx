import { useState } from "react";
import { GameSession, type NewGameSettings } from "../game/session";
import { GameScreen } from "./GameScreen";
import { NewGameMenu } from "./NewGameMenu";

export function App() {
  const [session, setSession] = useState<GameSession | null>(null);

  const start = (settings: NewGameSettings) => setSession(GameSession.newRandomGame(settings));

  if (!session) return <NewGameMenu onStart={start} />;
  return <GameScreen key={session.state.scenario.id + session.state.options.seed} session={session} onQuit={() => setSession(null)} />;
}
