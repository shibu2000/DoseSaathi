export interface DoseEventRow {
  seq: number;
  event_id: string;
  patient_device_id: string;
  medication_id: string;
  occurrence_id: string;
  event_type: string;
  scheduled_at: string;
  action_timestamp: string;
  timezone_id: string;
  medication_name: string | null;
  dosage_text: string | null;
  received_at: string;
}

export class EventRepo {
  constructor(private db: D1Database) {}

  insertStatement(e: {
    eventId: string; deviceId: string; medicationId: string; occurrenceId: string; eventType: string;
    scheduledAt: string; actionTimestamp: string; timezoneId: string; medicationName: string | null; dosageText: string | null; now: string;
  }) {
    return this.db
      .prepare(
        `INSERT INTO dose_events (event_id, patient_device_id, medication_id, occurrence_id, event_type, scheduled_at, action_timestamp, timezone_id, medication_name, dosage_text, received_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(patient_device_id, event_id) DO NOTHING`,
      )
      .bind(e.eventId, e.deviceId, e.medicationId, e.occurrenceId, e.eventType, e.scheduledAt, e.actionTimestamp, e.timezoneId, e.medicationName, e.dosageText, e.now);
  }

  /** Newest-first keyset page for a device since `since` (relationship confirmation time). */
  async page(deviceId: string, since: string, cursor: { ts: string; seq: number } | null, limit: number) {
    const r = cursor
      ? await this.db
          .prepare(
            `SELECT * FROM dose_events WHERE patient_device_id = ?1 AND action_timestamp >= ?2
             AND (action_timestamp < ?3 OR (action_timestamp = ?3 AND seq < ?4))
             ORDER BY action_timestamp DESC, seq DESC LIMIT ?5`,
          )
          .bind(deviceId, since, cursor.ts, cursor.seq, limit)
          .all<DoseEventRow>()
      : await this.db
          .prepare(
            `SELECT * FROM dose_events WHERE patient_device_id = ?1 AND action_timestamp >= ?2
             ORDER BY action_timestamp DESC, seq DESC LIMIT ?3`,
          )
          .bind(deviceId, since, limit)
          .all<DoseEventRow>();
    return r.results;
  }
}
