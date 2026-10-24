# Aion 2 Craft Lab

A fully client-side Angular app (standalone components, no backend, no database, no auth, no env vars) for planning Aion 2 crafting: recursive material expansion, inventory deduction, buy-or-craft choices, and profitability from **manually entered** Auction House prices.

## Important: recipe data coverage

**The bundled dataset is empty (0 recipes).** Aion2.gg's Terms of Use (https://aion2.gg/terms) forbid bulk downloading, dataset building and re-hosting, and its robots.txt disallows `/api/` and `/data-dump/`. Nothing was scraped and nothing was invented. See [docs/DATA-COVERAGE.md](docs/DATA-COVERAGE.md) (regenerate with `npm run coverage`).

Add recipes by:
1. Entering them in the **Recipes** page (stored in your browser only).
2. Importing a JSON recipe pack (`{ "items": [...], "recipes": [...] }`) on the **Data** page.
3. Maintainers: `npm run import:recipes -- --in <local-file> --source-url <url> --permission "<who/where permission was granted>"` converts a local file into `public/data/*.json` and updates the manifest. It never downloads anything.

The Auction House fee default (10%) is an unverified placeholder; change it in Settings.

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

CSV columns. Prices: `itemId` or `itemName`, `buyPrice`, `sellListingPrice`, `quantityObserved`, `feePercent`, `observedAt`, `server`, `notes`. Inventory: `itemId` or `itemName`, `quantity`.

## Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel (or run `npx vercel`).
2. Settings are read from `vercel.json` (build `npm run build`, output `dist/aion2-craft-lab/browser`, SPA rewrite to `/index.html`). Framework preset: Other.
3. No environment variables are needed. Deploy.

Deployment itself has not been performed from this repository; only configuration and docs are provided.
