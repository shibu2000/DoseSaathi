# 0007 — Who owns what in a remote plan

- A caregiver edits the **prescription** (name, dose, schedule, course rule, `sameDay` and `startsAfter` dependencies). The patient phone owns **progress** (confirmed dose count, lifecycle state, course start, stock on hand). The wire format `PlanSnapshotV2` / `DevicePlanReport` (`packages/contracts/src/plan-v2.ts`) encodes exactly this split, so a mid-course edit never resets a patient's history.
- A snapshot is applied by `applyPlanSnapshot` in **one local transaction**: all or nothing. Failure -> `REJECTED` with a reason code (`DEPENDENCY_CYCLE`, `INVALID_MEDICINE`, `NOT_CAREGIVER_MEDICINE`, `INVALID_PLAN`), existing plan untouched. Command ids are recorded so a repeated push never applies twice.
- A caregiver can only change/remove medicines a caregiver created (`remote_medications`). The patient's own medicines are never modified remotely.
- Outbox events are queued **only while a caregiver is linked** (`family_sharing_active`), keeping Personal Mode at zero server load. Events keep the original scheduled/action timestamps and zone and are idempotent on `eventId`.
- "Not confirmed": a dose with no action 30 minutes after its (snoozed) time becomes `UNCONFIRMED` and emits `DOSE_NOT_CONFIRMED`. Caregivers see "Not confirmed", never "missed". A late Taken is still accepted.
- **Known limit:** the 30-minute check runs when the app is opened/resumed or reconciles, not from an OS timer. If the phone stays untouched, the caregiver alert is delayed until the next app wake. See `docs/gap-analysis.md` (server-side escalation).
