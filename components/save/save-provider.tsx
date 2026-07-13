"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loadGameData, type GameData } from "@/lib/pokemon/data";
import type { ParsedSave, DecodedMon } from "@/lib/save";

const STORAGE_KEY = "emeralddex.save.v1";

interface SaveContextValue {
  data: GameData | null;
  dataError: string | null;
  save: ParsedSave | null;
  setSave: (s: ParsedSave | null) => void;
}

const SaveContext = createContext<SaveContextValue | null>(null);

export function SaveProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<GameData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [save, setSaveState] = useState<ParsedSave | null>(null);

  useEffect(() => {
    loadGameData().then(setData).catch((e) => setDataError(String(e)));
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSaveState(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const setSave = useCallback((s: ParsedSave | null) => {
    setSaveState(s);
    try {
      if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ data, dataError, save, setSave }), [data, dataError, save, setSave]);
  return <SaveContext.Provider value={value}>{children}</SaveContext.Provider>;
}

export function useSave(): SaveContextValue {
  const ctx = useContext(SaveContext);
  if (!ctx) throw new Error("useSave must be used within SaveProvider");
  return ctx;
}

/** All mons in the save (party first, then boxes) as a flat list. */
export function allMons(save: ParsedSave): DecodedMon[] {
  return [...save.party, ...save.boxes.flat()];
}

/** Randomizer overlay: what each owned species actually rolled in this save. */
export interface OwnedInfo {
  species: number;
  count: number;
  abilityNums: Set<number>;
  natures: Set<number>;
  moves: Set<number>;
}

export function buildOwnedOverlay(save: ParsedSave | null): Map<number, OwnedInfo> {
  const map = new Map<number, OwnedInfo>();
  if (!save) return map;
  for (const m of allMons(save)) {
    if (!m.species) continue;
    let info = map.get(m.species);
    if (!info) {
      info = { species: m.species, count: 0, abilityNums: new Set(), natures: new Set(), moves: new Set() };
      map.set(m.species, info);
    }
    info.count++;
    info.abilityNums.add(m.abilityNum);
    info.natures.add(m.nature);
    for (const mv of m.moves) if (mv > 0) info.moves.add(mv);
  }
  return map;
}
