import type { WeekdayNumber } from './types';

export function parseISODate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

export function formatISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = parseISODate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatISODate(d);
}

export function diffCalendarDays(fromStr: string, toStr: string): number {
  const from = parseISODate(fromStr);
  const to = parseISODate(toStr);
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Returns ISO weekday number: 1 = Monday, 7 = Sunday
 */
export function getISOWeekday(dateStr: string): WeekdayNumber {
  const d = parseISODate(dateStr);
  const day = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  return (day === 0 ? 7 : day) as WeekdayNumber;
}

/**
 * Combines dateStr (YYYY-MM-DD) and timeStr (HH:MM) in UTC (standard base representation)
 */
export function combineDateTimeUtc(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}:00.000Z`;
}

// ---------------------------------------------------------------------------
// Time-zone aware helpers.
//
// Policy (see docs/decisions/0006-time-zone-policy.md): schedules are stored as
// *local wall-clock* rules (date + HH:MM) plus an IANA time-zone id. The UTC
// instant of an occurrence is derived from that rule, so "08:00" means 08:00 on
// the patient's wall clock, not 08:00 UTC.
// ---------------------------------------------------------------------------

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    getFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in the given IANA time zone. */
export function utcToZonedParts(
  instant: Date | string,
  timeZone: string
): { date: string; time: string; seconds: number } {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const parts = getFormatter(timeZone).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    seconds: Number(get('second')),
  };
}

/** Local calendar date ('YYYY-MM-DD') of an instant in the given time zone. */
export function localDateInZone(instant: Date | string, timeZone: string): string {
  return utcToZonedParts(instant, timeZone).date;
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const p = getFormatter(timeZone).formatToParts(new Date(instantMs));
  const get = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * Converts a local wall-clock date/time in an IANA zone to a UTC ISO instant.
 * Nonexistent local times (spring-forward gap) resolve to the instant just after
 * the gap; ambiguous times (fall-back overlap) resolve to the first occurrence.
 */
export function zonedDateTimeToUtc(localDate: string, localTime: string, timeZone: string): string {
  const [y, mo, d] = localDate.split('-').map(Number);
  const [h, mi] = localTime.split(':').map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  // Two-pass offset resolution handles DST boundaries.
  let guess = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  const offset2 = zoneOffsetMs(guess, timeZone);
  guess = wallAsUtc - offset2;
  return new Date(guess).toISOString();
}
