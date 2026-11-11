import type { DatabaseConnection } from '../types';

export class DeviceSettingsRepository {
  constructor(private db: DatabaseConnection) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db.get<{ value: string }>(
      `SELECT value FROM device_settings WHERE key = ?;`,
      [key]
    );
    return row ? row.value : null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.run(
      `INSERT INTO device_settings (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      [key, value]
    );
  }

  async getBoolean(key: string, defaultValue = false): Promise<boolean> {
    const val = await this.get(key);
    if (val === null) return defaultValue;
    return val === 'true' || val === '1';
  }

  async setBoolean(key: string, value: boolean): Promise<void> {
    await this.set(key, value ? 'true' : 'false');
  }

  async delete(key: string): Promise<void> {
    await this.db.run(`DELETE FROM device_settings WHERE key = ?;`, [key]);
  }
}
