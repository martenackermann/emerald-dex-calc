"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboOption {
  value: string | number;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

export function Combobox({
  value,
  options,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  className,
  limit = 60,
}: {
  value: string | number | null;
  options: ComboOption[];
  onChange: (value: string | number) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  limit?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const current = options.find((o) => o.value === value);
  const query = q.trim().toLowerCase();
  const filtered = (query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options).slice(0, limit);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQ(""); }}
        className="flex h-9 w-full items-center gap-1.5 rounded-md border bg-background px-2 text-sm"
      >
        {current?.icon}
        <span className={cn("flex-1 truncate text-left", !current && "text-muted-foreground")}>
          {current?.label ?? placeholder}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
          <div className="flex items-center gap-1 border-b px-2">
            <Search className="size-3.5 opacity-50" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted",
                  o.value === value && "bg-primary/10"
                )}
              >
                {o.icon}
                <span className="flex-1 truncate">{o.label}</span>
                {o.sublabel && <span className="shrink-0 text-xs text-muted-foreground">{o.sublabel}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
