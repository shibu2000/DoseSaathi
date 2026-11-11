export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const initialSchemaMigration: Migration = {
  version: 1,
  name: '001_initial_schema',
  sql: `
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      profile_type TEXT NOT NULL,
      timezone_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS medications (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      dosage_text TEXT NOT NULL,
      dose_quantity REAL NOT NULL DEFAULT 1.0,
      dose_unit TEXT NOT NULL DEFAULT 'tablet',
      instructions TEXT,
      lifecycle_status TEXT NOT NULL,
      course_type TEXT NOT NULL,
      course_start_at TEXT NOT NULL,
      max_duration_days INTEGER,
      max_total_doses INTEGER,
      doses_taken_count INTEGER NOT NULL DEFAULT 0,
      track_stock INTEGER NOT NULL DEFAULT 0,
      current_stock REAL DEFAULT 0,
      low_stock_threshold REAL DEFAULT 5,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS medication_schedules (
      id TEXT PRIMARY KEY,
      medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
      schedule_type TEXT NOT NULL,
      recurrence_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      timezone_id TEXT NOT NULL,
      interval_hours INTEGER,
      interval_first_time TEXT,
      cycle_days_on INTEGER,
      cycle_days_off INTEGER,
      cycle_anchor_date TEXT,
      active_weekdays_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedule_times (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL REFERENCES medication_schedules(id) ON DELETE CASCADE,
      local_time TEXT NOT NULL,
      ordinal INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS medication_dependencies (
      id TEXT PRIMARY KEY,
      parent_medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
      child_medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
      dependency_type TEXT NOT NULL,
      delay_minutes INTEGER DEFAULT 0,
      phase_delay_hours INTEGER DEFAULT 0,
      fallback_policy TEXT,
      fallback_time TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dose_occurrences (
      id TEXT PRIMARY KEY,
      medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
      scheduled_at_utc TEXT NOT NULL,
      scheduled_local_date TEXT NOT NULL,
      scheduled_local_time TEXT NOT NULL,
      timezone_id TEXT NOT NULL,
      state TEXT NOT NULL,
      snoozed_until TEXT,
      handled_at TEXT,
      source_alarm_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dose_logs (
      id TEXT PRIMARY KEY,
      med_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
      dose_occurrence_id TEXT REFERENCES dose_occurrences(id) ON DELETE SET NULL,
      scheduled_at TEXT NOT NULL,
      action_taken TEXT NOT NULL,
      action_timestamp TEXT NOT NULL,
      synced_to_cloud INTEGER NOT NULL DEFAULT 0,
      event_id TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS course_transition_events (
      id TEXT PRIMARY KEY,
      source_course_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
      activated_medication_ids_json TEXT NOT NULL,
      prior_states_json TEXT NOT NULL,
      transition_timestamp TEXT NOT NULL,
      undo_until TEXT NOT NULL,
      undone_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS device_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS relationship_cache (
      relationship_id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      caregiver_id TEXT NOT NULL,
      permissions_json TEXT NOT NULL,
      status TEXT NOT NULL,
      last_synced_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_meds_profile ON medications(profile_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_med ON medication_schedules(medication_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_med_date ON dose_occurrences(medication_id, scheduled_local_date);
    CREATE INDEX IF NOT EXISTS idx_occurrences_state ON dose_occurrences(state);
    CREATE INDEX IF NOT EXISTS idx_dose_logs_event_id ON dose_logs(event_id);
    CREATE INDEX IF NOT EXISTS idx_outbox_retry ON sync_outbox(synced_at, next_retry_at);
  `,
};

import { wizardDraftsMigration } from './002_wizard_drafts';
import { remotePlanMigration } from './003_remote_plan';
import { relationshipSummaryMigration } from './004_relationship_summary';
import { indexesMigration } from './005_indexes';

export const allMigrations: Migration[] = [initialSchemaMigration, wizardDraftsMigration, remotePlanMigration, relationshipSummaryMigration, indexesMigration];
