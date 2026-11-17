package expo.modules.medchainalarm.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import androidx.annotation.DrawableRes
import androidx.annotation.LayoutRes
import androidx.core.net.toUri
import expo.modules.medchainalarm.R

internal enum class WidgetStyle(val provider: Class<out AppWidgetProvider>) {
  /** Theme sky + the home-screen landscape illustration. */
  SCENIC(UpcomingDoseWidgetProvider::class.java),
  /** Translucent frosted panel that lets the wallpaper through. */
  GLASS(GlassUpcomingDoseWidgetProvider::class.java);

  @LayoutRes
  fun layout(size: WidgetSize): Int = when (this) {
    SCENIC -> when (size) {
      WidgetSize.SLIM -> R.layout.widget_scenic_slim
      WidgetSize.SMALL -> R.layout.widget_scenic_small
      WidgetSize.MEDIUM -> R.layout.widget_scenic_medium
      WidgetSize.LARGE -> R.layout.widget_scenic_large
    }
    GLASS -> when (size) {
      WidgetSize.SLIM -> R.layout.widget_glass_slim
      WidgetSize.SMALL -> R.layout.widget_glass_small
      WidgetSize.MEDIUM -> R.layout.widget_glass_medium
      WidgetSize.LARGE -> R.layout.widget_glass_large
    }
  }
}

/**
 * Responsive breakpoints, in dp. A widget gets the largest layout whose minimum size fits, or SLIM when
 * none does. This is the same rule Android 12+ applies to size-mapped RemoteViews, so older versions
 * (which pick the layout here, from the reported size) behave the same way.
 *
 * Typical phone sizes in portrait: 2x1 = 130x102, 4x1 = 276x102, 2x2 = 130x220, 3x2 = 203x220,
 * 4x2 = 276x220, 4x3 = 276x337.
 */
internal enum class WidgetSize(val minWidthDp: Float, val minHeightDp: Float) {
  SLIM(110f, 40f),
  SMALL(110f, 110f),
  MEDIUM(200f, 120f),
  LARGE(250f, 280f);

  private val area get() = minWidthDp * minHeightDp

  companion object {
    fun forSize(widthDp: Float, heightDp: Float): WidgetSize =
      values().filter { widthDp >= it.minWidthDp && heightDp >= it.minHeightDp }.maxByOrNull { it.area } ?: SLIM

    /** Android 11 and older: portrait uses min width x max height, landscape uses max width x min height. */
    fun fromOptions(context: Context, options: Bundle?): WidgetSize {
      if (options == null) return MEDIUM
      val portrait = context.resources.configuration.orientation != Configuration.ORIENTATION_LANDSCAPE
      val w = options.getInt(if (portrait) AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH else AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH)
      val h = options.getInt(if (portrait) AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT else AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT)
      if (w <= 0 || h <= 0) return MEDIUM
      return forSize(w.toFloat(), h.toFloat())
    }
  }
}

/** Draws both widget styles from the shared dose data. */
internal object DoseWidgetRenderer {
  private const val TAG = "DoseWidget"
  private const val REQUEST_CODE_OPEN = 7701
  private const val REQUEST_CODE_REFRESH = 7702

  private const val WHITE = 0xFFFFFFFF.toInt()
  private const val AMBER_LIGHT = 0xFFB45309.toInt()
  private const val AMBER_DARK = 0xFFFBBF24.toInt()
  private const val RED_TEXT_LIGHT = 0xFFC62828.toInt()
  private const val RED_TEXT_DARK = 0xFFFF8A80.toInt()
  private const val RED_FILL_LIGHT = 0xFFD32F2F.toInt()
  private const val RED_FILL_DARK = 0xFFE5484D.toInt()

  /** Redraws every placed widget of both styles. */
  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context) ?: return
    for (style in WidgetStyle.values()) {
      val ids = try {
        manager.getAppWidgetIds(ComponentName(context, style.provider))
      } catch (e: Exception) {
        IntArray(0)
      }
      if (ids.isNotEmpty()) render(context, manager, ids, style)
    }
    scheduleRefresh(context, manager)
  }

  fun render(context: Context, manager: AppWidgetManager, ids: IntArray, style: WidgetStyle) {
    val now = System.currentTimeMillis()
    val data = WidgetDataStore.get(context)
    val snapshot = DoseSnapshot.resolve(context, data, now)
    val look = WidgetLook.resolve(context, data)

    for (id in ids) {
      try {
        val views = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          // The launcher swaps between these by itself while the user resizes.
          RemoteViews(WidgetSize.values().associate { size ->
            SizeF(size.minWidthDp, size.minHeightDp) to build(context, style, size, snapshot, look, now)
          })
        } else {
          build(context, style, WidgetSize.fromOptions(context, manager.getAppWidgetOptions(id)), snapshot, look, now)
        }
        manager.updateAppWidget(id, views)
      } catch (e: Exception) {
        Log.w(TAG, "Could not update widget $id", e)
      }
    }
    scheduleRefresh(context, manager, snapshot)
  }

  fun canPin(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    return context.getSystemService(AppWidgetManager::class.java)?.isRequestPinAppWidgetSupported == true
  }

  fun requestPin(context: Context, style: WidgetStyle): Boolean {
    if (!canPin(context) || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    val manager = context.getSystemService(AppWidgetManager::class.java) ?: return false
    return manager.requestPinAppWidget(ComponentName(context, style.provider), null, null)
  }

  // ---------------------------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------------------------

  private fun build(
    context: Context,
    style: WidgetStyle,
    size: WidgetSize,
    snap: DoseSnapshot,
    look: WidgetLook,
    now: Long
  ): RemoteViews {
    val rv = RemoteViews(context.packageName, style.layout(size))
    val p = Painter(rv, look)
    val theme = look.theme
    val root = android.R.id.background

    // RemoteViews may be re-applied on top of the previous update, so every dynamic property is set on every render.

    // Surface ----------------------------------------------------------------------------------
    val inkLight: Int
    val inkDark: Int
    val subLight: Int
    val subDark: Int
    if (style == WidgetStyle.SCENIC) {
      p.background(root, theme.light.sky, theme.dark.sky, theme.skyAuto)
      p.image(R.id.w_art, theme.light.landscape, theme.dark.landscape, theme.landscapeAuto)
      p.tint(R.id.w_art_fade, theme.light.skyBottom, theme.dark.skyBottom)
      val masks = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) View.GONE else View.VISIBLE
      for (mask in intArrayOf(R.id.w_corner_left, R.id.w_corner_right)) {
        rv.setViewVisibility(mask, masks)
        p.tint(mask, theme.light.skyBottom, theme.dark.skyBottom)
      }
      p.image(R.id.w_card_bg, R.drawable.widget_scenic_card_light, R.drawable.widget_scenic_card_dark, R.drawable.widget_scenic_card_auto)
      inkLight = theme.light.textPrimary; inkDark = theme.dark.textPrimary
      subLight = theme.light.textSecondary; subDark = theme.dark.textSecondary
    } else {
      p.background(root, R.drawable.widget_glass_bg_light, R.drawable.widget_glass_bg_dark, R.drawable.widget_glass_bg_auto)
      p.image(R.id.w_card_bg, R.drawable.widget_glass_card_light, R.drawable.widget_glass_card_dark, R.drawable.widget_glass_card_auto)
      inkLight = WidgetLook.GLASS_LIGHT.textPrimary; inkDark = WidgetLook.GLASS_DARK.textPrimary
      subLight = WidgetLook.GLASS_LIGHT.textSecondary; subDark = WidgetLook.GLASS_DARK.textSecondary
    }
    val accentLight = theme.light.accent
    val accentDark = theme.dark.accent

    // Header -----------------------------------------------------------------------------------
    val launcherIcon = context.resources.getIdentifier("ic_launcher_${theme.key}_round", "mipmap", context.packageName)
      .takeIf { it != 0 }
      ?: context.resources.getIdentifier("ic_launcher_round", "mipmap", context.packageName)
    if (launcherIcon != 0) {
      rv.setImageViewResource(R.id.w_brand, launcherIcon)
      rv.setInt(R.id.w_brand, "setColorFilter", 0) // a transparent SRC_ATOP filter leaves the icon untouched
    } else {
      rv.setImageViewResource(R.id.w_brand, R.drawable.ic_widget_medication)
      p.tint(R.id.w_brand, accentLight, accentDark)
    }
    p.text(R.id.w_brand_label, inkLight, inkDark)

    val due = snap.phase == DosePhase.DUE
    val (stateLight, stateDark) = when (snap.phase) {
      DosePhase.DUE -> RED_TEXT_LIGHT to RED_TEXT_DARK
      DosePhase.SNOOZED -> AMBER_LIGHT to AMBER_DARK
      else -> accentLight to accentDark
    }

    rv.setTextViewText(
      R.id.w_status,
      context.getString(
        when (snap.phase) {
          DosePhase.UPCOMING -> R.string.medchain_widget_status_next
          DosePhase.SNOOZED -> R.string.medchain_widget_status_snoozed
          DosePhase.DUE -> R.string.medchain_widget_status_due
          DosePhase.NONE -> R.string.medchain_widget_status_done
        }
      )
    )
    if (due) {
      rv.setImageViewResource(R.id.w_status_bg, R.drawable.widget_shape_pill)
      p.tint(R.id.w_status_bg, RED_FILL_LIGHT, RED_FILL_DARK)
      p.text(R.id.w_status, WHITE, WHITE)
      p.tint(R.id.w_status_dot, WHITE, WHITE)
    } else {
      rv.setImageViewResource(R.id.w_status_bg, R.drawable.widget_shape_pill_soft)
      p.tint(R.id.w_status_bg, stateLight, stateDark)
      p.text(R.id.w_status, stateLight, stateDark)
      p.tint(R.id.w_status_dot, stateLight, stateDark)
    }

    // Static text colours ---------------------------------------------------------------------
    p.text(R.id.w_med_name, inkLight, inkDark)
    p.text(R.id.w_time, accentLight, accentDark)
    p.tint(R.id.w_time_icon, accentLight, accentDark)
    p.text(R.id.w_sep, subLight, subDark)
    p.text(R.id.w_dosage, subLight, subDark)
    p.text(R.id.w_empty_title, inkLight, inkDark)
    p.text(R.id.w_empty_subtitle, subLight, subDark)
    p.tint(R.id.w_empty_icon_bg, accentLight, accentDark)
    p.tint(R.id.w_empty_icon, accentLight, accentDark)
    p.text(R.id.w_big_caption, subLight, subDark)
    p.tint(R.id.w_card_icon_bg, stateLight, stateDark)
    p.tint(R.id.w_card_icon, stateLight, stateDark)

    // Content ----------------------------------------------------------------------------------
    val hasDose = snap.phase != DosePhase.NONE
    val doseVisibility = if (hasDose) View.VISIBLE else View.GONE
    rv.setViewVisibility(R.id.w_dose_group, doseVisibility)
    rv.setViewVisibility(R.id.w_timer_group, doseVisibility)
    rv.setViewVisibility(R.id.w_big_group, doseVisibility)
    rv.setViewVisibility(R.id.w_card, doseVisibility)
    rv.setViewVisibility(R.id.w_empty_group, if (hasDose) View.GONE else View.VISIBLE)

    if (hasDose) {
      rv.setTextViewText(R.id.w_med_name, snap.name)

      val hasTime = snap.timeLabel.isNotBlank()
      rv.setTextViewText(R.id.w_time, snap.timeLabel)
      rv.setViewVisibility(R.id.w_time, if (hasTime) View.VISIBLE else View.GONE)
      rv.setViewVisibility(R.id.w_time_icon, if (hasTime) View.VISIBLE else View.GONE)

      val hasDosage = snap.dosage.isNotBlank()
      rv.setTextViewText(R.id.w_dosage, snap.dosage)
      rv.setViewVisibility(R.id.w_dosage, if (hasDosage) View.VISIBLE else View.GONE)
      rv.setViewVisibility(R.id.w_sep, if (hasDosage && hasTime) View.VISIBLE else View.GONE)

      // Chronometers tick inside the launcher, so the countdown stays live with no app wakeups.
      val elapsedNow = SystemClock.elapsedRealtime()
      val base = if (due) elapsedNow - (now - snap.targetMillis) else elapsedNow + (snap.targetMillis - now)
      val pillFormat = context.getString(
        if (due) R.string.medchain_widget_overdue_format else R.string.medchain_widget_countdown_format
      )
      for ((id, format) in listOf(R.id.w_timer to pillFormat, R.id.w_big_timer to null)) {
        rv.setChronometer(id, base, format, true)
        rv.setChronometerCountDown(id, !due)
      }

      // Countdown pill
      if (due) {
        rv.setImageViewResource(R.id.w_timer_bg, R.drawable.widget_shape_pill)
        p.tint(R.id.w_timer_bg, RED_FILL_LIGHT, RED_FILL_DARK)
        p.text(R.id.w_timer, WHITE, WHITE)
        p.tint(R.id.w_timer_icon, WHITE, WHITE)
      } else {
        if (style == WidgetStyle.SCENIC) {
          rv.setImageViewResource(R.id.w_timer_bg, R.drawable.widget_shape_pill_strong)
          p.tint(R.id.w_timer_bg, theme.light.pillSurface, theme.dark.pillSurface)
        } else {
          p.image(R.id.w_timer_bg, R.drawable.widget_shape_pill_medium, R.drawable.widget_shape_pill_soft, R.drawable.widget_glass_pill_auto)
          p.tint(R.id.w_timer_bg, WHITE, WHITE)
        }
        p.text(R.id.w_timer, stateLight, stateDark)
        p.tint(R.id.w_timer_icon, stateLight, stateDark)
      }

      // Large numerals (glass small/medium, both large cards)
      if (snap.phase == DosePhase.UPCOMING) p.text(R.id.w_big_timer, inkLight, inkDark)
      else p.text(R.id.w_big_timer, stateLight, stateDark)
      rv.setTextViewText(
        R.id.w_big_caption,
        context.getString(
          when (snap.phase) {
            DosePhase.DUE -> R.string.medchain_widget_caption_due
            DosePhase.SNOOZED -> R.string.medchain_widget_caption_snoozed
            else -> R.string.medchain_widget_caption_next
          }
        )
      )

      val a11y = buildString {
        append(context.getString(R.string.medchain_widget_brand)).append(": ").append(snap.name)
        if (hasTime) append(", ").append(snap.timeLabel)
        if (hasDosage) append(", ").append(snap.dosage)
      }
      rv.setContentDescription(root, a11y)
    } else {
      for (id in intArrayOf(R.id.w_timer, R.id.w_big_timer)) {
        rv.setChronometer(id, SystemClock.elapsedRealtime(), null, false)
      }
      rv.setContentDescription(
        root,
        context.getString(R.string.medchain_widget_empty_title) + ". " + context.getString(R.string.medchain_widget_empty_subtitle)
      )
    }

    rv.setOnClickPendingIntent(root, openAppIntent(context))
    return rv
  }

  private fun openAppIntent(context: Context): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    } ?: Intent(Intent.ACTION_VIEW, "dosesaathi://today".toUri()).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    return PendingIntent.getActivity(
      context, REQUEST_CODE_OPEN, launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  // ---------------------------------------------------------------------------------------------
  // Refresh scheduling: one wakeup when the countdown hits zero (flip to "Take now") and one when the
  // due grace period ends (move on to the next dose). The seconds themselves tick in the launcher.
  // ---------------------------------------------------------------------------------------------

  private fun scheduleRefresh(context: Context, manager: AppWidgetManager, known: DoseSnapshot? = null) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val intent = Intent(context, UpcomingDoseWidgetProvider::class.java).setAction(UpcomingDoseWidgetProvider.ACTION_REFRESH_WIDGET)
    val pi = PendingIntent.getBroadcast(
      context, REQUEST_CODE_REFRESH, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val anyWidget = WidgetStyle.values().any { style ->
      try {
        manager.getAppWidgetIds(ComponentName(context, style.provider)).isNotEmpty()
      } catch (e: Exception) {
        false
      }
    }
    val now = System.currentTimeMillis()
    val snap = known ?: DoseSnapshot.resolve(context, WidgetDataStore.get(context), now)
    val at = when (snap.phase) {
      DosePhase.UPCOMING, DosePhase.SNOOZED -> snap.targetMillis
      DosePhase.DUE -> snap.targetMillis + DoseSnapshot.DUE_GRACE_MS + 1_000L
      DosePhase.NONE -> 0L
    }
    if (!anyWidget || at <= now) {
      am.cancel(pi)
      return
    }

    try {
      val exactAllowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
      // The app holds SCHEDULE_EXACT_ALARM for its reminders; without it, an inexact wakeup is still fine here.
      if (exactAllowed) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
      else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    } catch (e: Exception) {
      Log.w(TAG, "Could not schedule widget refresh", e)
    }
  }

  /**
   * Applies colours and drawables for the current appearance. When following the system on Android 12+,
   * it hands the launcher both day and night values so dark mode switches the widget instantly.
   */
  private class Painter(private val rv: RemoteViews, private val look: WidgetLook) {
    private val auto = look.followsSystem && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    private fun pick(light: Int, dark: Int) = if (look.isDark) dark else light

    fun text(id: Int, light: Int, dark: Int) {
      if (auto) rv.setColorInt(id, "setTextColor", light, dark)
      else rv.setTextColor(id, pick(light, dark))
    }

    /** Recolours a white drawable. SRC_ATOP keeps the drawable's own opacity, which is how glass stays see-through. */
    fun tint(id: Int, light: Int, dark: Int) {
      if (auto) rv.setColorInt(id, "setColorFilter", light, dark)
      else rv.setInt(id, "setColorFilter", pick(light, dark))
    }

    fun image(id: Int, @DrawableRes light: Int, @DrawableRes dark: Int, @DrawableRes auto: Int) {
      rv.setImageViewResource(id, if (this.auto) auto else pick(light, dark))
    }

    fun background(id: Int, @DrawableRes light: Int, @DrawableRes dark: Int, @DrawableRes auto: Int) {
      rv.setInt(id, "setBackgroundResource", if (this.auto) auto else pick(light, dark))
    }
  }
}
