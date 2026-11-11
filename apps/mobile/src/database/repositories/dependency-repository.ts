import type { DatabaseConnection } from '../types';
import type { FallbackPolicy } from '@medchain/contracts';

export interface DependencyRecord {
  id: string;
  parentMedicationId: string;
  childMedicationId: string;
  dependencyType: 'SAME_DAY_AFTER_TAKEN' | 'AFTER_COURSE_COMPLETED';
  delayMinutes: number;
  phaseDelayHours: number;
  fallbackPolicy: FallbackPolicy | null;
  fallbackTime: string | null;
  createdAt: string;
}

export class DependencyRepository {
  constructor(private db: DatabaseConnection) {}

  async create(dep: DependencyRecord): Promise<void> {
    await this.db.run(
      `INSERT INTO medication_dependencies (
        id, parent_medication_id, child_medication_id, dependency_type,
        delay_minutes, phase_delay_hours, fallback_policy, fallback_time,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        dep.id,
        dep.parentMedicationId,
        dep.childMedicationId,
        dep.dependencyType,
        dep.delayMinutes,
        dep.phaseDelayHours,
        dep.fallbackPolicy ?? null,
        dep.fallbackTime ?? null,
        dep.createdAt,
      ]
    );
  }

  async getChildren(parentMedicationId: string): Promise<DependencyRecord[]> {
    const rows = await this.db.all<any>(
      `SELECT * FROM medication_dependencies WHERE parent_medication_id = ?;`,
      [parentMedicationId]
    );
    return rows.map(this.mapRow);
  }

  async deleteByChild(childMedicationId: string): Promise<void> {
    await this.db.run(`DELETE FROM medication_dependencies WHERE child_medication_id = ?;`, [childMedicationId]);
  }

  async getParents(childMedicationId: string): Promise<DependencyRecord[]> {
    const rows = await this.db.all<any>(
      `SELECT * FROM medication_dependencies WHERE child_medication_id = ?;`,
      [childMedicationId]
    );
    return rows.map(this.mapRow);
  }

  private mapRow(row: any): DependencyRecord {
    return {
      id: row.id,
      parentMedicationId: row.parent_medication_id,
      childMedicationId: row.child_medication_id,
      dependencyType: row.dependency_type,
      delayMinutes: row.delay_minutes ?? 0,
      phaseDelayHours: row.phase_delay_hours ?? 0,
      fallbackPolicy: row.fallback_policy ?? null,
      fallbackTime: row.fallback_time ?? null,
      createdAt: row.created_at,
    };
  }
}
