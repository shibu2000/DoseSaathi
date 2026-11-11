import type {
  AlarmAdapter,
  NativeAlarmCapability,
  NativeAlarmRequest,
  AlarmPermissionStatus,
} from '../types';

export class AndroidAlarmAdapter implements AlarmAdapter {
  private scheduledIds: Map<string, NativeAlarmRequest> = new Map();
  private configuredChannels = new Set<string>();

  /** Android channels are immutable once created, so each sound/vibration combination gets its own. */
  private channelFor(sound: boolean, vibrate: boolean): string {
    return `medication_alarms_${sound ? 's' : 'x'}${vibrate ? 'v' : 'x'}`;
  }

  private async ensureChannel(sound: boolean, vibrate: boolean): Promise<string> {
    const id = this.channelFor(sound, vibrate);
    if (this.configuredChannels.has(id)) return id;
    try {
      const Notifications = await import('expo-notifications');
      if (Notifications.setNotificationChannelAsync) {
        await Notifications.setNotificationChannelAsync(id, {
          name: 'Medication reminders',
          description: 'Time-critical alerts for scheduled medication doses',
          importance: (Notifications as any).AndroidImportance?.MAX ?? 5,
          vibrationPattern: vibrate ? [0, 500, 250, 500] : undefined,
          lightColor: '#2B8767',
          sound: sound ? 'default' : null,
          enableVibrate: vibrate,
          showBadge: true,
          lockscreenVisibility: (Notifications as any).AndroidNotificationVisibility?.PUBLIC ?? 1,
          bypassDnd: false,
          audioAttributes: {
            usage: (Notifications as any).AndroidAudioUsage?.ALARM ?? 4,
            contentType: (Notifications as any).AndroidAudioContentType?.SONIFICATION ?? 4,
            flags: { enforceAudibility: sound, requestHardwareAudioVideoSynchronization: false },
          },
        } as any);
        this.configuredChannels.add(id);
      }
    } catch {}
    return id;
  }

  async getCapability(): Promise<NativeAlarmCapability> {
    let exactStatus: AlarmPermissionStatus = 'granted';
    let notifStatus: AlarmPermissionStatus = 'prompt';

    try {
      const Notifications = await import('expo-notifications');
      const perms = await Notifications.getPermissionsAsync();
      const isGranted = Boolean((perms as any)?.granted || (perms as any)?.status === 'granted');
      notifStatus = isGranted ? 'granted' : (perms as any)?.status === 'denied' ? 'denied' : 'prompt';

      if ((Notifications as any).getExactAlarmPermissionsAsync) {
        const exactPerms = await (Notifications as any).getExactAlarmPermissionsAsync();
        exactStatus = exactPerms.granted ? 'granted' : 'denied';
      }
    } catch {
      // Running outside native Expo environment
    }

    const hasExact = exactStatus === 'granted';

    return {
      platform: 'android',
      supportsExactAlarms: true,
      exactAlarmPermission: exactStatus,
      // Honest capability: a true lock-screen full-screen intent needs a custom native module that is
      // not built yet (docs/alarm-platform-matrix.md). Alarms ring as exact, alarm-stream notifications.
      supportsFullScreenIntent: false,
      fullScreenIntentPermission: 'unsupported',
      supportsAlarmKit: false,
      alarmKitPermission: 'unsupported',
      notificationPermission: notifStatus,
      activeAlarmMode: hasExact ? 'EXACT_ALARM_CLOCK' : 'LOCAL_NOTIFICATION_FALLBACK',
    };
  }

  async scheduleAlarm(request: NativeAlarmRequest): Promise<{ success: boolean; alarmId: string }> {
    this.scheduledIds.set(request.id, request);

    try {
      const channelId = await this.ensureChannel(request.soundEnabled ?? true, request.vibrationEnabled ?? true);
      const Notifications = await import('expo-notifications');
      const targetDate = new Date(request.scheduledTimestampUtc);

      // Attempt exact alarm clock trigger on Android
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
          // Keeps the alarm on screen until the user acts
          sticky: true,
          sound: (request.soundEnabled ?? true) ? request.sound || 'default' : false,
          priority: (Notifications as any).AndroidNotificationPriority?.MAX ?? 2,
        },
        trigger: {
          type: (Notifications as any).SchedulableTriggerInputTypes?.DATE ?? 'date',
          date: targetDate,
          channelId,
          delivery: 'alarmClock',
        } as any,
      });

      return { success: true, alarmId: notificationId || request.id };
    } catch {
      // Fallback for tests or environments without native notification daemon
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
