package expo.modules.medchainalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import expo.modules.medchainalarm.widget.UpcomingDoseWidgetProvider

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: return
    val alarm = AlarmStore.get(context, id) ?: return

    // Keep the CPU awake just long enough to post the notification
    val wl = (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "medchain:alarm")
    wl.acquire(10_000L)
    try {
      // Allow the alarm screen over the lock screen BEFORE the system launches the full-screen intent.
      // (When the app process is not running, the manifest default already allows it.)
      AlarmSession.begin()
      AlarmNotifications.post(context, alarm)
    } finally {
      // The alarm has fired; the app re-plans the next ones when it next reconciles
      AlarmStore.remove(context, id)
      UpcomingDoseWidgetProvider.updateAll(context)
      if (wl.isHeld) wl.release()
    }
  }
}
