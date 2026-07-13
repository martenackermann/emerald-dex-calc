# EmeraldDex — ROM-hack dex, save reader & damage calculator

A Next.js + shadcn/ui web app for a [pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion) ROM hack. It:

- **Reads your `.sav`** entirely in the browser (nothing is uploaded) and shows your **team & PC boxes** with natures, abilities, held items, moves, IVs and EVs.
- Ships a **Pokédex** that mirrors *every data change in the ROM hack* — species, base stats, types, abilities, learnsets and evolutions are extracted straight from the decomp source.
- Has a **damage calculator** — your team vs. any Pokémon, using your mons' real IVs/EVs/nature.
- Does **randomizer analysis** — for species you own, the dex overlays the natures, abilities and moves actually rolled in your save.

Companion ROM hack repo: **[martenackermann/pokeemerald-expansion](https://github.com/martenackermann/pokeemerald-expansion)**.

## How the data stays in sync with the ROM hack

The decomp is the single source of truth. `scripts/extract-data.mjs` parses the hack's C data files (`species_info/`, `moves_info.h`, `abilities.h`, `items.h`, learnsets, constants) into versioned JSON in `public/data/`. Re-run it whenever the hack's data changes:

```bash
ROMHACK_PATH=/path/to/pokeemerald-expansion npm run extract
```

`public/data/meta.json` records the exact decomp commit the data was generated from.

## Save format

The parser targets the **pokeemerald-expansion** save layout (bit-exact, from `include/pokemon.h` / `include/save.h` / `include/global.h`):

- Sector container, active-slot selection by save counter, checksum validation
- Party at `SaveBlock1 +0x238`, boxes at `PokemonStorage +0x0001`
- Gen-3 encryption (XOR `PID ^ OTID`, personality-shuffled substructs) with expansion's widened bitfields (11-bit species/moves, 10-bit items, explicit hidden-nature field, `abilityNum`)

> Vanilla Emerald saves share the container + party layout, so those decode too — but vanilla aligns box data at `+0x0004`, so PC boxes only read correctly from an actual expansion save.

## Develop

```bash
npm install
npm run extract      # generate public/data from the decomp (set ROMHACK_PATH)
npm run dev          # http://localhost:3000
npm test             # parser unit tests (fixture round-trip)
```

Built with Next.js 16 (App Router), Tailwind v4, shadcn/ui. Fully static — deploy to Vercel or any static host.
