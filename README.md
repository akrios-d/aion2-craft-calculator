# Aion 2 Craft Lab

A fully client-side Angular app (standalone components, no backend, no database, no auth, no env vars) for planning Aion 2 crafting: recursive material expansion, inventory deduction, buy-or-craft choices, and profitability from **manually entered** Auction House prices.

## Important: recipe data coverage

The bundled dataset has 463 recipes and 684 items from Aion2.gg (see [docs/DATA-COVERAGE.md](docs/DATA-COVERAGE.md), regenerate with `npm run coverage`). Output quantity is assumed to be 1 because the source pages do not show it; identical Elyos/Asmodian variants are merged into one.

Refresh the data: `node scripts/fetch-aion2gg.mjs` (reads public recipe pages with a delay, writes `tmp/aion2gg-pack.json`), then `npm run import:recipes -- --in tmp/aion2gg-pack.json --source-url https://aion2.gg --permission "<who/when>"`.

You can also add recipes by:
1. Entering them in the **Recipes** page (stored in your browser only).
2. Importing a JSON recipe pack (`{ "items": [...], "recipes": [...] }`) on the **Data** page.
3. Maintainers: `npm run import:recipes -- --in <local-file> --source-url <url> --permission "<who/where permission was granted>"` converts a local file into `public/data/*.json` and updates the manifest. It never downloads anything.
4. **Substance Morph:** `npm run import:morph` adds 29 recipes that convert 1 Odyle (Odyle / Fine / Pure / Radiant, matching the material's grade) into a gatherable ore, gem, log, herb or cooking ingredient. Source is game8.co, so they are marked `unverified`. Run it again after every `import:recipes`. In the calculator, a material with a price and a morph recipe uses the "auto" buy/craft strategy, so Odyle is used when it is cheaper than buying; weekly limits and success chances are not modelled.
5. **COMBO results:** `node scripts/add-combo-recipes.mjs --delay 250` adds a `combo-<id>` recipe for each craft that can produce a COMBO item (e.g. Splendent gear), with `outputChance` set to the page's per-craft chance (lowest proficiency). Plans use the expected yield, so costs are averages. It also flags same-name Bind-on-pickup items. Run it after `import:morph`.The Auction House fee default (10%) is an unverified placeholder; change it in Settings.

## Local setup

```
npm ci
npm start          # dev server on http://localhost:4200
npm test -- --watch=false
npm run build      # output: dist/aion2-craft-lab/browser
```

## Features

- Pure TypeScript engine (`src/app/core/engine`): recursion, aggregation, whole-batch rounding, cycle detection, inventory deduction (never mutates), per-component buy/craft, fees, profit, issue reporting.
- LocalStorage persistence with versioned schema and migrations (`src/app/core/storage`); corrupted/unavailable storage shows a banner with restore-from-backup, raw download, or start fresh.
- CSV import (prices, inventory) and JSON backup/restore, each with validation, duplicate detection, preview, and explicit merge/replace. Never silent overwrites.
- Dataset updates: user data is matched by stable item id (`previousIds` supported); unmatched records are reported, never deleted.
- Prices are listing prices observed by the user, not completed sales. Default server: Zikel SA.
- Two independent language options (header and Settings): **interface language** (English / Português) and **item-name language** (English / Português). Portuguese item names come from the pt-br Aion2.gg pages (`node scripts/fetch-aion2gg-names.mjs`, writes `names.pt` into `public/data/items.json`). Items without a Portuguese name fall back to English.

CSV columns. Prices: `itemId` or `itemName`, `price` (current price; repeat the item on several rows to add several prices, the average is used), optional `buyPrice`. Inventory: `itemId` or `itemName`, `quantity`.

## Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel (or run `npx vercel`).
2. Settings are read from `vercel.json` (build `npm run build`, output `dist/aion2-craft-lab/browser`, SPA rewrite to `/index.html`). Framework preset: Other.
3. No environment variables are needed. Deploy.

Deployment itself has not been performed from this repository; only configuration and docs are provided.

- Item icons are linked from the Aion2.gg image CDN (not bundled); refresh with `node scripts/fetch-aion2gg-icons.mjs`. The calculator's item picker is a searchable list.

## Characters

The inventory is account-wide. Each character has its own buy/craft strategies, recipe choices and saved craft plans. Inventory, prices, price history and settings are shared. Use the character selector in the header to create, rename, switch or delete characters; JSON backups include all characters.

