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
5. **COMBO results:** `node scripts/add-combo-recipes.mjs --delay 250` adds a `combo-<id>` recipe for each craft that can produce a COMBO item (e.g. Splendent gear), at the base recipe's cost (the COMBO chance is only noted in the recipe notes and is not used in costs). It also flags same-name Bind-on-pickup items. Run it after `import:morph`, then `node scripts/link-transfer-recipes.mjs`, which gives COMBO items that have a Bind-on-pickup twin the twin's upgrade recipe (1x base item + a few materials).The Auction House fee default (10%) is an unverified placeholder; change it in Settings.

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

## Armory and BiS

The **Armory and BiS** page shows a character's equipped gear and arcana cards and compares them with BiS lists that you define.

- **No automatic fetch.** CORS was verified with real requests: `api-search.plaync.com` rejects foreign origins (403) and `aion2.plaync.com/api/character/{info,equipment}` answers without `Access-Control-Allow-Origin`, so a browser cannot read them from this site. As requested, no proxy or serverless function was added for this feature. The page gives you the exact armory links; you open them in your own browser, copy the JSON and paste it into the page, which validates it and shows a preview before saving. (The separate, older proxy used by the Damage research page is unrelated to this feature.)
- **Only what the armory returns.** Items are read from `equipment.equipmentList` (slot, name, grade, enchant/exceed level, id, icon); arcana are slots 41-45. Nothing else is invented. Items carry NCSOFT ids, not catalogue ids, so BiS matching uses the armory id when you provide one, otherwise the item name.
- **Terms of use.** NCSOFT's terms (section 6) forbid automated access outside published interfaces, and the endpoints are undocumented and may change. This app only offers user-triggered, manual lookups, with no polling or scheduling. Characters you paste are cached in LocalStorage (last 10).
- **BiS data is yours.** No verified BiS source exists, so none is shipped. Create lists per class in the page, or import JSON (`[{"className","entries":[{"slot","name","id?","notes?"}]}]`) or CSV (columns `class,slot,item,id,notes`) with validation, preview, duplicate detection and merge/replace. Paired slots (rings, earrings, bracelets, runes, arcana) match in any slot of the pair/group. Missing BiS pieces that have a recipe in the catalogue can be added to your crafting plans.
- BiS lists and cached characters are stored in LocalStorage (schema v5), and included in JSON backup/restore.
## Characters

The inventory is account-wide. Each character has its own buy/craft strategies, recipe choices and saved craft plans. Inventory, prices, price history and settings are shared. Use the character selector in the header to create, rename, switch or delete characters; JSON backups include all characters.


## Character lookup (the only serverless exception)

The optional **Search character by name** box on the Damage research page calls pi/character.ts, a tiny Vercel function that proxies two read-only endpoints of the official NCSOFT site (search and character info). It needs no env vars or credentials, validates all input and only contacts those two hosts. It uses undocumented endpoints that may change or be restricted by NCSOFT, and it returns only profile and base attributes, not total attack, crit or amp. It does not work under `ng serve`; the rest of the app stays fully client-side.

## Market import (the only serverless exception)

Market prices are fetched automatically on load (Zikel LA by default) and merged as listing prices. Calculations use them by default; the **Total** tab has a switch to use the user's own "price I want to pay" instead, and suggests tradable surplus items to sell for Kinah (the catalogue has no rarity field, so unique/skin and bound items are excluded as a heuristic).


The **Import market prices** box on the Prices page calls `api/market.mjs`, a tiny Vercel function that reads public listing data from aion2.exchange (a third-party site, unofficial use, may change or block). It uses no env vars or credentials and contacts only that host. Prices are merged only after you confirm and are listing prices, not completed sales. Under `ng serve` it runs through `proxy.conf.mjs` (Node 22.6+). The rest of the app stays client-side.

## TODO

- **Price history** (not implemented): hourly snapshots of the aion2.exchange prices stored in MongoDB Atlas (M0, free).
  Vercel Hobby crons run at most once a day, so the plan is a GitHub Actions workflow (`cron: "15 * * * *"`) that calls a
  token-protected `api/snapshot` function, which writes to MongoDB (`MONGODB_URI` + token as env vars).
  The source only refreshes hourly (~:10), so more frequent runs add nothing.