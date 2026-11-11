export interface FormattedCountdown {
  badgeText: string;
  isDue: boolean;
  relativeDetail: string;
}

export function formatCountdown(
  targetMs: number,
  nowMs: number,
  isSnoozed: boolean = false
): FormattedCountdown {
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) {
    const minsAgo = Math.floor((-diffMs) / 60000);
    return {
      badgeText: 'Due now',
      isDue: true,
      relativeDetail: minsAgo < 1 ? 'Due right now' : `Due ${minsAgo} min ago`,
    };
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  if (isSnoozed) {
    return {
      badgeText: `Snoozed • in next ${totalMinutes}m`,
      isDue: false,
      relativeDetail: `Reminder will ring in next ${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`,
    };
  }

  if (totalMinutes < 60) {
    return {
      badgeText: `in next ${totalMinutes} min`,
      isDue: false,
      relativeDetail: `Scheduled in next ${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`,
    };
  }

  const hours = Math.floor(totalMinutes / 60);
  const remainingMins = totalMinutes % 60;
  const badgeText =
    remainingMins === 0
      ? hours === 1
        ? 'in next 1 hour'
        : `in next ${hours} hours`
      : `in next ${hours}h ${remainingMins}m`;

  return {
    badgeText,
    isDue: false,
    relativeDetail: `Scheduled in next ${hours} hour${hours === 1 ? '' : 's'}${
      remainingMins > 0 ? ` and ${remainingMins} minutes` : ''
    }`,
  };
}
