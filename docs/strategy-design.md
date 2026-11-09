# Strategy Layer Design

A browser-based 3D sandbox war game: *Age of Conquest IV*-style turn-based
grand strategy on a province map, with every battle resolved as a
*Totally Accurate Battle Simulator*-style physics simulation the player watches.

Status: design draft. Nothing in this document is implemented yet.

---

## 1. Pillars

1. **Short sessions.** A campaign should take about as long as winning a game
   of *Age of Conquest IV* on Normal: roughly one hour.
2. **Mix of eras.** Each military type advances through eras independently, so
   armies end up as chaotic cross-era mixes (Futuristic snipers escorting
   Prehistoric wolf sleds).
3. **Battles are a show.** Players do not control battles. They build armies on
   the map and watch the physics simulation play out, or skip it.
4. **Simple to learn.** Few resources, few commands, readable outcomes.

## 2. Platform and Tech

| Concern | Choice |
|---|---|
| Hosting | GitHub Pages (static files only, no server) |
| Rendering | Three.js |
| Physics | Rapier (WASM, deterministic) |
| Language / build | TypeScript + Vite |
| UI | React overlay on top of the Three.js canvas |
| Saves | `localStorage` / IndexedDB, plus export/import as `.json` |
| Deployment | GitHub Actions builds and publishes to Pages on merge to `main` |

Constraints that follow from GitHub Pages:

- All game logic, including the opponent AI, runs client-side.
- Keep downloads small: low-poly models, compressed textures, and lazy-load
  battle assets only when a battle starts.

## 3. Architecture Principles

These exist so that local (hotseat) multiplayer can be added later without a
rewrite.

- **Single serializable game state.** Plain data, no logic in UI components.
- **Command pattern.** Every player action is a command (`MoveArmy`,
  `RecruitSquad`, `Research`, ...) validated and applied by one rules engine.
  Human players and the AI issue the same commands.
- **Faction controllers.** Each faction has `controller: "human" | "ai"`.
  Hotseat multiplayer is just multiple `human` slots plus a "pass the device"
  screen.
- **Seeded RNG.** Same seed + same commands = same result. Enables replays,
  debugging, and the battle "skip" feature.
- **Per-faction fog of war.** Each faction only sees what it should, which is
  required for hotseat play.

## 4. Game Setup

### 4.1 Scenarios

On starting a campaign, the player picks one of:

- **Preset fictional worlds** (hand-made).
- **Fantasy Earth** (a stylized, hand-made Earth map).
- **Random map** (procedurally generated).

All three produce the same scenario format (see section 12.1), so the rest of
the game does not care where a map came from.

### 4.2 Scale

- 30–60 provinces.
- 4–6 factions.
- Target length: about 1 hour.

### 4.3 Options

- Difficulty: Easy / Normal / Hard (affects AI weights and resource bonus only;
  the AI never ignores fog of war).
- Victory condition (section 10).
- Faction slots: human or AI (only one human for now).

## 5. Map

- Provinces form a graph. Each province has neighbors, terrain, base income,
  an owner, a garrison, and buildings.
- Terrain types: plains, forest, hills, mountains, desert, coast, wasteland.
  Terrain affects movement cost and determines the battle arena.
- Some provinces have a special resource (ley line for Mana, power site for
  Energy) to create contested territory.
- Each faction has one capital.
- Rendered as a stylized 3D tabletop board with army figurines standing on
  provinces.
- Sea zones and naval movement are out of scope for the first version.

## 6. Economy

| Resource | Source | Spent on |
|---|---|---|
| **Gold** | Province income | Recruiting, buildings, upkeep |
| **Knowledge** | Libraries / schools / labs | Researching eras |
| **Mana** | Ley-line provinces, shrines | Fantastical units |
| **Energy** | Power-site provinces, power plants | Modern and Futuristic units |

- Every squad has per-turn upkeep in Gold. Higher eras cost more upkeep.
- If a faction cannot pay upkeep, its weakest squads desert.

### 6.1 Buildings (one of each per province)

| Building | Effect |
|---|---|
| Farm / Market | +Gold |
| Library | +Knowledge |
| Shrine | +Mana (stronger on ley lines) |
| Power Plant | +Energy (requires Modern in any type) |
| Fort | Defender bonus: extra squads of garrison and better arena position |
| Barracks | Required to recruit in that province |

## 7. Military

### 7.1 Military types

Every army is made of five types:

**Infantry · Ranged · Cavalry · Artillery · Special**

### 7.2 Eras

Main line, in order:

**Prehistoric → Ancient → Medieval → Modern → Futuristic**

Plus **Fantastical**, a side branch that can be researched per type after
Medieval. It costs Mana instead of Energy and is strong against high-tech
units (magic ignores armor) but fragile against massed fire.

### 7.3 Research

- Each military type advances through eras **independently**. A faction could
  have Futuristic Ranged and Prehistoric Cavalry.
- The research tree is a grid: 5 types × 6 eras.
- Each step costs Knowledge. Costs scale with era.
- All factions start in Prehistoric for every type.

### 7.4 Unit roster

| Type | Prehistoric | Ancient | Medieval | Modern | Futuristic | Fantastical |
|---|---|---|---|---|---|---|
| Infantry | Clubman | Hoplite | Knight-at-arms | Rifleman | Exo-trooper | Orc warband |
| Ranged | Slinger | Archer | Longbowman | Sniper | Laser gunner | Elf archer |
| Cavalry | Wolf Sled | Chariot | Heavy horse | Tank | Hover bike | Griffin rider |
| Artillery | Tree | Ballista | Trebuchet | Howitzer | Railgun | Fireball tower |
| Special | Giant Sloth | War elephant | Siege ram | Drone | Mech | Dragon |

Notes:

- **Tree (Prehistoric Artillery):** a caveman climbs to the top of a tree and
  throws large rocks. The tree is stationary once placed; the caveman can be
  knocked off.
- Ancient Ranged is **Archer** because Slinger moved to Prehistoric.

### 7.4.1 Counters and armor

Damage between two units is multiplied by a type counter and reduced by the
defender's armor. Squads prefer to target types they counter, and the enemy
front line (Infantry, Special) draws extra attention.

| Attacker | Bonus damage vs |
|---|---|
| Infantry | Cavalry ×1.6 |
| Ranged | Infantry ×1.35, Special ×1.25 |
| Cavalry | Ranged ×1.7, Artillery ×1.7 |
| Artillery | Infantry ×1.5, Special ×1.5 |
| Special | Infantry ×1.3, Cavalry ×1.3 |

| Era | Armor |
|---|---|
| Prehistoric | 0% |
| Ancient | 10% |
| Medieval | 20% |
| Modern | 25% |
| Futuristic | 40% |
| Fantastical | 5% |

- Fantastical weapons are magic: they ignore armor and deal 60% more damage,
  but Fantastical units have 10% less health. At equal squad counts they beat
  Modern and lose to Futuristic.
- At equal gold, base stats give every type roughly the same health and damage
  per gold, so the counters decide the fight.
- In auto-resolved battles each side also rolls a luck factor (±15%), and the
  defender gets +10%. An even mirror match goes to the attacker about a quarter
  of the time.

### 7.5 Squads and armies

- Armies are written as a composition, e.g. `3 inf / 2 ran / 5 cav / 1 art / 0 spe`.
- Each point is one **squad**. Squad size in battle depends on type:

| Type | Soldiers per squad |
|---|---|
| Infantry | 5 |
| Ranged | 4 |
| Cavalry | 3 |
| Artillery | 1 |
| Special | 1 |

- A squad is recruited at the best era its faction has unlocked for that type.
  Existing squads can be upgraded later for a Gold cost.
- Each squad tracks its era and its health (soldiers remaining).
- Maximum army size: 15 squads.
- Recruiting is one click per type in the province panel.

These squad sizes keep a full 15-squad vs 15-squad battle under the ~150–200
soldier performance budget.

## 8. Turn Structure

Factions take turns one after another. Each faction's turn:

1. **Income and upkeep.** Collect resources, pay upkeep, handle desertion.
2. **Commands.** Recruit, research, build, move armies, diplomacy.
3. **Battles.** Moving into a province with an enemy army or garrison starts a
   battle (section 9).
4. **Results.** Casualties are applied to squads; provinces may change owner.
5. **End of turn.** Check victory, update fog of war, next faction.

### 8.1 Movement

- Each army has movement points per turn (default 2).
- Terrain cost: plains 1, forest/hills/desert 2, mountains 3.
- Entering an enemy province ends movement.
- Armies can merge and split in the same province, up to the 15-squad cap.

## 9. Battles

### 9.1 Observer-only

The player never controls a battle. They choose to **Watch** or **Skip**.

- **Watch:** free camera, speed controls (0.5× / 1× / 2× / 4×), slow motion,
  and "follow unit".
- **Skip:** the same simulation runs headless (no rendering) and shows the
  result. Because Rapier is deterministic and the RNG is seeded, Watch and Skip
  give identical results.
- Battles between two AI factions always run headless.

There is no separate auto-resolve formula: the physics simulation is the only
way battles are resolved, so there is only one system to balance.

### 9.2 Deployment

Formations are generated automatically from composition:

- Infantry at the front, Ranged behind, Cavalry on the flanks, Artillery at
  the rear, Special in the center.
- The defender's Fort gives them a better position.

### 9.3 Arena

The province's terrain picks the arena (trees in forests, slopes in hills,
etc.).

### 9.4 Ending a battle

- A battle ends when one side is wiped out, routs, or a time limit passes. On
  timeout the defender holds the province.
- Surviving soldiers are mapped back onto squads; empty squads are removed.

### 9.5 Performance budget

- About 150–200 soldiers per battle.
- Simplified physics for units far from the camera.

## 10. Victory Conditions

Chosen at setup:

- **Domination:** control a set percentage of all provinces (default 70%).
- **Capital capture:** hold every enemy capital.
- **Score:** highest score after a fixed number of turns.

## 11. Diplomacy

Kept at *Age of Conquest* level on purpose.

- Relations: **War**, **Peace**, **Alliance**.
- Peace lasts at least 10 turns before war can be declared again.
- Allies share vision and can move through each other's territory.
- The AI accepts or rejects proposals based on relative strength, shared
  threats, and trust. Breaking a treaty lowers trust with everyone.
- Out of scope: characters, marriages, events, trade deals.

## 12. Data Schemas (draft)

### 12.1 Scenario

```ts
interface Scenario {
  id: string;
  name: string;
  kind: "fictional" | "fantasy-earth" | "random";
  provinces: Province[];
  factions: FactionStart[];
}

interface Province {
  id: string;
  name: string;
  terrain: "plains" | "forest" | "hills" | "mountains" | "desert" | "coast" | "wasteland";
  neighbors: string[];
  baseIncome: number;
  special?: "ley-line" | "power-site";
  position: { x: number; y: number }; // board placement
}

interface FactionStart {
  id: string;
  name: string;
  color: string;
  capital: string; // province id
}
```

### 12.2 Game state

```ts
type MilitaryType = "infantry" | "ranged" | "cavalry" | "artillery" | "special";
type Era = "prehistoric" | "ancient" | "medieval" | "modern" | "futuristic" | "fantastical";

interface GameState {
  seed: number;
  turn: number;
  activeFaction: string;
  factions: Record<string, FactionState>;
  provinces: Record<string, ProvinceState>;
  armies: Record<string, Army>;
  relations: Record<string, Relation>; // key: "factionA|factionB"
}

interface FactionState {
  id: string;
  controller: "human" | "ai";
  aiPersonality?: "aggressive" | "builder" | "opportunist";
  resources: { gold: number; knowledge: number; mana: number; energy: number };
  research: Record<MilitaryType, Era[]>; // unlocked eras per type
  alive: boolean;
}

interface ProvinceState {
  owner: string | null;
  buildings: Array<"market" | "library" | "shrine" | "power-plant" | "fort" | "barracks">;
}

interface Army {
  id: string;
  owner: string;
  location: string; // province id
  movementLeft: number;
  squads: Squad[]; // max 15
}

interface Squad {
  type: MilitaryType;
  era: Era;
  soldiers: number; // remaining; full size depends on type
}

interface Relation {
  status: "war" | "peace" | "alliance";
  sinceTurn: number;
  trust: number;
}
```

### 12.3 Unit definition

```ts
interface UnitDef {
  id: string;           // e.g. "prehistoric-artillery-tree"
  name: string;         // "Tree"
  type: MilitaryType;
  era: Era;
  cost: { gold: number; mana?: number; energy?: number };
  upkeep: number;
  health: number;
  mass: number;
  speed: number;
  weapon: {
    kind: "melee" | "projectile" | "beam" | "area";
    damage: number;
    range: number;
    cooldown: number;
  };
}
```

### 12.4 Commands

```ts
type Command =
  | { kind: "recruit"; province: string; type: MilitaryType }
  | { kind: "research"; type: MilitaryType; era: Era }
  | { kind: "build"; province: string; building: ProvinceState["buildings"][number] }
  | { kind: "move"; army: string; to: string }
  | { kind: "split"; army: string; squads: number[] }
  | { kind: "merge"; armies: string[] }
  | { kind: "upgrade-squad"; army: string; squad: number }
  | { kind: "diplomacy"; target: string; action: "propose-peace" | "propose-alliance" | "declare-war" }
  | { kind: "end-turn" };
```

## 13. Opponent AI

Utility scoring, not machine learning:

- Each turn, score candidate goals: attack weak neighbor, defend threatened
  border, take a rich or special province, research, build economy.
- Personalities weight those goals differently (aggressive, builder,
  opportunist).
- Difficulty changes weights and gives a resource bonus; it never grants
  vision through fog of war.

## 14. Build Order

1. **Rules engine.** Game state, commands, seeded RNG, unit tests. No graphics.
2. **Map view.** Three.js board, province selection, army figurines.
3. **Economy and recruitment.** Playable loop with a temporary placeholder
   battle resolver (removed in step 6).
4. **Research grid and unit roster.** Start with Prehistoric and Ancient for
   all five types.
5. **Opponent AI and victory conditions.**
6. **Physics battles.** Rapier + ragdolls, auto-deployment, Watch/Skip.
7. **Diplomacy, saves, polish, GitHub Pages deployment.**

### 14.1 Rules decided while building step 1

- Each faction starts with its capital, a Barracks there, 30 Gold, and an army
  of 2 Prehistoric Infantry + 1 Prehistoric Ranged. All factions start at war.
- Provinces with no owner are neutral; walking into one captures it.
- A province with no army is defended by a garrison of infantry at the owner's
  best Infantry era: 2 squads in a capital, 3 with a Fort (both stack).
- An army with full movement can always make one move, so 3-cost mountains
  are reachable with 2 movement points.
- Recruited squads join an army already in the province if it has room;
  otherwise they form a new army that cannot move until next turn.
- A defender that loses a battle retreats to a neighboring friendly province;
  with nowhere to go, it is destroyed.
- A faction with no provinces is eliminated and its armies disband.
- Proposals are answered on the target's turn and expire when the proposer's
  next turn begins.

## 15. Future (not now)

- **Local hotseat multiplayer.** Supported by the architecture in section 3.
- **Sandbox Battle mode.** Skip the campaign entirely: pick two armies of any
  types and eras and jump straight into a simulated battle. Focuses purely on
  the TABS side.
- Naval movement and sea zones.
- Generals with traits.
- Sieges.
- Mod support (custom units and scenarios as JSON).
