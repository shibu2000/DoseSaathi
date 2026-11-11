import { diffCalendarDays } from './date-utils';

/**
 * Deterministically calculates whether a given date is an "ON" treatment day in an ON/OFF cycle.
 * @param dateStr Target date 'YYYY-MM-DD'
 * @param anchorDateStr Start anchor date 'YYYY-MM-DD'
 * @param daysOn Number of active days (e.g. 21)
 * @param daysOff Number of rest days (e.g. 7)
 */
export function isDayOnInCycle(
  dateStr: string,
  anchorDateStr: string,
  daysOn: number,
  daysOff: number
): boolean {
  if (daysOn <= 0) return false;
  if (daysOff <= 0) return true;

  const cycleLength = daysOn + daysOff;
  const offset = diffCalendarDays(anchorDateStr, dateStr);
  const normalized = ((offset % cycleLength) + cycleLength) % cycleLength;

  return normalized < daysOn;
}
