import type { AlarmAdapter } from '../types';
import { HeadlessAlarmAdapter } from './headless-adapter';

export * from './headless-adapter';
export * from './android-adapter';
export * from './ios-adapter';

export function createAlarmAdapter(): AlarmAdapter {
  try {
    const RN = require('react-native');
    if (RN.Platform?.OS === 'android') {
      // Preferred: the in-repo native module (full-screen alarm, boot persistence)
      try {
        const { NativeAndroidAlarmAdapter } = require('./native-android-adapter');
        if (NativeAndroidAlarmAdapter.isAvailable()) return new NativeAndroidAlarmAdapter();
      } catch {}
      // Fallback (Expo Go / a build without the module): exact notification alarms
      const { AndroidAlarmAdapter } = require('./android-adapter');
      return new AndroidAlarmAdapter();
    }
    if (RN.Platform?.OS === 'ios') {
      const { IosAlarmAdapter } = require('./ios-adapter');
      return new IosAlarmAdapter();
    }
  } catch {
    // Running in Bun test or headless environment
  }
  return new HeadlessAlarmAdapter();
}
