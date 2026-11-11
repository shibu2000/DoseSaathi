import type {
  AlarmAdapter,
  NativeAlarmCapability,
  NativeAlarmRequest,
  AlarmPermissionStatus,
} from '../types';

export class HeadlessAlarmAdapter implements AlarmAdapter {
  private activeAlarms: Map<string, NativeAlarmRequest> = new Map();
  public exactAlarmPermission: AlarmPermissionStatus = 'granted';
  public notificationPermission: AlarmPermissionStatus = 'granted';
  public fullScreenIntentPermission: AlarmPermissionStatus = 'granted';
  public alarmKitPermission: AlarmPermissionStatus = 'unsupported';

  async getCapability(): Promise<NativeAlarmCapability> {
    const supportsExact = this.exactAlarmPermission !== 'unsupported';
    const isExact = supportsExact && this.exactAlarmPermission === 'granted';

    return {
      platform: 'headless',
      supportsExactAlarms: supportsExact,
      exactAlarmPermission: this.exactAlarmPermission,
      supportsFullScreenIntent: this.fullScreenIntentPermission !== 'unsupported',
      fullScreenIntentPermission: this.fullScreenIntentPermission,
      supportsAlarmKit: this.alarmKitPermission !== 'unsupported',
      alarmKitPermission: this.alarmKitPermission,
      notificationPermission: this.notificationPermission,
      activeAlarmMode: isExact ? 'EXACT_ALARM_CLOCK' : 'LOCAL_NOTIFICATION_FALLBACK',
    };
  }

  async scheduleAlarm(request: NativeAlarmRequest): Promise<{ success: boolean; alarmId: string }> {
    this.activeAlarms.set(request.id, request);
    return { success: true, alarmId: request.id };
  }

  async cancelAlarm(alarmId: string): Promise<boolean> {
    return this.activeAlarms.delete(alarmId);
  }

  async cancelAllAlarms(): Promise<void> {
    this.activeAlarms.clear();
  }

  async getActiveAlarms(): Promise<NativeAlarmRequest[]> {
    return Array.from(this.activeAlarms.values()).sort(
      (a, b) => new Date(a.scheduledTimestampUtc).getTime() - new Date(b.scheduledTimestampUtc).getTime()
    );
  }
}
