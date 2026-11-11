# 0006 — Time-zone and calendar policy

**Status:** Decided (resolves open decision 6 and 7 of requirements §12 for the MVP).

- A medicine's schedule is stored as a **local wall-clock rule** (`HH:MM`, a calendar start date) plus an **IANA zone id**. The UTC instant of every dose is *derived* from that rule (`zonedDateTimeToUtc` in `@medchain/domain`). Previously `08:00` was stored as `08:00Z`, so every alarm fired a UTC-offset late or early.
- The zone is the **patient device's current zone** (the device executes the alarms). When the device zone changes, open future doses are regenerated in the new zone (`SchedulerService.handleTimezoneChange`). DST: a local time that does not exist (spring forward) resolves to just after the gap; an ambiguous time (fall back) resolves to its first occurrence. Local time stays constant across DST.
- A dose created before the course began is never invented: doses earlier than `courseStartAt` are not generated.
- **FIXED_DAYS** ends at **local midnight after day N** (course day 1 = the local date of `courseStartAt`). Completion is evaluated on app launch/resume, on every dose action and on every alarm reconciliation, so it still happens when the phone was off at the boundary. The completion instant is the boundary itself; its Undo window (5 min) is normally already closed.
- **FIXED_DOSES** completes on the Nth confirmed **Taken**, regardless of other skipped doses (SRS 3.2.2). Skipped/snoozed/not-confirmed never count.
- Phase delay (`phase_start_delay_hours`) is added to the completion instant to set the follow-up's `courseStartAt`.
