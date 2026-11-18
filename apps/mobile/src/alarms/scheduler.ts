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
import { applyPendingAlarmActions } from './pending-actions';

/** How far ahead alarms are armed. Long enough that reminders survive days without opening the app. */
export const DEFAULT_HORIZON_HOURS = 14 * 24;
/** iOS keeps at most 64 pending local notifications per app; leave room for one-off notices. */
const IOS_MAX_PENDING = 60;
/** Android allows ~500 concurrent alarms per app; stay far below it. */
const ANDROID_MAX_PENDING = 200;

/**
 * Reconciles are serialized app-wide (the UI and the headless alarm-action task each create their own
 * SchedulerService). Two overlapping runs could otherwise interleave their cancel-all / re-arm steps
 * and drop a snooze that only the later run knew about.
 */
let reconcileQueue: Promise<unknown> = Promise.resolve();

type AlarmPrefs = { soundEnabled: boolean; vibrationEnabled: boolean; voice: string };
type AlarmMed = { id: string; name: string; doseQuantity: number; doseUnit: string; dosageText: string; instructions?: string };

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
    const run = reconcileQueue.then(
      () => this.reconcileNow(options),
      () => this.reconcileNow(options)
    );
    reconcileQueue = run.catch(() => {});
    return run;
  }

  private async alarmPrefs(): Promise<AlarmPrefs> {
    return {
      soundEnabled: await this.db.settings.getBoolean('alarm_sound_enabled', true),
      vibrationEnabled: await this.db.settings.getBoolean('alarm_vibration_enabled', true),
      voice: (await this.db.settings.get('alarm_voice')) || 'signature_female',
    };
  }

  private buildRequest(med: AlarmMed, occurrenceId: string, atUtc: string, originalUtc: string, prefs: AlarmPrefs): NativeAlarmRequest {
    return {
      id: `alarm_${occurrenceId}`,
      occurrenceId,
      medicationId: med.id,
      title: `Medication Reminder: ${med.name}`,
      body: `Time to take ${med.doseQuantity} ${med.doseUnit} of ${med.name} (${med.dosageText}). ${med.instructions || ''}`.trim(),
      medicationName: med.name,
      dosageText: [`${med.doseQuantity} ${med.doseUnit}`, med.dosageText].filter((s) => s && s.trim()).join(' · '),
      instructions: med.instructions || '',
      originalScheduledUtc: originalUtc,
      scheduledTimestampUtc: atUtc,
      allowSnooze: true,
      ...prefs,
    };
  }

  /**
   * Arms the alarm for one dose straight away (e.g. right after a snooze), without waiting for a full
   * reconcile. A later reconcile re-arms the same alarm id, so this never creates duplicates.
   */
  async armOccurrence(occurrenceId: string): Promise<boolean> {
    const occ = await this.db.occurrences.getById(occurrenceId);
    if (!occ || occ.state === 'TAKEN' || occ.state === 'SKIPPED') return false;
    const med = await this.db.medications.getById(occ.medicationId);
    if (!med || med.lifecycleStatus !== 'ACTIVE') return false;
    const effectiveUtc = occ.snoozedUntil || occ.scheduledAtUtc;
    if (new Date(effectiveUtc).getTime() <= this.db.clock().getTime()) return false;
    await this.adapter.scheduleAlarm(this.buildRequest(med, occ.id, effectiveUtc, occ.scheduledAtUtc, await this.alarmPrefs()));
    return true;
  }

  private async reconcileNow(options: { horizonHours?: number }): Promise<{
    scheduledCount: number;
    activeAlarms: NativeAlarmRequest[];
  }> {
    const horizonHours = options.horizonHours ?? DEFAULT_HORIZON_HOURS;
    const now = this.db.clock();
    const today = localDateInZone(now, this.db.timeZone());
    const endDate = addDays(today, Math.ceil(horizonHours / 24));

    // Calendar-day courses that ended while the app/phone was off must retire before any alarm is armed.
    // This also creates the real rows for follow-up doses that were armed as predictions.
    await this.db.completeDueCalendarCourses(now);
    await this.db.materializeOccurrences(today, endDate);
    // Then save actions taken on the native alarm screen (they may target those new rows), BEFORE
    // doses are flagged as unconfirmed and before the cancel-all below, which would otherwise drop a
    // snooze the database does not know about yet.
    await applyPendingAlarmActions(this.db);
    await this.db.markUnconfirmedDoses(now);
    const horizonUtc = new Date(now.getTime() + horizonHours * 3600 * 1000).toISOString();

    const prefs = await this.alarmPrefs();
    const requests: NativeAlarmRequest[] = [];

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
      requests.push(this.buildRequest(med, occ.id, effectiveUtc, occ.scheduledAtUtc, prefs));
    }

    // Predicted doses of follow-ups whose prerequisite ends on a known calendar day.
    for (const { medication, occurrences } of await this.db.projectQueuedOccurrences(today, endDate)) {
      for (const o of occurrences) {
        if (o.scheduledAtUtc > horizonUtc || new Date(o.scheduledAtUtc).getTime() <= now.getTime()) continue;
        requests.push(this.buildRequest(medication, o.occurrenceId, o.scheduledAtUtc, o.scheduledAtUtc, prefs));
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
