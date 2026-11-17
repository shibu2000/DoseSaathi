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

    private data class WidgetThemeColors(
      val bgDrawableName: String,
      val primaryColor: Int,
      val textPrimaryColor: Int,
      val textSecondaryColor: Int,
      val isDark: Boolean
    )

    private fun resolveTheme(theme: String?, isDark: Boolean): WidgetThemeColors {
      val norm = (theme ?: "nature").lowercase()
      return when {
        norm.contains("ocean") -> if (isDark) {
          WidgetThemeColors("widget_bg_ocean_dark", 0xFF4EA1E3.toInt(), 0xFFF0F7FD.toInt(), 0xFF8AAAC8.toInt(), true)
        } else {
          WidgetThemeColors("widget_bg_ocean", 0xFF1E517B.toInt(), 0xFF182633.toInt(), 0xFF53677A.toInt(), false)
        }
        norm.contains("sunset") -> if (isDark) {
          WidgetThemeColors("widget_bg_sunset_dark", 0xFFE87A5B.toInt(), 0xFFFDF6F3.toInt(), 0xFFBA9B91.toInt(), true)
        } else {
          WidgetThemeColors("widget_bg_sunset", 0xFFA8482A.toInt(), 0xFF331F19.toInt(), 0xFF7A5B52.toInt(), false)
        }
        norm.contains("lavender") -> if (isDark) {
          WidgetThemeColors("widget_bg_lavender_dark", 0xFFA57DCE.toInt(), 0xFFFAF6FD.toInt(), 0xFFB4A1C8.toInt(), true)
        } else {
          WidgetThemeColors("widget_bg_lavender", 0xFF5D437A.toInt(), 0xFF291E33.toInt(), 0xFF69567D.toInt(), false)
        }
        norm.contains("glass") -> if (isDark) {
          WidgetThemeColors("widget_bg_glass_dark", 0xFF38B2A3.toInt(), 0xFFF0FDFC.toInt(), 0xFF96ABA3.toInt(), true)
        } else {
          WidgetThemeColors("widget_bg_glass", 0xFF006156.toInt(), 0xFF1F302C.toInt(), 0xFF58645F.toInt(), false)
        }
        else -> if (isDark) { // Nature & Classic
          WidgetThemeColors("widget_bg_nature_dark", 0xFF38B2A3.toInt(), 0xFFF0FDFC.toInt(), 0xFF96ABA3.toInt(), true)
        } else {
          WidgetThemeColors("widget_bg_nature", 0xFF006156.toInt(), 0xFF1F302C.toInt(), 0xFF58645F.toInt(), false)
        }
      }
    }

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

      // 1. Resolve dose data from WidgetDataStore or fallback to AlarmStore
      var medName = ""
      var scheduledTimeStr = ""
      var dosageText = ""
      var targetMillis = 0L
      var occurrenceId = ""
      var hasDose = false
      var isSnoozed = false

      val cached = WidgetDataStore.get(context)
      if (cached != null && cached.hasUpcoming && cached.triggerAtMillis > (now - 45 * 60 * 1000L)) {
        hasDose = true
        medName = cached.medicationName
        scheduledTimeStr = cached.scheduledTimeStr
        dosageText = cached.dosageText
        targetMillis = cached.triggerAtMillis
        occurrenceId = cached.occurrenceId
        isSnoozed = cached.state == "SNOOZED"
      } else {
        // Fall back to AlarmStore
        val nextAlarm = AlarmStore.all(context).firstOrNull { it.triggerAtMillis >= (now - 5 * 60 * 1000L) }
        if (nextAlarm != null) {
          hasDose = true
          medName = nextAlarm.title
          dosageText = nextAlarm.body
          targetMillis = nextAlarm.triggerAtMillis
          occurrenceId = nextAlarm.occurrenceId
        }
      }

      // 2. Resolve Theme & Dynamic Palette
      val themeConfig = resolveTheme(cached?.theme, cached?.isDark == true)
      val pkg = context.packageName

      // View ID Lookups
      val rootId = context.resources.getIdentifier("widget_root_layout", "id", pkg)
      val brandTextId = context.resources.getIdentifier("widget_brand_name", "id", pkg)
      val statusPillId = context.resources.getIdentifier("widget_status_pill", "id", pkg)
      val doseContainerId = context.resources.getIdentifier("widget_dose_container", "id", pkg)
      val emptyContainerId = context.resources.getIdentifier("widget_empty_container", "id", pkg)
      val iconContainerId = context.resources.getIdentifier("widget_icon_container", "id", pkg)
      val iconPillImageId = context.resources.getIdentifier("widget_icon_pill_image", "id", pkg)
      val medNameId = context.resources.getIdentifier("widget_med_name", "id", pkg)
      val timeChipId = context.resources.getIdentifier("widget_time_chip", "id", pkg)
      val timeChipClockIconId = context.resources.getIdentifier("widget_time_clock_icon", "id", pkg)
      val timeChipTextId = context.resources.getIdentifier("widget_time_chip_text", "id", pkg)
      val dosageTextId = context.resources.getIdentifier("widget_time_dosage", "id", pkg)
      val chronometerId = context.resources.getIdentifier("widget_chronometer", "id", pkg)
      val countdownBadgeId = context.resources.getIdentifier("widget_countdown_badge", "id", pkg)
      val emptyTitleId = context.resources.getIdentifier("widget_empty_title", "id", pkg)
      val emptySubtitleId = context.resources.getIdentifier("widget_empty_subtitle", "id", pkg)
      val footerLabelId = context.resources.getIdentifier("widget_footer_label", "id", pkg)
      val footerButtonId = context.resources.getIdentifier("widget_footer_button", "id", pkg)

      // Theme-Specific Drawable Resources
      var bgRes = context.resources.getIdentifier(themeConfig.bgDrawableName, "drawable", pkg)
      if (bgRes == 0) bgRes = context.resources.getIdentifier("widget_bg", "drawable", pkg)

      val isDark = themeConfig.isDark
      var badgeUpcomingRes = context.resources.getIdentifier(
        if (isDark) "widget_badge_upcoming_dark" else "widget_badge_upcoming",
        "drawable", pkg
      )
      if (badgeUpcomingRes == 0) badgeUpcomingRes = context.resources.getIdentifier("widget_badge_upcoming", "drawable", pkg)

      val badgeDueRes = context.resources.getIdentifier("widget_badge_due", "drawable", pkg)

      var badgeSnoozedRes = context.resources.getIdentifier(
        if (isDark) "widget_badge_snoozed_dark" else "widget_badge_snoozed",
        "drawable", pkg
      )
      if (badgeSnoozedRes == 0) badgeSnoozedRes = badgeUpcomingRes

      var timeChipRes = context.resources.getIdentifier(
        if (isDark) "widget_time_chip_dark" else "widget_time_chip",
        "drawable", pkg
      )
      var pillIconBgRes = context.resources.getIdentifier(
        if (isDark) "widget_pill_icon_bg_dark" else "widget_pill_icon_bg",
        "drawable", pkg
      )
      var footerBtnRes = context.resources.getIdentifier(
        if (isDark) "widget_footer_button_dark" else "widget_footer_button",
        "drawable", pkg
      )

      // Apply Root Background
      if (rootId != 0 && bgRes != 0) {
        views.setInt(rootId, "setBackgroundResource", bgRes)
      }

      // Apply Header Branding Colors
      if (brandTextId != 0) {
        views.setTextColor(brandTextId, themeConfig.primaryColor)
      }

      if (hasDose && medName.isNotBlank()) {
        val diffMs = targetMillis - now
        val isDue = diffMs <= 0

        // Show Dose Container, Hide Empty Container
        if (doseContainerId != 0) views.setViewVisibility(doseContainerId, View.VISIBLE)
        if (emptyContainerId != 0) views.setViewVisibility(emptyContainerId, View.GONE)

        // Medicine Name
        if (medNameId != 0) {
          views.setTextViewText(medNameId, medName)
          views.setTextColor(medNameId, themeConfig.textPrimaryColor)
        }

        // Dosage Text
        if (dosageTextId != 0) {
          views.setTextViewText(dosageTextId, dosageText)
          views.setTextColor(dosageTextId, themeConfig.textSecondaryColor)
        }

        // Scheduled Time Chip
        if (timeChipId != 0 && scheduledTimeStr.isNotBlank()) {
          views.setViewVisibility(timeChipId, View.VISIBLE)
          if (timeChipRes != 0) views.setInt(timeChipId, "setBackgroundResource", timeChipRes)
          if (timeChipTextId != 0) {
            views.setTextViewText(timeChipTextId, scheduledTimeStr)
            views.setTextColor(timeChipTextId, themeConfig.primaryColor)
          }
          if (timeChipClockIconId != 0) {
            views.setInt(timeChipClockIconId, "setColorFilter", themeConfig.primaryColor)
          }
        } else if (timeChipId != 0) {
          views.setViewVisibility(timeChipId, View.GONE)
        }

        // Medication Icon Container & Tint
        if (iconContainerId != 0 && pillIconBgRes != 0) {
          views.setInt(iconContainerId, "setBackgroundResource", pillIconBgRes)
        }
        if (iconPillImageId != 0) {
          views.setInt(iconPillImageId, "setColorFilter", themeConfig.primaryColor)
        }

        if (isDue) {
          // ==================== 1. DUE NOW ALERT STATE ====================
          // Hide Chronometer, show vivid Due badge
          if (chronometerId != 0) views.setViewVisibility(chronometerId, View.GONE)

          val minsAgo = (-diffMs) / 60_000L
          val dueText = if (minsAgo < 5) "🚨 DUE NOW • Take Medicine" else "🚨 Due ${minsAgo}m ago • Take Medicine"

          if (countdownBadgeId != 0) {
            views.setViewVisibility(countdownBadgeId, View.VISIBLE)
            views.setTextViewText(countdownBadgeId, dueText)
            if (badgeDueRes != 0) views.setInt(countdownBadgeId, "setBackgroundResource", badgeDueRes)
            views.setTextColor(countdownBadgeId, 0xFFFFFFFF.toInt()) // Crisp white text on vivid red
          }

          if (statusPillId != 0) {
            views.setTextViewText(statusPillId, "🚨 TIME TO TAKE")
            if (badgeDueRes != 0) views.setInt(statusPillId, "setBackgroundResource", badgeDueRes)
            views.setTextColor(statusPillId, 0xFFFFFFFF.toInt())
          }

          // Schedule refresh in 5 minutes to keep overdue minutes updated
          scheduleNextRefresh(context, now + 5 * 60 * 1000L)
        } else {
          // ==================== 2. UPCOMING / SNOOZED LIVE COUNTDOWN ====================
          // Use Android's native Chronometer counting down every second
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

            val badgeRes = if (isSnoozed) badgeSnoozedRes else badgeUpcomingRes
            if (badgeRes != 0) views.setInt(chronometerId, "setBackgroundResource", badgeRes)

            val textColor = if (isSnoozed) {
              if (isDark) 0xFFFBBF24.toInt() else 0xFFB45309.toInt() // Amber
            } else {
              themeConfig.primaryColor
            }
            views.setTextColor(chronometerId, textColor)
          }

          if (statusPillId != 0) {
            views.setTextViewText(statusPillId, if (isSnoozed) "💤 SNOOZED" else "UPCOMING DOSE")
            val badgeRes = if (isSnoozed) badgeSnoozedRes else badgeUpcomingRes
            if (badgeRes != 0) views.setInt(statusPillId, "setBackgroundResource", badgeRes)
            val textColor = if (isSnoozed) {
              if (isDark) 0xFFFBBF24.toInt() else 0xFFB45309.toInt()
            } else {
              themeConfig.primaryColor
            }
            views.setTextColor(statusPillId, textColor)
          }

          // Schedule exact AlarmManager wakeup at targetMillis to flip to DUE NOW
          scheduleNextRefresh(context, targetMillis)
        }
      } else {
        // ==================== 3. EMPTY STATE: ALL CAUGHT UP ====================
        if (doseContainerId != 0) views.setViewVisibility(doseContainerId, View.GONE)
        if (emptyContainerId != 0) views.setViewVisibility(emptyContainerId, View.VISIBLE)

        if (emptyTitleId != 0) {
          views.setTextColor(emptyTitleId, themeConfig.textPrimaryColor)
        }
        if (emptySubtitleId != 0) {
          views.setTextColor(emptySubtitleId, themeConfig.textSecondaryColor)
        }

        if (statusPillId != 0) {
          views.setTextViewText(statusPillId, "✓ ALL DONE")
          if (badgeUpcomingRes != 0) views.setInt(statusPillId, "setBackgroundResource", badgeUpcomingRes)
          views.setTextColor(statusPillId, themeConfig.primaryColor)
        }
      }

      // Footer Styling
      if (footerLabelId != 0) {
        views.setTextColor(footerLabelId, themeConfig.textSecondaryColor)
      }
      if (footerButtonId != 0) {
        if (footerBtnRes != 0) views.setInt(footerButtonId, "setBackgroundResource", footerBtnRes)
        views.setTextColor(footerButtonId, themeConfig.primaryColor)
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
        val intent = Intent(context, UpcomingDoseWidgetProvider::class.java).apply {
          action = ACTION_REFRESH_WIDGET
        }
        val pi = PendingIntent.getBroadcast(
          context,
          REQUEST_CODE_SCHEDULE,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Wake up right at targetMillis to seamlessly switch from countdown to "Due now"
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
