# MedChain REST API Contract (`/api/v1`)

**Version:** 2.0.0 (production API; replaces the 1.0 prototype contract)
**Backend:** Hono on Cloudflare Workers + D1 (`apps/api`). DTO schemas live in `packages/contracts`.
**Auth decision:** see `docs/decisions/0005-auth-and-device-identity.md`.

Personal (standalone) mode never calls this API.

---

## 1. Conventions

### 1.1 Authentication schemes

| Scheme | Header | Used by |
|---|---|---|
| none | - | `/health`, `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, first `POST /devices/register` |
| Caregiver | `Authorization: Bearer <accessToken>` (JWT HS256, 30 min) | caregiver routes |
| Device | `Authorization: Device <deviceId>.<deviceSecret>` | patient-device routes |

The actor is always derived from the credential. Request bodies never carry `caregiverId`, `patientId`, `permissions` (except the patient's own approval/restriction), `confirmedAt` or `relationshipId`; such fields are ignored.
The old `X-Device-Id` header and `Bearer cg_xxx` tokens are no longer accepted.

### 1.2 Error envelope (all non-2xx)

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed.", "requestId": "uuid",
             "fieldErrors": [ { "field": "body.email", "message": "Invalid email" } ] } }
```
`fieldErrors` is present only for `VALIDATION_ERROR`. `X-Request-Id` response header equals `requestId`. Stack traces, SQL and secrets are never returned.

| HTTP | code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_JSON` | bad body/query/params |
| 401 | `UNAUTHENTICATED` | missing/invalid/expired token or device credential (refresh when `Bearer`) |
| 401 | `INVALID_CREDENTIALS` | wrong email/password |
| 403 | `PERMISSION_DENIED` | relationship active but permission not granted |
| 403 | `RELATIONSHIP_INACTIVE` | caller is a participant but the relationship is revoked/disconnected |
| 404 | `NOT_FOUND` | unknown id OR caller is not a participant (indistinguishable by design) |
| 404 | `PAIRING_CODE_INVALID` | code/QR invalid, expired, consumed or regenerated (deliberately one code) |
| 409 | `EMAIL_TAKEN`, `ALREADY_CONNECTED`, `REQUEST_NOT_PENDING`, `PLAN_VERSION_CONFLICT` (`currentVersion` in message), `IDEMPOTENCY_KEY_REUSED`, `PLAN_STALE` | state conflicts |
| 410 | `PAIRING_EXPIRED` | approve/decline after session expiry |
| 413 | `PAYLOAD_TOO_LARGE` | body > 64 KB, or plan snapshot > 16 KB |
| 422 | `DISPLAY_NAME_REQUIRED` | device must have a display name before creating a pairing session |
| 429 | `RATE_LIMITED` | see 1.4; `Retry-After` header (seconds) |
| 500/503 | `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE` | |

### 1.3 Permissions

Keys: `VIEW_SCHEDULE`, `EDIT_SCHEDULE` (requires `VIEW_SCHEDULE`), `VIEW_DOSE_LOGS`, `RECEIVE_ALERTS`. (The old `MANAGE_SCHEDULE` / `RECEIVE_NOTIFICATIONS` names are removed; use `PermissionKeySchema` from contracts.)
Relationship `status`: `ACTIVE`, `REVOKED_BY_PATIENT`, `DISCONNECTED_BY_CAREGIVER`. A non-ACTIVE relationship returns `403 RELATIONSHIP_INACTIVE` (participant) or `404` (non-participant) for every read/write, immediately.

### 1.4 Rate limits (D1 fixed windows; 429 + `Retry-After`)

| Bucket | Limit |
|---|---|
| `POST /auth/register` | 10 / hour / IP |
| `POST /auth/login` | 10 failed / 15 min / (email) and 30 / 15 min / IP |
| `POST /auth/refresh` | 60 / 15 min / IP |
| `POST /devices/register` (new) | 20 / hour / IP |
| `POST /pairing/validate`, `POST /pairing/requests`, `POST /pairing/sessions/:id/requests` | 10 attempts / 10 min / caregiver, 30 / 10 min / IP; 5 failed codes / 15 min / caregiver (lockout) |
| caregiver request creation | 10 / hour / caregiver |
| `POST /pairing/sessions`, `.../regenerate` | 5 / 10 min / device |

### 1.5 Other

- All timestamps are ISO-8601 UTC strings (`2026-11-09T10:00:00.000Z`).
- JSON bodies only, max 64 KB. Request header `X-Request-Id` is echoed if supplied (<=64 chars), else generated.
- Pairing code lifetime: **10 minutes** (server returns `expiresAt`; clients must display that, not a local timer).
- Security headers (`nosniff`, `no-store`, `DENY` framing, HSTS) on every response. CORS only for origins listed in `ALLOWED_ORIGINS`; the native app needs none.

---

## 2. Route table

| # | Method | Path | Auth | Purpose |
|---|---|---|---|---|
| 1 | GET | `/health` | none | liveness + db check |
| 2 | POST | `/auth/register` | none | create caregiver account |
| 3 | POST | `/auth/login` | none | email/password login |
| 4 | POST | `/auth/refresh` | none (refresh token in body) | rotate refresh token |
| 5 | POST | `/auth/logout` | none (refresh token in body) | revoke refresh-token family |
| 6 | GET | `/auth/me` | Caregiver | current caregiver |
| 7 | POST | `/devices/register` | none, or Device | register patient device / refresh push token |
| 8 | GET | `/devices/current` | Device | device profile |
| 9 | PATCH | `/devices/current` | Device | update displayName/pushToken/appVersion |
| 10 | DELETE | `/devices/current` | Device | unregister (revokes all relationships) |
| 11 | PUT | `/devices/current/plan` | Device | upload device plan report (`DevicePlanReport`) |
| 12 | GET | `/devices/current/changes?cursor=` | Device | pending plan commands (marks RECEIVED) |
| 13 | POST | `/devices/current/acks` | Device | ack RECEIVED/APPLIED/REJECTED |
| 14 | POST | `/pairing/sessions` | Device | create code/QR session |
| 15 | GET | `/pairing/sessions/:sessionId` | Device (own) | session status + incoming request |
| 16 | POST | `/pairing/sessions/:sessionId/regenerate` | Device (own) | invalidate and replace |
| 17 | POST | `/pairing/validate` | Caregiver | check a code/QR without consuming |
| 18 | POST | `/pairing/requests` | Caregiver | submit request by `{code}` or `{sessionId,secret}` |
| 19 | POST | `/pairing/sessions/:sessionId/requests` | Caregiver | same, session id in path |
| 20 | GET | `/pairing/requests/:requestId/status` | Caregiver (own) | poll |
| 21 | DELETE | `/pairing/requests/:requestId` | Caregiver (own) | cancel pending request |
| 22 | POST | `/pairing/requests/:requestId/approve` | Device (own) | approve exact scope |
| 23 | POST | `/pairing/requests/:requestId/decline` | Device (own) | decline |
| 24 | GET | `/relationships` | Caregiver | active relationships + device status |
| 25 | GET | `/relationships/:id` | Caregiver | one relationship |
| 26 | DELETE | `/relationships/:id` | Caregiver | disconnect (idempotent) |
| 27 | GET | `/patient/relationships` | Device | caregivers linked to this device |
| 28 | POST | `/patient/relationships/:id/revoke` | Device | revoke (idempotent) |
| 29 | PATCH | `/patient/relationships/:id` | Device | restrict permissions (subset only) |
| 30 | GET | `/relationships/:id/medications` | Caregiver + VIEW_SCHEDULE | latest plan snapshot |
| 31 | POST | `/relationships/:id/medications` | Caregiver + EDIT_SCHEDULE | add medication (creates command) |
| 32 | GET | `/relationships/:id/medications/:medicationId` | Caregiver + VIEW_SCHEDULE | one medication + schedules |
| 33 | PATCH | `/relationships/:id/medications/:medicationId` | Caregiver + EDIT_SCHEDULE | update (creates command) |
| 34 | DELETE | `/relationships/:id/medications/:medicationId?baseVersion=` | Caregiver + EDIT_SCHEDULE | remove (creates command) |
| 35 | POST | `/relationships/:id/plan-commands` | Caregiver + EDIT_SCHEDULE | submit full plan command |
| 36 | GET | `/relationships/:id/plan-commands/:commandId` | Caregiver + VIEW_SCHEDULE | command state |
| 37 | POST | `/sync/dose-events` | Device | idempotent batch upload |
| 38 | GET | `/relationships/:id/activity?limit=&cursor=` | Caregiver + VIEW_DOSE_LOGS | newest-first feed |

(Paths are relative to `/api/v1`. `/health` is also served at the root `/health`.)

---

## 3. Endpoint details

### 3.1 Health
`GET /health` -> `200 {status:"ok", version:"2.0.0", timestamp, checks:{db:"ok"}}`; `503 {status:"degraded", checks:{db:"error"}}`.

### 3.2 Caregiver auth

`POST /auth/register` body `{email, password (10-128 chars), displayName (1-80)}` -> `201`
`POST /auth/login` body `{email, password}` -> `200`
Both return:
```json
{ "caregiver": {"id":"uuid","email":"a@b.c","displayName":"Ann"},
  "accessToken":"<jwt>", "accessTokenExpiresAt":"...", "refreshToken":"<opaque>", "refreshTokenExpiresAt":"..." }
```
`POST /auth/refresh` body `{refreshToken}` -> `200` same shape with a NEW refresh token (the old one is now invalid; re-presenting a used one revokes the whole family and returns 401). `POST /auth/logout` body `{refreshToken}` -> `200 {ok:true}` (idempotent). `GET /auth/me` -> `200 {caregiver:{id,email,displayName}}`.
Store both tokens in SecureStore; refresh when a call returns `401 UNAUTHENTICATED`.

### 3.3 Device identity

`POST /devices/register` body `{platform:"android"|"ios", appVersion, pushToken?, displayName? (1-80)}`
- Without Device auth -> `201 {deviceId, deviceSecret, registeredAt}`. **`deviceSecret` is shown once; store in SecureStore.**
- With a valid `Authorization: Device ...` -> `200 {deviceId, registeredAt, updated:true}`; only pushToken/appVersion/displayName change; no new identity, no new secret. An invalid Device header -> 401 (never creates a new device).

`GET /devices/current` -> `{deviceId, displayName|null, platform, appVersion, hasPushToken, lastSeenAt, lastSyncedAt, planVersion, lastAppliedVersion}`
`PATCH /devices/current` body any of `{displayName, pushToken (null clears), appVersion}` -> same as GET.
`DELETE /devices/current` -> `200 {ok:true}`; revokes all relationships (`REVOKED_BY_PATIENT`), invalidates the credential.

`PUT /devices/current/plan` body `{baseVersion, report}` where `report` is a `DevicePlanReport` (`{schemaVersion:2, medications: PlanMedication[], status: DeviceMedicationStatus[]}`): the device publishes its authoritative local prescription plus per-medicine progress so caregivers can read it. `baseVersion` is the device's last known server plan version (0 on first upload). If it equals the server's `planVersion` AND no commands are pending -> `200 {planVersion, lastAppliedVersion}` (a new version, marked applied). Otherwise `409 PLAN_STALE` (fetch `/changes` and ack first). Report > 16 KB -> 413.

### 3.4 Pairing

`POST /pairing/sessions` (Device; requires device displayName else 422) ->
`201 {sessionId, pairingCode:"123456", qrPayload:"medchain://pair?session=<sessionId>&secret=<secret>", expiresAt, expiresInSeconds:600}`.
Any earlier pending session of this device is invalidated.
`POST /pairing/sessions/:sessionId/regenerate` -> `201` same shape with a NEW `sessionId`; the old code/QR is dead and any request pending on it becomes `CANCELLED`.
`GET /pairing/sessions/:sessionId` -> 
```json
{ "sessionId":"", "status":"PENDING|CONSUMED|EXPIRED|REVOKED", "expiresAt":"",
  "incomingRequest": null | { "requestId":"", "status":"PENDING|APPROVED|DECLINED|CANCELLED|EXPIRED",
     "caregiverDisplayName":"real name from caregivers table", "caregiverEmail":"",
     "requestedPermissions":["VIEW_SCHEDULE"], "requestedAt":"", "relationshipId": null | "uuid" } }
```
Pairing codes are not retrievable after creation.

`POST /pairing/validate` (Caregiver) body `{code}` or `{sessionId, secret}` -> `200 {valid:true, sessionId, patientDisplayName, expiresAt}`; failure `404 PAIRING_CODE_INVALID`. Does not consume.
`POST /pairing/requests` (Caregiver) body `{code}` or `{sessionId, secret}`, plus `requestedPermissions:[...]` (>=1, EDIT implies VIEW) -> `201 {requestId, sessionId, status:"PENDING", expiresAt, patientDisplayName}`. Consumes the session (single use). 409 `ALREADY_CONNECTED` if this caregiver already has an ACTIVE relationship with the device. `POST /pairing/sessions/:sessionId/requests` is the same with the session id in the path (body `{code}` or `{secret}`).
`GET /pairing/requests/:requestId/status` (Caregiver; only own requests, else 404) ->
`{requestId, status:"PENDING|APPROVED|DECLINED|CANCELLED|EXPIRED", expiresAt, respondedAt|null, relationshipId|null, relationship: null | RelationshipSummary}`. Poll every 2-3 s with backoff; after APPROVED use `relationship` (verified server values).
`DELETE /pairing/requests/:requestId` -> `200 {status:"CANCELLED"}` (only while PENDING).

`POST /pairing/requests/:requestId/approve` (Device owning the session) body `{approvedPermissions:[...], relationshipLabel (1-60)}`. `approvedPermissions` must be a non-empty subset of what was requested. -> `200 {requestId, status:"APPROVED", relationshipId, permissions, confirmedAt}`. Replay returns the same relationship (`200`), never a second one.
`POST /pairing/requests/:requestId/decline` -> `200 {requestId, status:"DECLINED"}`; creates nothing. Replay is idempotent. Approve after decline (or vice versa) -> `409 REQUEST_NOT_PENDING`. After session expiry -> `410 PAIRING_EXPIRED`.

### 3.5 Relationships

`RelationshipSummary` (caregiver view):
```json
{ "relationshipId":"uuid","patientDisplayName":"Eleanor","relationshipLabel":"Daughter",
  "permissions":["VIEW_SCHEDULE"],"status":"ACTIVE","confirmedAt":"","revokedAt":null,"version":1,
  "deviceLastSeenAt":"..."|null,"lastSyncedAt":"..."|null,"latestPlanVersion":3,"lastAppliedVersion":2 }
```
`GET /relationships` -> `{items:[RelationshipSummary]}` (ACTIVE only). `GET /relationships/:id` -> `{relationship: RelationshipSummary}` (403 `RELATIONSHIP_INACTIVE` if ended). `DELETE /relationships/:id` -> `200 {status:"DISCONNECTED_BY_CAREGIVER"}` (idempotent; if already revoked by patient returns that status). Disconnect never deletes the patient's local data; pending commands are closed.
`deviceLastSeenAt` = last authenticated call by the patient device; `lastSyncedAt` = last dose-event upload/ack/changes fetch. Show device "online/offline" from these.

Patient view `PatientRelationship`: `{relationshipId, caregiverDisplayName, caregiverEmail, relationshipLabel, permissions, status, confirmedAt, revokedAt, version}`.
`GET /patient/relationships` -> `{items:[PatientRelationship]}` (all statuses). `POST /patient/relationships/:id/revoke` -> `200 {status:"REVOKED_BY_PATIENT"}` (idempotent). `PATCH /patient/relationships/:id` body `{permissions:[...]}` (non-empty subset of current) -> `{relationship: PatientRelationship}`.

### 3.6 Plan and commands

Plan shapes come from `packages/contracts/src/plan-v2.ts`:
- `PlanSnapshotV2` (caregiver -> device command payload, prescription only): `{schemaVersion:2, medications: PlanMedication[], removedMedicationIds: uuid[]}`. Max 16 KB serialized (413 above).
- `DevicePlanReport` (device -> server): `{schemaVersion:2, medications: PlanMedication[], status:[{medicationId, lifecycleStatus, dosesTakenCount, currentStock?, courseStartAt?}]}`.
The legacy `PlanSnapshotSchema` (`{medications, schedules}`) is no longer accepted anywhere.

**Versioning.** There is ONE plan version line per patient device (shared by all its caregivers). `latestPlanVersion` = version of the newest non-rejected snapshot (caregiver command or device report); a caregiver must send `baseVersion = latestPlanVersion` as last read from `GET /medications` or `GET /relationships`. A rejected command's version number is skipped; `latestPlanVersion` falls back to the newest non-rejected snapshot.

`GET /relationships/:id/medications` ->
```json
{ "latestPlanVersion": 3, "lastAppliedVersion": 2, "isApplied": false,
  "planSnapshot": { "schemaVersion": 2, "medications": [ ... ], "removedMedicationIds": [] } | null,
  "deviceReport": null | { "version": 2, "reportedAt": "...", "schemaVersion": 2, "medications": [ ... ], "status": [ ... ] },
  "pendingCommand": null | { "commandId": "uuid", "status": "PENDING_DEVICE|RECEIVED" } }
```
`planSnapshot` is the latest non-rejected prescription (a pending caregiver edit is included; `isApplied` says whether the phone has it; if the latest version was a device report, `removedMedicationIds` is `[]`). `deviceReport` is the most recent device-uploaded report (may be older than `planSnapshot`), `null` until the device uploads one. `isApplied` = `lastAppliedVersion >= latestPlanVersion`.
`GET /relationships/:id/medications/:medicationId` -> `{latestPlanVersion, lastAppliedVersion, medication: PlanMedication, deviceStatus: DeviceMedicationStatus|null}`; 404 if absent.
`POST /relationships/:id/medications` body `{baseVersion, medication: PlanMedication}`; `PATCH .../:medicationId` body `{baseVersion, medication: Partial<PlanMedication> (no id)}` (shallow merge); `DELETE .../:medicationId?baseVersion=N` (adds the id to `removedMedicationIds`). Each builds a new full snapshot from the latest one and behaves exactly like a plan command (same `202` response, 409 conflicts, optional `Idempotency-Key`).

`POST /relationships/:id/plan-commands`
- Headers: `Idempotency-Key: <8-128 chars>` (or put a uuid `commandId` in the body; one of the two is required; if both, they must be equal).
- Body `{commandId?, baseVersion, planSnapshot: PlanSnapshotV2}`.
- `baseVersion` must equal the relationship's current `latestPlanVersion`, else `409 PLAN_VERSION_CONFLICT` (message contains the current version; re-fetch and rebase).
- `202 {commandId, status:"PENDING_DEVICE", planVersion, baseVersion, syncState:"WAITING_FOR_DEVICE", createdAt}`. `commandId` is server-generated. Replaying the same key returns the same command (`202`, same body) and creates nothing; the same key with a different body -> `409 IDEMPOTENCY_KEY_REUSED`.
- Older commands still `PENDING_DEVICE` become `SUPERSEDED`. An FCM wake-up `{type:"PLAN_VERSION", relationshipId, version}` is queued.

`GET /relationships/:id/plan-commands/:commandId` -> 
`{commandId, status:"PENDING_DEVICE|RECEIVED|APPLIED|REJECTED|SUPERSEDED", syncState:"WAITING_FOR_DEVICE|RECEIVED_BY_DEVICE|APPLIED|REJECTED|SUPERSEDED", planVersion, baseVersion, createdAt, receivedAt|null, appliedAt|null, appliedVersion|null, reasonCode|null}`. UIs must not equate `ACCEPTED_BY_SERVER`/`PENDING_DEVICE` with `APPLIED`.

State machine: `PENDING_DEVICE -> RECEIVED -> APPLIED | REJECTED`; `PENDING_DEVICE -> APPLIED|REJECTED` allowed; `PENDING_DEVICE -> SUPERSEDED`; relationship end closes open commands as `SUPERSEDED` (`reasonCode: RELATIONSHIP_ENDED`). Terminal states never change; replaying the same terminal ack is a no-op.

`GET /devices/current/changes?cursor=<n>` (Device) -> `{pendingCommands:[{commandId, relationshipId, planVersion, baseVersion, status:"RECEIVED", planSnapshot: PlanSnapshotV2, createdAt}], nextCursor:"<n>"}`. Returns commands in `PENDING_DEVICE` or `RECEIVED` (re-delivered until acked) with sequence > cursor (omit cursor to use the server-stored cursor), only for ACTIVE relationships. Fetching marks `PENDING_DEVICE` as `RECEIVED`.
`POST /devices/current/acks` body either one ack or `{acks:[...], cursor?}`; ack = `{commandId, status:"RECEIVED"|"APPLIED"|"REJECTED", appliedVersion?, reasonCode?}` (legacy `errorCode` accepted as `reasonCode`). -> `200 {success:true, results:[{commandId, status, outcome:"UPDATED|UNCHANGED|INVALID_TRANSITION|NOT_FOUND"}], cursor}`. `APPLIED` sets the device's `lastAppliedVersion` (default = command planVersion). `REJECTED` rolls the readable plan back to the last non-rejected version. Repeated acks/pushes never apply a command twice.

### 3.7 Dose events and activity

`POST /sync/dose-events` (Device) body `{events:[<=100 of {eventId (uuid), occurrenceId, medicationId, eventType, scheduledAt, actionTimestamp, timezoneId, medicationName?, dosageText?}]}`
`eventType`: `DOSE_TAKEN`, `DOSE_SKIPPED`, `DOSE_SNOOZED`, `DOSE_NOT_CONFIRMED`, `COURSE_TRANSITION_COMPLETED`, `COURSE_TRANSITION_UNDONE` (legacy `TAKEN/SKIPPED/SNOOZED/UNCONFIRMED` are accepted and normalised). `relationshipId`/`createdAt` in events are ignored. `scheduledAt` may be omitted for `COURSE_TRANSITION_*`. `medicationName`/`dosageText` are optional (<=120 chars) display hints stored for the caregiver feed.
-> `200 {accepted, duplicates, processedCount, failedEvents:[{index, eventId|null, code, message}]}`. Idempotent on `eventId`; per-event failures do not fail the batch. Original `scheduledAt`, `actionTimestamp` and `timezoneId` are preserved; `receivedAt` is server time.
`DOSE_NOT_CONFIRMED` is emitted by the patient device 30 min after an unacknowledged critical dose. Caregiver UI says "not confirmed", never "missed".

`GET /relationships/:id/activity?limit=50&cursor=` (limit 1-100) -> `{items:[{eventId, relationshipId, patientDisplayName, medicationId, medicationName|null, dosageText|null, occurrenceId, eventType, statusLabel, scheduledAt, actionTimestamp, timezoneId, receivedAt}], nextCursor|null}`, newest `actionTimestamp` first. Only events already stored server-side and with `actionTimestamp >= relationship.confirmedAt` are returned. `statusLabel` is caregiver-safe wording: Taken / Skipped / Snoozed / Not confirmed / Course completed / Course completion undone.

---

## 4. Push (FCM data-only, high priority)

Payloads contain only opaque identifiers, string-valued: `{type:"PLAN_VERSION", relationshipId, version}`, `{type:"PAIRING_REQUEST", sessionId}`, `{type:"RELATIONSHIP_CHANGED", relationshipId}`. Never medicine data, names, codes or tokens. On receipt the device must call `GET /devices/current/changes` (or the relevant GET); the push itself carries no authority. Delivery is best-effort (outbox + retry sweep); devices must also poll on app open.

## 5. Changes from the 1.0 prototype contract (mobile must adapt)

- Auth headers (section 1.1); caregiver registration/login; device `deviceSecret`.
- Permission keys renamed; EDIT requires VIEW.
- Caregiver submits `{code}` to `POST /pairing/requests` (the session id is unknown to caregivers); `/pairing/sessions/:id/requests` kept.
- Regenerate returns a new `sessionId`. `POST /pairing/sessions` needs a device `displayName`.
- Approve needs `approvedPermissions` subset and `relationshipLabel`. Patient never sends a caregiver id.
- Plan payloads are `PlanSnapshotV2` / `DevicePlanReport` (contracts `plan-v2.ts`); `GET /medications` returns `{latestPlanVersion, lastAppliedVersion, isApplied, planSnapshot, deviceReport, pendingCommand}`; send `baseVersion = latestPlanVersion`. PUT device plan body is `{baseVersion, report}`.
- Plan command responses return a server `commandId`; ack body gains `RECEIVED`, `reasonCode`; `GET /changes` marks RECEIVED.
- Dose event type names are `DOSE_*`; activity key is `items`; new `statusLabel`.
- `fieldErrors` replaces `details` in the error envelope.


## 6. Deletion and public pages (added 11 Nov 2026)

- `DELETE /auth/me` (Caregiver) body `{password}` -> `200 {ok:true, deleted:true}`. Wrong password -> `401 INVALID_CREDENTIALS`. Permanently deletes the account, credentials, refresh tokens, relationships and their commands (cascade). Existing access tokens stop working immediately. Rate limit 10 / 15 min / IP.
- `DELETE /devices/current?purge=true` (Device) -> `200 {ok:true, purged:true}`. Erases the device row and everything that cascades from it (relationships, plan versions, commands, dose events, cursor). Without `purge` the old behaviour (unregister, keep rows) applies.
- `GET /privacy`, `GET /delete-account` (no auth, at the server root, HTML). Text uses the `SUPPORT_EMAIL` and `OPERATOR_NAME` vars.
