"use client";

import { useMemo, useState } from "react";
import { Trash2, Package, Users } from "lucide-react";
import { useSave } from "@/components/save/save-provider";
import { SaveDropzone } from "@/components/save/save-dropzone";
import { MonCard } from "@/components/pokemon/mon-card";
import { resolveMon } from "@/lib/pokemon/data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function TeamPage() {
  const { data, dataError, save, setSave } = useSave();
  const [box, setBox] = useState(0);

  const party = useMemo(
    () => (save && data ? save.party.map((m) => resolveMon(m, data)) : []),
    [save, data]
  );
  const boxMons = useMemo(
    () => (save && data ? save.boxes[box].map((m) => resolveMon(m, data)) : []),
    [save, data, box]
  );

  if (dataError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
        Failed to load ROM-hack data: {dataError}
        <div className="mt-1 text-muted-foreground">Run <code>npm run extract</code> to generate <code>public/data</code>.</div>
      </div>
    );
  }

  if (!save) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Your Team & Boxes</h1>
          <p className="mt-2 text-muted-foreground">
            Load an Emerald save to read your party, PC boxes, natures, IVs, items and moves.
          </p>
        </div>
        <SaveDropzone />
      </div>
    );
  }

  const totalBox = save.boxes.reduce((a, b) => a + b.length, 0);

  return (
    <div className="space-y-8">
      {/* Trainer summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Trainer</div>
          <div className="text-xl font-bold">{save.trainer.name || "—"}</div>
          <div className="text-sm text-muted-foreground">
            ID {String(save.trainer.publicId).padStart(5, "0")} · {save.party.length} in party · {totalBox} in boxes
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SaveDropzone compact />
          <Button variant="outline" size="sm" onClick={() => setSave(null)}>
            <Trash2 className="size-4" /> Clear
          </Button>
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
          {save.boxes.map((b, i) => (
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
