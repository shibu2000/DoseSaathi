import { describe, expect, it } from 'bun:test';
import type { Medication, Schedule } from '@medchain/contracts';
import {
  generateOccurrencesForRange,
  evaluateDependentDose,
  isCourseComplete,
  completeCourseAndFanOut,
  undoCourseTransition,
  calculateStockAfterAction,
  forecastMedicationStock,
  isDayOnInCycle,
  generateIntervalTimes,
} from '../src';

describe('Domain Engine Tests (DOM-01 to DOM-17)', () => {
  const baseMedication: Medication = {
    id: '11111111-1111-4111-8111-111111111111',
    profileId: '00000000-0000-4000-8000-000000000000',
    name: 'Metformin',
    dosageText: '500 mg',
    doseQuantity: 1,
    doseUnit: 'tablet',
    lifecycleStatus: 'ACTIVE',
    courseType: 'ONGOING',
    courseStartAt: '2026-11-01T08:00:00.000Z',
    dosesTakenCount: 0,
    trackStock: true,
    currentStock: 30,
    lowStockThreshold: 5,
    version: 1,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  };

  const baseSchedule: Schedule = {
    id: '22222222-2222-4222-8222-222222222222',
    medicationId: baseMedication.id,
    scheduleType: 'FIXED_TIMES',
    recurrenceType: 'DAILY',
    startDate: '2026-11-01',
    timezoneId: 'America/New_York',
    fixedTimes: ['08:00'],
    activeWeekdays: [],
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  };

  it('DOM-01: Single fixed-time daily (e.g. 08:00)', () => {
    const occurrences = generateOccurrencesForRange({
      medication: baseMedication,
      schedule: baseSchedule,
      fromLocalDate: '2026-11-01',
      toLocalDate: '2026-11-03',
    });
    expect(occurrences).toHaveLength(3);
    expect(occurrences.map((o) => o.scheduledLocalTime)).toEqual(['08:00', '08:00', '08:00']);
  });

  it('DOM-02: Multiple fixed-times daily (08:00, 14:00, 20:00)', () => {
    const schedule: Schedule = {
      ...baseSchedule,
      fixedTimes: ['20:00', '08:00', '14:00'], // Unsorted input
    };
    const occurrences = generateOccurrencesForRange({
      medication: baseMedication,
      schedule,
      fromLocalDate: '2026-11-01',
      toLocalDate: '2026-11-01',
    });
    expect(occurrences).toHaveLength(3);
    expect(occurrences.map((o) => o.scheduledLocalTime)).toEqual(['08:00', '14:00', '20:00']);
  });

  it('DOM-03: Selected weekdays (Mon, Wed, Fri)', () => {
    // 2026-11-02 is Monday (1), 2026-11-03 is Tuesday (2), 2026-11-04 is Wednesday (3)
    const schedule: Schedule = {
      ...baseSchedule,
      recurrenceType: 'SPECIFIC_DAYS',
      activeWeekdays: [1, 3, 5],
    };
    const occurrences = generateOccurrencesForRange({
      medication: baseMedication,
      schedule,
      fromLocalDate: '2026-11-02',
      toLocalDate: '2026-11-04',
    });
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((o) => o.scheduledLocalDate)).toEqual(['2026-11-02', '2026-11-04']);
  });

  it('DOM-04: Cyclical ON/OFF (21 days ON, 7 days OFF)', () => {
    const anchor = '2026-11-01';
    // Day 0 to 20 = ON (21 days)
    // Day 21 to 27 = OFF (7 days)
    expect(isDayOnInCycle('2026-11-01', anchor, 21, 7)).toBe(true);  // Day 0: ON
    expect(isDayOnInCycle('2026-11-21', anchor, 21, 7)).toBe(true);  // Day 20: ON
    expect(isDayOnInCycle('2026-11-22', anchor, 21, 7)).toBe(false); // Day 21: OFF
    expect(isDayOnInCycle('2026-11-28', anchor, 21, 7)).toBe(false); // Day 27: OFF
    expect(isDayOnInCycle('2026-11-29', anchor, 21, 7)).toBe(true);  // Day 28: New cycle ON
  });

  it('DOM-05: Repeating interval (every 6 hours from 08:00)', () => {
    const times = generateIntervalTimes('08:00', 6);
    expect(times).toEqual(['08:00', '14:00', '20:00']);
  });

  it('DOM-06: Same-day dependent dose (30m after parent taken)', () => {
    const res = evaluateDependentDose({
      parentAction: 'TAKEN',
      parentActionTimestamp: '2026-11-08T08:15:00.000Z',
      parentScheduledDate: '2026-11-08',
      delayMinutes: 30,
      timezoneId: 'America/New_York',
    });
    expect(res.action).toBe('SCHEDULE');
    expect(res.scheduledAtUtc).toBe('2026-11-08T08:45:00.000Z');
  });

  it('DOM-07: Parent dose Snoozed (10 minutes) protects dependent dose', () => {
    const res = evaluateDependentDose({
      parentAction: 'SNOOZED',
      parentActionTimestamp: '2026-11-08T08:00:00.000Z',
      parentScheduledDate: '2026-11-08',
      delayMinutes: 30,
      timezoneId: 'America/New_York',
    });
    expect(res.action).toBe('DO_NOTHING');
    expect(res.scheduledAtUtc).toBeUndefined();
  });

  it('DOM-08: Parent dose Skipped (with skip-child policy)', () => {
    const res = evaluateDependentDose({
      parentAction: 'SKIPPED',
      parentActionTimestamp: '2026-11-08T08:00:00.000Z',
      parentScheduledDate: '2026-11-08',
      delayMinutes: 30,
      fallbackPolicy: 'SKIP_CHILD',
      timezoneId: 'America/New_York',
    });
    expect(res.action).toBe('SKIP_CHILD');
  });

  it('DOM-09: Parent dose Skipped (with prescribed fallback time)', () => {
    const res = evaluateDependentDose({
      parentAction: 'SKIPPED',
      parentActionTimestamp: '2026-11-08T08:00:00.000Z',
      parentScheduledDate: '2026-11-08',
      delayMinutes: 30,
      fallbackPolicy: 'USE_FALLBACK_TIME',
      fallbackTime: '14:00',
      timezoneId: 'America/New_York',
    });
    expect(res.action).toBe('SCHEDULE');
    // 14:00 local on 8 Nov in New York (EST, UTC-5) is 19:00Z
    expect(res.scheduledAtUtc).toBe('2026-11-08T19:00:00.000Z');
  });

  it('DOM-10: Fixed-dose completion (10 doses)', () => {
    const med: Medication = {
      ...baseMedication,
      courseType: 'FIXED_DOSES',
      maxTotalDoses: 10,
      dosesTakenCount: 9,
    };
    expect(isCourseComplete({ medication: med, currentLocalDate: '2026-11-08' })).toBe(false);

    const completedMed = { ...med, dosesTakenCount: 10 };
    expect(isCourseComplete({ medication: completedMed, currentLocalDate: '2026-11-08' })).toBe(true);
  });

  it('DOM-11: Fixed-day completion (7 days)', () => {
    const med: Medication = {
      ...baseMedication,
      courseType: 'FIXED_DAYS',
      courseStartAt: '2026-11-01T08:00:00.000Z',
      maxDurationDays: 7,
    };
    // Day 6 (2026-11-07): 6 elapsed days -> not complete
    expect(isCourseComplete({ medication: med, currentLocalDate: '2026-11-07' })).toBe(false);
    // Day 7 (2026-11-08): 7 elapsed days -> complete
    expect(isCourseComplete({ medication: med, currentLocalDate: '2026-11-08' })).toBe(true);
  });

  it('DOM-12: Course completion 1-to-many fan-out and DOM-13: phase delay', () => {
    const parentMed: Medication = {
      ...baseMedication,
      id: 'parent-1',
      courseType: 'FIXED_DOSES',
      maxTotalDoses: 5,
      dosesTakenCount: 5,
      lifecycleStatus: 'ACTIVE',
    };

    const childB: Medication = {
      ...baseMedication,
      id: 'child-b',
      name: 'Med B',
      lifecycleStatus: 'QUEUED_PHASE',
    };

    const childC: Medication = {
      ...baseMedication,
      id: 'child-c',
      name: 'Med C',
      lifecycleStatus: 'QUEUED_PHASE',
    };

    const fanout = completeCourseAndFanOut({
      parentMedication: parentMed,
      queuedChildren: [childB, childC],
      dependencyLinks: [
        { parentMedicationId: 'parent-1', childMedicationId: 'child-b', phaseDelayHours: 0 },
        { parentMedicationId: 'parent-1', childMedicationId: 'child-c', phaseDelayHours: 24 },
      ],
      completionTimestampUtc: '2026-11-08T12:00:00.000Z',
      transitionEventId: 'trans-123',
    });

    expect(fanout.updatedParent.lifecycleStatus).toBe('COMPLETED');
    expect(fanout.activatedChildren).toHaveLength(2);
    expect(fanout.activatedChildren[0].lifecycleStatus).toBe('ACTIVE');
    expect(fanout.activatedChildren[0].courseStartAt).toBe('2026-11-08T12:00:00.000Z');
    // Child C starts 24h later
    expect(fanout.activatedChildren[1].courseStartAt).toBe('2026-11-09T12:00:00.000Z');
    // Transition event records 5-minute undo
    expect(fanout.transitionEvent.undoUntil).toBe('2026-11-08T12:05:00.000Z');
  });

  it('DOM-14: 5-minute atomic Undo restores state', () => {
    const parentMed: Medication = {
      ...baseMedication,
      id: 'parent-1',
      lifecycleStatus: 'ACTIVE',
    };

    const childB: Medication = {
      ...baseMedication,
      id: 'child-b',
      lifecycleStatus: 'QUEUED_PHASE',
    };

    const fanout = completeCourseAndFanOut({
      parentMedication: parentMed,
      queuedChildren: [childB],
      dependencyLinks: [{ parentMedicationId: 'parent-1', childMedicationId: 'child-b' }],
      completionTimestampUtc: '2026-11-08T12:00:00.000Z',
      transitionEventId: 'trans-123',
    });

    // Undo within 2 minutes
    const undoRes = undoCourseTransition({
      transitionEvent: fanout.transitionEvent,
      currentTimestampUtc: '2026-11-08T12:02:00.000Z',
      currentParent: fanout.updatedParent,
      currentChildren: fanout.activatedChildren,
    });

    expect(undoRes.success).toBe(true);
    expect(undoRes.restoredParent?.lifecycleStatus).toBe('ACTIVE');
    expect(undoRes.restoredChildren?.[0].lifecycleStatus).toBe('QUEUED_PHASE');
  });

  it('DOM-15: Undo attempt after 5 minutes is rejected', () => {
    const parentMed: Medication = {
      ...baseMedication,
      id: 'parent-1',
      lifecycleStatus: 'ACTIVE',
    };

    const fanout = completeCourseAndFanOut({
      parentMedication: parentMed,
      queuedChildren: [],
      dependencyLinks: [],
      completionTimestampUtc: '2026-11-08T12:00:00.000Z',
      transitionEventId: 'trans-123',
    });

    // Undo 6 minutes later
    const undoRes = undoCourseTransition({
      transitionEvent: fanout.transitionEvent,
      currentTimestampUtc: '2026-11-08T12:06:00.000Z',
      currentParent: fanout.updatedParent,
      currentChildren: [],
    });

    expect(undoRes.success).toBe(false);
    expect(undoRes.reason).toContain('expired');
  });

  it('DOM-16: Inventory decrement on TAKEN only', () => {
    const med: Medication = {
      ...baseMedication,
      trackStock: true,
      currentStock: 10,
      doseQuantity: 2,
    };

    const takenRes = calculateStockAfterAction({
      medication: med,
      actionTaken: 'TAKEN',
    });
    expect(takenRes.stockDecremented).toBe(true);
    expect(takenRes.updatedStock).toBe(8);

    const skippedRes = calculateStockAfterAction({
      medication: med,
      actionTaken: 'SKIPPED',
    });
    expect(skippedRes.stockDecremented).toBe(false);
    expect(skippedRes.updatedStock).toBe(10);
  });

  it('DOM-17: Low-stock calculation at <= 5 days threshold', () => {
    // Daily schedule of 2 tablets per intake, 1 intake per day = 2 tablets/day
    const med: Medication = {
      ...baseMedication,
      trackStock: true,
      currentStock: 10, // 10 tablets / 2 = 5 days remaining
      doseQuantity: 2,
      lowStockThreshold: 5,
    };

    const forecast = forecastMedicationStock({
      medication: med,
      schedule: baseSchedule,
      currentLocalDate: '2026-11-01',
    });

    expect(forecast.isLowStock).toBe(true);
    expect(forecast.daysRemaining).toBe(5);

    // If stock is 12 -> 6 days remaining -> not low stock
    const forecastSafe = forecastMedicationStock({
      medication: { ...med, currentStock: 12 },
      schedule: baseSchedule,
      currentLocalDate: '2026-11-01',
    });
    expect(forecastSafe.isLowStock).toBe(false);
    expect(forecastSafe.daysRemaining).toBe(6);
  });
});
