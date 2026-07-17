// Generates public/sample-expansion.sav — a bit-exact pokeemerald-expansion
// save file (sector container + encrypted mons) built from the extracted
// ROM-hack data. Lets the app's full .sav pipeline (container -> decrypt ->
// team/box UI, incl. the expansion box layout @ +0x0001) be exercised without
// building the ROM with devkitARM.
//
// Usage: node scripts/make-sample-save.mjs   (after `npm run extract`)

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSave, encodeMon, expForLevel, personalityForNature } from "../lib/save/encode.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");
const DATA = join(APP_ROOT, "public", "data");

const species = JSON.parse(readFileSync(join(DATA, "species.json"), "utf8"));
const movesById = JSON.parse(readFileSync(join(DATA, "moves.json"), "utf8"));
const items = JSON.parse(readFileSync(join(DATA, "items.json"), "utf8"));
const natures = JSON.parse(readFileSync(join(DATA, "natures.json"), "utf8"));

const byName = new Map(species.map((s) => [s.name.toLowerCase(), s]));
const moveByName = new Map(Object.values(movesById).map((m) => [m.name.toLowerCase(), m]));
const itemByName = new Map(Object.values(items).map((i) => [i.name.toLowerCase(), i.id]));
const natureByName = new Map(natures.map((n) => [n.name.toLowerCase(), n]));

const OT_ID = 0x00a1b2c3;
const OT_NAME = "EMERALD";

function natureMult(nature, stat) {
  if (!nature.plus || !nature.minus) return 1;
  if (nature.plus === stat) return 1.1;
  if (nature.minus === stat) return 0.9;
  return 1;
}

function computeStats(base, level, ivs, evs, nature) {
  const iv = (k) => ivs?.[k] ?? 31;
  const ev = (k) => evs?.[k] ?? 0;
  const other = (k) =>
    Math.floor((Math.floor(((2 * base[k] + iv(k) + Math.floor(ev(k) / 4)) * level) / 100) + 5) * natureMult(nature, k));
  return {
    maxHp: Math.floor(((2 * base.hp + iv("hp") + Math.floor(ev("hp") / 4)) * level) / 100) + level + 10,
    atk: other("atk"), def: other("def"), spa: other("spa"), spd: other("spd"), spe: other("spe"),
  };
}

let salt = 0;
function makeMon(spec, isParty) {
  const s = byName.get(spec.name.toLowerCase());
  if (!s) throw new Error(`species not found: ${spec.name}`);
  const nature = natureByName.get((spec.nature ?? "Hardy").toLowerCase()) ?? natures[0];
  const moves = (spec.moves ?? [])
    .map((n) => moveByName.get(n.toLowerCase()))
    .filter(Boolean);
  const level = spec.level ?? 50;
  const stats = computeStats(s.baseStats, level, spec.ivs, spec.evs, nature);
  const fields = {
    personality: personalityForNature(nature.id, salt++),
    otId: OT_ID,
    species: s.id,
    heldItem: spec.item ? itemByName.get(spec.item.toLowerCase()) ?? 0 : 0,
    experience: expForLevel(s.growthRate, level),
    friendship: 160,
    pokeball: 4,
    moves: moves.map((m) => m.id),
    pp: moves.map((m) => m.pp || 10),
    evs: spec.evs ?? {},
    ivs: spec.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    abilityNum: spec.abilityNum ?? 0,
    nickname: spec.nickname ?? s.name.toUpperCase().slice(0, 10),
    otName: OT_NAME,
    level,
    battleStats: { hp: stats.maxHp, ...stats },
  };
  return encodeMon(fields, isParty);
}

// --- roster: a themed expansion team incl. a Gen 9 mon ----------------------

const PARTY = [
  { name: "Sceptile", level: 56, nature: "Timid", item: "Life Orb", moves: ["Leaf Blade", "Dragon Claw", "Earthquake", "Swords Dance"], evs: { spe: 252, atk: 252 } },
  { name: "Charizard", level: 55, nature: "Timid", item: "Charcoal", moves: ["Flamethrower", "Air Slash", "Dragon Pulse", "Roost"], evs: { spa: 252, spe: 252 } },
  { name: "Gardevoir", level: 54, nature: "Modest", item: "Choice Specs", moves: ["Moonblast", "Psychic", "Shadow Ball", "Thunderbolt"], evs: { spa: 252, hp: 252 } },
  { name: "Metagross", level: 55, nature: "Adamant", item: "Leftovers", moves: ["Meteor Mash", "Earthquake", "Zen Headbutt", "Bullet Punch"], evs: { atk: 252, hp: 252 } },
  { name: "Garchomp", level: 56, nature: "Jolly", item: "Rocky Helmet", moves: ["Earthquake", "Dragon Claw", "Stone Edge", "Swords Dance"], evs: { atk: 252, spe: 252 } },
  { name: "Miraidon", level: 60, nature: "Modest", item: "Magnet", moves: ["Electro Drift", "Draco Meteor", "Overheat", "Charge Beam"], evs: { spa: 252, spe: 252 } },
];

const BOXES = [
  { box: 0, slot: 0, spec: { name: "Pikachu", level: 20, nature: "Jolly", nickname: "SPARKY", moves: ["Thunderbolt", "Quick Attack"] } },
  { box: 0, slot: 1, spec: { name: "Eevee", level: 18, nature: "Careful", moves: ["Bite", "Quick Attack"] } },
  { box: 0, slot: 2, spec: { name: "Shuckle", level: 30, nature: "Bold", item: "Leftovers", moves: ["Toxic", "Protect"] } },
  { box: 0, slot: 5, spec: { name: "Sprigatito", level: 12, nature: "Naive", moves: ["Leafage", "Scratch"] } },
  { box: 1, slot: 0, spec: { name: "Beldum", level: 25, nature: "Adamant", moves: ["Take Down"] } },
  { box: 13, slot: 29, spec: { name: "Rayquaza", level: 70, nature: "Naughty", nickname: "SKYLORD", moves: ["Dragon Ascent", "Extreme Speed", "Earthquake", "Dragon Dance"] } },
];

const save = buildSave({
  trainer: { name: OT_NAME, gender: 0, trainerId: OT_ID },
  party: PARTY.map((p) => makeMon(p, true)),
  boxes: BOXES.map((b) => ({ box: b.box, slot: b.slot, data: makeMon(b.spec, false) })),
});

const out = join(APP_ROOT, "public", "sample-expansion.sav");
writeFileSync(out, save);
console.log(`[make-sav] wrote ${out} (${save.length} bytes)`);
console.log(`[make-sav] party: ${PARTY.map((p) => p.name).join(", ")}`);
console.log(`[make-sav] boxes: ${BOXES.map((b) => `${b.spec.name}@B${b.box + 1}`).join(", ")}`);
