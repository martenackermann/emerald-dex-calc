// Predicts which move the ROM-hack AI is likely to use, from the trainer's
// AI flags (src/data/trainers.party "AI:" field → battle_ai.h behaviour).
//
// This is a heuristic model of pokeemerald-expansion's scoring, not a 1:1 port:
//   - CHECK_VIABILITY / PREFER_HIGHEST_DAMAGE / "Basic Trainer": concentrate on
//     the best damaging move (sharp distribution).
//   - TRY_TO_FAINT / TRY_TO_2HKO: big bonus to moves that KO from current HP.
//   - CHECK_BAD_MOVE: avoid no-effect / status-only; flatter otherwise.
//   - RISKY: prefer raw damage.

import { calc, type Combatant, type Field } from "@/lib/calc/damage";
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
