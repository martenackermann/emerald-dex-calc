// Encoder for pokeemerald-expansion save files — the exact inverse of the
// parser in lib/save/index.ts. Plain ESM JS so both the vitest suite and the
// scripts/make-sample-save.mjs CLI can import it (the browser never encodes).
//
// Layout sources: include/save.h (sector container), include/global.h
// (SaveBlock1/2), include/pokemon.h (BoxPokemon bitfields),
// include/pokemon_storage_system.h (boxes @ +0x0001).

const SECTOR_SIZE = 4096;
const SECTOR_DATA_SIZE = 3968;
const SIGNATURE = 0x08012025;
const OFF_ID = 0xff4;
const OFF_CHECKSUM = 0xff6;
const OFF_SIGNATURE = 0xff8;
const OFF_COUNTER = 0xffc;

const SB1_PARTY_COUNT = 0x234;
const SB1_PARTY = 0x238;
const MON_SIZE = 100;
const BOX_MON_SIZE = 80;
const STORAGE_BOXES = 0x0001;
const TOTAL_BOXES = 14;
const IN_BOX_COUNT = 30;

const SUBSTRUCT_ORDER = [
  "GAEM", "GAME", "GEAM", "GEMA", "GMAE", "GMEA",
  "AGEM", "AGME", "AEGM", "AEMG", "AMGE", "AMEG",
  "EGAM", "EGMA", "EAGM", "EAMG", "EMGA", "EMAG",
  "MGAE", "MGEA", "MAGE", "MAEG", "MEGA", "MEAG",
];
const LETTER = "GAEM";

// ---- Gen 3 text encoding (inverse of lib/pokemon/charmap.ts) ---------------

const REV = new Map();
REV.set(" ", 0x00);
"0123456789".split("").forEach((c, i) => REV.set(c, 0xa1 + i));
REV.set("!", 0xab); REV.set("?", 0xac); REV.set(".", 0xad); REV.set("-", 0xae);
"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((c, i) => REV.set(c, 0xbb + i));
"abcdefghijklmnopqrstuvwxyz".split("").forEach((c, i) => REV.set(c, 0xd5 + i));

export function encodeGen3Text(str, len) {
  const out = new Uint8Array(len).fill(0xff);
  for (let i = 0; i < Math.min(str.length, len); i++) {
    out[i] = REV.get(str[i]) ?? 0x00;
  }
  return out;
}

// ---- experience curves (same math as lib/pokemon/experience.ts) ------------

export function expForLevel(rate, n) {
  if (n <= 1) return 0;
  const c = n * n * n;
  switch (rate) {
    case "Fast": return Math.floor((4 * c) / 5);
    case "Medium Fast": return c;
    case "Medium Slow": return Math.floor((6 / 5) * c - 15 * n * n + 100 * n - 140);
    case "Slow": return Math.floor((5 * c) / 4);
    case "Erratic":
      if (n <= 50) return Math.floor((c * (100 - n)) / 50);
      if (n <= 68) return Math.floor((c * (150 - n)) / 100);
      if (n <= 98) return Math.floor((c * Math.floor((1911 - 10 * n) / 3)) / 500);
      return Math.floor((c * (160 - n)) / 100);
    case "Fluctuating":
      if (n <= 15) return Math.floor((c * (Math.floor((n + 1) / 3) + 24)) / 50);
      if (n <= 36) return Math.floor((c * (n + 14)) / 50);
      return Math.floor((c * (Math.floor(n / 2) + 32)) / 50);
    default: return c;
  }
}

/** Pick a personality whose %25 equals the wanted nature id (substruct order varies with it). */
export function personalityForNature(natureId, salt = 0) {
  const base = (0x1000 + salt * 613) >>> 0;
  return (base - (base % 25) + natureId) >>> 0;
}

// ---- mon encoding ----------------------------------------------------------

/**
 * Encode a BoxPokemon (80 bytes) or party Pokemon (100 bytes).
 * fields: { personality, otId, species, heldItem, experience, friendship,
 *   pokeball, moves[4], pp[4], evs{}, ivs{}, abilityNum, nickname?, otName?,
 *   level? (party), battleStats? {maxHp,atk,def,spa,spd,spe} (party) }
 */
export function encodeMon(f, isParty) {
  const size = isParty ? MON_SIZE : BOX_MON_SIZE;
  const buf = new Uint8Array(size);
  const v = new DataView(buf.buffer);
  v.setUint32(0, f.personality >>> 0, true);
  v.setUint32(4, f.otId >>> 0, true);
  buf.set(encodeGen3Text(f.nickname ?? "", 10), 8);
  buf[18] = 0b010; // language = English(2) in bits 0..2, hiddenNatureModifier = 0
  buf[19] = 0b10; // hasSpecies
  buf.set(encodeGen3Text(f.otName ?? "", 7), 20);

  const growth = new Uint8Array(12);
  const gv = new DataView(growth.buffer);
  gv.setUint16(0, f.species & 0x7ff, true);
  gv.setUint16(2, (f.heldItem ?? 0) & 0x3ff, true);
  gv.setUint32(4, (f.experience ?? 0) & 0x1fffff, true);
  growth[9] = f.friendship ?? 70;
  gv.setUint16(10, ((f.pokeball ?? 4) & 0x3f) << 0, true);

  const atk = new Uint8Array(12);
  const av = new DataView(atk.buffer);
  const moves = [...(f.moves ?? []), 0, 0, 0, 0].slice(0, 4);
  const pp = [...(f.pp ?? []), 0, 0, 0, 0].slice(0, 4);
  [0, 2, 4, 6].forEach((o, i) => av.setUint16(o, moves[i] & 0x7ff, true));
  [8, 9, 10, 11].forEach((o, i) => (atk[o] = pp[i] & 0x7f));

  const ev = new Uint8Array(12);
  const evs = f.evs ?? {};
  ev[0] = evs.hp ?? 0; ev[1] = evs.atk ?? 0; ev[2] = evs.def ?? 0;
  ev[3] = evs.spe ?? 0; ev[4] = evs.spa ?? 0; ev[5] = evs.spd ?? 0;

  const misc = new Uint8Array(12);
  const mv = new DataView(misc.buffer);
  const ivs = f.ivs ?? {};
  const ivWord =
    ((ivs.hp ?? 31) & 0x1f) |
    (((ivs.atk ?? 31) & 0x1f) << 5) |
    (((ivs.def ?? 31) & 0x1f) << 10) |
    (((ivs.spe ?? 31) & 0x1f) << 15) |
    (((ivs.spa ?? 31) & 0x1f) << 20) |
    (((ivs.spd ?? 31) & 0x1f) << 25);
  mv.setUint32(4, ivWord >>> 0, true);
  mv.setUint32(8, ((f.abilityNum ?? 0) & 0x3) << 29, true);

  const subs = [growth, atk, ev, misc];
  const order = SUBSTRUCT_ORDER[(f.personality >>> 0) % 24];
  const decrypted = new Uint8Array(48);
  for (let type = 0; type < 4; type++) {
    decrypted.set(subs[type], order.indexOf(LETTER[type]) * 12);
  }

  const dv = new DataView(decrypted.buffer);
  let sum = 0;
  for (let i = 0; i < 24; i++) sum = (sum + dv.getUint16(i * 2, true)) & 0xffff;
  v.setUint16(28, sum, true);

  const key = (f.personality ^ f.otId) >>> 0;
  for (let j = 0; j < 12; j++) {
    v.setUint32(32 + j * 4, (dv.getUint32(j * 4, true) ^ key) >>> 0, true);
  }

  if (isParty) {
    v.setUint8(84, f.level ?? 1);
    const bs = f.battleStats ?? {};
    v.setUint16(86, bs.hp ?? bs.maxHp ?? 0, true);
    v.setUint16(88, bs.maxHp ?? 0, true);
    v.setUint16(90, bs.atk ?? 0, true);
    v.setUint16(92, bs.def ?? 0, true);
    v.setUint16(94, bs.spe ?? 0, true);
    v.setUint16(96, bs.spa ?? 0, true);
    v.setUint16(98, bs.spd ?? 0, true);
  }
  return buf;
}

// ---- full save container ---------------------------------------------------

/**
 * Build a complete 128 KB expansion-format save.
 * opts: {
 *   trainer?: { name, gender, trainerId },
 *   party: Uint8Array[] (encodeMon(..., true)),
 *   boxes?: { box, slot, data: Uint8Array }[] (encodeMon(..., false)),
 * }
 */
export function buildSave(opts) {
  const save = new Uint8Array(32 * SECTOR_SIZE);

  const writeSector = (physical, id, data, counter = 5) => {
    const off = physical * SECTOR_SIZE;
    save.set(data.subarray(0, Math.min(data.length, SECTOR_DATA_SIZE)), off);
    const fv = new DataView(save.buffer, off, SECTOR_SIZE);
    fv.setUint16(OFF_ID, id, true);
    fv.setUint32(OFF_SIGNATURE, SIGNATURE, true);
    fv.setUint32(OFF_COUNTER, counter, true);
    // checksum over the data area is not validated by our parser (per-mon
    // checksums are), but write a simple sum for plausibility
    let sum = 0;
    for (let i = 0; i < SECTOR_DATA_SIZE; i += 4) sum = (sum + fv.getUint32(i, true)) >>> 0;
    fv.setUint16(OFF_CHECKSUM, ((sum >>> 16) + (sum & 0xffff)) & 0xffff, true);
  };

  // SaveBlock2: trainer info
  const sb2 = new Uint8Array(SECTOR_DATA_SIZE);
  const t = opts.trainer ?? { name: "EMERALD", gender: 0, trainerId: 0x12345 };
  sb2.set(encodeGen3Text(t.name ?? "EMERALD", 7), 0);
  sb2[0x08] = t.gender ?? 0;
  new DataView(sb2.buffer).setUint32(0x0a, (t.trainerId ?? 0) >>> 0, true);
  writeSector(0, 0, sb2);

  // SaveBlock1: party
  const sb1 = new Uint8Array(4 * SECTOR_DATA_SIZE);
  const party = opts.party ?? [];
  sb1[SB1_PARTY_COUNT] = Math.min(party.length, 6);
  party.slice(0, 6).forEach((mon, i) => sb1.set(mon, SB1_PARTY + i * MON_SIZE));
  for (let i = 0; i < 4; i++) {
    writeSector(1 + i, 1 + i, sb1.subarray(i * SECTOR_DATA_SIZE, (i + 1) * SECTOR_DATA_SIZE));
  }

  // PokemonStorage: currentBox @0, boxes @1
  const storage = new Uint8Array(9 * SECTOR_DATA_SIZE);
  storage[0] = 0;
  for (const bm of opts.boxes ?? []) {
    const off = STORAGE_BOXES + (bm.box * IN_BOX_COUNT + bm.slot) * BOX_MON_SIZE;
    storage.set(bm.data, off);
  }
  for (let i = 0; i < 9; i++) {
    writeSector(5 + i, 5 + i, storage.subarray(i * SECTOR_DATA_SIZE, (i + 1) * SECTOR_DATA_SIZE));
  }

  return save;
}
