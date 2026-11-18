package expo.modules.medchainalarm

import android.content.Context
import android.content.Intent
import android.util.Log
import expo.modules.medchainalarm.widget.UpcomingDoseWidgetProvider
import expo.modules.medchainalarm.widget.WidgetDataStore
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** A dose action taken natively (alarm screen or notification button) that the app's database must still record. */
data class PendingAlarmAction(
  val id: String,
  val occurrenceId: String,
  val medicationId: String,
  /** "TAKEN", "SNOOZED" or "SKIPPED" */
  val action: String,
  val atMillis: Long,
  val snoozeMinutes: Int = 0
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("occurrenceId", occurrenceId)
    put("medicationId", medicationId)
    put("action", action)
    put("atMillis", atMillis)
    put("snoozeMinutes", snoozeMinutes)
  }

  fun toMap(): Map<String, Any> = mapOf(
    "id" to id,
    "occurrenceId" to occurrenceId,
    "medicationId" to medicationId,
    "action" to action,
    "atMillis" to atMillis,
    "snoozeMinutes" to snoozeMinutes
  )

  companion object {
    fun fromJson(o: JSONObject): PendingAlarmAction? = try {
      PendingAlarmAction(
        o.getString("id"), o.getString("occurrenceId"), o.getString("medicationId"),
        o.getString("action"), o.getLong("atMillis"), o.optInt("snoozeMinutes", 0)
      )
    } catch (e: Exception) {
      null
    }
  }
}

/** Durable FIFO of [PendingAlarmAction]s. The app removes entries only after it has saved them. */
object AlarmActionQueue {
  private const val PREFS = "medchain_alarm_actions"
  private const val KEY = "queue"

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Synchronized
  fun all(c: Context): List<PendingAlarmAction> {
    val raw = prefs(c).getString(KEY, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).mapNotNull { PendingAlarmAction.fromJson(arr.getJSONObject(it)) }
    } catch (e: Exception) {
      emptyList()
    }
  }

  @Synchronized
  fun add(c: Context, action: PendingAlarmAction) {
    // A newer decision for the same dose replaces an unsaved older one (e.g. snoozed, then taken).
    val list = all(c).filterNot { it.occurrenceId == action.occurrenceId } + action
    save(c, list)
  }

  @Synchronized
  fun remove(c: Context, ids: Collection<String>) {
    save(c, all(c).filterNot { it.id in ids })
  }

  private fun save(c: Context, list: List<PendingAlarmAction>) {
    val arr = JSONArray()
    list.forEach { arr.put(it.toJson()) }
    prefs(c).edit().putString(KEY, arr.toString()).apply()
  }
}

/**
 * Handles Taken / Snooze / Skip without waiting for JavaScript: the ringing stops and a snooze is
 * re-armed immediately, then the decision is handed to the app to record in its database.
 */
object AlarmActions {
  private const val TAG = "MedchainAlarmActions"
  const val TAKEN = "TAKEN"
  const val SNOOZED = "SNOOZED"
  const val SKIPPED = "SKIPPED"

  /** Used by Settings' "Send test alarm": never touches medicine data. */
  const val TEST_OCCURRENCE_ID = "test_occurrence_preview"

  fun handle(context: Context, alarm: StoredAlarm, action: String, snoozeMinutes: Int = 10) {
    val c = context.applicationContext
    val now = System.currentTimeMillis()
    val minutes = snoozeMinutes.coerceIn(1, 120)

    // 1. Silence: cancelling the notification stops the looping sound and vibration at once.
    AlarmNotifications.dismiss(c, alarm.id)
    AlarmReceiver.releaseScreenWake()

    if (alarm.occurrenceId == TEST_OCCURRENCE_ID) {
      if (action == SNOOZED) AlarmScheduler.schedule(c, alarm.copy(triggerAtMillis = now + minutes * 60_000L))
      return
    }

    // 2. Re-arm natively so the snooze rings even if the app never runs in between.
    if (action == SNOOZED) {
      AlarmScheduler.schedule(c, alarm.copy(triggerAtMillis = now + minutes * 60_000L))
    }

    // 3. Keep the widget truthful right away.
    updateWidget(c, alarm, action, now + minutes * 60_000L)

    // 4. Queue for the app's database and wake JavaScript to record it.
    AlarmActionQueue.add(
      c,
      PendingAlarmAction(
        id = UUID.randomUUID().toString(),
        occurrenceId = alarm.occurrenceId,
        medicationId = alarm.medicationId,
        action = action,
        atMillis = now,
        snoozeMinutes = if (action == SNOOZED) minutes else 0
      )
    )
    deliverToApp(c)
  }

  private fun updateWidget(c: Context, alarm: StoredAlarm, action: String, snoozeUntil: Long) {
    try {
      val data = WidgetDataStore.get(c)
      if (data != null && data.occurrenceId == alarm.occurrenceId) {
        val next = if (action == SNOOZED) data.copy(state = "SNOOZED", triggerAtMillis = snoozeUntil)
        else data.copy(hasUpcoming = false, state = "NONE")
        WidgetDataStore.save(c, next)
      }
      UpcomingDoseWidgetProvider.updateAll(c)
    } catch (e: Exception) {
      Log.w(TAG, "Widget update failed", e)
    }
  }

  /**
   * Starts a short headless JS task that records the action. It also runs when the app is open (it then
   * reuses the running JS): as a service it keeps the process alive until the save and re-plan finish,
   * whereas a backgrounded app may be frozen mid-way. Running UI is told to refresh as well.
   */
  fun deliverToApp(c: Context) {
    MedchainAlarmModule.notifyAlarmAction()
    try {
      c.startService(Intent(c, AlarmActionTaskService::class.java))
    } catch (e: Exception) {
      // Background start not allowed right now: the app records the queue the next time it opens.
      Log.w(TAG, "Could not start headless task; action stays queued", e)
    }
  }
}
