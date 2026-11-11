import type { Migration } from './001_initial_schema';

export const wizardDraftsMigration: Migration = {
  version: 2,
  name: '002_wizard_drafts',
  sql: `
    CREATE TABLE IF NOT EXISTS wizard_drafts (
      id TEXT PRIMARY KEY,
      draft_json TEXT NOT NULL,
      current_step INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `,
};
