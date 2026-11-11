import { describe, expect, it } from 'bun:test';
import type { Medication, Schedule } from '@medchain/contracts';
import {
  zonedDateTimeToUtc,
  utcToZonedParts,
  localDateInZone,
  generateOccurrencesForRange,
  isCourseComplete,
  fixedDaysCompletionInstant,
} from '../src';

const med: Medication = {
  id: '11111111-1111-4111-8111-111111111111',
  profileId: '00000000-0000-4000-8000-000000000000',
  name: 'Test',
  dosageText: '1 tablet',
  doseQuantity: 1,
  doseUnit: 'tablet',
  lifecycleStatus: 'ACTIVE',
  courseType: 'ONGOING',
  courseStartAt: '2026-03-01T00:00:00.000Z',
  dosesTakenCount: 0,
  trackStock: false,
  currentStock: 0,
  lowStockThreshold: 5,
  version: 1,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};
const sched = (tz: string, times = ['08:00']): Schedule => ({
  id: '22222222-2222-4222-8222-222222222222',
  medicationId: med.id,
  scheduleType: 'FIXED_TIMES',
  recurrenceType: 'DAILY',
  startDate: '2026-03-01',
  timezoneId: tz,
  fixedTimes: times,
  activeWeekdays: [],
  createdAt: med.createdAt,
  updatedAt: med.createdAt,
});

describe('time-zone correctness', () => {
  it('08:00 in Asia/Kolkata is 02:30Z (not 08:00Z)', () => {
    expect(zonedDateTimeToUtc('2026-11-09', '08:00', 'Asia/Kolkata')).toBe('2026-11-09T02:30:00.000Z');
  });

  it('respects DST offsets (New York summer vs winter)', () => {
    expect(zonedDateTimeToUtc('2026-07-01', '08:00', 'America/New_York')).toBe('2026-07-01T12:00:00.000Z');
    expect(zonedDateTimeToUtc('2026-12-01', '08:00', 'America/New_York')).toBe('2026-12-01T13:00:00.000Z');
  });

  it('keeps the same local time across the spring-forward boundary', () => {
    const occ = generateOccurrencesForRange({
      medication: med,
      schedule: sched('America/New_York'),
      fromLocalDate: '2026-03-07',
      toLocalDate: '2026-03-09',
    });
    expect(occ.map((o) => o.scheduledAtUtc)).toEqual([
      '2026-03-07T13:00:00.000Z', // EST
      '2026-03-08T12:00:00.000Z', // EDT after 02:00 jump
      '2026-03-09T12:00:00.000Z',
    ]);
    expect(occ.every((o) => o.scheduledLocalTime === '08:00')).toBe(true);
  });

  it('round-trips instants to local parts', () => {
    expect(utcToZonedParts('2026-11-09T02:30:00.000Z', 'Asia/Kolkata')).toMatchObject({ date: '2026-11-09', time: '08:00' });
    expect(localDateInZone('2026-11-09T22:00:00.000Z', 'Asia/Kolkata')).toBe('2026-11-10');
  });

  it('does not create doses that were already in the past when the course began', () => {
    const started: Medication = { ...med, courseStartAt: '2026-11-09T09:00:00.000Z' }; // 14:30 IST
    const occ = generateOccurrencesForRange({
      medication: started,
      schedule: { ...sched('Asia/Kolkata', ['08:00', '21:00']), startDate: '2026-11-09' },
      fromLocalDate: '2026-11-09',
      toLocalDate: '2026-11-09',
    });
    expect(occ.map((o) => o.scheduledLocalTime)).toEqual(['21:00']);
  });
});

describe('FIXED_DAYS calendar boundary', () => {
  const course: Medication = { ...med, courseType: 'FIXED_DAYS', maxDurationDays: 3, courseStartAt: '2026-11-09T02:00:00.000Z' };

  it('stops generating doses after day N regardless of missed doses', () => {
    const occ = generateOccurrencesForRange({
      medication: course,
      schedule: { ...sched('Asia/Kolkata'), startDate: '2026-11-09' },
      fromLocalDate: '2026-11-09',
      toLocalDate: '2026-11-20',
    });
    expect(occ.map((o) => o.scheduledLocalDate)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11']);
  });

  it('completes at local midnight after the last day', () => {
    expect(fixedDaysCompletionInstant(course, 'Asia/Kolkata')).toBe('2026-11-11T18:30:00.000Z'); // 12 Nov 00:00 IST
    expect(isCourseComplete({ medication: course, currentLocalDate: '2026-11-11', timezoneId: 'Asia/Kolkata' })).toBe(false);
    expect(isCourseComplete({ medication: course, currentLocalDate: '2026-11-12', timezoneId: 'Asia/Kolkata' })).toBe(true);
  });
});
