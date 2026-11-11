export type FriendlyKind = 'network' | 'rate_limited' | 'auth' | 'unconfigured' | 'code_invalid' | 'expired' | 'already' | 'other';

export interface FriendlyError {
  kind: FriendlyKind;
  message: string;
  retryAfterSeconds?: number;
}

/** Maps an ApiError-shaped value (duck-typed, no RN import) to honest user copy. */
export function describeError(err: unknown): FriendlyError {
  const e = err as { status?: number; code?: string; message?: string; retryAfterSeconds?: number } | null;
  const code = e?.code ?? '';
  const status = e?.status ?? -1;
  if (code === 'API_NOT_CONFIGURED') {
    return { kind: 'unconfigured', message: 'This build of DoseSaathi has no server address, so family sharing is unavailable. Your own medicines and reminders work normally.' };
  }
  if (status === 0 || code === 'NETWORK_ERROR') {
    return { kind: 'network', message: "Can't reach the server. Check your connection and try again." };
  }
  if (code === 'RATE_LIMITED' || status === 429) {
    const s = e?.retryAfterSeconds;
    return {
      kind: 'rate_limited',
      retryAfterSeconds: s,
      message: s ? `Too many attempts. Try again in ${s} second${s === 1 ? '' : 's'}.` : 'Too many attempts. Wait a moment and try again.',
    };
  }
  switch (code) {
    case 'UNAUTHENTICATED':
    case 'SESSION_EXPIRED':
    case 'NOT_SIGNED_IN':
      return { kind: 'auth', message: 'Your session has ended. Please sign in again.' };
    case 'INVALID_CREDENTIALS':
      return { kind: 'auth', message: 'That email or password is not correct.' };
    case 'EMAIL_TAKEN':
      return { kind: 'other', message: 'An account with this email already exists. Try signing in instead.' };
    case 'PAIRING_CODE_INVALID':
      return { kind: 'code_invalid', message: 'That code is not valid. It may have expired or been replaced. Ask for a new code and try again.' };
    case 'PAIRING_EXPIRED':
      return { kind: 'expired', message: 'This request has expired. Ask for a new code.' };
    case 'ALREADY_CONNECTED':
      return { kind: 'already', message: 'You are already connected to this person.' };
    case 'REQUEST_NOT_PENDING':
      return { kind: 'other', message: 'This request was already answered or cancelled.' };
  }
  return { kind: 'other', message: e?.message || 'Something went wrong. Please try again.' };
}
