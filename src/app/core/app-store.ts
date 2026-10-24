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
import { appendHistory } from './io/imports';
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

  readonly items = computed<Item[]>(() => {
    const known = new Set(this.catalog().items.map((i) => i.id));
    const all = [...this.catalog().items, ...this.data().customItems.filter((i) => !known.has(i.id))];
    if (this.settings().itemNameLanguage !== 'pt') return all;
    return all.map((i) => (i.names?.pt ? { ...i, name: i.names.pt } : i));
  });
  readonly recipes = computed<Recipe[]>(() => [...this.catalog().recipes, ...this.data().customRecipes]);
  readonly professions = computed<Profession[]>(() => this.catalog().professions);
  readonly itemIcons = computed(() => new Map(this.items().filter((i) => i.icon).map((i) => [i.id, i.icon as string])));
  readonly itemNames = computed(() => new Map(this.items().map((i) => [i.id, i.name])));
  readonly settings = computed(() => this.data().settings);
  readonly craftableItems = computed(() => {
    const ids = new Set(this.recipes().map((r) => r.outputItemId));
    return this.items().filter((i) => ids.has(i.id)).sort((a, b) => a.name.localeCompare(b.name));
  });
  /** Current prices for the selected server keyed by item id. */
  readonly serverPrices = computed(() => {
    const server = this.settings().server;
    const out: Record<string, PriceEntry> = {};
    for (const p of Object.values(this.data().prices)) if (p.server === server) out[p.itemId] = p;
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
    const { data, report } = reconcileUserData(this.data(), this.catalog().items);
    this.reconcileReport.set(report);
    const version = this.catalog().manifest.dataVersion;
    if (report.changed || this.data().lastSeenDataVersion !== version) {
      this.commit({ ...data, lastSeenDataVersion: version });
    }
  }

  private commit(next: UserData): void {
    this.data.set(next);
    if (this.persistBlocked()) return;
    this.saveError.set(this.storage.save(next));
  }

  update(fn: (d: UserData) => UserData): void {
    this.commit(fn(this.data()));
  }

  replaceAll(next: UserData): void {
    this.persistBlocked.set(false);
    this.health.update((h) => ({ ...h, status: 'ok', message: undefined }));
    this.commit(next);
    this.reconcileWithCatalog();
  }

  startFresh(): void {
    this.replaceAll(emptyUserData());
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

  savePlan(plan: SavedPlan): void {
    this.update((d) => ({ ...d, plans: [...d.plans.filter((p) => p.id !== plan.id), plan] }));
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
