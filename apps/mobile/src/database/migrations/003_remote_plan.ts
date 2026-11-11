import type { Migration } from './001_initial_schema';

export const remotePlanMigration: Migration = {
  version: 3,
  name: '003_remote_plan',
  sql: `
    -- Which medicines were authored by a caregiver, and by which relationship/plan version.
    CREATE TABLE IF NOT EXISTS remote_medications (
      medication_id TEXT PRIMARY KEY REFERENCES medications(id) ON DELETE CASCADE,
      relationship_id TEXT NOT NULL,
      plan_version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Remote commands already applied or rejected: a repeated push/fetch never applies twice.
    CREATE TABLE IF NOT EXISTS applied_commands (
      command_id TEXT PRIMARY KEY,
      relationship_id TEXT NOT NULL,
      plan_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      reason_code TEXT,
      applied_at TEXT NOT NULL
    );
  `,
};
