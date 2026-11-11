package expo.modules.medchainalarm

import android.app.Activity
import android.os.Build
import java.lang.ref.WeakReference

/**
 * Tracks whether an alarm is currently ringing / being handled, and owns the "show over the lock
 * screen" switch of the app's activity.
 *
 * Rule: the activity may appear over the lock screen ONLY while an alarm session is active. The
 * switch is turned ON by the alarm itself (in the receiver, before the notification is posted, so it
 * is already on when the system launches the full-screen intent — also when the app is merely in the
 * background), and turned OFF when the user finishes with the alarm or the session expires. It is
 * never turned off just because the app went to the background: locking the phone backgrounds the
 * app, and switching it off there is exactly what prevented the alarm screen from appearing.
 */
object AlarmSession {
  /** A session ends by itself after this long (the notification stops ringing at the same time). */
  private const val MAX_SESSION_MS = 10 * 60 * 1000L

  @Volatile private var startedAtMs: Long = 0L
  @Volatile private var activityRef: WeakReference<Activity>? = null

  fun isActive(): Boolean = startedAtMs != 0L && System.currentTimeMillis() - startedAtMs < MAX_SESSION_MS

  fun attach(activity: Activity?) {
    if (activity != null) activityRef = WeakReference(activity)
  }

  /** Called when an alarm fires or the app is opened from an alarm. */
  fun begin() {
    startedAtMs = System.currentTimeMillis()
    apply(true)
  }

  /** Called when the user has dealt with the alarm. */
  fun end() {
    startedAtMs = 0L
    apply(false)
  }

  /** Re-applies the correct state, e.g. when the activity comes to the foreground. */
  fun sync() {
    apply(isActive())
  }

  private fun apply(showOverLockScreen: Boolean) {
    val activity = activityRef?.get() ?: return
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) return
    val run = Runnable {
      try {
        activity.setShowWhenLocked(showOverLockScreen)
        activity.setTurnScreenOn(showOverLockScreen)
      } catch (e: Exception) {
        // Activity is finishing; the manifest default applies to the next instance
      }
    }
    if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) run.run() else activity.runOnUiThread(run)
  }
}
