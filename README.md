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
- Step 7, diplomacy, saves, and polish: done. A diplomacy screen for peace,
  alliances, and war. The computer proposes treaties to you. Games autosave in
  the browser, and you can keep manual saves or export and import a `.json`
  file. The menu offers two preset maps besides the random island: Fantasy
  Earth and The Shattered Crown. Settings cover sound, graphics, and whether
  battles ask, always play, or always skip.

## Controls

| Action | Input |
|---|---|
| Select a province or army | Left click |
| Move or attack with the selected army | Left click a highlighted province (green = move, amber = capture, red = attack) |
| Pan | Left drag |
| Rotate | Right drag |
| Zoom | Scroll |
| Research | R |
| Diplomacy | D |
| How to play | H or ? |
| Deselect, or open the game menu | Esc |
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
The site is a relative build, so it works from a project subpath such as
`https://<user>.github.io/3D-1/`.

Deployment waits on two things this repository does not have yet:

- The pull-request stack has to be merged into `main`. The workflow only runs
  on that branch.
- In the repository settings, set **Pages → Source** to **GitHub Actions**.
  Pages for a private repository also needs GitHub Pro, Team, or Enterprise.

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
src/audio/           Synthesized UI and battle sounds
src/engine/scenarios/  Preset maps: Fantasy Earth and The Shattered Crown
src/game/            Session, diplomacy view, saves, and settings
src/render/          Three.js board, terrain props, army figurines, MapView
src/ui/              React overlay: title, map, diplomacy, research, menu
```

Every action goes through `applyCommand(state, command)`, which returns a new
state and a list of events without mutating the input. Combined with the seeded
RNG stored in the state, the same seed and commands always produce the same game.
