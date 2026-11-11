import * as TaskManager from 'expo-task-manager';
import { getAppDatabase } from '../database';
import { SchedulerService } from '../alarms';
import { ApiClient } from './api-client';
import { SyncWorker, type SyncResult } from './sync-worker';
import { extractDoorbellType } from './doorbell';

export { extractDoorbellType };

export const BACKGROUND_SYNC_TASK = 'medchain-push-doorbell';

/** Opaque doorbell types the server may send (docs/api-contract.md section 4). */
const DOORBELL_TYPES = new Set(['PLAN_VERSION', 'RELATIONSHIP_CHANGED', 'PAIRING_REQUEST']);

/** One sync pass without any React state (used from the headless task). */
export async function runHeadlessSync(): Promise<SyncResult> {
  const db = await getAppDatabase();
  const scheduler = new SchedulerService(db);
  return new SyncWorker(db, scheduler, new ApiClient()).syncAll();
}

// Must be defined at module scope so it exists when the OS starts the app in the background.
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async ({ data, error }: any) => {
  if (error) return;
  const type = extractDoorbellType(data);
  if (!type || !DOORBELL_TYPES.has(type)) return;
  try {
    await runHeadlessSync();
  } catch {
    // Best-effort: the next app open syncs again
  }
});

/** Registers the doorbell handler. Safe to call repeatedly; no-ops where unsupported. */
export async function registerBackgroundSync(): Promise<void> {
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.registerTaskAsync(BACKGROUND_SYNC_TASK);
  } catch {
    // Expo Go / unsupported platform: foreground sync still works
  }
}
