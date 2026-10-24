import { Item, PriceEntry, Recipe, Strategy } from '../models';

export type IssueType =
  | 'missing-price'
  | 'missing-sell-price'
  | 'no-recipe'
  | 'circular-dependency'
  | 'unverified-recipe'
  | 'invalid-recipe'
  | 'invalid-input'
  | 'depth-limit';

export interface CalcIssue {
  type: IssueType;
  severity: 'error' | 'warning' | 'info';
  itemId?: string;
  message: string;
}

export interface CalcInput {
  targetItemId: string;
  quantity: number;
  recipes: Recipe[];
  items?: Item[];
  /** Current prices for the chosen server, keyed by item id. */
  prices: Record<string, PriceEntry>;
  /** Inventory quantities by item id. Never mutated. */
  inventory: Record<string, number>;
  strategies?: Record<string, Strategy>;
  recipeChoices?: Record<string, string>;
  defaultStrategy?: Strategy;
  defaultFeePercent?: number;
}

export type NodeAction = 'inventory' | 'craft' | 'buy' | 'circular';

export interface CraftNode {
  itemId: string;
  name: string;
  required: number;
  fromInventory: number;
  fromSurplus: number;
  toAcquire: number;
  action: NodeAction;
  recipeId?: string;
  batches: number;
  produced: number;
  unitPrice?: number;
  /** Cash cost of this subtree (purchases only). */
  cost: number;
  children: CraftNode[];
}

export interface PurchaseLine {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  cost: number;
}

export interface CraftLine {
  itemId: string;
  name: string;
  recipeId: string;
  batches: number;
  produced: number;
}

export interface InventoryUse {
  itemId: string;
  name: string;
  used: number;
  available: number;
  unitPrice?: number;
}

export interface Profitability {
  unitSellListing: number;
  feePercent: number;
  unitNetAfterFee: number;
  grossRevenue: number;
  feeAmount: number;
  netRevenue: number;
  /** Net revenue minus cash purchases (inventory treated as free). */
  profitCash: number;
  /** Net revenue minus cash purchases and inventory valued at buy price. */
  profitFull: number;
  marginPercent: number | null;
  roiPercent: number | null;
  /** False when some cost inputs are missing, so the numbers are optimistic. */
  complete: boolean;
}

export interface CalcResult {
  ok: boolean;
  tree: CraftNode | null;
  purchases: PurchaseLine[];
  crafts: CraftLine[];
  inventoryUsed: InventoryUse[];
  surplus: { itemId: string; name: string; quantity: number }[];
  cashCost: number;
  inventoryValue: number;
  fullCost: number;
  costComplete: boolean;
  profitability: Profitability | null;
  /** Cost to buy the finished target directly, when a buy price exists. */
  directBuyCost?: number;
  issues: CalcIssue[];
}

const MAX_DEPTH = 40;

export function auctionNetPrice(listingPrice: number, feePercent: number): number {
  return listingPrice * (1 - feePercent / 100);
}

/** Expected items per batch; below the output quantity for recipes with a chance (e.g. COMBO) result. */
const expectedYield = (r: Recipe): number => r.outputQuantity * (r.outputChance ?? 1);

export function validateRecipe(recipe: Recipe): string | null {
  if (!recipe.outputItemId) return 'missing output item';
  if (!Number.isInteger(recipe.outputQuantity) || recipe.outputQuantity <= 0) {
    return 'output quantity must be a positive integer';
  }
  if (recipe.outputChance !== undefined && !(recipe.outputChance > 0 && recipe.outputChance <= 1)) return 'output chance must be above 0 and at most 1';
  if (!recipe.ingredients?.length) return 'no ingredients';
  for (const ing of recipe.ingredients) {
    if (!ing.itemId) return 'ingredient without item id';
    if (!Number.isInteger(ing.quantity) || ing.quantity <= 0) {
      return `ingredient ${ing.itemId} has invalid quantity`;
    }
  }
  return null;
}

export function calculateCraft(input: CalcInput): CalcResult {
  const issues: CalcIssue[] = [];
  const names = new Map<string, string>();
  for (const it of input.items ?? []) names.set(it.id, it.name);
  const nameOf = (id: string) => names.get(id) ?? id;

  const issueKeys = new Set<string>();
  const addIssue = (issue: CalcIssue) => {
    const key = `${issue.type}|${issue.itemId ?? ''}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push(issue);
  };

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    addIssue({
      type: 'invalid-input',
      severity: 'error',
      message: 'Quantity must be a positive whole number.',
    });
    return {
      ok: false,
      tree: null,
      purchases: [],
      crafts: [],
      inventoryUsed: [],
      surplus: [],
      cashCost: 0,
      inventoryValue: 0,
      fullCost: 0,
      costComplete: false,
      profitability: null,
      issues,
    };
  }

  const recipesByOutput = new Map<string, Recipe[]>();
  for (const r of [...input.recipes].sort((a, b) => a.id.localeCompare(b.id))) {
    const err = validateRecipe(r);
    if (err) {
      addIssue({
        type: 'invalid-recipe',
        severity: 'warning',
        itemId: r.outputItemId,
        message: `Recipe ${r.id} ignored: ${err}.`,
      });
      continue;
    }
    const list = recipesByOutput.get(r.outputItemId) ?? [];
    list.push(r);
    recipesByOutput.set(r.outputItemId, list);
  }

  const pickRecipe = (itemId: string): Recipe | undefined => {
    const list = recipesByOutput.get(itemId);
    if (!list?.length) return undefined;
    const chosen = input.recipeChoices?.[itemId];
    return list.find((r) => r.id === chosen) ?? list[0];
  };
  const strategyOf = (itemId: string): Strategy =>
    input.strategies?.[itemId] ?? input.defaultStrategy ?? 'auto';
  const buyPriceOf = (itemId: string): number | undefined => {
    const p = input.prices[itemId]?.buyPrice;
    return p !== undefined && Number.isFinite(p) && p >= 0 ? p : undefined;
  };

  // Unit cost ignoring inventory; only used to decide the 'auto' strategy.
  const unitCost = (itemId: string, stack: string[]): number | undefined => {
    const buy = buyPriceOf(itemId);
    const recipe = pickRecipe(itemId);
    const strat = strategyOf(itemId);
    if (!recipe || strat === 'buy' || stack.includes(itemId)) return buy;
    const craft = unitCraftCost(recipe, stack);
    if (strat === 'craft') return craft;
    if (craft === undefined) return buy;
    if (buy === undefined) return craft;
    return Math.min(craft, buy);
  };
  const unitCraftCost = (recipe: Recipe, stack: string[]): number | undefined => {
    let total = 0;
    for (const ing of recipe.ingredients) {
      const c = unitCost(ing.itemId, [...stack, recipe.outputItemId]);
      if (c === undefined) return undefined;
      total += c * ing.quantity;
    }
    return total / expectedYield(recipe);
  };

  const inventoryLeft = new Map<string, number>();
  for (const [id, q] of Object.entries(input.inventory)) {
    if (Number.isFinite(q) && q > 0) inventoryLeft.set(id, q);
  }
  const surplus = new Map<string, number>();
  const inventoryUsed = new Map<string, number>();
  const purchases = new Map<string, number>();
  const crafts = new Map<string, CraftLine>();

  const need = (itemId: string, qty: number, stack: string[], isTarget: boolean): CraftNode => {
    const node: CraftNode = {
      itemId,
      name: nameOf(itemId),
      required: qty,
      fromInventory: 0,
      fromSurplus: 0,
      toAcquire: 0,
      action: 'inventory',
      batches: 0,
      produced: 0,
      cost: 0,
      children: [],
    };

    // Surplus from earlier batches is consumed first, then inventory.
    let remaining = qty;
    const fromSurplus = Math.min(surplus.get(itemId) ?? 0, remaining);
    if (fromSurplus > 0) {
      surplus.set(itemId, (surplus.get(itemId) ?? 0) - fromSurplus);
      node.fromSurplus = fromSurplus;
      remaining -= fromSurplus;
    }
    const fromInv = Math.min(inventoryLeft.get(itemId) ?? 0, remaining);
    if (fromInv > 0) {
      inventoryLeft.set(itemId, (inventoryLeft.get(itemId) ?? 0) - fromInv);
      inventoryUsed.set(itemId, (inventoryUsed.get(itemId) ?? 0) + fromInv);
      node.fromInventory = fromInv;
      remaining -= fromInv;
    }
    node.toAcquire = remaining;
    if (remaining === 0) return node;

    const recipe = pickRecipe(itemId);
    const circular = stack.includes(itemId);
    if (circular) {
      addIssue({
        type: 'circular-dependency',
        severity: 'error',
        itemId,
        message: `Circular dependency: ${[...stack, itemId].map(nameOf).join(' → ')}.`,
      });
    }
    const tooDeep = stack.length >= MAX_DEPTH;
    if (tooDeep) {
      addIssue({
        type: 'depth-limit',
        severity: 'error',
        itemId,
        message: `Crafting chain deeper than ${MAX_DEPTH} levels at ${nameOf(itemId)}.`,
      });
    }

    let craft = false;
    if (recipe && !circular && !tooDeep) {
      const strat = isTarget ? 'craft' : strategyOf(itemId);
      if (strat === 'craft') craft = true;
      else if (strat === 'auto') {
        const buy = buyPriceOf(itemId);
        const craftUnit = unitCraftCost(recipe, stack);
        if (buy !== undefined && craftUnit !== undefined) craft = craftUnit <= buy;
        else craft = buy === undefined;
      }
    }

    if (craft && recipe) {
      node.action = 'craft';
      node.recipeId = recipe.id;
      node.batches = Math.ceil(remaining / expectedYield(recipe));
      node.produced = recipe.outputChance === undefined ? node.batches * recipe.outputQuantity : remaining;
      const extra = node.produced - remaining;
      if (extra > 0) surplus.set(itemId, (surplus.get(itemId) ?? 0) + extra);
      const line = crafts.get(itemId) ?? {
        itemId,
        name: nameOf(itemId),
        recipeId: recipe.id,
        batches: 0,
        produced: 0,
      };
      line.batches += node.batches;
      line.produced += node.produced;
      crafts.set(itemId, line);
      if (recipe.verification !== 'verified') {
        addIssue({
          type: 'unverified-recipe',
          severity: 'warning',
          itemId,
          message: `Recipe for ${nameOf(itemId)} is ${recipe.verification}; check it in game.`,
        });
      }
      for (const ing of recipe.ingredients) {
        const child = need(ing.itemId, ing.quantity * node.batches, [...stack, itemId], false);
        node.children.push(child);
        node.cost += child.cost;
      }
      return node;
    }

    node.action = circular ? 'circular' : 'buy';
    if (!recipe && !circular) {
      addIssue({
        type: 'no-recipe',
        severity: isTarget ? 'error' : 'info',
        itemId,
        message: isTarget
          ? `No recipe found for ${nameOf(itemId)}.`
          : `No recipe known for ${nameOf(itemId)}; treated as a purchased or gathered material.`,
      });
    }
    purchases.set(itemId, (purchases.get(itemId) ?? 0) + remaining);
    const price = buyPriceOf(itemId);
    if (price === undefined) {
      addIssue({
        type: 'missing-price',
        severity: 'warning',
        itemId,
        message: `No buy price entered for ${nameOf(itemId)}; its cost is not included.`,
      });
    } else {
      node.unitPrice = price;
      node.cost = price * remaining;
    }
    return node;
  };

  const tree = need(input.targetItemId, input.quantity, [], true);

  const purchaseLines: PurchaseLine[] = [...purchases.entries()]
    .map(([itemId, quantity]) => {
      const unitPrice = buyPriceOf(itemId);
      return {
        itemId,
        name: nameOf(itemId),
        quantity,
        unitPrice,
        cost: unitPrice === undefined ? 0 : unitPrice * quantity,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  let inventoryValue = 0;
  let costComplete = purchaseLines.every((p) => p.unitPrice !== undefined);
  const inventoryLines: InventoryUse[] = [...inventoryUsed.entries()]
    .map(([itemId, used]) => {
      const unitPrice = buyPriceOf(itemId);
      if (unitPrice === undefined) costComplete = false;
      else inventoryValue += unitPrice * used;
      return {
        itemId,
        name: nameOf(itemId),
        used,
        available: input.inventory[itemId] ?? 0,
        unitPrice,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const cashCost = purchaseLines.reduce((s, p) => s + p.cost, 0);
  const fullCost = cashCost + inventoryValue;

  let profitability: Profitability | null = null;
  const sellEntry = input.prices[input.targetItemId];
  const sell = sellEntry?.sellListingPrice;
  if (sell === undefined || !Number.isFinite(sell) || sell < 0) {
    addIssue({
      type: 'missing-sell-price',
      severity: 'warning',
      itemId: input.targetItemId,
      message: `No sell listing price entered for ${nameOf(input.targetItemId)}; profitability unavailable.`,
    });
  } else {
    const feePercent = sellEntry.feePercent ?? input.defaultFeePercent ?? 0;
    const unitNet = auctionNetPrice(sell, feePercent);
    const gross = sell * input.quantity;
    const net = unitNet * input.quantity;
    const profitFull = net - fullCost;
    profitability = {
      unitSellListing: sell,
      feePercent,
      unitNetAfterFee: unitNet,
      grossRevenue: gross,
      feeAmount: gross - net,
      netRevenue: net,
      profitCash: net - cashCost,
      profitFull,
      marginPercent: net > 0 ? (profitFull / net) * 100 : null,
      roiPercent: fullCost > 0 ? (profitFull / fullCost) * 100 : null,
      complete: costComplete,
    };
  }

  const directBuy = buyPriceOf(input.targetItemId);
  return {
    ok: !issues.some((i) => i.severity === 'error'),
    tree,
    purchases: purchaseLines,
    crafts: [...crafts.values()].sort((a, b) => a.name.localeCompare(b.name)),
    inventoryUsed: inventoryLines,
    surplus: [...surplus.entries()]
      .filter(([, q]) => q > 0)
      .map(([itemId, quantity]) => ({ itemId, name: nameOf(itemId), quantity })),
    cashCost,
    inventoryValue,
    fullCost,
    costComplete,
    profitability,
    directBuyCost: directBuy === undefined ? undefined : directBuy * input.quantity,
    issues,
  };
}
