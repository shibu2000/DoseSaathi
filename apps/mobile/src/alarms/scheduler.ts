import type { AppDatabase } from '../database';
import type {
  AlarmAdapter,
  NativeAlarmRequest,
  SchedulerDiagnostics,
  NativeAlarmCapability,
} from './types';
import { createAlarmAdapter } from './adapters';
import { localDateInZone, addDays } from '@medchain/domain';
import type { DoseActionResult } from '../database';

/** How far ahead alarms are armed. Long enough that reminders survive days without opening the app. */
export const DEFAULT_HORIZON_HOURS = 14 * 24;
/** iOS keeps at most 64 pending local notifications per app; leave room for one-off notices. */
const IOS_MAX_PENDING = 60;
/** Android allows ~500 concurrent alarms per app; stay far below it. */
const ANDROID_MAX_PENDING = 200;

export class SchedulerService {
  constructor(
    private db: AppDatabase,
    private adapter: AlarmAdapter = createAlarmAdapter()
  ) {}

  /**
   * Reconciles native alarms with the local database:
   * 1. Retires calendar-day courses that ended, flags unconfirmed doses.
   * 2. Materializes dose occurrences for active medicines across the horizon.
   * 3. Arms one native alarm per upcoming dose, soonest first, up to the platform limit.
   * 4. Also arms the *predicted* doses of follow-up medicines waiting on a calendar-day course, so a
   *    phase change still rings when the app is not opened in between.
   *
   * The horizon is two weeks: alarms keep ringing even if the app is not opened for days. Every app
   * launch, dose action and reboot extends it again.
   */
  async reconcileAlarms(options: { horizonHours?: number } = {}): Promise<{
    scheduledCount: number;
    activeAlarms: NativeAlarmRequest[];
  }> {
    const horizonHours = options.horizonHours ?? DEFAULT_HORIZON_HOURS;
    const now = this.db.clock();
    const today = localDateInZone(now, this.db.timeZone());
    const endDate = addDays(today, Math.ceil(horizonHours / 24));

    // Calendar-day courses that ended while the app/phone was off must retire before any alarm is armed
    await this.db.completeDueCalendarCourses(now);
    await this.db.markUnconfirmedDoses(now);
    const horizonUtc = new Date(now.getTime() + horizonHours * 3600 * 1000).toISOString();

    await this.db.materializeOccurrences(today, endDate);

    const soundEnabled = await this.db.settings.getBoolean('alarm_sound_enabled', true);
    const vibrationEnabled = await this.db.settings.getBoolean('alarm_vibration_enabled', true);
    const voice = (await this.db.settings.get('alarm_voice')) === 'male' ? 'male' : 'female';

    const requests: NativeAlarmRequest[] = [];
    const build = (med: { id: string; name: string; doseQuantity: number; doseUnit: string; dosageText: string; instructions?: string }, occurrenceId: string, atUtc: string): NativeAlarmRequest => ({
      id: `alarm_${occurrenceId}`,
      occurrenceId,
      medicationId: med.id,
      title: `Medication Reminder: ${med.name}`,
      body: `Time to take ${med.doseQuantity} ${med.doseUnit} of ${med.name} (${med.dosageText}). ${med.instructions || ''}`.trim(),
      scheduledTimestampUtc: atUtc,
      allowSnooze: true,
      soundEnabled,
      vibrationEnabled,
      voice,
    });

    // Real doses of ACTIVE medicines. Queued/completed medicines never get an alarm from this path.
    const medCache = new Map<string, Awaited<ReturnType<AppDatabase['medications']['getById']>>>();
    for (const occ of await this.db.occurrences.getScheduledForHorizon(horizonUtc)) {
      if (!medCache.has(occ.medicationId)) medCache.set(occ.medicationId, await this.db.medications.getById(occ.medicationId));
      const med = medCache.get(occ.medicationId);
      if (!med || med.lifecycleStatus !== 'ACTIVE') continue;
      // The effective ring time is the snooze time when snoozed, otherwise the scheduled time.
      const effectiveUtc = occ.snoozedUntil || occ.scheduledAtUtc;
      // Past alarms are never re-armed (the "not confirmed" sweep handles unacknowledged doses)
      if (new Date(effectiveUtc).getTime() <= now.getTime()) continue;
      requests.push(build(med, occ.id, effectiveUtc));
    }

    // Predicted doses of follow-ups whose prerequisite ends on a known calendar day.
    for (const { medication, occurrences } of await this.db.projectQueuedOccurrences(today, endDate)) {
      for (const o of occurrences) {
        if (o.scheduledAtUtc > horizonUtc || new Date(o.scheduledAtUtc).getTime() <= now.getTime()) continue;
        requests.push(build(medication, o.occurrenceId, o.scheduledAtUtc));
      }
    }

    requests.sort((x, y) => (x.scheduledTimestampUtc < y.scheduledTimestampUtc ? -1 : x.scheduledTimestampUtc > y.scheduledTimestampUtc ? 1 : 0));
    const capability = await this.adapter.getCapability();
    const limit = capability.platform === 'ios' ? IOS_MAX_PENDING : ANDROID_MAX_PENDING;
    const toArm = requests.slice(0, limit);

    // Replace the armed set atomically from the app's point of view: clear, then arm the soonest ones.
    await this.adapter.cancelAllAlarms();
    let scheduledCount = 0;
    for (const request of toArm) {
      await this.adapter.scheduleAlarm(request);
      scheduledCount++;
    }

    const activeAlarms = await this.adapter.getActiveAlarms();
    const nowIso = now.toISOString();
    await this.db.settings.set('last_reconciled_at', nowIso);

    return { scheduledCount, activeAlarms };
  }

  /** Stops a ringing/pending alarm for a dose the user has just handled. */
  async dismissOccurrence(occurrenceId: string): Promise<void> {
    await this.adapter.cancelAlarm(`alarm_${occurrenceId}`);
  }

  /**
   * Handles device reboot (BOOT_COMPLETED). Re-registers active alarms without needing cloud connectivity.
   */
  async handleSystemReboot(): Promise<void> {
    await this.adapter.cancelAllAlarms();
    await this.reconcileAlarms();
  }

  /**
   * Handles timezone or time change events.
   */
  async handleTimezoneChange(newTimezone: string): Promise<void> {
    const primary = await this.db.profiles.getPrimary();
    if (primary) {
      await this.db.profiles.update({
        ...primary,
        timezoneId: newTimezone,
        updatedAt: new Date().toISOString(),
      });
    }
    await this.db.settings.set('device_timezone', newTimezone);
    await this.adapter.cancelAllAlarms();
    await this.reconcileAlarms();
  }

  /**
   * Handles native notification action callbacks directly from the OS.
   */
  async handleActionCallback(params: {
    action: 'TAKEN' | 'SNOOZED' | 'SKIPPED';
    medicationId: string;
    occurrenceId: string;
    fallbackPolicy?: 'SKIP_CHILD' | 'USE_FALLBACK_TIME';
    fallbackTime?: string;
  }): Promise<DoseActionResult> {
    const { action, medicationId, occurrenceId, fallbackPolicy, fallbackTime } = params;
    const nowIso = this.db.clock().toISOString();

    // 1. Mutate SQLite transactionally (same domain service the in-app UI uses)
    const result = await this.db.recordDoseAction({
      medicationId,
      occurrenceId,
      action,
      actionTimestampUtc: nowIso,
      fallbackPolicy,
      fallbackTime,
    });

    // 2. Cancel alarm for this occurrence
    await this.adapter.cancelAlarm(`alarm_${occurrenceId}`);

    // 3. Reconcile alarms to schedule newly triggered child dose or activated course
    await this.reconcileAlarms();

    return result;
  }

  /**
   * Returns honest scheduler diagnostics without fabricated assertions.
   */
  async getDiagnostics(): Promise<SchedulerDiagnostics> {
    const cap: NativeAlarmCapability = await this.adapter.getCapability();
    const activeAlarms = await this.adapter.getActiveAlarms();
    const lastReconciledAt = await this.db.settings.get('last_reconciled_at');

    return {
      platform: cap.platform,
      activeAlarmMode: cap.activeAlarmMode,
      exactAlarmGranted: cap.exactAlarmPermission === 'granted',
      notificationGranted: cap.notificationPermission === 'granted',
      activeAlarmsCount: activeAlarms.length,
      nextScheduledAlarmAt: activeAlarms.length > 0 ? activeAlarms[0].scheduledTimestampUtc : null,
      lastReconciledAt,
      batteryOptimizationExempt: null,
      fullScreenIntentGranted:
        cap.fullScreenIntentPermission === 'unsupported' ? null : cap.fullScreenIntentPermission === 'granted',
    };
  }
}
