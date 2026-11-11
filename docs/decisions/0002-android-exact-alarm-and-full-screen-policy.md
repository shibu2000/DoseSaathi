# ADR 0002: Android Exact Alarm and Full-Screen Intent Policy

**Status:** Approved  
**Date:** 8 November 2026  

### Context
Android 12+ (API 31) and Android 14+ (API 34) introduce strict platform restrictions on `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, and `USE_FULL_SCREEN_INTENT`. Google Play policy rejects applications declaring `USE_EXACT_ALARM` unless their primary application category is an alarm clock, timer, or calendar.

### Decision
1. **Exact Alarm Permission**:
   - The app will declare `android.permission.SCHEDULE_EXACT_ALARM` in `AndroidManifest.xml` rather than `USE_EXACT_ALARM`.
   - On Android 13+, the app checks `alarmManager.canScheduleExactAlarms()`.
   - If granted: uses `AlarmManager.setAlarmClock()`.
   - If not granted: routes user to system permission settings via `Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM` and provides an honest fallback using high-priority inexact notifications.
2. **Full-Screen Intent**:
   - The app checks `NotificationManagerCompat.canUseFullScreenIntent()`.
   - If allowed: invokes the full-screen alarm activity upon trigger.
   - If disallowed: falls back to heads-up notification with action buttons (`Taken`, `Snooze 10m`, `Skip`).
3. **Reconciliation**:
   - Native `BroadcastReceiver` listens to `BOOT_COMPLETED`, `TIMEZONE_CHANGED`, and `TIME_SET` to re-register pending alarms in `AlarmManager` directly from local SQLite.
