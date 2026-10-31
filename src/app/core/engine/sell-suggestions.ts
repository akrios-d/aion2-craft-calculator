export interface SellCandidate {
  itemId: string;
  name: string;
  /** Units owned. */
  quantity: number;
  /** Market listing price per unit. */
  unitPrice: number;
  bound?: boolean;
}

export interface SellSuggestion {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  /** Gross listing value minus the Auction House fee. */
  netKinah: number;
}

const HIGH_RARITY = /\((unique|skin:[^)]*)\)/i;

/**
 * Suggests inventory items to sell for Kinah: tradable, not needed by the plans, and not of
 * a high-rarity kind (unique/skin). The catalogue has no rarity field, so this is a heuristic.
 * Ordered by net value, highest first. Never mutates its inputs.
 */
export function suggestSales(
  candidates: readonly SellCandidate[],
  neededItemIds: ReadonlySet<string>,
  feePercent: number,
  limit = 10,
): SellSuggestion[] {
  const keep = 1 - Math.min(Math.max(feePercent, 0), 100) / 100;
  return candidates
    .filter((c) => c.quantity > 0 && c.unitPrice > 0 && !c.bound && !neededItemIds.has(c.itemId) && !HIGH_RARITY.test(c.name))
    .map((c) => ({ itemId: c.itemId, name: c.name, quantity: c.quantity, unitPrice: c.unitPrice, netKinah: Math.floor(c.quantity * c.unitPrice * keep) }))
    .sort((a, b) => b.netKinah - a.netKinah)
    .slice(0, limit);
}
