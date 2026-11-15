export type CommandTone = 'waiting' | 'progress' | 'success' | 'problem' | 'neutral';

export interface CommandStateInput {
  status: string;
  reasonCode?: string | null;
}

export interface CommandStateView {
  label: string;
  detail?: string;
  tone: CommandTone;
  terminal: boolean;
}

const REJECTION_REASONS: Record<string, string> = {
  DEPENDENCY_CYCLE: 'Some medicines would wait on each other. Change which medicine follows which.',
  NOT_CAREGIVER_MEDICINE: 'One of the medicines was added on the phone itself, so it cannot be changed from here.',
  INVALID_MEDICINE: 'One of the medicines has details the phone could not accept.',
  INVALID_PLAN: 'The phone could not read this plan. It may need a newer version of DoseSaathi.',
  NO_PROFILE: 'The phone has not finished setting up yet.',
  APPLY_FAILED: 'Something went wrong while saving on the phone. Nothing was changed.',
};

export function describeRejectionReason(code?: string | null): string {
  if (!code) return 'The phone did not say why. Nothing was changed.';
  return REJECTION_REASONS[code] ?? 'The phone did not accept the change. Nothing was changed.';
}

/** Maps a server command state to plain language. "Applied" is only ever shown for APPLIED. */
export function describeCommandState(state: CommandStateInput): CommandStateView {
  switch (state.status) {
    case 'PENDING_DEVICE':
      return {
        label: 'Waiting for the phone to connect',
        detail: 'The change is saved on the server. When the patient opens DoseSaathi or pulls down to refresh, it applies automatically.',
        tone: 'waiting',
        terminal: false,
      };
    case 'RECEIVED':
      return { label: 'Phone received it', detail: 'The phone is applying the change.', tone: 'progress', terminal: false };
    case 'APPLIED':
      return { label: 'Applied on the phone', tone: 'success', terminal: true };
    case 'REJECTED':
      return {
        label: 'The phone could not apply this',
        detail: describeRejectionReason(state.reasonCode),
        tone: 'problem',
        terminal: true,
      };
    case 'SUPERSEDED':
      return {
        label: state.reasonCode === 'RELATIONSHIP_ENDED' ? 'Not sent: the connection ended' : 'Replaced by a newer change',
        detail:
          state.reasonCode === 'RELATIONSHIP_ENDED'
            ? 'This person is no longer connected, so the change was not delivered.'
            : 'A newer change was sent before the phone picked this one up.',
        tone: 'neutral',
        terminal: true,
      };
    default:
      return { label: 'Checking status', tone: 'neutral', terminal: false };
  }
}

/** Relative "x min ago" style text; `now` injectable for tests. */
export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = Math.max(0, now.getTime() - t);
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface DeviceStatusView {
  text: string;
  state: 'recent' | 'stale' | 'never';
}

export function describeDeviceStatus(
  deviceLastSeenAt: string | null,
  lastSyncedAt: string | null,
  now: Date = new Date()
): DeviceStatusView {
  const seen = [deviceLastSeenAt, lastSyncedAt]
    .filter((x): x is string => !!x && !Number.isNaN(new Date(x).getTime()))
    .sort()
    .pop();
  if (!seen) return { text: "Hasn't connected yet", state: 'never' };
  const age = now.getTime() - new Date(seen).getTime();
  const rel = formatRelativeTime(seen, now)!;
  if (age > STALE_AFTER_MS) {
    return { text: rel === 'yesterday' ? 'Last seen yesterday' : `Last seen ${rel}`, state: 'stale' };
  }
  return { text: rel === 'just now' ? 'Seen just now' : `Seen ${rel}`, state: 'recent' };
}
