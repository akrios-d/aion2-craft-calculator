export type VerificationStatus = 'verified' | 'unverified' | 'user-entered';
export type Strategy = 'auto' | 'craft' | 'buy';

export interface Item {
  id: string;
  name: string;
  category?: string;
  /** Localized names by language code (English is `name`). */
  names?: { pt?: string };
  /** Icon image URL from the source site (linked, not bundled). */
  icon?: string;
  /** Set only on same-named items that exist once per faction. */
  faction?: 'Elyos' | 'Asmodians';
  /** True for the Bind-on-pickup variant of two same-named items in one faction. */
  bound?: boolean;
  /** Earlier identifiers of this item, used to preserve user data when ids change. */
  previousIds?: string[];
  source: string;
  sourceUrl?: string;
  verification: VerificationStatus;
}

export interface Ingredient {
  itemId: string;
  quantity: number;
}

export interface Recipe {
  id: string;
  outputItemId: string;
  outputQuantity: number;
  /** Chance (0-1] that a craft yields the output, e.g. a COMBO result; plans use the expected yield. */
  outputChance?: number;
  ingredients: Ingredient[];
  professionId?: string;
  professionLevel?: number;
  source: string;
  sourceUrl?: string;
  verification: VerificationStatus;
  notes?: string;
}

export interface Profession {
  id: string;
  name: string;
}

export interface DataManifest {
  dataVersion: string;
  sourceUrl: string;
  importDate: string | null;
  itemCount: number;
  recipeCount: number;
  professionCount: number;
  verifiedRecipeCount: number;
  verificationStatus: string;
  knownLimitations: string[];
}

export interface Catalog {
  items: Item[];
  recipes: Recipe[];
  professions: Profession[];
  manifest: DataManifest;
}

/** A manually entered Auction House observation. Listing prices are NOT completed sales. */
export interface PriceEntry {
  itemId: string;
  server: string;
  buyPrice?: number;
  /** Average of listings; this is the value calculations use. */
  sellListingPrice?: number;
  /** Individual listing prices observed for this item. */
  listings?: number[];
  quantityObserved?: number;
  feePercent?: number;
  observedAt: string;
  notes?: string;
}

export interface Settings {
  server: string;
  defaultFeePercent: number;
  defaultStrategy: Strategy;
  /** Language of the interface text. */
  uiLanguage: 'en' | 'pt';
  /** Language used for item names (independent of the interface language). */
  itemNameLanguage: 'en' | 'pt';
  /** Faction whose same-named item variants are shown; 'all' shows both. */
  faction: 'all' | 'Elyos' | 'Asmodians';
  /** Exchange offers that sell Kinah (Kina chests) for premium currency; the best rate converts costs. */
  kinahChests?: { kinah: number; price: number }[];
  /** Quna shop packs bought with real money; the best rate converts Quna to real money. */
  qunaPacks?: { quna: number; price: number }[];
  /** Real-money currency symbol/label for the Quna packs, e.g. R$. */
  realCurrency?: string;
  /** When on, the prices the user wants to pay override market prices in calculations. */
  useDesiredPrices?: boolean;
  /** Name of the premium currency the chests are bought with. */
  currency?: string;
}

export interface SavedPlan {
  id: string;
  /** Character the plan belongs to. */
  characterId: string;
  name: string;
  targetItemId: string;
  quantity: number;
  server: string;
  createdAt: string;
}

export interface InventoryEntry {
  quantity: number;
  updatedAt: string;
}

/** Per-character data (the inventory is account-wide). The active character's copy lives in the top-level UserData fields and is synced on save. */
export interface Character {
  id: string;
  name: string;
  strategies: Record<string, Strategy>;
  recipeChoices: Record<string, string>;
}

export const DEFAULT_CHARACTER_ID = 'main';

export interface UserData {
  schemaVersion: number;
  characters: Character[];
  activeCharacterId: string;
  /** Kinah the user has, account-wide. */
  kinah: number;
  /** Account-wide inventory, shared by all characters. */
  inventory: Record<string, InventoryEntry>;
  /** Latest price per `server|itemId`. */
  prices: Record<string, PriceEntry>;
  priceHistory: PriceEntry[];
  settings: Settings;
  plans: SavedPlan[];
  /** Per-item buy-or-craft preference. */
  strategies: Record<string, Strategy>;
  /** Preferred recipe id when an item has several recipes. */
  recipeChoices: Record<string, string>;
  customItems: Item[];
  customRecipes: Recipe[];
  /** Static dataset version the user data was last reconciled against. */
  lastSeenDataVersion: string | null;
}

export const DEFAULT_SERVER = 'Zikel SA';
/** Placeholder only: the real Auction House fee is not verified. Users must set their own. */
export const DEFAULT_FEE_PERCENT = 10;

export function priceKey(server: string, itemId: string): string {
  return `${server}|${itemId}`;
}
