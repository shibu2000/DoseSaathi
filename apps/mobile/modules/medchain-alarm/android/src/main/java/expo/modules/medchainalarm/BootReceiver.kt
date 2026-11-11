package expo.modules.medchainalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED" -> AlarmScheduler.rearmAll(context)
      Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED -> {
        // Alarms are absolute instants, but "08:00" is a local wall-clock rule: the app must regenerate them
        AlarmStore.setNeedsReconcile(context, true)
        AlarmScheduler.rearmAll(context)
      }
    }
  }
}
