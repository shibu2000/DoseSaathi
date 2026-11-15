export type AlarmPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unsupported';

export type ActiveAlarmMode =
  | 'EXACT_ALARM_CLOCK'
  | 'FULL_SCREEN_INTENT'
  | 'ALARM_KIT'
  | 'LOCAL_NOTIFICATION_FALLBACK';

export interface NativeAlarmCapability {
  platform: 'android' | 'ios' | 'headless';
  supportsExactAlarms: boolean;
  exactAlarmPermission: AlarmPermissionStatus;
  supportsFullScreenIntent: boolean;
  fullScreenIntentPermission: AlarmPermissionStatus;
  supportsAlarmKit: boolean;
  alarmKitPermission: AlarmPermissionStatus;
  notificationPermission: AlarmPermissionStatus;
  activeAlarmMode: ActiveAlarmMode;
}

export interface NativeAlarmRequest {
  id: string; // unique identifier
  occurrenceId: string;
  medicationId: string;
  title: string;
  body: string;
  scheduledTimestampUtc: string;
  sound?: string;
  allowSnooze: boolean;
  isCritical?: boolean;
  /** User preferences from Settings; the native channel/sound honours them. */
  soundEnabled?: boolean;
  vibrationEnabled?: boolean;
  /** Recorded reminder voice / ringtone sound (Settings). */
  voice?: string;
}

export interface AlarmAdapter {
  getCapability(): Promise<NativeAlarmCapability>;
  scheduleAlarm(request: NativeAlarmRequest): Promise<{ success: boolean; alarmId: string }>;
  cancelAlarm(alarmId: string): Promise<boolean>;
  cancelAllAlarms(): Promise<void>;
  getActiveAlarms(): Promise<NativeAlarmRequest[]>;
}

export interface SchedulerDiagnostics {
  platform: 'android' | 'ios' | 'headless';
  activeAlarmMode: ActiveAlarmMode;
  exactAlarmGranted: boolean;
  notificationGranted: boolean;
  activeAlarmsCount: number;
  nextScheduledAlarmAt: string | null;
  lastReconciledAt: string | null;
  /** null = unknown: Android exposes no public API to read this. */
  batteryOptimizationExempt: boolean | null;
  /** null = not applicable on this platform/build. */
  fullScreenIntentGranted: boolean | null;
}
