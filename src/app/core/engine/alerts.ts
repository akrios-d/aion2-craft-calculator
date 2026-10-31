import { PriceEntry } from '../models';

export interface PriceAlert {
  itemId: string;
  desired: number;
  market: number;
}

/** Items whose market price is at or below the price the user wants to pay. Pure; does not mutate inputs. */
export function findAlerts(prices: Readonly<Record<string, PriceEntry>>): PriceAlert[] {
  const out: PriceAlert[] = [];
  for (const p of Object.values(prices)) {
    const market = p.sellListingPrice;
    if (p.buyPrice === undefined || market === undefined || !(market > 0)) continue;
    if (market <= p.buyPrice) out.push({ itemId: p.itemId, desired: p.buyPrice, market });
  }
  return out;
}

/** Alerts not yet notified for their current market price; also returns the updated notified-key set. */
export function newAlerts(alerts: readonly PriceAlert[], notified: ReadonlySet<string>): { fresh: PriceAlert[]; keys: Set<string> } {
  const keys = new Set(alerts.map((a) => `${a.itemId}:${a.market}`));
  return { fresh: alerts.filter((a) => !notified.has(`${a.itemId}:${a.market}`)), keys };
}