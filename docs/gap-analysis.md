# MedChain — Gap Analysis (SRS + Requirements vs. the Antigravity build)

Audited 9 Nov 2026 against `software_requirements_specification_srs.md`, `requirements.md` and the Stitch screens.
Earlier docs (`qa-matrix.md` "77/77 passing", "Approved feasibility") described mock-based tests as production evidence. That was not accurate; this file replaces that claim.

Legend: **FIXED** = changed and covered by automated tests · **NEEDS DEVICE** = code complete but can only be proven on real hardware · **OPEN** = not built / needs a product decision.

## A. What was wrong

| # | Gap found | Severity | Status |
|---|---|---|---|
| 1 | **Alarm times wrong by the UTC offset.** `08:00` was stored as `08:00Z`; "today" used the UTC date. Every reminder would ring early/late. | Critical | FIXED (domain + DB; IST/EST/DST tests) |
| 2 | Dose log stored the *tap time* as the scheduled time; same-day child date/time computed in UTC; fallback time treated as UTC. | High | FIXED |
| 3 | Taken/Skip not idempotent: a replayed notification tap double-decremented stock and double-counted the course. | High | FIXED |
| 4 | Snooze did nothing real: occurrence left in a state the scheduler never re-read, alarm never re-armed; the 10-min grace dropped it. | High | FIXED |
| 5 | Editing a medicine inserted a **second schedule row**, duplicated dependencies and kept stale doses. | High | FIXED |
| 6 | Calendar-day (`FIXED_DAYS`) completion only checked on a Taken tap — never at the day boundary, so follow-up phases B/C/D never started if the last dose was missed (the core SRS scenario). | Critical | FIXED |
| 7 | Undo restored states but not the accidentally-taken dose, count or stock; no alarm re-arm. | Medium | FIXED |
| 8 | No 30-minute "not confirmed" escalation; no low-stock (5 days) notification. | High | FIXED (device-side; see C1) |
| 9 | Dependency cycles / "follow-up of an ongoing medicine" were accepted. | Medium | FIXED |
| 10 | **Backend was a mock**: pairing, relationships, plans, commands and dose events lived in in-memory `Map`s; caregiver identity was a trusted `Bearer cg_arthur`; patient/caregiver names hardcoded; Math.random pairing code; no rate limits; no permission enforcement; no FCM. | Critical | FIXED (D1, JWT+PBKDF2, device secrets, rate limits, IDOR-safe middleware, FCM dispatcher; 57 API tests) |
| 11 | **Remote plan apply was broken**: overwrote device-owned progress, ignored schedule edits, dropped dependencies (multi-phase prescriptions could not work remotely), no transaction, no idempotency, no rejection path. Caregiver commands hardcoded `baseVersion: 1`. | Critical | FIXED (`PlanSnapshotV2`, `applyPlanSnapshot`, tests) |
| 12 | Outbox grew forever in Personal Mode; uploads hardcoded the zone `America/New_York`. | Medium | FIXED |
| 13 | Fabricated content in UI: "Eleanor/Arthur Vance", demo occurrences, "Course: Day 3 of 7", "Morning dose", "Sucralfate +30 min", test alarm naming a real drug, fake QR emoji, "Encrypted device link", hardcoded version, hardcoded battery-exempt/full-screen "granted". | High | FIXED (alarm, Today, Settings, link/connect screens) |
| 14 | UI claimed success when saves failed (`catch → setAlarmState('TAKEN')`). | High | FIXED |
| 15 | Today labelled every future dose "Due Now"; no snoozed / not-confirmed states; no course-complete banner or Undo. | Medium | FIXED |
| 16 | Notification actions only worked while the React tree was mounted; a "Taken" tap on a killed app was lost; no Skip action. | High | FIXED (cold-start response handling) |
| 17 | Sound/vibration toggles were stored but affected nothing. | Medium | FIXED (per-combination Android channels) |
| 18 | `app.json` referenced missing `assets/*.png` (native build would fail); `USE_EXACT_ALARM` declared blindly (Play policy); no camera plugin; no push registration; no `app.config`. | High | FIXED |
| 19 | Demo profile named "Eleanor Vance" seeded into every install. | Medium | FIXED |
| 20 | Caregiver relationship cache not wiped on sign-out. | Medium | FIXED |

## B. Requirements coverage after this work

| Area (SRS / requirements) | State |
|---|---|
| Fixed times, weekdays, cycles, intervals | FIXED (timezone-correct) |
| Same-day dependency incl. drift, snooze hold, skip cascade | FIXED |
| Course lifecycle ACTIVE / QUEUED / COMPLETED, 1-to-many fan-out, phase delay, 5-min Undo | FIXED |
| Offline Day-1 multi-phase prescription from a caregiver | FIXED (e2e test applies it, transitions with no network) |
| Local inventory + 5-day low stock | FIXED |
| Zero-password 6-digit pairing, consent, scoped permissions, revoke/disconnect | FIXED (API + screens) |
| Closed-loop events, original timestamps, exactly-once | FIXED (e2e test) |
| Remote command states Waiting → Received → Applied/Rejected | FIXED |
| Payload ≤ 4 KB | Device report tested < 4 KB for typical plans; server hard cap is 16 KB |

## C. Still open (be aware before launch)

| # | Item | Why | Next step |
|---|---|---|---|
| C1 | **Server-side escalation.** The 30-min "not confirmed" check runs when the app wakes, not from an OS timer; an untouched/killed phone delays the caregiver alert. | Android/iOS give no exact JS timer. | Add a Worker cron that evaluates uploaded plans with `@medchain/domain` and flags doses with no event after 30 min (needs `RECEIVE_ALERTS` + caregiver push tokens). |
| C2 | **Full-screen lock-screen alarm (Android 14+): built, compiles, NOT yet proven on a phone.** In-repo native module `apps/mobile/modules/medchain-alarm` (AlarmManager.setAlarmClock → receiver → full-screen-intent notification, boot/time-zone receivers, native persistence). Needs the user to allow *full-screen notifications* on Android 14+ (Settings shows a button); Play Store eligibility is unconfirmed. **iOS 26 AlarmKit is not built**; iOS uses normal notifications. | Needs a real Android 14+ device and Play policy review. | Run the test-alarm checklist in `docs/alarm-platform-matrix.md`. |
| C3 | **Everything native is unverified on hardware**: exact-alarm permission flows, reboot re-arm (relies on expo-notifications' boot receiver), OEM battery policies, notification actions from a killed app, camera QR scan, FCM wake-up. | No device/emulator in this environment. | Run `docs/qa-matrix.md` device checklist on ≥ 1 Android 14 + 1 iPhone. |
| C4 | Backend not deployed: needs `wrangler d1 migrations apply`, secrets `JWT_SECRET`, `PAIRING_PEPPER`, `FCM_SERVICE_ACCOUNT_JSON`, `ALLOWED_ORIGINS`, and `EXPO_PUBLIC_API_URL` / `google-services.json` for the app. Cron + FCM only tested with fakes. | Needs your Cloudflare + Firebase accounts. | See `docs/release-checklist.md`. |
| C5 | Caregiver auth is email+password (decision 0005). No password reset, email verification or account deletion. | Needs an email provider. | Product decision. |
| C6 | Local DB encryption (SQLCipher) not enabled; database is app-sandboxed plaintext. Privacy copy does not claim otherwise. | Needs a native build to verify `PRAGMA cipher_version`. | Open decision 15. |
| C7 | Atkinson Hyperlegible font not packaged (system font used, allowed by §3.1). Dynamic type is system-driven. | Per-weight family mapping across 40+ screens. | Optional polish. |
| C8 | Play Console declarations for exact alarms / full-screen intent, privacy policy URL, Help/About pages, data export/deletion. | Not code. | Release checklist. |
| C9 | Open product decisions 3, 5(copy only), 10, 13, 16, 17 in requirements §12 are still unresolved. | Product calls. | Record in `docs/decisions/`. |


## D. Production pass (11 Nov 2026)

| # | Item | Status |
|---|---|---|
| D1 | **Lock-screen alarm never appeared when the app was merely in the background.** Root cause: the native module switched "show over lock screen" OFF whenever the app went to the background, and locking the phone backgrounds it. Replaced with an alarm *session* (`AlarmSession.kt`): the alarm itself switches it on before the full-screen intent is launched; it is switched off when the user finishes or after 10 minutes. | Fixed in code. **Not yet compiled or run on a phone.** |
| D2 | Alarms were only armed 48 h ahead, and only when the app ran: two days without opening the app silenced all reminders. | FIXED: 14-day horizon, soonest-first, capped (Android 200, iOS 60). Tested. |
| D3 | Follow-up medicines (B/C/D) got no alarms until the app was opened after a calendar-day course ended. | FIXED: their doses are predicted and pre-armed (chained phases and phase delay included), with the same occurrence ids as the real doses. Dose-count courses cannot be predicted. Tested. |
| D4 | No way to delete a caregiver account or a patient's server data (Google Play requirement). | FIXED: `DELETE /auth/me` (password required), `DELETE /devices/current?purge=true`, buttons in Profile and the Family tab, public `/privacy` and `/delete-account` pages. Tested. **Needs an API redeploy.** |
| D5 | A render error left a blank app. | FIXED: root error screen with Try again. |
| D6 | No indexes on the hot queries; one medicine lookup per dose; synced outbox rows kept forever. | FIXED: migration 005, per-medicine cache, 30-day outbox cleanup. |
| D7 | Button labels wrapped a letter ("Bac/k"); icon/label spacing uneven. | FIXED in the shared buttons and status tags (introduced earlier in this work). Not seen on a phone. |
| D8 | Reminder sound: generic system tone. | Recorded female and male voice reminders over music; user chooses in Settings with a Listen button. Not heard on a phone. |

Still open after this pass: C1 (server-side "not confirmed" alert + caregiver push), C3 (nothing verified on hardware), C5 (no password reset / email verification), C6 (no local DB encryption), iOS AlarmKit, Play policy review for full-screen alarms and battery-optimisation exemption.
