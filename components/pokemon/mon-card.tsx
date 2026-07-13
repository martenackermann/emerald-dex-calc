"use client";

import { Sparkles, Egg } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TypeBadge } from "@/components/pokemon/type-badge";
import { Sprite } from "@/components/pokemon/sprite";
import { natureLabel, type ResolvedMon } from "@/lib/pokemon/data";
import { cn } from "@/lib/utils";

function ivColor(v: number) {
  if (v === 31) return "text-emerald-500";
  if (v >= 26) return "text-lime-500";
  if (v >= 16) return "text-yellow-500";
  return "text-muted-foreground";
}

export function MonCard({ mon }: { mon: ResolvedMon }) {
  const iv = mon.raw.ivs;
  const ivTotal = iv.hp + iv.atk + iv.def + iv.spa + iv.spd + iv.spe;
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 p-3">
        {mon.species && (
          <div className="shrink-0 rounded-lg bg-background/50 ring-1 ring-border">
            <Sprite speciesId={mon.species.id} alt={mon.speciesName} size={48} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{mon.displayName}</span>
            {mon.isShiny && <Sparkles className="size-3.5 shrink-0 text-yellow-400" />}
            {mon.isEgg && <Egg className="size-3.5 shrink-0 text-muted-foreground" />}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {mon.speciesName} · Lv {mon.level}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {mon.types.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-2 p-3 text-sm">
        <Row label="Nature" value={natureLabel(mon.nature)} />
        <Row label="Ability" value={mon.ability} />
        <Row label="Item" value={mon.item ?? "—"} />
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Moves</div>
          <div className="grid grid-cols-2 gap-1">
            {mon.moves.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
            {mon.moves.map((mv, i) => (
              <span
                key={i}
                className="truncate rounded bg-muted px-2 py-1 text-xs"
                title={mv ? `${mv.type} · ${mv.category} · ${mv.power || "—"} BP` : ""}
              >
                {mv?.name ?? "—"}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>IVs</span>
            <span className="tabular-nums">{ivTotal}/186</span>
          </div>
          <div className="grid grid-cols-6 gap-1 text-center text-xs">
            {(["hp", "atk", "def", "spa", "spd", "spe"] as const).map((k) => (
              <div key={k} className="rounded bg-muted/60 py-1">
                <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
                <div className={cn("font-semibold tabular-nums", ivColor(iv[k]))}>{iv[k]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="truncate text-right text-sm font-medium">{value}</span>
    </div>
  );
}
