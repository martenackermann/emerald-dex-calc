// Extracts front sprites from the pokeemerald-expansion decomp into
// public/sprites/<speciesId>.png. Each source anim_front.png is an animated
// sheet (frames stacked vertically) with a solid background color; we take the
// first frame and key the background color out to transparency.
//
// Usage:  ROMHACK_PATH=/path/to/pokeemerald-expansion node scripts/extract-sprites.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync, readFileSync as rf } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");
const ROM = process.env.ROMHACK_PATH ?? resolve(APP_ROOT, "..", "pokeemerald-expansion");
const OUT = join(APP_ROOT, "public", "sprites");
const GFX = join(ROM, "graphics", "pokemon");

const species = JSON.parse(rf(join(APP_ROOT, "public", "data", "species.json"), "utf8"));
mkdirSync(OUT, { recursive: true });

// Ordered candidate anim_front.png paths (relative to graphics/pokemon) for a
// species key. Handles base species and form species (e.g. SPECIES_DEOXYS_NORMAL
// -> deoxys/anim_front.png, SPECIES_RAICHU_ALOLAN -> raichu/alolan/anim_front.png
// falling back to raichu/anim_front.png).
function candidatePaths(key) {
  const parts = key.replace(/^SPECIES_/, "").toLowerCase().split("_");
  const out = [];
  for (let baseLen = parts.length; baseLen >= 1; baseLen--) {
    const bases = [...new Set([parts.slice(0, baseLen).join(""), parts.slice(0, baseLen).join("_")])];
    const rest = parts.slice(baseLen);
    const restVariants = rest.length ? [...new Set([rest.join("_"), rest.join("")])] : [];
    const files = ["anim_front.png", "front.png"]; // animated sheet or static
    for (const base of bases) {
      for (const r of restVariants) for (const f of files) out.push(join(base, r, f));
      for (const f of files) out.push(join(base, f));
    }
  }
  return out;
}

function processSprite(srcPath, dstPath) {
  const png = PNG.sync.read(readFileSync(srcPath));
  const w = png.width;
  const fh = Math.min(png.width, png.height); // square first frame
  const out = new PNG({ width: w, height: fh });
  const [br, bg, bb] = [png.data[0], png.data[1], png.data[2]]; // bg = top-left pixel
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * png.width + x) * 4;
      const di = (y * w + x) * 4;
      const r = png.data[si], g = png.data[si + 1], b = png.data[si + 2], a = png.data[si + 3];
      if (r === br && g === bg && b === bb) {
        out.data[di + 3] = 0; // background -> transparent
      } else {
        out.data[di] = r;
        out.data[di + 1] = g;
        out.data[di + 2] = b;
        out.data[di + 3] = a;
      }
    }
  }
  writeFileSync(dstPath, PNG.sync.write(out));
}

let done = 0;
let missing = 0;
for (const s of species) {
  let src = null;
  for (const cand of candidatePaths(s.key)) {
    const p = join(GFX, cand);
    if (existsSync(p)) { src = p; break; }
  }
  if (!src) { missing++; continue; }
  try {
    processSprite(src, join(OUT, `${s.id}.png`));
    done++;
  } catch (e) {
    missing++;
  }
}

console.log(`[sprites] wrote ${done} sprites to public/sprites; ${missing} species had no base-folder sprite (forms fall back in UI)`);
