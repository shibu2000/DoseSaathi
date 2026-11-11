import { generateOccurrencesForRange, isValidTimeZone, localDateInZone, utcToZonedParts } from '@medchain/domain';
import type { DevicePlanReport, Medication, PlanMedication, Schedule } from '@medchain/contracts';

export type TodayDoseState = 'TAKEN' | 'SKIPPED' | 'NOT_CONFIRMED_YET' | 'SNOOZED' | 'UPCOMING' | 'UNKNOWN';

export interface TodayRow {
  key: string;
  medicationId: string;
  name: string;
  dosageText: string;
  instructions?: string;
  /** Wall-clock HH:MM in `tz` */
  timeLocal: string;
  scheduledAtUtc: string;
  state: TodayDoseState;
  /** When the patient acted (TAKEN/SKIPPED), if known */
  actionAt?: string;
}

export interface TodayDependent {
  medicationId: string;
  name: string;
  text: string;
}

export interface TodayView {
  tz: string;
  localDate: string;
  rows: TodayRow[];
  dependents: TodayDependent[];
}

export interface ActivityEventLike {
  medicationId: string;
  medicationName: string | null;
  dosageText: string | null;
  eventType: string;
  scheduledAt: string | null;
  actionTimestamp: string;
  timezoneId: string;
}

/** Timezone to show the patient's day in: the zone their phone recorded on its latest event, else ours. */
export function pickDisplayTimezone(events: ActivityEventLike[], fallback: string): { tz: string; fromPhone: boolean } {
  const latest = [...events].sort((a, b) => b.actionTimestamp.localeCompare(a.actionTimestamp))[0];
  if (latest && isValidTimeZone(latest.timezoneId)) return { tz: latest.timezoneId, fromPhone: true };
  return { tz: fallback, fromPhone: false };
}

function toMedication(m: PlanMedication, status: DevicePlanReport['status'][number], nowIso: string): Medication {
  return {
    id: m.id,
    profileId: '00000000-0000-4000-8000-000000000000',
    name: m.name,
    dosageText: m.dosageText,
    doseQuantity: m.doseQuantity,
    doseUnit: m.doseUnit,
    instructions: m.instructions,
    lifecycleStatus: status.lifecycleStatus,
    courseType: m.courseType,
    courseStartAt: status.courseStartAt ?? nowIso,
    maxDurationDays: m.maxDurationDays ?? undefined,
    maxTotalDoses: m.maxTotalDoses ?? undefined,
    dosesTakenCount: status.dosesTakenCount,
    trackStock: m.trackStock,
    currentStock: status.currentStock ?? 0,
    lowStockThreshold: m.lowStockThreshold,
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function toSchedule(m: PlanMedication, startDate: string, tz: string, nowIso: string): Schedule {
  const s = m.schedule;
  return {
    id: '00000000-0000-4000-8000-000000000001',
    medicationId: m.id,
    scheduleType: s.scheduleType,
    recurrenceType: s.recurrenceType,
    startDate,
    timezoneId: tz,
    fixedTimes: s.fixedTimes,
    activeWeekdays: s.activeWeekdays,
    cycleDaysOn: s.cycleDaysOn,
    cycleDaysOff: s.cycleDaysOff,
    cycleAnchorDate: s.cycleAnchorDate,
    intervalHours: s.intervalHours,
    intervalFirstTime: s.intervalFirstTime,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

const FINAL: Record<string, TodayDoseState> = { DOSE_TAKEN: 'TAKEN', DOSE_SKIPPED: 'SKIPPED' };
const rank: Record<TodayDoseState, number> = { TAKEN: 4, SKIPPED: 4, NOT_CONFIRMED_YET: 3, SNOOZED: 2, UNKNOWN: 1, UPCOMING: 1 };

function eventState(type: string): TodayDoseState | null {
  if (FINAL[type]) return FINAL[type];
  if (type === 'DOSE_SNOOZED') return 'SNOOZED';
  if (type === 'DOSE_NOT_CONFIRMED') return 'NOT_CONFIRMED_YET';
  return null;
}

/**
 * The patient's day, derived ONLY from what the phone reported: its schedules (device report, ACTIVE
 * medicines) expanded for today, overlaid with real dose events. Nothing is invented: a dose that has no
 * event is "Upcoming" (if still ahead) or "Not confirmed yet" (if its time has passed). Same-day
 * follow-ups have no fixed time, so they are listed separately instead of guessing a time.
 */
export function buildTodayView(params: {
  report: DevicePlanReport | null | undefined;
  events: ActivityEventLike[];
  now: Date;
  tz: string;
  /** false hides the future-dose preview (stale data) */
  includeUpcoming: boolean;
  /** false when dose events could not be loaded or are not shared: past doses are then "unknown", not "not confirmed" */
  eventsKnown?: boolean;
}): TodayView {
  const { report, events, now, tz, includeUpcoming, eventsKnown = true } = params;
  const nowIso = now.toISOString();
  const localDate = localDateInZone(now, tz);
  const rows = new Map<string, TodayRow>();
  const dependents: TodayDependent[] = [];
  const statusById = new Map((report?.status ?? []).map((s) => [s.medicationId, s]));
  const medById = new Map((report?.medications ?? []).map((m) => [m.id, m]));

  for (const pm of report?.medications ?? []) {
    const st = statusById.get(pm.id);
    if (!st || st.lifecycleStatus !== 'ACTIVE') continue;
    if (pm.schedule.scheduleType === 'SAME_DAY_DEPENDENT' && pm.sameDay) {
      dependents.push({
        medicationId: pm.id,
        name: pm.name,
        text: `${pm.sameDay.delayMinutes} min after ${medById.get(pm.sameDay.parentMedicationId)?.name ?? 'the earlier medicine'} is taken`,
      });
      continue;
    }
    const medication = toMedication(pm, st, nowIso);
    const startDate = st.courseStartAt ? localDateInZone(st.courseStartAt, tz) : localDate;
    const schedule = toSchedule(pm, startDate, tz, nowIso);
    for (const occ of generateOccurrencesForRange({ medication, schedule, fromLocalDate: localDate, toLocalDate: localDate })) {
      const isFuture = new Date(occ.scheduledAtUtc).getTime() > now.getTime();
      rows.set(`${pm.id}|${new Date(occ.scheduledAtUtc).getTime()}`, {
        key: occ.occurrenceId,
        medicationId: pm.id,
        name: pm.name,
        dosageText: `${pm.dosageText} • ${pm.doseQuantity} ${pm.doseUnit}`,
        instructions: pm.instructions,
        timeLocal: occ.scheduledLocalTime,
        scheduledAtUtc: occ.scheduledAtUtc,
        state: isFuture ? 'UPCOMING' : eventsKnown ? 'NOT_CONFIRMED_YET' : 'UNKNOWN',
      });
    }
  }

  for (const ev of events) {
    const state = eventState(ev.eventType);
    if (!state || !ev.scheduledAt) continue;
    if (localDateInZone(ev.scheduledAt, tz) !== localDate) continue;
    const k = `${ev.medicationId}|${new Date(ev.scheduledAt).getTime()}`;
    const existing = rows.get(k);
    if (existing) {
      if (rank[state] >= rank[existing.state]) {
        existing.state = state;
        if (state === 'TAKEN' || state === 'SKIPPED') existing.actionAt = ev.actionTimestamp;
      }
      continue;
    }
    // A real event with no generated occurrence (e.g. a same-day follow-up that rang after its parent)
    const pm = medById.get(ev.medicationId);
    rows.set(k, {
      key: `event_${k}`,
      medicationId: ev.medicationId,
      name: ev.medicationName ?? pm?.name ?? 'Medicine',
      dosageText: ev.dosageText ?? pm?.dosageText ?? '',
      instructions: pm?.instructions,
      timeLocal: utcToZonedParts(ev.scheduledAt, tz).time,
      scheduledAtUtc: new Date(ev.scheduledAt).toISOString(),
      state,
      actionAt: state === 'TAKEN' || state === 'SKIPPED' ? ev.actionTimestamp : undefined,
    });
  }

  const list = [...rows.values()]
    .filter((r) => includeUpcoming || r.state !== 'UPCOMING')
    .sort((a, b) => a.scheduledAtUtc.localeCompare(b.scheduledAtUtc));
  return { tz, localDate, rows: list, dependents: includeUpcoming ? dependents : [] };
}

export function todayStateLabel(state: TodayDoseState): { label: string; variant: 'taken' | 'skipped' | 'unconfirmed' | 'due' | 'queued' } {
  switch (state) {
    case 'UNKNOWN':
      return { label: 'Confirmation not available', variant: 'queued' };
    case 'TAKEN':
      return { label: 'Taken', variant: 'taken' };
    case 'SKIPPED':
      return { label: 'Skipped', variant: 'skipped' };
    case 'SNOOZED':
      return { label: 'Snoozed, reminder pending', variant: 'unconfirmed' };
    case 'NOT_CONFIRMED_YET':
      return { label: 'Not confirmed yet', variant: 'unconfirmed' };
    default:
      return { label: 'Upcoming', variant: 'due' };
  }
}
