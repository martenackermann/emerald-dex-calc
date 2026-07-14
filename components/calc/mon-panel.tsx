"use client";

import { useMemo } from "react";
import { Minus, Plus } from "lucide-react";
import { Combobox } from "@/components/calc/combobox";
import { Sprite } from "@/components/pokemon/sprite";
import { TypeBadge } from "@/components/pokemon/type-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GameData } from "@/lib/pokemon/data";
import { natureLabel } from "@/lib/pokemon/data";
import { toCombatant, speciesMovepool, defaultCalcMon, type CalcMon } from "@/lib/calc/mon";
import type { Stats6, Status } from "@/lib/calc/damage";
import { cn } from "@/lib/utils";

const STATS: (keyof Stats6)[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const BOOSTS: (keyof Stats6)[] = ["atk", "def", "spa", "spd", "spe"];
const SLABEL: Record<keyof Stats6, string> = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
const STATUSES: { value: Status; label: string }[] = [
  { value: "healthy", label: "Healthy" },
  { value: "brn", label: "Burned" },
  { value: "psn", label: "Poisoned" },
  { value: "tox", label: "Badly Poisoned" },
  { value: "par", label: "Paralyzed" },
  { value: "slp", label: "Asleep" },
  { value: "frz", label: "Frozen" },
];

export function MonPanel({
  data,
  mon,
  onChange,
  label,
  accent,
  quickFill,
}: {
  data: GameData;
  mon: CalcMon;
  onChange: (m: CalcMon) => void;
  label: string;
  accent: string;
  quickFill?: React.ReactNode;
}) {
  const species = data.speciesById.get(mon.speciesId);
  const set = (p: Partial<CalcMon>) => onChange({ ...mon, ...p });
  const setStat = (field: "evs" | "ivs" | "boosts", k: keyof Stats6, v: number) =>
    onChange({ ...mon, [field]: { ...mon[field], [k]: v } });

  const speciesOptions = useMemo(
    () =>
      data.species
        .filter((s) => s.id > 0 && s.name && s.name !== "??????????")
        .map((s) => ({
          value: s.id,
          label: s.name + (s.isForm ? ` (${s.formName})` : ""),
          icon: <Sprite speciesId={s.id} size={22} />,
        })),
    [data]
  );
  const itemOptions = useMemo(
    () => [
      { value: "", label: "No item" },
      ...[...data.itemById.values()].map((i) => ({ value: i.name, label: i.name })),
    ],
    [data]
  );
  const abilityOptions = useMemo(
    () => (species?.abilityList ?? []).map((a) => ({ value: a, label: a })),
    [species]
  );
  const moveOptions = useMemo(() => {
    if (!species) return [];
    return [
      { value: 0, label: "—" },
      ...speciesMovepool(species)
        .map((id) => data.moveById.get(id))
        .filter((m): m is NonNullable<typeof m> => !!m)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => ({ value: m.id, label: m.name, sublabel: m.type })),
    ];
  }, [species, data]);

  const combatant = useMemo(() => toCombatant(data, mon), [data, mon]);
  const evTotal = STATS.reduce((a, k) => a + (mon.evs[k] || 0), 0);

  return (
    <section className="space-y-2.5 rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: accent }}>{label}</span>
        {quickFill}
      </div>

      {/* species + sprite */}
      <div className="flex items-center gap-2">
        <Sprite speciesId={mon.speciesId} size={48} className="shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Combobox
            value={mon.speciesId}
            options={speciesOptions}
            onChange={(v) => onChange({ ...defaultCalcMon(data, Number(v)), level: mon.level })}
            placeholder="Pick a Pokémon"
            searchPlaceholder="Search Pokémon…"
          />
          <div className="flex items-center gap-1.5">
            {species?.types.map((t) => <TypeBadge key={t} type={t} />)}
          </div>
        </div>
      </div>

      {/* level + nature */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Level">
          <input type="number" min={1} max={100} value={mon.level}
            onChange={(e) => set({ level: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
        </Field>
        <Field label="Nature">
          <Select value={String(mon.natureId)} onValueChange={(v) => set({ natureId: Number(v ?? 0) })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-60">
              {data.natures.map((n) => <SelectItem key={n.id} value={String(n.id)}>{natureLabel(n)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* ability + item */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Ability">
          <Combobox value={mon.ability} options={abilityOptions} onChange={(v) => set({ ability: String(v) })} placeholder="Ability" />
        </Field>
        <Field label="Item">
          <Combobox value={mon.item} options={itemOptions} onChange={(v) => set({ item: String(v) })} placeholder="No item" searchPlaceholder="Search items…" />
        </Field>
      </div>

      {/* status + hp */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Status">
          <Select value={mon.status} onValueChange={(v) => set({ status: (v as Status) ?? "healthy" })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label={`Current HP: ${mon.hpPct}%`}>
          <input type="range" min={1} max={100} value={mon.hpPct}
            onChange={(e) => set({ hpPct: Number(e.target.value) })} className="h-9 w-full accent-current" style={{ color: accent }} />
        </Field>
      </div>

      {/* computed stats */}
      {combatant && (
        <div className="grid grid-cols-6 gap-1 text-center text-xs">
          {STATS.map((k) => (
            <div key={k} className="rounded bg-muted/60 py-1">
              <div className="text-[10px] uppercase text-muted-foreground">{SLABEL[k]}</div>
              <div className="font-semibold tabular-nums">{combatant.stats[k]}</div>
            </div>
          ))}
        </div>
      )}

      {/* boosts */}
      <div>
        <div className="mb-1 text-[11px] text-muted-foreground">Stat boosts</div>
        <div className="grid grid-cols-5 gap-1">
          {BOOSTS.map((k) => (
            <div key={k} className="rounded-md border p-1 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">{SLABEL[k]}</div>
              <div className="flex items-center justify-center gap-0.5">
                <button className="grid size-5 place-items-center rounded hover:bg-muted disabled:opacity-30"
                  onClick={() => setStat("boosts", k, Math.max(-6, mon.boosts[k] - 1))} disabled={mon.boosts[k] <= -6}>
                  <Minus className="size-3" />
                </button>
                <span className={cn("w-5 text-center text-xs font-semibold tabular-nums", mon.boosts[k] > 0 && "text-emerald-500", mon.boosts[k] < 0 && "text-red-500")}>
                  {mon.boosts[k] > 0 ? `+${mon.boosts[k]}` : mon.boosts[k]}
                </span>
                <button className="grid size-5 place-items-center rounded hover:bg-muted disabled:opacity-30"
                  onClick={() => setStat("boosts", k, Math.min(6, mon.boosts[k] + 1))} disabled={mon.boosts[k] >= 6}>
                  <Plus className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* EVs / IVs (collapsible) */}
      <details className="rounded-md border px-2 py-1.5 [&_summary]:cursor-pointer">
        <summary className="text-[11px] font-medium text-muted-foreground">EVs / IVs (total EVs: {evTotal})</summary>
        <div className="mt-2 space-y-2">
          <SpreadRow label="EVs" max={252} step={4} values={mon.evs} onChange={(k, v) => setStat("evs", k, v)} />
          <SpreadRow label="IVs" max={31} step={1} values={mon.ivs} onChange={(k, v) => setStat("ivs", k, v)} />
        </div>
      </details>

      {/* moves */}
      <div>
        <div className="mb-1 text-[11px] text-muted-foreground">Moves</div>
        <div className="grid grid-cols-2 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <Combobox
              key={i}
              value={mon.moves[i] ?? 0}
              options={moveOptions}
              onChange={(v) => {
                const moves = [...mon.moves];
                while (moves.length < 4) moves.push(0);
                moves[i] = Number(v);
                set({ moves });
              }}
              placeholder="—"
              searchPlaceholder="Search moves…"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block truncate text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SpreadRow({
  label,
  max,
  step,
  values,
  onChange,
}: {
  label: string;
  max: number;
  step: number;
  values: Stats6;
  onChange: (k: keyof Stats6, v: number) => void;
}) {
  return (
    <div className="grid grid-cols-[2rem_repeat(6,1fr)] items-center gap-1">
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      {STATS.map((k) => (
        <input
          key={k}
          type="number"
          min={0}
          max={max}
          step={step}
          value={values[k]}
          onChange={(e) => onChange(k, Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
          className="h-7 w-full rounded border bg-background px-1 text-center text-xs tabular-nums"
          title={SLABEL[k]}
        />
      ))}
    </div>
  );
}
