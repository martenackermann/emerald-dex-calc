import { typeColor, typeTextColor } from "@/lib/pokemon/types-meta";
import { cn } from "@/lib/utils";

export function TypeBadge({ type, className }: { type: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide shadow-sm",
        className
      )}
      style={{ backgroundColor: typeColor(type), color: typeTextColor(type) }}
    >
      {type}
    </span>
  );
}
