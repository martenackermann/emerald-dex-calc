// Editable calculator Pokémon state + resolution to an engine Combatant.

import type { GameData, ResolvedMon, Species, TrainerMon } from "@/lib/pokemon/data";
import { computeStats, type Combatant, type Stats6, type Status } from "@/lib/calc/damage";

export interface CalcMon {
  speciesId: number;
  level: number;
  natureId: number;
  ability: string;
  item: string; // display name or "" for none
  evs: Stats6;
  ivs: Stats6;
  boosts: Stats6;
  status: Status;
  hpPct: number;
  moves: number[]; // up to 4 move ids
}

const ZERO: Stats6 = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const MAX_IV: Stats6 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

export function speciesMovepool(s: Species): number[] {
  return [...new Set([...s.levelUpMoves.map((m) => m.move), ...s.tmMoves])];
}

/** Four sensible default moves (highest-level damaging level-up moves first). */
function defaultMoves(data: GameData, s: Species): number[] {
  const dmg = [...s.levelUpMoves]
    .reverse()
    .map((m) => m.move)
    .filter((id) => (data.moveById.get(id)?.power ?? 0) > 0);
  const pool = dmg.length ? dmg : speciesMovepool(s);
  return [...new Set(pool)].slice(0, 4);
}

export function defaultCalcMon(data: GameData, speciesId: number): CalcMon {
  const s = data.speciesById.get(speciesId);
  return {
    speciesId,
    level: 50,
    natureId: 0,
    ability: s?.abilityList[0] ?? "",
    item: "",
    evs: { ...ZERO },
    ivs: { ...MAX_IV },
    boosts: { ...ZERO },
    status: "healthy",
    hpPct: 100,
    moves: s ? defaultMoves(data, s) : [],
  };
}

/** Build a CalcMon from a parsed team/demo mon (keeps its real IVs/EVs/nature/etc). */
export function calcMonFromResolved(m: ResolvedMon): CalcMon {
  const r = m.raw;
  return {
    speciesId: m.species?.id ?? r.species,
    level: m.level,
    natureId: m.nature.id,
    ability: m.ability === "—" ? "" : m.ability,
    item: m.item ?? "",
    evs: { ...r.evs },
    ivs: { ...r.ivs },
    boosts: { ...ZERO },
    status: "healthy",
    hpPct: 100,
    moves: r.moves.filter((id) => id > 0),
  };
}

export function calcMonFromTrainer(data: GameData, tm: TrainerMon): CalcMon {
  const base = defaultCalcMon(data, tm.species);
  return {
    ...base,
    level: tm.level,
    natureId: tm.nature,
    ability: tm.ability != null ? data.abilityById.get(tm.ability)?.name ?? base.ability : base.ability,
    item: tm.item != null ? data.itemById.get(tm.item)?.name ?? "" : "",
    moves: tm.moves.length ? tm.moves : base.moves,
  };
}

export function toCombatant(data: GameData, m: CalcMon): Combatant | null {
  const s = data.speciesById.get(m.speciesId);
  if (!s) return null;
  return {
    stats: computeStats(s.baseStats, {
      level: m.level,
      ivs: m.ivs,
      evs: m.evs,
      nature: data.natures[m.natureId],
    }),
    types: s.types,
    ability: m.ability,
    item: m.item,
    boosts: m.boosts,
    status: m.status,
    hpPct: m.hpPct,
  };
}
