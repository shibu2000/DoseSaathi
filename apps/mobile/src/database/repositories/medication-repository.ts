import type { DatabaseConnection } from '../types';
import type { Medication, LifecycleStatus } from '@medchain/contracts';

function mapRowToMedication(row: any): Medication {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    dosageText: row.dosage_text,
    doseQuantity: row.dose_quantity,
    doseUnit: row.dose_unit,
    instructions: row.instructions ?? undefined,
    lifecycleStatus: row.lifecycle_status,
    courseType: row.course_type,
    courseStartAt: row.course_start_at,
    maxDurationDays: row.max_duration_days ?? null,
    maxTotalDoses: row.max_total_doses ?? null,
    dosesTakenCount: row.doses_taken_count,
    trackStock: Boolean(row.track_stock),
    currentStock: row.current_stock,
    lowStockThreshold: row.low_stock_threshold,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MedicationRepository {
  constructor(private db: DatabaseConnection) {}

  async create(med: Medication): Promise<void> {
    await this.db.run(
      `INSERT INTO medications (
        id, profile_id, name, dosage_text, dose_quantity, dose_unit,
        instructions, lifecycle_status, course_type, course_start_at,
        max_duration_days, max_total_doses, doses_taken_count,
        track_stock, current_stock, low_stock_threshold, version,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        med.id,
        med.profileId,
        med.name,
        med.dosageText,
        med.doseQuantity,
        med.doseUnit,
        med.instructions ?? null,
        med.lifecycleStatus,
        med.courseType,
        med.courseStartAt,
        med.maxDurationDays ?? null,
        med.maxTotalDoses ?? null,
        med.dosesTakenCount,
        med.trackStock ? 1 : 0,
        med.currentStock,
        med.lowStockThreshold,
        med.version,
        med.createdAt,
        med.updatedAt,
      ]
    );
  }

  async getById(id: string): Promise<Medication | null> {
    const row = await this.db.get<any>(
      `SELECT * FROM medications WHERE id = ?;`,
      [id]
    );
    return row ? mapRowToMedication(row) : null;
  }

  async getAll(): Promise<Medication[]> {
    const rows = await this.db.all<any>(
      `SELECT * FROM medications ORDER BY created_at ASC;`
    );
    return rows.map(mapRowToMedication);
  }

  async getAllForProfile(profileId: string): Promise<Medication[]> {
    const rows = await this.db.all<any>(
      `SELECT * FROM medications WHERE profile_id = ? ORDER BY created_at ASC;`,
      [profileId]
    );
    return rows.map(mapRowToMedication);
  }

  async getByLifecycle(lifecycle: LifecycleStatus, profileId?: string): Promise<Medication[]> {
    const query = profileId
      ? `SELECT * FROM medications WHERE lifecycle_status = ? AND profile_id = ? ORDER BY created_at ASC;`
      : `SELECT * FROM medications WHERE lifecycle_status = ? ORDER BY created_at ASC;`;
    const params = profileId ? [lifecycle, profileId] : [lifecycle];
    const rows = await this.db.all<any>(query, params);
    return rows.map(mapRowToMedication);
  }

  async update(med: Medication): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE medications SET
        name = ?, dosage_text = ?, dose_quantity = ?, dose_unit = ?,
        instructions = ?, lifecycle_status = ?, course_type = ?,
        course_start_at = ?, max_duration_days = ?, max_total_doses = ?,
        doses_taken_count = ?, track_stock = ?, current_stock = ?,
        low_stock_threshold = ?, version = version + 1, updated_at = ?
       WHERE id = ?;`,
      [
        med.name,
        med.dosageText,
        med.doseQuantity,
        med.doseUnit,
        med.instructions ?? null,
        med.lifecycleStatus,
        med.courseType,
        med.courseStartAt,
        med.maxDurationDays ?? null,
        med.maxTotalDoses ?? null,
        med.dosesTakenCount,
        med.trackStock ? 1 : 0,
        med.currentStock,
        med.lowStockThreshold,
        now,
        med.id,
      ]
    );
  }

  async updateLifecycle(id: string, lifecycle: LifecycleStatus): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE medications SET lifecycle_status = ?, updated_at = ? WHERE id = ?;`,
      [lifecycle, now, id]
    );
  }

  async recordDoseTaken(
    medicationId: string,
    doseQuantity: number
  ): Promise<{ newStock: number; dosesTakenCount: number }> {
    const med = await this.getById(medicationId);
    if (!med) {
      throw new Error(`Medication not found: ${medicationId}`);
    }

    const newCount = med.dosesTakenCount + 1;
    let newStock = med.currentStock;
    if (med.trackStock) {
      newStock = Math.max(0, med.currentStock - doseQuantity);
    }

    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE medications SET
        doses_taken_count = ?, current_stock = ?, updated_at = ?
       WHERE id = ?;`,
      [newCount, newStock, now, medicationId]
    );

    return { newStock, dosesTakenCount: newCount };
  }

  async delete(id: string): Promise<void> {
    await this.db.run(`DELETE FROM medications WHERE id = ?;`, [id]);
  }
}
