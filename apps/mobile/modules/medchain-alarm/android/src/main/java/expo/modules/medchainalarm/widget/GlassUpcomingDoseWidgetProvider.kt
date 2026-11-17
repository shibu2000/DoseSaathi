package expo.modules.medchainalarm.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle

/** Glass "Next Dose" widget: translucent frosted panel over the wallpaper. Drawing lives in [DoseWidgetRenderer]. */
class GlassUpcomingDoseWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    DoseWidgetRenderer.render(context, appWidgetManager, appWidgetIds, WidgetStyle.GLASS)
  }

  /** Android 11 and older pick the layout from the reported size, so redraw after every resize. */
  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle
  ) {
    DoseWidgetRenderer.render(context, appWidgetManager, intArrayOf(appWidgetId), WidgetStyle.GLASS)
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent) // handles APPWIDGET_UPDATE / OPTIONS_CHANGED
    if (intent.action == ACTION_REFRESH_WIDGET) DoseWidgetRenderer.updateAll(context)
  }

  companion object {
    const val ACTION_REFRESH_WIDGET = "expo.modules.medchainalarm.widget.GLASS_REFRESH"

    fun updateAll(context: Context) = UpcomingDoseWidgetProvider.updateAll(context)

    fun canPin(context: Context): Boolean = DoseWidgetRenderer.canPin(context)

    fun requestPin(context: Context): Boolean = DoseWidgetRenderer.requestPin(context, WidgetStyle.GLASS)
  }
}
