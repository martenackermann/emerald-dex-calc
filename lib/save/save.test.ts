import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseSaveFile } from "./index";
// Shared encoder (also used by scripts/make-sample-save.mjs)
import { encodeMon, buildSave, personalityForNature } from "./encode.mjs";

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

const sample: Fields = {
  personality: 0x12345678,
  otId: 0x0000abcd,
  species: 6, // Charizard
  heldItem: 4, // Master Ball
  experience: 125000,
  friendship: 70,
  pokeball: 4,
  moves: [53, 17, 45, 22],
  pp: [15, 35, 40, 25],
  evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
  ivs: { hp: 31, atk: 5, def: 30, spa: 31, spd: 29, spe: 31 },
  abilityNum: 1,
};

const partySave = (f: Fields, level: number) =>
  buildSave({ party: [encodeMon({ ...f, level }, true)] });

describe("expansion mon decoder (fixture round-trip)", () => {
  const parsed = parseSaveFile(partySave(sample, 50));
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

  it("round-trips across all 24 personality orderings", () => {
    for (let k = 0; k < 24; k++) {
      const f = { ...sample, personality: (0x1000 * 24 + k) >>> 0 };
      const p = parseSaveFile(partySave(f, 30));
      expect(p.party[0].species).toBe(f.species);
      expect(p.party[0].ivs).toEqual(f.ivs);
      expect(p.party[0].checksumValid).toBe(true);
    }
  });
});

describe("full save container (trainer, nicknames, boxes @ +0x0001)", () => {
  const pika = encodeMon(
    {
      personality: personalityForNature(13, 7), // Jolly
      otId: 0xa1b2c3,
      species: 25,
      heldItem: 0,
      experience: 8000,
      moves: [85, 98],
      pp: [15, 30],
      abilityNum: 0,
      nickname: "SPARKY",
      otName: "EMERALD",
    },
    false
  );
  const save = buildSave({
    trainer: { name: "EMERALD", gender: 0, trainerId: 0xa1b2c3 },
    party: [encodeMon({ ...sample, nickname: "ZARD", otName: "EMERALD", level: 55 }, true)],
    boxes: [{ box: 2, slot: 4, data: pika }],
  });
  const parsed = parseSaveFile(save);

  it("reads the trainer block", () => {
    expect(parsed.trainer.name).toBe("EMERALD");
    expect(parsed.trainer.trainerId).toBe(0xa1b2c3);
  });
  it("decodes nicknames and OT names", () => {
    expect(parsed.party[0].nickname).toBe("ZARD");
    expect(parsed.party[0].otName).toBe("EMERALD");
  });
  it("finds the box mon at the expansion offset with correct data", () => {
    const box2 = parsed.boxes[2];
    expect(box2).toHaveLength(1);
    expect(box2[0].slot).toBe(4);
    expect(box2[0].species).toBe(25);
    expect(box2[0].nickname).toBe("SPARKY");
    expect(box2[0].nature).toBe(13); // Jolly via personalityForNature
    expect(box2[0].checksumValid).toBe(true);
  });
});

// Round-trip of the generated sample file (run `npm run make:sav` first)
const SAMPLE = join(__dirname, "..", "..", "public", "sample-expansion.sav");
describe.skipIf(!existsSync(SAMPLE))("generated sample-expansion.sav", () => {
  it("parses with a full party and box mons", () => {
    const parsed = parseSaveFile(new Uint8Array(readFileSync(SAMPLE)));
    expect(parsed.trainer.name).toBe("EMERALD");
    expect(parsed.party.length).toBe(6);
    expect(parsed.party.every((m) => m.checksumValid)).toBe(true);
    expect(parsed.boxes.flat().length).toBeGreaterThanOrEqual(5);
  });
});

// Optional smoke test against a real .sav:
//   SAMPLE_SAV="/path/to/Pokemon Emerald.sav" npx vitest run
describe.skipIf(!process.env.SAMPLE_SAV || !existsSync(process.env.SAMPLE_SAV))(
  "real save smoke test",
  () => {
    it("reconstructs sectors and reads a plausible trainer + party", () => {
      const bytes = new Uint8Array(readFileSync(process.env.SAMPLE_SAV!));
      const parsed = parseSaveFile(bytes);
      expect(parsed.meta.validSectors).toBeGreaterThan(0);
      expect(parsed.party.length).toBeGreaterThan(0);
      expect(parsed.party.length).toBeLessThanOrEqual(6);
    });
  }
);
