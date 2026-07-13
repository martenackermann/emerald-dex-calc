"use client";

import { useMemo, useState } from "react";
import { Swords, Search } from "lucide-react";
import { useSave } from "@/components/save/save-provider";
import { SaveDropzone } from "@/components/save/save-dropzone";
import { TypeBadge } from "@/components/pokemon/type-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Species } from "@/lib/pokemon/data";
import { resolveMon } from "@/lib/pokemon/data";
import {
  buildAttackerFromSave,
  calcMove,
  computeStats,
  effectivenessLabel,
  type Combatant,
} from "@/lib/calc/damage";
import { cn } from "@/lib/utils";

export default function CalcPage() {
  const { data, save } = useSave();
  const [attackerIdx, setAttackerIdx] = useState(0);
  const [defender, setDefender] = useState<Species | null>(null);
  const [defLevel, setDefLevel] = useState(50);
  const [q, setQ] = useState("");

  const party = useMemo(
    () => (save && data ? save.party.map((m) => resolveMon(m, data)) : []),
    [save, data]
  );

  const matches = useMemo(() => {
    if (!data || !q.trim()) return [];
    const query = q.trim().toLowerCase();
    return data.species.filter((s) => s.id > 0 && s.name.toLowerCase().includes(query)).slice(0, 8);
  }, [data, q]);

  if (!data) return <div className="py-10 text-center text-muted-foreground">Loading…</div>;

  if (!save) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Damage Calculator</h1>
          <p className="mt-2 text-muted-foreground">Load your save to pit your team against any Pokémon.</p>
        </div>
        <SaveDropzone />
      </div>
    );
  }

  const atkMon = party[attackerIdx];
  const atkRaw = save.party[attackerIdx];
  const atkSpecies = atkMon?.species;

  const attacker: Combatant | null =
    atkMon && atkSpecies
      ? buildAttackerFromSave(atkRaw, atkSpecies, atkMon.nature, atkMon.level)
      : null;

  const defenderCombatant: Combatant | null = defender
    ? { species: defender, types: defender.types, stats: computeStats(defender.baseStats, { level: defLevel }) }
    : null;

  const results =
    attacker && defenderCombatant && atkMon
      ? atkMon.moves
          .filter(Boolean)
          .map((mv) => calcMove(attacker, defenderCombatant, mv!, atkMon.level))
          .filter((r): r is NonNullable<typeof r> => r !== null)
          .sort((a, b) => b.max - a.max)
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Swords className="size-6 text-primary" /> Damage Calculator
        </h1>
        <p className="text-sm text-muted-foreground">
          Your team vs. an enemy. Uses your mon&apos;s real IVs/EVs/nature; defender assumed 31 IVs / 0 EVs / neutral.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Attacker */}
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 text-sm font-semibold text-primary">Attacker (your team)</div>
          <div className="flex flex-wrap gap-1.5">
            {party.map((m, i) => (
              <button
                key={i}
                onClick={() => setAttackerIdx(i)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors",
                  i === attackerIdx ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                )}
              >
                {m.displayName} · Lv{m.level}
              </button>
            ))}
          </div>
          {attacker && atkMon && (
            <div className="mt-3">
              <div className="mb-1 flex gap-1">{atkMon.types.map((t) => <TypeBadge key={t} type={t} />)}</div>
              <StatLine stats={attacker.stats} />
            </div>
          )}
        </div>

        {/* Defender */}
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 text-sm font-semibold text-primary">Defender (enemy)</div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a Pokémon…" className="pl-8" />
            {matches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
                {matches.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setDefender(s);
                      setQ("");
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    {s.name}
                    <span className="flex gap-1">{s.types.map((t) => <TypeBadge key={t} type={t} className="px-1.5 py-0 text-[10px]" />)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="deflvl" className="text-xs text-muted-foreground">Level</Label>
              <Input
                id="deflvl"
                type="number"
                min={1}
                max={100}
                value={defLevel}
                onChange={(e) => setDefLevel(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="w-20"
              />
            </div>
            {defender && <div className="flex gap-1">{defender.types.map((t) => <TypeBadge key={t} type={t} />)}</div>}
          </div>
          {defenderCombatant && (
            <div className="mt-2">
              <div className="text-sm font-medium">{defender!.name}</div>
              <StatLine stats={defenderCombatant.stats} />
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3 text-sm font-semibold">
          {defender ? `${atkMon?.displayName} → ${defender.name}` : "Pick a defender to see damage"}
        </div>
        {results.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {defender ? "This mon has no damaging moves." : "No results yet."}
          </p>
        ) : (
          <div className="divide-y">
            {results.map((r) => (
              <div key={r.move.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="flex min-w-40 items-center gap-2">
                  <span className="font-medium">{r.move.name}</span>
                  <TypeBadge type={r.move.type} className="px-1.5 py-0 text-[10px]" />
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.move.category} · {r.move.power} BP{r.stab && " · STAB"}
                </div>
                <div className="ml-auto flex items-center gap-4">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      r.effectiveness === 0 && "text-muted-foreground",
                      r.effectiveness > 1 && "text-emerald-500",
                      r.effectiveness < 1 && r.effectiveness > 0 && "text-orange-500"
                    )}
                  >
                    {effectivenessLabel(r.effectiveness)}
                  </span>
                  <span className="tabular-nums text-sm">
                    {r.min}–{r.max}
                  </span>
                  <span className="w-28 text-right text-sm font-semibold tabular-nums">
                    {r.minPct.toFixed(0)}–{r.maxPct.toFixed(0)}%
                    {r.hitsToKO && r.effectiveness > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">({r.hitsToKO}HKO)</span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatLine({ stats }: { stats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } }) {
  const entries: [string, number][] = [
    ["HP", stats.hp], ["Atk", stats.atk], ["Def", stats.def],
    ["SpA", stats.spa], ["SpD", stats.spd], ["Spe", stats.spe],
  ];
  return (
    <div className="mt-1 grid grid-cols-6 gap-1 text-center text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="rounded bg-muted/60 py-1">
          <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
          <div className="font-semibold tabular-nums">{v}</div>
        </div>
      ))}
    </div>
  );
}
