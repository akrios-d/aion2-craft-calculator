import { Injectable, computed, signal } from '@angular/core';
import { playAlertSound } from './alert-sound';
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
import { appendHistory, applyPriceImport } from './io/imports';
import { findAlerts, newAlerts, PriceAlert } from './engine/alerts';
import { MarketServer, parseMarketItems, parseServers } from './io/market';
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

  /** Items seen only in the market feed (absent from the static catalogue). */
  readonly marketItems = signal<Item[]>([]);

  /** Every known item, including both faction variants; used to name items already stored in user data. */
  private readonly allItems = computed<Item[]>(() => {
    const known = new Set(this.catalog().items.map((i) => i.id));
    const pt = this.settings().itemNameLanguage === 'pt';
    const faction = this.settings().faction;
    const extra = this.marketItems().filter((i) => !known.has(i.id));
    return [...this.catalog().items, ...extra, ...this.data().customItems.filter((i) => !known.has(i.id) && !extra.some((x) => x.id === i.id))].map((i) => {
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
    // Market (listing) price by default; the price the user wants to pay only applies when the switch is on.
    const desired = this.settings().useDesiredPrices === true;
    for (const p of Object.values(this.data().prices)) {
      if (p.server !== server) continue;
      const buy = desired && p.buyPrice !== undefined ? p.buyPrice : p.sellListingPrice;
      out[p.itemId] = { ...p, buyPrice: buy };
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
    void this.loadMarketServers();
    this.startAlertTimer();
    void this.loadCatalog().then(() => this.syncMarket());
  }

  iconOf = (id: string): string | undefined => this.itemIcons().get(id);
  nameOf = (id: string): string => this.itemNames().get(id) ?? id;
  tr = (text: string, params?: Params): string => translate(text, this.settings().uiLanguage, params);

  readonly marketStatus = signal<'idle' | 'loading' | 'ok' | 'error'>('idle');

  /** Fetches market listing prices through the serverless proxy and merges them; failures are non-fatal. */
  readonly marketServers = signal<MarketServer[]>([{ serverId: 12402, name: 'Zikel', region: 'LA' }]);

  async loadMarketServers(): Promise<void> {
    try {
      const res = await fetch('/api/market?servers');
      if (res.ok) {
        const list = parseServers(await res.json());
        if (list.length) this.marketServers.set(list);
      }
    } catch {
      /* keep the default list */
    }
  }

  /** Switches the market server (prices are stored per server) and fetches its prices. */
  async selectMarketServer(serverId: number): Promise<void> {
    const s = this.marketServers().find((m) => m.serverId === serverId);
    if (!s) return;
    this.setSettings({ marketServerId: serverId, server: ` ` });
    await this.syncMarket();
  }

  /** When the market was last fetched successfully (ISO), and the newest listing time reported by the source. */
  readonly lastSync = signal<string | null>(null);
  readonly dataTime = computed(() => {
    const server = this.settings().server;
    let max = '';
    for (const p of Object.values(this.data().prices)) if (p.server === server && p.observedAt > max) max = p.observedAt;
    return max || null;
  });

  async syncMarket(): Promise<void> {
    const serverId = this.settings().marketServerId ?? 12402;
    if (this.persistBlocked() || !this.items().length) return;
    this.marketStatus.set('loading');
    try {
      const res = await fetch(`/api/market?server=${serverId}`);
      if (!res.ok) throw new Error(String(res.status));
      const r = parseMarketItems(await res.json(), this.items().filter((i) => !this.marketItems().some((m) => m.id === i.id)), this.settings().server);
      if (!r.records.length) throw new Error('empty');
      this.marketItems.set(r.extraItems);
      this.update((d) => applyPriceImport(d, r.records, 'merge', (id) => this.nameOf(id)).data);
      this.lastSync.set(new Date().toISOString());
      this.marketStatus.set('ok');
      this.checkAlerts();
    } catch {
      this.marketStatus.set('error');
    }
  }

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

  private notified = new Set<string>();
  private alertTimer: ReturnType<typeof setInterval> | undefined;
  /** Items currently at or below the price the user wants to pay (for the in-app list). */
  readonly alerts = computed<PriceAlert[]>(() => findAlerts(this.serverPrices()));

  /** Browser notification permission; alerts can only be created when it is 'granted'. */
  readonly notifPermission = signal<'granted' | 'denied' | 'default' | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  async enableNotifications(): Promise<void> {
    if (typeof Notification === 'undefined') return;
    try { this.notifPermission.set(await Notification.requestPermission()); } catch { /* ignore */ }
  }

  startAlertTimer(): void {
    if (this.alertTimer) clearInterval(this.alertTimer);
    this.alertTimer = undefined;
    this.alertTimer = setInterval(() => void this.syncMarket(), 5 * 60 * 1000);
  }

  private checkAlerts(): void {
    const { fresh, keys } = newAlerts(findAlerts(this.serverPrices()), this.notified);
    this.notified = keys;
    if (!fresh.length || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const lines = fresh.slice(0, 5).map((a) => `${this.nameOf(a.itemId)}: ${a.market.toLocaleString()} (<= ${a.desired.toLocaleString()})`);
    playAlertSound(this.settings().alertSound ?? 'chime');
    try { new Notification(translate('Price alert', this.settings().uiLanguage), { body: lines.join('\n'), tag: 'aion2-price-alert' }); } catch { /* ignore */ }
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
