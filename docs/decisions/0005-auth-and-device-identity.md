# ADR 0005: Caregiver Authentication and Patient Device Identity

**Status:** Approved
**Date:** 9 November 2026
**Resolves:** open decision #1 in ADR 0001 / requirements 12 (authentication provider), plus part of #2 (permission keys) and #4 (pairing limits).

## Context
The prototype trusted `Authorization: Bearer cg_xxx` and fell back to a hardcoded caregiver. Remote sharing needs real caregiver identity and a patient-device identity, while Personal Mode must stay registration-free.

## Decision

### Caregiver accounts
- Email + password, behind a provider-neutral `IdentityProvider` adapter (`register`, `authenticate`) that returns `{provider, subject}`. `caregiver_users` stores `(auth_provider, auth_subject)` (unique). The shipped adapter is `local-password`; a Firebase/Auth0/etc. adapter can replace it without touching routes, pairing or relationships.
- Passwords: PBKDF2-HMAC-SHA256 via WebCrypto, 100,000 iterations (the Cloudflare Workers maximum), 16-byte random per-user salt, 32-byte output, constant-time comparison. Iterations are stored per row so they can be raised if the platform limit changes. Unknown-email logins run a dummy derivation to equalise timing.
- Access token: JWT HS256 signed with the `JWT_SECRET` Worker secret, 30-minute lifetime (`ACCESS_TOKEN_TTL_SECONDS`, bounded 15-60 min), claims `iss, aud, sub, iat, exp`. Verified by the `requireCaregiver` middleware, which also checks the caregiver row still exists and is enabled. A missing `JWT_SECRET` fails closed (500).
- Refresh token: 32 random bytes, opaque, only its SHA-256 stored. Rotated on every use (30-day lifetime); presenting an already-rotated token revokes the whole token family (theft detection). Logout revokes the family.
- Auth endpoints are rate limited per IP and per email in D1.

### Patient device identity
- `POST /devices/register` creates an opaque device id and a 32-byte random `deviceSecret`, returned once; only the SHA-256 is stored (the secret is high entropy, so a fast hash is appropriate). Calls authenticate with `Authorization: Device <deviceId>.<secret>`, compared in constant time.
- Re-registering with valid Device auth only updates push token / app version / display name. It never mints a new identity.
- The patient display name is stored on `patient_devices.display_name` and is what caregivers and pairing responses show.
- Personal Mode makes no calls to any of these endpoints.

### Authorization
- The actor is always derived from the credential. Client bodies never supply caregiver/patient/relationship identifiers or confirmation data.
- Typed middleware: `requireCaregiver`, `requireDevice`, `requireRelationshipAccess(permission)`. Non-participants get 404, participants of an ended relationship 403 `RELATIONSHIP_INACTIVE`, missing permission 403 `PERMISSION_DENIED`.
- Permission keys: `VIEW_SCHEDULE`, `EDIT_SCHEDULE` (requires `VIEW_SCHEDULE`), `VIEW_DOSE_LOGS`, `RECEIVE_ALERTS`. The patient may approve any non-empty subset of what was requested and may later restrict (never widen) it.

### Pairing parameters (open decision #4)
- 6-digit code from `crypto.getRandomValues` using rejection sampling (no modulo bias); QR carries `session id + 32-byte secret`. Only keyed HMAC-SHA256 hashes (pepper `PAIRING_PEPPER`) are stored.
- Lifetime 10 minutes, single use, regenerate invalidates. Invalid / expired / consumed / regenerated codes all return the same `404 PAIRING_CODE_INVALID`. Brute force is limited per caregiver and per IP, plus a 5-failure lockout per caregiver; QR secret failures increment the session counter and kill the session after 5.

### Not-confirmed wording (open decision #5, server side)
The server stores `DOSE_NOT_CONFIRMED` and exposes the caregiver label "Not confirmed". No server-side "missed" classification exists.

## Consequences
- Migration `0002` drops and recreates the 0001 prototype tables (they held no production data; all state was in memory). Forward migrations only from here.
- Email/password means the app must handle account recovery later; not part of this milestone (no email delivery, no password reset).
- Swapping the provider requires a new `IdentityProvider` plus a token verifier mapping provider subject to `caregiver_users`.
- Caregiver push (e.g. alerts for `RECEIVE_ALERTS`) is not implemented: caregivers have no registered push tokens yet.
