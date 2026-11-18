import { AppDatabase, type OccurrenceWithMedication } from './database';
import { ExpoSqliteAdapter } from './adapters/expo-adapter';
import type { DatabaseConnection } from './types';
import type { WizardDraft } from './repositories/draft-repository';

export * from './database';
export * from './types';
export * from './repositories/draft-repository';
export * from './repositories/device-settings-repository';
export * from './repositories/occurrence-repository';
export * from './repositories/relationship-cache-repository';

let instance: AppDatabase | null = null;
/**
 * The in-flight open is shared: the UI and the headless alarm-action task can start together in the same
 * JS runtime, and must never open two connections or run migrations twice concurrently.
 */
let opening: Promise<AppDatabase> | null = null;

export async function getAppDatabase(customConnection?: DatabaseConnection): Promise<AppDatabase> {
  if (instance) return instance;

  if (customConnection) {
    instance = await AppDatabase.initialize(customConnection);
    return instance;
  }

  if (!opening) {
    opening = (async () => {
      // The app always uses expo-sqlite. Tests pass their own connection (BunSqliteAdapter lives in
      // adapters/bun-adapter.ts and is deliberately never imported here, so Metro never sees `bun:sqlite`).
      const SQLite = await import('expo-sqlite');
      const expoDb = await SQLite.openDatabaseAsync('medchain.db');
      instance = await AppDatabase.initialize(new ExpoSqliteAdapter(expoDb));
      return instance;
    })();
    // A failed open may be retried by the next caller
    opening.catch(() => {
      opening = null;
    });
  }
  return opening;
}

export function resetAppDatabaseInstance(): void {
  instance = null;
  opening = null;
}
