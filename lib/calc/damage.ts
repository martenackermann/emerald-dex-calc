// Damage calculator. Uses the modern (phys/spec split) formula, which is
// pokeemerald-expansion's default. Driven entirely by the extracted ROM-hack
// data + parsed save mons, so randomized/custom stats & moves compute correctly.

import type { BaseStats, Move, Nature, Species } from "@/lib/pokemon/data";
import type { DecodedMon } from "@/lib/save";

// Non-neutral type matchups (attack -> {defend: multiplier}); Gen 6+ chart.
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

function natureMod(nature: Nature | undefined, stat: keyof BaseStats): number {
  if (!nature || !nature.plus || !nature.minus) return 1;
  if (nature.plus === stat) return 1.1;
  if (nature.minus === stat) return 0.9;
  return 1;
}

export interface StatInput {
  ivs?: Partial<BaseStats>;
  evs?: Partial<BaseStats>;
  nature?: Nature;
  level: number;
}

/** Compute real stats from base stats + IV/EV/nature/level. */
export function computeStats(base: BaseStats, input: StatInput): BaseStats & { hp: number } {
  const iv = (k: keyof BaseStats) => input.ivs?.[k] ?? 31;
  const ev = (k: keyof BaseStats) => input.evs?.[k] ?? 0;
  const L = input.level;
  const other = (k: keyof BaseStats) => {
    const flat = Math.floor(((2 * base[k] + iv(k) + Math.floor(ev(k) / 4)) * L) / 100) + 5;
    return Math.floor(flat * natureMod(input.nature, k));
  };
  const hp = Math.floor(((2 * base.hp + iv("hp") + Math.floor(ev("hp") / 4)) * L) / 100) + L + 10;
  return { hp, atk: other("atk"), def: other("def"), spa: other("spa"), spd: other("spd"), spe: other("spe") };
}

export interface DamageResult {
  move: Move;
  min: number;
  max: number;
  minPct: number;
  maxPct: number;
  effectiveness: number;
  stab: boolean;
  hitsToKO: number | null;
}

export interface Combatant {
  species: Species;
  stats: BaseStats & { hp: number };
  types: string[];
}

export function buildAttackerFromSave(mon: DecodedMon, species: Species, nature: Nature, level: number): Combatant {
  return {
    species,
    types: species.types,
    stats: computeStats(species.baseStats, { level, ivs: mon.ivs, evs: mon.evs, nature }),
  };
}

export function calcMove(attacker: Combatant, defender: Combatant, move: Move, level: number): DamageResult | null {
  if (move.category === "Status" || move.power <= 0) return null;
  const A = move.category === "Physical" ? attacker.stats.atk : attacker.stats.spa;
  const D = move.category === "Physical" ? defender.stats.def : defender.stats.spd;
  const base = Math.floor(Math.floor((Math.floor((2 * level) / 5 + 2) * move.power * A) / D) / 50) + 2;

  const stab = attacker.types.includes(move.type);
  const eff = typeEffectiveness(move.type, defender.types);
  const mod = (stab ? 1.5 : 1) * eff;

  const min = Math.floor(base * mod * 0.85);
  const max = Math.floor(base * mod * 1.0);
  const hp = defender.stats.hp;
  return {
    move,
    min,
    max,
    minPct: (min / hp) * 100,
    maxPct: (max / hp) * 100,
    effectiveness: eff,
    stab,
    hitsToKO: max > 0 ? Math.ceil(hp / max) : null,
  };
}
