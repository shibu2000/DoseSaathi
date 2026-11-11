# MedChain — QA Matrix (honest status)

**Updated:** 9 November 2026. Supersedes the earlier "77/77 passing" matrix, which counted tests against an in-memory mock API and a UTC-based schedule bug.

## Automated (run with `bun test` and `bun run typecheck` at the repo root)

| Suite | Location | What it proves |
|---|---|---|
| Domain engine | `packages/domain/test/` | Schedules, cycles, intervals, dependency maths, course completion, fan-out, undo, stock forecast; **time-zone/DST correctness**, FIXED_DAYS boundary |
| Engine hardening | `apps/mobile/test/engine-hardening.test.ts` | Idempotent Taken, real scheduled time, snooze re-arm, drift chain, skip fallback, cycles rejected, edit without duplicates, calendar completion while phone off, undo restores count/stock, 30-min not-confirmed, low stock, no cloud work in Personal Mode |
| Remote plan apply | `apps/mobile/test/plan-applier.test.ts` | Multi-phase prescription offline, exactly-once, progress preserved on edit, all-or-nothing rollback, patient medicines protected |
| Family sync E2E | `apps/mobile/test/e2e-family-sync.test.ts` | Real API + real clients + real on-device DB: pairing with real identities, command Waiting→Applied only after ack, rejection reasons, offline dose uploaded once with original timestamps, revoke blocks caregiver, personal mode makes zero calls |
| API | `apps/api/test/` | Auth, pairing (expiry, reuse, rate limit, brute force), IDOR on every relationship route, permissions, revoke/disconnect, command lifecycle, idempotency, 413, FCM dispatcher with fake fetch |
| Phase 2–4, 8 legacy | `apps/mobile/test/` | Migrations/repositories, wizard persistence, alarm reconciliation, settings truthfulness |

## Not automated / not yet verified
See `docs/gap-analysis.md` section C and the device checklist in `docs/release-checklist.md`. Nothing in this repo has been run on a physical device, against live Cloudflare D1, or against real FCM/APNs.
