import type { DatabaseConnection, RunResult } from '../types';
import { Database } from 'bun:sqlite';

export class BunSqliteAdapter implements DatabaseConnection {
  private db: Database;
  private inTransaction = false;

  constructor(filePath: string = ':memory:') {
    this.db = new Database(filePath);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async run(sql: string, params: any[] = []): Promise<RunResult> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: result.changes,
      lastInsertRowId: result.lastInsertRowid,
    };
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params) as T | undefined;
    return row ?? null;
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  async withTransaction<T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      return await fn(this);
    }
    this.inTransaction = true;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  close(): void {
    this.db.close();
  }
}
