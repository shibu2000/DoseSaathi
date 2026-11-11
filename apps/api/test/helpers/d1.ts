// Minimal D1Database adapter over bun:sqlite, applying the real migration files.
import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Params = unknown[];

class Stmt {
  constructor(private db: Database, readonly sql: string, private params: Params = []) {}
  bind(...values: Params) {
    for (const v of values) if (v === undefined) throw new Error('D1_TYPE_ERROR: undefined cannot be bound');
    return new Stmt(this.db, this.sql, values);
  }
  private meta(changes = 0, lastRowId = 0) {
    return { duration: 0, changes, last_row_id: lastRowId, served_by: 'bun-sqlite', rows_read: 0, rows_written: changes, size_after: 0, changed_db: changes > 0 };
  }
  _exec(): { results: any[]; success: true; meta: any } {
    const s = this.db.prepare(this.sql);
    const isRead = /^\s*(SELECT|WITH|PRAGMA)/i.test(this.sql) || /\bRETURNING\b/i.test(this.sql);
    if (isRead) {
      const results = s.all(...(this.params as any[]));
      return { results, success: true, meta: this.meta(/\bRETURNING\b/i.test(this.sql) ? results.length : 0) };
    }
    const r = s.run(...(this.params as any[]));
    return { results: [], success: true, meta: this.meta(r.changes, Number(r.lastInsertRowid)) };
  }
  async first(col?: string) {
    const row = this._exec().results[0] ?? null;
    return col && row ? row[col] : row;
  }
  async all() {
    return this._exec();
  }
  async run() {
    return this._exec();
  }
  async raw() {
    return this._exec().results.map((r) => Object.values(r));
  }
}

export class TestD1 {
  readonly sqlite: Database;
  constructor() {
    this.sqlite = new Database(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
  }
  prepare(sql: string) {
    return new Stmt(this.sqlite, sql) as unknown as D1PreparedStatement;
  }
  async batch(stmts: D1PreparedStatement[]) {
    this.sqlite.exec('BEGIN');
    try {
      const out = (stmts as unknown as Stmt[]).map((s) => s._exec());
      this.sqlite.exec('COMMIT');
      return out as any;
    } catch (e) {
      this.sqlite.exec('ROLLBACK');
      throw e;
    }
  }
  async exec(sql: string) {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }
  withSession() {
    return this as any;
  }
  async dump() {
    return new ArrayBuffer(0);
  }
}

export function createTestDb(): D1Database {
  const db = new TestD1();
  const dir = join(import.meta.dir, '../../migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.sqlite.exec(readFileSync(join(dir, f), 'utf8'));
  }
  return db as unknown as D1Database;
}
export const rawSqlite = (db: D1Database) => (db as unknown as TestD1).sqlite;
