package expo.modules.medchainalarm

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.format.DateFormat
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.core.graphics.ColorUtils
import androidx.core.view.WindowCompat
import expo.modules.medchainalarm.widget.WidgetDataStore
import expo.modules.medchainalarm.widget.WidgetLook
import java.lang.ref.WeakReference
import java.util.Date

/**
 * Native full-screen medicine alarm. It is the notification's full-screen intent, so it appears over the
 * lock screen and wakes the display instantly, with no JavaScript start-up. Every button acts natively
 * (see [AlarmActions]): the sound stops and the screen closes the moment it is tapped.
 */
class AlarmActivity : Activity() {
  private var alarm: StoredAlarm? = null
  /** Alarms that fired together and are still waiting, in arrival order (the first one is shown). */
  private val ringing = mutableListOf<StoredAlarm>()
  private val handler = Handler(Looper.getMainLooper())
  private val autoClose = Runnable { if (!isFinishing) finish() }
  private var pulse: AnimatorSet? = null
  private var acted = false

  override fun onCreate(savedInstanceState: Bundle?) {
    showOverLockScreen()
    super.onCreate(savedInstanceState)
    current = WeakReference(this)
    WindowCompat.setDecorFitsSystemWindows(window, false)
    setContentView(R.layout.medchain_alarm_screen)
    if (!enqueue(intent)) {
      finish()
      return
    }
    showNext()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    if (enqueue(intent)) {
      if (alarm == null) showNext() else updateQueueBadge()
    }
  }

  /** Adds the intent's alarm to [ringing]; a repeat of the same alarm replaces the older copy. */
  private fun enqueue(intent: Intent?): Boolean {
    val raw = intent?.getStringExtra(EXTRA_ALARM_JSON) ?: return false
    val a = StoredAlarm.fromJson(raw) ?: return false
    val i = ringing.indexOfFirst { it.id == a.id }
    if (i >= 0) ringing[i] = a else ringing.add(a)
    if (alarm?.id == a.id) alarm = a
    return true
  }

  private fun showNext() {
    val next = ringing.firstOrNull()
    if (next == null) {
      finishAndRemoveTask()
      return
    }
    acted = false
    bind(next)
    // Each alarm gets the ringing notification's full lifetime on screen
    handler.removeCallbacks(autoClose)
    handler.postDelayed(autoClose, MAX_SHOW_MS)
  }

  private fun updateQueueBadge() {
    val waiting = ringing.size
    findViewById<TextView>(R.id.alarm_eyebrow).text =
      if (waiting > 1) getString(R.string.medchain_alarm_eyebrow_count, waiting) else getString(R.string.medchain_alarm_eyebrow)
  }

  override fun onDestroy() {
    pulse?.cancel()
    handler.removeCallbacksAndMessages(null)
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  // -----------------------------------------------------------------------------------------------
  // Content
  // -----------------------------------------------------------------------------------------------

  private fun bind(a: StoredAlarm) {
    alarm = a

    val look = WidgetLook.resolve(this, WidgetDataStore.get(this))
    val dark = when (WidgetDataStore.get(this)?.appearance?.lowercase()) {
      "system" -> (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
      else -> look.isDark
    }
    val tone = if (dark) look.theme.dark else look.theme.light
    val ink = tone.textPrimary
    val sub = tone.textSecondary
    val accent = tone.accent
    val onAccent = if (ColorUtils.calculateLuminance(accent) > 0.45) 0xFF0B1411.toInt() else Color.WHITE

    // Window + system bars
    val root = findViewById<View>(R.id.alarm_root)
    root.background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(tone.skyTop, tone.skyBottom))
    WindowCompat.getInsetsController(window, root).apply {
      isAppearanceLightStatusBars = !dark
      isAppearanceLightNavigationBars = !dark
    }
    findViewById<ImageView>(R.id.alarm_art).apply {
      setImageResource(tone.landscape)
      alpha = if (dark) 0.9f else 1f
    }

    // Header
    val icon = resources.getIdentifier("ic_launcher_${look.theme.key}_round", "mipmap", packageName)
      .takeIf { it != 0 } ?: applicationInfo.icon
    findViewById<ImageView>(R.id.alarm_brand_icon).setImageResource(icon)
    findViewById<TextView>(R.id.alarm_brand).setTextColor(ink)
    findViewById<TextView>(R.id.alarm_eyebrow).apply {
      setTextColor(accent)
      background = pill(ColorUtils.setAlphaComponent(accent, if (dark) 46 else 30))
    }
    updateQueueBadge()

    // Clock
    findViewById<TextView>(R.id.alarm_clock).setTextColor(ink)
    findViewById<TextView>(R.id.alarm_ampm).apply {
      setTextColor(sub)
      visibility = if (DateFormat.is24HourFormat(this@AlarmActivity)) View.GONE else View.VISIBLE
    }
    findViewById<TextView>(R.id.alarm_date).setTextColor(sub)

    // Pulsing badge
    findViewById<View>(R.id.alarm_ring_outer).background = circle(ColorUtils.setAlphaComponent(accent, if (dark) 40 else 28))
    findViewById<View>(R.id.alarm_ring_inner).background = circle(ColorUtils.setAlphaComponent(accent, if (dark) 70 else 52))
    findViewById<View>(R.id.alarm_core).background = circle(accent)
    findViewById<ImageView>(R.id.alarm_core_icon).setColorFilter(onAccent)
    startPulse()

    // Medicine
    findViewById<TextView>(R.id.alarm_med_name).apply {
      text = a.displayName()
      setTextColor(ink)
    }
    val dosage = a.dosageText.ifBlank { "" }
    findViewById<TextView>(R.id.alarm_dosage).apply {
      text = dosage
      visibility = if (dosage.isBlank()) View.GONE else View.VISIBLE
      setTextColor(sub)
    }
    findViewById<TextView>(R.id.alarm_schedule).apply {
      text = getString(R.string.medchain_alarm_scheduled, DateFormat.getTimeFormat(this@AlarmActivity).format(Date(a.displayTimeMillis())))
      setTextColor(accent)
      background = pill(ColorUtils.setAlphaComponent(Color.WHITE, if (dark) 22 else 170))
      val clock = getDrawable(R.drawable.ic_widget_clock)?.mutate()?.apply {
        setTint(accent)
        val s = (16 * resources.displayMetrics.density).toInt()
        setBounds(0, 0, s, s)
      }
      setCompoundDrawablesRelative(clock, null, null, null)
    }
    findViewById<TextView>(R.id.alarm_instructions).apply {
      text = a.instructions
      visibility = if (a.instructions.isBlank()) View.GONE else View.VISIBLE
      setTextColor(sub)
    }

    // Action card
    findViewById<View>(R.id.alarm_card).background = rounded(
      if (dark) ColorUtils.setAlphaComponent(tone.pillSurface, 230) else ColorUtils.setAlphaComponent(Color.WHITE, 242),
      28f,
      if (dark) ColorUtils.setAlphaComponent(Color.WHITE, 26) else Color.TRANSPARENT
    )
    findViewById<View>(R.id.alarm_taken).apply {
      background = ripple(rounded(accent, 31f), onAccent)
      setOnClickListener { act(AlarmActions.TAKEN, 0, it) }
    }
    findViewById<ImageView>(R.id.alarm_taken_icon).setColorFilter(onAccent)
    findViewById<TextView>(R.id.alarm_taken_label).setTextColor(onAccent)
    findViewById<TextView>(R.id.alarm_remind_label).setTextColor(sub)

    for ((id, minutes) in listOf(R.id.alarm_snooze_10 to 10, R.id.alarm_snooze_20 to 20, R.id.alarm_snooze_30 to 30)) {
      findViewById<TextView>(id).apply {
        text = getString(R.string.medchain_alarm_snooze_option, minutes)
        setTextColor(accent)
        background = ripple(
          rounded(ColorUtils.setAlphaComponent(accent, if (dark) 34 else 20), 18f, ColorUtils.setAlphaComponent(accent, if (dark) 110 else 90)),
          accent
        )
        contentDescription = getString(R.string.medchain_alarm_remind_in) + " " + text
        setOnClickListener { act(AlarmActions.SNOOZED, minutes, it) }
      }
    }
    findViewById<TextView>(R.id.alarm_skip).apply {
      setTextColor(sub)
      background = ripple(null, sub)
      setOnClickListener { act(AlarmActions.SKIPPED, 0, it) }
    }
    findViewById<TextView>(R.id.alarm_dot).setTextColor(sub)
    findViewById<TextView>(R.id.alarm_details).apply {
      setTextColor(sub)
      background = ripple(null, sub)
      setOnClickListener { openApp() }
    }
  }

  private fun startPulse() {
    pulse?.cancel()
    fun ring(id: Int, delay: Long): ObjectAnimator {
      val v = findViewById<View>(id)
      return ObjectAnimator.ofPropertyValuesHolder(
        v,
        android.animation.PropertyValuesHolder.ofFloat(View.SCALE_X, 0.86f, 1.06f),
        android.animation.PropertyValuesHolder.ofFloat(View.SCALE_Y, 0.86f, 1.06f),
        android.animation.PropertyValuesHolder.ofFloat(View.ALPHA, 1f, 0.35f)
      ).apply {
        duration = 1400
        startDelay = delay
        repeatCount = ValueAnimator.INFINITE
        repeatMode = ValueAnimator.REVERSE
      }
    }
    pulse = AnimatorSet().apply {
      playTogether(ring(R.id.alarm_ring_outer, 0), ring(R.id.alarm_ring_inner, 300))
      start()
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------------------------------

  private fun act(action: String, minutes: Int, source: View) {
    val a = alarm ?: return
    if (acted) return
    acted = true
    source.performHapticFeedback(
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
    )
    // Take it off screen first: handle() dismisses the notification, which calls closeIfShowing().
    ringing.removeAll { it.id == a.id }
    alarm = null
    AlarmActions.handle(applicationContext, a, action, if (minutes > 0) minutes else 10)
    if (action == AlarmActions.SNOOZED) {
      val at = DateFormat.getTimeFormat(this).format(Date(System.currentTimeMillis() + minutes * 60_000L))
      Toast.makeText(applicationContext, getString(R.string.medchain_alarm_snoozed_toast, at), Toast.LENGTH_SHORT).show()
    }
    showNext() // another dose that rang at the same time, or close
  }

  /** "Open app": unlock first (the app itself never shows over the lock screen), then show the alarm in the app. */
  private fun openApp() {
    val a = alarm ?: return
    val launch = AlarmScheduler.launchIntent(this, a)
    val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    if (km.isKeyguardLocked && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      km.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() {
          startActivity(launch)
          finish()
        }
      })
    } else {
      startActivity(launch)
      finish()
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Drawing helpers
  // -----------------------------------------------------------------------------------------------

  private fun dp(v: Float) = v * resources.displayMetrics.density

  private fun rounded(fill: Int, radiusDp: Float, stroke: Int = Color.TRANSPARENT) = GradientDrawable().apply {
    shape = GradientDrawable.RECTANGLE
    cornerRadius = dp(radiusDp)
    setColor(fill)
    if (stroke != Color.TRANSPARENT) setStroke(dp(1.2f).toInt(), stroke)
  }

  private fun pill(fill: Int) = rounded(fill, 100f)

  private fun circle(fill: Int) = GradientDrawable().apply {
    shape = GradientDrawable.OVAL
    setColor(fill)
  }

  private fun ripple(content: GradientDrawable?, color: Int): RippleDrawable {
    val mask = content ?: rounded(Color.WHITE, 24f)
    return RippleDrawable(ColorStateList.valueOf(ColorUtils.setAlphaComponent(color, 60)), content, mask)
  }

  companion object {
    const val EXTRA_ALARM_JSON = "medchain_alarm_json"
    private const val MAX_SHOW_MS = 10 * 60 * 1000L

    @Volatile private var current: WeakReference<AlarmActivity>? = null

    fun intent(c: Context, a: StoredAlarm): Intent =
      Intent(c, AlarmActivity::class.java).apply {
        putExtra(EXTRA_ALARM_JSON, a.toJson())
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
      }

    /** Drops an alarm handled elsewhere (e.g. in the app); moves on to the next one or closes. */
    fun closeIfShowing(alarmId: String) {
      val activity = current?.get() ?: return
      activity.runOnUiThread {
        if (activity.isFinishing) return@runOnUiThread
        val wasShown = activity.alarm?.id == alarmId
        activity.ringing.removeAll { it.id == alarmId }
        if (wasShown) {
          activity.alarm = null
          activity.showNext()
        } else {
          activity.updateQueueBadge()
        }
      }
    }
  }
}
