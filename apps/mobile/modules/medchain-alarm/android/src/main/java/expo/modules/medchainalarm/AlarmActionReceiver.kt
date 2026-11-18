package expo.modules.medchainalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Notification buttons (Taken / Snooze / Skip): handled without opening any screen. */
class AlarmActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val raw = intent.getStringExtra(EXTRA_ALARM_JSON) ?: return
    val alarm = StoredAlarm.fromJson(raw) ?: return
    val action = intent.getStringExtra(EXTRA_ACTION) ?: return
    val minutes = intent.getIntExtra(EXTRA_MINUTES, 10)
    val pending = goAsync()
    try {
      AlarmActions.handle(context, alarm, action, minutes)
    } finally {
      pending.finish()
    }
  }

  companion object {
    const val EXTRA_ALARM_JSON = "medchain_alarm_json"
    const val EXTRA_ACTION = "medchain_alarm_action"
    const val EXTRA_MINUTES = "medchain_alarm_minutes"

    fun alarmJson(a: StoredAlarm): String = a.toJson()
  }
}
