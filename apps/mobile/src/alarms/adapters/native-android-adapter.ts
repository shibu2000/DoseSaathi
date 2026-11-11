import type { AlarmAdapter, NativeAlarmCapability, NativeAlarmRequest, ActiveAlarmMode } from '../types';
import { MedchainAlarm } from '../../../modules/medchain-alarm/src';

/**
 * Android alarm engine backed by the in-repo `medchain-alarm` native module:
 * AlarmManager.setAlarmClock (Doze-exempt) -> BroadcastReceiver -> full-screen-intent notification,
 * persisted natively and re-armed by a BOOT_COMPLETED receiver without starting the app.
 */
export class NativeAndroidAlarmAdapter implements AlarmAdapter {
  static isAvailable(): boolean {
    return MedchainAlarm != null;
  }

  private get native() {
    if (!MedchainAlarm) throw new Error('Native alarm module is not available in this build');
    return MedchainAlarm;
  }

  async getCapability(): Promise<NativeAlarmCapability> {
    const s = this.native.getStatus();
    const mode: ActiveAlarmMode = !s.notificationsEnabled
      ? 'LOCAL_NOTIFICATION_FALLBACK'
      : s.canScheduleExactAlarms && s.canUseFullScreenIntent
        ? 'FULL_SCREEN_INTENT'
        : s.canScheduleExactAlarms
          ? 'EXACT_ALARM_CLOCK'
          : 'LOCAL_NOTIFICATION_FALLBACK';
    return {
      platform: 'android',
      supportsExactAlarms: true,
      exactAlarmPermission: s.canScheduleExactAlarms ? 'granted' : 'denied',
      supportsFullScreenIntent: true,
      fullScreenIntentPermission: s.canUseFullScreenIntent ? 'granted' : 'denied',
      supportsAlarmKit: false,
      alarmKitPermission: 'unsupported',
      notificationPermission: s.notificationsEnabled ? 'granted' : 'denied',
      activeAlarmMode: mode,
    };
  }

  async scheduleAlarm(request: NativeAlarmRequest): Promise<{ success: boolean; alarmId: string }> {
    await this.native.schedule({
      id: request.id,
      triggerAtMillis: new Date(request.scheduledTimestampUtc).getTime(),
      occurrenceId: request.occurrenceId,
      medicationId: request.medicationId,
      title: request.title,
      body: request.body,
      soundEnabled: request.soundEnabled ?? true,
      vibrationEnabled: request.vibrationEnabled ?? true,
      voice: request.voice ?? 'female',
    });
    return { success: true, alarmId: request.id };
  }

  async cancelAlarm(alarmId: string): Promise<boolean> {
    await this.native.cancel(alarmId);
    return true;
  }

  async cancelAllAlarms(): Promise<void> {
    await this.native.cancelAll();
  }

  async getActiveAlarms(): Promise<NativeAlarmRequest[]> {
    return this.native.listScheduled().map((a) => ({
      id: a.id,
      occurrenceId: a.occurrenceId,
      medicationId: a.medicationId,
      title: a.title,
      body: a.body,
      scheduledTimestampUtc: new Date(a.triggerAtMillis).toISOString(),
      allowSnooze: true,
    }));
  }
}
