export interface OutboxRow {
  id: string;
  kind: string;
  patient_device_id: string;
  payload_json: string;
  status: string;
  attempts: number;
  next_attempt_at: string;
  locked_until: string | null;
}

export class OutboxRepo {
  constructor(private db: D1Database) {}

  insertStatement(o: { id: string; kind: string; deviceId: string; payload: Record<string, string>; now: string }) {
    return this.db
      .prepare(
        `INSERT INTO server_outbox (id, kind, patient_device_id, payload_json, status, next_attempt_at, created_at)
         VALUES (?1, ?2, ?3, ?4, 'PENDING', ?5, ?5)`,
      )
      .bind(o.id, o.kind, o.deviceId, JSON.stringify(o.payload), o.now);
  }
  findById(id: string) {
    return this.db.prepare(`SELECT * FROM server_outbox WHERE id = ?1`).bind(id).first<OutboxRow>();
  }
  async due(now: string, limit: number): Promise<OutboxRow[]> {
    const r = await this.db
      .prepare(
        `SELECT * FROM server_outbox
         WHERE (status = 'PENDING' AND next_attempt_at <= ?1) OR (status = 'SENDING' AND locked_until < ?1)
         ORDER BY created_at LIMIT ?2`,
      )
      .bind(now, limit)
      .all<OutboxRow>();
    return r.results;
  }
  /** Claim a row for sending; true if this worker won it. */
  async claim(id: string, now: string, lockedUntil: string): Promise<boolean> {
    const r = await this.db
      .prepare(
        `UPDATE server_outbox SET status = 'SENDING', locked_until = ?3, attempts = attempts + 1
         WHERE id = ?1 AND ((status = 'PENDING' AND next_attempt_at <= ?2) OR (status = 'SENDING' AND locked_until < ?2))`,
      )
      .bind(id, now, lockedUntil)
      .run();
    return (r.meta.changes ?? 0) === 1;
  }
  async finish(id: string, status: 'SENT' | 'SKIPPED' | 'DEAD', now: string, errorCode: string | null) {
    await this.db
      .prepare(`UPDATE server_outbox SET status = ?2, sent_at = ?3, last_error_code = ?4, locked_until = NULL WHERE id = ?1`)
      .bind(id, status, now, errorCode)
      .run();
  }
  async retryLater(id: string, nextAttemptAt: string, errorCode: string) {
    await this.db
      .prepare(`UPDATE server_outbox SET status = 'PENDING', next_attempt_at = ?2, last_error_code = ?3, locked_until = NULL WHERE id = ?1`)
      .bind(id, nextAttemptAt, errorCode)
      .run();
  }
  async purge(olderThan: string) {
    await this.db
      .prepare(`DELETE FROM server_outbox WHERE status IN ('SENT','SKIPPED','DEAD') AND created_at < ?1`)
      .bind(olderThan)
      .run();
  }
}
