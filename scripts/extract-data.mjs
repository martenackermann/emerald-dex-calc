// Extracts game data from a pokeemerald-expansion checkout into JSON the web app
// consumes. This makes the dex/calculator reflect EVERY data change in the ROM hack:
// the decomp source is the single source of truth.
//
// Usage:  ROMHACK_PATH=/path/to/pokeemerald-expansion node scripts/extract-data.mjs
// Default ROMHACK_PATH: ../pokeemerald-expansion relative to this repo.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");
const ROM =
  process.env.ROMHACK_PATH ??
  resolve(APP_ROOT, "..", "pokeemerald-expansion");
const OUT = join(APP_ROOT, "public", "data");

if (!existsSync(join(ROM, "include", "constants", "species.h"))) {
  console.error(
    `\n[extract] Could not find a pokeemerald-expansion checkout at:\n  ${ROM}\n` +
      `Set ROMHACK_PATH to the repo root and re-run.\n`
  );
  process.exit(1);
}

const read = (p) => readFileSync(join(ROM, p), "utf8");
const readOpt = (p) => (existsSync(join(ROM, p)) ? read(p) : "");

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Prettify a C constant like ABILITY_SOLAR_POWER / TYPE_GRASS -> "Solar Power" / "Grass". */
function prettify(constant, prefix) {
  let s = constant;
  if (prefix && s.startsWith(prefix)) s = s.slice(prefix.length);
  s = s.replace(/^_+/, "").toLowerCase().replace(/_/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse a C enum (comma-style, e.g. `SPECIES_BULBASAUR = 1,`) into a
 * { nameToId, idToName } pair. Handles explicit numbers, hex, aliases to a
 * previously-defined name, and `NAME = OTHER + n` arithmetic. Implicit entries
 * increment the running counter. The first name assigned to an id wins for
 * idToName (so canonical species beat later form aliases).
 */
function parseEnum(text) {
  const nameToId = new Map();
  const idToName = new Map();
  // Grab the largest enum body in the file. Handles typed/attributed decls like
  // `enum __attribute__((packed)) Species {`. Enum bodies contain no `}` until the
  // closing brace, so a non-greedy match to the first `};` is safe.
  const bodies = [...text.matchAll(/enum\b[^{;]*\{([\s\S]*?)\}\s*;/g)].map(
    (m) => m[1]
  );
  const body = bodies.sort((a, b) => b.length - a.length)[0] ?? "";
  let counter = 0;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (!line) continue;
    for (const entry of line.split(",")) {
      const e = entry.trim();
      if (!e) continue;
      const m = e.match(/^([A-Za-z_]\w*)\s*(?:=\s*(.+))?$/);
      if (!m) continue;
      const name = m[1];
      const expr = m[2]?.trim();
      let value;
      if (expr === undefined) {
        value = counter;
      } else if (/^0x[0-9a-fA-F]+$/.test(expr)) {
        value = parseInt(expr, 16);
      } else if (/^\d+$/.test(expr)) {
        value = parseInt(expr, 10);
      } else {
        // alias or arithmetic against known names/numbers
        const am = expr.match(/^([A-Za-z_]\w*)\s*(?:([+-])\s*(\d+))?$/);
        if (am && nameToId.has(am[1])) {
          value = nameToId.get(am[1]);
          if (am[2]) value += (am[2] === "+" ? 1 : -1) * parseInt(am[3], 10);
        } else {
          // unresolved expression; skip but keep counter sane
          value = counter;
        }
      }
      nameToId.set(name, value);
      if (!idToName.has(value)) idToName.set(value, name);
      counter = value + 1;
    }
  }
  return { nameToId, idToName };
}

/** Split a C designated-initializer table into `[KEY] = { ...block... }` blocks. */
function splitBlocks(text, keyPrefix) {
  const blocks = [];
  const re = new RegExp(`\\[(${keyPrefix}\\w+)\\]\\s*=\\s*\\{`, "g");
  let m;
  while ((m = re.exec(text))) {
    const key = m[1];
    let i = re.lastIndex; // just after the opening brace
    let depth = 1;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    blocks.push({ key, body: text.slice(re.lastIndex, i - 1) });
  }
  return blocks;
}

// Object-like #define map, so stat values written as macros (e.g.
// `.baseSpAttack = CHARIZARD_SP_ATK`) can be resolved to numbers.
const defines = new Map();
function collectDefines(text) {
  for (const m of text.matchAll(/^\s*#define\s+([A-Za-z_]\w*)\s+(.+?)\s*$/gm)) {
    defines.set(m[1], m[2].trim());
  }
}
collectDefines(read("src/data/moves_info.h"));
for (const f of readdirSync(join(ROM, "src/data/pokemon/species_info")).filter((f) =>
  /^gen_\d+_families\.h$/.test(f)
)) {
  collectDefines(read(join("src/data/pokemon/species_info", f)));
}

// Index of the `:` matching the first (depth-0) `?` in a ternary tail.
function findColon(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "?") d++;
    else if (s[i] === ":") {
      if (d === 0) return i;
      d--;
    }
  }
  return s.length;
}

// Resolve a C expression to a number. Follows #defines, and for config ternaries
// (`P_UPDATED_STATS >= GEN_2 ? 109 : 85`) takes the TRUE branch, which by decomp
// convention is the modern/updated value the hack ships with.
function resolveNumeric(expr, depth = 0) {
  if (expr == null || depth > 12) return 0;
  let e = String(expr).trim();
  const q = e.indexOf("?");
  if (q !== -1) {
    const rest = e.slice(q + 1);
    e = rest.slice(0, findColon(rest));
  }
  const id = e.match(/^\(*\s*([A-Za-z_]\w*)\s*\)*$/);
  if (id && defines.has(id[1])) return resolveNumeric(defines.get(id[1]), depth + 1);
  e = e.replace(/GEN_[A-Z0-9_]+/g, " "); // don't pick digits out of GEN_2 etc.
  const n = e.match(/-?\d+/);
  if (n) return parseInt(n[0], 10);
  const id2 = e.match(/[A-Za-z_]\w*/);
  if (id2 && defines.has(id2[0])) return resolveNumeric(defines.get(id2[0]), depth + 1);
  return 0;
}

const numField = (body, field) => {
  const m = body.match(new RegExp(`\\.${field}\\s*=\\s*([^,\\n]+)`));
  return m ? resolveNumeric(m[1]) : 0;
};

// Resolve a type token to a TYPE_* constant, following #defines like
// `RALTS_FAMILY_TYPE2 -> (P_UPDATED_TYPES >= GEN_6 ? TYPE_FAIRY : TYPE_PSYCHIC)`.
function resolveTypeToken(tok, depth = 0) {
  let t = tok.trim();
  if (t.startsWith("TYPE_")) return t;
  if (depth > 8) return t;
  const q = t.indexOf("?");
  if (q !== -1) {
    const rest = t.slice(q + 1);
    return resolveTypeToken(rest.slice(0, findColon(rest)), depth + 1);
  }
  const id = t.match(/^\(*\s*([A-Za-z_]\w*)\s*\)*$/);
  if (id && defines.has(id[1])) return resolveTypeToken(defines.get(id[1]), depth + 1);
  const anyType = t.match(/TYPE_\w+/);
  return anyType ? anyType[0] : t;
}

// --- Evolution parsing (brace-aware; expansion uses CONDITIONS({...},{...})) ---

/** Return the content inside the balanced open/close pair starting at openIdx. */
function balancedAt(str, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === open) depth++;
    else if (str[i] === close) {
      depth--;
      if (depth === 0) return str.slice(openIdx + 1, i);
    }
  }
  return "";
}

/** Split `{a},{b}` into ["a","b"] at brace depth 0. */
function splitTopTuples(s) {
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "{") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (s[i] === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(s.slice(start, i));
        start = -1;
      }
    }
  }
  return out;
}

function conditionText(cond, param) {
  const p = (param ?? "").trim();
  switch (cond) {
    case "IF_MIN_FRIENDSHIP": return "high friendship";
    case "IF_KNOWS_MOVE_TYPE": return `knows a ${prettify(p, "TYPE_")}-type move`;
    case "IF_KNOWS_MOVE": return `knows ${prettify(p, "MOVE_")}`;
    case "IF_HOLD_ITEM": return `holding ${itemNames.get(p) ?? prettify(p, "ITEM_")}`;
    case "IF_TIME": return /NIGHT/.test(p) ? "at night" : /DAY/.test(p) ? "during day" : prettify(p, "TIME_");
    case "IF_NOT_TIME": return /NIGHT/.test(p) ? "during day" : "at night";
    case "IF_IN_MAP": return `at ${prettify(p, "MAP_")}`;
    case "IF_MIN_LEVEL": return `Lv ${p}`;
    case "IF_GENDER": return /FEMALE/.test(p) ? "♀ only" : "♂ only";
    case "IF_NATURE": return `${prettify(p, "NATURE_")} nature`;
    case "IF_MIN_COOL": case "IF_MIN_BEAUTY": case "IF_MIN_CUTE":
    case "IF_MIN_SMART": case "IF_MIN_TOUGH": return "high contest stat";
    default: return prettify(cond, "IF_") + (p ? ` ${prettify(p, "")}` : "");
  }
}

function evoRequirement(method, param, conditionsInner) {
  const parts = [];
  const p = param.trim();
  if (method === "EVO_LEVEL") {
    if (/^\d+$/.test(p) && Number(p) > 0) parts.push(`Lv ${p}`);
  } else if (/^EVO_ITEM/.test(method)) {
    parts.push(itemNames.get(p) ?? prettify(p, "ITEM_"));
  } else if (method === "EVO_FRIENDSHIP") {
    parts.push("high friendship");
  } else if (method === "EVO_FRIENDSHIP_DAY") {
    parts.push("friendship (day)");
  } else if (method === "EVO_FRIENDSHIP_NIGHT") {
    parts.push("friendship (night)");
  } else if (method === "EVO_TRADE") {
    parts.push("trade");
  } else if (method === "EVO_TRADE_ITEM") {
    parts.push(`trade holding ${itemNames.get(p) ?? prettify(p, "ITEM_")}`);
  } else if (method === "EVO_MEGA_EVOLUTION" || method === "EVO_PRIMAL_REVERSION") {
    parts.push(itemNames.get(p) ?? prettify(p, "ITEM_"));
  } else {
    const t = prettify(method, "EVO_");
    parts.push(/^\d+$/.test(p) && Number(p) > 0 ? `${t} ${p}` : t);
  }
  if (conditionsInner) {
    for (const c of splitTopTuples(conditionsInner)) {
      const m = c.match(/^\s*(\w+)\s*(?:,\s*([\s\S]+))?$/);
      if (m) parts.push(conditionText(m[1], m[2]));
    }
  }
  return parts.filter(Boolean).join(" · ") || "Special";
}
const strField = (body, field) => {
  const m = body.match(
    new RegExp(`\\.${field}\\s*=\\s*(?:_|COMPOUND_STRING)\\(\\s*"([^"]*)"`)
  );
  return m ? m[1] : null;
};

// ----------------------------------------------------------------------------
// Enums (id <-> constant maps) needed to translate raw save bytes to names
// ----------------------------------------------------------------------------

const speciesEnum = parseEnum(read("include/constants/species.h"));
const nationalDexEnum = parseEnum(read("include/constants/pokedex.h"));
const moveEnum = parseEnum(read("include/constants/moves.h"));
const abilityEnum = parseEnum(read("include/constants/abilities.h"));
const itemEnum = parseEnum(read("include/constants/items.h"));

// ----------------------------------------------------------------------------
// Ability & item display names (from src/data/*.h name tables; prettify fallback)
// ----------------------------------------------------------------------------

const abilityNames = new Map(); // constant -> display name
const abilityDescs = new Map(); // constant -> description
for (const { key, body } of splitBlocks(readOpt("src/data/abilities.h"), "ABILITY_")) {
  abilityNames.set(key, strField(body, "name") ?? prettify(key, "ABILITY_"));
  const d = strField(body, "description");
  if (d) abilityDescs.set(key, d.replace(/\s+/g, " ").trim());
}

const itemNames = new Map();
for (const { key, body } of splitBlocks(readOpt("src/data/items.h"), "ITEM_")) {
  itemNames.set(key, strField(body, "name") ?? prettify(key, "ITEM_"));
}

// ----------------------------------------------------------------------------
// Learnsets (species short-name -> [MOVE_ constants]) from the shipped JSON
// ----------------------------------------------------------------------------

let learnables = {};
try {
  learnables = JSON.parse(read("src/data/pokemon/all_learnables.json"));
} catch {
  learnables = {};
}

// Level-up learnsets (array name -> [{ level, move id }]). Each gen file redefines
// the same array names; the hack compiles the one set by P_LVL_UP_LEARNSETS.
const levelUpByArray = new Map();
{
  // resolve the configured generation (e.g. GEN_LATEST -> GEN_9 -> gen_9.h)
  const genDefs = new Map();
  for (const m of readOpt("include/config/general.h").matchAll(/^#define\s+(GEN_\w+)\s+(.+?)\s*$/gm)) {
    const v = m[2].trim();
    genDefs.set(m[1], /^\d+$/.test(v) ? parseInt(v, 10) : genDefs.get(v) ?? null);
  }
  const cm = readOpt("include/config/pokemon.h").match(/#define\s+P_LVL_UP_LEARNSETS\s+(\w+)/);
  const raw = cm ? cm[1] : "GEN_LATEST";
  const genIdx = /^\d+$/.test(raw) ? parseInt(raw, 10) : genDefs.get(raw) ?? 8;
  const file = `src/data/pokemon/level_up_learnsets/gen_${genIdx + 1}.h`;
  const text = existsSync(join(ROM, file)) ? read(file) : "";
  const re = /const struct LevelUpMove (\w+)\[\]\s*=\s*\{([\s\S]*?)\};/g;
  let m;
  while ((m = re.exec(text))) {
    const moves = [];
    for (const t of m[2].matchAll(/LEVEL_UP_MOVE\(\s*(\d+)\s*,\s*(MOVE_\w+)\s*\)/g)) {
      const id = moveEnum.nameToId.get(t[2]);
      if (id !== undefined) moves.push({ level: parseInt(t[1], 10), move: id });
    }
    levelUpByArray.set(m[1], moves);
  }
}

// Battle forms (Mega / Gmax / Primal) — hidden from the dex grid, shown under the
// base species' Evolutions tab. Detected by key suffix; base = key without suffix.
const BATTLE_FORM_RE = /_(MEGA(_X|_Y)?|GMAX|PRIMAL|ETERNAMAX)$/;
function formLabel(key) {
  const m = key.match(BATTLE_FORM_RE);
  if (!m) return null;
  const s = m[1];
  if (s === "GMAX") return "Gigantamax";
  if (s === "PRIMAL") return "Primal";
  if (s === "ETERNAMAX") return "Eternamax";
  return prettify(s, ""); // Mega / Mega X / Mega Y
}

// ----------------------------------------------------------------------------
// Moves
// ----------------------------------------------------------------------------

const CATEGORY = {
  DAMAGE_CATEGORY_PHYSICAL: "Physical",
  DAMAGE_CATEGORY_SPECIAL: "Special",
  DAMAGE_CATEGORY_STATUS: "Status",
};

const moves = {};
for (const { key, body } of splitBlocks(read("src/data/moves_info.h"), "MOVE_")) {
  const id = moveEnum.nameToId.get(key);
  if (id === undefined) continue;
  const typeM = body.match(/\.type\s*=\s*(TYPE_\w+)/);
  const catM = body.match(/\.category\s*=\s*(DAMAGE_CATEGORY_\w+)/);
  moves[id] = {
    id,
    key,
    name: strField(body, "name") ?? prettify(key, "MOVE_"),
    type: typeM ? prettify(typeM[1], "TYPE_") : "Normal",
    power: numField(body, "power"),
    accuracy: numField(body, "accuracy"),
    pp: numField(body, "pp"),
    priority: numField(body, "priority"),
    category: catM ? CATEGORY[catM[1]] ?? "Status" : "Status",
  };
}

// ----------------------------------------------------------------------------
// Species
// ----------------------------------------------------------------------------

const GROWTH = {
  GROWTH_MEDIUM_FAST: "Medium Fast",
  GROWTH_ERRATIC: "Erratic",
  GROWTH_FLUCTUATING: "Fluctuating",
  GROWTH_MEDIUM_SLOW: "Medium Slow",
  GROWTH_FAST: "Fast",
  GROWTH_SLOW: "Slow",
};

const speciesDir = "src/data/pokemon/species_info";
const speciesFiles = readdirSync(join(ROM, speciesDir)).filter((f) =>
  /^gen_\d+_families\.h$/.test(f)
);

const species = [];
for (const file of speciesFiles) {
  const text = read(join(speciesDir, file));
  for (const { key, body } of splitBlocks(text, "SPECIES_")) {
    const id = speciesEnum.nameToId.get(key);
    if (id === undefined) continue;

    const typesM = body.match(/\.types\s*=\s*MON_TYPES\(([^)]*)\)/);
    let types = ["Normal"];
    if (typesM) {
      const t = typesM[1].split(",").map((x) => resolveTypeToken(x)).filter(Boolean);
      types = [...new Set(t)].map((x) => prettify(x, "TYPE_"));
    }

    // Keep ability slots positional ([slot0, slot1, hidden]) with null for
    // ABILITY_NONE, so the save's abilityNum indexes correctly. `abilityList`
    // is the de-duplicated non-null set for dex display.
    const abM = body.match(/\.abilities\s*=\s*\{([^}]*)\}/);
    let abilities = [];
    if (abM) {
      abilities = abM[1]
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((c) => (c === "ABILITY_NONE" ? null : abilityNames.get(c) ?? prettify(c, "ABILITY_")));
    }
    const abilityList = [...new Set(abilities.filter(Boolean))];
    const hiddenAbility = abilities[2] ?? null;
    const regularAbilities = [...new Set([abilities[0], abilities[1]].filter(Boolean))];

    const growthM = body.match(/\.growthRate\s*=\s*(GROWTH_\w+)/);
    const genderM = body.match(/\.genderRatio\s*=\s*([^,\n]+)/);
    let genderFemale = null; // % female, or null for genderless
    if (genderM) {
      const g = genderM[1].trim();
      const pf = g.match(/PERCENT_FEMALE\(([\d.]+)\)/);
      if (pf) genderFemale = parseFloat(pf[1]);
      else if (/MON_GENDERLESS/.test(g)) genderFemale = null;
    }

    // evolutions: EVOLUTION({METHOD, param, SPECIES_X [, CONDITIONS({...},...)]}, ...)
    const evolutions = [];
    const evoStart = body.search(/\.evolutions\s*=\s*EVOLUTION\s*\(/);
    if (evoStart >= 0) {
      const openIdx = body.indexOf("(", evoStart);
      const content = balancedAt(body, openIdx, "(", ")").replace(/^\s*#.*$/gm, "");
      for (const tup of splitTopTuples(content)) {
        const m = tup.match(/^\s*(EVO_\w+)\s*,\s*([^,]+?)\s*,\s*(SPECIES_\w+)([\s\S]*)$/);
        if (!m) continue;
        const [, method, rawParam, sp, rest] = m;
        const condM = rest.match(/CONDITIONS\s*\(/);
        let conditionsInner = "";
        if (condM) conditionsInner = balancedAt(rest, rest.indexOf("(", condM.index), "(", ")");
        evolutions.push({
          method: prettify(method, "EVO_"),
          to: speciesEnum.nameToId.get(sp) ?? null,
          toName: prettify(sp, "SPECIES_"),
          requirement: evoRequirement(method, rawParam.trim(), conditionsInner),
        });
      }
    }

    const shortName = key.replace(/^SPECIES_/, "");
    const learnKeys = learnables[shortName] ?? [];
    const allLearn = learnKeys
      .map((c) => moveEnum.nameToId.get(c))
      .filter((n) => n !== undefined);

    // Level-up moves (with the level they're learned at)
    const luArr = body.match(/\.levelUpLearnset\s*=\s*(\w+)/);
    const levelUpMoves = (luArr && levelUpByArray.get(luArr[1])) || [];
    // TM / Tutor = everything learnable that isn't a level-up move
    const luIds = new Set(levelUpMoves.map((m) => m.move));
    const tmMoves = [...new Set(allLearn.filter((id) => !luIds.has(id)))];

    const isForm = BATTLE_FORM_RE.test(key);
    const baseKey = isForm ? key.replace(BATTLE_FORM_RE, "") : null;

    const name = strField(body, "speciesName") ?? prettify(key, "SPECIES_");
    const desc = strField(body, "description");

    species.push({
      id,
      key,
      name,
      natDex: (() => {
        const m = body.match(/\.natDexNum\s*=\s*(NATIONAL_DEX_\w+)/);
        return m ? nationalDexEnum.nameToId.get(m[1]) ?? null : null;
      })(),
      types,
      abilities,
      abilityList,
      regularAbilities,
      hiddenAbility,
      baseStats: {
        hp: numField(body, "baseHP"),
        atk: numField(body, "baseAttack"),
        def: numField(body, "baseDefense"),
        spa: numField(body, "baseSpAttack"),
        spd: numField(body, "baseSpDefense"),
        spe: numField(body, "baseSpeed"),
      },
      growthRate: growthM ? GROWTH[growthM[1]] ?? prettify(growthM[1], "GROWTH_") : "Medium Fast",
      genderFemale,
      catchRate: numField(body, "catchRate"),
      category: strField(body, "categoryName"),
      height: numField(body, "height"), // decimetres
      weight: numField(body, "weight"), // hectograms
      description: desc ? desc.replace(/\s+/g, " ").trim() : null,
      evolutions,
      levelUpMoves,
      tmMoves,
      isForm,
      formName: isForm ? formLabel(key) : null,
      baseSpecies: baseKey ? speciesEnum.nameToId.get(baseKey) ?? null : null,
      forms: [], // filled below
    });
  }
}
species.sort((a, b) => a.id - b.id);

// Attach each base species' battle forms (Mega/Gmax/Primal) for the Evolutions tab.
{
  const byId = new Map(species.map((s) => [s.id, s]));
  for (const s of species) {
    if (s.isForm && s.baseSpecies != null) {
      const base = byId.get(s.baseSpecies);
      if (base) base.forms.push({ id: s.id, name: base.name, label: s.formName });
    }
  }
}

// ----------------------------------------------------------------------------
// Abilities & items maps (id -> {id,name})
// ----------------------------------------------------------------------------

const abilities = {};
for (const [name, id] of abilityEnum.nameToId) {
  if (abilities[id]) continue;
  abilities[id] = {
    id,
    name: abilityNames.get(name) ?? prettify(name, "ABILITY_"),
    description: abilityDescs.get(name) ?? "",
  };
}

const items = {};
for (const [name, id] of itemEnum.nameToId) {
  if (items[id]) continue;
  items[id] = { id, name: itemNames.get(name) ?? prettify(name, "ITEM_") };
}

// ----------------------------------------------------------------------------
// Natures (stable 25; +/- stat keyed to our baseStats abbreviations)
// ----------------------------------------------------------------------------

const NATURES = [
  ["Hardy", null, null], ["Lonely", "atk", "def"], ["Brave", "atk", "spe"],
  ["Adamant", "atk", "spa"], ["Naughty", "atk", "spd"], ["Bold", "def", "atk"],
  ["Docile", null, null], ["Relaxed", "def", "spe"], ["Impish", "def", "spa"],
  ["Lax", "def", "spd"], ["Timid", "spe", "atk"], ["Hasty", "spe", "def"],
  ["Serious", null, null], ["Jolly", "spe", "spa"], ["Naive", "spe", "spd"],
  ["Modest", "spa", "atk"], ["Mild", "spa", "def"], ["Quiet", "spa", "spe"],
  ["Bashful", null, null], ["Rash", "spa", "spd"], ["Calm", "spd", "atk"],
  ["Gentle", "spd", "def"], ["Sassy", "spd", "spe"], ["Careful", "spd", "spa"],
  ["Quirky", null, null],
];
const natures = NATURES.map(([name, plus, minus], id) => ({ id, name, plus, minus }));

// ----------------------------------------------------------------------------
// Trainers (src/data/trainers.party — Showdown-style text) for the calculator
// ----------------------------------------------------------------------------

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

// name/constant -> id lookups
const speciesLookup = new Map();
for (const s of species) {
  speciesLookup.set(norm(s.name), s.id);
  speciesLookup.set(norm(s.key.replace(/^SPECIES_/, "")), s.id);
}
const moveLookup = new Map();
for (const m of Object.values(moves)) {
  moveLookup.set(norm(m.name), m.id);
  moveLookup.set(norm(m.key.replace(/^MOVE_/, "")), m.id);
}
const itemLookup = new Map();
for (const [name, id] of itemEnum.nameToId) {
  itemLookup.set(norm(name.replace(/^ITEM_/, "")), id);
  const disp = itemNames.get(name);
  if (disp) itemLookup.set(norm(disp), id);
}
const abilityLookup = new Map();
for (const [name, id] of abilityEnum.nameToId) {
  abilityLookup.set(norm(name.replace(/^ABILITY_/, "")), id);
  const disp = abilityNames.get(name);
  if (disp) abilityLookup.set(norm(disp), id);
}
const natureLookup = new Map(natures.map((n) => [norm(n.name), n.id]));

function parseTrainerMon(lines) {
  let first = lines[0];
  let item = null;
  const at = first.split("@");
  if (at.length > 1) {
    item = itemLookup.get(norm(at[1])) ?? null;
    first = at[0].trim();
  }
  first = first.replace(/\((?:M|F)\)/g, "").trim();
  const paren = first.match(/\(([^)]+)\)\s*$/);
  const speciesTok = paren ? paren[1].trim() : first.trim();
  const speciesId = speciesLookup.get(norm(speciesTok));
  if (speciesId === undefined) return null;

  const mon = { species: speciesId, level: 100, ability: null, item, moves: [], nature: 0, shiny: false };
  for (const l of lines.slice(1)) {
    const mv = l.match(/^-\s*(.+)$/);
    if (mv) {
      const id = moveLookup.get(norm(mv[1]));
      if (id !== undefined) mon.moves.push(id);
      continue;
    }
    const kv = l.match(/^([A-Za-z ]+):\s*(.*)$/);
    if (!kv) continue;
    const k = kv[1].trim().toLowerCase();
    const v = kv[2].trim();
    if (k === "level") mon.level = parseInt(v, 10) || mon.level;
    else if (k === "ability") mon.ability = abilityLookup.get(norm(v)) ?? null;
    else if (k === "nature") mon.nature = natureLookup.get(norm(v)) ?? 0;
    else if (k === "shiny") mon.shiny = /yes/i.test(v);
  }
  return mon;
}

function parseTrainers(text) {
  const out = [];
  const parts = text.split(/^=== (TRAINER_\w+) ===\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const id = parts[i];
    if (id === "TRAINER_NONE") continue;
    const lines = parts[i + 1].split("\n");
    const header = {};
    let idx = 0;
    while (idx < lines.length && lines[idx].trim() === "") idx++; // skip leading blank(s)
    for (; idx < lines.length; idx++) {
      const l = lines[idx].trim();
      if (l === "") { idx++; break; }
      const m = l.match(/^([A-Za-z ]+):\s*(.*)$/);
      if (m) header[m[1].trim().toLowerCase()] = m[2].trim();
    }
    const chunks = [];
    let cur = [];
    for (; idx < lines.length; idx++) {
      const l = lines[idx].trim();
      if (l === "") { if (cur.length) { chunks.push(cur); cur = []; } continue; }
      cur.push(l);
    }
    if (cur.length) chunks.push(cur);
    const party = chunks.map(parseTrainerMon).filter(Boolean);
    if (party.length === 0) continue;
    out.push({
      id,
      name: header["name"] || prettify(id, "TRAINER_"),
      trainerClass: header["class"] || "",
      pic: header["pic"] || "",
      double: /yes/i.test(header["double battle"] || ""),
      ai: (header["ai"] || "").split("/").map((s) => s.trim()).filter(Boolean),
      party,
    });
  }
  return out;
}

const trainers = parseTrainers(readOpt("src/data/trainers.party"));

// ----------------------------------------------------------------------------
// Write output
// ----------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });

let commit = "unknown";
try {
  commit = execSync("git rev-parse HEAD", { cwd: ROM }).toString().trim();
} catch {}
let version = "unknown";
try {
  version = execSync("git describe --tags", { cwd: ROM }).toString().trim();
} catch {}

const meta = {
  source: "pokeemerald-expansion",
  commit,
  version,
  generatedAt: new Date().toISOString(),
  counts: {
    species: species.length,
    moves: Object.keys(moves).length,
    abilities: Object.keys(abilities).length,
    items: Object.keys(items).length,
    trainers: trainers.length,
  },
};

const writeJson = (name, data) =>
  writeFileSync(join(OUT, name), JSON.stringify(data));

writeJson("meta.json", meta);
writeJson("species.json", species);
writeJson("moves.json", moves);
writeJson("abilities.json", abilities);
writeJson("items.json", items);
writeJson("natures.json", natures);
writeJson("trainers.json", trainers);

console.log("[extract] wrote", OUT);
console.table(meta.counts);
// Sanity spot-checks
const bulba = species.find((s) => s.key === "SPECIES_BULBASAUR");
console.log(
  "[check] Bulbasaur:",
  bulba && `${bulba.name} ${bulba.types.join("/")} | ${bulba.abilityList.join(", ")}`
);
