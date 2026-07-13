"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TypeBadge } from "@/components/pokemon/type-badge";
import { StatBars } from "@/components/pokemon/stat-bar";
import { Sprite } from "@/components/pokemon/sprite";
import type { GameData, Species } from "@/lib/pokemon/data";
import type { OwnedInfo } from "@/components/save/save-provider";
import { cn } from "@/lib/utils";

export function SpeciesDialog({
  species,
  data,
  owned,
  onClose,
  onSelectSpecies,
}: {
  species: Species | null;
  data: GameData;
  owned?: Map<number, OwnedInfo>;
  onClose: () => void;
  onSelectSpecies: (id: number) => void;
}) {
  return (
    <Dialog open={!!species} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-hidden p-0 sm:max-w-xl">
        {species && (
          <SpeciesDialogBody
            species={species}
            data={data}
            ownedInfo={owned?.get(species.id)}
            onSelectSpecies={onSelectSpecies}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SpeciesDialogBody({
  species,
  data,
  ownedInfo,
  onSelectSpecies,
}: {
  species: Species;
  data: GameData;
  ownedInfo?: OwnedInfo;
  onSelectSpecies: (id: number) => void;
}) {
  const abilityDesc = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of data.abilityById.values()) if (a.description) m.set(a.name, a.description);
    return m;
  }, [data]);

  const preEvos = useMemo(
    () => data.species.filter((s) => s.evolutions.some((e) => e.to === species.id)),
    [data, species.id]
  );

  return (
    <>
      {/* Header */}
      <DialogHeader className="space-y-0 border-b bg-gradient-to-b from-muted/60 to-transparent p-4">
        <div className="flex items-center gap-4">
          <div className="shrink-0 rounded-xl bg-background/60 p-1 ring-1 ring-border">
            <Sprite speciesId={species.id} alt={species.name} size={80} />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-xs text-muted-foreground">
              #{String(species.natDex ?? species.id).padStart(4, "0")}
            </div>
            <DialogTitle className="truncate text-xl">{species.name}</DialogTitle>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {species.types.map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </div>
            {species.category && (
              <div className="mt-1 text-xs text-muted-foreground">The {species.category} Pokémon</div>
            )}
          </div>
        </div>
      </DialogHeader>

      <Tabs defaultValue="info" className="gap-0">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-3">
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="moves">Moves ({species.learnset.length})</TabsTrigger>
          <TabsTrigger value="evo">Evolutions</TabsTrigger>
        </TabsList>

        <div className="max-h-[52vh] overflow-y-auto p-4">
          {/* INFO */}
          <TabsContent value="info" className="mt-0 space-y-4">
            {species.description && (
              <p className="text-sm text-muted-foreground">{species.description}</p>
            )}
            <Abilities species={species} abilityDesc={abilityDesc} />
            <div>
              <h3 className="mb-2 text-sm font-semibold">Base stats</h3>
              <StatBars stats={species.baseStats} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Fact label="Height" value={`${(species.height / 10).toFixed(1)} m`} />
              <Fact label="Weight" value={`${(species.weight / 10).toFixed(1)} kg`} />
              <Fact label="Growth" value={species.growthRate} />
              <Fact
                label="Gender"
                value={species.genderFemale == null ? "Genderless" : `${100 - species.genderFemale}% ♂`}
              />
              <Fact label="Catch rate" value={String(species.catchRate)} />
            </div>
            {ownedInfo && <RandomizerPanel species={species} info={ownedInfo} data={data} />}
          </TabsContent>

          {/* MOVES */}
          <TabsContent value="moves" className="mt-0">
            <div className="overflow-hidden rounded-lg border">
              {species.learnset.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">No learnset data.</div>
              )}
              {species.learnset.map((id, i) => {
                const mv = data.moveById.get(id);
                if (!mv) return null;
                return (
                  <div
                    key={id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 text-sm",
                      i % 2 === 0 && "bg-muted/30"
                    )}
                  >
                    <span className="min-w-36 flex-1 truncate font-medium">{mv.name}</span>
                    <TypeBadge type={mv.type} className="px-1.5 py-0 text-[10px]" />
                    <span className="w-16 text-right text-xs text-muted-foreground">{mv.category}</span>
                    <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                      {mv.power || "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* EVOLUTIONS */}
          <TabsContent value="evo" className="mt-0 space-y-4">
            {preEvos.length === 0 && species.evolutions.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {species.name} does not evolve.
              </div>
            )}
            {preEvos.map((pre) => {
              const via = pre.evolutions.find((e) => e.to === species.id);
              return (
                <EvoRow
                  key={`pre-${pre.id}`}
                  from={pre}
                  to={species}
                  requirement={via?.requirement ?? ""}
                  onSelect={onSelectSpecies}
                />
              );
            })}
            {species.evolutions.map((e, i) =>
              e.to != null ? (
                <EvoRow
                  key={`evo-${i}`}
                  from={species}
                  to={data.speciesById.get(e.to) ?? { id: e.to, name: e.toName } as Species}
                  requirement={e.requirement}
                  onSelect={onSelectSpecies}
                />
              ) : null
            )}
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}

function Abilities({
  species,
  abilityDesc,
}: {
  species: Species;
  abilityDesc: Map<string, string>;
}) {
  const all = [
    ...species.regularAbilities.map((name) => ({ name, hidden: false })),
    ...(species.hiddenAbility ? [{ name: species.hiddenAbility, hidden: true }] : []),
  ];
  const [sel, setSel] = useState(0);
  useEffect(() => setSel(0), [species.id]);
  const active = all[sel];

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Abilities</h3>
      <div className="flex flex-wrap gap-1.5">
        {all.map((a, i) => (
          <button
            key={a.name + i}
            onClick={() => setSel(i)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              i === sel
                ? a.hidden
                  ? "border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "border-primary bg-primary/10 text-primary"
                : a.hidden
                ? "border-amber-500/40 text-amber-600/90 hover:bg-amber-500/10 dark:text-amber-400/90"
                : "hover:bg-muted"
            )}
          >
            {a.name}
            {a.hidden && <span className="ml-1 opacity-70">✦ Hidden</span>}
          </button>
        ))}
      </div>
      {active && (
        <p className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {abilityDesc.get(active.name) ?? "No description available."}
        </p>
      )}
    </div>
  );
}

function EvoRow({
  from,
  to,
  requirement,
  onSelect,
}: {
  from: Species;
  to: Species;
  requirement: string;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card p-2">
      <EvoMon s={from} onSelect={onSelect} />
      <div className="flex flex-1 flex-col items-center text-center">
        <ArrowRight className="size-4 text-muted-foreground" />
        <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{requirement}</span>
      </div>
      <EvoMon s={to} onSelect={onSelect} />
    </div>
  );
}

function EvoMon({ s, onSelect }: { s: Species; onSelect: (id: number) => void }) {
  return (
    <button
      onClick={() => onSelect(s.id)}
      className="flex w-20 shrink-0 flex-col items-center rounded-md p-1 transition-colors hover:bg-muted"
    >
      <Sprite speciesId={s.id} alt={s.name} size={48} />
      <span className="mt-0.5 truncate text-xs font-medium">{s.name}</span>
    </button>
  );
}

function RandomizerPanel({
  species,
  info,
  data,
}: {
  species: Species;
  info: OwnedInfo;
  data: GameData;
}) {
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-primary">
        <Sparkles className="size-4" /> Randomizer analysis — from your save (×{info.count})
      </div>
      <div className="space-y-1.5 text-sm">
        <Fact
          label="Ability rolled"
          value={[...info.abilityNums].map((n) => species.abilities[n]).filter(Boolean).join(", ") || "—"}
        />
        <Fact
          label="Natures seen"
          value={[...info.natures].map((n) => data.natures[n]?.name).filter(Boolean).join(", ") || "—"}
        />
        <Fact
          label="Moves seen"
          value={[...info.moves].map((m) => data.moveById.get(m)?.name).filter(Boolean).join(", ") || "—"}
        />
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
