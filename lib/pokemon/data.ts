// Loads the extracted ROM-hack data (public/data/*.json) in the browser and
// resolves raw save ids into display-ready objects.

import type { DecodedMon } from "@/lib/save";
import { levelFromExp, type GrowthRate } from "@/lib/pokemon/experience";

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface Species {
  id: number;
  key: string;
  name: string;
  natDex: number | null;
  types: string[];
  abilities: (string | null)[];
  abilityList: string[];
  regularAbilities: string[];
  hiddenAbility: string | null;
  baseStats: BaseStats;
  growthRate: string;
  genderFemale: number | null;
  catchRate: number;
  category: string | null;
  height: number;
  weight: number;
  description: string | null;
  evolutions: { method: string; to: number | null; toName: string; requirement: string }[];
  levelUpMoves: { level: number; move: number }[];
  tmMoves: number[];
  isForm: boolean;
  formName: string | null;
  baseSpecies: number | null;
  forms: { id: number; name: string; label: string }[];
}

export interface Move {
  id: number;
  key: string;
  name: string;
  type: string;
  power: number;
  accuracy: number;
  pp: number;
  priority: number;
  category: "Physical" | "Special" | "Status";
}

export interface Nature {
  id: number;
  name: string;
  plus: keyof BaseStats | null;
  minus: keyof BaseStats | null;
}

export interface Meta {
  source: string;
  commit: string;
  version: string;
  generatedAt: string;
  counts: Record<string, number>;
}

export interface GameData {
  meta: Meta;
  species: Species[];
  speciesById: Map<number, Species>;
  moveById: Map<number, Move>;
  abilityById: Map<number, { id: number; name: string; description?: string }>;
  itemById: Map<number, { id: number; name: string }>;
  natures: Nature[];
}

let cache: Promise<GameData> | null = null;

export function loadGameData(): Promise<GameData> {
  if (cache) return cache;
  cache = (async () => {
    const base = (typeof window !== "undefined" && (window as { __BASE_PATH__?: string }).__BASE_PATH__) || "";
    const j = async <T>(f: string): Promise<T> => {
      const res = await fetch(`${base}/data/${f}`);
      if (!res.ok) throw new Error(`Failed to load /data/${f} (${res.status})`);
      return res.json();
    };
    const [meta, species, moves, abilities, items, natures] = await Promise.all([
      j<Meta>("meta.json"),
      j<Species[]>("species.json"),
      j<Record<string, Move>>("moves.json"),
      j<Record<string, { id: number; name: string; description?: string }>>("abilities.json"),
      j<Record<string, { id: number; name: string }>>("items.json"),
      j<Nature[]>("natures.json"),
    ]);
    const speciesById = new Map(species.map((s) => [s.id, s]));
    const moveById = new Map(Object.values(moves).map((m) => [m.id, m]));
    const abilityById = new Map(Object.values(abilities).map((a) => [a.id, a]));
    const itemById = new Map(Object.values(items).map((i) => [i.id, i]));
    return { meta, species, speciesById, moveById, abilityById, itemById, natures };
  })();
  return cache;
}

export interface ResolvedMon {
  raw: DecodedMon;
  species?: Species;
  displayName: string;
  speciesName: string;
  level: number;
  nature: Nature;
  ability: string;
  item?: string;
  moves: (Move | undefined)[];
  types: string[];
  isShiny: boolean;
  isEgg: boolean;
}

export function resolveMon(m: DecodedMon, d: GameData): ResolvedMon {
  const species = d.speciesById.get(m.species);
  const level =
    m.level ??
    (species
      ? levelFromExp(species.growthRate as GrowthRate, m.experience)
      : 1);
  const nature = d.natures[m.nature] ?? d.natures[0];
  const ability =
    species?.abilities[m.abilityNum] ?? species?.abilities.find(Boolean) ?? "—";
  const speciesName = species?.name ?? `#${m.species}`;
  const nick = m.nickname?.trim();
  return {
    raw: m,
    species,
    speciesName,
    displayName: nick && nick.toUpperCase() !== speciesName.toUpperCase() ? nick : speciesName,
    level,
    nature,
    ability: ability ?? "—",
    item: m.heldItem ? d.itemById.get(m.heldItem)?.name ?? `Item #${m.heldItem}` : undefined,
    moves: m.moves.filter((id) => id > 0).map((id) => d.moveById.get(id)),
    types: species?.types ?? [],
    isShiny: m.isShiny,
    isEgg: m.isEgg,
  };
}

export function spriteUrl(speciesId: number): string {
  return `/sprites/${speciesId}.png`;
}

/** Look up an ability's display name + description by its ability id. */
export function abilityInfo(d: GameData, abilityId: number | null | undefined) {
  if (abilityId == null) return undefined;
  return d.abilityById.get(abilityId);
}

// --- Trainers (loaded lazily; only the calculator needs them) ---------------

export interface TrainerMon {
  species: number;
  level: number;
  ability: number | null;
  item: number | null;
  moves: number[];
  nature: number;
  shiny: boolean;
}

export interface Trainer {
  id: string;
  name: string;
  trainerClass: string;
  pic: string;
  double: boolean;
  ai: string[];
  party: TrainerMon[];
}

let trainerCache: Promise<Trainer[]> | null = null;
export function loadTrainers(): Promise<Trainer[]> {
  if (trainerCache) return trainerCache;
  trainerCache = fetch("/data/trainers.json").then((r) => {
    if (!r.ok) throw new Error(`Failed to load trainers.json (${r.status})`);
    return r.json();
  });
  return trainerCache;
}

export function natureLabel(n: Nature): string {
  if (!n.plus || !n.minus) return `${n.name} (neutral)`;
  const S: Record<string, string> = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
  return `${n.name} (+${S[n.plus]} −${S[n.minus]})`;
}
