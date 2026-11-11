export interface DeviceRow {
  id: string;
  secret_hash: string;
  display_name: string | null;
  platform: string;
  push_token: string | null;
  app_version: string;
  plan_version: number;
  last_applied_version: number;
  last_seen_at: string;
  last_synced_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export class DeviceRepo {
  constructor(private db: D1Database) {}

  async insert(d: { id: string; secretHash: string; displayName: string | null; platform: string; pushToken: string | null; appVersion: string; now: string }) {
    await this.db
      .prepare(
        `INSERT INTO patient_devices (id, secret_hash, display_name, platform, push_token, app_version, last_seen_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
      )
      .bind(d.id, d.secretHash, d.displayName, d.platform, d.pushToken, d.appVersion, d.now)
      .run();
  }
  findById(id: string) {
    return this.db.prepare(`SELECT * FROM patient_devices WHERE id = ?1 AND deleted_at IS NULL`).bind(id).first<DeviceRow>();
  }
  async update(id: string, f: { displayName?: string; pushToken?: string | null; appVersion?: string }, now: string) {
    await this.db
      .prepare(
        `UPDATE patient_devices SET
           display_name = CASE WHEN ?2 = 1 THEN ?3 ELSE display_name END,
           push_token = CASE WHEN ?4 = 1 THEN ?5 ELSE push_token END,
           app_version = CASE WHEN ?6 = 1 THEN ?7 ELSE app_version END,
           last_seen_at = ?8
         WHERE id = ?1`,
      )
      .bind(
        id,
        f.displayName !== undefined ? 1 : 0,
        f.displayName ?? null,
        f.pushToken !== undefined ? 1 : 0,
        f.pushToken ?? null,
        f.appVersion !== undefined ? 1 : 0,
        f.appVersion ?? null,
        now,
      )
      .run();
  }
  /** Throttled: only writes if last_seen_at is older than `olderThan`. */
  async touchSeen(id: string, now: string, olderThan: string) {
    await this.db
      .prepare(`UPDATE patient_devices SET last_seen_at = ?2 WHERE id = ?1 AND last_seen_at < ?3`)
      .bind(id, now, olderThan)
      .run();
  }
  async touchSynced(id: string, now: string) {
    await this.db
      .prepare(`UPDATE patient_devices SET last_synced_at = ?2, last_seen_at = ?2 WHERE id = ?1`)
      .bind(id, now)
      .run();
  }
  async clearPushToken(id: string) {
    await this.db.prepare(`UPDATE patient_devices SET push_token = NULL WHERE id = ?1`).bind(id).run();
  }
  softDeleteStatements(id: string, now: string) {
    return [
      this.db
        .prepare(`UPDATE patient_devices SET deleted_at = ?2, push_token = NULL, display_name = NULL WHERE id = ?1`)
        .bind(id, now),
    ];
  }
  getCursor(deviceId: string) {
    return this.db
      .prepare(`SELECT commands_cursor FROM device_sync_cursors WHERE device_id = ?1`)
      .bind(deviceId)
      .first<{ commands_cursor: number }>();
  }
  async setCursor(deviceId: string, cursor: number, now: string) {
    await this.db
      .prepare(
        `INSERT INTO device_sync_cursors (device_id, commands_cursor, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(device_id) DO UPDATE SET commands_cursor = MAX(commands_cursor, excluded.commands_cursor), updated_at = excluded.updated_at`,
      )
      .bind(deviceId, cursor, now)
      .run();
  }
}
