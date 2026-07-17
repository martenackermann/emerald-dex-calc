// Predicts which move the ROM-hack AI is likely to use, from the trainer's
// AI flags (src/data/trainers.party "AI:" field → battle_ai.h behaviour).
//
// This is a heuristic model of pokeemerald-expansion's scoring, not a 1:1 port:
//   - CHECK_VIABILITY / PREFER_HIGHEST_DAMAGE / "Basic Trainer": concentrate on
//     the best damaging move (sharp distribution).
//   - TRY_TO_FAINT / TRY_TO_2HKO: big bonus to moves that KO from current HP.
//   - CHECK_BAD_MOVE: avoid no-effect / status-only; flatter otherwise.
//   - RISKY: prefer raw damage.

import { calc, typeEffectiveness, type Combatant, type Field } from "@/lib/calc/damage";
import type { GameData, Move } from "@/lib/pokemon/data";

export interface MovePrediction {
  move: Move;
  likelihood: number; // 0..1
  maxPct: number;
  ko: boolean;
}

const has = (flags: string[], needle: string) =>
  flags.some((f) => f.toLowerCase().includes(needle.toLowerCase()));

// Moves the AI only picks with AI_FLAG_WILL_SUICIDE set (battle_ai.h)
const SUICIDE_MOVES = new Set(["Explosion", "Self-Destruct", "Final Gambit", "Misty Explosion", "Memento"]);

export function predictAiMoves(
  data: GameData,
  attacker: Combatant,
  defender: Combatant,
  defenderCurHp: number,
  moveIds: number[],
  level: number,
  field: Field,
  flags: string[]
): MovePrediction[] {
  const basic = has(flags, "Basic"); // Basic Trainer = check bad + try to faint + viability
  const tryFaint = basic || has(flags, "Faint");
  const viability = basic || has(flags, "Viability") || has(flags, "Highest Damage");
  const checkBad = basic || has(flags, "Check Bad");
  const status = has(flags, "Status");

  const moves = moveIds.map((id) => data.moveById.get(id)).filter((m): m is Move => !!m);

  const scored = moves.map((mv) => {
    const r = calc(attacker, defender, mv, level, field);
    if (!r) {
      // status / non-damaging move
      return { move: mv, score: status ? 22 : checkBad ? 6 : 12, maxPct: 0, ko: false };
    }
    if (r.effectiveness === 0) return { move: mv, score: 0, maxPct: 0, ko: false };
    const ko = r.max >= defenderCurHp;
    let score = r.maxPct; // % of max HP
    if (ko && tryFaint) score += 70;
    // AI only sacrifices itself with the Will Suicide (or Risky) flag set
    if (SUICIDE_MOVES.has(mv.name) && !has(flags, "Suicide") && !has(flags, "Risky")) {
      score = checkBad ? 1 : score * 0.3;
    }
    return { move: mv, score: Math.max(0, score), maxPct: r.maxPct, ko };
  });

  // softmax; lower temperature = the AI commits harder to the best option
  const temp = viability ? 12 : checkBad ? 24 : 40;
  const exps = scored.map((s) => Math.exp(s.score / temp));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;

  return scored
    .map((s, i) => ({ move: s.move, likelihood: exps[i] / sum, maxPct: s.maxPct, ko: s.ko }))
    .sort((a, b) => b.likelihood - a.likelihood);
}

// ---------------------------------------------------------------------------
// Post-KO switch-in prediction — port of GetMostSuitableMonToSwitchInto
// (src/battle_ai_switch.c:2586). Paths:
//   Sequence Switching  -> first alive mon in party order       (:2561)
//   default (vanilla)   -> GetBestMonVanilla                     (:2461)
//     Baton Pass > type matchup (resists us AND hits us super-
//     effectively; lowest defensive matchup wins) > best damage
//     > any valid; Ace Pokemon (last slot) only as a last resort.
// (Smart Mon Choices' integrated scoring is approximated by vanilla here.)
// ---------------------------------------------------------------------------

export interface SwitchCandidate {
  combatant: Combatant;
  curHp: number;
  moveIds: number[];
  level: number;
}

export interface SwitchPrediction {
  index: number;
  reason: string;
}

export function predictSwitchIn(
  data: GameData,
  team: SwitchCandidate[],
  deadIndex: number,
  playerMon: Combatant,
  playerCurHp: number,
  field: Field,
  flags: string[]
): SwitchPrediction | null {
  const aliveIdx = team
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => i !== deadIndex && c.curHp > 0);
  if (aliveIdx.length === 0) return null;

  if (has(flags, "Sequence")) {
    return { index: aliveIdx[0].i, reason: "next in party order (Sequence Switching)" };
  }

  // Ace Pokemon: last party slot is held back until it's the only one left
  const aceIndex = has(flags, "Ace") ? team.length - 1 : -1;
  let pool = aliveIdx.filter(({ i }) => i !== aceIndex);
  if (pool.length === 0) {
    return { index: aliveIdx[0].i, reason: "ace Pokémon — last one standing" };
  }

  // 1) Baton Pass holder
  for (const { c, i } of pool) {
    if (c.moveIds.some((id) => data.moveById.get(id)?.name === "Baton Pass")) {
      return { index: i, reason: "has Baton Pass" };
    }
  }

  // 2) Type matchup: takes <2x from the player's types AND has a >=2x move
  let bestResist = 2.0;
  let bestMatchIdx = -1;
  for (const { c, i } of pool) {
    // how hard the player's typing hits this candidate (product over player types)
    const matchup = playerMon.types.reduce(
      (m, t) => m * typeEffectiveness(t, c.combatant.types),
      1
    );
    const hasSE = c.moveIds.some((id) => {
      const mv = data.moveById.get(id);
      return mv && mv.power > 0 && typeEffectiveness(mv.type, playerMon.types) >= 2;
    });
    if (hasSE && matchup < bestResist) {
      bestResist = matchup;
      bestMatchIdx = i;
    }
  }
  if (bestMatchIdx >= 0) {
    return { index: bestMatchIdx, reason: "type matchup — resists you & hits super-effectively" };
  }

  // 3) Best single-move damage vs the player's active mon
  let bestDmg = 0;
  let bestDmgIdx = -1;
  for (const { c, i } of pool) {
    for (const id of c.moveIds) {
      const mv = data.moveById.get(id);
      if (!mv || mv.power <= 0) continue;
      const r = calc(c.combatant, playerMon, mv, c.level, field);
      if (r && r.max > bestDmg) {
        bestDmg = r.max;
        bestDmgIdx = i;
      }
    }
  }
  if (bestDmgIdx >= 0) {
    return { index: bestDmgIdx, reason: "highest damage against your active Pokémon" };
  }

  return { index: pool[0].i, reason: "first valid party member" };
}
