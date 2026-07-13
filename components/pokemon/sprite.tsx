"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { spriteUrl } from "@/lib/pokemon/data";
import { cn } from "@/lib/utils";

export function Sprite({
  speciesId,
  alt,
  size = 64,
  className,
}: {
  speciesId: number;
  alt?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed || !speciesId) {
    return (
      <div
        className={cn("grid place-items-center text-muted-foreground/40", className)}
        style={{ width: size, height: size }}
      >
        <HelpCircle style={{ width: size * 0.5, height: size * 0.5 }} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={spriteUrl(speciesId)}
      alt={alt ?? `#${speciesId}`}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("object-contain [image-rendering:pixelated]", className)}
      style={{ width: size, height: size }}
    />
  );
}
