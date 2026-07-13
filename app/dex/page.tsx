"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Dna, SlidersHorizontal, X } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSave, buildOwnedOverlay } from "@/components/save/save-provider";
import { TypeBadge } from "@/components/pokemon/type-badge";
import { Sprite } from "@/components/pokemon/sprite";
import { SpeciesDialog } from "@/components/pokemon/species-dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { typeColor } from "@/lib/pokemon/types-meta";
import type { Species } from "@/lib/pokemon/data";
import { cn } from "@/lib/utils";

const GENS = [
  [1, 151], [152, 251], [252, 386], [387, 493], [494, 649],
  [650, 721], [722, 809], [810, 905], [906, 1025],
];
const bst = (s: Species) =>
  s.baseStats.hp + s.baseStats.atk + s.baseStats.def + s.baseStats.spa + s.baseStats.spd + s.baseStats.spe;

export default function DexPage() {
  const { data, save } = useSave();
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [gen, setGen] = useState("all");
  const [sort, setSort] = useState("dex");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const overlay = useMemo(() => buildOwnedOverlay(save), [save]);
  const allTypes = useMemo(
    () => (data ? [...new Set(data.species.flatMap((s) => s.types))].sort() : []),
    [data]
  );

  const results = useMemo(() => {
    if (!data) return [];
    const query = q.trim().toLowerCase();
    let list = data.species.filter((s) => s.id > 0 && s.name && s.name !== "??????????" && !s.isForm);
    if (ownedOnly) list = list.filter((s) => overlay.has(s.id));
    if (types.size) list = list.filter((s) => s.types.some((t) => types.has(t)));
    if (gen !== "all") {
      const [lo, hi] = GENS[Number(gen) - 1];
      list = list.filter((s) => s.natDex != null && s.natDex >= lo && s.natDex <= hi);
    }
    if (query) {
      list = list.filter(
        (s) => s.name.toLowerCase().includes(query) || String(s.natDex ?? s.id) === query
      );
    }
    list = [...list];
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "bst") list.sort((a, b) => bst(b) - bst(a));
    else list.sort((a, b) => (a.natDex ?? a.id) - (b.natDex ?? b.id));
    return list;
  }, [data, q, types, gen, sort, ownedOnly, overlay]);

  if (!data) {
    return <div className="py-10 text-center text-muted-foreground">Loading dex…</div>;
  }

  const selected = selectedId != null ? data.speciesById.get(selectedId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pokédex</h1>
          <p className="text-sm text-muted-foreground">
            {results.length} of {data.meta.counts.species} · {data.meta.source} {data.meta.version}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or #dex" className="pl-8" />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
            <SlidersHorizontal className="size-4" />
            Type{types.size > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5">{types.size}</Badge>}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
            {allTypes.map((t) => (
              <DropdownMenuCheckboxItem
                key={t}
                checked={types.has(t)}
                onCheckedChange={(c) =>
                  setTypes((prev) => {
                    const n = new Set(prev);
                    if (c) n.add(t);
                    else n.delete(t);
                    return n;
                  })
                }
                onSelect={(e) => e.preventDefault()}
              >
                <span className="mr-2 inline-block size-3 rounded-full" style={{ backgroundColor: typeColor(t) }} />
                {t}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Select value={gen} onValueChange={(v) => setGen(v ?? "all")}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Gen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All gens</SelectItem>
            {GENS.map((_, i) => (
              <SelectItem key={i} value={String(i + 1)}>Gen {i + 1}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v ?? "dex")}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dex">Dex #</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="bst">Base total</SelectItem>
          </SelectContent>
        </Select>

        {save && (
          <Button
            variant={ownedOnly ? "default" : "outline"}
            onClick={() => setOwnedOnly((v) => !v)}
          >
            Owned only
          </Button>
        )}
        {(types.size > 0 || gen !== "all" || q || ownedOnly) && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear filters"
            onClick={() => { setTypes(new Set()); setGen("all"); setQ(""); setOwnedOnly(false); }}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {save && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <Dna className="size-4 text-primary" />
          Randomizer analysis active — owned species show the natures, abilities & moves rolled in your save.
        </div>
      )}

      <DexGrid species={results} overlay={overlay} onSelect={setSelectedId} />

      <SpeciesDialog
        species={selected}
        data={data}
        owned={overlay}
        onClose={() => setSelectedId(null)}
        onSelectSpecies={(id) => setSelectedId(id)}
      />
    </div>
  );
}

const ROW_HEIGHT = 182;
const MIN_CARD = 148;

function DexGrid({
  species,
  overlay,
  onSelect,
}: {
  species: Species[];
  overlay: Map<number, unknown>;
  onSelect: (id: number) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(4);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => setCols(Math.max(2, Math.floor(el.clientWidth / MIN_CARD)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowCount = Math.ceil(species.length / cols);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

  if (species.length === 0) {
    return <p className="py-16 text-center text-muted-foreground">No Pokémon match your filters.</p>;
  }

  return (
    <div
      ref={parentRef}
      className="overflow-y-auto rounded-xl"
      style={{ height: "calc(100vh - 260px)", minHeight: 360 }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {virtualizer.getVirtualItems().map((vRow) => {
          const start = vRow.index * cols;
          const rowItems = species.slice(start, start + cols);
          return (
            <div
              key={vRow.key}
              className="absolute left-0 top-0 grid w-full gap-2.5 px-0.5"
              style={{
                transform: `translateY(${vRow.start}px)`,
                height: ROW_HEIGHT,
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              }}
            >
              {rowItems.map((s) => (
                <DexCard key={s.id} s={s} owned={overlay.has(s.id)} onSelect={onSelect} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DexCard({ s, owned, onSelect }: { s: Species; owned: boolean; onSelect: (id: number) => void }) {
  return (
    <button
      onClick={() => onSelect(s.id)}
      className="group flex h-[168px] flex-col items-center rounded-xl border bg-card p-2 text-center transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md"
    >
      <div className="flex w-full items-center justify-between px-1">
        <span className="font-mono text-[10px] text-muted-foreground">
          #{String(s.natDex ?? s.id).padStart(4, "0")}
        </span>
        {owned && <Badge variant="secondary" className="h-4 px-1 text-[9px]">owned</Badge>}
      </div>
      <Sprite speciesId={s.id} alt={s.name} size={72} className="my-0.5" />
      <div className="w-full truncate text-sm font-semibold">{s.name}</div>
      <div className="mt-0.5 flex flex-wrap justify-center gap-1">
        {s.types.map((t) => (
          <TypeBadge key={t} type={t} className="px-1.5 py-0 text-[9px]" />
        ))}
      </div>
      <div className="mt-auto w-full truncate pt-1 text-[11px] text-muted-foreground">
        {s.abilityList[0] ?? "—"}
        {s.hiddenAbility && <span className="text-amber-500"> · {s.hiddenAbility} ✦</span>}
      </div>
    </button>
  );
}
