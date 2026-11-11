export interface PlannedOccurrence {
  occurrenceId: string;
  medicationId: string;
  scheduledLocalDate: string; // 'YYYY-MM-DD'
  scheduledLocalTime: string; // 'HH:MM'
  scheduledAtUtc: string;     // ISO 8601 UTC
  timezoneId: string;
}

export type WeekdayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = Monday, 7 = Sunday
