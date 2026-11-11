export type RelationshipStatus = 'ACTIVE' | 'REVOKED_BY_PATIENT' | 'DISCONNECTED_BY_CAREGIVER';
export interface RelationshipRow {
  id: string;
  connection_request_id: string;
  patient_device_id: string;
  caregiver_user_id: string;
  relationship_label: string;
  status: RelationshipStatus;
  permissions_json: string;
  confirmed_at: string;
  revoked_at: string | null;
  version: number;
}
export interface CaregiverRelationshipRow extends RelationshipRow {
  patient_display_name: string | null;
  device_last_seen_at: string | null;
  device_last_synced_at: string | null;
  plan_version: number;
  last_applied_version: number;
}
export interface PatientRelationshipRow extends RelationshipRow {
  caregiver_display_name: string;
  caregiver_email: string;
}

const CG_SELECT = `SELECT r.*, d.display_name AS patient_display_name, d.last_seen_at AS device_last_seen_at,
    d.last_synced_at AS device_last_synced_at, d.plan_version, d.last_applied_version
  FROM relationships r JOIN patient_devices d ON d.id = r.patient_device_id`;

export class RelationshipRepo {
  constructor(private db: D1Database) {}

  /** Participant-scoped lookup: null unless caregiverId owns the relationship. */
  findForCaregiver(id: string, caregiverId: string) {
    return this.db
      .prepare(`${CG_SELECT} WHERE r.id = ?1 AND r.caregiver_user_id = ?2`)
      .bind(id, caregiverId)
      .first<CaregiverRelationshipRow>();
  }
  async listActiveForCaregiver(caregiverId: string) {
    const r = await this.db
      .prepare(`${CG_SELECT} WHERE r.caregiver_user_id = ?1 AND r.status = 'ACTIVE' ORDER BY r.confirmed_at DESC`)
      .bind(caregiverId)
      .all<CaregiverRelationshipRow>();
    return r.results;
  }
  private patientSelect = `SELECT r.*, c.display_name AS caregiver_display_name, c.email AS caregiver_email
    FROM relationships r JOIN caregiver_users c ON c.id = r.caregiver_user_id`;
  findForDevice(id: string, deviceId: string) {
    return this.db
      .prepare(`${this.patientSelect} WHERE r.id = ?1 AND r.patient_device_id = ?2`)
      .bind(id, deviceId)
      .first<PatientRelationshipRow>();
  }
  async listForDevice(deviceId: string) {
    const r = await this.db
      .prepare(`${this.patientSelect} WHERE r.patient_device_id = ?1 ORDER BY r.confirmed_at DESC`)
      .bind(deviceId)
      .all<PatientRelationshipRow>();
    return r.results;
  }
  findActivePair(deviceId: string, caregiverId: string) {
    return this.db
      .prepare(`SELECT id FROM relationships WHERE patient_device_id = ?1 AND caregiver_user_id = ?2 AND status = 'ACTIVE'`)
      .bind(deviceId, caregiverId)
      .first<{ id: string }>();
  }
  findById(id: string) {
    return this.db.prepare(`SELECT * FROM relationships WHERE id = ?1`).bind(id).first<RelationshipRow>();
  }
  /** Ends an ACTIVE relationship and closes its open commands (one atomic batch). */
  endStatements(id: string, to: Exclude<RelationshipStatus, 'ACTIVE'>, now: string) {
    return [
      this.db
        .prepare(`UPDATE relationships SET status = ?2, revoked_at = ?3, version = version + 1 WHERE id = ?1 AND status = 'ACTIVE'`)
        .bind(id, to, now),
      this.db
        .prepare(
          `UPDATE sync_commands SET status = 'SUPERSEDED', error_code = 'RELATIONSHIP_ENDED'
           WHERE relationship_id = ?1 AND status IN ('PENDING_DEVICE', 'RECEIVED')`,
        )
        .bind(id),
    ];
  }
  async updatePermissions(id: string, permissionsJson: string) {
    await this.db
      .prepare(`UPDATE relationships SET permissions_json = ?2, version = version + 1 WHERE id = ?1 AND status = 'ACTIVE'`)
      .bind(id, permissionsJson)
      .run();
  }
  endAllForDeviceStatements(deviceId: string, now: string) {
    return [
      this.db
        .prepare(
          `UPDATE sync_commands SET status = 'SUPERSEDED', error_code = 'RELATIONSHIP_ENDED'
           WHERE patient_device_id = ?1 AND status IN ('PENDING_DEVICE', 'RECEIVED')`,
        )
        .bind(deviceId),
      this.db
        .prepare(
          `UPDATE relationships SET status = 'REVOKED_BY_PATIENT', revoked_at = ?2, version = version + 1
           WHERE patient_device_id = ?1 AND status = 'ACTIVE'`,
        )
        .bind(deviceId, now),
    ];
  }
}
