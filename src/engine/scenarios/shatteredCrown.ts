import type { PresetDefinition, PresetProvince } from "./preset";

const CENTER = { x: 48, y: 38 };
const INNER = 17;
const OUTER = 26;
const ANGLES = 16;
/** The ring is broken at this angle: the Sundering, a strait nobody can cross. */
const SUNDERING = 4;

interface Sector {
  /** Inner provinces alternate between the first two; outer ones use the third. */
  terrain: [PresetProvince["terrain"], PresetProvince["terrain"], PresetProvince["terrain"]];
  names: string[];
}

// Four regions around the Crownsea, starting in the north and going clockwise.
const SECTORS: Sector[] = [
  { terrain: ["coast", "hills", "mountains"], names: ["Rimeguard", "Frosthold", "Icemere", "Skarn", "Wolfmark", "Hoarfell", "Stormcrag", "Glacierreach"] },
  { terrain: ["coast", "forest", "forest"], names: ["Mossgarde", "Wyldwood", "Elderglen", "Thornvale", "Fernhollow", "Briarholt", "Willowmere", "Ashgrove"] },
  { terrain: ["coast", "wasteland", "desert"], names: ["Saltpan", "Emberfall", "Mirage", "Cindermark", "Sunscar", "Dunesreach", "Ashveil", "Glasssands"] },
  { terrain: ["coast", "plains", "hills"], names: ["Brightwater", "Goldmeadow", "Stonebridge", "Ironford", "Oakshire", "Harrowfield", "Kingsbarrow", "Highmoor"] },
];

const CAPITALS: Record<number, { id: string; name: string; color: string; terrain: PresetProvince["terrain"] }> = {
  0: { id: "blue", name: "Frostcrown Jarldom", color: "#3f6fd9", terrain: "hills" },
  3: { id: "green", name: "Wyldwood Kindred", color: "#3fa34d", terrain: "forest" },
  7: { id: "gold", name: "Ember Sultanate", color: "#d9a93f", terrain: "desert" },
  10: { id: "red", name: "Iron Legion", color: "#d94040", terrain: "plains" },
  13: { id: "purple", name: "Violet Covenant", color: "#8a4fd1", terrain: "hills" },
};

/** A small, fixed wobble so the ring does not look machine-made. */
const wobble = (i: number, k: number) => Math.sin(i * 12.9898 + k * 78.233) * 1.1;

function ringProvinces(): PresetProvince[] {
  const out: PresetProvince[] = [];
  for (let i = 0; i < ANGLES; i++) {
    if (i === SUNDERING) continue;
    const sector = SECTORS[Math.floor(((i + 2) % ANGLES) / 4)]!;
    const slot = ((i + 2) % 4) * 2;
    for (const [ring, radius, offset] of [
      [0, INNER, 0],
      [1, OUTER, 0.5],
    ] as const) {
      const theta = ((i + offset) / ANGLES) * Math.PI * 2;
      const capital = ring === 1 ? CAPITALS[i] : undefined;
      const special = ring === 1 && !capital && i % 5 === 2 ? (sector === SECTORS[2] ? "power-site" : "ley-line") : undefined;
      out.push({
        id: `${ring ? "o" : "i"}${i}`,
        name: sector.names[slot + ring]!,
        x: Math.round((CENTER.x + radius * Math.sin(theta) + wobble(i, ring)) * 10) / 10,
        y: Math.round((CENTER.y - radius * Math.cos(theta) + wobble(i, ring + 2)) * 10) / 10,
        terrain: capital?.terrain ?? (ring === 1 ? sector.terrain[2] : sector.terrain[i % 2]),
        income: capital ? 3 : ring === 0 ? 3 : 2,
        ...(special ? { special } : {}),
      });
    }
  }
  return out;
}

export const SHATTERED_CROWN: PresetDefinition = {
  id: "shattered-crown",
  name: "The Shattered Crown",
  kind: "fictional",
  description: "Five realms on a broken ring around the Crownsea. Whoever holds the rich Crown Isle at its heart grows fast. 33 provinces.",
  width: 96,
  height: 76,
  coastDistance: 6,
  provinces: [
    ...ringProvinces(),
    { id: "crown", name: "Crown Isle", x: CENTER.x, y: CENTER.y, terrain: "plains", income: 5, special: "ley-line" },
    { id: "north-span", name: "Northspan", x: CENTER.x, y: CENTER.y - 8.5, terrain: "hills", income: 2 },
    { id: "south-span", name: "Southspan", x: CENTER.x, y: CENTER.y + 8.5, terrain: "hills", income: 2 },
  ],
  factions: Object.entries(CAPITALS).map(([i, c]) => ({ id: c.id, name: c.name, color: c.color, capital: `o${i}` })),
};
