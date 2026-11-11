# MedChain — Native Alarm Platform Capability Matrix & Engineering Spike

**Version:** 1.0.0  
**Updated:** 8 November 2026  
**Status:** Android native module implemented (`apps/mobile/modules/medchain-alarm`) and compiles; NOT yet verified on a device. iOS AlarmKit is not built (iOS uses standard notifications).  

---

## 1. Platform Capability Comparison

| Concern | Android 12–13 | Android 14+ | iOS 17–25 | iOS 26+ (WWDC25) |
|---|---|---|---|---|
| **Primary Alarm Engine** | `AlarmManager.setAlarmClock()` | `AlarmManager.setAlarmClock()` | `UNUserNotificationCenter` | `AlarmKit` Framework |
| **Exact Timing Permission** | `SCHEDULE_EXACT_ALARM` (Runtime check) | `SCHEDULE_EXACT_ALARM` (Runtime check) | Standard Notification Auth | `AlarmKit` Authorization |
| **Full-Screen Presentation** | Allowed via `FullScreenIntent` | Restricted via `canUseFullScreenIntent()` | Not available (system sheet) | Native Alarm Presentation |
| **Do Not Disturb Bypass** | Alarm stream honors alarm volume | Alarm stream honors alarm volume | Requires Critical Alert Entitlement | Supported by AlarmKit |
| **System Event Reconciliation** | BroadcastReceiver (`BOOT`, `TIMEZONE`, `TIME`) | BroadcastReceiver (`BOOT`, `TIMEZONE`, `TIME`) | Silent background push / launch | System-managed or launch |
| **Fallback when Denied** | Inexact Notification / Standard notification | High-priority Heads-up Notification | Standard Notification Banner | Standard Notification Banner |

---

## 2. Android Native Architecture (`apps/mobile/src/platform/alarms/android`)

### 2.1 Exact Alarms (`AlarmManager`)
1. Android 12+ (API 31) introduced restrictions on exact alarms.
2. Android 14 (API 34) turns `SCHEDULE_EXACT_ALARM` off by default for newly installed apps unless exempt.
3. **Google Play Policy Check**: `USE_EXACT_ALARM` is restricted to core alarm clock and timer applications. To avoid store rejection, MedChain defaults to user-granted `SCHEDULE_EXACT_ALARM`.
4. Runtime verification:
   ```kotlin
   val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
   if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
       if (!alarmManager.canScheduleExactAlarms()) {
           // Direct user to Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM
           // Fallback to notification scheduling with inexact timing
       }
   }
   ```
5. `setAlarmClock()` creates a system alarm indicator in the status bar and wakes the device from Doze mode:
   ```kotlin
   val alarmClockInfo = AlarmManager.AlarmClockInfo(triggerTimeMillis, showIntent)
   alarmManager.setAlarmClock(alarmClockInfo, pendingIntent)
   ```

### 2.2 Android 14+ Full-Screen Intent (`USE_FULL_SCREEN_INTENT`)
1. In Android 14+, apps must be calling or alarm apps to use full-screen intents automatically.
2. Runtime verification:
   ```kotlin
   val notificationManager = NotificationManagerCompat.from(context)
   if (!notificationManager.canUseFullScreenIntent()) {
       // Graceful fallback: Do not promise full-screen takeover.
       // Deliver high-priority heads-up notification with action buttons.
   }
   ```

### 2.3 System Event Reconciliation
A native `BroadcastReceiver` (`MedChainAlarmReceiver`) listens for:
- `android.intent.action.BOOT_COMPLETED`
- `android.intent.action.TIMEZONE_CHANGED`
- `android.intent.action.TIME_SET`
- `android.intent.action.MY_PACKAGE_REPLACED`

Upon receiving any of these broadcasts, the receiver invokes the local reconciliation service which queries the local SQLite database for all `SCHEDULED` dose occurrences within the next 48 hours and re-registers the exact alarms. `QUEUED_PHASE` medications are strictly excluded.

---

## 3. iOS Native Architecture (`apps/mobile/src/platform/alarms/ios`)

### 3.1 iOS 26+ (`AlarmKit`)
1. Apple introduced `AlarmKit` (WWDC25) specifically for alarm and timer management on iOS 26+.
2. Features supported:
   - System-managed prominent alarms that break through mute/Focus.
   - User authorization prompt via `AlarmManager.requestAuthorization()`.
   - Native snooze and dismissal controls.
3. Integration via custom Expo Module (`expo-module.config.json`):
   ```swift
   import AlarmKit
   // Schedules system alarm linked to occurrenceId
   ```

### 3.2 iOS 17–25 Fallback (`UNUserNotificationCenter`)
1. For iOS versions prior to iOS 26, MedChain uses `UNUserNotificationCenter` with custom notification categories.
2. Categories configured:
   - `MEDCHAIN_DOSE_ALARM`: Actions: `TAKEN_ACTION` ("Taken"), `SNOOZE_ACTION` ("Snooze 10m"), `SKIP_ACTION` ("Skip").
3. Sounds: Custom bundled high-clarity chime played via notification payload.
4. Transparent UX Disclosure: The app honestly communicates on iOS < 26 that alarms depend on notification permissions and will not sound if the device is powered off or in silent mode unless Critical Alert entitlement is granted.

---

## 4. Single Source of Action Execution
Whether triggered by a full-screen alarm screen, a notification action button (`Taken`, `Snooze`, `Skip`), or the in-app Today dashboard:
- All paths execute the exact same domain action in `@medchain/domain`.
- All paths write to the local SQLite database in a single atomic transaction.
- Neither platform maintains divergent business logic or parallel counters.


## 6. Implemented Android behaviour (medchain-alarm module)

| Situation | Behaviour |
|---|---|
| Alarm time reached (any state, Doze) | `AlarmManager.setAlarmClock` fires `AlarmReceiver`, which posts a MAX-priority alarm-category notification on an alarm-stream channel (alarm volume, repeating sound until handled, 10 min timeout). |
| Phone locked/screen off + full-screen permission granted | Notification carries a full-screen intent: the app opens over the lock screen, turns the screen on, and shows the alarm screen (Taken / Remind me in 10 min / Skip) without unlocking. |
| Phone in use (unlocked) | Android shows it as a heads-up notification with the same three action buttons (the system decides; this is how call-style alerts behave). Tapping opens the alarm screen. |
| Full-screen permission not granted (Android 14+) | Falls back to the heads-up/lock-screen notification. Settings shows "Not allowed" and a button to the system page. |
| Exact-alarm permission revoked | Falls back to `setAndAllowWhileIdle` (may be minutes late); Settings shows "Not allowed". |
| Reboot / app update | `BootReceiver` re-arms stored alarms natively, without starting the app. Overdue by < 10 min fire immediately. |
| Clock or time-zone change | Stored instants are re-armed and the app is flagged to regenerate local-time schedules on next open. |
| Locked phone, user finishes | `endAlarmSession` turns show-when-locked off and moves the app to the background: no medicine data stays on the lock screen. Non-alarm launches never show over the lock screen. |

### Device test checklist (Android 14+, incl. Android 16)
1. Settings → Send Real Test Alarm (5s), lock the phone: screen turns on with the alarm screen.
2. Repeat unlocked: heads-up notification with 3 buttons.
3. Revoke "Full-screen notifications" in system settings: notification only, Settings shows Not Allowed.
4. Swipe the app away; set a dose 2 min ahead; it still rings. Reboot with a dose pending: it still rings.
5. Press Taken on the lock-screen alarm: recorded once, sound stops, app does not stay visible over the lock screen.
