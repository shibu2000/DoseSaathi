-- MedChain D1 migration 0002: production schema.
-- Replaces the prototype tables from 0001 (which held no production data; all prototype state was in memory).
-- Children are dropped before parents.
DROP TABLE IF EXISTS dose_events;
DROP TABLE IF EXISTS sync_commands;
DROP TABLE IF EXISTS relationships;
DROP TABLE IF EXISTS connection_requests;
DROP TABLE IF EXISTS pairing_sessions;
DROP TABLE IF EXISTS patient_devices;
DROP TABLE IF EXISTS caregiver_users;

CREATE TABLE caregiver_users (
  id TEXT PRIMARY KEY,
  auth_provider TEXT NOT NULL,
  auth_subject TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  disabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (auth_provider, auth_subject)
);

-- Used by the local-password identity provider only.
CREATE TABLE caregiver_credentials (
  caregiver_user_id TEXT PRIMARY KEY REFERENCES caregiver_users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'PBKDF2-SHA256',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  caregiver_user_id TEXT NOT NULL REFERENCES caregiver_users(id) ON DELETE CASCADE,
  family_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  rotated_at TEXT,
  revoked_at TEXT
);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(caregiver_user_id);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE TABLE patient_devices (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  display_name TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  push_token TEXT,
  app_version TEXT NOT NULL,
  plan_version INTEGER NOT NULL DEFAULT 0,
  last_applied_version INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL,
  last_synced_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE pairing_sessions (
  id TEXT PRIMARY KEY,
  patient_device_id TEXT NOT NULL REFERENCES patient_devices(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONSUMED', 'EXPIRED', 'REVOKED')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
-- Only one live session may own a given code hash at a time.
CREATE UNIQUE INDEX uq_pairing_pending_code ON pairing_sessions(code_hash) WHERE status = 'PENDING';
CREATE INDEX idx_pairing_sessions_device ON pairing_sessions(patient_device_id, status);

CREATE TABLE connection_requests (
  id TEXT PRIMARY KEY,
  pairing_session_id TEXT NOT NULL UNIQUE REFERENCES pairing_sessions(id) ON DELETE CASCADE,
  caregiver_user_id TEXT NOT NULL REFERENCES caregiver_users(id) ON DELETE CASCADE,
  requested_permissions_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED', 'EXPIRED')),
  relationship_id TEXT,
  requested_at TEXT NOT NULL,
  responded_at TEXT
);
CREATE INDEX idx_connection_requests_caregiver ON connection_requests(caregiver_user_id);

CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  connection_request_id TEXT NOT NULL UNIQUE REFERENCES connection_requests(id),
  patient_device_id TEXT NOT NULL REFERENCES patient_devices(id) ON DELETE CASCADE,
  caregiver_user_id TEXT NOT NULL REFERENCES caregiver_users(id) ON DELETE CASCADE,
  relationship_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED_BY_PATIENT', 'DISCONNECTED_BY_CAREGIVER')),
  permissions_json TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  revoked_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_relationships_active_pair ON relationships(patient_device_id, caregiver_user_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_relationships_caregiver ON relationships(caregiver_user_id, status);
CREATE INDEX idx_relationships_device ON relationships(patient_device_id, status);

CREATE TABLE plan_snapshots (
  id TEXT PRIMARY KEY,
  patient_device_id TEXT NOT NULL REFERENCES patient_devices(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('CAREGIVER', 'DEVICE')),
  authored_by_relationship_id TEXT REFERENCES relationships(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  rejected_at TEXT,
  UNIQUE (patient_device_id, version)
);

CREATE TABLE sync_commands (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  patient_device_id TEXT NOT NULL REFERENCES patient_devices(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  plan_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING_DEVICE', 'RECEIVED', 'APPLIED', 'REJECTED', 'SUPERSEDED')),
  created_at TEXT NOT NULL,
  received_at TEXT,
  applied_at TEXT,
  applied_version INTEGER,
  error_code TEXT,
  UNIQUE (relationship_id, idempotency_key)
);
CREATE INDEX idx_sync_commands_device ON sync_commands(patient_device_id, status, seq);
CREATE INDEX idx_sync_commands_rel ON sync_commands(relationship_id, created_at);

CREATE TABLE dose_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  patient_device_id TEXT NOT NULL REFERENCES patient_devices(id) ON DELETE CASCADE,
  medication_id TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('DOSE_TAKEN', 'DOSE_SKIPPED', 'DOSE_SNOOZED', 'DOSE_NOT_CONFIRMED', 'COURSE_TRANSITION_COMPLETED', 'COURSE_TRANSITION_UNDONE')),
  scheduled_at TEXT NOT NULL,
  action_timestamp TEXT NOT NULL,
  timezone_id TEXT NOT NULL,
  medication_name TEXT,
  dosage_text TEXT,
  received_at TEXT NOT NULL,
  UNIQUE (patient_device_id, event_id)
);
CREATE INDEX idx_dose_events_timeline ON dose_events(patient_device_id, action_timestamp DESC, seq DESC);
CREATE INDEX idx_dose_events_medication ON dose_events(patient_device_id, medication_id);

CREATE TABLE device_sync_cursors (
  device_id TEXT PRIMARY KEY REFERENCES patient_devices(id) ON DELETE CASCADE,
  commands_cursor INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE server_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  patient_device_id TEXT NOT NULL REFERENCES patient_devices(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'SKIPPED', 'DEAD')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  locked_until TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX idx_server_outbox_due ON server_outbox(status, next_attempt_at);
