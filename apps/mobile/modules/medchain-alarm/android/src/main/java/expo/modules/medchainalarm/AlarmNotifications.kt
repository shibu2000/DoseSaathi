package expo.modules.medchainalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.app.KeyguardManager
import android.os.Build
import android.os.PowerManager
import org.json.JSONObject
import androidx.core.app.NotificationCompat

object AlarmNotifications {
  // v4: each voice/ringtone has its own immutable notification channel so user changes apply immediately
  private fun channelId(sound: Boolean, vibrate: Boolean, voice: String) =
    "medchain_dose_alarm_v4_" + voice + "_" + (if (sound) "s" else "x") + (if (vibrate) "v" else "x")

  /** The recorded reminder (res/raw/medchain_reminder_<voice>), or the system alarm tone if it is missing. */
  private fun reminderSound(c: Context, voice: String): android.net.Uri {
    var res = c.resources.getIdentifier("medchain_reminder_" + voice, "raw", c.packageName)
    if (res == 0) {
      val fallback = if (voice.contains("male")) "male" else "female"
      res = c.resources.getIdentifier("medchain_reminder_" + fallback, "raw", c.packageName)
    }
    return if (res != 0) android.net.Uri.parse("android.resource://" + c.packageName + "/" + res)
    else RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
  }

  private fun ensureChannel(c: Context, sound: Boolean, vibrate: Boolean, voice: String): String {
    val id = channelId(sound, vibrate, voice)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(id) == null) {
        val ch = NotificationChannel(id, "Medication alarms", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Time-critical alarms for scheduled medication doses"
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
          enableVibration(vibrate)
          if (vibrate) vibrationPattern = longArrayOf(0, 600, 300, 600, 300, 600)
          if (sound) {
            // Alarm stream: honours the alarm volume and plays even when media is muted
            setSound(
              reminderSound(c, voice),
              AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            )
          } else {
            setSound(null, null)
          }
        }
        nm.createNotificationChannel(ch)
      }
    }
    return id
  }

  private fun actionIntent(c: Context, a: StoredAlarm, action: String, requestSalt: Int): PendingIntent =
    PendingIntent.getActivity(
      c, AlarmScheduler.notificationId(a.id) + requestSalt,
      AlarmScheduler.launchIntent(c, a, action),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  /**
   * Posts the alarm. With the full-screen-intent permission the system shows the alarm screen over
   * the lock screen and turns the display on; when the phone is in use it appears as a heads-up
   * notification instead. Without the permission it is a normal high-priority notification.
   */
  fun post(c: Context, a: StoredAlarm) {
    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = ensureChannel(c, a.soundEnabled, a.vibrationEnabled, a.voice)
    val open = actionIntent(c, a, "open", 0)

    val b = NotificationCompat.Builder(c, channel)
      .setSmallIcon(c.applicationInfo.icon)
      .setContentTitle(a.title)
      .setContentText(a.body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(a.body))
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(open)
      .setWhen(a.triggerAtMillis)
      .setShowWhen(true)
      // Stop ringing after 10 minutes if nobody responds; the app then flags the dose as not confirmed
      .setTimeoutAfter(10 * 60 * 1000L)
      .addAction(0, "Taken", actionIntent(c, a, "taken", 1))
      .addAction(0, "Remind me in 10 min", actionIntent(c, a, "snooze", 2))
      .addAction(0, "Skip", actionIntent(c, a, "skip", 3))

    val canFullScreen = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || nm.canUseFullScreenIntent()
    if (canFullScreen) b.setFullScreenIntent(open, true)

    val pm = c.getSystemService(Context.POWER_SERVICE) as PowerManager
    val km = c.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    var outcome = "posted"
    try {
      val n = b.build()
      // Keep sounding until the user acts (stopped by cancelling the notification)
      if (a.soundEnabled) n.flags = n.flags or Notification.FLAG_INSISTENT
      n.flags = n.flags or Notification.FLAG_NO_CLEAR
      nm.notify(AlarmScheduler.notificationId(a.id), n)
    } catch (e: Exception) {
      outcome = "FAILED: " + e.javaClass.simpleName + ": " + (e.message ?: "")
    }
    recordFire(c, a, canFullScreen, pm.isInteractive, km.isKeyguardLocked, outcome, nm.areNotificationsEnabled())
  }

  /** Persists what Android was asked to do, so Settings can explain a missing full-screen alarm. */
  private fun recordFire(c: Context, a: StoredAlarm, canFsi: Boolean, screenOn: Boolean, locked: Boolean, outcome: String, notifEnabled: Boolean) {
    val o = JSONObject()
    o.put("firedAtMillis", System.currentTimeMillis())
    o.put("scheduledForMillis", a.triggerAtMillis)
    o.put("fullScreenIntentAllowed", canFsi)
    o.put("screenWasOn", screenOn)
    o.put("deviceWasLocked", locked)
    o.put("notificationsEnabled", notifEnabled)
    o.put("outcome", outcome)
    c.getSharedPreferences("medchain_alarms", Context.MODE_PRIVATE).edit().putString("last_fire", o.toString()).apply()
  }

  fun lastFire(c: Context): String? =
    c.getSharedPreferences("medchain_alarms", Context.MODE_PRIVATE).getString("last_fire", null)

  fun dismiss(c: Context, id: String) {
    (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(AlarmScheduler.notificationId(id))
  }
}
