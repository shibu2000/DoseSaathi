import type { DatabaseConnection, RunResult } from '../types';
import type { SQLiteDatabase } from 'expo-sqlite';

export class ExpoSqliteAdapter implements DatabaseConnection {
  private db: SQLiteDatabase;
  private inTransaction = false;

  constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  async exec(sql: string): Promise<void> {
    await this.db.execAsync(sql);
  }

  async run(sql: string, params: any[] = []): Promise<RunResult> {
    const res = await this.db.runAsync(sql, params);
    return {
      changes: res.changes,
      lastInsertRowId: res.lastInsertRowId,
    };
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const row = await this.db.getFirstAsync<T>(sql, params);
    return row ?? null;
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return await this.db.getAllAsync<T>(sql, params);
  }

  async withTransaction<T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      // Re-use active transaction to avoid SQLite "cannot start a transaction within a transaction"
      return await fn(this);
    }

    this.inTransaction = true;
    try {
      let result!: T;
      await this.db.withTransactionAsync(async () => {
        result = await fn(this);
      });
      return result;
    } finally {
      this.inTransaction = false;
    }
  }
}
