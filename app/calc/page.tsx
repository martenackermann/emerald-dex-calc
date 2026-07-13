"use client";

import { useEffect, useMemo, useState } from "react";
import { Swords, Search, Sparkles } from "lucide-react";
import { useSave } from "@/components/save/save-provider";
import { TypeBadge } from "@/components/pokemon/type-badge";
import { Sprite } from "@/components/pokemon/sprite";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { resolveMon, loadTrainers, type Species, type Trainer } from "@/lib/pokemon/data";
import { buildDemoSave } from "@/lib/pokemon/demo";
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
  const [mode, setMode] = useState("species");

  // species defender
  const [defSpecies, setDefSpecies] = useState<Species | null>(null);
  const [defLevel, setDefLevel] = useState(50);
  const [q, setQ] = useState("");

  // trainer defender
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [tq, setTq] = useState("");
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [tMonIdx, setTMonIdx] = useState(0);

  useEffect(() => {
    loadTrainers().then(setTrainers).catch(() => {});
  }, []);

  const activeSave = useMemo(() => save ?? (data ? buildDemoSave(data) : null), [save, data]);
  const party = useMemo(
    () => (activeSave && data ? activeSave.party.map((m) => resolveMon(m, data)) : []),
    [activeSave, data]
  );

  const speciesMatches = useMemo(() => {
    if (!data || !q.trim()) return [];
    const query = q.trim().toLowerCase();
    return data.species.filter((s) => s.id > 0 && s.name.toLowerCase().includes(query)).slice(0, 8);
  }, [data, q]);

  const trainerMatches = useMemo(() => {
    if (!tq.trim()) return [];
    const query = tq.trim().toLowerCase();
    return trainers
      .filter((t) => t.name.toLowerCase().includes(query) || t.trainerClass.toLowerCase().includes(query))
      .slice(0, 10);
  }, [trainers, tq]);

  if (!data || !activeSave) return <div className="py-10 text-center text-muted-foreground">Loading…</div>;

  const atkMon = party[attackerIdx];
  const atkRaw = activeSave.party[attackerIdx];
  const attacker: Combatant | null =
    atkMon && atkMon.species ? buildAttackerFromSave(atkRaw, atkMon.species, atkMon.nature, atkMon.level) : null;

  // Resolve the defender combatant from whichever mode is active.
  let defender: Combatant | null = null;
  let defenderLabel = "";
  if (mode === "species" && defSpecies) {
    defender = { species: defSpecies, types: defSpecies.types, stats: computeStats(defSpecies.baseStats, { level: defLevel }) };
    defenderLabel = `${defSpecies.name} · Lv${defLevel}`;
  } else if (mode === "trainer" && trainer) {
    const tm = trainer.party[tMonIdx];
    const sp = tm && data.speciesById.get(tm.species);
    if (sp) {
      defender = { species: sp, types: sp.types, stats: computeStats(sp.baseStats, { level: tm.level, nature: data.natures[tm.nature] }) };
      defenderLabel = `${trainer.name}'s ${sp.name} · Lv${tm.level}`;
    }
  }

  const results =
    attacker && defender && atkMon
      ? atkMon.moves
          .filter(Boolean)
          .map((mv) => calcMove(attacker, defender!, mv!, atkMon.level))
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
          {save ? "Your team" : "Demo team"} vs. any Pokémon or ROM-hack trainer. Uses your mon&apos;s real IVs/EVs/nature.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Attacker */}
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
            Attacker {save ? "(your team)" : <span className="inline-flex items-center gap-1 text-muted-foreground"><Sparkles className="size-3" /> demo team</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {party.map((m, i) => (
              <button
                key={i}
                onClick={() => setAttackerIdx(i)}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-2 py-1 text-sm font-medium transition-colors",
                  i === attackerIdx ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                )}
              >
                {m.species && <Sprite speciesId={m.species.id} size={24} />}
                {m.displayName}
              </button>
            ))}
          </div>
          {attacker && atkMon && (
            <div className="mt-3 flex items-center gap-3">
              {atkMon.species && <Sprite speciesId={atkMon.species.id} size={56} />}
              <div className="flex-1">
                <div className="mb-1 flex gap-1">{atkMon.types.map((t) => <TypeBadge key={t} type={t} />)}</div>
                <StatLine stats={attacker.stats} />
              </div>
            </div>
          )}
        </div>

        {/* Defender */}
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 text-sm font-semibold text-primary">Defender (enemy)</div>
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="mb-3">
              <TabsTrigger value="species">Any Pokémon</TabsTrigger>
              <TabsTrigger value="trainer">ROM-hack trainer</TabsTrigger>
            </TabsList>

            <TabsContent value="species" className="mt-0 space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a Pokémon…" className="pl-8" />
                {speciesMatches.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                    {speciesMatches.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setDefSpecies(s); setQ(""); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <Sprite speciesId={s.id} size={28} />
                        <span className="flex-1">{s.name}</span>
                        <span className="flex gap-1">{s.types.map((t) => <TypeBadge key={t} type={t} className="px-1.5 py-0 text-[10px]" />)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="deflvl" className="text-xs text-muted-foreground">Level</Label>
                <Input id="deflvl" type="number" min={1} max={100} value={defLevel}
                  onChange={(e) => setDefLevel(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className="w-20" />
              </div>
            </TabsContent>

            <TabsContent value="trainer" className="mt-0 space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={tq} onChange={(e) => setTq(e.target.value)} placeholder={`Search ${trainers.length} trainers…`} className="pl-8" />
                {trainerMatches.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                    {trainerMatches.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { setTrainer(t); setTMonIdx(0); setTq(""); }}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span>{t.name || t.id}</span>
                        <span className="text-xs text-muted-foreground">{t.trainerClass} · {t.party.length}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {trainer && (
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">{trainer.trainerClass} {trainer.name} — pick a Pokémon</div>
                  <div className="flex flex-wrap gap-1.5">
                    {trainer.party.map((tm, i) => {
                      const sp = data.speciesById.get(tm.species);
                      return (
                        <button
                          key={i}
                          onClick={() => setTMonIdx(i)}
                          className={cn(
                            "flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                            i === tMonIdx ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                          )}
                        >
                          {sp && <Sprite speciesId={sp.id} size={22} />}
                          {sp?.name ?? `#${tm.species}`} <span className="opacity-60">L{tm.level}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {defender && (
            <div className="mt-3 flex items-center gap-3 border-t pt-3">
              <Sprite speciesId={defender.species.id} size={56} />
              <div className="flex-1">
                <div className="mb-1 flex gap-1">{defender.types.map((t) => <TypeBadge key={t} type={t} />)}</div>
                <StatLine stats={defender.stats} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3 text-sm font-semibold">
          {defender ? `${atkMon?.displayName} → ${defenderLabel}` : "Pick a defender to see damage"}
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
                  <span className={cn(
                    "text-xs font-medium",
                    r.effectiveness === 0 && "text-muted-foreground",
                    r.effectiveness > 1 && "text-emerald-500",
                    r.effectiveness < 1 && r.effectiveness > 0 && "text-orange-500"
                  )}>
                    {effectivenessLabel(r.effectiveness)}
                  </span>
                  <span className="tabular-nums text-sm">{r.min}–{r.max}</span>
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
    <div className="grid grid-cols-6 gap-1 text-center text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="rounded bg-muted/60 py-1">
          <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
          <div className="font-semibold tabular-nums">{v}</div>
        </div>
      ))}
    </div>
  );
}
