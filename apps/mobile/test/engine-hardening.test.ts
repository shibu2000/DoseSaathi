import { describe, it, expect, beforeEach } from 'bun:test';
import { BunSqliteAdapter } from '../src/database/adapters/bun-adapter';
import { AppDatabase, DEFAULT_WIZARD_DRAFT, type WizardDraft } from '../src/database';
import { HeadlessAlarmAdapter, SchedulerService } from '../src/alarms';

// Fixed clock: 2026-11-09 07:00 in Asia/Kolkata (= 01:30Z). Doses at 08:00 IST are still ahead.
const NOW = new Date('2026-11-09T01:30:00.000Z');

describe('Engine hardening (production gaps)', () => {
  let db: AppDatabase;
  let alarms: HeadlessAlarmAdapter;
  let scheduler: SchedulerService;
  let profileId: string;
  let clockMs: number;

  const draft = (over: Partial<WizardDraft>): WizardDraft => ({
    ...DEFAULT_WIZARD_DRAFT,
    name: 'Med',
    dosageText: '1 tablet',
    fixedTimes: ['08:00'],
    courseType: 'ONGOING',
    hasPrerequisiteCourse: false,
    phaseDelayHours: 0,
    currentStep: 4,
    ...over,
  });

  beforeEach(async () => {
    db = await AppDatabase.initialize(new BunSqliteAdapter(':memory:'));
    db.tz = 'Asia/Kolkata';
    clockMs = NOW.getTime();
    db.clock = () => new Date(clockMs);
    alarms = new HeadlessAlarmAdapter();
    scheduler = new SchedulerService(db, alarms);
    await db.settings.setBoolean('family_sharing_active', true);
    profileId = crypto.randomUUID();
    await db.profiles.create({
      id: profileId,
      displayName: 'Me',
      profileType: 'PERSONAL',
      timezoneId: 'Asia/Kolkata',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  const advance = (ms: number) => (clockMs += ms);

  it('arms the native alarm at the correct local wall-clock instant (08:00 IST = 02:30Z)', async () => {
    await db.createMedicationWithSchedule(draft({ name: 'Metformin' }), profileId);
    const { activeAlarms } = await scheduler.reconcileAlarms();
    expect(activeAlarms[0].scheduledTimestampUtc).toBe('2026-11-09T02:30:00.000Z');
  });

  it('does not invent doses that were already past when the medicine was added', async () => {
    advance(10 * 3600 * 1000); // 17:00 IST, so the 08:00 dose today is in the past
    await db.createMedicationWithSchedule(draft({}), profileId);
    const todays = await db.occurrences.getByDate('2026-11-09');
    expect(todays).toHaveLength(0);
    expect((await db.occurrences.getByDate('2026-11-10')).length).toBe(1);
  });

  it('Taken is idempotent: a replayed tap does not double-count or double-decrement stock', async () => {
    const { medication } = await db.createMedicationWithSchedule(
      draft({ trackStock: true, currentStock: 10, courseType: 'FIXED_DOSES', maxTotalDoses: 5 }),
      profileId
    );
    const occ = (await db.occurrences.getByDate('2026-11-09'))[0];
    const args = { medicationId: medication.id, occurrenceId: occ.id, action: 'TAKEN' as const, actionTimestampUtc: '2026-11-09T02:40:00.000Z' };
    const first = await db.recordDoseAction(args);
    const second = await db.recordDoseAction(args);
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    const med = (await db.medications.getById(medication.id))!;
    expect(med.dosesTakenCount).toBe(1);
    expect(med.currentStock).toBe(9);
    expect(await db.doseLogs.getHistory(medication.id)).toHaveLength(1);
  });

  it('logs the occurrence\'s real scheduled time, not the time the button was tapped', async () => {
    const { medication } = await db.createMedicationWithSchedule(draft({}), profileId);
    const occ = (await db.occurrences.getByDate('2026-11-09'))[0];
    await db.recordDoseAction({ medicationId: medication.id, occurrenceId: occ.id, action: 'TAKEN', actionTimestampUtc: '2026-11-09T04:00:00.000Z' });
    const [log] = await db.doseLogs.getHistory(medication.id);
    expect(log.scheduledAt).toBe('2026-11-09T02:30:00.000Z');
    expect(log.actionTimestamp).toBe('2026-11-09T04:00:00.000Z');
  });

  it('Snooze re-arms the SAME occurrence 10 minutes later and never triggers the dependent dose', async () => {
    const parent = await db.createMedicationWithSchedule(draft({ name: 'A' }), profileId);
    await db.createMedicationWithSchedule(
      draft({ name: 'B', scheduleType: 'SAME_DAY_DEPENDENT', sameDayParentMedicationId: parent.medication.id, sameDayDelayMinutes: 30 }),
      profileId
    );
    const occ = (await db.occurrences.getByDate('2026-11-09'))[0];
    advance(75 * 60 * 1000); // 08:15 IST, dose is due
    const snooze = await db.recordDoseAction({
      medicationId: parent.medication.id, occurrenceId: occ.id, action: 'SNOOZED', actionTimestampUtc: new Date(clockMs).toISOString(),
    });
    expect(snooze.childOccurrenceScheduled).toBe(false);
    const after = (await db.occurrences.getById(occ.id))!;
    expect(after.scheduledAtUtc).toBe('2026-11-09T02:30:00.000Z'); // original time kept for audit
    expect(after.snoozedUntil).toBe('2026-11-09T02:55:00.000Z');
    expect(after.state).toBe('SCHEDULED');

    // The reminder is actually re-armed at the snooze time even though the original time has passed
    const { activeAlarms } = await scheduler.reconcileAlarms();
    expect(activeAlarms.map((a) => a.scheduledTimestampUtc)).toContain('2026-11-09T02:55:00.000Z');
  });

  it('dependent dose starts from the actual taken time (drift), in local time', async () => {
    const parent = await db.createMedicationWithSchedule(draft({ name: 'A' }), profileId);
    const child = await db.createMedicationWithSchedule(
      draft({ name: 'B', scheduleType: 'SAME_DAY_DEPENDENT', sameDayParentMedicationId: parent.medication.id, sameDayDelayMinutes: 30 }),
      profileId
    );
    const occ = (await db.occurrences.getByDate('2026-11-09'))[0];
    const res = await db.recordDoseAction({ medicationId: parent.medication.id, occurrenceId: occ.id, action: 'TAKEN', actionTimestampUtc: '2026-11-09T03:45:00.000Z' }); // 09:15 IST
    expect(res.childOccurrenceScheduled).toBe(true);
    const childOcc = (await db.occurrences.getByDate('2026-11-09')).find((o) => o.medicationId === child.medication.id)!;
    expect(childOcc.scheduledAtUtc).toBe('2026-11-09T04:15:00.000Z');
    expect(childOcc.scheduledLocalTime).toBe('09:45');
    // Replay of the same parent action must not create a second child dose
    await db.recordDoseAction({ medicationId: parent.medication.id, occurrenceId: occ.id, action: 'TAKEN', actionTimestampUtc: '2026-11-09T03:46:00.000Z' });
    expect((await db.occurrences.getByDate('2026-11-09')).filter((o) => o.medicationId === child.medication.id)).toHaveLength(1);
  });

  it('skip honours the prescribed fallback time (local) and the skip-child policy', async () => {
    const parent = await db.createMedicationWithSchedule(draft({ name: 'A' }), profileId);
    const child = await db.createMedicationWithSchedule(
      draft({ name: 'B', scheduleType: 'SAME_DAY_DEPENDENT', sameDayParentMedicationId: parent.medication.id, sameDayDelayMinutes: 30, sameDayFallbackPolicy: 'USE_FALLBACK_TIME', sameDayFallbackTime: '14:00' }),
      profileId
    );
    const occ = (await db.occurrences.getByDate('2026-11-09'))[0];
    const res = await db.recordDoseAction({ medicationId: parent.medication.id, occurrenceId: occ.id, action: 'SKIPPED', actionTimestampUtc: '2026-11-09T02:40:00.000Z', fallbackPolicy: 'USE_FALLBACK_TIME', fallbackTime: '14:00' });
    expect(res.childOccurrenceScheduled).toBe(true);
    const childOcc = (await db.occurrences.getByDate('2026-11-09')).find((o) => o.medicationId === child.medication.id)!;
    expect(childOcc.scheduledAtUtc).toBe('2026-11-09T08:30:00.000Z'); // 14:00 IST
  });

  it('rejects dependency cycles and endless prerequisites', async () => {
    const a = await db.createMedicationWithSchedule(draft({ name: 'A', courseType: 'FIXED_DAYS', maxDurationDays: 3 }), profileId);
    const b = await db.createMedicationWithSchedule(
      draft({ name: 'B', hasPrerequisiteCourse: true, prerequisiteMedicationId: a.medication.id, courseType: 'FIXED_DAYS', maxDurationDays: 2 }),
      profileId
    );
    // A cannot start after B (B already waits on A)
    await expect(
      db.createMedicationWithSchedule(
        draft({ name: 'A', editingMedicationId: a.medication.id, courseType: 'FIXED_DAYS', maxDurationDays: 3, hasPrerequisiteCourse: true, prerequisiteMedicationId: b.medication.id }),
        profileId
      )
    ).rejects.toThrow(/wait on each other/);
    // A follow-up of an ongoing medicine would never start
    const ongoing = await db.createMedicationWithSchedule(draft({ name: 'Ongoing' }), profileId);
    await expect(
      db.createMedicationWithSchedule(draft({ name: 'C', hasPrerequisiteCourse: true, prerequisiteMedicationId: ongoing.medication.id }), profileId)
    ).rejects.toThrow(/never start/);
  });

  it('editing replaces the schedule without duplicating rows or losing history', async () => {
    const { medication } = await db.createMedicationWithSchedule(draft({ fixedTimes: ['08:00', '20:00'] }), profileId);
    await db.createMedicationWithSchedule(draft({ editingMedicationId: medication.id, fixedTimes: ['09:00'] }), profileId);
    const rows = await db.connection.all(`SELECT * FROM medication_schedules WHERE medication_id = ?;`, [medication.id]);
    expect(rows).toHaveLength(1);
    const todays = await db.occurrences.getByDate('2026-11-09');
    expect(todays.map((o) => o.scheduledLocalTime)).toEqual(['09:00']);
  });

  describe('calendar-day completion (works while the phone was off)', () => {
    it('retires FIXED_DAYS at the day boundary regardless of missed doses and activates every follow-up', async () => {
      const a = await db.createMedicationWithSchedule(draft({ name: 'A', courseType: 'FIXED_DAYS', maxDurationDays: 3 }), profileId);
      const b = await db.createMedicationWithSchedule(draft({ name: 'B', fixedTimes: ['08:00'], hasPrerequisiteCourse: true, prerequisiteMedicationId: a.medication.id, courseType: 'FIXED_DAYS', maxDurationDays: 7 }), profileId);
      const c = await db.createMedicationWithSchedule(draft({ name: 'C', fixedTimes: ['21:00'], hasPrerequisiteCourse: true, prerequisiteMedicationId: a.medication.id }), profileId);
      expect((await db.medications.getById(b.medication.id))!.lifecycleStatus).toBe('QUEUED_PHASE');

      // Nothing happens on day 3
      advance(2 * 24 * 3600 * 1000);
      expect(await db.completeDueCalendarCourses()).toHaveLength(0);

      // The phone was off for the boundary: next launch is on day 5
      advance(2 * 24 * 3600 * 1000);
      const done = await db.completeDueCalendarCourses();
      expect(done).toHaveLength(1);
      expect(done[0].activatedNames.sort()).toEqual(['B', 'C']);

      expect((await db.medications.getById(a.medication.id))!.lifecycleStatus).toBe('COMPLETED');
      expect((await db.medications.getById(b.medication.id))!.lifecycleStatus).toBe('ACTIVE');
      expect((await db.medications.getById(c.medication.id))!.lifecycleStatus).toBe('ACTIVE');
      // Exactly once
      expect(await db.completeDueCalendarCourses()).toHaveLength(0);

      // A has no future alarms; B/C do
      const { activeAlarms } = await scheduler.reconcileAlarms();
      const names = activeAlarms.map((x) => x.title);
      expect(names.some((n) => n.includes('A'))).toBe(false);
      expect(names.some((n) => n.includes(': B'))).toBe(true);
      expect(names.some((n) => n.includes(': C'))).toBe(true);
    });

    it('follow-ups never ring before the prerequisite ends, and are pre-armed from the day it does', async () => {
      const a = await db.createMedicationWithSchedule(draft({ name: 'A', courseType: 'FIXED_DAYS', maxDurationDays: 3 }), profileId);
      await db.createMedicationWithSchedule(draft({ name: 'B', hasPrerequisiteCourse: true, prerequisiteMedicationId: a.medication.id }), profileId);
      const { activeAlarms } = await scheduler.reconcileAlarms();
      const b = activeAlarms.filter((x) => x.title.endsWith(': B')).map((x) => x.scheduledTimestampUtc);
      // A runs 9, 10, 11 Nov (IST). B must first ring on 12 Nov 08:00 IST = 02:30Z, never earlier.
      expect(b.length).toBeGreaterThan(0);
      expect(b[0]).toBe('2026-11-12T02:30:00.000Z');
      // And A stops after its third day
      const aTimes = activeAlarms.filter((x) => x.title.endsWith(': A')).map((x) => x.scheduledTimestampUtc);
      expect(aTimes).toEqual(['2026-11-09T02:30:00.000Z', '2026-11-10T02:30:00.000Z', '2026-11-11T02:30:00.000Z']);
    });

    it('a pre-armed follow-up alarm resolves to a real dose when the app next runs (same occurrence id)', async () => {
      const a = await db.createMedicationWithSchedule(draft({ name: 'A', courseType: 'FIXED_DAYS', maxDurationDays: 3 }), profileId);
      const b = await db.createMedicationWithSchedule(draft({ name: 'B', hasPrerequisiteCourse: true, prerequisiteMedicationId: a.medication.id }), profileId);
      const before = await scheduler.reconcileAlarms();
      const predicted = before.activeAlarms.find((x) => x.title.endsWith(': B'))!;
      expect(await db.occurrences.getById(predicted.occurrenceId)).toBeNull(); // only predicted so far

      // Day 4, 08:05 IST: the alarm has just rung, the user opens the app for the first time in days
      clockMs = new Date('2026-11-12T02:35:00.000Z').getTime();
      await scheduler.reconcileAlarms();
      const real = await db.occurrences.getById(predicted.occurrenceId);
      expect(real).not.toBeNull();
      expect(real!.scheduledAtUtc).toBe(predicted.scheduledTimestampUtc);
      const taken = await db.recordDoseAction({ medicationId: b.medication.id, occurrenceId: real!.id, action: 'TAKEN', actionTimestampUtc: new Date(clockMs).toISOString() });
      expect(taken.applied).toBe(true);
    });

    it('chains predictions through several calendar phases and honours the phase delay', async () => {
      const a = await db.createMedicationWithSchedule(draft({ name: 'A', courseType: 'FIXED_DAYS', maxDurationDays: 2 }), profileId);
      const b = await db.createMedicationWithSchedule(draft({ name: 'B', hasPrerequisiteCourse: true, prerequisiteMedicationId: a.medication.id, courseType: 'FIXED_DAYS', maxDurationDays: 2, phaseDelayHours: 24 }), profileId);
      await db.createMedicationWithSchedule(draft({ name: 'C', hasPrerequisiteCourse: true, prerequisiteMedicationId: b.medication.id }), profileId);
      const { activeAlarms } = await scheduler.reconcileAlarms();
      const first = (n: string) => activeAlarms.filter((x) => x.title.endsWith(': ' + n))[0]?.scheduledTimestampUtc;
      // A: 9-10 Nov. Ends 11 Nov 00:00 IST. +24 h delay -> B starts 12 Nov 00:00 IST, rings 12 and 13 Nov.
      expect(first('B')).toBe('2026-11-12T02:30:00.000Z');
      // B ends 14 Nov 00:00 IST -> C from 14 Nov 08:00 IST
      expect(first('C')).toBe('2026-11-14T02:30:00.000Z');
    });

    it('does not predict follow-ups of a dose-count course (its end is unknown)', async () => {
      const a = await db.createMedicationWithSchedule(draft({ name: 'A', courseType: 'FIXED_DOSES', maxTotalDoses: 4 }), profileId);
      await db.createMedicationWithSchedule(draft({ name: 'B', hasPrerequisiteCourse: true, prerequisiteMedicationId: a.medication.id }), profileId);
      const { activeAlarms } = await scheduler.reconcileAlarms();
      expect(activeAlarms.some((x) => x.title.endsWith(': B'))).toBe(false);
    });

    it('keeps reminders armed for two weeks, so days without opening the app do not silence them', async () => {
      await db.createMedicationWithSchedule(draft({ name: 'Daily' }), profileId);
      const { activeAlarms } = await scheduler.reconcileAlarms();
      const days = new Set(activeAlarms.map((x) => x.scheduledTimestampUtc.slice(0, 10)));
      expect(days.size).toBeGreaterThanOrEqual(14);
    });
  });

  it('final-dose completion + Undo restores prerequisite, queued follow-ups, count and stock', async () => {
    const a = await db.createMedicationWithSchedule(
      draft({ name: 'A', courseType: 'FIXED_DOSES', maxTotalDoses: 1, trackStock: true, currentStock: 4 }),
      profileId
    );
    const b = await db.createMedicationWithSchedule(draft({ name: 'B', hasPrerequisiteCourse: true, prerequisiteMedicationId: a.medication.id }), profileId);
    const occ = (await db.occurrences.getByDate('2026-11-09'))[0];
    const taken = await db.recordDoseAction({ medicationId: a.medication.id, occurrenceId: occ.id, action: 'TAKEN', actionTimestampUtc: '2026-11-09T02:40:00.000Z' });
    expect(taken.courseCompleted).toBe(true);
    expect(taken.activatedMedicationNames).toEqual(['B']);
    expect((await db.medications.getById(b.medication.id))!.lifecycleStatus).toBe('ACTIVE');

    const undo = await db.undoCourseCompletion({ transitionEventId: taken.transitionEventId!, courseId: a.medication.id, currentTimestampUtc: '2026-11-09T02:43:00.000Z' });
    expect(undo.success).toBe(true);
    const restoredA = (await db.medications.getById(a.medication.id))!;
    expect(restoredA.lifecycleStatus).toBe('ACTIVE');
    expect(restoredA.dosesTakenCount).toBe(0);
    expect(restoredA.currentStock).toBe(4);
    expect((await db.medications.getById(b.medication.id))!.lifecycleStatus).toBe('QUEUED_PHASE');
    expect((await db.occurrences.getById(occ.id))!.state).toBe('SCHEDULED');

    // double-tap undo is rejected, never applied twice
    const again = await db.undoCourseCompletion({ transitionEventId: taken.transitionEventId!, courseId: a.medication.id, currentTimestampUtc: '2026-11-09T02:44:00.000Z' });
    expect(again.success).toBe(false);
  });

  it('undo after the 5-minute window is rejected', async () => {
    const a = await db.createMedicationWithSchedule(draft({ name: 'A', courseType: 'FIXED_DOSES', maxTotalDoses: 1 }), profileId);
    const occ = (await db.occurrences.getByDate('2026-11-09'))[0];
    const taken = await db.recordDoseAction({ medicationId: a.medication.id, occurrenceId: occ.id, action: 'TAKEN', actionTimestampUtc: '2026-11-09T02:40:00.000Z' });
    const undo = await db.undoCourseCompletion({ transitionEventId: taken.transitionEventId!, courseId: a.medication.id, currentTimestampUtc: '2026-11-09T02:46:00.000Z' });
    expect(undo.success).toBe(false);
  });

  it('marks doses nobody acknowledged for 30 minutes as "not confirmed" (never "missed") and still accepts a late Taken', async () => {
    const { medication } = await db.createMedicationWithSchedule(draft({ trackStock: true, currentStock: 5 }), profileId);
    const occ = (await db.occurrences.getByDate('2026-11-09'))[0];

    advance(60 * 60 * 1000 + 29 * 60 * 1000); // 08:29 IST: 29 minutes after the dose time
    expect(await db.markUnconfirmedDoses()).toHaveLength(0);

    advance(2 * 60 * 1000); // 08:31 IST
    expect(await db.markUnconfirmedDoses()).toHaveLength(1);
    expect(await db.markUnconfirmedDoses()).toHaveLength(0); // once only
    expect((await db.occurrences.getById(occ.id))!.state).toBe('UNCONFIRMED');
    const events = (await db.outbox.getAllUnsynced()).map((e) => e.eventType);
    expect(events).toContain('DOSE_NOT_CONFIRMED');
    // unconfirmed does not consume stock
    expect((await db.medications.getById(medication.id))!.currentStock).toBe(5);

    const late = await db.recordDoseAction({ medicationId: medication.id, occurrenceId: occ.id, action: 'TAKEN', actionTimestampUtc: new Date(clockMs).toISOString() });
    expect(late.applied).toBe(true);
    expect((await db.medications.getById(medication.id))!.currentStock).toBe(4);
  });

  it('reports low stock once when supply drops to five days or less, from the real schedule', async () => {
    const { medication } = await db.createMedicationWithSchedule(
      draft({ fixedTimes: ['08:00', '20:00'], trackStock: true, currentStock: 11, lowStockThreshold: 5 }),
      profileId
    );
    const occs = await db.occurrences.getByDate('2026-11-09');
    const r1 = await db.recordDoseAction({ medicationId: medication.id, occurrenceId: occs[0].id, action: 'TAKEN', actionTimestampUtc: '2026-11-09T02:40:00.000Z' });
    // 10 tablets at 2/day = 5 days remaining -> low
    expect(r1.lowStock?.name).toBe('Med');
    const r2 = await db.recordDoseAction({ medicationId: medication.id, occurrenceId: occs[1].id, action: 'TAKEN', actionTimestampUtc: '2026-11-09T14:40:00.000Z' });
    expect(r2.lowStock).toBeNull; // already notified
    expect(r2.lowStock ?? null).toBeNull();
  });

  it('Personal Mode queues nothing for the cloud (zero server load until a caregiver is linked)', async () => {
    await db.settings.setBoolean('family_sharing_active', false);
    const { medication } = await db.createMedicationWithSchedule(draft({}), profileId);
    const occ = (await db.occurrences.getByDate('2026-11-09'))[0];
    await db.recordDoseAction({ medicationId: medication.id, occurrenceId: occ.id, action: 'TAKEN', actionTimestampUtc: '2026-11-09T02:40:00.000Z' });
    expect(await db.outbox.getAllUnsynced()).toHaveLength(0);
  });

  it('ensurePrimaryProfile never seeds a fake patient or medicines', async () => {
    const fresh = await AppDatabase.initialize(new BunSqliteAdapter(':memory:'));
    await fresh.ensurePrimaryProfile();
    expect((await fresh.profiles.getPrimary())!.displayName).toBe('Me');
    expect(await fresh.medications.getAll()).toHaveLength(0);
  });
});
