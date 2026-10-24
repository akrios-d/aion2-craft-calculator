import { Injectable, computed, signal } from '@angular/core';
import {
  Catalog,
  DataManifest,
  Item,
  PriceEntry,
  Profession,
  Recipe,
  SavedPlan,
  Settings,
  Strategy,
  UserData,
  priceKey,
} from './models';
import { ReconcileReport, reconcileUserData } from './reconcile';
import { Params, translate } from './i18n';
import { addCharacter, deleteCharacter, renameCharacter, switchCharacter, syncActiveCharacter } from './characters';
import { appendHistory } from './io/imports';
import { listingsOf, withListings } from './listings';
import { LoadResult, UserDataStorage, getBrowserStorage } from './storage/user-data-storage';
import { emptyUserData } from './storage/schema';

const EMPTY_MANIFEST: DataManifest = {
  dataVersion: 'unloaded',
  sourceUrl: '',
  importDate: null,
  itemCount: 0,
  recipeCount: 0,
  professionCount: 0,
  verifiedRecipeCount: 0,
  verificationStatus: 'not loaded',
  knownLimitations: [],
};

const HISTORY_LIMIT = 50;

@Injectable({ providedIn: 'root' })
export class AppStore {
  private readonly storage = new UserDataStorage(getBrowserStorage());

  readonly health = signal<LoadResult>({ status: 'empty', data: emptyUserData(), warnings: [] });
  readonly data = signal<UserData>(emptyUserData());
  readonly catalog = signal<Catalog>({ items: [], recipes: [], professions: [], manifest: EMPTY_MANIFEST });
  readonly catalogError = signal<string | null>(null);
  readonly catalogLoaded = signal(false);
  readonly saveError = signal<string | null>(null);
  /** True while unreadable stored data awaits a user decision; saving is paused to protect it. */
  readonly persistBlocked = signal(false);
  readonly reconcileReport = signal<ReconcileReport | null>(null);

  /** Every known item, including both faction variants; used to name items already stored in user data. */
  private readonly allItems = computed<Item[]>(() => {
    const known = new Set(this.catalog().items.map((i) => i.id));
    const pt = this.settings().itemNameLanguage === 'pt';
    const faction = this.settings().faction;
    return [...this.catalog().items, ...this.data().customItems.filter((i) => !known.has(i.id))].map((i) => {
      const name = (pt && i.names?.pt) || i.name;
      const tags = [
        i.faction && faction === 'all' ? (i.faction === 'Elyos' ? 'Elyos' : pt ? 'Asmodianos' : 'Asmodians') : '',
        i.bound ? (pt ? 'Vinculado ao obter' : 'Bind on pickup') : '',
      ].filter(Boolean);
      return tags.length ? { ...i, name: `${name} (${tags.join(', ')})` } : name === i.name ? i : { ...i, name };
    });
  });
  /** Items offered to the user: other-faction variants are hidden once a faction is chosen. */
  readonly items = computed<Item[]>(() => {
    const faction = this.settings().faction;
    return faction === 'all' ? this.allItems() : this.allItems().filter((i) => !i.faction || i.faction === faction);
  });
  readonly recipes = computed<Recipe[]>(() => [...this.catalog().recipes, ...this.data().customRecipes]);
  readonly professions = computed<Profession[]>(() => this.catalog().professions);
  readonly itemIcons = computed(() => new Map(this.allItems().filter((i) => i.icon).map((i) => [i.id, i.icon as string])));
  readonly itemNames = computed(() => new Map(this.allItems().map((i) => [i.id, i.name])));
  readonly settings = computed(() => this.data().settings);
  readonly characters = computed(() => this.data().characters);
  readonly activeCharacter = computed(() => this.data().characters.find((c) => c.id === this.data().activeCharacterId) ?? this.data().characters[0]);
  readonly characterPlans = computed(() => this.data().plans.filter((p) => p.characterId === this.data().activeCharacterId));
  readonly craftableItems = computed(() => {
    const ids = new Set(this.recipes().map((r) => r.outputItemId));
    return this.items().filter((i) => ids.has(i.id)).sort((a, b) => a.name.localeCompare(b.name));
  });
  /** Current prices for the selected server keyed by item id. */
  readonly serverPrices = computed(() => {
    const server = this.settings().server;
    const out: Record<string, PriceEntry> = {};
    // Without a price the user wants to pay, the listing price is what buying costs.
    for (const p of Object.values(this.data().prices)) {
      if (p.server === server) out[p.itemId] = p.buyPrice === undefined && p.sellListingPrice !== undefined ? { ...p, buyPrice: p.sellListingPrice } : p;
    }
    return out;
  });
  readonly inventoryQuantities = computed(() => {
    const out: Record<string, number> = {};
    for (const [id, e] of Object.entries(this.data().inventory)) out[id] = e.quantity;
    return out;
  });

  constructor() {
    const result = this.storage.load();
    this.health.set(result);
    this.data.set(result.data);
    if (result.status === 'corrupted') {
      this.persistBlocked.set(true);
      if (result.rawText) this.storage.quarantine(result.rawText);
    }
    void this.loadCatalog();
  }

  iconOf = (id: string): string | undefined => this.itemIcons().get(id);
  nameOf = (id: string): string => this.itemNames().get(id) ?? id;
  tr = (text: string, params?: Params): string => translate(text, this.settings().uiLanguage, params);

  async loadCatalog(): Promise<void> {
    try {
      const get = async <T>(file: string): Promise<T> => {
        const res = await fetch(`data/${file}`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
        return (await res.json()) as T;
      };
      const [items, recipes, professions, manifest] = await Promise.all([
        get<Item[]>('items.json'),
        get<Recipe[]>('recipes.json'),
        get<Profession[]>('professions.json'),
        get<DataManifest>('data-manifest.json'),
      ]);
      this.catalog.set({ items, recipes, professions, manifest });
      this.catalogError.set(null);
      this.reconcileWithCatalog();
    } catch (e) {
      this.catalogError.set(`Could not load the recipe dataset: ${(e as Error).message}`);
    } finally {
      this.catalogLoaded.set(true);
    }
  }

  private reconcileWithCatalog(): void {
    if (this.persistBlocked()) return;
    const current = syncActiveCharacter(this.data());
    const { data, report } = reconcileUserData(current, this.catalog().items);
    // Characters other than the active one are reconciled through the same working fields.
    const characters = data.characters.map((c) => {
      if (c.id === data.activeCharacterId) return { ...c, strategies: data.strategies, recipeChoices: data.recipeChoices };
      const r = reconcileUserData({ ...data, strategies: c.strategies, recipeChoices: c.recipeChoices }, this.catalog().items);
      report.remapped.push(...r.report.remapped);
      report.unresolved.push(...r.report.unresolved.map((u) => ({ ...u, kind: `${u.kind} (${c.name})` })));
      report.changed = report.changed || r.report.changed;
      return { ...c, strategies: r.data.strategies, recipeChoices: r.data.recipeChoices };
    });
    this.reconcileReport.set(report);
    const version = this.catalog().manifest.dataVersion;
    if (report.changed || this.data().lastSeenDataVersion !== version) {
      this.commit({ ...data, characters, lastSeenDataVersion: version });
    }
  }

  private commit(next: UserData): void {
    next = syncActiveCharacter(next);
    this.data.set(next);
    if (this.persistBlocked()) return;
    this.saveError.set(this.storage.save(next));
  }

  private readonly past = signal<UserData[]>([]);
  private readonly future = signal<UserData[]>([]);
  readonly canUndo = computed(() => this.past().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);

  private record(): void {
    this.past.update((p) => [...p.slice(-(HISTORY_LIMIT - 1)), this.data()]);
    this.future.set([]);
  }

  update(fn: (d: UserData) => UserData): void {
    const next = fn(this.data());
    if (next === this.data()) return;
    this.record();
    this.commit(next);
  }

  undo(): void {
    const prev = this.past().at(-1);
    if (!prev) return;
    this.past.update((p) => p.slice(0, -1));
    this.future.update((f) => [...f, this.data()]);
    this.commit(prev);
  }

  redo(): void {
    const next = this.future().at(-1);
    if (!next) return;
    this.future.update((f) => f.slice(0, -1));
    this.past.update((p) => [...p, this.data()]);
    this.commit(next);
  }

  replaceAll(next: UserData): void {
    this.persistBlocked.set(false);
    this.health.update((h) => ({ ...h, status: 'ok', message: undefined }));
    this.record();
    this.commit(next);
    this.reconcileWithCatalog();
  }

  startFresh(): void {
    this.replaceAll(emptyUserData());
  }

  setKinah(amount: number): void {
    if (Number.isInteger(amount) && amount >= 0) this.update((d) => ({ ...d, kinah: amount }));
  }

  selectCharacter(id: string): void {
    this.update((d) => switchCharacter(d, id));
  }

  createCharacter(name: string): void {
    this.update((d) => addCharacter(d, name, crypto.randomUUID()));
  }

  renameActiveCharacter(name: string): void {
    this.update((d) => renameCharacter(d, d.activeCharacterId, name));
  }

  deleteActiveCharacter(): void {
    this.update((d) => deleteCharacter(d, d.activeCharacterId));
  }

  setSettings(patch: Partial<Settings>): void {
    this.update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }

  setPrice(entry: PriceEntry): void {
    this.update((d) => ({
      ...d,
      prices: { ...d.prices, [priceKey(entry.server, entry.itemId)]: entry },
      priceHistory: appendHistory(d.priceHistory, entry),
    }));
  }

  addListings(itemId: string, prices: number[]): void {
    const server = this.settings().server;
    const current = this.data().prices[priceKey(server, itemId)];
    const base: PriceEntry = { ...(current ?? { itemId, server }), observedAt: new Date().toISOString() };
    this.setPrice(withListings(base, [...(current ? listingsOf(current) : []), ...prices]));
  }

  setBuyPrice(itemId: string, buyPrice: number | undefined): void {
    const server = this.settings().server;
    const current = this.data().prices[priceKey(server, itemId)];
    if (!current && buyPrice === undefined) return;
    const entry: PriceEntry = { ...(current ?? { itemId, server }), observedAt: new Date().toISOString() };
    if (buyPrice === undefined) delete entry.buyPrice;
    else entry.buyPrice = buyPrice;
    if (entry.buyPrice === undefined && entry.sellListingPrice === undefined) this.removePrice(server, itemId);
    else this.setPrice(entry);
  }
  removeListing(itemId: string, index: number): void {
    const server = this.settings().server;
    const current = this.data().prices[priceKey(server, itemId)];
    if (!current) return;
    const rest = listingsOf(current).filter((_, i) => i !== index);
    const entry = withListings({ ...current, observedAt: new Date().toISOString() }, rest);
    if (entry.sellListingPrice === undefined && entry.buyPrice === undefined) this.removePrice(server, itemId);
    else this.setPrice(entry);
  }

  removePrice(server: string, itemId: string): void {
    this.update((d) => {
      const prices = { ...d.prices };
      delete prices[priceKey(server, itemId)];
      return { ...d, prices };
    });
  }

  setInventory(itemId: string, quantity: number): void {
    this.update((d) => {
      const inventory = { ...d.inventory };
      if (quantity <= 0) delete inventory[itemId];
      else inventory[itemId] = { quantity, updatedAt: new Date().toISOString() };
      return { ...d, inventory };
    });
  }

  setStrategy(itemId: string, s: Strategy | null): void {
    this.update((d) => {
      const strategies = { ...d.strategies };
      if (s === null) delete strategies[itemId];
      else strategies[itemId] = s;
      return { ...d, strategies };
    });
  }

  setRecipeChoice(itemId: string, recipeId: string): void {
    this.update((d) => ({ ...d, recipeChoices: { ...d.recipeChoices, [itemId]: recipeId } }));
  }

  savePlan(plan: Omit<SavedPlan, 'characterId'>): void {
    this.update((d) => ({
      ...d,
      plans: [...d.plans.filter((p) => p.id !== plan.id), { ...plan, characterId: d.activeCharacterId }],
    }));
  }

  deletePlan(id: string): void {
    this.update((d) => ({ ...d, plans: d.plans.filter((p) => p.id !== id) }));
  }

  addCustomItem(item: Item): void {
    this.update((d) => ({ ...d, customItems: [...d.customItems.filter((i) => i.id !== item.id), item] }));
  }

  addCustomRecipe(recipe: Recipe): void {
    this.update((d) => ({ ...d, customRecipes: [...d.customRecipes.filter((r) => r.id !== recipe.id), recipe] }));
  }

  deleteCustomRecipe(id: string): void {
    this.update((d) => ({ ...d, customRecipes: d.customRecipes.filter((r) => r.id !== id) }));
  }

  deleteCustomItem(id: string): void {
    this.update((d) => ({ ...d, customItems: d.customItems.filter((i) => i.id !== id) }));
  }
}
