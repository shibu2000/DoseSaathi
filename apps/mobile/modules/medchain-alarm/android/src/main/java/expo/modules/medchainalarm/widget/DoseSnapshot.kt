package expo.modules.medchainalarm.widget

import android.content.Context
import android.text.format.DateFormat
import expo.modules.medchainalarm.AlarmStore
import java.util.Calendar
import java.util.Date

internal enum class DosePhase { UPCOMING, SNOOZED, DUE, NONE }

/** What the widget shows, resolved once per render. */
internal data class DoseSnapshot(
  val phase: DosePhase,
  val name: String = "",
  val dosage: String = "",
  val timeLabel: String = "",
  val targetMillis: Long = 0L
) {
  companion object {
    /** A dose stays on the widget as "due" for this long before it moves on to the next one. */
    const val DUE_GRACE_MS = 45 * 60 * 1000L

    private const val ALARM_TITLE_PREFIX = "Medication Reminder:"
    private val CLOCK = Regex("""^\s*(\d{1,2}):(\d{2})""")

    fun resolve(context: Context, data: WidgetDoseData?, now: Long): DoseSnapshot {
      if (data != null && data.hasUpcoming && data.medicationName.isNotBlank() &&
        data.triggerAtMillis > now - DUE_GRACE_MS
      ) {
        val phase = when {
          data.triggerAtMillis <= now -> DosePhase.DUE
          data.state == "SNOOZED" -> DosePhase.SNOOZED
          else -> DosePhase.UPCOMING
        }
        return DoseSnapshot(
          phase = phase,
          name = data.medicationName.trim(),
          dosage = data.dosageText.trim(),
          timeLabel = formatTime(context, data.scheduledTimeStr, data.triggerAtMillis),
          targetMillis = data.triggerAtMillis
        )
      }

      // The app has not synced a dose (or it is stale): fall back to the next natively armed alarm.
      val next = AlarmStore.all(context).firstOrNull { it.triggerAtMillis > now }
        ?: return DoseSnapshot(DosePhase.NONE)
      return DoseSnapshot(
        phase = DosePhase.UPCOMING,
        name = next.title.removePrefix(ALARM_TITLE_PREFIX).trim().ifEmpty { next.title },
        timeLabel = formatTime(context, "", next.triggerAtMillis),
        targetMillis = next.triggerAtMillis
      )
    }

    /** "08:00" from the app becomes "8:00 AM" or "08:00" depending on the phone's 12/24-hour setting. */
    private fun formatTime(context: Context, raw: String, fallbackMillis: Long): String {
      val format = DateFormat.getTimeFormat(context)
      val match = CLOCK.find(raw)
      if (match != null) {
        val (h, m) = match.destructured
        val cal = Calendar.getInstance().apply {
          set(Calendar.HOUR_OF_DAY, h.toInt().coerceIn(0, 23))
          set(Calendar.MINUTE, m.toInt().coerceIn(0, 59))
        }
        return format.format(cal.time)
      }
      if (raw.isNotBlank()) return raw.trim()
      return if (fallbackMillis > 0) format.format(Date(fallbackMillis)) else ""
    }
  }
}
