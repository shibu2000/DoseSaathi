import { describe, it, expect, beforeEach } from 'bun:test';
import { BunSqliteAdapter } from '../src/database/adapters/bun-adapter';
import { AppDatabase, type WizardDraft, DEFAULT_WIZARD_DRAFT } from '../src/database';
import { HeadlessAlarmAdapter, SchedulerService } from '../src/alarms';
import { formatISODate } from '@medchain/domain';

describe('Phase 4 — Native Alarm Engine & Schedule Reconciliation', () => {
  let dbAdapter: BunSqliteAdapter;
  let db: AppDatabase;
  let alarmAdapter: HeadlessAlarmAdapter;
  let scheduler: SchedulerService;
  let profileId: string;

  beforeEach(async () => {
    dbAdapter = new BunSqliteAdapter(':memory:');
    db = await AppDatabase.initialize(dbAdapter);
    db.tz = 'UTC';
    db.clock = () => new Date('2026-11-09T03:00:00.000Z');
    alarmAdapter = new HeadlessAlarmAdapter();
    scheduler = new SchedulerService(db, alarmAdapter);

    const nowIso = new Date().toISOString();
    profileId = crypto.randomUUID();
    await db.profiles.create({
      id: profileId,
      displayName: 'Eleanor Vance',
      profileType: 'PERSONAL',
      timezoneId: 'America/New_York',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  });

  it('P4-01: Reconciles next 48-hour dose occurrences into native alarm adapter', async () => {
    // Create daily active medicine at 08:00 and 20:00
    await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Metformin',
        dosageText: '500 mg',
        doseQuantity: 1,
        doseUnit: 'tablet',
        scheduleType: 'FIXED_TIMES',
        recurrenceType: 'DAILY',
        fixedTimes: ['08:00', '20:00'],
        courseType: 'ONGOING',
        hasPrerequisiteCourse: false,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );

    const { scheduledCount, activeAlarms } = await scheduler.reconcileAlarms({ horizonHours: 48 });
    expect(scheduledCount).toBeGreaterThanOrEqual(2);
    expect(activeAlarms.length).toBeGreaterThanOrEqual(2);

    const firstAlarm = activeAlarms[0];
    expect(firstAlarm.title).toContain('Metformin');
    expect(firstAlarm.body).toContain('500 mg');
  });

  it('P4-02: Queued courses and completed courses NEVER receive native alarms', async () => {
    // 1. Create active parent
    const parent = await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Active Antibiotic',
        dosageText: '250 mg',
        doseQuantity: 1,
        doseUnit: 'capsule',
        scheduleType: 'FIXED_TIMES',
        recurrenceType: 'DAILY',
        fixedTimes: ['08:00'],
        courseType: 'FIXED_DAYS',
        maxDurationDays: 3,
        hasPrerequisiteCourse: false,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );

    // 2. Create queued follow-up course
    const queuedChild = await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Queued Probiotic',
        dosageText: '1 capsule',
        doseQuantity: 1,
        doseUnit: 'capsule',
        scheduleType: 'FIXED_TIMES',
        recurrenceType: 'DAILY',
        fixedTimes: ['08:00'],
        courseType: 'FIXED_DAYS',
        maxDurationDays: 14,
        hasPrerequisiteCourse: true,
        prerequisiteMedicationId: parent.medication.id,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );
    expect(queuedChild.medication.lifecycleStatus).toBe('QUEUED_PHASE');

    // Reconcile alarms
    const { activeAlarms } = await scheduler.reconcileAlarms({ horizonHours: 48 });

    // Verify: only active parent has alarms, queued child has zero alarms
    const queuedAlarms = activeAlarms.filter((a) => a.medicationId === queuedChild.medication.id);
    expect(queuedAlarms).toHaveLength(0);

    const activeAlarmsForParent = activeAlarms.filter((a) => a.medicationId === parent.medication.id);
    expect(activeAlarmsForParent.length).toBeGreaterThanOrEqual(1);
  });

  it('P4-03: Action callback from notification (TAKEN) mutates SQLite and cancels the fired alarm', async () => {
    const med = await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Lisinopril',
        dosageText: '10 mg',
        doseQuantity: 1,
        doseUnit: 'tablet',
        trackStock: true,
        currentStock: 30,
        lowStockThreshold: 5,
        scheduleType: 'FIXED_TIMES',
        recurrenceType: 'DAILY',
        fixedTimes: ['08:00'],
        courseType: 'ONGOING',
        hasPrerequisiteCourse: false,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );

    await scheduler.reconcileAlarms({ horizonHours: 48 });
    const initialAlarms = await alarmAdapter.getActiveAlarms();
    expect(initialAlarms.length).toBeGreaterThanOrEqual(1);

    const targetAlarm = initialAlarms[0];

    // Notification callback for TAKEN
    await scheduler.handleActionCallback({
      action: 'TAKEN',
      medicationId: targetAlarm.medicationId,
      occurrenceId: targetAlarm.occurrenceId,
    });

    // Verify stock decremented in SQLite
    const updatedMed = await db.medications.getById(med.medication.id);
    expect(updatedMed!.currentStock).toBe(29);
    expect(updatedMed!.dosesTakenCount).toBe(1);

    // Verify occurrence marked TAKEN in SQLite
    const updatedOcc = await db.occurrences.getById(targetAlarm.occurrenceId);
    expect(updatedOcc!.state).toBe('TAKEN');
  });

  it('P4-04: Same-day dependent schedule: parent TAKEN callback triggers child exact alarm 30m later', async () => {
    const parent = await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Thyroid Hormone',
        dosageText: '75 mcg',
        doseQuantity: 1,
        doseUnit: 'tablet',
        scheduleType: 'FIXED_TIMES',
        recurrenceType: 'DAILY',
        fixedTimes: ['07:00'],
        courseType: 'ONGOING',
        hasPrerequisiteCourse: false,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );

    const child = await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Multivitamin',
        dosageText: '1 tablet',
        doseQuantity: 1,
        doseUnit: 'tablet',
        scheduleType: 'SAME_DAY_DEPENDENT',
        recurrenceType: 'DAILY',
        sameDayParentMedicationId: parent.medication.id,
        sameDayDelayMinutes: 30,
        sameDayFallbackPolicy: 'SKIP_CHILD',
        courseType: 'ONGOING',
        hasPrerequisiteCourse: false,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );

    await scheduler.reconcileAlarms({ horizonHours: 48 });
    const beforeAlarms = await alarmAdapter.getActiveAlarms();
    expect(beforeAlarms.filter((a) => a.medicationId === child.medication.id)).toHaveLength(0);

    const parentAlarm = beforeAlarms.find((a) => a.medicationId === parent.medication.id)!;

    // Parent Taken callback
    await scheduler.handleActionCallback({
      action: 'TAKEN',
      medicationId: parent.medication.id,
      occurrenceId: parentAlarm.occurrenceId,
    });

    // Reconciled alarms should now include the child scheduled 30m after taken
    const afterAlarms = await alarmAdapter.getActiveAlarms();
    const childAlarms = afterAlarms.filter((a) => a.medicationId === child.medication.id);
    expect(childAlarms.length).toBeGreaterThanOrEqual(1);
    expect(childAlarms[0].title).toContain('Multivitamin');
  });

  it('P4-05: System reboot (BOOT_COMPLETED) restores alarms from SQLite without internet', async () => {
    await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Metformin',
        dosageText: '500 mg',
        doseQuantity: 1,
        doseUnit: 'tablet',
        scheduleType: 'FIXED_TIMES',
        recurrenceType: 'DAILY',
        fixedTimes: ['08:00', '20:00'],
        courseType: 'ONGOING',
        hasPrerequisiteCourse: false,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );

    await scheduler.reconcileAlarms({ horizonHours: 48 });
    expect((await alarmAdapter.getActiveAlarms()).length).toBeGreaterThanOrEqual(2);

    // Simulate device reboot (which wipes OS AlarmManager memory table)
    await alarmAdapter.cancelAllAlarms();
    expect((await alarmAdapter.getActiveAlarms()).length).toBe(0);

    // Invoke reboot handler
    await scheduler.handleSystemReboot();

    // Verify all alarms restored from SQLite
    const restoredAlarms = await alarmAdapter.getActiveAlarms();
    expect(restoredAlarms.length).toBeGreaterThanOrEqual(2);
  });

  it('P4-06: Timezone change reconciles alarms and updates device profile', async () => {
    await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Metformin',
        dosageText: '500 mg',
        doseQuantity: 1,
        doseUnit: 'tablet',
        scheduleType: 'FIXED_TIMES',
        recurrenceType: 'DAILY',
        fixedTimes: ['08:00'],
        courseType: 'ONGOING',
        hasPrerequisiteCourse: false,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );

    // User travels to London (Europe/London)
    await scheduler.handleTimezoneChange('Europe/London');

    const primary = await db.profiles.getPrimary();
    expect(primary!.timezoneId).toBe('Europe/London');

    const savedTz = await db.settings.get('device_timezone');
    expect(savedTz).toBe('Europe/London');

    const activeAlarms = await alarmAdapter.getActiveAlarms();
    expect(activeAlarms.length).toBeGreaterThanOrEqual(1);
  });

  it('P4-07: Permission fallback: when exact alarm permission is denied, capability reports LOCAL_NOTIFICATION_FALLBACK', async () => {
    alarmAdapter.exactAlarmPermission = 'denied';
    const capability = await alarmAdapter.getCapability();

    expect(capability.exactAlarmPermission).toBe('denied');
    expect(capability.activeAlarmMode).toBe('LOCAL_NOTIFICATION_FALLBACK');
  });

  it('P4-08: Scheduler diagnostics return real device telemetry without fake assertions', async () => {
    await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Aspirin',
        dosageText: '81 mg',
        doseQuantity: 1,
        doseUnit: 'tablet',
        scheduleType: 'FIXED_TIMES',
        recurrenceType: 'DAILY',
        fixedTimes: ['08:00'],
        courseType: 'ONGOING',
        hasPrerequisiteCourse: false,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );

    await scheduler.reconcileAlarms({ horizonHours: 48 });
    const diagnostics = await scheduler.getDiagnostics();

    expect(diagnostics.platform).toBe('headless');
    expect(diagnostics.activeAlarmsCount).toBeGreaterThanOrEqual(1);
    expect(diagnostics.nextScheduledAlarmAt).not.toBeNull();
    expect(diagnostics.lastReconciledAt).not.toBeNull();
    // Android exposes no API for this; we must not claim an answer
    expect(diagnostics.batteryOptimizationExempt).toBeNull();
  });
});
