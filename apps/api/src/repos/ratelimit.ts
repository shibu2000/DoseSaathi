export class RateLimitRepo {
  constructor(private db: D1Database) {}

  /** Fixed-window counter. Increments and returns the new count + seconds until window reset. */
  async hit(key: string, windowSeconds: number, nowSeconds: number): Promise<{ count: number; retryAfter: number }> {
    const row = await this.db
      .prepare(
        `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE WHEN window_start <= ?2 - ?3 THEN 1 ELSE count + 1 END,
           window_start = CASE WHEN window_start <= ?2 - ?3 THEN ?2 ELSE window_start END
         RETURNING count, window_start`,
      )
      .bind(key, nowSeconds, windowSeconds)
      .first<{ count: number; window_start: number }>();
    return { count: row!.count, retryAfter: row!.window_start + windowSeconds - nowSeconds };
  }
  /** Read-only view of the current window's count. */
  async peek(key: string, windowSeconds: number, nowSeconds: number): Promise<{ count: number; retryAfter: number }> {
    const row = await this.db
      .prepare(`SELECT count, window_start FROM rate_limits WHERE key = ?1`)
      .bind(key)
      .first<{ count: number; window_start: number }>();
    if (!row || row.window_start <= nowSeconds - windowSeconds) return { count: 0, retryAfter: 0 };
    return { count: row.count, retryAfter: row.window_start + windowSeconds - nowSeconds };
  }
  async reset(key: string) {
    await this.db.prepare(`DELETE FROM rate_limits WHERE key = ?1`).bind(key).run();
  }
  async purge(olderThanSeconds: number) {
    await this.db.prepare(`DELETE FROM rate_limits WHERE window_start < ?1`).bind(olderThanSeconds).run();
  }
}
