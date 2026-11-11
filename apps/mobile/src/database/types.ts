export interface RunResult {
  changes: number;
  lastInsertRowId: number | bigint;
}

export interface DatabaseConnection {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: any[]): Promise<RunResult>;
  get<T = any>(sql: string, params?: any[]): Promise<T | null>;
  all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  withTransaction<T>(fn: (db: DatabaseConnection) => Promise<T>): Promise<T>;
}
