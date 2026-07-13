// Gen 3 experience -> level. Box Pokemon store experience, not level, so we
// invert the growth-rate exp curves. Party Pokemon store level directly.

export type GrowthRate =
  | "Medium Fast"
  | "Erratic"
  | "Fluctuating"
  | "Medium Slow"
  | "Fast"
  | "Slow";

/** Total experience required to *be* at level n for a given growth rate. */
export function expForLevel(rate: GrowthRate, n: number): number {
  if (n <= 1) return 0;
  const c = n * n * n;
  switch (rate) {
    case "Fast":
      return Math.floor((4 * c) / 5);
    case "Medium Fast":
      return c;
    case "Medium Slow":
      return Math.floor((6 / 5) * c - 15 * n * n + 100 * n - 140);
    case "Slow":
      return Math.floor((5 * c) / 4);
    case "Erratic":
      if (n <= 50) return Math.floor((c * (100 - n)) / 50);
      if (n <= 68) return Math.floor((c * (150 - n)) / 100);
      if (n <= 98) return Math.floor((c * Math.floor((1911 - 10 * n) / 3)) / 500);
      return Math.floor((c * (160 - n)) / 100);
    case "Fluctuating":
      if (n <= 15) return Math.floor((c * (Math.floor((n + 1) / 3) + 24)) / 50);
      if (n <= 36) return Math.floor((c * (n + 14)) / 50);
      return Math.floor((c * (Math.floor(n / 2) + 32)) / 50);
    default:
      return c;
  }
}

/** Highest level whose exp requirement is <= the given experience (1..100). */
export function levelFromExp(rate: GrowthRate, exp: number): number {
  let lvl = 1;
  for (let n = 2; n <= 100; n++) {
    if (expForLevel(rate, n) <= exp) lvl = n;
    else break;
  }
  return lvl;
}
