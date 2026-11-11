/** Small helpers for one-off local notifications (low stock, course changes). */

async function notifications() {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

async function postNow(title: string, body: string, data: Record<string, unknown>): Promise<void> {
  const N = await notifications();
  if (!N) return;
  try {
    await N.scheduleNotificationAsync({
      content: { title, body, data, sound: 'default' },
      trigger: null,
    });
  } catch {
    // Notification permission may be off; the in-app notice still shows.
  }
}

export async function notifyLowStock(info: { medicationId: string; name: string; daysRemaining: number; currentStock: number }) {
  const days = info.daysRemaining;
  await postNow(
    `${info.name} is running low`,
    days <= 0
      ? `Only ${info.currentStock} left. Time to get a refill.`
      : `About ${days} day${days === 1 ? '' : 's'} of supply left (${info.currentStock} remaining). Time to plan a refill.`,
    { type: 'LOW_STOCK', medicationId: info.medicationId }
  );
}

export async function notifyCourseTransition(endedName: string, startedNames: string[]) {
  await postNow(
    'Course complete',
    startedNames.length > 0
      ? `${endedName} has ended. Reminders for ${startedNames.join(', ')} are now active.`
      : `${endedName} has ended.`,
    { type: 'COURSE_TRANSITION' }
  );
}
