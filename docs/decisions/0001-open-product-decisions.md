# ADR 0001: Resolution of the 18 Core Product & Architecture Decisions

**Status:** Approved  
**Date:** 8 November 2026  
**Deciders:** Antigravity Engineering & Product Architecture  

---

### Context
Section 12 of the MedChain Blueprint (`requirements.md`) identifies 18 open product decisions that must be settled before or during Phase 0 implementation. Below is the approved decision record for each item.

---

### Decision 1: Authentication Provider & Device Identity
- **Personal Mode:** Standalone, zero registration, zero network calls. Identity is a local UUID stored in SQLite `profiles`.
- **Remote Sharing Patient Device:** Generates an opaque random UUID (`patient_devices.id`) on initial pairing request. No email or password required for the patient.
- **Caregiver Mode:** Authenticated via standard JWT bearer tokens (OIDC-compliant auth adapter). Client sends `Authorization: Bearer <token>`; server extracts `caregiver_user_id` directly from the validated token.

### Decision 2: Permission Matrix
Permissions are explicit string flags stored in `relationships.permissions_json`:
- `VIEW_SCHEDULE`: Read-only access to active medications and recurrence rules.
- `MANAGE_SCHEDULE`: Authority to author new medications, edit schedules, and submit versioned plan commands.
- `VIEW_DOSE_LOGS`: Authority to view adherence logs and confirmed Taken/Skipped events.
- `RECEIVE_NOTIFICATIONS`: Authority to receive caregiver alerts (e.g. unconfirmed dose after 30 minutes).

### Decision 3: Consent Changes & Medication Edits
- Caregiver plan edits generate a staged `sync_commands` record with a new version number.
- The patient device downloads the pending command, verifies schema integrity, applies it to local SQLite, and sends back an explicit acknowledgement (`APPLIED` or `REJECTED`).
- If permission `MANAGE_SCHEDULE` has been revoked by the patient, the patient device unconditionally rejects the command.

### Decision 4: Pairing Expiration and Retries
- **Pairing Code:** 6-digit numeric PIN with cryptographic randomness.
- **QR Code:** URL payload containing session UUID and HMAC-SHA256 secret.
- **Expiry:** 10 minutes from creation.
- **Brute-force limit:** 3 failed validation attempts invalidates the session permanently.
- **Invalidation:** Tapping "Regenerate" immediately invalidates the previous code and issues a new session.

### Decision 5: "Missed" vs "Not Confirmed"
- When a scheduled dose passes without a confirmation, the system does **not** assert that the patient missed it (they may have taken it without opening their phone, or the phone may be offline).
- For the first 30 minutes past reminder time, the status remains `DUE` / `WAITING_FOR_CONFIRMATION`.
- After the 30-minute escalation threshold, the status displayed to the caregiver is strictly: **"This dose hasn't been confirmed"**.
- Only an explicit tap on "Skip" logs a `SKIPPED` state.

### Decision 6: Time Zone and Clock Changes
- Medication schedules are tied to wall-clock time (e.g. 08:00) in the patient's local timezone.
- The local database stores the IANA timezone ID (e.g. `America/New_York`) alongside the local time string (`08:00`).
- System broadcasts (`TIMEZONE_CHANGED`, `TIME_SET`) trigger an immediate scheduler reconciliation to adjust absolute UTC trigger timestamps while keeping the 08:00 wall-clock schedule intact.

### Decision 7: Fixed-Calendar-Day Completion
- A course with `FIXED_DAYS` (e.g. 7 days) completes at 23:59:59 of day `N` relative to its `course_start_at` date in the local timezone, regardless of how many individual doses were taken or skipped.
- If the device is off at the boundary, reboot reconciliation executes the course completion transition immediately upon the next boot.

### Decision 8: Fixed-Dose Completion
- A course with `FIXED_DOSES` (e.g. 10 doses) completes strictly upon the 10th confirmed `TAKEN` action.
- Skipped, snoozed, or unconfirmed doses do not increment `doses_taken_count`.

### Decision 9: Same-Day Skip Fallback
- When a parent dose is skipped, the user is presented two clear options:
  1. "Skip follow-up dose as well"
  2. "Use prescribed fallback time" (configured during schedule creation in Step 2).
- The application will never invent or clinically recommend a fallback time.

### Decision 10: Course Transition Undo
- Course completion initiates a 5-minute atomic Undo window (`undo_until = transition_timestamp + 5 minutes`).
- If Undo is tapped:
  - Parent course is restored to `ACTIVE`.
  - Activated child courses are restored to `QUEUED_PHASE`.
  - Child alarms are cancelled and parent alarms are restored.
  - If a course completion event was already synced to the cloud, an outbox compensating event `COURSE_TRANSITION_UNDONE` is dispatched.

### Decision 11: Inventory Projection
- Supply projection calculates actual consumption based on the recurrence rules:
  - Fixed-time: counts daily doses.
  - Cyclical ON/OFF: simulates forward calendar days within the next 30 days to account for OFF periods.
  - Interval: calculates `24 / interval_hours * dose_quantity`.
- Low-stock threshold is triggered when projected days of supply remaining is <= 5 days.

### Decision 12: Caregiver Schedule Tab
- The Caregiver "Schedule" bottom tab navigates directly to the currently selected patient's Today / Schedule screen (`/caregiver/patient/[relationshipId]/today`).
- If no patient relationship is currently active, it redirects to the Family Hub to select a family member.

### Decision 13: iOS Alarm Support
- iOS 26+ uses native `AlarmKit` module for prominent alarms.
- iOS 17–25 uses `UNUserNotificationCenter` with custom notification categories (`TAKEN`, `SNOOZE`, `SKIP`) and sound.
- Clear disclosure in Settings explains that notification sounds require notification permissions.

### Decision 14: Android Full-Screen Intent Policy
- App checks `NotificationManagerCompat.canUseFullScreenIntent()` and `AlarmManager.canScheduleExactAlarms()` at runtime.
- If allowed: triggers full-screen activity when alarm fires.
- If disallowed: gracefully falls back to high-priority heads-up notification with action buttons.

### Decision 15: Local Database Encryption
- SQLite database encryption via SQLCipher (`PRAGMA key`).
- 256-bit encryption key generated per install via secure RNG and saved in `expo-secure-store` (backed by iOS Keychain / Android Keystore).
- `PRAGMA cipher_version` is verified before keying to ensure SQLCipher is active.

### Decision 16: Cloud History Retention
- Cloudflare D1 retains active relationship records, active plan snapshots, and the last 90 days of dose activity events for caregiver timeline review.
- Relationship revocation or account deletion permanently purges all linked remote events.

### Decision 17: Multiple Caregivers & Multiple Family Members
- Relationships are strictly many-to-many:
  - A patient device can have multiple linked caregivers, each with independent relationship records and approved permissions.
  - A caregiver can manage multiple patients, switched via the Family Hub.
  - Data scopes are partitioned by `relationship_id`.

### Decision 18: Prescription Photo / OCR
- Confirmed: Prescription photo capture and OCR extraction are explicitly **out of scope** for this release. All entries use the structured 4-step wizard.
