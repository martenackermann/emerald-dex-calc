// A static demo team so the Team page and Calculator are usable without a save
// (e.g. when you can't produce a savegame yet). Built from real ROM-hack data.

import type { GameData } from "@/lib/pokemon/data";
import type { DecodedMon, ParsedSave, Stats6 } from "@/lib/save";

interface DemoSpec {
  name: string;
  moves: string[];
  abilitySlot: number;
  nature: string;
  item?: string;
  level: number;
  evs?: Partial<Stats6>;
}

const DEMO: DemoSpec[] = [
  { name: "Venusaur", moves: ["Giga Drain", "Sludge Bomb", "Leech Seed", "Sleep Powder"], abilitySlot: 0, nature: "Bold", item: "Black Sludge", level: 50, evs: { hp: 252, def: 252 } },
  { name: "Charizard", moves: ["Flamethrower", "Air Slash", "Dragon Pulse", "Roost"], abilitySlot: 0, nature: "Timid", item: "Charcoal", level: 50, evs: { spa: 252, spe: 252 } },
  { name: "Blastoise", moves: ["Surf", "Ice Beam", "Flash Cannon", "Rapid Spin"], abilitySlot: 0, nature: "Modest", item: "Leftovers", level: 50, evs: { spa: 252, hp: 252 } },
  { name: "Gardevoir", moves: ["Moonblast", "Psychic", "Shadow Ball", "Calm Mind"], abilitySlot: 0, nature: "Modest", item: "Choice Specs", level: 50, evs: { spa: 252, spe: 252 } },
  { name: "Dragonite", moves: ["Dragon Claw", "Earthquake", "Fire Punch", "Roost"], abilitySlot: 0, nature: "Adamant", item: "Lum Berry", level: 50, evs: { atk: 252, hp: 252 } },
  { name: "Garchomp", moves: ["Earthquake", "Dragon Claw", "Stone Edge", "Swords Dance"], abilitySlot: 0, nature: "Jolly", item: "Life Orb", level: 50, evs: { atk: 252, spe: 252 } },
];

function fullEvs(p?: Partial<Stats6>): Stats6 {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...p };
}

export function buildDemoSave(data: GameData): ParsedSave {
  const natureByName = new Map(data.natures.map((n) => [n.name.toLowerCase(), n.id]));
  const itemByName = new Map([...data.itemById.values()].map((i) => [i.name.toLowerCase(), i.id]));
  const moveByName = new Map([...data.moveById.values()].map((m) => [m.name.toLowerCase(), m.id]));

  const party: DecodedMon[] = [];
  for (const spec of DEMO) {
    const species = data.species.find((s) => s.name === spec.name);
    if (!species) continue;
    let moves = spec.moves.map((mn) => moveByName.get(mn.toLowerCase())).filter((x): x is number => x != null);
    if (moves.length === 0) moves = species.learnset.slice(0, 4);
    moves = moves.slice(0, 4);

    party.push({
      personality: 0,
      otId: 0,
      species: species.id,
      heldItem: spec.item ? itemByName.get(spec.item.toLowerCase()) ?? 0 : 0,
      moves: [...moves, 0, 0, 0, 0].slice(0, 4),
      pp: [10, 10, 10, 10],
      nature: natureByName.get(spec.nature.toLowerCase()) ?? 0,
      hiddenNature: natureByName.get(spec.nature.toLowerCase()) ?? 0,
      abilityNum: spec.abilitySlot,
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      evs: fullEvs(spec.evs),
      experience: 0,
      friendship: 160,
      pokeball: 4,
      isEgg: false,
      isShiny: false,
      nickname: "",
      otName: "DEMO",
      checksumValid: true,
      level: spec.level,
    });
  }

  return {
    trainer: { name: "Demo", gender: 0, trainerId: 0, publicId: 0 },
    party,
    boxes: Array.from({ length: 14 }, () => []),
    currentBox: 0,
    meta: { validSectors: 0, activeCounter: 0 },
  };
}
