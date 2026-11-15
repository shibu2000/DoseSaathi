export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface DevicePermissionStatus {
  notifications: PermissionState;
  exactAlarms: PermissionState;
  batteryOptimization: 'exempt' | 'optimizing' | 'unsupported';
}

function nativeAlarm(): any {
  try {
    return require('../../modules/medchain-alarm/src').MedchainAlarm;
  } catch {
    return null;
  }
}

function getRN() {
  try {
    const RN = require('react-native');
    return {
      Platform: RN.Platform,
      Linking: RN.Linking,
    };
  } catch {
    return {
      Platform: { OS: 'unknown' },
      Linking: {
        openSettings: async () => {},
        sendIntent: async () => {},
      },
    };
  }
}

async function getNotificationsModule() {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

/**
 * Ensures system notification channel and category actions are registered.
 */
export async function setupNotificationInfrastructure(): Promise<void> {
  const Notifications = await getNotificationsModule();
  const { Platform } = getRN();
  if (!Notifications) return;

  try {
    // 1. Configure foreground notification presentation
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        priority: (Notifications as any).AndroidNotificationPriority?.MAX ?? 2,
      }),
    });

    // 2. Configure Android Notification Channel with sound & vibration as native Alarm Clock
    if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync('medication_alarms', {
        name: 'Medication Alarms & Reminders',
        description: 'Crucial medication reminders and time-sensitive dose alerts',
        importance: (Notifications as any).AndroidImportance?.MAX ?? 5,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#2B8767',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: (Notifications as any).AndroidNotificationVisibility?.PUBLIC ?? 1,
        bypassDnd: true,
        audioAttributes: {
          usage: (Notifications as any).AndroidAudioUsage?.ALARM ?? 4,
          contentType: (Notifications as any).AndroidAudioContentType?.SONIFICATION ?? 4,
          flags: {
            enforceAudibility: true,
            requestHardwareAudioVideoSynchronization: false,
          },
        },
      });
    }

    // 3. Register interactive action buttons on notification banner
    if (Notifications.setNotificationCategoryAsync) {
      await Notifications.setNotificationCategoryAsync('MEDICATION_DUE_CATEGORY', [
        {
          identifier: 'ACTION_TAKEN',
          buttonTitle: 'Taken',
          options: {
            opensAppToForeground: false,
          },
        },
        {
          identifier: 'ACTION_SNOOZE',
          buttonTitle: 'Remind me in 10 minutes',
          options: {
            opensAppToForeground: false,
          },
        },
        {
          identifier: 'ACTION_SKIP',
          buttonTitle: 'Skip this dose',
          options: {
            opensAppToForeground: true,
          },
        },
      ]);
    }
  } catch (err) {
    console.warn('Failed to configure notification infrastructure:', err);
  }
}

/**
 * Checks all current OS-level permissions for reminders.
 */
export async function checkDevicePermissions(): Promise<DevicePermissionStatus> {
  const Notifications = await getNotificationsModule();
  const { Platform } = getRN();

  let notifications: PermissionState = 'prompt';
  let exactAlarms: PermissionState = 'unsupported';
  let batteryOptimization: 'exempt' | 'optimizing' | 'unsupported' = 'unsupported';

  if (!Notifications) {
    return { notifications: 'granted', exactAlarms: 'granted', batteryOptimization: 'exempt' };
  }

  // 1. Notification Permission
  try {
    const perms = await Notifications.getPermissionsAsync();
    const isGranted = Boolean((perms as any)?.granted || (perms as any)?.status === 'granted');
    const canAskAgain = (perms as any)?.canAskAgain ?? true;
    if (isGranted) {
      notifications = 'granted';
    } else if (!canAskAgain || (perms as any)?.status === 'denied') {
      notifications = 'denied';
    } else {
      notifications = 'prompt';
    }
  } catch {
    notifications = 'denied';
  }

  // 2. Exact Alarm Permission (Android 12+)
  if (Platform.OS === 'android') {
    exactAlarms = 'granted';
    const na = nativeAlarm();
    if (na) {
      try {
        exactAlarms = na.getStatus().canScheduleExactAlarms ? 'granted' : 'denied';
      } catch {
        exactAlarms = 'denied';
      }
    } else try {
      if ((Notifications as any).getExactAlarmPermissionsAsync) {
        const exactPerms = await (Notifications as any).getExactAlarmPermissionsAsync();
        exactAlarms = exactPerms.granted ? 'granted' : 'denied';
      }
    } catch {
      exactAlarms = 'denied';
    }
    // Android gives apps no public API to read the battery-optimization exemption.
    batteryOptimization = 'unsupported';
  } else if (Platform.OS === 'ios') {
    exactAlarms = 'unsupported';
    batteryOptimization = 'unsupported';
  }

  return { notifications, exactAlarms, batteryOptimization };
}

/**
 * Requests native OS notification permission dialog.
 */
export async function requestNotificationPermission(): Promise<PermissionState> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return 'granted';

  try {
    await setupNotificationInfrastructure();
    const perms = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    const isGranted = Boolean((perms as any)?.granted || (perms as any)?.status === 'granted');
    return isGranted ? 'granted' : 'denied';
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
    return 'denied';
  }
}

/**
 * Requests Android Exact Alarm permission (opens Alarms & Reminders system settings).
 */
export async function requestExactAlarmPermission(): Promise<PermissionState> {
  const Notifications = await getNotificationsModule();
  const { Platform, Linking } = getRN();

  if (Platform.OS !== 'android') {
    return 'unsupported';
  }

  const na = nativeAlarm();
  if (na) {
    try {
      await na.openExactAlarmSettings();
      return 'prompt'; // the result is read again when the app returns to the foreground
    } catch {}
  }

  try {
    if ((Notifications as any)?.requestExactAlarmPermissionsAsync) {
      const res = await (Notifications as any).requestExactAlarmPermissionsAsync();
      return res.granted ? 'granted' : 'denied';
    }
  } catch (err) {
    console.warn('Direct exact alarm intent failed, opening general settings:', err);
  }

  // Fallback to app settings
  try {
    await Linking.openSettings();
  } catch {}
  return 'prompt';
}

/**
 * Opens battery optimization or background activity settings on Android.
 */
export async function openBatteryOptimizationSettings(): Promise<void> {
  const { Platform, Linking } = getRN();
  if (Platform.OS === 'android') {
    try {
      const na = nativeAlarm();
      if (na) {
        await na.requestIgnoreBatteryOptimizations();
        return;
      }
      if (Linking.sendIntent) {
        await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
        return;
      }
    } catch {
      // Fall through to general settings
    }
  }
  try {
    await Linking.openSettings();
  } catch (err) {
    console.warn('Failed to open settings:', err);
  }
}

/**
 * Opens general application settings screen in OS settings.
 */
export async function openAppSettings(): Promise<void> {
  const { Linking } = getRN();
  try {
    await Linking.openSettings();
  } catch (err) {
    console.warn('Failed to open app settings:', err);
  }
}

/**
 * Schedules a live test alarm notification on the physical device in N seconds.
 */
export async function scheduleTestAlarm(delaySeconds: number = 5, voice: string = 'companion_female'): Promise<string> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    throw new Error('Notifications module not available');
  }

  await setupNotificationInfrastructure();

  const targetDate = new Date(Date.now() + Math.max(delaySeconds, 1) * 1000);

  // Use the real alarm path (full-screen intent, lock screen) when the native module is present
  const na = nativeAlarm();
  if (na) {
    const id = 'alarm_test_occurrence_preview';
    await na.schedule({
      id,
      triggerAtMillis: targetDate.getTime(),
      occurrenceId: 'test_occurrence_preview',
      medicationId: 'test_med_preview',
      title: 'DoseSaathi test alarm',
      body: 'This is a test. If you can see and hear this, reminders can reach you.',
      soundEnabled: true,
      vibrationEnabled: true,
      voice,
    });
    return id;
  }

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'DoseSaathi test alarm',
      body: 'This is a test. If you can hear and see this, reminders can reach you.',
      data: {
        occurrenceId: 'test_occurrence_preview',
        medicationId: 'test_med_preview',
        isTest: true,
      },
      categoryIdentifier: 'MEDICATION_DUE_CATEGORY',
      sound: 'default',
      priority: (Notifications as any).AndroidNotificationPriority?.MAX ?? 2,
    },
    trigger: {
      type: (Notifications as any).SchedulableTriggerInputTypes?.DATE ?? 'date',
      date: targetDate,
      channelId: 'medication_alarms',
      delivery: 'alarmClock',
    } as any,
  });

  return notificationId;
}
