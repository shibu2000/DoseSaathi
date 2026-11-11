import type { DatabaseConnection } from '../types';

export interface ProfileRecord {
  id: string;
  displayName: string;
  profileType: 'PERSONAL' | 'CARE_RECIPIENT';
  timezoneId: string;
  createdAt: string;
  updatedAt: string;
}

export class ProfileRepository {
  constructor(private db: DatabaseConnection) {}

  async create(profile: ProfileRecord): Promise<void> {
    await this.db.run(
      `INSERT INTO profiles (id, display_name, profile_type, timezone_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [
        profile.id,
        profile.displayName,
        profile.profileType,
        profile.timezoneId,
        profile.createdAt,
        profile.updatedAt,
      ]
    );
  }

  async getById(id: string): Promise<ProfileRecord | null> {
    const row = await this.db.get<any>(
      `SELECT id, display_name as displayName, profile_type as profileType,
              timezone_id as timezoneId, created_at as createdAt, updated_at as updatedAt
       FROM profiles WHERE id = ?;`,
      [id]
    );
    return row ?? null;
  }

  async getPrimary(): Promise<ProfileRecord | null> {
    const row = await this.db.get<any>(
      `SELECT id, display_name as displayName, profile_type as profileType,
              timezone_id as timezoneId, created_at as createdAt, updated_at as updatedAt
       FROM profiles ORDER BY created_at ASC LIMIT 1;`
    );
    return row ?? null;
  }

  async update(profile: Partial<ProfileRecord> & { id: string }): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (profile.displayName !== undefined) {
      fields.push('display_name = ?');
      values.push(profile.displayName);
    }
    if (profile.timezoneId !== undefined) {
      fields.push('timezone_id = ?');
      values.push(profile.timezoneId);
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(profile.id);

    await this.db.run(
      `UPDATE profiles SET ${fields.join(', ')} WHERE id = ?;`,
      values
    );
  }
}
