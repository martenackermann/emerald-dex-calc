"use client";

import { useEffect, useMemo, useState } from "react";
import { Swords, ArrowRight, ArrowLeft } from "lucide-react";
import { useSave } from "@/components/save/save-provider";
import { Sprite } from "@/components/pokemon/sprite";
import { TypeBadge } from "@/components/pokemon/type-badge";
import { MonPanel } from "@/components/calc/mon-panel";
import { FieldControls } from "@/components/calc/field-controls";
import { Combobox } from "@/components/calc/combobox";
import { resolveMon, loadTrainers, type Trainer } from "@/lib/pokemon/data";
import { buildDemoSave } from "@/lib/pokemon/demo";
import {
  calcMonFromResolved,
  calcMonFromTrainer,
  defaultCalcMon,
  toCombatant,
  type CalcMon,
} from "@/lib/calc/mon";
import { calc, effectivenessLabel, DEFAULT_FIELD, type Field, type DamageResult } from "@/lib/calc/damage";
import { cn } from "@/lib/utils";

export default function CalcPage() {
  const { data, save } = useSave();
  const [attacker, setAttacker] = useState<CalcMon | null>(null);
  const [defender, setDefender] = useState<CalcMon | null>(null);
  const [field, setField] = useState<Field>(DEFAULT_FIELD);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [selTrainer, setSelTrainer] = useState<Trainer | null>(null);

  useEffect(() => {
    loadTrainers().then(setTrainers).catch(() => {});
  }, []);

  const activeSave = useMemo(() => save ?? (data ? buildDemoSave(data) : null), [save, data]);
  const party = useMemo(
    () => (activeSave && data ? activeSave.party.map((m) => resolveMon(m, data)) : []),
    [activeSave, data]
  );

  // seed defaults once
  useEffect(() => {
    if (!data || attacker) return;
    const src = save ?? buildDemoSave(data);
    const lead = src.party[0];
    setAttacker(lead ? calcMonFromResolved(resolveMon(lead, data)) : defaultCalcMon(data, 1));
    setDefender(defaultCalcMon(data, data.speciesById.has(6) ? 6 : 1));
  }, [data, attacker, save]);

  if (!data || !attacker || !defender) {
    return <div className="py-10 text-center text-muted-foreground">Loading…</div>;
  }

  const aC = toCombatant(data, attacker);
  const dC = toCombatant(data, defender);

  const damageOf = (from: CalcMon, atk: typeof aC, def: typeof dC): DamageResult[] => {
    if (!atk || !def) return [];
    return from.moves
      .filter((id) => id > 0)
      .map((id) => data.moveById.get(id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => calc(atk, def, m, from.level, field))
      .filter((r): r is DamageResult => r !== null);
  };
  const aToD = damageOf(attacker, aC, dC);
  const dToA = damageOf(defender, dC, aC);

  const aName = data.speciesById.get(attacker.speciesId)?.name ?? "Attacker";
  const dName = data.speciesById.get(defender.speciesId)?.name ?? "Defender";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
          <Swords className="size-5 text-primary sm:size-6" /> Damage Calculator
        </h1>
        <p className="text-sm text-muted-foreground">
          Full configuration for both Pokémon — natures, abilities, items, EVs/IVs, boosts, status & field.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {/* attacker quick-fill: your team */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
            {party.map((m, i) => (
              <button
                key={i}
                onClick={() => setAttacker(calcMonFromResolved(m))}
                className="flex shrink-0 flex-col items-center rounded-lg border px-1.5 py-1 hover:border-primary/60"
                title={`Load ${m.displayName}`}
              >
                {m.species && <Sprite speciesId={m.species.id} size={30} />}
                <span className="max-w-14 truncate text-[10px]">{m.displayName}</span>
              </button>
            ))}
          </div>
          <MonPanel
            data={data}
            mon={attacker}
            onChange={setAttacker}
            label={save ? "Attacker (your team)" : "Attacker (demo team)"}
            accent="var(--color-primary)"
          />
        </div>

        <div className="space-y-2">
          {/* defender quick-fill: ROM-hack trainers */}
          <div className="space-y-1.5">
            <Combobox
              value={selTrainer?.id ?? null}
              options={trainers.map((t) => ({ value: t.id, label: t.name || t.id, sublabel: `${t.trainerClass} · ${t.party.length}` }))}
              onChange={(v) => {
                const t = trainers.find((x) => x.id === v) ?? null;
                setSelTrainer(t);
                if (t && t.party[0]) setDefender(calcMonFromTrainer(data, t.party[0]));
              }}
              placeholder={`Load a ROM-hack trainer (${trainers.length})`}
              searchPlaceholder="Search trainers…"
            />
            {selTrainer && (
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
                {selTrainer.party.map((tm, i) => {
                  const sp = data.speciesById.get(tm.species);
                  return (
                    <button key={i} onClick={() => setDefender(calcMonFromTrainer(data, tm))}
                      className="flex shrink-0 flex-col items-center rounded-lg border px-1.5 py-1 hover:border-primary/60">
                      {sp && <Sprite speciesId={sp.id} size={30} />}
                      <span className="text-[10px]">{sp?.name ?? `#${tm.species}`} L{tm.level}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <MonPanel data={data} mon={defender} onChange={setDefender} label="Defender" accent="var(--color-primary)" />
        </div>
      </div>

      <FieldControls field={field} onChange={setField} />

      {/* results */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ResultBlock title={aName} sub={dName} dir="atk" results={aToD} defHp={dC?.stats.hp ?? 1} />
        <ResultBlock title={dName} sub={aName} dir="def" results={dToA} defHp={aC?.stats.hp ?? 1} />
      </div>
    </div>
  );
}

function ResultBlock({
  title,
  sub,
  dir,
  results,
  defHp,
}: {
  title: string;
  sub: string;
  dir: "atk" | "def";
  results: DamageResult[];
  defHp: number;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-1.5 border-b px-3 py-2 text-sm font-semibold">
        {dir === "atk" ? <ArrowRight className="size-4 text-primary" /> : <ArrowLeft className="size-4 text-muted-foreground" />}
        {title} <span className="text-muted-foreground">→ {sub}</span>
      </div>
      {results.length === 0 ? (
        <p className="p-4 text-center text-sm text-muted-foreground">No damaging moves.</p>
      ) : (
        <div className="divide-y">
          {results.map((r, i) => (
            <div key={i} className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <TypeBadge type={r.move.type} className="px-1.5 py-0 text-[10px]" />
                <span className="font-medium">{r.move.name}</span>
                <span className="text-xs text-muted-foreground">{r.move.category} {r.move.power}{r.stab && " · STAB"}</span>
                <span className={cn(
                  "ml-auto text-right text-sm font-semibold tabular-nums",
                  r.effectiveness > 1 && "text-emerald-500",
                  r.effectiveness < 1 && r.effectiveness > 0 && "text-orange-500",
                  r.effectiveness === 0 && "text-muted-foreground"
                )}>
                  {r.minPct.toFixed(1)}–{r.maxPct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>{effectivenessLabel(r.effectiveness)} · {r.min}–{r.max} of {defHp} HP</span>
                <span className="font-medium">{r.koText}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
