import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { BunSqliteAdapter } from '../src/database/adapters/bun-adapter';
import { AppDatabase, DEFAULT_WIZARD_DRAFT, type WizardDraft } from '../src/database';
import { HeadlessAlarmAdapter, SchedulerService } from '../src/alarms';
import {
  applyPendingAlarmActions,
  __setAlarmQueueForTests,
  type AlarmQueueNative,
} from '../src/alarms/pending-actions';
import type { PendingAlarmAction } from '../modules/medchain-alarm/src';

// 2026-11-09 07:00 IST (= 01:30Z). Doses at 08:00 IST are 02:30Z.
const NOW = new Date('2026-11-09T01:30:00.000Z');
const DAY = 24 * 3600 * 1000;

/** In-memory stand-in for the native SharedPreferences queue. */
class FakeQueue implements AlarmQueueNative {
  items: PendingAlarmAction[] = [];
  onRead: (() => void) | null = null;
  push(a: Omit<PendingAlarmAction, 'id'>) {
    this.items.push({ id: crypto.randomUUID(), ...a });
  }
  getPendingAlarmActions() {
    const snapshot = [...this.items];
    this.onRead?.();
    return snapshot;
  }
  ackPendingAlarmActions(ids: string[]) {
    this.items = this.items.filter((i) => !ids.includes(i.id));
  }
}

describe('Native alarm-screen actions (queue saved by the app)', () => {
  let db: AppDatabase;
  let scheduler: SchedulerService;
  let queue: FakeQueue;
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
    scheduler = new SchedulerService(db, new HeadlessAlarmAdapter());
    queue = new FakeQueue();
    __setAlarmQueueForTests(queue);
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

  afterEach(() => __setAlarmQueueForTests(null));

  it('a Taken tapped on the lock screen is saved by reconcile before the dose can be flagged missed', async () => {
    const med = await db.createMedicationWithSchedule(draft({ name: 'A' }), profileId);
    const occ = (await db.occurrences.getByDate('2026-11-09'))[0];
    clockMs = new Date('2026-11-09T02:31:00.000Z').getTime(); // 08:01 IST: rang, user taps Taken
    queue.push({ occurrenceId: occ.id, medicationId: med.medication.id, action: 'TAKEN', atMillis: clockMs, snoozeMinutes: 0 });

    clockMs += 6 * 3600 * 1000; // app not opened for hours; reconcile (headless) runs later
    await scheduler.reconcileAlarms();

    const after = (await db.occurrences.getById(occ.id))!;
    expect(after.state).toBe('TAKEN');
    expect(queue.items).toHaveLength(0);
  });

  it('a native snooze survives reconcile and is re-armed at the chosen time', async () => {
    const med = await db.createMedicationWithSchedule(draft({ name: 'A' }), profileId);
    const occ = (await db.occurrences.getByDate('2026-11-09'))[0];
    clockMs = new Date('2026-11-09T02:31:00.000Z').getTime();
    queue.push({ occurrenceId: occ.id, medicationId: med.medication.id, action: 'SNOOZED', atMillis: clockMs, snoozeMinutes: 30 });

    const { activeAlarms } = await scheduler.reconcileAlarms();
    expect(activeAlarms.map((a) => a.scheduledTimestampUtc)).toContain('2026-11-09T03:01:00.000Z');
    expect(activeAlarms.find((a) => a.occurrenceId === occ.id)!.originalScheduledUtc).toBe('2026-11-09T02:30:00.000Z');
  });

  it('a Taken on a predicted follow-up dose is kept until the dose exists, then saved', async () => {
    const a = await db.createMedicationWithSchedule(draft({ name: 'A', courseType: 'FIXED_DAYS', maxDurationDays: 3 }), profileId);
    const b = await db.createMedicationWithSchedule(
      draft({ name: 'B', hasPrerequisiteCourse: true, prerequisiteMedicationId: a.medication.id }),
      profileId
    );
    const { activeAlarms } = await scheduler.reconcileAlarms();
    const predicted = activeAlarms.find((x) => x.title.endsWith(': B'))!;
    expect(await db.occurrences.getById(predicted.occurrenceId)).toBeNull();

    // Day 4, 08:01 IST: B's predicted alarm rings and is answered on the native screen
    clockMs = new Date(predicted.scheduledTimestampUtc).getTime() + 60_000;
    queue.push({ occurrenceId: predicted.occurrenceId, medicationId: b.medication.id, action: 'TAKEN', atMillis: clockMs, snoozeMinutes: 0 });

    // Saving before the course transition must not throw the action away
    await applyPendingAlarmActions(db);
    expect(queue.items).toHaveLength(1);

    // Reconcile completes A, creates B's real dose, then saves the Taken
    await scheduler.reconcileAlarms();
    expect((await db.occurrences.getById(predicted.occurrenceId))!.state).toBe('TAKEN');
    expect(queue.items).toHaveLength(0);
  });

  it('an action queued while a save is running is not lost (no stale snapshot)', async () => {
    const m1 = await db.createMedicationWithSchedule(draft({ name: 'A' }), profileId);
    const m2 = await db.createMedicationWithSchedule(draft({ name: 'B' }), profileId);
    const [o1, o2] = await db.occurrences.getByDate('2026-11-09');
    const occA = [o1, o2].find((o) => o.medicationId === m1.medication.id)!;
    const occB = [o1, o2].find((o) => o.medicationId === m2.medication.id)!;
    clockMs = new Date('2026-11-09T02:31:00.000Z').getTime();
    queue.push({ occurrenceId: occA.id, medicationId: m1.medication.id, action: 'SNOOZED', atMillis: clockMs, snoozeMinutes: 10 });
    // B is snoozed from its notification just after the first save has read the queue
    queue.onRead = () => {
      queue.onRead = null;
      queue.push({ occurrenceId: occB.id, medicationId: m2.medication.id, action: 'SNOOZED', atMillis: clockMs, snoozeMinutes: 20 });
    };

    const first = applyPendingAlarmActions(db);
    const second = applyPendingAlarmActions(db); // overlaps the first
    await Promise.all([first, second]);

    expect((await db.occurrences.getById(occA.id))!.snoozedUntil).toBe('2026-11-09T02:41:00.000Z');
    expect((await db.occurrences.getById(occB.id))!.snoozedUntil).toBe('2026-11-09T02:51:00.000Z');
    expect(queue.items).toHaveLength(0);
  });

  it('drops actions for deleted doses and the Settings test alarm, keeps nothing stale', async () => {
    queue.push({ occurrenceId: 'test_occurrence_preview', medicationId: 'test_med_preview', action: 'TAKEN', atMillis: clockMs, snoozeMinutes: 0 });
    queue.push({ occurrenceId: 'gone', medicationId: 'gone-med', action: 'TAKEN', atMillis: clockMs, snoozeMinutes: 0 });
    await applyPendingAlarmActions(db);
    expect(queue.items).toHaveLength(0);
  });

  it('gives up on an unresolvable action for an existing medicine after 48 hours', async () => {
    const med = await db.createMedicationWithSchedule(draft({ name: 'A' }), profileId);
    queue.push({ occurrenceId: 'never-created', medicationId: med.medication.id, action: 'TAKEN', atMillis: clockMs, snoozeMinutes: 0 });
    await applyPendingAlarmActions(db);
    expect(queue.items).toHaveLength(1); // might still appear (predicted dose)
    clockMs += 3 * DAY;
    await applyPendingAlarmActions(db);
    expect(queue.items).toHaveLength(0);
  });
});
