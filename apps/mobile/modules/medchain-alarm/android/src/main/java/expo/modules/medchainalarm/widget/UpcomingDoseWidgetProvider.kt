package expo.modules.medchainalarm.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle

/** Scenic "Next Dose" widget: theme sky with the home-screen landscape. Drawing lives in [DoseWidgetRenderer]. */
class UpcomingDoseWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    DoseWidgetRenderer.render(context, appWidgetManager, appWidgetIds, WidgetStyle.SCENIC)
  }

  /** Android 11 and older pick the layout from the reported size, so redraw after every resize. */
  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle
  ) {
    DoseWidgetRenderer.render(context, appWidgetManager, intArrayOf(appWidgetId), WidgetStyle.SCENIC)
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent) // handles APPWIDGET_UPDATE / OPTIONS_CHANGED
    if (intent.action == ACTION_REFRESH_WIDGET) DoseWidgetRenderer.updateAll(context)
  }

  companion object {
    const val ACTION_REFRESH_WIDGET = "expo.modules.medchainalarm.widget.REFRESH"

    /** Redraws both widget styles. Called by the app whenever the next dose, theme or appearance changes. */
    fun updateAll(context: Context) {
      try {
        DoseWidgetRenderer.updateAll(context)
      } catch (e: Exception) {
        // Never let a widget problem break the caller (alarm scheduling, app sync).
      }
    }

    fun canPin(context: Context): Boolean = DoseWidgetRenderer.canPin(context)

    fun requestPin(context: Context): Boolean = DoseWidgetRenderer.requestPin(context, WidgetStyle.SCENIC)
  }
}
