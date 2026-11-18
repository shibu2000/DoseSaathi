package expo.modules.medchainalarm

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Starts JavaScript without UI to record queued alarm actions in the app database (task registered in
 * apps/mobile/index.ts as "MedchainAlarmActions"). Used only when the app is not already running.
 */
class AlarmActionTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig(TASK_NAME, Arguments.createMap(), TIMEOUT_MS, true)

  companion object {
    const val TASK_NAME = "MedchainAlarmActions"
    private const val TIMEOUT_MS = 45_000L
  }
}
