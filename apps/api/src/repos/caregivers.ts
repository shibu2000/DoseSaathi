export interface CaregiverRow {
  id: string;
  auth_provider: string;
  auth_subject: string;
  email: string;
  display_name: string;
  disabled_at: string | null;
}
export interface RefreshTokenRow {
  id: string;
  caregiver_user_id: string;
  family_id: string;
  token_hash: string;
  expires_at: string;
  rotated_at: string | null;
  revoked_at: string | null;
}

export class CaregiverRepo {
  constructor(private db: D1Database) {}

  insertUserStatement(u: { id: string; provider: string; subject: string; email: string; displayName: string; now: string }) {
    return this.db
      .prepare(
        `INSERT INTO caregiver_users (id, auth_provider, auth_subject, email, display_name, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
      )
      .bind(u.id, u.provider, u.subject, u.email, u.displayName, u.now);
  }
  findById(id: string) {
    return this.db.prepare(`SELECT * FROM caregiver_users WHERE id = ?1`).bind(id).first<CaregiverRow>();
  }
  findByEmail(email: string) {
    return this.db.prepare(`SELECT * FROM caregiver_users WHERE email = ?1`).bind(email).first<CaregiverRow>();
  }
  findBySubject(provider: string, subject: string) {
    return this.db
      .prepare(`SELECT * FROM caregiver_users WHERE auth_provider = ?1 AND auth_subject = ?2`)
      .bind(provider, subject)
      .first<CaregiverRow>();
  }

  insertRefreshToken(t: { id: string; userId: string; familyId: string; hash: string; expiresAt: string; now: string }) {
    return this.db
      .prepare(
        `INSERT INTO refresh_tokens (id, caregiver_user_id, family_id, token_hash, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
      .bind(t.id, t.userId, t.familyId, t.hash, t.expiresAt, t.now);
  }
  findRefreshByHash(hash: string) {
    return this.db.prepare(`SELECT * FROM refresh_tokens WHERE token_hash = ?1`).bind(hash).first<RefreshTokenRow>();
  }
  /** Atomically marks a live token rotated. Returns true only for the single winner. */
  async markRotated(id: string, now: string): Promise<boolean> {
    const r = await this.db
      .prepare(`UPDATE refresh_tokens SET rotated_at = ?2 WHERE id = ?1 AND rotated_at IS NULL AND revoked_at IS NULL`)
      .bind(id, now)
      .run();
    return (r.meta.changes ?? 0) === 1;
  }
  async revokeFamily(familyId: string, now: string) {
    await this.db
      .prepare(`UPDATE refresh_tokens SET revoked_at = ?2 WHERE family_id = ?1 AND revoked_at IS NULL`)
      .bind(familyId, now)
      .run();
  }
  async purgeExpiredRefresh(now: string) {
    await this.db.prepare(`DELETE FROM refresh_tokens WHERE expires_at < ?1`).bind(now).run();
  }
}
