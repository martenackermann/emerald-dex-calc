"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Field, Weather, Terrain } from "@/lib/calc/damage";
import { cn } from "@/lib/utils";

export function FieldControls({ field, onChange }: { field: Field; onChange: (f: Field) => void }) {
  const set = (p: Partial<Field>) => onChange({ ...field, ...p });
  const Toggle = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
  return (
    <section className="rounded-xl border bg-card p-3">
      <div className="mb-2 text-sm font-semibold">Field conditions</div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={field.weather} onValueChange={(v) => set({ weather: (v as Weather) ?? "none" })}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No weather</SelectItem>
            <SelectItem value="sun">Harsh Sunlight</SelectItem>
            <SelectItem value="rain">Rain</SelectItem>
            <SelectItem value="sand">Sandstorm</SelectItem>
            <SelectItem value="snow">Snow</SelectItem>
          </SelectContent>
        </Select>
        <Select value={field.terrain} onValueChange={(v) => set({ terrain: (v as Terrain) ?? "none" })}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No terrain</SelectItem>
            <SelectItem value="electric">Electric Terrain</SelectItem>
            <SelectItem value="grassy">Grassy Terrain</SelectItem>
            <SelectItem value="psychic">Psychic Terrain</SelectItem>
            <SelectItem value="misty">Misty Terrain</SelectItem>
          </SelectContent>
        </Select>
        <Toggle active={field.reflect} onClick={() => set({ reflect: !field.reflect })}>Reflect</Toggle>
        <Toggle active={field.lightScreen} onClick={() => set({ lightScreen: !field.lightScreen })}>Light Screen</Toggle>
        <Toggle active={field.auroraVeil} onClick={() => set({ auroraVeil: !field.auroraVeil })}>Aurora Veil</Toggle>
        <Toggle active={field.crit} onClick={() => set({ crit: !field.crit })}>Critical hit</Toggle>
      </div>
    </section>
  );
}
