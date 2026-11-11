import type { Migration } from './001_initial_schema';

/** Indexes for the queries that run on every app open, dose action and alarm reconciliation. */
export const indexesMigration: Migration = {
  version: 5,
  name: '005_indexes',
  sql: `
    CREATE INDEX IF NOT EXISTS idx_occ_local_date ON dose_occurrences(scheduled_local_date, scheduled_local_time);
    CREATE INDEX IF NOT EXISTS idx_occ_state_time ON dose_occurrences(state, scheduled_at_utc);
    CREATE INDEX IF NOT EXISTS idx_logs_med_time ON dose_logs(med_id, action_timestamp);
    CREATE INDEX IF NOT EXISTS idx_deps_parent ON medication_dependencies(parent_medication_id, dependency_type);
    CREATE INDEX IF NOT EXISTS idx_deps_child ON medication_dependencies(child_medication_id, dependency_type);
    CREATE INDEX IF NOT EXISTS idx_meds_lifecycle ON medications(lifecycle_status);
  `,
};
