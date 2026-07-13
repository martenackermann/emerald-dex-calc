"use client";

import { useMemo, useState } from "react";
import { Search, Dna } from "lucide-react";
import { useSave, buildOwnedOverlay } from "@/components/save/save-provider";
import { TypeBadge } from "@/components/pokemon/type-badge";
import { StatBars } from "@/components/pokemon/stat-bar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Species } from "@/lib/pokemon/data";
import { cn } from "@/lib/utils";

const CAP = 300;

export default function DexPage() {
  const { data, save } = useSave();
  const [q, setQ] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [selected, setSelected] = useState<Species | null>(null);

  const overlay = useMemo(() => buildOwnedOverlay(save), [save]);

  const results = useMemo(() => {
    if (!data) return [];
    const query = q.trim().toLowerCase();
    let list = data.species.filter((s) => s.id > 0 && s.name && s.name !== "??????????");
    if (ownedOnly) list = list.filter((s) => overlay.has(s.id));
    if (query) {
      list = list.filter(
        (s) => s.name.toLowerCase().includes(query) || String(s.natDex ?? s.id) === query
      );
    }
    return list;
  }, [data, q, ownedOnly, overlay]);

  if (!data) {
    return <div className="py-10 text-center text-muted-foreground">Loading dex…</div>;
  }

  const shown = results.slice(0, CAP);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pokédex</h1>
          <p className="text-sm text-muted-foreground">
            {data.meta.counts.species} species · from {data.meta.source} {data.meta.version}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {save && (
            <button
              onClick={() => setOwnedOnly((v) => !v)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                ownedOnly ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
              )}
            >
              Owned only
            </button>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or #dex"
              className="w-56 pl-8"
            />
          </div>
        </div>
      </div>

      {save && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <Dna className="size-4 text-primary" />
          Randomizer analysis active — species you own show the natures, abilities & moves rolled in your save.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {shown.map((s) => {
          const owned = overlay.get(s.id);
          return (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="group rounded-xl border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">
                  #{String(s.natDex ?? s.id).padStart(4, "0")}
                </span>
                {owned && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    ×{owned.count}
                  </Badge>
                )}
              </div>
              <div className="mt-1 truncate font-semibold">{s.name}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {s.types.map((t) => (
                  <TypeBadge key={t} type={t} className="px-1.5 py-0 text-[10px]" />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {results.length > CAP && (
        <p className="text-center text-sm text-muted-foreground">
          Showing {CAP} of {results.length}. Refine your search to narrow results.
        </p>
      )}
      {results.length === 0 && (
        <p className="py-10 text-center text-muted-foreground">No Pokémon match “{q}”.</p>
      )}

      <SpeciesDialog species={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function SpeciesDialog({ species, onClose }: { species: Species | null; onClose: () => void }) {
  const { data, save } = useSave();
  const overlay = useMemo(() => buildOwnedOverlay(save), [save]);
  if (!data) return null;
  const owned = species ? overlay.get(species.id) : undefined;

  return (
    <Dialog open={!!species} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {species && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">
                  #{String(species.natDex ?? species.id).padStart(4, "0")}
                </span>
                {species.name}
              </DialogTitle>
              <DialogDescription>
                {species.category ? `The ${species.category} Pokémon · ` : ""}
                {species.growthRate} growth
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {species.types.map((t) => (
                  <TypeBadge key={t} type={t} />
                ))}
              </div>

              {species.description && (
                <p className="text-sm text-muted-foreground">{species.description}</p>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold">Base stats</h3>
                <StatBars stats={species.baseStats} />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Abilities" value={species.abilityList.join(", ") || "—"} />
                <Field
                  label="Height / Weight"
                  value={`${(species.height / 10).toFixed(1)} m · ${(species.weight / 10).toFixed(1)} kg`}
                />
              </div>

              {species.evolutions.length > 0 && (
                <Field
                  label="Evolves into"
                  value={species.evolutions.map((e) => `${e.toName} (${e.method} ${e.param})`).join(", ")}
                />
              )}

              {owned && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-primary">
                    <Dna className="size-4" /> Randomizer analysis — from your save (×{owned.count})
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <Field
                      label="Ability rolled"
                      value={
                        [...owned.abilityNums]
                          .map((n) => species.abilities[n])
                          .filter(Boolean)
                          .join(", ") || "—"
                      }
                    />
                    <Field
                      label="Natures seen"
                      value={[...owned.natures].map((n) => data.natures[n]?.name).filter(Boolean).join(", ")}
                    />
                    <Field
                      label="Moves seen"
                      value={
                        [...owned.moves]
                          .map((m) => data.moveById.get(m)?.name)
                          .filter(Boolean)
                          .join(", ") || "—"
                      }
                    />
                  </div>
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold">
                  Learnset <span className="text-muted-foreground">({species.learnset.length})</span>
                </h3>
                <div className="flex flex-wrap gap-1">
                  {species.learnset.map((id) => {
                    const mv = data.moveById.get(id);
                    return (
                      <span key={id} className="rounded bg-muted px-1.5 py-0.5 text-xs" title={mv?.type}>
                        {mv?.name ?? `#${id}`}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
