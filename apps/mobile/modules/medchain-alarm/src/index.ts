import { requireOptionalNativeModule } from 'expo';

export interface AlarmStatus {
  sdkInt: number;
  canScheduleExactAlarms: boolean;
  /** Android 14+: false until the user grants "full-screen notifications" to the app. */
  canUseFullScreenIntent: boolean;
  notificationsEnabled: boolean;
  ignoringBatteryOptimizations: boolean;
  deviceLocked: boolean;
}

export interface NativeAlarm {
  id: string;
  triggerAtMillis: number;
  occurrenceId: string;
  medicationId: string;
  title: string;
  body: string;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  voice: string;
  medicationName?: string;
  dosageText?: string;
  instructions?: string;
  /** The dose's own scheduled time (shown on the alarm screen even after a snooze). */
  scheduledAtMillis?: number;
}

/** A dose action taken on the native alarm screen or notification, waiting to be saved by the app. */
export interface PendingAlarmAction {
  id: string;
  occurrenceId: string;
  medicationId: string;
  action: 'TAKEN' | 'SNOOZED' | 'SKIPPED';
  atMillis: number;
  snoozeMinutes: number;
}

export interface WidgetDosePayload {
  hasUpcoming: boolean;
  medicationName?: string;
  dosageText?: string;
  scheduledTimeStr?: string;
  triggerAtMillis?: number;
  occurrenceId?: string;
  state?: 'UPCOMING' | 'DUE' | 'SNOOZED' | 'NONE';
  theme?: string;
  isDark?: boolean;
  /** 'system' lets the widget follow the phone's dark mode on its own (Android 12+). */
  appearance?: 'light' | 'dark' | 'system';
}

interface MedchainAlarmNative {
  getStatus(): AlarmStatus;
  schedule(alarm: NativeAlarm): Promise<void>;
  cancel(id: string): Promise<void>;
  cancelAll(): Promise<void>;
  dismiss(id: string): Promise<void>;
  listScheduled(): Array<Omit<NativeAlarm, 'soundEnabled' | 'vibrationEnabled' | 'voice'>>;
  playSample(voice: string): Promise<void>;
  stopSample(): Promise<void>;
  /** JSON describing the most recent alarm the OS delivered (what was allowed, screen/lock state), or null. */
  getLastFire(): string | null;
  consumeNeedsReconcile(): boolean;
  openExactAlarmSettings(): Promise<void>;
  openFullScreenIntentSettings(): Promise<void>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
  endAlarmSession(): Promise<void>;
  canPinWidget(): boolean;
  /** Defaults to the glass widget for the glassmorphism theme, otherwise the scenic one. */
  requestPinWidget(style?: 'scenic' | 'glass'): Promise<boolean>;
  updateWidgetData(data: WidgetDosePayload): Promise<void>;
  refreshWidget(): Promise<void>;
  setAppIcon(themeName: string): Promise<void>;
  getPendingAlarmActions(): PendingAlarmAction[];
  ackPendingAlarmActions(ids: string[]): void;
  /** Fires when the user acts on the alarm screen / notification while the app is running. */
  addListener(eventName: 'onAlarmAction', listener: (event: { pending: boolean }) => void): { remove(): void };
}

/** The native Android module; null on iOS, in Expo Go and in Bun tests. */
export const MedchainAlarm: MedchainAlarmNative | null = requireOptionalNativeModule<MedchainAlarmNative>('MedchainAlarm');
