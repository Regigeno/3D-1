# Petty Empires

A browser 3D sandbox war game: *Age of Conquest IV*-style turn-based strategy
with *Totally Accurate Battle Simulator*-style physics battles. See
[`docs/strategy-design.md`](docs/strategy-design.md) for the full design.

## Status

- Step 1, rules engine: done.
- Step 2, 3D map view: done. Random island maps, province selection, army
  figurines, moving and capturing, and fog of war.
- Step 3, economy and recruitment: done. Recruit and build from the province
  panel, split/merge/disband/upgrade armies, a treasury breakdown (click the
  resource bar), and a battle report after every fight.
- Step 4, research and unit roster: done. A research screen (press R) with the
  5 types x 6 eras grid and unit cards, and type counters, armor, and magic in
  the unit data that battles use.
- Step 5, opponent AI and victory conditions: done. Computer rivals with three
  personalities (aggressive, builder, opportunist) that expand, research, build,
  recruit counters, attack, and make and break treaties, all without seeing
  through fog of war. Pick Easy/Normal/Hard and a victory condition
  (domination, capitals, or score after a turn limit) in the menu.
- Step 6, physics battles: done. Every battle is a Rapier physics simulation
  with automatic formations, terrain arenas, forts, projectiles, explosions,
  and ragdoll deaths. When you fight, choose Watch (free camera, 0.25×–4×
  speed, follow a soldier) or Skip (same simulation, same result).

## Controls

| Action | Input |
|---|---|
| Select a province or army | Left click |
| Move or attack with the selected army | Left click a highlighted province (green = move, amber = capture, red = attack) |
| Pan | Left drag |
| Rotate | Right drag |
| Zoom | Scroll |
| Research | R |
| Deselect | Esc |
| End turn | Enter |

In a battle:

| Action | Input |
|---|---|
| Watch / Skip (at the prompt) | W / S or Enter |
| Rotate / pan / zoom | Left drag / right drag / scroll |
| Pause | Space |
| Speed 0.25×, 0.5×, 1×, 2×, 4× | 1–5 |
| Follow a soldier | Click it, or F for a random one |
| Free camera | Esc |
| Skip to result | S |
| Continue after the battle | Enter |

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests and full-game simulations
npm run typecheck
npm run build      # static build in dist/
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/pages.yml`.
In the repository settings, set **Pages > Source** to **GitHub Actions** once.

## Layout

```
src/engine/          Rules engine (pure TypeScript, no DOM)
  types.ts           Game state, commands, events
  setup.ts           Scenario validation and new-game creation
  commands.ts        applyCommand(): the only way to change game state
  turn.ts            Income, upkeep, desertion, eliminations, victory
  battle.ts          Battle setup, result write-back, placeholder resolver
  mapgen.ts          Seeded random island generator (Voronoi provinces)
  geometry.ts        Voronoi cells and polygon helpers
  queries.ts         Read-only helpers (income, fog of war, score, ...)
  ai/                Opponent AI: fog-aware evaluation and the turn planner
  data/              Unit roster and rule constants
src/battle/          Physics battles (Rapier): arenas, deployment, simulation
  view/              Three.js battle view and unit models
src/game/            Session: current game, selection, event log, AI turns
src/render/          Three.js board, terrain props, army figurines, MapView
src/ui/              React overlay: menu, top bar, province panel, event log
```

Every action goes through `applyCommand(state, command)`, which returns a new
state and a list of events without mutating the input. Combined with the seeded
RNG stored in the state, the same seed and commands always produce the same game.
