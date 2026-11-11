-- Cloudflare D1 Initial Migration for MedChain

CREATE TABLE IF NOT EXISTS caregiver_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patient_devices (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  push_token TEXT,
  app_version TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pairing_sessions (
  id TEXT PRIMARY KEY,
  patient_device_id TEXT NOT NULL REFERENCES patient_devices(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connection_requests (
  id TEXT PRIMARY KEY,
  pairing_session_id TEXT NOT NULL REFERENCES pairing_sessions(id) ON DELETE CASCADE,
  caregiver_user_id TEXT NOT NULL REFERENCES caregiver_users(id) ON DELETE CASCADE,
  requested_permissions_json TEXT NOT NULL,
  status TEXT NOT NULL,
  responded_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  patient_device_id TEXT NOT NULL REFERENCES patient_devices(id) ON DELETE CASCADE,
  caregiver_user_id TEXT NOT NULL REFERENCES caregiver_users(id) ON DELETE CASCADE,
  relationship_label TEXT NOT NULL,
  status TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  revoked_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sync_commands (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  plan_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  received_at TEXT,
  applied_at TEXT,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS dose_events (
  event_id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  medication_id TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  action_timestamp TEXT NOT NULL,
  timezone_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relationships_caregiver ON relationships(caregiver_user_id);
CREATE INDEX IF NOT EXISTS idx_relationships_device ON relationships(patient_device_id);
CREATE INDEX IF NOT EXISTS idx_sync_commands_rel ON sync_commands(relationship_id);
CREATE INDEX IF NOT EXISTS idx_dose_events_rel ON dose_events(relationship_id, action_timestamp DESC);
