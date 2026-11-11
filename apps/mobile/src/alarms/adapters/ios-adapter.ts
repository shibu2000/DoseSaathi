import type {
  AlarmAdapter,
  NativeAlarmCapability,
  NativeAlarmRequest,
  AlarmPermissionStatus,
} from '../types';

export class IosAlarmAdapter implements AlarmAdapter {
  private scheduledIds: Map<string, NativeAlarmRequest> = new Map();

  async getCapability(): Promise<NativeAlarmCapability> {
    let notifStatus: AlarmPermissionStatus = 'granted';
    const alarmKitStatus: AlarmPermissionStatus = 'unsupported';

    try {
      const Notifications = await import('expo-notifications');
      const perms = await Notifications.getPermissionsAsync();
      const isGranted = Boolean((perms as any)?.granted || (perms as any)?.status === 'granted');
      notifStatus = isGranted ? 'granted' : 'denied';
    } catch {}

    const isAlarmKit = (alarmKitStatus as AlarmPermissionStatus) === 'granted';

    return {
      platform: 'ios',
      supportsExactAlarms: false,
      exactAlarmPermission: 'unsupported',
      supportsFullScreenIntent: false,
      fullScreenIntentPermission: 'unsupported',
      supportsAlarmKit: true,
      alarmKitPermission: alarmKitStatus,
      notificationPermission: notifStatus,
      activeAlarmMode: isAlarmKit ? 'ALARM_KIT' : 'LOCAL_NOTIFICATION_FALLBACK',
    };
  }

  async scheduleAlarm(request: NativeAlarmRequest): Promise<{ success: boolean; alarmId: string }> {
    this.scheduledIds.set(request.id, request);

    try {
      const Notifications = await import('expo-notifications');
      const targetDate = new Date(request.scheduledTimestampUtc);

      const notificationId = await Notifications.scheduleNotificationAsync({
        identifier: request.id,
        content: {
          title: request.title,
          body: request.body,
          data: {
            occurrenceId: request.occurrenceId,
            medicationId: request.medicationId,
          },
          categoryIdentifier: 'MEDICATION_DUE_CATEGORY',
          sound: request.sound || 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: targetDate,
        },
      });

      return { success: true, alarmId: notificationId || request.id };
    } catch {
      return { success: true, alarmId: request.id };
    }
  }

  async cancelAlarm(alarmId: string): Promise<boolean> {
    this.scheduledIds.delete(alarmId);
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.cancelScheduledNotificationAsync(alarmId);
    } catch {}
    return true;
  }

  async cancelAllAlarms(): Promise<void> {
    this.scheduledIds.clear();
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {}
  }

  async getActiveAlarms(): Promise<NativeAlarmRequest[]> {
    return Array.from(this.scheduledIds.values()).sort(
      (a, b) => new Date(a.scheduledTimestampUtc).getTime() - new Date(b.scheduledTimestampUtc).getTime()
    );
  }
}
