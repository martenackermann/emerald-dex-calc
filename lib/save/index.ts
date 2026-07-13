// Client-side parser for pokeemerald-expansion (Gen 3 flash) save files.
//
// Layout is taken bit-for-bit from the decomp we ship data from:
//   - Sector container:  include/save.h  (SECTOR_* constants, footer at 0xFF4)
//   - Party in SaveBlock1: include/global.h  (count @0x234, party @0x238)
//   - Boxes in PokemonStorage: include/pokemon_storage_system.h (boxes @0x0001)
//   - Mon bitfields: include/pokemon.h (PokemonSubstruct0..3, BoxPokemon)
//
// The mon decoder returns RAW ids (species/move/item/ability). Name resolution
// happens in the data layer against the extracted JSON, keeping this pure and
// unit-testable.

import { decodeGen3Text } from "@/lib/pokemon/charmap";

// ---- container constants (include/save.h) ----------------------------------
const SECTOR_SIZE = 4096;
const SECTOR_DATA_SIZE = 3968;
const SECTORS_COUNT = 32;
const SIGNATURE = 0x08012025;
const OFF_ID = 0xff4;
const OFF_CHECKSUM = 0xff6;
const OFF_SIGNATURE = 0xff8;
const OFF_COUNTER = 0xffc;

const SECTOR_ID_SAVEBLOCK2 = 0;
const SECTOR_ID_SB1 = [1, 2, 3, 4];
const SECTOR_ID_STORAGE = [5, 6, 7, 8, 9, 10, 11, 12, 13];

// ---- SaveBlock1 / PokemonStorage offsets -----------------------------------
const SB1_PARTY_COUNT = 0x234;
const SB1_PARTY = 0x238;
const PARTY_SIZE = 6;
const MON_SIZE = 100; // struct Pokemon
const BOX_MON_SIZE = 80; // struct BoxPokemon
const STORAGE_BOXES = 0x0001;
const TOTAL_BOXES = 14;
const IN_BOX_COUNT = 30;

// Gen 3 substructure orderings, indexed by personality % 24. Letters map to
// substruct types: G=Growth(0) A=Attacks(1) E=EVs(2) M=Misc(3).
const SUBSTRUCT_ORDER = [
  "GAEM", "GAME", "GEAM", "GEMA", "GMAE", "GMEA",
  "AGEM", "AGME", "AEGM", "AEMG", "AMGE", "AMEG",
  "EGAM", "EGMA", "EAGM", "EAMG", "EMGA", "EMAG",
  "MGAE", "MGEA", "MAGE", "MAEG", "MEGA", "MEAG",
];
const LETTER = "GAEM"; // index by substruct type -> letter

export interface Stats6 {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface DecodedMon {
  personality: number;
  otId: number;
  species: number;
  heldItem: number;
  moves: number[];
  pp: number[];
  nature: number; // stat nature 0..24 (personality % 25)
  hiddenNature: number; // mint / hidden nature (0..24)
  abilityNum: number; // 0 | 1 | 2 (slot into species.abilities)
  ivs: Stats6;
  evs: Stats6;
  experience: number;
  friendship: number;
  pokeball: number;
  isEgg: boolean;
  isShiny: boolean;
  nickname: string;
  otName: string;
  checksumValid: boolean;
  /** Present for party mons (stored level + battle stats). */
  level?: number;
  battleStats?: Stats6 & { maxHp: number };
}

export interface Trainer {
  name: string;
  gender: number; // 0 male, 1 female
  trainerId: number;
  publicId: number;
}

export interface BoxMon extends DecodedMon {
  box: number;
  slot: number;
}

export interface ParsedSave {
  trainer: Trainer;
  party: DecodedMon[];
  boxes: BoxMon[][]; // [boxIndex][...mons present]
  currentBox: number;
  meta: { validSectors: number; activeCounter: number };
}

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);

/** Reassemble the newest copy of each logical sector into one buffer per block. */
function reconstruct(bytes: Uint8Array) {
  // For each logical sector id, keep the copy with the highest save counter.
  const best = new Map<number, { off: number; counter: number }>();
  let validSectors = 0;
  let activeCounter = 0;
  for (let s = 0; s < SECTORS_COUNT; s++) {
    const off = s * SECTOR_SIZE;
    const view = new DataView(bytes.buffer, bytes.byteOffset + off, SECTOR_SIZE);
    if (u32(view, OFF_SIGNATURE) !== SIGNATURE) continue;
    validSectors++;
    const id = u16(view, OFF_ID);
    const counter = u32(view, OFF_COUNTER);
    activeCounter = Math.max(activeCounter, counter);
    const prev = best.get(id);
    if (!prev || counter > prev.counter) best.set(id, { off, counter });
  }

  const blockFromIds = (ids: number[]) => {
    const out = new Uint8Array(ids.length * SECTOR_DATA_SIZE);
    ids.forEach((id, i) => {
      const b = best.get(id);
      if (b) out.set(bytes.subarray(b.off, b.off + SECTOR_DATA_SIZE), i * SECTOR_DATA_SIZE);
    });
    return out;
  };

  return {
    sb2: blockFromIds([SECTOR_ID_SAVEBLOCK2]),
    sb1: blockFromIds(SECTOR_ID_SB1),
    storage: blockFromIds(SECTOR_ID_STORAGE),
    validSectors,
    activeCounter,
  };
}

function decodeMon(src: Uint8Array, base: number, isParty: boolean): DecodedMon | null {
  const v = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const personality = u32(v, base + 0);
  const otId = u32(v, base + 4);

  const flags = v.getUint8(base + 19);
  const hasSpecies = (flags >> 1) & 1;
  if (!hasSpecies && personality === 0 && otId === 0) return null;

  const b18 = v.getUint8(base + 18);
  const hiddenNatureModifier = (b18 >> 3) & 0x1f;
  const isEgg = ((flags >> 2) & 1) === 1;

  const checksumStored = u16(v, base + 28);
  const shinyModifier = (u16(v, base + 30) >> 14) & 1;

  // Decrypt the 48-byte secure block (XOR key = personality ^ otId, per u32).
  const key = (personality ^ otId) >>> 0;
  const dec = new Uint8Array(48);
  const decView = new DataView(dec.buffer);
  let sum = 0;
  for (let j = 0; j < 12; j++) {
    const word = (u32(v, base + 32 + j * 4) ^ key) >>> 0;
    decView.setUint32(j * 4, word, true);
    sum = (sum + (word & 0xffff) + (word >>> 16)) & 0xffff;
  }
  const checksumValid = sum === checksumStored;

  // Locate each substruct via the personality-based ordering.
  const order = SUBSTRUCT_ORDER[personality % 24];
  const at = (type: number) => order.indexOf(LETTER[type]) * 12;
  const g = at(0), a = at(1), e = at(2), m = at(3);

  const species = u16(decView, g + 0) & 0x7ff;
  const heldItem = u16(decView, g + 2) & 0x3ff;
  const experience = u32(decView, g + 4) & 0x1fffff;
  const friendship = decView.getUint8(g + 9);
  const pokeball = u16(decView, g + 10) & 0x3f;

  const moves = [0, 2, 4, 6].map((o) => u16(decView, a + o) & 0x7ff);
  const pp = [8, 9, 10, 11].map((o) => decView.getUint8(a + o) & 0x7f);

  const evs: Stats6 = {
    hp: decView.getUint8(e + 0),
    atk: decView.getUint8(e + 1),
    def: decView.getUint8(e + 2),
    spe: decView.getUint8(e + 3),
    spa: decView.getUint8(e + 4),
    spd: decView.getUint8(e + 5),
  };

  const ivWord = u32(decView, m + 4);
  const ivs: Stats6 = {
    hp: ivWord & 0x1f,
    atk: (ivWord >>> 5) & 0x1f,
    def: (ivWord >>> 10) & 0x1f,
    spe: (ivWord >>> 15) & 0x1f,
    spa: (ivWord >>> 20) & 0x1f,
    spd: (ivWord >>> 25) & 0x1f,
  };
  const miscWord2 = u32(decView, m + 8);
  const abilityNum = (miscWord2 >>> 29) & 0x3;

  const nature = personality % 25;
  const hiddenNatureXor = nature ^ hiddenNatureModifier;
  const hiddenNature = hiddenNatureXor <= 24 ? hiddenNatureXor : nature;

  const shinyVal =
    ((otId >>> 16) ^ (otId & 0xffff) ^ (personality >>> 16) ^ (personality & 0xffff)) & 0xffff;
  const classicShiny = shinyVal < 8;
  const isShiny = shinyModifier ? !classicShiny : classicShiny;

  const mon: DecodedMon = {
    personality,
    otId,
    species,
    heldItem,
    moves,
    pp,
    nature,
    hiddenNature,
    abilityNum,
    ivs,
    evs,
    experience,
    friendship,
    pokeball,
    isEgg,
    isShiny,
    nickname: decodeGen3Text(src.subarray(base + 8, base + 18)),
    otName: decodeGen3Text(src.subarray(base + 20, base + 27)),
    checksumValid,
  };

  if (isParty) {
    mon.level = v.getUint8(base + 84);
    mon.battleStats = {
      hp: u16(v, base + 86),
      maxHp: u16(v, base + 88),
      atk: u16(v, base + 90),
      def: u16(v, base + 92),
      spe: u16(v, base + 94),
      spa: u16(v, base + 96),
      spd: u16(v, base + 98),
    };
  }
  return mon;
}

export function parseSaveFile(input: ArrayBuffer | Uint8Array): ParsedSave {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < SECTORS_COUNT * SECTOR_SIZE - SECTOR_SIZE) {
    throw new Error(
      `Save file is ${bytes.length} bytes; expected a 128 KB Gen 3 (.sav) file.`
    );
  }

  const { sb1, sb2, storage, validSectors, activeCounter } = reconstruct(bytes);
  if (validSectors === 0) {
    throw new Error("No valid save sectors found. Is this an Emerald .sav file?");
  }

  // Trainer (SaveBlock2)
  const sb2v = new DataView(sb2.buffer, sb2.byteOffset, sb2.byteLength);
  const trainerId = u32(sb2v, 0x0a);
  const trainer: Trainer = {
    name: decodeGen3Text(sb2.subarray(0, 7)),
    gender: sb2v.getUint8(0x08),
    trainerId,
    publicId: trainerId & 0xffff,
  };

  // Party (SaveBlock1)
  const sb1v = new DataView(sb1.buffer, sb1.byteOffset, sb1.byteLength);
  const count = Math.min(sb1v.getUint8(SB1_PARTY_COUNT), PARTY_SIZE);
  const party: DecodedMon[] = [];
  for (let i = 0; i < count; i++) {
    const mon = decodeMon(sb1, SB1_PARTY + i * MON_SIZE, true);
    if (mon) party.push(mon);
  }

  // Boxes (PokemonStorage)
  const currentBox = storage[0];
  const boxes: BoxMon[][] = Array.from({ length: TOTAL_BOXES }, () => []);
  for (let box = 0; box < TOTAL_BOXES; box++) {
    for (let slot = 0; slot < IN_BOX_COUNT; slot++) {
      const base = STORAGE_BOXES + (box * IN_BOX_COUNT + slot) * BOX_MON_SIZE;
      const mon = decodeMon(storage, base, false);
      if (mon) boxes[box].push({ ...mon, box, slot });
    }
  }

  return {
    trainer,
    party,
    boxes,
    currentBox,
    meta: { validSectors, activeCounter },
  };
}
