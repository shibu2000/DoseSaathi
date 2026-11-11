import type { DatabaseConnection } from '../types';
import type { PlannedOccurrence } from '@medchain/domain';

export type OccurrenceState =
  | 'PLANNED'
  | 'SCHEDULED'
  | 'DUE'
  | 'TAKEN'
  | 'SKIPPED'
  | 'UNCONFIRMED';

export const TERMINAL_OCCURRENCE_STATES: OccurrenceState[] = ['TAKEN', 'SKIPPED'];

export interface DoseOccurrenceRow {
  id: string;
  medicationId: string;
  scheduledAtUtc: string;
  scheduledLocalDate: string;
  scheduledLocalTime: string;
  timezoneId: string;
  state: OccurrenceState;
  snoozedUntil: string | null;
  handledAt: string | null;
  sourceAlarmId: string | null;
  createdAt: string;
  updatedAt: string;
}

export class OccurrenceRepository {
  constructor(private db: DatabaseConnection) {}

  async batchInsert(occurrences: PlannedOccurrence[]): Promise<void> {
    if (occurrences.length === 0) return;

    const now = new Date().toISOString();
    await this.db.withTransaction(async (tx) => {
      for (const occ of occurrences) {
        await tx.run(
          `INSERT OR IGNORE INTO dose_occurrences (
            id, medication_id, scheduled_at_utc, scheduled_local_date,
            scheduled_local_time, timezone_id, state, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?);`,
          [
            occ.occurrenceId,
            occ.medicationId,
            occ.scheduledAtUtc,
            occ.scheduledLocalDate,
            occ.scheduledLocalTime,
            occ.timezoneId,
            now,
            now,
          ]
        );
      }
    });
  }

  async getById(id: string): Promise<DoseOccurrenceRow | null> {
    const row = await this.db.get<any>(
      `SELECT * FROM dose_occurrences WHERE id = ?;`,
      [id]
    );
    return row ? this.mapRow(row) : null;
  }

  async getByDate(localDate: string): Promise<DoseOccurrenceRow[]> {
    const rows = await this.db.all<any>(
      `SELECT * FROM dose_occurrences WHERE scheduled_local_date = ? ORDER BY scheduled_local_time ASC;`,
      [localDate]
    );
    return rows.map(this.mapRow);
  }

  async updateState(id: string, state: OccurrenceState, handledAt?: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE dose_occurrences SET state = ?, handled_at = ?, updated_at = ? WHERE id = ?;`,
      [state, handledAt ?? now, now, id]
    );
  }

  /** Snooze keeps the original scheduled time (audit) and re-arms the occurrence for `snoozedUntilUtc`. */
  async snooze(id: string, snoozedUntilUtc: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE dose_occurrences SET state = 'SCHEDULED', snoozed_until = ?, handled_at = NULL, updated_at = ? WHERE id = ?;`,
      [snoozedUntilUtc, now, id]
    );
  }

  /** Open (not yet Taken/Skipped) occurrences whose effective alarm time is <= horizon. */
  async getScheduledForHorizon(horizonUtc: string): Promise<DoseOccurrenceRow[]> {
    const rows = await this.db.all<any>(
      `SELECT * FROM dose_occurrences
       WHERE state IN ('SCHEDULED', 'PLANNED', 'DUE')
         AND COALESCE(snoozed_until, scheduled_at_utc) <= ?
       ORDER BY COALESCE(snoozed_until, scheduled_at_utc) ASC;`,
      [horizonUtc]
    );
    return rows.map(this.mapRow);
  }

  /** Open occurrences whose effective time + graceMs is already in the past (unacknowledged). */
  async getOpenOverdue(nowUtc: string, graceMs: number): Promise<DoseOccurrenceRow[]> {
    const cutoff = new Date(new Date(nowUtc).getTime() - graceMs).toISOString();
    const rows = await this.db.all<any>(
      `SELECT * FROM dose_occurrences
       WHERE state IN ('SCHEDULED', 'PLANNED', 'DUE')
         AND COALESCE(snoozed_until, scheduled_at_utc) <= ?
       ORDER BY scheduled_at_utc ASC;`,
      [cutoff]
    );
    return rows.map(this.mapRow);
  }

  /** Removes not-yet-handled occurrences for a medication that start at/after `fromUtc` (used on edit). */
  async deleteOpenForMedication(medicationId: string, fromUtc: string): Promise<void> {
    await this.db.run(
      `DELETE FROM dose_occurrences
       WHERE medication_id = ? AND state IN ('SCHEDULED', 'PLANNED', 'DUE') AND scheduled_at_utc >= ?;`,
      [medicationId, fromUtc]
    );
  }

  async deleteOpenForMedicationAll(medicationId: string): Promise<void> {
    await this.db.run(
      `DELETE FROM dose_occurrences WHERE medication_id = ? AND state IN ('SCHEDULED', 'PLANNED', 'DUE');`,
      [medicationId]
    );
  }

  private mapRow(row: any): DoseOccurrenceRow {
    return {
      id: row.id,
      medicationId: row.medication_id,
      scheduledAtUtc: row.scheduled_at_utc,
      scheduledLocalDate: row.scheduled_local_date,
      scheduledLocalTime: row.scheduled_local_time,
      timezoneId: row.timezone_id,
      state: row.state,
      snoozedUntil: row.snoozed_until ?? null,
      handledAt: row.handled_at ?? null,
      sourceAlarmId: row.source_alarm_id ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
