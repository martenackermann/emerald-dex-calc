import { cn } from "@/lib/utils";
import type { BaseStats } from "@/lib/pokemon/data";

const LABELS: Record<keyof BaseStats, string> = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};

function barColor(v: number): string {
  if (v >= 130) return "#22c55e";
  if (v >= 100) return "#84cc16";
  if (v >= 70) return "#eab308";
  if (v >= 50) return "#f97316";
  return "#ef4444";
}

export function StatBars({
  stats,
  plus,
  minus,
}: {
  stats: BaseStats;
  plus?: keyof BaseStats | null;
  minus?: keyof BaseStats | null;
}) {
  const keys = Object.keys(stats) as (keyof BaseStats)[];
  const total = keys.reduce((a, k) => a + stats[k], 0);
  return (
    <div className="space-y-1.5">
      {keys.map((k) => (
        <div key={k} className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "w-8 shrink-0 font-medium text-muted-foreground",
              plus === k && "text-emerald-500",
              minus === k && "text-red-500"
            )}
          >
            {LABELS[k]}
          </span>
          <span className="w-8 shrink-0 tabular-nums text-right font-semibold">{stats[k]}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, (stats[k] / 255) * 100)}%`, backgroundColor: barColor(stats[k]) }}
            />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-0.5 text-xs">
        <span className="w-8 shrink-0 font-semibold">BST</span>
        <span className="w-8 shrink-0 tabular-nums text-right font-bold">{total}</span>
      </div>
    </div>
  );
}
