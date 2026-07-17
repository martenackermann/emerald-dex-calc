"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { parseSaveFile } from "@/lib/save";
import { useSave } from "@/components/save/save-provider";
import { cn } from "@/lib/utils";

export function SaveDropzone({ compact = false }: { compact?: boolean }) {
  const { setSave } = useSave();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseSaveFile(buf);
      setSave(parsed);
      toast.success(
        `Loaded ${file.name}`,
        { description: `${parsed.party.length} in party · ${parsed.boxes.flat().length} in boxes` }
      );
    } catch (e) {
      toast.error("Could not read save", { description: String(e instanceof Error ? e.message : e) });
    } finally {
      setBusy(false);
    }
  }

  async function loadSample(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await fetch("/sample-expansion.sav");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseSaveFile(await res.arrayBuffer());
      setSave(parsed);
      toast.success("Sample save loaded", {
        description: `${parsed.trainer.name} · ${parsed.party.length} in party · ${parsed.boxes.flat().length} in boxes`,
      });
    } catch (err) {
      toast.error("Could not load sample save", { description: String(err instanceof Error ? err.message : err) });
    } finally {
      setBusy(false);
    }
  }

  const dropArea = (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors",
        compact ? "gap-1 p-4" : "gap-2 p-10",
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/40"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".sav,.sa1,.srm,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {busy ? (
        <Loader2 className={cn("animate-spin text-primary", compact ? "size-5" : "size-8")} />
      ) : (
        <Upload className={cn("text-muted-foreground group-hover:text-primary", compact ? "size-5" : "size-8")} />
      )}
      <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>
        {busy ? "Reading save…" : "Drop your .sav here"}
      </p>
      {!compact && (
        <>
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            Emerald / pokeemerald-expansion save file. Parsed entirely in your browser — nothing is uploaded.
          </p>
          <button
            onClick={loadSample}
            className="mt-1 flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:border-primary/60 hover:bg-primary/5"
          >
            <FlaskConical className="size-4 text-primary" /> Load sample save (simulated ROM-hack data)
          </button>
        </>
      )}
    </div>
  );

  if (!compact) return dropArea;
  return (
    <div className="flex items-center gap-1.5">
      {dropArea}
      <button
        onClick={loadSample}
        title="Load sample save (simulated ROM-hack data)"
        className="grid size-9 shrink-0 place-items-center rounded-md border hover:border-primary/60 hover:bg-primary/5"
      >
        <FlaskConical className="size-4 text-primary" />
      </button>
    </div>
  );
}
