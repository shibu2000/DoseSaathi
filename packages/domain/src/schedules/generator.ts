import type { Medication, Schedule } from '@medchain/contracts';
import { addDays, diffCalendarDays, getISOWeekday, localDateInZone, zonedDateTimeToUtc } from './date-utils';
import { isDayOnInCycle } from './cycle';
import { generateIntervalTimes } from './interval';
import type { PlannedOccurrence } from './types';

export function generateOccurrencesForRange(params: {
  medication: Medication;
  schedule: Schedule;
  fromLocalDate: string; // 'YYYY-MM-DD'
  toLocalDate: string;   // 'YYYY-MM-DD'
}): PlannedOccurrence[] {
  const { medication, schedule, fromLocalDate, toLocalDate } = params;

  // Queued or completed courses do not receive scheduled occurrences
  if (medication.lifecycleStatus !== 'ACTIVE') {
    return [];
  }

  // Same-day dependent schedules are materialized dynamically after the parent dose is taken
  if (schedule.scheduleType === 'SAME_DAY_DEPENDENT') {
    return [];
  }

  const occurrences: PlannedOccurrence[] = [];
  const daysCount = diffCalendarDays(fromLocalDate, toLocalDate);
  if (daysCount < 0) return [];

  const tz = schedule.timezoneId;
  const courseStartMs = new Date(medication.courseStartAt).getTime();
  const courseStartLocalDate = Number.isNaN(courseStartMs)
    ? schedule.startDate
    : localDateInZone(medication.courseStartAt, tz);

  // Determine effective start date: never before the schedule start nor the course start
  let effectiveStartDate = schedule.startDate > fromLocalDate ? schedule.startDate : fromLocalDate;
  if (courseStartLocalDate > effectiveStartDate) effectiveStartDate = courseStartLocalDate;

  // FIXED_DAYS courses end after N calendar days regardless of missed doses
  let lastDate = toLocalDate;
  if (medication.courseType === 'FIXED_DAYS' && medication.maxDurationDays && medication.maxDurationDays > 0) {
    const courseLastDate = addDays(courseStartLocalDate, medication.maxDurationDays - 1);
    if (courseLastDate < lastDate) lastDate = courseLastDate;
  }

  let currentDate = effectiveStartDate;
  while (currentDate <= lastDate) {
    let isDayActive = false;

    if (schedule.recurrenceType === 'DAILY') {
      isDayActive = true;
    } else if (schedule.recurrenceType === 'SPECIFIC_DAYS') {
      const weekday = getISOWeekday(currentDate);
      isDayActive = schedule.activeWeekdays.includes(weekday);
    } else if (schedule.recurrenceType === 'CYCLE') {
      if (schedule.cycleAnchorDate && schedule.cycleDaysOn && schedule.cycleDaysOff) {
        isDayActive = isDayOnInCycle(
          currentDate,
          schedule.cycleAnchorDate,
          schedule.cycleDaysOn,
          schedule.cycleDaysOff
        );
      }
    }

    if (isDayActive) {
      let times: string[] = [];

      if (schedule.scheduleType === 'FIXED_TIMES') {
        times = [...schedule.fixedTimes].sort();
      } else if (schedule.scheduleType === 'INTERVAL') {
        times = generateIntervalTimes(
          schedule.intervalFirstTime ?? '08:00',
          schedule.intervalHours ?? 6
        );
      }

      for (const timeStr of times) {
        const scheduledAtUtc = zonedDateTimeToUtc(currentDate, timeStr, tz);
        // Doses that were already in the past when the course began are not created
        if (!Number.isNaN(courseStartMs) && new Date(scheduledAtUtc).getTime() < courseStartMs) continue;
        occurrences.push({
          occurrenceId: `${medication.id}_${currentDate}_${timeStr.replace(':', '')}`,
          medicationId: medication.id,
          scheduledLocalDate: currentDate,
          scheduledLocalTime: timeStr,
          scheduledAtUtc,
          timezoneId: tz,
        });
      }
    }

    currentDate = addDays(currentDate, 1);
  }

  return occurrences;
}
