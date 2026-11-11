import type { DatabaseConnection } from '../types';
import type { RelationshipSummary } from '@medchain/contracts';

export interface CachedRelationship {
  relationshipId: string;
  patientId: string;
  caregiverId: string;
  permissions: string[];
  status: string;
  lastSyncedAt: string;
}

export class RelationshipCacheRepository {
  constructor(private db: DatabaseConnection) {}

  async upsert(rel: CachedRelationship): Promise<void> {
    await this.db.run(
      `INSERT INTO relationship_cache (
        relationship_id, patient_id, caregiver_id, permissions_json, status, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(relationship_id) DO UPDATE SET
        patient_id = excluded.patient_id,
        caregiver_id = excluded.caregiver_id,
        permissions_json = excluded.permissions_json,
        status = excluded.status,
        last_synced_at = excluded.last_synced_at;`,
      [
        rel.relationshipId,
        rel.patientId,
        rel.caregiverId,
        JSON.stringify(rel.permissions),
        rel.status,
        rel.lastSyncedAt,
      ]
    );
  }

  async getAll(): Promise<CachedRelationship[]> {
    const rows = await this.db.all<any>(`SELECT * FROM relationship_cache WHERE status = 'ACTIVE';`);
    return rows.map((r) => ({
      relationshipId: r.relationship_id,
      patientId: r.patient_id,
      caregiverId: r.caregiver_id,
      permissions: JSON.parse(r.permissions_json || '[]'),
      status: r.status,
      lastSyncedAt: r.last_synced_at,
    }));
  }

  async getById(relationshipId: string): Promise<CachedRelationship | null> {
    const row = await this.db.get<any>(
      `SELECT * FROM relationship_cache WHERE relationship_id = ?;`,
      [relationshipId]
    );
    if (!row) return null;
    return {
      relationshipId: row.relationship_id,
      patientId: row.patient_id,
      caregiverId: row.caregiver_id,
      permissions: JSON.parse(row.permissions_json || '[]'),
      status: row.status,
      lastSyncedAt: row.last_synced_at,
    };
  }

  /** Stores the server's relationship summary so Family Hub can show last-known data offline. */
  async upsertSummary(summary: RelationshipSummary, caregiverId: string, syncedAtIso: string): Promise<void> {
    await this.upsert({
      relationshipId: summary.relationshipId,
      patientId: summary.patientDisplayName,
      caregiverId,
      permissions: summary.permissions,
      status: summary.status,
      lastSyncedAt: syncedAtIso,
    });
    await this.db.run(`UPDATE relationship_cache SET summary_json = ? WHERE relationship_id = ?;`, [
      JSON.stringify(summary),
      summary.relationshipId,
    ]);
  }

  async getAllSummaries(): Promise<Array<{ summary: RelationshipSummary; lastSyncedAt: string }>> {
    const rows = await this.db.all<any>(
      `SELECT summary_json, last_synced_at FROM relationship_cache WHERE status = 'ACTIVE' AND summary_json IS NOT NULL;`
    );
    const out: Array<{ summary: RelationshipSummary; lastSyncedAt: string }> = [];
    for (const r of rows) {
      try {
        out.push({ summary: JSON.parse(r.summary_json), lastSyncedAt: r.last_synced_at });
      } catch {}
    }
    return out;
  }

  /** Removes everything cached for caregiver use (called on sign-out / revoked access). */
  async clear(): Promise<void> {
    await this.db.run(`DELETE FROM relationship_cache;`);
  }

  async remove(relationshipId: string): Promise<void> {
    await this.db.run(`DELETE FROM relationship_cache WHERE relationship_id = ?;`, [
      relationshipId,
    ]);
  }
}
