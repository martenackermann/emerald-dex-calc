"use client";

import { useMemo, useState } from "react";
import { Trash2, Package, Users, Sparkles } from "lucide-react";
import { useSave } from "@/components/save/save-provider";
import { SaveDropzone } from "@/components/save/save-dropzone";
import { MonCard } from "@/components/pokemon/mon-card";
import { resolveMon } from "@/lib/pokemon/data";
import { buildDemoSave } from "@/lib/pokemon/demo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function TeamPage() {
  const { data, dataError, save, setSave } = useSave();
  const [box, setBox] = useState(0);

  const isDemo = !save;
  const active = useMemo(
    () => save ?? (data ? buildDemoSave(data) : null),
    [save, data]
  );

  const party = useMemo(
    () => (active && data ? active.party.map((m) => resolveMon(m, data)) : []),
    [active, data]
  );
  const boxMons = useMemo(
    () => (active && data ? active.boxes[box].map((m) => resolveMon(m, data)) : []),
    [active, data, box]
  );

  if (dataError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
        Failed to load ROM-hack data: {dataError}
        <div className="mt-1 text-muted-foreground">Run <code>npm run extract</code> to generate <code>public/data</code>.</div>
      </div>
    );
  }

  if (!active) {
    return <div className="py-10 text-center text-muted-foreground">Loading…</div>;
  }

  const totalBox = active.boxes.reduce((a, b) => a + b.length, 0);

  return (
    <div className="space-y-8">
      {/* Trainer summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            Trainer
            {isDemo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Sparkles className="size-3" /> Demo team
              </span>
            )}
          </div>
          <div className="text-xl font-bold">{active.trainer.name || "—"}</div>
          <div className="text-sm text-muted-foreground">
            {isDemo
              ? "Sample team — drop your .sav to load your own party & boxes."
              : `ID ${String(active.trainer.publicId).padStart(5, "0")} · ${active.party.length} in party · ${totalBox} in boxes`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SaveDropzone compact />
          {!isDemo && (
            <Button variant="outline" size="sm" onClick={() => setSave(null)}>
              <Trash2 className="size-4" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Team */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Users className="size-5 text-primary" /> Team
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {party.map((m, i) => (
            <MonCard key={i} mon={m} />
          ))}
        </div>
      </section>

      {/* Boxes */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Package className="size-5 text-primary" /> PC Boxes
        </h2>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {active.boxes.map((b, i) => (
            <button
              key={i}
              onClick={() => setBox(i)}
              className={cn(
                "flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors",
                i === box
                  ? "border-primary bg-primary text-primary-foreground"
                  : b.length > 0
                  ? "border-border bg-card hover:border-primary/60"
                  : "border-border/50 text-muted-foreground/50"
              )}
              title={`Box ${i + 1} · ${b.length} Pokémon`}
            >
              {i + 1}
              {b.length > 0 && <span className="ml-1 text-xs opacity-70">·{b.length}</span>}
            </button>
          ))}
        </div>
        {boxMons.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Box {box + 1} is empty.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {boxMons.map((m, i) => (
              <MonCard key={i} mon={m} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
