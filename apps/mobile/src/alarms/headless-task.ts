import { AppRegistry } from 'react-native';
import { getAppDatabase } from '../database';
import { SchedulerService } from './scheduler';

/** Must match AlarmActionTaskService.TASK_NAME (native). */
export const ALARM_ACTIONS_TASK = 'MedchainAlarmActions';

/**
 * Runs when the user taps Taken / Snooze / Skip on the alarm while the app is closed: Android starts JS
 * without any screen, this saves the queued action and re-plans alarms (e.g. dependent doses), then exits.
 */
export function registerAlarmHeadlessTask(): void {
  AppRegistry.registerHeadlessTask(ALARM_ACTIONS_TASK, () => async () => {
    try {
      const db = await getAppDatabase();
      // reconcileAlarms() saves the pending actions first, then re-arms the plan.
      await new SchedulerService(db).reconcileAlarms();
    } catch (err) {
      // The queue is kept; the app saves it the next time it opens.
      console.warn('Headless alarm action task failed:', err);
    }
  });
}
