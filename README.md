# 3D-1

A browser 3D sandbox war game: *Age of Conquest IV*-style turn-based strategy
with *Totally Accurate Battle Simulator*-style physics battles. See
[`docs/strategy-design.md`](docs/strategy-design.md) for the full design.

## Status

Step 1 of the build order is done: the rules engine (no graphics yet).

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests and full-game simulations
npm run typecheck
npm run build      # static build in dist/, ready for GitHub Pages
```

## Layout

```
src/engine/          Rules engine (pure TypeScript, no DOM)
  types.ts           Game state, commands, events
  setup.ts           Scenario validation and new-game creation
  commands.ts        applyCommand(): the only way to change game state
  turn.ts            Income, upkeep, desertion, eliminations, victory
  battle.ts          Battle setup, result write-back, placeholder resolver
  mapgen.ts          Seeded random map generator
  queries.ts         Read-only helpers (income, fog of war, score, ...)
  data/              Unit roster and rule constants
```

Every action goes through `applyCommand(state, command)`, which returns a new
state and a list of events without mutating the input. Combined with the seeded
RNG stored in the state, the same seed and commands always produce the same game.
