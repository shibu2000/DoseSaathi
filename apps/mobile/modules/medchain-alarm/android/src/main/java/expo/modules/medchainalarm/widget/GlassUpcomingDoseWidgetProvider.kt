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
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import expo.modules.medchainalarm.AlarmStore

class GlassUpcomingDoseWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (widgetId in appWidgetIds) {
      updateAppWidget(context, appWidgetManager, widgetId)
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_REFRESH_WIDGET || intent.action == AppWidgetManager.ACTION_APPWIDGET_UPDATE) {
      val appWidgetManager = AppWidgetManager.getInstance(context)
      val ids = appWidgetManager.getAppWidgetIds(ComponentName(context, GlassUpcomingDoseWidgetProvider::class.java))
      onUpdate(context, appWidgetManager, ids)
    }
  }

  companion object {
    const val ACTION_REFRESH_WIDGET = "expo.modules.medchainalarm.widget.GLASS_REFRESH"
    private const val REQUEST_CODE_CLICK = 7801
    private const val REQUEST_CODE_SCHEDULE = 7802

    fun updateAll(context: Context) {
      try {
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val ids = appWidgetManager.getAppWidgetIds(ComponentName(context, GlassUpcomingDoseWidgetProvider::class.java))
        if (ids.isNotEmpty()) {
          val provider = GlassUpcomingDoseWidgetProvider()
          provider.onUpdate(context, appWidgetManager, ids)
        }
      } catch (e: Exception) {
        // Safe fallback
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
          val provider = ComponentName(context, GlassUpcomingDoseWidgetProvider::class.java)
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
      val layoutId = context.resources.getIdentifier("widget_glass_upcoming_dose", "layout", context.packageName)
      if (layoutId == 0) return

      val views = RemoteViews(context.packageName, layoutId)
      val now = System.currentTimeMillis()

      // 1. Resolve dose data
      var medName = ""
      var scheduledTimeStr = ""
      var dosageText = ""
      var targetMillis = 0L
      var hasDose = false
      var isSnoozed = false

      val cached = WidgetDataStore.get(context)
      if (cached != null && cached.hasUpcoming && cached.triggerAtMillis > (now - 45 * 60 * 1000L)) {
        hasDose = true
        medName = cached.medicationName
        scheduledTimeStr = cached.scheduledTimeStr
        dosageText = cached.dosageText
        targetMillis = cached.triggerAtMillis
        isSnoozed = cached.state == "SNOOZED"
      } else {
        val nextAlarm = AlarmStore.all(context).firstOrNull { it.triggerAtMillis >= (now - 5 * 60 * 1000L) }
        if (nextAlarm != null) {
          hasDose = true
          medName = nextAlarm.title
          dosageText = nextAlarm.body
          targetMillis = nextAlarm.triggerAtMillis
        }
      }

      // 2. Resolve Theme & Dynamic Palette
      val themeConfig = UpcomingDoseWidgetProvider.resolveTheme(cached?.theme, cached?.isDark == true)
      val pkg = context.packageName
      val isDark = themeConfig.isDark

      // View IDs
      val rootId = context.resources.getIdentifier("widget_glass_root_layout", "id", pkg)
      val brandIconId = context.resources.getIdentifier("widget_glass_brand_icon", "id", pkg)
      val statusPillId = context.resources.getIdentifier("widget_glass_status_pill", "id", pkg)
      val doseContainerId = context.resources.getIdentifier("widget_glass_dose_container", "id", pkg)
      val medNameId = context.resources.getIdentifier("widget_glass_med_name", "id", pkg)
      val timeChipId = context.resources.getIdentifier("widget_glass_time_chip", "id", pkg)
      val clockIconId = context.resources.getIdentifier("widget_glass_clock_icon", "id", pkg)
      val timeTextId = context.resources.getIdentifier("widget_glass_time_text", "id", pkg)
      val dosageId = context.resources.getIdentifier("widget_glass_dosage", "id", pkg)
      val chronometerId = context.resources.getIdentifier("widget_glass_chronometer", "id", pkg)
      val countdownBadgeId = context.resources.getIdentifier("widget_glass_countdown_badge", "id", pkg)
      val emptyContainerId = context.resources.getIdentifier("widget_glass_empty_container", "id", pkg)
      val emptyTitleId = context.resources.getIdentifier("widget_glass_empty_title", "id", pkg)
      val emptySubtitleId = context.resources.getIdentifier("widget_glass_empty_subtitle", "id", pkg)

      // Apply Apple Glass Root Background
      val bgRes = context.resources.getIdentifier(
        if (isDark) "widget_bg_apple_glass_dark" else "widget_bg_apple_glass",
        "drawable", pkg
      )
      if (rootId != 0 && bgRes != 0) {
        views.setInt(rootId, "setBackgroundResource", bgRes)
      }

      // Dynamic Theme Launcher Icon
      val iconName = when (themeConfig.themeName) {
        "ocean" -> "ic_launcher_ocean_round"
        "sunset" -> "ic_launcher_sunset_round"
        "lavender" -> "ic_launcher_lavender_round"
        else -> "ic_launcher_nature_round"
      }
      var iconRes = context.resources.getIdentifier(iconName, "mipmap", pkg)
      if (iconRes == 0) iconRes = context.resources.getIdentifier("ic_launcher_round", "mipmap", pkg)
      if (brandIconId != 0 && iconRes != 0) {
        views.setImageViewResource(brandIconId, iconRes)
      }

      // Frosted Glass Badges
      val badgeGlassRes = context.resources.getIdentifier(
        if (isDark) "widget_badge_glass_dark" else "widget_badge_glass",
        "drawable", pkg
      )
      val badgeDueRes = context.resources.getIdentifier("widget_badge_due", "drawable", pkg)
      val timeChipRes = context.resources.getIdentifier(
        if (isDark) "widget_time_chip_glass_dark" else "widget_time_chip_glass",
        "drawable", pkg
      )

      if (hasDose && medName.isNotBlank()) {
        val diffMs = targetMillis - now
        val isDue = diffMs <= 0

        if (doseContainerId != 0) views.setViewVisibility(doseContainerId, View.VISIBLE)
        if (emptyContainerId != 0) views.setViewVisibility(emptyContainerId, View.GONE)

        if (medNameId != 0) {
          views.setTextViewText(medNameId, medName)
          views.setTextColor(medNameId, themeConfig.textPrimaryColor)
        }

        if (dosageId != 0) {
          views.setTextViewText(dosageId, dosageText)
          views.setTextColor(dosageId, themeConfig.textSecondaryColor)
        }

        if (timeChipId != 0 && scheduledTimeStr.isNotBlank()) {
          views.setViewVisibility(timeChipId, View.VISIBLE)
          if (timeChipRes != 0) views.setInt(timeChipId, "setBackgroundResource", timeChipRes)
          if (timeTextId != 0) {
            views.setTextViewText(timeTextId, scheduledTimeStr)
            views.setTextColor(timeTextId, themeConfig.primaryColor)
          }
          if (clockIconId != 0) {
            views.setInt(clockIconId, "setColorFilter", themeConfig.primaryColor)
          }
        } else if (timeChipId != 0) {
          views.setViewVisibility(timeChipId, View.GONE)
        }

        if (isDue) {
          if (chronometerId != 0) views.setViewVisibility(chronometerId, View.GONE)
          val minsAgo = (-diffMs) / 60_000L
          val dueText = if (minsAgo < 5) "🚨 DUE NOW • Take Medicine" else "🚨 Due ${minsAgo}m ago • Take Medicine"
          if (countdownBadgeId != 0) {
            views.setViewVisibility(countdownBadgeId, View.VISIBLE)
            views.setTextViewText(countdownBadgeId, dueText)
            if (badgeDueRes != 0) views.setInt(countdownBadgeId, "setBackgroundResource", badgeDueRes)
            views.setTextColor(countdownBadgeId, 0xFFFFFFFF.toInt())
          }
          if (statusPillId != 0) {
            views.setTextViewText(statusPillId, "🚨 TIME TO TAKE")
            if (badgeDueRes != 0) views.setInt(statusPillId, "setBackgroundResource", badgeDueRes)
            views.setTextColor(statusPillId, 0xFFFFFFFF.toInt())
          }
          scheduleNextRefresh(context, now + 5 * 60 * 1000L)
        } else {
          val remainingMs = diffMs
          val base = SystemClock.elapsedRealtime() + remainingMs

          if (countdownBadgeId != 0) views.setViewVisibility(countdownBadgeId, View.GONE)

          if (chronometerId != 0) {
            views.setViewVisibility(chronometerId, View.VISIBLE)
            val formatStr = if (isSnoozed) "💤 Snoozed • in %s" else "⏳ Due in %s"
            views.setChronometer(chronometerId, base, formatStr, true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
              views.setChronometerCountDown(chronometerId, true)
            }
            if (badgeGlassRes != 0) views.setInt(chronometerId, "setBackgroundResource", badgeGlassRes)
            val textColor = if (isSnoozed) {
              if (isDark) 0xFFFBBF24.toInt() else 0xFFB45309.toInt()
            } else {
              themeConfig.primaryColor
            }
            views.setTextColor(chronometerId, textColor)
          }

          if (statusPillId != 0) {
            views.setTextViewText(statusPillId, if (isSnoozed) "💤 SNOOZED" else "NEXT DOSE")
            if (badgeGlassRes != 0) views.setInt(statusPillId, "setBackgroundResource", badgeGlassRes)
            val textColor = if (isSnoozed) {
              if (isDark) 0xFFFBBF24.toInt() else 0xFFB45309.toInt()
            } else {
              themeConfig.primaryColor
            }
            views.setTextColor(statusPillId, textColor)
          }

          scheduleNextRefresh(context, targetMillis)
        }
      } else {
        // Empty State: All Doses Done
        if (doseContainerId != 0) views.setViewVisibility(doseContainerId, View.GONE)
        if (emptyContainerId != 0) views.setViewVisibility(emptyContainerId, View.VISIBLE)

        if (emptyTitleId != 0) views.setTextColor(emptyTitleId, themeConfig.textPrimaryColor)
        if (emptySubtitleId != 0) views.setTextColor(emptySubtitleId, themeConfig.textSecondaryColor)

        if (statusPillId != 0) {
          views.setTextViewText(statusPillId, "✓ ALL DONE")
          if (badgeGlassRes != 0) views.setInt(statusPillId, "setBackgroundResource", badgeGlassRes)
          views.setTextColor(statusPillId, themeConfig.primaryColor)
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

      if (rootId != 0) {
        views.setOnClickPendingIntent(rootId, pendingIntent)
      }

      appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun scheduleNextRefresh(context: Context, targetMillis: Long) {
      val now = System.currentTimeMillis()
      if (targetMillis <= now) return

      try {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, GlassUpcomingDoseWidgetProvider::class.java).apply {
          action = ACTION_REFRESH_WIDGET
        }
        val pi = PendingIntent.getBroadcast(
          context,
          REQUEST_CODE_SCHEDULE,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, targetMillis, pi)
        } else {
          am.setExact(AlarmManager.RTC_WAKEUP, targetMillis, pi)
        }
      } catch (e: Exception) {
        // Safeguard
      }
    }
  }
}
