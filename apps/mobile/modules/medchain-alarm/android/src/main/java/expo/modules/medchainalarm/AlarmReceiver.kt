package expo.modules.medchainalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import expo.modules.medchainalarm.widget.UpcomingDoseWidgetProvider

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: return
    val alarm = AlarmStore.get(context, id) ?: return
    val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager

    // Keep the CPU awake just long enough to post the notification
    val cpu = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "medchain:alarm")
    cpu.acquire(10_000L)

    // Light the display. The full-screen intent normally does this, but several Android skins
    // (MIUI/HyperOS, Funtouch, ColorOS) suppress it on the lock screen; this keeps the screen on so
    // the alarm screen or the heads-up notification is actually seen.
    @Suppress("DEPRECATION")
    val screen = pm.newWakeLock(
      PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
      "medchain:alarm-screen"
    )
    try {
      screen.acquire(SCREEN_ON_MS)
      screenWake = screen
    } catch (e: Exception) {
      Log.w(TAG, "Could not wake the screen", e)
    }

    try {
      // The native AlarmActivity owns the lock screen; the app itself is only opened after unlocking.
      AlarmNotifications.post(context, alarm)
      // With "Display over other apps" granted, Android lets us open the alarm screen directly. This
      // backs up the full-screen intent on phones that block it; if both arrive, the screen just updates.
      if (Settings.canDrawOverlays(context)) {
        try {
          context.startActivity(AlarmActivity.intent(context, alarm))
        } catch (e: Exception) {
          Log.w(TAG, "Direct alarm screen start was blocked", e)
        }
      }
    } finally {
      // The alarm has fired; the app re-plans the next ones when it next reconciles
      AlarmStore.remove(context, id)
      UpcomingDoseWidgetProvider.updateAll(context)
      if (cpu.isHeld) cpu.release()
    }
  }

  companion object {
    private const val TAG = "MedchainAlarm"
    private const val SCREEN_ON_MS = 12_000L

    @Volatile private var screenWake: PowerManager.WakeLock? = null

    /** The user has acted: let the screen time out normally instead of holding it lit. */
    fun releaseScreenWake() {
      try {
        screenWake?.let { if (it.isHeld) it.release() }
      } catch (e: Exception) {
      }
      screenWake = null
    }
  }
}
