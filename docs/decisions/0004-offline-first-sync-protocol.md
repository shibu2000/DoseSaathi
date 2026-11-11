# ADR 0004: Offline-First Synchronization & Command Acknowledgement Protocol

**Status:** Approved  
**Date:** 8 November 2026  

### Context
In MedChain, patients may take medications in zero-connectivity environments (offline, airplane mode, basement, outdoors). Caregivers may simultaneously author medication changes remotely. We must prevent split-brain conflicts, duplicate inventory decrements, and false representations of plan application.

### Decision
1. **Local-First Writes**:
   - Patient dose actions (`TAKEN`, `SKIPPED`, `SNOOZED`) commit immediately to local SQLite.
   - An outbox record is inserted in `sync_outbox` in the exact same transaction with an immutable `event_id` (UUIDv4).
2. **Idempotent Batch Upload**:
   - The sync worker uploads pending outbox records to `POST /api/v1/sync/dose-events`.
   - The server deduplicates based on `event_id`. Duplicate attempts succeed without side-effects.
3. **Caregiver Command Lifecycle**:
   - Caregiver plan edits are submitted as `POST /api/v1/relationships/:id/plan-commands` with a `baseVersion`.
   - The server stores the command with status `PENDING_DEVICE`.
   - FCM sends an opaque wake-up push (`{ type: "PLAN_UPDATE_AVAILABLE" }`).
   - Patient device fetches `GET /api/v1/devices/current/changes`, validates the plan schema, applies it to SQLite, reconciles native alarms, and posts `POST /api/v1/devices/current/acks` with status `APPLIED`.
   - Only after this acknowledgement does the caregiver UI transition from "Waiting for phone to connect" to "Applied".
