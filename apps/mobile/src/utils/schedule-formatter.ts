import type { Schedule } from '@medchain/contracts';

/**
 * Converts a 24-hour time string ("08:00", "20:30") to 12-hour format ("8:00 AM", "8:30 PM").
 */
export function formatTime12h(timeStr: string): string {
  if (!timeStr || !timeStr.includes(':')) return timeStr;
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return timeStr;

  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mFormatted = String(m).padStart(2, '0');
  return `${h12}:${mFormatted} ${ampm}`;
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface FormattedScheduleSummary {
  timesLabel: string;
  frequencyLabel: string;
  combinedSummary: string;
}

/**
 * Formats a Schedule into user-friendly timing and frequency labels.
 */
export function formatSchedule(
  schedule: Schedule | null | undefined,
  instructions?: string | null,
  parentMedicationName?: string
): FormattedScheduleSummary {
  if (!schedule) {
    const fallback = instructions || 'Scheduled daily';
    return {
      timesLabel: '',
      frequencyLabel: fallback,
      combinedSummary: fallback,
    };
  }

  // Event-based same day dependent
  if (schedule.scheduleType === 'SAME_DAY_DEPENDENT') {
    const parentName = parentMedicationName || 'previous medicine';
    const delay = (schedule as any).delayMinutes ?? (schedule as any).sameDayDelayMinutes ?? 30;
    const timing = `${delay} min after taking ${parentName}`;
    const combined = instructions ? `${timing} • ${instructions}` : timing;
    return {
      timesLabel: `${delay}m delay`,
      frequencyLabel: `After ${parentName}`,
      combinedSummary: combined,
    };
  }

  // Interval schedule
  if (schedule.scheduleType === 'INTERVAL') {
    const intervalHours = schedule.intervalHours ?? 6;
    const firstTime = schedule.intervalFirstTime ? formatTime12h(schedule.intervalFirstTime) : '8:00 AM';
    const timing = `Every ${intervalHours} hrs (from ${firstTime})`;
    const combined = instructions ? `${timing} • ${instructions}` : timing;
    return {
      timesLabel: `Every ${intervalHours} hrs`,
      frequencyLabel: `From ${firstTime}`,
      combinedSummary: combined,
    };
  }

  // Fixed times schedule
  const times = (schedule.fixedTimes || []).map(formatTime12h);
  const timesStr = times.length > 0 ? times.join(', ') : 'Daily';

  let frequency = 'Every day';
  if (schedule.recurrenceType === 'SPECIFIC_DAYS' && schedule.activeWeekdays?.length) {
    const days = schedule.activeWeekdays.map((d) => WEEKDAY_NAMES[d - 1] || `${d}`).join(', ');
    frequency = days;
  } else if (schedule.recurrenceType === 'CYCLE') {
    const on = schedule.cycleDaysOn ?? 21;
    const off = schedule.cycleDaysOff ?? 7;
    frequency = `${on} days on, ${off} days off`;
  }

  let combined = `${timesStr} • ${frequency}`;
  if (instructions) {
    combined = `${timesStr} • ${instructions}`;
  }

  return {
    timesLabel: timesStr,
    frequencyLabel: frequency,
    combinedSummary: combined,
  };
}
