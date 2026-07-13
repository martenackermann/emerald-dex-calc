import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { parseSaveFile } from "./index";

// --- Minimal encoder mirroring the decode path, to build known fixtures ------

const SUBSTRUCT_ORDER = [
  "GAEM", "GAME", "GEAM", "GEMA", "GMAE", "GMEA",
  "AGEM", "AGME", "AEGM", "AEMG", "AMGE", "AMEG",
  "EGAM", "EGMA", "EAGM", "EAMG", "EMGA", "EMAG",
  "MGAE", "MGEA", "MAGE", "MAEG", "MEGA", "MEAG",
];
const LETTER = "GAEM";

interface Fields {
  personality: number;
  otId: number;
  species: number;
  heldItem: number;
  experience: number;
  friendship: number;
  pokeball: number;
  moves: number[];
  pp: number[];
  evs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  ivs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  abilityNum: number;
}

function encodeBoxMon(f: Fields, isParty: boolean, level = 0): Uint8Array {
  const size = isParty ? 100 : 80;
  const buf = new Uint8Array(size);
  const v = new DataView(buf.buffer);
  v.setUint32(0, f.personality >>> 0, true);
  v.setUint32(4, f.otId >>> 0, true);
  buf[19] = 0b10; // hasSpecies bit

  // Build the four 12-byte substructs.
  const growth = new Uint8Array(12);
  const gv = new DataView(growth.buffer);
  gv.setUint16(0, f.species & 0x7ff, true);
  gv.setUint16(2, f.heldItem & 0x3ff, true);
  gv.setUint32(4, f.experience & 0x1fffff, true);
  growth[9] = f.friendship;
  gv.setUint16(10, f.pokeball & 0x3f, true);

  const atk = new Uint8Array(12);
  const av = new DataView(atk.buffer);
  [0, 2, 4, 6].forEach((o, i) => av.setUint16(o, f.moves[i] & 0x7ff, true));
  [8, 9, 10, 11].forEach((o, i) => (atk[o] = f.pp[i] & 0x7f));

  const ev = new Uint8Array(12);
  ev[0] = f.evs.hp; ev[1] = f.evs.atk; ev[2] = f.evs.def;
  ev[3] = f.evs.spe; ev[4] = f.evs.spa; ev[5] = f.evs.spd;

  const misc = new Uint8Array(12);
  const mv = new DataView(misc.buffer);
  const ivWord =
    (f.ivs.hp & 0x1f) |
    ((f.ivs.atk & 0x1f) << 5) |
    ((f.ivs.def & 0x1f) << 10) |
    ((f.ivs.spe & 0x1f) << 15) |
    ((f.ivs.spa & 0x1f) << 20) |
    ((f.ivs.spd & 0x1f) << 25);
  mv.setUint32(4, ivWord >>> 0, true);
  mv.setUint32(8, (f.abilityNum & 0x3) << 29, true);

  const subs = [growth, atk, ev, misc];
  const order = SUBSTRUCT_ORDER[f.personality % 24];
  const decrypted = new Uint8Array(48);
  for (let type = 0; type < 4; type++) {
    const pos = order.indexOf(LETTER[type]);
    decrypted.set(subs[type], pos * 12);
  }

  // checksum over decrypted u16s, then XOR-encrypt into the buffer
  const dv = new DataView(decrypted.buffer);
  let sum = 0;
  for (let i = 0; i < 24; i++) sum = (sum + dv.getUint16(i * 2, true)) & 0xffff;
  v.setUint16(28, sum, true);

  const key = (f.personality ^ f.otId) >>> 0;
  for (let j = 0; j < 12; j++) {
    const word = (dv.getUint32(j * 4, true) ^ key) >>> 0;
    v.setUint32(32 + j * 4, word, true);
  }

  if (isParty) v.setUint8(84, level);
  return buf;
}

// Wrap a single party mon into a full 128 KB save so parseSaveFile can read it.
function buildSaveWithParty(mon: Uint8Array): Uint8Array {
  const save = new Uint8Array(32 * 4096);
  const writeSector = (physical: number, id: number, data: Uint8Array, counter: number) => {
    const off = physical * 4096;
    save.set(data.subarray(0, Math.min(data.length, 3968)), off);
    const fv = new DataView(save.buffer, off, 4096);
    fv.setUint16(0xff4, id, true);
    fv.setUint32(0xff8, 0x08012025, true);
    fv.setUint32(0xffc, counter, true);
  };
  // SaveBlock1 spans logical ids 1..4; party lives at 0x238 in the concatenation.
  const sb1 = new Uint8Array(4 * 3968);
  sb1[0x234] = 1; // party count
  sb1.set(mon, 0x238);
  for (let i = 0; i < 4; i++) {
    writeSector(1 + i, 1 + i, sb1.subarray(i * 3968, (i + 1) * 3968), 5);
  }
  writeSector(0, 0, new Uint8Array(3968), 5); // empty SaveBlock2
  for (let i = 0; i < 9; i++) writeSector(5 + i, 5 + i, new Uint8Array(3968), 5);
  return save;
}

const sample: Fields = {
  personality: 0x12345678,
  otId: 0x0000abcd,
  species: 6, // Charizard
  heldItem: 4, // Master Ball
  experience: 125000,
  friendship: 70,
  pokeball: 4,
  moves: [53, 17, 45, 22], // Flamethrower, Wing Attack, Growl, Vine Whip
  pp: [15, 35, 40, 25],
  evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
  ivs: { hp: 31, atk: 5, def: 30, spa: 31, spd: 29, spe: 31 },
  abilityNum: 1,
};

describe("expansion mon decoder (fixture round-trip)", () => {
  const save = buildSaveWithParty(encodeBoxMon(sample, true, 50));
  const parsed = parseSaveFile(save);
  const mon = parsed.party[0];

  it("finds the party mon with a valid checksum", () => {
    expect(parsed.party).toHaveLength(1);
    expect(mon.checksumValid).toBe(true);
  });
  it("decodes growth fields", () => {
    expect(mon.species).toBe(sample.species);
    expect(mon.heldItem).toBe(sample.heldItem);
    expect(mon.experience).toBe(sample.experience);
    expect(mon.friendship).toBe(sample.friendship);
    expect(mon.pokeball).toBe(sample.pokeball);
  });
  it("decodes moves, EVs, IVs and ability slot", () => {
    expect(mon.moves).toEqual(sample.moves);
    expect(mon.evs).toEqual(sample.evs);
    expect(mon.ivs).toEqual(sample.ivs);
    expect(mon.abilityNum).toBe(sample.abilityNum);
  });
  it("derives nature from personality and reads stored level", () => {
    expect(mon.nature).toBe(sample.personality % 25);
    expect(mon.level).toBe(50);
  });

  // Every ordering permutation must round-trip (guards the substruct shuffle).
  it("round-trips across all 24 personality orderings", () => {
    for (let k = 0; k < 24; k++) {
      const f = { ...sample, personality: (0x1000 * 24 + k) >>> 0 };
      const p = parseSaveFile(buildSaveWithParty(encodeBoxMon(f, true, 30)));
      expect(p.party[0].species).toBe(f.species);
      expect(p.party[0].ivs).toEqual(f.ivs);
      expect(p.party[0].checksumValid).toBe(true);
    }
  });
});

// Optional smoke test against a real .sav (container + party path). Gated so the
// public repo has no dependency on a local file. Run with:
//   SAMPLE_SAV="/path/to/Pokemon Emerald.sav" npx vitest run
describe.skipIf(!process.env.SAMPLE_SAV || !existsSync(process.env.SAMPLE_SAV))(
  "real save smoke test",
  () => {
    it("reconstructs sectors and reads a plausible trainer + party", () => {
      const bytes = new Uint8Array(readFileSync(process.env.SAMPLE_SAV!));
      const parsed = parseSaveFile(bytes);
      if (process.env.DUMP_SAVE) writeFileSync(process.env.DUMP_SAVE, JSON.stringify(parsed));
      // eslint-disable-next-line no-console
      console.log(
        "[real-save]",
        JSON.stringify({
          trainer: parsed.trainer,
          validSectors: parsed.meta.validSectors,
          partyCount: parsed.party.length,
          party: parsed.party.map((m) => ({
            species: m.species,
            level: m.level,
            nature: m.nature,
            item: m.heldItem,
          })),
        })
      );
      expect(parsed.meta.validSectors).toBeGreaterThan(0);
      expect(parsed.party.length).toBeGreaterThan(0);
      expect(parsed.party.length).toBeLessThanOrEqual(6);
    });
  }
);
