export type CommandStatus = 'PENDING_DEVICE' | 'RECEIVED' | 'APPLIED' | 'REJECTED' | 'SUPERSEDED';
export interface CommandRow {
  seq: number;
  id: string;
  relationship_id: string;
  patient_device_id: string;
  idempotency_key: string;
  request_hash: string;
  base_version: number;
  plan_version: number;
  status: CommandStatus;
  created_at: string;
  received_at: string | null;
  applied_at: string | null;
  applied_version: number | null;
  error_code: string | null;
}
export interface SnapshotRow {
  id: string;
  version: number;
  snapshot_json: string;
  source: string;
  rejected_at: string | null;
}

export class PlanRepo {
  constructor(private db: D1Database) {}

  latestVisibleSnapshot(deviceId: string) {
    return this.db
      .prepare(`SELECT * FROM plan_snapshots WHERE patient_device_id = ?1 AND rejected_at IS NULL ORDER BY version DESC LIMIT 1`)
      .bind(deviceId)
      .first<SnapshotRow>();
  }
  latestDeviceReport(deviceId: string) {
    return this.db
      .prepare(`SELECT * FROM plan_snapshots WHERE patient_device_id = ?1 AND source = 'DEVICE' ORDER BY version DESC LIMIT 1`)
      .bind(deviceId)
      .first<SnapshotRow & { created_at: string }>();
  }
  snapshotByVersion(deviceId: string, version: number) {
    return this.db
      .prepare(`SELECT * FROM plan_snapshots WHERE patient_device_id = ?1 AND version = ?2`)
      .bind(deviceId, version)
      .first<SnapshotRow>();
  }
  async maxVersion(deviceId: string): Promise<number> {
    const r = await this.db
      .prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM plan_snapshots WHERE patient_device_id = ?1`)
      .bind(deviceId)
      .first<{ v: number }>();
    return r?.v ?? 0;
  }
  async pendingCommandCount(deviceId: string): Promise<number> {
    const r = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM sync_commands WHERE patient_device_id = ?1 AND status IN ('PENDING_DEVICE', 'RECEIVED')`)
      .bind(deviceId)
      .first<{ n: number }>();
    return r?.n ?? 0;
  }
  insertSnapshotStatement(s: { id: string; deviceId: string; version: number; json: string; source: 'CAREGIVER' | 'DEVICE'; relationshipId: string | null; now: string }) {
    return this.db
      .prepare(
        `INSERT INTO plan_snapshots (id, patient_device_id, version, snapshot_json, source, authored_by_relationship_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(s.id, s.deviceId, s.version, s.json, s.source, s.relationshipId, s.now);
  }
  /** Moves the device's effective plan head; guarded by the expected previous head. */
  setHeadStatement(deviceId: string, newVersion: number, expectedPrevious: number, applied: boolean) {
    return this.db
      .prepare(
        `UPDATE patient_devices SET plan_version = ?2, last_applied_version = CASE WHEN ?4 = 1 THEN ?2 ELSE last_applied_version END
         WHERE id = ?1 AND plan_version = ?3`,
      )
      .bind(deviceId, newVersion, expectedPrevious, applied ? 1 : 0);
  }
  insertCommandStatement(c: { id: string; relationshipId: string; deviceId: string; key: string; hash: string; baseVersion: number; planVersion: number; now: string }) {
    return this.db
      .prepare(
        `INSERT INTO sync_commands (id, relationship_id, patient_device_id, idempotency_key, request_hash, base_version, plan_version, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'PENDING_DEVICE', ?8)`,
      )
      .bind(c.id, c.relationshipId, c.deviceId, c.key, c.hash, c.baseVersion, c.planVersion, c.now);
  }
  supersedePendingStatement(deviceId: string, belowVersion: number) {
    return this.db
      .prepare(
        `UPDATE sync_commands SET status = 'SUPERSEDED', error_code = 'SUPERSEDED_BY_NEWER'
         WHERE patient_device_id = ?1 AND status = 'PENDING_DEVICE' AND plan_version < ?2`,
      )
      .bind(deviceId, belowVersion);
  }
  findCommandForRelationship(commandId: string, relationshipId: string) {
    return this.db
      .prepare(`SELECT * FROM sync_commands WHERE id = ?1 AND relationship_id = ?2`)
      .bind(commandId, relationshipId)
      .first<CommandRow>();
  }
  findCommandForDevice(commandId: string, deviceId: string) {
    return this.db
      .prepare(`SELECT * FROM sync_commands WHERE id = ?1 AND patient_device_id = ?2`)
      .bind(commandId, deviceId)
      .first<CommandRow>();
  }
  findByIdempotency(relationshipId: string, key: string) {
    return this.db
      .prepare(`SELECT * FROM sync_commands WHERE relationship_id = ?1 AND idempotency_key = ?2`)
      .bind(relationshipId, key)
      .first<CommandRow>();
  }
  latestOpenCommand(relationshipId: string) {
    return this.db
      .prepare(
        `SELECT * FROM sync_commands WHERE relationship_id = ?1 AND status IN ('PENDING_DEVICE','RECEIVED') ORDER BY seq DESC LIMIT 1`,
      )
      .bind(relationshipId)
      .first<CommandRow>();
  }
  async openCommandsForDevice(deviceId: string, afterSeq: number, limit: number) {
    const r = await this.db
      .prepare(
        `SELECT c.* FROM sync_commands c JOIN relationships r ON r.id = c.relationship_id
         WHERE c.patient_device_id = ?1 AND c.status IN ('PENDING_DEVICE', 'RECEIVED') AND c.seq > ?2 AND r.status = 'ACTIVE'
         ORDER BY c.seq LIMIT ?3`,
      )
      .bind(deviceId, afterSeq, limit)
      .all<CommandRow>();
    return r.results;
  }
  async markReceived(id: string, now: string) {
    await this.db
      .prepare(`UPDATE sync_commands SET status = 'RECEIVED', received_at = ?2 WHERE id = ?1 AND status = 'PENDING_DEVICE'`)
      .bind(id, now)
      .run();
  }
  /** Conditional transition; true if a row changed. */
  async transition(id: string, from: CommandStatus[], to: CommandStatus, f: { now: string; appliedVersion?: number; errorCode?: string }): Promise<boolean> {
    const placeholders = from.map((_, i) => `?${i + 6}`).join(',');
    const r = await this.db
      .prepare(
        `UPDATE sync_commands SET status = ?2,
           received_at = COALESCE(received_at, ?3),
           applied_at = CASE WHEN ?2 IN ('APPLIED','REJECTED') THEN ?3 ELSE applied_at END,
           applied_version = COALESCE(?4, applied_version),
           error_code = COALESCE(?5, error_code)
         WHERE id = ?1 AND status IN (${placeholders})`,
      )
      .bind(id, to, f.now, f.appliedVersion ?? null, f.errorCode ?? null, ...from)
      .run();
    return (r.meta.changes ?? 0) === 1;
  }
  /** After APPLIED. */
  async raiseAppliedVersion(deviceId: string, version: number) {
    await this.db
      .prepare(`UPDATE patient_devices SET last_applied_version = MAX(last_applied_version, MIN(?2, plan_version)) WHERE id = ?1`)
      .bind(deviceId, version)
      .run();
  }
  /** After REJECTED: hide the snapshot and move the effective head back to the newest non-rejected one. */
  rejectSnapshotStatements(deviceId: string, version: number, now: string) {
    return [
      this.db
        .prepare(`UPDATE plan_snapshots SET rejected_at = ?3 WHERE patient_device_id = ?1 AND version = ?2 AND source = 'CAREGIVER'`)
        .bind(deviceId, version, now),
      this.db
        .prepare(
          `UPDATE patient_devices SET plan_version = COALESCE((SELECT MAX(version) FROM plan_snapshots WHERE patient_device_id = ?1 AND rejected_at IS NULL), 0)
           WHERE id = ?1`,
        )
        .bind(deviceId),
    ];
  }
}
