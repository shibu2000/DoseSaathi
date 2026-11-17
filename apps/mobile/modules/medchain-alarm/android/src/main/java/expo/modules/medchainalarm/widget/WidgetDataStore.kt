package expo.modules.medchainalarm.widget

import android.content.Context
import org.json.JSONObject

data class WidgetDoseData(
  val hasUpcoming: Boolean,
  val medicationName: String = "",
  val dosageText: String = "",
  val scheduledTimeStr: String = "",
  val triggerAtMillis: Long = 0L,
  val occurrenceId: String = "",
  val state: String = "NONE", // "UPCOMING", "DUE", "SNOOZED", "NONE"
  val theme: String = "nature",
  val isDark: Boolean = false
) {
  fun toJson(): String = JSONObject().apply {
    put("hasUpcoming", hasUpcoming)
    put("medicationName", medicationName)
    put("dosageText", dosageText)
    put("scheduledTimeStr", scheduledTimeStr)
    put("triggerAtMillis", triggerAtMillis)
    put("occurrenceId", occurrenceId)
    put("state", state)
    put("theme", theme)
    put("isDark", isDark)
  }.toString()

  companion object {
    fun fromJson(raw: String): WidgetDoseData? = try {
      val o = JSONObject(raw)
      WidgetDoseData(
        hasUpcoming = o.optBoolean("hasUpcoming", false),
        medicationName = o.optString("medicationName", ""),
        dosageText = o.optString("dosageText", ""),
        scheduledTimeStr = o.optString("scheduledTimeStr", ""),
        triggerAtMillis = o.optLong("triggerAtMillis", 0L),
        occurrenceId = o.optString("occurrenceId", ""),
        state = o.optString("state", "NONE"),
        theme = o.optString("theme", "nature"),
        isDark = o.optBoolean("isDark", false)
      )
    } catch (e: Exception) {
      null
    }
  }
}

object WidgetDataStore {
  private const val PREFS = "dosesaathi_widget"
  private const val KEY_DATA = "current_widget_dose"

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun save(c: Context, data: WidgetDoseData) {
    prefs(c).edit().putString(KEY_DATA, data.toJson()).apply()
  }

  fun get(c: Context): WidgetDoseData? {
    val raw = prefs(c).getString(KEY_DATA, null) ?: return null
    return WidgetDoseData.fromJson(raw)
  }

  fun clear(c: Context) {
    prefs(c).edit().remove(KEY_DATA).apply()
  }
}
