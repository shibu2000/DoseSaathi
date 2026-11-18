package expo.modules.medchainalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import expo.modules.medchainalarm.widget.UpcomingDoseWidgetProvider

object AlarmScheduler {
  const val EXTRA_ALARM_ID = "medchain_alarm_id"
  const val EXTRA_ALARM_LAUNCH = "medchain_alarm_launch"

  fun notificationId(alarmId: String): Int = alarmId.hashCode()

  private fun alarmManager(c: Context) = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  fun canScheduleExact(c: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager(c).canScheduleExactAlarms()

  private fun firePendingIntent(c: Context, alarmId: String): PendingIntent {
    val intent = Intent(c, AlarmReceiver::class.java).apply {
      action = "expo.modules.medchainalarm.FIRE"
      data = Uri.parse("medchain-alarm://fire/$alarmId")
      putExtra(EXTRA_ALARM_ID, alarmId)
    }
    return PendingIntent.getBroadcast(
      c, notificationId(alarmId), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  /** Intent that opens the app straight onto the alarm screen for this dose. */
  fun launchIntent(c: Context, a: StoredAlarm, action: String? = null): Intent {
    val uri = StringBuilder("dosesaathi://alarm/").append(Uri.encode(a.occurrenceId))
    if (action != null) uri.append("?action=").append(action)
    return Intent(Intent.ACTION_VIEW, Uri.parse(uri.toString())).apply {
      setPackage(c.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(EXTRA_ALARM_LAUNCH, true)
      putExtra(EXTRA_ALARM_ID, a.id)
    }
  }

  /**
   * Registers the alarm with the OS kernel via AlarmManager.setAlarmClock (exempt from Doze).
   * Falls back to an inexact allow-while-idle alarm if the exact-alarm permission was revoked, so a
   * reminder is never silently dropped.
   */
  fun schedule(c: Context, a: StoredAlarm) {
    AlarmStore.put(c, a)
    val am = alarmManager(c)
    val fire = firePendingIntent(c, a.id)
    val show = PendingIntent.getActivity(
      c, notificationId(a.id) xor 0x5bd1e995, launchIntent(c, a),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    if (canScheduleExact(c)) {
      am.setAlarmClock(AlarmManager.AlarmClockInfo(a.triggerAtMillis, show), fire)
    } else {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.triggerAtMillis, fire)
    }
    UpcomingDoseWidgetProvider.updateAll(c)
  }

  fun cancel(c: Context, id: String) {
    alarmManager(c).cancel(firePendingIntent(c, id))
    AlarmStore.remove(c, id)
    AlarmNotifications.dismiss(c, id)
    UpcomingDoseWidgetProvider.updateAll(c)
  }

  /**
   * Cancels every armed alarm except snoozes still waiting in [AlarmActionQueue]: the app re-arms from
   * its database, which may not know about a snooze tapped a moment ago. A kept snooze is simply
   * re-armed again (same id) once the app has saved it.
   */
  fun cancelAll(c: Context) {
    val pendingSnoozes = AlarmActionQueue.all(c)
      .filter { it.action == AlarmActions.SNOOZED }
      .map { it.occurrenceId }
      .toSet()
    AlarmStore.all(c).forEach {
      if (it.occurrenceId in pendingSnoozes && it.triggerAtMillis > System.currentTimeMillis()) return@forEach
      alarmManager(c).cancel(firePendingIntent(c, it.id))
      AlarmNotifications.dismiss(c, it.id)
      AlarmStore.remove(c, it.id)
    }
    UpcomingDoseWidgetProvider.updateAll(c)
  }

  /** Re-arms everything still in the future; alarms that came due while the phone was off fire now. */
  fun rearmAll(c: Context) {
    val now = System.currentTimeMillis()
    AlarmStore.all(c).forEach { a ->
      if (a.triggerAtMillis > now) schedule(c, a)
      else if (now - a.triggerAtMillis < 10 * 60 * 1000L) AlarmNotifications.post(c, a)
      else AlarmStore.remove(c, a.id)
    }
    UpcomingDoseWidgetProvider.updateAll(c)
  }
}
