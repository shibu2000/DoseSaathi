export function generateIntervalTimes(
  firstTime: string,
  intervalHours: number
): string[] {
  if (intervalHours < 1 || intervalHours > 24) {
    throw new Error('Interval hours must be between 1 and 24');
  }

  const [startHour, startMin] = firstTime.split(':').map(Number);
  const times: string[] = [];

  let currentTotalMinutes = startHour * 60 + startMin;
  const intervalMinutes = intervalHours * 60;

  while (currentTotalMinutes < 24 * 60) {
    const h = Math.floor(currentTotalMinutes / 60);
    const m = currentTotalMinutes % 60;
    times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    currentTotalMinutes += intervalMinutes;
  }

  return times;
}
