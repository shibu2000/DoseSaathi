import type { DatabaseConnection } from '../types';
import { allMigrations, type Migration } from './001_initial_schema';

export async function runMigrations(
  db: DatabaseConnection,
  migrations: Migration[] = allMigrations
): Promise<{ appliedCount: number; currentVersion: number }> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = await db.all<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC;'
  );
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  let appliedCount = 0;
  let currentVersion = appliedRows.length > 0 ? appliedRows[appliedRows.length - 1].version : 0;

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      await db.withTransaction(async (tx) => {
        await tx.exec(migration.sql);
        const now = new Date().toISOString();
        await tx.run(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);',
          [migration.version, migration.name, now]
        );
      });
      appliedCount++;
      currentVersion = migration.version;
    }
  }

  return { appliedCount, currentVersion };
}
