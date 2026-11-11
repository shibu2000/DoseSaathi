package expo.modules.medchainalarm

import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.media.MediaPlayer
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MedchainAlarmModule : Module() {
  private var sample: MediaPlayer? = null

  /** Alarm launch intents already turned into a session (so reopening the app later does not restart one). */
  private val consumedLaunches = HashSet<String>()

  private fun stopSampleInternal() {
    try {
      sample?.stop()
    } catch (e: Exception) {
    }
    sample?.release()
    sample = null
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun startSettings(intent: Intent) {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      context.startActivity(intent)
    } catch (e: Exception) {
      // Fall back to this app's general settings page
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }
  }

  private fun canUseFullScreenIntent(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return nm.canUseFullScreenIntent()
  }

  override fun definition() = ModuleDefinition {
    Name("MedchainAlarm")

    Function("getStatus") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val km = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      mapOf(
        "sdkInt" to Build.VERSION.SDK_INT,
        "canScheduleExactAlarms" to AlarmScheduler.canScheduleExact(context),
        "canUseFullScreenIntent" to canUseFullScreenIntent(),
        "notificationsEnabled" to NotificationManagerCompat.from(context).areNotificationsEnabled(),
        "ignoringBatteryOptimizations" to pm.isIgnoringBatteryOptimizations(context.packageName),
        "deviceLocked" to km.isKeyguardLocked
      )
    }

    AsyncFunction("schedule") { alarm: Map<String, Any?> ->
      val id = alarm["id"] as String
      AlarmScheduler.schedule(
        context,
        StoredAlarm(
          id = id,
          triggerAtMillis = (alarm["triggerAtMillis"] as Number).toLong(),
          occurrenceId = alarm["occurrenceId"] as String,
          medicationId = alarm["medicationId"] as String,
          title = alarm["title"] as String,
          body = alarm["body"] as String,
          soundEnabled = alarm["soundEnabled"] as? Boolean ?: true,
          vibrationEnabled = alarm["vibrationEnabled"] as? Boolean ?: true,
          voice = (alarm["voice"] as? String)?.takeIf { it == "male" || it == "female" } ?: "female"
        )
      )
    }

    AsyncFunction("cancel") { id: String -> AlarmScheduler.cancel(context, id) }

    AsyncFunction("cancelAll") { AlarmScheduler.cancelAll(context) }

    /** Stops the ringing notification for a dose the user has just handled. */
    AsyncFunction("dismiss") { id: String -> AlarmNotifications.dismiss(context, id) }

    Function("listScheduled") {
      AlarmStore.all(context).map {
        mapOf(
          "id" to it.id,
          "triggerAtMillis" to it.triggerAtMillis,
          "occurrenceId" to it.occurrenceId,
          "medicationId" to it.medicationId,
          "title" to it.title,
          "body" to it.body
        )
      }
    }

    /** Plays the recorded reminder so the user can hear a voice before choosing it. */
    AsyncFunction("playSample") { voice: String ->
      stopSampleInternal()
      val safe = if (voice == "male") "male" else "female"
      val res = context.resources.getIdentifier("medchain_reminder_" + safe, "raw", context.packageName)
      if (res == 0) throw IllegalStateException("The reminder recording is missing from this build")
      val mp = MediaPlayer.create(context, res) ?: throw IllegalStateException("Could not start the player")
      mp.setOnCompletionListener {
        it.release()
        if (sample === it) sample = null
      }
      sample = mp
      mp.start()
    }

    AsyncFunction("stopSample") { stopSampleInternal() }

    Function("getLastFire") { AlarmNotifications.lastFire(context) }

    Function("consumeNeedsReconcile") { AlarmStore.consumeNeedsReconcile(context) }

    AsyncFunction("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        startSettings(
          Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))
        )
      }
    }

    AsyncFunction("openFullScreenIntentSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startSettings(
          Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + context.packageName))
        )
      }
    }

    AsyncFunction("requestIgnoreBatteryOptimizations") {
      startSettings(
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + context.packageName))
      )
    }

    /**
     * Called when the user finishes with the alarm screen. Ends the alarm session (the app can no
     * longer appear over the lock screen) and, if the phone is still locked, sends the app to the
     * background so no medicine data is left visible there.
     */
    AsyncFunction("endAlarmSession") {
      val activity = appContext.currentActivity
      AlarmSession.attach(activity)
      AlarmSession.end()
      val km = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      if (km.isKeyguardLocked) activity?.moveTaskToBack(true)
    }

    OnCreate {
      AlarmSession.attach(appContext.currentActivity)
    }

    OnActivityEntersForeground {
      val activity = appContext.currentActivity
      AlarmSession.attach(activity)
      // A cold start straight from an alarm: the launch intent carries the marker
      if (activity?.intent?.getBooleanExtra(AlarmScheduler.EXTRA_ALARM_LAUNCH, false) == true && !AlarmSession.isActive()) {
        val alarmId = activity.intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID)
        if (alarmId != null && !consumedLaunches.contains(alarmId + "@" + activity.intent.filterHashCode())) {
          consumedLaunches.add(alarmId + "@" + activity.intent.filterHashCode())
          AlarmSession.begin()
        }
      }
      AlarmSession.sync()
    }

    OnNewIntent { intent ->
      AlarmSession.attach(appContext.currentActivity)
      if (intent.getBooleanExtra(AlarmScheduler.EXTRA_ALARM_LAUNCH, false)) AlarmSession.begin()
    }
  }
}
