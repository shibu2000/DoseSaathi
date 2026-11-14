package expo.modules.medchainalarm.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import expo.modules.medchainalarm.AlarmStore

class UpcomingDoseWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (widgetId in appWidgetIds) {
      updateAppWidget(context, appWidgetManager, widgetId)
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_REFRESH_WIDGET || intent.action == AppWidgetManager.ACTION_APPWIDGET_UPDATE) {
      val appWidgetManager = AppWidgetManager.getInstance(context)
      val ids = appWidgetManager.getAppWidgetIds(ComponentName(context, UpcomingDoseWidgetProvider::class.java))
      onUpdate(context, appWidgetManager, ids)
    }
  }

  companion object {
    const val ACTION_REFRESH_WIDGET = "expo.modules.medchainalarm.widget.REFRESH"
    private const val REQUEST_CODE_CLICK = 7701
    private const val REQUEST_CODE_SCHEDULE = 7702

    fun updateAll(context: Context) {
      try {
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val ids = appWidgetManager.getAppWidgetIds(ComponentName(context, UpcomingDoseWidgetProvider::class.java))
        if (ids.isNotEmpty()) {
          val provider = UpcomingDoseWidgetProvider()
          provider.onUpdate(context, appWidgetManager, ids)
        }
      } catch (e: Exception) {
        // Safe fallback in case widgets are uninstalled or disabled
      }
    }

    fun canPin(context: Context): Boolean {
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val am = context.getSystemService(AppWidgetManager::class.java)
        am?.isRequestPinAppWidgetSupported == true
      } else {
        false
      }
    }

    fun requestPin(context: Context): Boolean {
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val am = context.getSystemService(AppWidgetManager::class.java)
        if (am != null && am.isRequestPinAppWidgetSupported) {
          val provider = ComponentName(context, UpcomingDoseWidgetProvider::class.java)
          am.requestPinAppWidget(provider, null, null)
          true
        } else {
          false
        }
      } else {
        false
      }
    }

    fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
      val layoutId = context.resources.getIdentifier("widget_upcoming_dose", "layout", context.packageName)
      if (layoutId == 0) return

      val views = RemoteViews(context.packageName, layoutId)
      val now = System.currentTimeMillis()

      // 1. Resolve next dose from WidgetDataStore or fallback to native AlarmStore
      var medName = ""
      var dosageOrTime = ""
      var targetMillis = 0L
      var occurrenceId = ""
      var hasDose = false
      var isSnoozed = false

      val cached = WidgetDataStore.get(context)
      if (cached != null && cached.hasUpcoming && cached.triggerAtMillis > (now - 45 * 60 * 1000L)) {
        hasDose = true
        medName = cached.medicationName
        dosageOrTime = listOf(cached.scheduledTimeStr, cached.dosageText)
          .filter { it.isNotBlank() }
          .joinToString(" • ")
        targetMillis = cached.triggerAtMillis
        occurrenceId = cached.occurrenceId
        isSnoozed = cached.state == "SNOOZED"
      } else {
        // Fall back to AlarmStore
        val nextAlarm = AlarmStore.all(context).firstOrNull { it.triggerAtMillis >= (now - 5 * 60 * 1000L) }
        if (nextAlarm != null) {
          hasDose = true
          medName = nextAlarm.title
          dosageOrTime = nextAlarm.body
          targetMillis = nextAlarm.triggerAtMillis
          occurrenceId = nextAlarm.occurrenceId
        }
      }

      // View ID lookups
      val doseContainerId = context.resources.getIdentifier("widget_dose_container", "id", context.packageName)
      val emptyContainerId = context.resources.getIdentifier("widget_empty_container", "id", context.packageName)
      val medNameId = context.resources.getIdentifier("widget_med_name", "id", context.packageName)
      val dosageTimeId = context.resources.getIdentifier("widget_time_dosage", "id", context.packageName)
      val countdownBadgeId = context.resources.getIdentifier("widget_countdown_badge", "id", context.packageName)

      // Theme-aware Drawable ID lookups
      val isGlassTheme = (cached?.theme == "glassmorphism")
      val badgeGlassRes = context.resources.getIdentifier("widget_badge_glass", "drawable", context.packageName)
      val defaultUpcomingRes = context.resources.getIdentifier("widget_badge_upcoming", "drawable", context.packageName)
      val badgeUpcomingRes = if (isGlassTheme && badgeGlassRes != 0) badgeGlassRes else defaultUpcomingRes
      val badgeDueRes = context.resources.getIdentifier("widget_badge_due", "drawable", context.packageName)

      if (hasDose && medName.isNotBlank()) {
        val diffMs = targetMillis - now
        val countdownText: String
        val isDue: Boolean

        if (diffMs <= 0) {
          isDue = true
          val minsAgo = (-diffMs) / 60_000L
          countdownText = if (minsAgo < 5) "Due now" else "Due ${minsAgo}m ago"
        } else {
          isDue = false
          val totalMinutes = (diffMs + 59_999L) / 60_000L
          if (isSnoozed) {
            countdownText = "Snoozed • in next ${totalMinutes} min"
          } else if (totalMinutes < 60L) {
            countdownText = "in next ${totalMinutes} min"
          } else {
            val hours = totalMinutes / 60L
            val remainingMins = totalMinutes % 60L
            countdownText = if (remainingMins == 0L) {
              if (hours == 1L) "in next 1 hour" else "in next ${hours} hours"
            } else {
              "in next ${hours}h ${remainingMins}m"
            }
          }
        }

        if (doseContainerId != 0) views.setViewVisibility(doseContainerId, View.VISIBLE)
        if (emptyContainerId != 0) views.setViewVisibility(emptyContainerId, View.GONE)
        if (medNameId != 0) views.setTextViewText(medNameId, medName)
        if (dosageTimeId != 0) views.setTextViewText(dosageTimeId, dosageOrTime)

        if (countdownBadgeId != 0) {
          views.setTextViewText(countdownBadgeId, countdownText)
          if (isDue && badgeDueRes != 0) {
            views.setInt(countdownBadgeId, "setBackgroundResource", badgeDueRes)
            views.setTextColor(countdownBadgeId, 0xFFA33E38.toInt()) // brand danger red
          } else if (badgeUpcomingRes != 0) {
            views.setInt(countdownBadgeId, "setBackgroundResource", badgeUpcomingRes)
            views.setTextColor(countdownBadgeId, 0xFF006156.toInt()) // brand primary teal
          }
        }

        // Schedule next refresh when the dose becomes due
        scheduleNextRefresh(context, targetMillis)
      } else {
        // Empty state: All caught up
        if (doseContainerId != 0) views.setViewVisibility(doseContainerId, View.GONE)
        if (emptyContainerId != 0) views.setViewVisibility(emptyContainerId, View.VISIBLE)
        if (countdownBadgeId != 0) {
          views.setTextViewText(countdownBadgeId, "✓ All done")
          if (badgeUpcomingRes != 0) {
            views.setInt(countdownBadgeId, "setBackgroundResource", badgeUpcomingRes)
            views.setTextColor(countdownBadgeId, 0xFF006156.toInt())
          }
        }
      }

      // Tap Intent -> Opens DoseSaathi actual app home screen
      val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        action = Intent.ACTION_MAIN
        addCategory(Intent.CATEGORY_LAUNCHER)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      } ?: Intent(Intent.ACTION_VIEW, Uri.parse("dosesaathi://today")).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }

      val pendingIntent = PendingIntent.getActivity(
        context,
        REQUEST_CODE_CLICK,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

      val rootId = context.resources.getIdentifier("widget_root_layout", "id", context.packageName)
      if (rootId != 0) {
        views.setOnClickPendingIntent(rootId, pendingIntent)
        val bgDrawableName = if (isGlassTheme) "widget_bg_glass" else "widget_bg"
        val bgDrawableRes = context.resources.getIdentifier(bgDrawableName, "drawable", context.packageName)
        if (bgDrawableRes != 0) {
          views.setInt(rootId, "setBackgroundResource", bgDrawableRes)
        }
      }

      appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun scheduleNextRefresh(context: Context, targetMillis: Long) {
      val now = System.currentTimeMillis()
      if (targetMillis <= now) return

      try {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, UpcomingDoseWidgetProvider::class.java).apply {
          action = ACTION_REFRESH_WIDGET
        }
        val pi = PendingIntent.getBroadcast(
          context,
          REQUEST_CODE_SCHEDULE,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Wake up right at the moment the dose becomes due so countdown immediately says "Due now"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, targetMillis, pi)
        } else {
          am.setExact(AlarmManager.RTC_WAKEUP, targetMillis, pi)
        }
      } catch (e: Exception) {
        // AlarmManager exception safeguard
      }
    }
  }
}
