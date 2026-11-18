package expo.modules.medchainalarm

import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.media.MediaPlayer
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.medchainalarm.widget.UpcomingDoseWidgetProvider
import expo.modules.medchainalarm.widget.GlassUpcomingDoseWidgetProvider
import expo.modules.medchainalarm.widget.WidgetDataStore
import expo.modules.medchainalarm.widget.WidgetDoseData

class MedchainAlarmModule : Module() {
  private var sample: MediaPlayer? = null

  companion object {
    @Volatile private var live: MedchainAlarmModule? = null

    /**
     * Tells running JavaScript that alarm actions are waiting to be recorded. Returns false when no JS
     * listener is attached (app not running), so the caller can start the headless task instead.
     */
    fun notifyAlarmAction(): Boolean {
      val m = live ?: return false
      if (!m.observing) return false
      return try {
        m.sendEvent("onAlarmAction", mapOf("pending" to true))
        true
      } catch (e: Exception) {
        false
      }
    }

    /** Sound keys are file-name fragments (e.g. "signature_female"); anything else falls back to "female". */
    private val VOICE_KEY = Regex("^[a-z0-9_]{1,40}$")
  }

  @Volatile private var observing = false


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
          voice = (alarm["voice"] as? String)?.takeIf { VOICE_KEY.matches(it) } ?: "female",
          medicationName = alarm["medicationName"] as? String ?: "",
          dosageText = alarm["dosageText"] as? String ?: "",
          instructions = alarm["instructions"] as? String ?: "",
          scheduledAtMillis = (alarm["scheduledAtMillis"] as? Number)?.toLong() ?: 0L
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
      val res = AlarmNotifications.reminderRes(context, voice)
      if (res == 0) throw IllegalStateException("The reminder recording ($voice) is missing from this build")
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

    Function("canPinWidget") {
      UpcomingDoseWidgetProvider.canPin(context)
    }

    /** style: "scenic" or "glass"; when omitted, the glass widget is offered to users of the glass theme. */
    AsyncFunction("requestPinWidget") { style: String? ->
      val isGlass = when (style?.lowercase()) {
        "glass" -> true
        "scenic" -> false
        else -> WidgetDataStore.get(context)?.theme == "glassmorphism"
      }
      if (isGlass) {
        GlassUpcomingDoseWidgetProvider.requestPin(context)
      } else {
        UpcomingDoseWidgetProvider.requestPin(context)
      }
    }

    AsyncFunction("updateWidgetData") { data: Map<String, Any?> ->
      val hasUpcoming = data["hasUpcoming"] as? Boolean ?: false
      val currentTheme = data["theme"] as? String ?: (WidgetDataStore.get(context)?.theme ?: "nature")
      val isDark = data["isDark"] as? Boolean ?: (WidgetDataStore.get(context)?.isDark ?: false)
      val appearance = data["appearance"] as? String ?: (WidgetDataStore.get(context)?.appearance ?: "")
      if (hasUpcoming) {
        val doseData = WidgetDoseData(
          hasUpcoming = true,
          medicationName = data["medicationName"] as? String ?: "",
          dosageText = data["dosageText"] as? String ?: "",
          scheduledTimeStr = data["scheduledTimeStr"] as? String ?: "",
          triggerAtMillis = (data["triggerAtMillis"] as? Number)?.toLong() ?: 0L,
          occurrenceId = data["occurrenceId"] as? String ?: "",
          state = data["state"] as? String ?: "UPCOMING",
          theme = currentTheme,
          isDark = isDark,
          appearance = appearance
        )
        WidgetDataStore.save(context, doseData)
      } else {
        val doseData = WidgetDoseData(
          hasUpcoming = false,
          theme = currentTheme,
          isDark = isDark,
          appearance = appearance
        )
        WidgetDataStore.save(context, doseData)
      }
      UpcomingDoseWidgetProvider.updateAll(context)
    }

    AsyncFunction("refreshWidget") {
      UpcomingDoseWidgetProvider.updateAll(context)
    }

    /** Dynamically switches the launcher icon via Android activity-alias. */
    AsyncFunction("setAppIcon") { themeName: String ->
      try {
        val safeTheme = when (themeName.lowercase()) {
          "ocean" -> "ocean"
          "sunset" -> "sunset"
          "lavender" -> "lavender"
          else -> "nature"
        }

        val targetAlias = when (safeTheme) {
          "ocean" -> "com.dosesaathi.app.MainActivityOcean"
          "sunset" -> "com.dosesaathi.app.MainActivitySunset"
          "lavender" -> "com.dosesaathi.app.MainActivityLavender"
          else -> "com.dosesaathi.app.MainActivityNature"
        }

        val pm = context.packageManager
        val packageName = context.packageName

        // 1. Enable the target alias
        val targetComp = ComponentName(packageName, targetAlias)
        if (pm.getComponentEnabledSetting(targetComp) != PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
          pm.setComponentEnabledSetting(
            targetComp,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
          )
        }

        // 2. Disable all other aliases
        val allAliases = listOf(
          "com.dosesaathi.app.MainActivityNature",
          "com.dosesaathi.app.MainActivityOcean",
          "com.dosesaathi.app.MainActivitySunset",
          "com.dosesaathi.app.MainActivityLavender"
        )

        for (alias in allAliases) {
          if (alias != targetAlias) {
            val comp = ComponentName(packageName, alias)
            if (pm.getComponentEnabledSetting(comp) != PackageManager.COMPONENT_ENABLED_STATE_DISABLED) {
              pm.setComponentEnabledSetting(
                comp,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
              )
            }
          }
        }
      } catch (e: Exception) {
      }
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

    Events("onAlarmAction")

    OnStartObserving { observing = true }

    OnStopObserving { observing = false }

    /** Dose actions taken on the alarm screen or notification that the app has not saved yet. */
    Function("getPendingAlarmActions") {
      AlarmActionQueue.all(context).map { it.toMap() }
    }

    /** Removes actions the app has saved (or deliberately dropped). */
    Function("ackPendingAlarmActions") { ids: List<String> ->
      AlarmActionQueue.remove(context, ids)
    }

    OnCreate {
      live = this@MedchainAlarmModule
      AlarmSession.attach(appContext.currentActivity)
    }

    OnDestroy {
      if (live === this@MedchainAlarmModule) live = null
      observing = false
    }

    OnActivityEntersForeground {
      val activity = appContext.currentActivity
      AlarmSession.attach(activity)
      // The native AlarmActivity owns the lock screen. The app is only reached after unlocking, so it
      // never needs (and must never get) permission to show over the lock screen.
      AlarmSession.sync()
    }

    OnNewIntent { intent ->
      AlarmSession.attach(appContext.currentActivity)
      AlarmSession.sync()
    }
  }
}
