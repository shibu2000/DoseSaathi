import { describe, it, expect } from 'bun:test';
import { formatTime12h, formatSchedule } from '../src/utils/schedule-formatter';
import type { Schedule } from '@medchain/contracts';

describe('schedule-formatter', () => {
  it('formats 24h times to 12h AM/PM properly', () => {
    expect(formatTime12h('08:00')).toBe('8:00 AM');
    expect(formatTime12h('12:00')).toBe('12:00 PM');
    expect(formatTime12h('14:30')).toBe('2:30 PM');
    expect(formatTime12h('20:00')).toBe('8:00 PM');
    expect(formatTime12h('00:15')).toBe('12:15 AM');
  });

  it('formats daily fixed times schedule', () => {
    const s: Schedule = {
      id: 's1',
      medicationId: 'm1',
      scheduleType: 'FIXED_TIMES',
      recurrenceType: 'DAILY',
      startDate: '2026-11-11',
      timezoneId: 'UTC',
      fixedTimes: ['08:00', '20:00'],
      activeWeekdays: [],
      createdAt: '2026-11-11T00:00:00Z',
      updatedAt: '2026-11-11T00:00:00Z',
    };
    const res = formatSchedule(s, 'Take with food');
    expect(res.timesLabel).toBe('8:00 AM, 8:00 PM');
    expect(res.frequencyLabel).toBe('Every day');
    expect(res.combinedSummary).toBe('8:00 AM, 8:00 PM • Take with food');
  });

  it('formats specific days schedule', () => {
    const s: Schedule = {
      id: 's2',
      medicationId: 'm2',
      scheduleType: 'FIXED_TIMES',
      recurrenceType: 'SPECIFIC_DAYS',
      startDate: '2026-11-11',
      timezoneId: 'UTC',
      fixedTimes: ['09:00'],
      activeWeekdays: [1, 3, 5], // Mon, Wed, Fri
      createdAt: '2026-11-11T00:00:00Z',
      updatedAt: '2026-11-11T00:00:00Z',
    };
    const res = formatSchedule(s);
    expect(res.timesLabel).toBe('9:00 AM');
    expect(res.frequencyLabel).toBe('Mon, Wed, Fri');
    expect(res.combinedSummary).toBe('9:00 AM • Mon, Wed, Fri');
  });

  it('formats interval schedule', () => {
    const s: Schedule = {
      id: 's3',
      medicationId: 'm3',
      scheduleType: 'INTERVAL',
      recurrenceType: 'DAILY',
      startDate: '2026-11-11',
      timezoneId: 'UTC',
      fixedTimes: [],
      activeWeekdays: [],
      intervalHours: 6,
      intervalFirstTime: '08:00',
      createdAt: '2026-11-11T00:00:00Z',
      updatedAt: '2026-11-11T00:00:00Z',
    };
    const res = formatSchedule(s);
    expect(res.timesLabel).toBe('Every 6 hrs');
    expect(res.frequencyLabel).toBe('From 8:00 AM');
    expect(res.combinedSummary).toBe('Every 6 hrs (from 8:00 AM)');
  });

  it('formats same-day dependent schedule', () => {
    const s: Schedule = {
      id: 's4',
      medicationId: 'm4',
      scheduleType: 'SAME_DAY_DEPENDENT',
      recurrenceType: 'DAILY',
      startDate: '2026-11-11',
      timezoneId: 'UTC',
      fixedTimes: [],
      activeWeekdays: [],
      createdAt: '2026-11-11T00:00:00Z',
      updatedAt: '2026-11-11T00:00:00Z',
      ...({ delayMinutes: 30 } as any),
    };
    const res = formatSchedule(s, null, 'Metformin');
    expect(res.timesLabel).toBe('30m delay');
    expect(res.frequencyLabel).toBe('After Metformin');
    expect(res.combinedSummary).toBe('30 min after taking Metformin');
  });
});
