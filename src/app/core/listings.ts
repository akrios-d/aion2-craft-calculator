import { PriceEntry } from './models';

/** All listing prices recorded for an entry (falls back to the single legacy listing price). */
export function listingsOf(p: PriceEntry): number[] {
  if (p.listings?.length) return p.listings;
  return p.sellListingPrice !== undefined ? [p.sellListingPrice] : [];
}

export function averagePrice(values: readonly number[]): number | undefined {
  if (!values.length) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Returns a copy with the given listings; `sellListingPrice` is their average so calculations use it. */
export function withListings(entry: PriceEntry, listings: readonly number[]): PriceEntry {
  const next: PriceEntry = { ...entry };
  if (listings.length) {
    next.listings = [...listings];
    next.sellListingPrice = averagePrice(listings);
  } else {
    delete next.listings;
    delete next.sellListingPrice;
  }
  return next;
}

/** Parses prices separated by commas, semicolons or whitespace. */
export function parsePriceList(text: string): { values: number[]; invalid: string[] } {
  const values: number[] = [];
  const invalid: string[] = [];
  for (const tok of text.split(/[\s,;]+/).filter(Boolean)) {
    if (/^\d+(\.\d+)?$/.test(tok)) values.push(Number(tok));
    else invalid.push(tok);
  }
  return { values, invalid };
}
