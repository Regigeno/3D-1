import type { PresetDefinition, PresetProvince } from "./preset";

type Row = [id: string, name: string, x: number, y: number, terrain: PresetProvince["terrain"], income: number, special?: PresetProvince["special"]];

// A stylized Earth. The continents are joined by land bridges (Greenland and
// Thule in the north, Gibraltar, Sinai, the Red Sea narrows, and the Spice
// Isles) because there is no naval movement.
const ROWS: Row[] = [
  // North America
  ["alaska", "Alaska", 9, 11, "wasteland", 1],
  ["yukon", "Yukon", 17, 8, "forest", 1],
  ["hudsonia", "Hudsonia", 26, 9, "forest", 1],
  ["baffin", "Baffinland", 35, 6, "wasteland", 1],
  ["greenland", "Greenland", 44, 6, "wasteland", 1, "ley-line"],
  ["thule", "Thule", 52, 9, "hills", 1],
  ["cascadia", "Cascadia", 11, 19, "forest", 2],
  ["plains", "Great Plains", 20, 18, "plains", 2],
  ["laurentia", "Laurentia", 30, 17, "forest", 3],
  ["rockies", "Rocky Peaks", 14, 27, "mountains", 1, "power-site"],
  ["mississippi", "Mississippi", 24, 26, "plains", 3],
  ["atlantica", "New Atlantica", 34, 25, "coast", 3],
  ["aztlan", "Aztlan", 17, 35, "desert", 2],
  ["floridia", "Floridia", 29, 33, "coast", 2],
  ["mayapan", "Mayapan", 24, 41, "forest", 2],
  // South America
  ["eldorado", "Eldorado", 31, 47, "forest", 2],
  ["amazonia", "Amazonia", 40, 50, "forest", 2, "ley-line"],
  ["tawantin", "Tawantin", 30, 55, "hills", 3],
  ["bahia", "Bahia", 47, 56, "coast", 2],
  ["pampas", "Pampas", 36, 61, "plains", 2],
  ["patagonia", "Patagonia", 32, 66, "wasteland", 1],
  // Europe
  ["albion", "Albion", 59, 15, "coast", 3],
  ["scandia", "Scandia", 67, 7, "forest", 2],
  ["gaul", "Gaul", 64, 22, "plains", 3],
  ["iberia", "Iberia", 56, 28, "hills", 2],
  ["germania", "Germania", 72, 16, "forest", 3],
  ["italia", "Italia", 71, 27, "hills", 3],
  ["rus", "Rus", 80, 9, "forest", 2],
  ["dacia", "Dacia", 80, 20, "hills", 2],
  // Africa
  ["maghreb", "Maghreb", 58, 37, "desert", 2],
  ["sahara", "Sahara", 67, 42, "desert", 1, "power-site"],
  ["kemet", "Kemet", 78, 40, "desert", 3],
  ["mali", "Mali", 59, 46, "plains", 2],
  ["congo", "Congo", 69, 52, "forest", 2],
  ["abyssinia", "Abyssinia", 84, 47, "mountains", 2, "ley-line"],
  ["zanj", "Zanj", 80, 56, "plains", 2],
  ["zululand", "Zululand", 72, 62, "plains", 2],
  // Asia
  ["anatolia", "Anatolia", 87, 24, "hills", 2],
  ["canaan", "Canaan", 85, 32, "desert", 2],
  ["arabia", "Arabia", 91, 39, "desert", 1, "power-site"],
  ["babylon", "Babylon", 94, 29, "plains", 3],
  ["khazaria", "Khazaria", 89, 15, "plains", 2],
  ["siberia", "Siberia", 98, 11, "forest", 1],
  ["turan", "Turan", 101, 20, "desert", 2],
  ["persia", "Persia", 103, 31, "hills", 2],
  ["hindustan", "Hindustan", 106, 41, "plains", 4],
  ["himalaya", "Himalaya", 112, 31, "mountains", 1, "ley-line"],
  ["mongolia", "Mongolia", 111, 19, "plains", 1],
  ["taiga", "Far Taiga", 112, 8, "wasteland", 1],
  ["manchuria", "Manchuria", 122, 13, "forest", 2],
  ["cathay", "Cathay", 120, 26, "plains", 4],
  ["nippon", "Nippon", 129, 20, "hills", 3],
  ["siam", "Siam", 117, 39, "forest", 2],
  ["spice", "Spice Isles", 121, 46.5, "forest", 2, "power-site"],
  ["outback", "Outback", 121, 55.5, "desert", 1],
  ["australis", "Terra Australis", 129.5, 59, "coast", 2],
];

export const FANTASY_EARTH: PresetDefinition = {
  id: "fantasy-earth",
  name: "Fantasy Earth",
  kind: "fantasy-earth",
  description: "Six empires on a stylized Earth, joined by land bridges. 56 provinces.",
  width: 138,
  height: 72,
  coastDistance: 6.2,
  provinces: ROWS.map(([id, name, x, y, terrain, income, special]) => ({ id, name, x, y, terrain, income, ...(special ? { special } : {}) })),
  factions: [
    { id: "blue", name: "Atlantean Republic", color: "#3f6fd9", capital: "laurentia" },
    { id: "purple", name: "Holy Rhenish Empire", color: "#8a4fd1", capital: "germania" },
    { id: "gold", name: "Pharaonic Throne", color: "#d9a93f", capital: "kemet" },
    { id: "teal", name: "Raj of Seven Rivers", color: "#2fa8a8", capital: "hindustan" },
    { id: "red", name: "Empire of the Rising Sun", color: "#d94040", capital: "nippon" },
    { id: "green", name: "Sun Kingdom of Tawantin", color: "#3fa34d", capital: "tawantin" },
  ],
};
