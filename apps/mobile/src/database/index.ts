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

export async function getAppDatabase(customConnection?: DatabaseConnection): Promise<AppDatabase> {
  if (instance) return instance;

  if (customConnection) {
    instance = await AppDatabase.initialize(customConnection);
    return instance;
  }

  // The app always uses expo-sqlite. Tests pass their own connection (BunSqliteAdapter lives in
  // adapters/bun-adapter.ts and is deliberately never imported here, so Metro never sees `bun:sqlite`).
  const SQLite = await import('expo-sqlite');
  const expoDb = await SQLite.openDatabaseAsync('medchain.db');
  instance = await AppDatabase.initialize(new ExpoSqliteAdapter(expoDb));
  return instance;
}

export function resetAppDatabaseInstance(): void {
  instance = null;
}
