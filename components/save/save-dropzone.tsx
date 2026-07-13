"use client";

import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
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

  return (
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
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Emerald / pokeemerald-expansion save file. Parsed entirely in your browser — nothing is uploaded.
        </p>
      )}
    </div>
  );
}
