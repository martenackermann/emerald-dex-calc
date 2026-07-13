// Canonical type colors + the Gen-style effectiveness chart (used by the calc).

export const TYPE_COLORS: Record<string, string> = {
  Normal: "#9099a1",
  Fire: "#ff9d55",
  Water: "#4d90d5",
  Electric: "#f4d23c",
  Grass: "#63bc5a",
  Ice: "#73cec0",
  Fighting: "#ce4069",
  Poison: "#ab6ac8",
  Ground: "#d97746",
  Flying: "#8fa8dd",
  Psychic: "#f97176",
  Bug: "#90c12c",
  Rock: "#c7b78b",
  Ghost: "#5269ac",
  Dragon: "#0b6dc3",
  Dark: "#5a5366",
  Steel: "#5a8ea1",
  Fairy: "#ec8fe6",
  Stellar: "#40b5a5",
  Mystery: "#9099a1",
};

export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? "#9099a1";
}

/** Readable text color for a given type chip background. */
export function typeTextColor(type: string): string {
  const light = new Set(["Electric", "Ice", "Grass", "Bug", "Fairy", "Rock", "Normal", "Ground"]);
  return light.has(type) ? "#1a1a1a" : "#ffffff";
}
