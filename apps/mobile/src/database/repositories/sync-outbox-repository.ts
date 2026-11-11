import type { DatabaseConnection } from '../types';

export interface OutboxItem {
  eventId: string;
  eventType: string;
  aggregateId: string;
  payloadJson: string;
  createdAt: string;
  attempts: number;
  nextRetryAt: string | null;
  syncedAt: string | null;
}

export class SyncOutboxRepository {
  constructor(private db: DatabaseConnection) {}

  async enqueue(item: Omit<OutboxItem, 'attempts' | 'nextRetryAt' | 'syncedAt'>): Promise<void> {
    await this.db.run(
      `INSERT OR IGNORE INTO sync_outbox (
        event_id, event_type, aggregate_id, payload_json, created_at,
        attempts, next_retry_at, synced_at
      ) VALUES (?, ?, ?, ?, ?, 0, NULL, NULL);`,
      [
        item.eventId,
        item.eventType,
        item.aggregateId,
        item.payloadJson,
        item.createdAt,
      ]
    );
  }

  async getPending(limit: number = 50): Promise<OutboxItem[]> {
    const now = new Date().toISOString();
    const rows = await this.db.all<any>(
      `SELECT * FROM sync_outbox
       WHERE synced_at IS NULL AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY created_at ASC LIMIT ?;`,
      [now, limit]
    );
    return rows.map(this.mapRow);
  }

  async getAllUnsynced(): Promise<OutboxItem[]> {
    const rows = await this.db.all<any>(
      `SELECT * FROM sync_outbox WHERE synced_at IS NULL ORDER BY created_at ASC;`
    );
    return rows.map(this.mapRow);
  }

  async markSynced(eventId: string, syncedAtUtc: string): Promise<void> {
    await this.db.run(
      `UPDATE sync_outbox SET synced_at = ? WHERE event_id = ?;`,
      [syncedAtUtc, eventId]
    );
  }

  async recordFailedAttempt(eventId: string, nextRetryAtUtc: string): Promise<void> {
    await this.db.run(
      `UPDATE sync_outbox SET attempts = attempts + 1, next_retry_at = ? WHERE event_id = ?;`,
      [nextRetryAtUtc, eventId]
    );
  }

  private mapRow(row: any): OutboxItem {
    return {
      eventId: row.event_id,
      eventType: row.event_type,
      aggregateId: row.aggregate_id,
      payloadJson: row.payload_json,
      createdAt: row.created_at,
      attempts: row.attempts,
      nextRetryAt: row.next_retry_at ?? null,
      syncedAt: row.synced_at ?? null,
    };
  }
}
