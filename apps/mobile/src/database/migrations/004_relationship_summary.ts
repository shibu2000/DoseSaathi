import type { Migration } from './001_initial_schema';

export const relationshipSummaryMigration: Migration = {
  version: 4,
  name: '004_relationship_summary',
  sql: `
    -- Full server-issued relationship summary for offline display. Never used as authorization.
    ALTER TABLE relationship_cache ADD COLUMN summary_json TEXT;
  `,
};
