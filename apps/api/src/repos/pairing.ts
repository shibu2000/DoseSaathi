export interface PairingSessionRow {
  id: string;
  patient_device_id: string;
  code_hash: string;
  secret_hash: string;
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';
  failed_attempts: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}
export type RequestStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
export interface ConnectionRequestRow {
  id: string;
  pairing_session_id: string;
  caregiver_user_id: string;
  requested_permissions_json: string;
  status: RequestStatus;
  relationship_id: string | null;
  requested_at: string;
  responded_at: string | null;
}
export interface RequestWithContext extends ConnectionRequestRow {
  patient_device_id: string;
  session_expires_at: string;
  caregiver_display_name: string;
  caregiver_email: string;
  patient_display_name: string | null;
}

export class PairingRepo {
  constructor(private db: D1Database) {}

  /** Statements that retire the device's live sessions (and cancel their pending requests). */
  invalidateDeviceSessionsStatements(deviceId: string, now: string) {
    return [
      this.db
        .prepare(
          `UPDATE pairing_sessions SET status = 'REVOKED'
           WHERE patient_device_id = ?1 AND (status = 'PENDING' OR
             (status = 'CONSUMED' AND id IN (SELECT pairing_session_id FROM connection_requests WHERE status = 'PENDING')))`,
        )
        .bind(deviceId),
      this.db
        .prepare(
          `UPDATE connection_requests SET status = 'CANCELLED', responded_at = ?2
           WHERE status = 'PENDING' AND pairing_session_id IN
             (SELECT id FROM pairing_sessions WHERE patient_device_id = ?1 AND status = 'REVOKED')`,
        )
        .bind(deviceId, now),
    ];
  }
  insertSessionStatement(s: { id: string; deviceId: string; codeHash: string; secretHash: string; expiresAt: string; now: string }) {
    return this.db
      .prepare(
        `INSERT INTO pairing_sessions (id, patient_device_id, code_hash, secret_hash, status, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, 'PENDING', ?5, ?6)`,
      )
      .bind(s.id, s.deviceId, s.codeHash, s.secretHash, s.expiresAt, s.now);
  }
  findSession(id: string) {
    return this.db.prepare(`SELECT * FROM pairing_sessions WHERE id = ?1`).bind(id).first<PairingSessionRow>();
  }
  findLiveSessionByCodeHash(hash: string, now: string) {
    return this.db
      .prepare(`SELECT * FROM pairing_sessions WHERE code_hash = ?1 AND status = 'PENDING' AND expires_at > ?2`)
      .bind(hash, now)
      .first<PairingSessionRow>();
  }
  async consume(id: string, now: string): Promise<boolean> {
    const r = await this.db
      .prepare(`UPDATE pairing_sessions SET status = 'CONSUMED', consumed_at = ?2 WHERE id = ?1 AND status = 'PENDING' AND expires_at > ?2`)
      .bind(id, now)
      .run();
    return (r.meta.changes ?? 0) === 1;
  }
  async recordFailedSecret(id: string, maxAttempts: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE pairing_sessions SET failed_attempts = failed_attempts + 1,
           status = CASE WHEN failed_attempts + 1 >= ?2 THEN 'REVOKED' ELSE status END
         WHERE id = ?1 AND status = 'PENDING'`,
      )
      .bind(id, maxAttempts)
      .run();
  }

  insertRequestStatement(r: { id: string; sessionId: string; caregiverId: string; permissionsJson: string; now: string }) {
    return this.db
      .prepare(
        `INSERT INTO connection_requests (id, pairing_session_id, caregiver_user_id, requested_permissions_json, status, requested_at)
         VALUES (?1, ?2, ?3, ?4, 'PENDING', ?5)`,
      )
      .bind(r.id, r.sessionId, r.caregiverId, r.permissionsJson, r.now);
  }
  private ctxSelect = `SELECT r.*, s.patient_device_id, s.expires_at AS session_expires_at,
      c.display_name AS caregiver_display_name, c.email AS caregiver_email, d.display_name AS patient_display_name
    FROM connection_requests r
    JOIN pairing_sessions s ON s.id = r.pairing_session_id
    JOIN caregiver_users c ON c.id = r.caregiver_user_id
    JOIN patient_devices d ON d.id = s.patient_device_id`;
  findRequestContext(id: string) {
    return this.db.prepare(`${this.ctxSelect} WHERE r.id = ?1`).bind(id).first<RequestWithContext>();
  }
  findRequestContextBySession(sessionId: string) {
    return this.db.prepare(`${this.ctxSelect} WHERE r.pairing_session_id = ?1`).bind(sessionId).first<RequestWithContext>();
  }
  /** Conditional transition away from PENDING. */
  async transitionRequest(id: string, to: RequestStatus, now: string): Promise<boolean> {
    const r = await this.db
      .prepare(`UPDATE connection_requests SET status = ?2, responded_at = ?3 WHERE id = ?1 AND status = 'PENDING'`)
      .bind(id, to, now)
      .run();
    return (r.meta.changes ?? 0) === 1;
  }
  approveStatements(a: { requestId: string; relationshipId: string; label: string; permissionsJson: string; now: string }) {
    return [
      // Inserts the relationship only if the request is still pending and the session still valid.
      this.db
        .prepare(
          `INSERT INTO relationships (id, connection_request_id, patient_device_id, caregiver_user_id, relationship_label, status, permissions_json, confirmed_at, version)
           SELECT ?2, r.id, s.patient_device_id, r.caregiver_user_id, ?3, 'ACTIVE', ?4, ?5, 1
           FROM connection_requests r JOIN pairing_sessions s ON s.id = r.pairing_session_id
           WHERE r.id = ?1 AND r.status = 'PENDING' AND s.expires_at > ?5`,
        )
        .bind(a.requestId, a.relationshipId, a.label, a.permissionsJson, a.now),
      this.db
        .prepare(
          `UPDATE connection_requests SET status = 'APPROVED', responded_at = ?3, relationship_id = ?2
           WHERE id = ?1 AND status = 'PENDING' AND EXISTS (SELECT 1 FROM relationships WHERE id = ?2)`,
        )
        .bind(a.requestId, a.relationshipId, a.now),
    ];
  }
  async expirePending(now: string) {
    await this.db.prepare(`UPDATE pairing_sessions SET status = 'EXPIRED' WHERE status = 'PENDING' AND expires_at <= ?1`).bind(now).run();
    await this.db
      .prepare(
        `UPDATE connection_requests SET status = 'EXPIRED', responded_at = ?1
         WHERE status = 'PENDING' AND pairing_session_id IN (SELECT id FROM pairing_sessions WHERE expires_at <= ?1)`,
      )
      .bind(now)
      .run();
  }
}
