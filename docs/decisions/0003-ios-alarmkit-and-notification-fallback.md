# ADR 0003: iOS AlarmKit & Notification Fallback Architecture

**Status:** Approved  
**Date:** 8 November 2026  

### Context
Apple introduced `AlarmKit` at WWDC25 for iOS 26+, supporting prominent alarms with system snooze, volume override, and custom alarm presentations. Earlier iOS versions (iOS 17–25) rely on `UserNotifications` framework.

### Decision
1. **iOS 26+**:
   - Utilize native `AlarmKit` module via Expo native module (`expo-module.config.json`).
   - Request system authorization via `AlarmManager.requestAuthorization()`.
   - Register system alarms tied to occurrence IDs.
2. **iOS 17–25**:
   - Fall back to `UNUserNotificationCenter` with notification category `MEDCHAIN_DOSE_ALARM`.
   - Actions provided: `TAKEN_ACTION`, `SNOOZE_ACTION`, `SKIP_ACTION`.
   - Bundled audio asset plays on notification trigger.
3. **Honest UX**:
   - Disclose on iOS <26 that alarms cannot break through physical mute switches or power-off states unless Apple grants a Critical Alert entitlement.
