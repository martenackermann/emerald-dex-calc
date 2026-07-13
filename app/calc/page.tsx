"use client";

import { useEffect, useMemo, useState } from "react";
import { Swords, Search, Sparkles, Minus, Plus } from "lucide-react";
import { useSave } from "@/components/save/save-provider";
import { TypeBadge } from "@/components/pokemon/type-badge";
import { Sprite } from "@/components/pokemon/sprite";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolveMon, loadTrainers, type Species, type Trainer, type BaseStats } from "@/lib/pokemon/data";
import { buildDemoSave } from "@/lib/pokemon/demo";
import {
  buildAttackerFromSave,
  calcMove,
  computeStats,
  effectivenessLabel,
  type Combatant,
} from "@/lib/calc/damage";
import { cn } from "@/lib/utils";

const EV_PRESETS: Record<string, { label: string; evs: Partial<BaseStats> }> = {
  none: { label: "0 EVs", evs: {} },
  hp: { label: "Max HP", evs: { hp: 252 } },
  def: { label: "Bulky (HP/Def)", evs: { hp: 252, def: 252 } },
  spd: { label: "Bulky (HP/SpD)", evs: { hp: 252, spd: 252 } },
};

export default function CalcPage() {
  const { data, save } = useSave();
  const [attackerIdx, setAttackerIdx] = useState(0);
  const [atkBoost, setAtkBoost] = useState(0);

  const [mode, setMode] = useState("species");
  const [defSpecies, setDefSpecies] = useState<Species | null>(null);
  const [defLevel, setDefLevel] = useState(50);
  const [defNature, setDefNature] = useState("0");
  const [defEvs, setDefEvs] = useState("none");
  const [defBoost, setDefBoost] = useState(0);
  const [q, setQ] = useState("");

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

  let defender: Combatant | null = null;
  let defenderLabel = "";
  if (mode === "species" && defSpecies) {
    defender = {
      species: defSpecies,
      types: defSpecies.types,
      stats: computeStats(defSpecies.baseStats, {
        level: defLevel,
        nature: data.natures[Number(defNature)],
        evs: EV_PRESETS[defEvs].evs,
      }),
    };
    defenderLabel = `${defSpecies.name} · Lv${defLevel}`;
  } else if (mode === "trainer" && trainer) {
    const tm = trainer.party[tMonIdx];
    const sp = tm && data.speciesById.get(tm.species);
    if (sp) {
      defender = {
        species: sp,
        types: sp.types,
        stats: computeStats(sp.baseStats, { level: tm.level, nature: data.natures[tm.nature] }),
      };
      defenderLabel = `${trainer.name}'s ${sp.name} · Lv${tm.level}`;
    }
  }

  const results =
    attacker && defender && atkMon
      ? atkMon.moves
          .filter(Boolean)
          .map((mv) => calcMove(attacker, defender!, mv!, atkMon.level, { atkBoost, defBoost }))
          .filter((r): r is NonNullable<typeof r> => r !== null)
          .sort((a, b) => b.max - a.max)
      : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
          <Swords className="size-5 text-primary sm:size-6" /> Damage Calculator
        </h1>
        <p className="text-sm text-muted-foreground">
          {save ? "Your team" : "Demo team"} vs. any Pokémon or ROM-hack trainer.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Attacker */}
        <section className="rounded-xl border bg-card p-3">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span className="text-primary">Attacker</span>
            {!save && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="size-3" /> demo
              </span>
            )}
          </div>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {party.map((m, i) => (
              <button
                key={i}
                onClick={() => setAttackerIdx(i)}
                className={cn(
                  "flex shrink-0 flex-col items-center rounded-lg border px-2 py-1 transition-colors",
                  i === attackerIdx ? "border-primary bg-primary/10" : "hover:bg-muted"
                )}
              >
                {m.species && <Sprite speciesId={m.species.id} size={40} />}
                <span className="max-w-16 truncate text-[11px] font-medium">{m.displayName}</span>
              </button>
            ))}
          </div>
          {attacker && atkMon && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">{atkMon.types.map((t) => <TypeBadge key={t} type={t} />)}</div>
                <span className="text-xs text-muted-foreground">Lv {atkMon.level} · {atkMon.nature.name}</span>
              </div>
              <StatLine stats={attacker.stats} />
              <Stepper label="Attack boost" value={atkBoost} onChange={setAtkBoost} />
            </div>
          )}
        </section>

        {/* Defender */}
        <section className="rounded-xl border bg-card p-3">
          <div className="mb-2 text-sm font-semibold text-primary">Defender</div>
          <Tabs value={mode} onValueChange={(v) => setMode(v ?? "species")}>
            <TabsList className="mb-2 w-full">
              <TabsTrigger value="species" className="flex-1">Any Pokémon</TabsTrigger>
              <TabsTrigger value="trainer" className="flex-1">Trainer</TabsTrigger>
            </TabsList>

            <TabsContent value="species" className="mt-0 space-y-2">
              <SearchBox
                value={q}
                onChange={setQ}
                placeholder="Search a Pokémon…"
                results={speciesMatches.map((s) => ({
                  key: s.id,
                  node: (
                    <>
                      <Sprite speciesId={s.id} size={28} />
                      <span className="flex-1">{s.name}</span>
                      <span className="flex gap-1">{s.types.map((t) => <TypeBadge key={t} type={t} className="px-1.5 py-0 text-[10px]" />)}</span>
                    </>
                  ),
                  onPick: () => { setDefSpecies(s); setQ(""); },
                }))}
              />
              <div className="grid grid-cols-3 gap-2">
                <LabeledInput label="Level">
                  <Input type="number" min={1} max={100} value={defLevel}
                    onChange={(e) => setDefLevel(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
                </LabeledInput>
                <LabeledInput label="Nature">
                  <Select value={defNature} onValueChange={(v) => setDefNature(v ?? "0")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {data.natures.map((n) => <SelectItem key={n.id} value={String(n.id)}>{n.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </LabeledInput>
                <LabeledInput label="EVs">
                  <Select value={defEvs} onValueChange={(v) => setDefEvs(v ?? "none")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EV_PRESETS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </LabeledInput>
              </div>
            </TabsContent>

            <TabsContent value="trainer" className="mt-0 space-y-2">
              <SearchBox
                value={tq}
                onChange={setTq}
                placeholder={`Search ${trainers.length} trainers…`}
                results={trainerMatches.map((t) => ({
                  key: t.id,
                  node: (
                    <>
                      <span className="flex-1">{t.name || t.id}</span>
                      <span className="text-xs text-muted-foreground">{t.trainerClass} · {t.party.length}</span>
                    </>
                  ),
                  onPick: () => { setTrainer(t); setTMonIdx(0); setTq(""); },
                }))}
              />
              {trainer && (
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                  {trainer.party.map((tm, i) => {
                    const sp = data.speciesById.get(tm.species);
                    return (
                      <button key={i} onClick={() => setTMonIdx(i)}
                        className={cn(
                          "flex shrink-0 flex-col items-center rounded-lg border px-2 py-1 transition-colors",
                          i === tMonIdx ? "border-primary bg-primary/10" : "hover:bg-muted"
                        )}>
                        {sp && <Sprite speciesId={sp.id} size={36} />}
                        <span className="text-[10px] font-medium">{sp?.name ?? `#${tm.species}`}</span>
                        <span className="text-[9px] text-muted-foreground">L{tm.level}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {defender && (
            <div className="mt-2 space-y-2 border-t pt-2">
              <div className="flex items-center gap-2">
                <Sprite speciesId={defender.species.id} size={40} />
                <div className="flex gap-1">{defender.types.map((t) => <TypeBadge key={t} type={t} />)}</div>
              </div>
              <StatLine stats={defender.stats} />
              <Stepper label="Defense boost" value={defBoost} onChange={setDefBoost} />
            </div>
          )}
        </section>
      </div>

      {/* Results */}
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-2.5 text-sm font-semibold">
          {defender ? `${atkMon?.displayName} → ${defenderLabel}` : "Pick a defender to see damage"}
        </div>
        {results.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {defender ? "This mon has no damaging moves." : "No results yet."}
          </p>
        ) : (
          <div className="divide-y">
            {results.map((r) => (
              <div key={r.move.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <TypeBadge type={r.move.type} className="px-1.5 py-0 text-[10px]" />
                <span className="font-medium">{r.move.name}</span>
                <span className="text-xs text-muted-foreground">
                  {r.move.category} {r.move.power}{r.stab && " · STAB"}
                </span>
                <div className="ml-auto flex items-center gap-3">
                  <span className={cn(
                    "text-xs font-medium",
                    r.effectiveness === 0 && "text-muted-foreground",
                    r.effectiveness > 1 && "text-emerald-500",
                    r.effectiveness < 1 && r.effectiveness > 0 && "text-orange-500"
                  )}>
                    {effectivenessLabel(r.effectiveness)}
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums">
                    {r.minPct.toFixed(0)}–{r.maxPct.toFixed(0)}%
                    {r.hitsToKO && r.effectiveness > 0 && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{r.hitsToKO}HKO</span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatLine({ stats }: { stats: BaseStats & { hp: number } }) {
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

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <button className="grid size-7 place-items-center rounded-md border hover:bg-muted disabled:opacity-40"
          onClick={() => onChange(Math.max(-6, value - 1))} disabled={value <= -6} aria-label="decrease">
          <Minus className="size-3.5" />
        </button>
        <span className={cn("w-8 text-center text-sm font-semibold tabular-nums", value > 0 && "text-emerald-500", value < 0 && "text-red-500")}>
          {value > 0 ? `+${value}` : value}
        </span>
        <button className="grid size-7 place-items-center rounded-md border hover:bg-muted disabled:opacity-40"
          onClick={() => onChange(Math.min(6, value + 1))} disabled={value >= 6} aria-label="increase">
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function LabeledInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
  results,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  results: { key: string | number; node: React.ReactNode; onPick: () => void }[];
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
      {results.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {results.map((r) => (
            <button key={r.key} onClick={r.onPick}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
              {r.node}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
