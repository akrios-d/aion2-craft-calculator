export type VerificationStatus = 'verified' | 'unverified' | 'user-entered';
export type Strategy = 'auto' | 'craft' | 'buy';

export interface Item {
  id: string;
  name: string;
  category?: string;
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
  sellListingPrice?: number;
  quantityObserved?: number;
  feePercent?: number;
  observedAt: string;
  notes?: string;
}

export interface Settings {
  server: string;
  defaultFeePercent: number;
  defaultStrategy: Strategy;
  currencyLabel: string;
}

export interface SavedPlan {
  id: string;
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

export interface UserData {
  schemaVersion: number;
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
