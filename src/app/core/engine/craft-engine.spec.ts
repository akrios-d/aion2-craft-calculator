import { PriceEntry, Recipe } from '../models';
import { auctionNetPrice, calculateCraft, CalcInput, validateRecipe } from './craft-engine';

const rec = (id: string, out: string, outQty: number, ings: [string, number][], verification: Recipe['verification'] = 'verified'): Recipe => ({
  id,
  outputItemId: out,
  outputQuantity: outQty,
  ingredients: ings.map(([itemId, quantity]) => ({ itemId, quantity })),
  source: 'test',
  verification,
});

const price = (itemId: string, buyPrice?: number, sellListingPrice?: number, feePercent?: number): PriceEntry => ({
  itemId,
  server: 'Zikel SA',
  buyPrice,
  sellListingPrice,
  feePercent,
  observedAt: '2026-01-01T00:00:00.000Z',
});

const recipes: Recipe[] = [
  rec('sword', 'sword', 1, [['ingot', 2], ['handle', 1]]),
  rec('ingot', 'ingot', 2, [['ore', 3]]),
  rec('handle', 'handle', 1, [['wood', 1], ['ingot', 1]]),
];

const base = (over: Partial<CalcInput> = {}): CalcInput => ({
  targetItemId: 'sword',
  quantity: 3,
  recipes,
  prices: { ore: price('ore', 10), wood: price('wood', 5), sword: price('sword', undefined, 100) },
  inventory: {},
  defaultFeePercent: 10,
  ...over,
});

describe('calculateCraft: recursion, aggregation and batch rounding', () => {
  it('expands nested dependencies and aggregates duplicate ingredients across branches', () => {
    const r = calculateCraft(base());
    expect(r.ok).toBe(true);
    const ore = r.purchases.find((p) => p.itemId === 'ore')!;
    const wood = r.purchases.find((p) => p.itemId === 'wood')!;
    expect(wood.quantity).toBe(3);
    // 3 swords need 6 ingots directly + 3 via handles = 9 ingots -> 5 batches of 2 -> 15 ore
    expect(ore.quantity).toBe(15);
    expect(r.crafts.find((c) => c.itemId === 'ingot')).toMatchObject({ batches: 5, produced: 10 });
    expect(r.purchases.filter((p) => p.itemId === 'ore')).toHaveLength(1);
  });

  it('rounds up to whole batches and reports leftovers', () => {
    const r = calculateCraft(base());
    expect(r.surplus).toEqual([{ itemId: 'ingot', name: 'ingot', quantity: 1 }]);
  });

  it('applies output quantity: requesting 1 item from a batch of 2 still crafts one full batch', () => {
    const r = calculateCraft({ ...base(), targetItemId: 'ingot', quantity: 1 });
    expect(r.crafts[0]).toMatchObject({ batches: 1, produced: 2 });
    expect(r.purchases[0]).toMatchObject({ itemId: 'ore', quantity: 3, cost: 30 });
    expect(r.surplus[0].quantity).toBe(1);
  });

  it('uses display names when items are provided', () => {
    const r = calculateCraft({ ...base(), items: [{ id: 'ore', name: 'Iron Ore', source: 't', verification: 'verified' }] });
    expect(r.purchases.find((p) => p.itemId === 'ore')?.name).toBe('Iron Ore');
  });

  it('rejects non-positive or fractional quantities', () => {
    expect(calculateCraft(base({ quantity: 0 })).ok).toBe(false);
    expect(calculateCraft(base({ quantity: 1.5 })).issues[0].type).toBe('invalid-input');
  });
});

describe('calculateCraft: inventory deductions', () => {
  it('deducts inventory at every level without mutating it', () => {
    const inventory = { ingot: 4, wood: 1, sword: 1 };
    const snapshot = structuredClone(inventory);
    const r = calculateCraft(base({ inventory }));
    expect(inventory).toEqual(snapshot);
    // 1 sword from inventory -> 2 to craft: 4 ingots + 2 handles(2 wood + 2 ingot) = 6 ingots, 4 in inventory -> 2 to craft = 1 batch
    expect(r.inventoryUsed.find((u) => u.itemId === 'sword')?.used).toBe(1);
    expect(r.inventoryUsed.find((u) => u.itemId === 'ingot')?.used).toBe(4);
    expect(r.crafts.find((c) => c.itemId === 'sword')?.batches).toBe(2);
    expect(r.crafts.find((c) => c.itemId === 'ingot')?.batches).toBe(1);
    expect(r.purchases.find((p) => p.itemId === 'wood')?.quantity).toBe(1);
    expect(r.purchases.find((p) => p.itemId === 'ore')?.quantity).toBe(3);
  });

  it('needs nothing when the inventory already covers the target', () => {
    const r = calculateCraft(base({ inventory: { sword: 5 } }));
    expect(r.cashCost).toBe(0);
    expect(r.purchases).toHaveLength(0);
    expect(r.crafts).toHaveLength(0);
  });

  it('values inventory at buy price separately from cash cost', () => {
    const r = calculateCraft(base({ targetItemId: 'ingot', quantity: 2, inventory: { ore: 3 } }));
    expect(r.cashCost).toBe(0);
    expect(r.inventoryValue).toBe(30);
    expect(r.fullCost).toBe(30);
  });
});

describe('calculateCraft: alternative component strategies', () => {
  const prices = { ore: price('ore', 10), wood: price('wood', 5), ingot: price('ingot', 4), handle: price('handle', 100) };

  it('buys an intermediate component instead of crafting it when set to buy', () => {
    const r = calculateCraft(base({ targetItemId: 'handle', quantity: 1, prices, strategies: { ingot: 'buy' } }));
    expect(r.crafts.map((c) => c.itemId)).toEqual(['handle']);
    expect(r.purchases.find((p) => p.itemId === 'ingot')).toMatchObject({ quantity: 1, cost: 4 });
    expect(r.cashCost).toBe(9);
  });

  it('crafts when set to craft even if buying is cheaper', () => {
    const r = calculateCraft(base({ targetItemId: 'handle', quantity: 1, prices, strategies: { ingot: 'craft' } }));
    expect(r.crafts.map((c) => c.itemId).sort()).toEqual(['handle', 'ingot']);
    expect(r.cashCost).toBe(35);
  });

  it('auto strategy picks the cheaper option per unit', () => {
    // crafting an ingot costs 15 ore-wise per unit (3 ore * 10 / 2), buying is 4
    const cheapBuy = calculateCraft(base({ targetItemId: 'handle', quantity: 1, prices }));
    expect(cheapBuy.purchases.some((p) => p.itemId === 'ingot')).toBe(true);
    const cheapCraft = calculateCraft(base({ targetItemId: 'handle', quantity: 1, prices: { ...prices, ingot: price('ingot', 50) } }));
    expect(cheapCraft.crafts.some((c) => c.itemId === 'ingot')).toBe(true);
  });

  it('auto crafts when no buy price is known and buys when craft cost is unknown', () => {
    const noIngotPrice = calculateCraft(base({ targetItemId: 'handle', quantity: 1, prices: { ore: price('ore', 10), wood: price('wood', 5) } }));
    expect(noIngotPrice.crafts.some((c) => c.itemId === 'ingot')).toBe(true);
    const noOre = calculateCraft(base({ targetItemId: 'handle', quantity: 1, prices: { wood: price('wood', 5), ingot: price('ingot', 4) } }));
    expect(noOre.purchases.some((p) => p.itemId === 'ingot')).toBe(true);
  });

  it('uses the chosen recipe when an item has several', () => {
    const alt = rec('ingot-alt', 'ingot', 1, [['scrap', 1]]);
    const r = calculateCraft(base({ targetItemId: 'ingot', quantity: 1, recipes: [...recipes, alt], recipeChoices: { ingot: 'ingot-alt' }, prices: { scrap: price('scrap', 2) } }));
    expect(r.crafts[0].recipeId).toBe('ingot-alt');
    expect(r.cashCost).toBe(2);
  });
});

describe('calculateCraft: Auction House fees and profitability', () => {
  it('computes net revenue after fee and profit', () => {
    const r = calculateCraft(base());
    const p = r.profitability!;
    expect(r.cashCost).toBe(165);
    expect(p.feePercent).toBe(10);
    expect(p.grossRevenue).toBe(300);
    expect(p.feeAmount).toBeCloseTo(30);
    expect(p.netRevenue).toBeCloseTo(270);
    expect(p.profitCash).toBeCloseTo(105);
    expect(p.marginPercent).toBeCloseTo((105 / 270) * 100);
    expect(p.roiPercent).toBeCloseTo((105 / 165) * 100);
    expect(p.complete).toBe(true);
  });

  it('prefers a per-item fee over the default', () => {
    const r = calculateCraft(base({ prices: { ore: price('ore', 10), wood: price('wood', 5), sword: price('sword', undefined, 100, 5) } }));
    expect(r.profitability!.feePercent).toBe(5);
    expect(r.profitability!.netRevenue).toBeCloseTo(285);
  });

  it('subtracts inventory value for full-cost profit only', () => {
    const r = calculateCraft(base({ quantity: 1, inventory: { wood: 1 } }));
    expect(r.profitability!.profitFull).toBeCloseTo(r.profitability!.profitCash - 5);
  });

  it('auctionNetPrice applies the percentage', () => {
    expect(auctionNetPrice(200, 15)).toBe(170);
    expect(auctionNetPrice(200, 0)).toBe(200);
  });

  it('reports negative profit', () => {
    const r = calculateCraft(base({ prices: { ore: price('ore', 100), wood: price('wood', 5), sword: price('sword', undefined, 10) } }));
    expect(r.profitability!.profitCash).toBeLessThan(0);
  });
});

describe('calculateCraft: missing data and uncertain sources', () => {
  it('flags missing buy prices and marks costs incomplete', () => {
    const r = calculateCraft(base({ prices: { wood: price('wood', 5), sword: price('sword', undefined, 100) } }));
    expect(r.issues.some((i) => i.type === 'missing-price' && i.itemId === 'ore')).toBe(true);
    expect(r.costComplete).toBe(false);
    expect(r.profitability!.complete).toBe(false);
  });

  it('flags a missing sell price and omits profitability', () => {
    const r = calculateCraft(base({ prices: { ore: price('ore', 10), wood: price('wood', 5) } }));
    expect(r.profitability).toBeNull();
    expect(r.issues.some((i) => i.type === 'missing-sell-price')).toBe(true);
  });

  it('errors when the target has no recipe', () => {
    const r = calculateCraft(base({ targetItemId: 'ore', quantity: 1 }));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.type === 'no-recipe' && i.severity === 'error')).toBe(true);
  });

  it('notes ingredients without recipes as informational', () => {
    const r = calculateCraft(base());
    expect(r.issues.find((i) => i.type === 'no-recipe' && i.itemId === 'ore')?.severity).toBe('info');
  });

  it('warns about unverified recipes', () => {
    const r = calculateCraft(base({ recipes: [rec('ingot', 'ingot', 2, [['ore', 3]], 'unverified')], targetItemId: 'ingot', quantity: 2 }));
    expect(r.issues.some((i) => i.type === 'unverified-recipe')).toBe(true);
  });

  it('ignores invalid recipes with a warning', () => {
    const r = calculateCraft(base({ recipes: [rec('bad', 'sword', 0, [['ore', 1]])] }));
    expect(r.issues.some((i) => i.type === 'invalid-recipe')).toBe(true);
    expect(r.ok).toBe(false);
  });
});

describe('calculateCraft: circular dependencies', () => {
  it('detects and reports cycles instead of looping forever', () => {
    const cyc = [rec('a', 'a', 1, [['b', 1]]), rec('b', 'b', 1, [['a', 1]])];
    const r = calculateCraft({ targetItemId: 'a', quantity: 1, recipes: cyc, prices: {}, inventory: {} });
    expect(r.ok).toBe(false);
    const issue = r.issues.find((i) => i.type === 'circular-dependency');
    expect(issue?.message).toContain('a → b → a');
  });

  it('detects self-referencing recipes', () => {
    const r = calculateCraft({ targetItemId: 'a', quantity: 1, recipes: [rec('a', 'a', 1, [['a', 1]])], prices: {}, inventory: {} });
    expect(r.issues.some((i) => i.type === 'circular-dependency')).toBe(true);
  });
});

describe('calculateCraft: Substance Morph', () => {
  const morph = [rec('morph-ore', 'ore', 1, [['odyle', 1]], 'unverified')];
  const run = (orePrice: number, strategy: 'auto' | 'buy') =>
    calculateCraft({ targetItemId: 'ingot', quantity: 2, recipes: [...recipes.filter((r) => r.id === 'ingot'), ...morph], prices: { ore: price('ore', orePrice), odyle: price('odyle', 20) }, inventory: {}, defaultFeePercent: 10, defaultStrategy: strategy });

  it('uses Odyle when converting is cheaper than buying the material', () => {
    const r = run(50, 'auto');
    expect(r.purchases.map((p) => p.itemId)).toEqual(['odyle']);
    expect(r.purchases[0].quantity).toBe(3);
  });

  it('buys the material when it is cheaper than the Odyle', () => {
    expect(run(5, 'auto').purchases.map((p) => p.itemId)).toEqual(['ore']);
  });
});

describe('calculateCraft: chance (COMBO) recipes', () => {
  const combo: Recipe = { ...rec('combo', 'ring', 1, [['ore', 4]]), outputChance: 0.25 };
  const run = (qty: number) => calculateCraft({ targetItemId: 'ring', quantity: qty, recipes: [combo], prices: { ore: price('ore', 10) }, inventory: {}, defaultFeePercent: 10 });

  it('crafts enough batches to expect the requested quantity', () => {
    const r = run(2);
    expect(r.crafts[0]).toMatchObject({ batches: 8, produced: 2 });
    expect(r.purchases[0].quantity).toBe(32);
  });

  it('rejects an invalid chance', () => {
    expect(validateRecipe({ ...combo, outputChance: 0 })).not.toBeNull();
    expect(validateRecipe(combo)).toBeNull();
  });
});
