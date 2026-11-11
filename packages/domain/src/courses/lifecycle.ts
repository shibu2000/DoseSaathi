import type { Medication } from '@medchain/contracts';
import { diffCalendarDays, localDateInZone, addDays, zonedDateTimeToUtc } from '../schedules/date-utils';

export function isCourseComplete(params: {
  medication: Medication;
  currentLocalDate: string; // 'YYYY-MM-DD' in `timezoneId`
  timezoneId?: string;      // IANA zone; defaults to UTC for legacy callers
}): boolean {
  const { medication, currentLocalDate, timezoneId } = params;

  if (medication.lifecycleStatus !== 'ACTIVE') {
    return false;
  }

  if (medication.courseType === 'FIXED_DOSES') {
    if (typeof medication.maxTotalDoses === 'number' && medication.maxTotalDoses > 0) {
      return medication.dosesTakenCount >= medication.maxTotalDoses;
    }
    return false;
  }

  if (medication.courseType === 'FIXED_DAYS') {
    if (typeof medication.maxDurationDays === 'number' && medication.maxDurationDays > 0) {
      const courseStartDateStr = timezoneId
        ? localDateInZone(medication.courseStartAt, timezoneId)
        : medication.courseStartAt.substring(0, 10);
      const elapsedDays = diffCalendarDays(courseStartDateStr, currentLocalDate);
      return elapsedDays >= medication.maxDurationDays;
    }
    return false;
  }

  return false;
}

/**
 * The instant at which a FIXED_DAYS course ends: local midnight at the start of
 * day N+1 (i.e. after `maxDurationDays` full calendar days). Null for other types.
 */
export function fixedDaysCompletionInstant(medication: Medication, timezoneId: string): string | null {
  if (medication.courseType !== 'FIXED_DAYS' || !medication.maxDurationDays || medication.maxDurationDays <= 0) {
    return null;
  }
  const startDate = localDateInZone(medication.courseStartAt, timezoneId);
  return zonedDateTimeToUtc(addDays(startDate, medication.maxDurationDays), '00:00', timezoneId);
}
