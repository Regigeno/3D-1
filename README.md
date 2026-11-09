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

Battles currently resolve instantly with a placeholder (step 6 adds the physics
simulation), and computer factions pass their turns (step 5 adds the AI).

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
  data/              Unit roster and rule constants
src/game/            Session: current game, selection, event log, AI turns
src/render/          Three.js board, terrain props, army figurines, MapView
src/ui/              React overlay: menu, top bar, province panel, event log
```

Every action goes through `applyCommand(state, command)`, which returns a new
state and a list of events without mutating the input. Combined with the seeded
RNG stored in the state, the same seed and commands always produce the same game.
