import { UserData } from '../models';
import { SchemaError, emptyUserData, migrateUserData } from './schema';

export const STORAGE_KEY = 'aion2-craft-lab:userdata';
export const CORRUPT_BACKUP_KEY = 'aion2-craft-lab:corrupt-raw';

export type LoadStatus = 'empty' | 'ok' | 'migrated' | 'corrupted' | 'unavailable';

export interface LoadResult {
  status: LoadStatus;
  data: UserData;
  message?: string;
  warnings: string[];
  /** Raw stored text kept for recovery when the stored data is corrupted. */
  rawText?: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function getBrowserStorage(): StorageLike | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__aion2_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export class UserDataStorage {
  constructor(private readonly storage: StorageLike | null) {}

  get available(): boolean {
    return this.storage !== null;
  }

  load(): LoadResult {
    if (!this.storage) {
      return {
        status: 'unavailable',
        data: emptyUserData(),
        warnings: [],
        message: 'Browser storage is unavailable (private mode or blocked). Changes will be lost when you close the tab. Export a JSON backup to keep your data.',
      };
    }
    let text: string | null;
    try {
      text = this.storage.getItem(STORAGE_KEY);
    } catch (e) {
      return {
        status: 'unavailable',
        data: emptyUserData(),
        warnings: [],
        message: `Browser storage could not be read: ${(e as Error).message}`,
      };
    }
    if (text === null) return { status: 'empty', data: emptyUserData(), warnings: [] };
    try {
      const parsed = JSON.parse(text);
      const { data, fromVersion, warnings } = migrateUserData(parsed);
      return {
        status: fromVersion === data.schemaVersion ? 'ok' : 'migrated',
        data,
        warnings,
      };
    } catch (e) {
      const reason = e instanceof SchemaError ? e.message : 'The saved data is not valid JSON.';
      return {
        status: 'corrupted',
        data: emptyUserData(),
        warnings: [],
        rawText: text,
        message: `Your saved data could not be read: ${reason} It has not been deleted. Restore from a JSON backup, download the raw data, or start fresh.`,
      };
    }
  }

  /** Returns an error message, or null on success. */
  save(data: UserData): string | null {
    if (!this.storage) return 'Browser storage is unavailable.';
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
      return null;
    } catch (e) {
      return `Could not save to browser storage (it may be full): ${(e as Error).message}`;
    }
  }

  /** Moves unreadable data aside so it is never silently destroyed. */
  quarantine(rawText: string): void {
    try {
      this.storage?.setItem(CORRUPT_BACKUP_KEY, rawText);
    } catch {
      // Best effort: the raw text is also offered for download.
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
