// Damage engine (modern / Gen 8-9 mechanics, pokeemerald-expansion default).
// Data-driven from the extracted ROM-hack JSON so custom/randomized species,
// moves, abilities and items all work. Covers the modifiers that matter in
// practice: STAB (+Adaptability), full type chart (+Tinted Lens / Filter /
// Expert Belt), weather, terrain, crits, burn, screens, held items, common
// offensive/defensive abilities and type-immunity abilities.

import type { BaseStats, Move, Nature } from "@/lib/pokemon/data";

export type Stats6 = BaseStats; // { hp, atk, def, spa, spd, spe }
export type Status = "healthy" | "brn" | "psn" | "tox" | "par" | "slp" | "frz";
export type Weather = "none" | "sun" | "rain" | "sand" | "snow";
export type Terrain = "none" | "electric" | "grassy" | "psychic" | "misty";

export interface Field {
  weather: Weather;
  terrain: Terrain;
  reflect: boolean; // defender side
  lightScreen: boolean; // defender side
  auroraVeil: boolean; // defender side
  crit: boolean;
}

export const DEFAULT_FIELD: Field = {
  weather: "none",
  terrain: "none",
  reflect: false,
  lightScreen: false,
  auroraVeil: false,
  crit: false,
};

// ---- type chart (Gen 6+) ----------------------------------------------------
const CHART: Record<string, Record<string, number>> = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};

export function typeEffectiveness(moveType: string, defenderTypes: string[]): number {
  return defenderTypes.reduce((m, def) => m * (CHART[moveType]?.[def] ?? 1), 1);
}

export function effectivenessLabel(mult: number): string {
  if (mult === 0) return "No effect";
  if (mult >= 4) return "×4";
  if (mult > 1) return "Super effective";
  if (mult === 1) return "Neutral";
  if (mult <= 0.25) return "×¼";
  return "Not very effective";
}

export function boostMultiplier(stage: number): number {
  const s = Math.max(-6, Math.min(6, stage));
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

function natureMod(nature: Nature | undefined, stat: keyof Stats6): number {
  if (!nature || !nature.plus || !nature.minus) return 1;
  if (nature.plus === stat) return 1.1;
  if (nature.minus === stat) return 0.9;
  return 1;
}

export interface StatInput {
  ivs?: Partial<Stats6>;
  evs?: Partial<Stats6>;
  nature?: Nature;
  level: number;
}

/** Real stats (no in-battle boosts) from base stats + IV/EV/nature/level. */
export function computeStats(base: Stats6, input: StatInput): Stats6 {
  const iv = (k: keyof Stats6) => input.ivs?.[k] ?? 31;
  const ev = (k: keyof Stats6) => input.evs?.[k] ?? 0;
  const L = input.level;
  const other = (k: keyof Stats6) => {
    const flat = Math.floor(((2 * base[k] + iv(k) + Math.floor(ev(k) / 4)) * L) / 100) + 5;
    return Math.floor(flat * natureMod(input.nature, k));
  };
  const hp = Math.floor(((2 * base.hp + iv("hp") + Math.floor(ev("hp") / 4)) * L) / 100) + L + 10;
  return { hp, atk: other("atk"), def: other("def"), spa: other("spa"), spd: other("spd"), spe: other("spe") };
}

// ---- ability / item tables --------------------------------------------------
const PINCH: Record<string, string> = { Overgrow: "Grass", Blaze: "Fire", Torrent: "Water", Swarm: "Bug" };
const TYPE_BOOST_ABILITY: Record<string, [string, number]> = {
  Transistor: ["Electric", 1.5],
  "Dragon's Maw": ["Dragon", 1.5],
  "Rocky Payload": ["Rock", 1.5],
  Steelworker: ["Steel", 1.5],
  "Water Bubble": ["Water", 2],
};
const IMMUNITY_ABILITY: Record<string, string> = {
  Levitate: "Ground",
  "Flash Fire": "Fire",
  "Water Absorb": "Water",
  "Storm Drain": "Water",
  "Volt Absorb": "Electric",
  "Lightning Rod": "Electric",
  "Motor Drive": "Electric",
  "Sap Sipper": "Grass",
  "Earth Eater": "Ground",
  "Well-Baked Body": "Fire",
};
const TYPE_ITEM: Record<string, string> = {
  Charcoal: "Fire", "Mystic Water": "Water", "Miracle Seed": "Grass", Magnet: "Electric",
  "Never-Melt Ice": "Ice", "Black Belt": "Fighting", "Poison Barb": "Poison", "Soft Sand": "Ground",
  "Sharp Beak": "Flying", "Twisted Spoon": "Psychic", "Silver Powder": "Bug", "Hard Stone": "Rock",
  "Spell Tag": "Ghost", "Dragon Fang": "Dragon", "Black Glasses": "Dark", "Metal Coat": "Steel",
  "Silk Scarf": "Normal", "Fairy Feather": "Fairy",
};

export interface Combatant {
  stats: Stats6; // real stats, no boosts
  types: string[];
  ability: string;
  item: string;
  boosts: Stats6; // stages -6..+6
  status: Status;
  hpPct: number; // 0..100
}

export interface DamageResult {
  move: Move;
  min: number;
  max: number;
  minPct: number;
  maxPct: number;
  effectiveness: number;
  stab: boolean;
  koText: string;
}

function koText(minPct: number, maxPct: number): string {
  if (minPct >= 100) return "guaranteed OHKO";
  if (maxPct >= 100) return "possible OHKO";
  if (maxPct <= 0) return "—";
  const g = Math.ceil(100 / minPct);
  const p = Math.ceil(100 / maxPct);
  return g === p ? `guaranteed ${g}HKO` : `possible ${p}HKO`;
}

export function calc(
  attacker: Combatant,
  defender: Combatant,
  move: Move,
  level: number,
  field: Field
): DamageResult | null {
  if (move.category === "Status" || move.power <= 0) return null;
  const physical = move.category === "Physical";
  const atkAbility = attacker.ability;
  const defAbility = defender.ability;

  // Type effectiveness + immunity abilities
  let eff = typeEffectiveness(move.type, defender.types);
  if (IMMUNITY_ABILITY[defAbility] === move.type) eff = 0;
  if (eff === 0) {
    return { move, min: 0, max: 0, minPct: 0, maxPct: 0, effectiveness: 0, stab: attacker.types.includes(move.type), koText: "—" };
  }

  // Offensive stat (+ boosts, crit ignores negative offensive boosts)
  let atkStage = physical ? attacker.boosts.atk : attacker.boosts.spa;
  if (field.crit && atkStage < 0) atkStage = 0;
  let A = Math.floor((physical ? attacker.stats.atk : attacker.stats.spa) * boostMultiplier(atkStage));

  // offensive ability stat multipliers
  if (physical && (atkAbility === "Huge Power" || atkAbility === "Pure Power")) A = Math.floor(A * 2);
  if (physical && atkAbility === "Hustle") A = Math.floor(A * 1.5);
  if (physical && atkAbility === "Guts" && attacker.status !== "healthy") A = Math.floor(A * 1.5);
  if (!physical && atkAbility === "Solar Power" && field.weather === "sun") A = Math.floor(A * 1.5);
  // Choice items / stat items
  if (physical && attacker.item === "Choice Band") A = Math.floor(A * 1.5);
  if (!physical && attacker.item === "Choice Specs") A = Math.floor(A * 1.5);

  // Defensive stat (+ boosts, crit ignores positive defensive boosts)
  let defStage = physical ? defender.boosts.def : defender.boosts.spd;
  if (field.crit && defStage > 0) defStage = 0;
  let D = Math.floor((physical ? defender.stats.def : defender.stats.spd) * boostMultiplier(defStage));
  // weather defensive boosts
  if (!physical && field.weather === "sand" && defender.types.includes("Rock")) D = Math.floor(D * 1.5);
  if (physical && field.weather === "snow" && defender.types.includes("Ice")) D = Math.floor(D * 1.5);
  D = Math.max(1, D);

  // base damage
  const lf = Math.floor((2 * level) / 5 + 2);
  const base = Math.floor(Math.floor(Math.floor((lf * move.power * A) / D) / 50) + 2);

  // ---- final multiplier chain ----
  let mod = 1;

  // STAB (+ Adaptability)
  const stab = attacker.types.includes(move.type);
  if (stab) mod *= atkAbility === "Adaptability" ? 2 : 1.5;

  // type effectiveness modifiers
  mod *= eff;
  if (atkAbility === "Tinted Lens" && eff < 1) mod *= 2;
  if ((defAbility === "Filter" || defAbility === "Solid Rock" || defAbility === "Prism Armor") && eff > 1) mod *= 0.75;
  if (attacker.item === "Expert Belt" && eff > 1) mod *= 1.2;

  // weather (damage)
  if (field.weather === "sun") mod *= move.type === "Fire" ? 1.5 : move.type === "Water" ? 0.5 : 1;
  if (field.weather === "rain") mod *= move.type === "Water" ? 1.5 : move.type === "Fire" ? 0.5 : 1;

  // terrain (assume attacker grounded)
  if (field.terrain === "electric" && move.type === "Electric") mod *= 1.3;
  if (field.terrain === "grassy" && move.type === "Grass") mod *= 1.3;
  if (field.terrain === "psychic" && move.type === "Psychic") mod *= 1.3;
  if (field.terrain === "misty" && move.type === "Dragon") mod *= 0.5;

  // crit
  if (field.crit) mod *= 1.5;

  // screens (ignored on crit)
  if (!field.crit) {
    if (field.auroraVeil) mod *= 0.5;
    else if (physical && field.reflect) mod *= 0.5;
    else if (!physical && field.lightScreen) mod *= 0.5;
  }

  // burn (physical, halves; Guts ignores)
  if (physical && attacker.status === "brn" && atkAbility !== "Guts") mod *= 0.5;

  // offensive type-boost abilities
  const tb = TYPE_BOOST_ABILITY[atkAbility];
  if (tb && tb[0] === move.type) mod *= tb[1];
  // pinch abilities (<= 1/3 HP)
  if (PINCH[atkAbility] === move.type && attacker.hpPct <= 34) mod *= 1.5;

  // defensive abilities
  if (defAbility === "Thick Fat" && (move.type === "Fire" || move.type === "Ice")) mod *= 0.5;
  if (defAbility === "Heatproof" && move.type === "Fire") mod *= 0.5;
  if (defAbility === "Purifying Salt" && move.type === "Ghost") mod *= 0.5;
  if ((defAbility === "Multiscale" || defAbility === "Shadow Shield") && defender.hpPct >= 100) mod *= 0.5;

  // held items (damage)
  if (attacker.item === "Life Orb") mod *= 1.3;
  if (physical && attacker.item === "Muscle Band") mod *= 1.1;
  if (!physical && attacker.item === "Wise Glasses") mod *= 1.1;
  if (TYPE_ITEM[attacker.item] === move.type) mod *= 1.2;

  const hp = defender.stats.hp;
  const min = Math.floor(Math.floor(base * 0.85) * mod);
  const max = Math.floor(base * mod);
  const minPct = (min / hp) * 100;
  const maxPct = (max / hp) * 100;

  return {
    move,
    min,
    max,
    minPct,
    maxPct,
    effectiveness: eff,
    stab,
    koText: koText(minPct, maxPct),
  };
}
