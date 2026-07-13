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
const moveEnum = parseEnum(read("include/constants/moves.h"));
const abilityEnum = parseEnum(read("include/constants/abilities.h"));
const itemEnum = parseEnum(read("include/constants/items.h"));

// ----------------------------------------------------------------------------
// Ability & item display names (from src/data/*.h name tables; prettify fallback)
// ----------------------------------------------------------------------------

const abilityNames = new Map(); // constant -> display name
for (const { key, body } of splitBlocks(readOpt("src/data/abilities.h"), "ABILITY_")) {
  abilityNames.set(key, strField(body, "name") ?? prettify(key, "ABILITY_"));
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

    const growthM = body.match(/\.growthRate\s*=\s*(GROWTH_\w+)/);
    const genderM = body.match(/\.genderRatio\s*=\s*([^,\n]+)/);
    let genderFemale = null; // % female, or null for genderless
    if (genderM) {
      const g = genderM[1].trim();
      const pf = g.match(/PERCENT_FEMALE\(([\d.]+)\)/);
      if (pf) genderFemale = parseFloat(pf[1]);
      else if (/MON_GENDERLESS/.test(g)) genderFemale = null;
    }

    // evolutions: EVOLUTION({METHOD, param, SPECIES_X}, ...)
    const evolutions = [];
    const evoM = body.match(/\.evolutions\s*=\s*EVOLUTION\(([\s\S]*?)\)\s*,/);
    if (evoM) {
      for (const tup of evoM[1].matchAll(/\{\s*(\w+)\s*,\s*([^,]+?)\s*,\s*(SPECIES_\w+)/g)) {
        evolutions.push({
          method: prettify(tup[1], "EVO_"),
          param: tup[2].trim(),
          to: speciesEnum.nameToId.get(tup[3]) ?? null,
          toName: prettify(tup[3], "SPECIES_"),
        });
      }
    }

    const shortName = key.replace(/^SPECIES_/, "");
    const learnKeys = learnables[shortName] ?? [];
    const learnset = learnKeys
      .map((c) => moveEnum.nameToId.get(c))
      .filter((n) => n !== undefined);

    const name = strField(body, "speciesName") ?? prettify(key, "SPECIES_");
    const desc = strField(body, "description");

    species.push({
      id,
      key,
      name,
      natDex: numField(body, "natDexNum") || null,
      types,
      abilities,
      abilityList,
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
      learnset,
    });
  }
}
species.sort((a, b) => a.id - b.id);

// ----------------------------------------------------------------------------
// Abilities & items maps (id -> {id,name})
// ----------------------------------------------------------------------------

const abilities = {};
for (const [name, id] of abilityEnum.nameToId) {
  if (abilities[id]) continue;
  abilities[id] = { id, name: abilityNames.get(name) ?? prettify(name, "ABILITY_") };
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

console.log("[extract] wrote", OUT);
console.table(meta.counts);
// Sanity spot-checks
const bulba = species.find((s) => s.key === "SPECIES_BULBASAUR");
console.log(
  "[check] Bulbasaur:",
  bulba && `${bulba.name} ${bulba.types.join("/")} | ${bulba.abilityList.join(", ")}`
);
