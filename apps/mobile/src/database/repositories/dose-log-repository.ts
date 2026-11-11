import type { DatabaseConnection } from '../types';
import type { DoseEventType } from '@medchain/contracts';

export interface DoseLogRecord {
  id: string;
  medicationId: string;
  doseOccurrenceId: string | null;
  scheduledAt: string;
  actionTaken: DoseEventType;
  actionTimestamp: string;
  syncedToCloud: boolean;
  eventId: string;
}

export class DoseLogRepository {
  constructor(private db: DatabaseConnection) {}

  async create(log: DoseLogRecord): Promise<void> {
    await this.db.run(
      `INSERT INTO dose_logs (
        id, med_id, dose_occurrence_id, scheduled_at, action_taken,
        action_timestamp, synced_to_cloud, event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        log.id,
        log.medicationId,
        log.doseOccurrenceId ?? null,
        log.scheduledAt,
        log.actionTaken,
        log.actionTimestamp,
        log.syncedToCloud ? 1 : 0,
        log.eventId,
      ]
    );
  }

  async getHistory(medicationId?: string, limit: number = 50): Promise<DoseLogRecord[]> {
    const query = medicationId
      ? `SELECT * FROM dose_logs WHERE med_id = ? ORDER BY action_timestamp DESC LIMIT ?;`
      : `SELECT * FROM dose_logs ORDER BY action_timestamp DESC LIMIT ?;`;
    const params = medicationId ? [medicationId, limit] : [limit];

    const rows = await this.db.all<any>(query, params);
    return rows.map(this.mapRow);
  }

  async getUnsynced(): Promise<DoseLogRecord[]> {
    const rows = await this.db.all<any>(
      `SELECT * FROM dose_logs WHERE synced_to_cloud = 0 ORDER BY action_timestamp ASC;`
    );
    return rows.map(this.mapRow);
  }

  async markSynced(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    const placeholders = eventIds.map(() => '?').join(', ');
    await this.db.run(
      `UPDATE dose_logs SET synced_to_cloud = 1 WHERE event_id IN (${placeholders});`,
      eventIds
    );
  }

  private mapRow(row: any): DoseLogRecord {
    return {
      id: row.id,
      medicationId: row.med_id,
      doseOccurrenceId: row.dose_occurrence_id ?? null,
      scheduledAt: row.scheduled_at,
      actionTaken: row.action_taken,
      actionTimestamp: row.action_timestamp,
      syncedToCloud: Boolean(row.synced_to_cloud),
      eventId: row.event_id,
    };
  }
}
