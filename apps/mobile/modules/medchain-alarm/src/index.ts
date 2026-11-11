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
  voice: 'female' | 'male';
}

interface MedchainAlarmNative {
  getStatus(): AlarmStatus;
  schedule(alarm: NativeAlarm): Promise<void>;
  cancel(id: string): Promise<void>;
  cancelAll(): Promise<void>;
  dismiss(id: string): Promise<void>;
  listScheduled(): Array<Omit<NativeAlarm, 'soundEnabled' | 'vibrationEnabled' | 'voice'>>;
  playSample(voice: 'female' | 'male'): Promise<void>;
  stopSample(): Promise<void>;
  /** JSON describing the most recent alarm the OS delivered (what was allowed, screen/lock state), or null. */
  getLastFire(): string | null;
  consumeNeedsReconcile(): boolean;
  openExactAlarmSettings(): Promise<void>;
  openFullScreenIntentSettings(): Promise<void>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
  endAlarmSession(): Promise<void>;
}

/** The native Android module; null on iOS, in Expo Go and in Bun tests. */
export const MedchainAlarm: MedchainAlarmNative | null = requireOptionalNativeModule<MedchainAlarmNative>('MedchainAlarm');
