import { PriceEntry } from '../models';

export interface PriceAlert {
  itemId: string;
  desired: number;
  market: number;
  direction: 'below' | 'above';
}

/** True when the market price crossed the alert price in the chosen direction (default: at or below). */
export function isReached(p: Pick<PriceEntry, 'sellListingPrice' | 'buyPrice' | 'alertDirection'>): boolean {
  const market = p.sellListingPrice;
  if (p.buyPrice === undefined || market === undefined || !(market > 0)) return false;
  return p.alertDirection === 'above' ? market >= p.buyPrice : market <= p.buyPrice;
}

/** Alerts whose market price crossed the user's alert price. Pure; does not mutate inputs. */
export function findAlerts(prices: readonly PriceEntry[]): PriceAlert[] {
  const out: PriceAlert[] = [];
  for (const p of prices) {
    if (isReached(p)) out.push({ itemId: p.itemId, desired: p.buyPrice!, market: p.sellListingPrice!, direction: p.alertDirection ?? 'below' });
  }
  return out;
}

/** Alerts not yet notified for their current market price; also returns the updated notified-key set. */
export function newAlerts(alerts: readonly PriceAlert[], notified: ReadonlySet<string>): { fresh: PriceAlert[]; keys: Set<string> } {
  const keys = new Set(alerts.map((a) => `${a.itemId}:${a.market}`));
  return { fresh: alerts.filter((a) => !notified.has(`${a.itemId}:${a.market}`)), keys };
}