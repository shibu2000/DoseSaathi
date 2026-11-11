/** "123456" -> "123 456". Non-digits are ignored. */
export function formatPairingCode(code: string): string {
  const d = code.replace(/\D/g, '');
  return d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
}

/** Keeps digits only, max 6. Used for typed and pasted input. */
export function sanitizeCodeInput(text: string): string {
  return text.replace(/\D/g, '').slice(0, 6);
}

export interface Countdown {
  remainingSeconds: number;
  expired: boolean;
  label: string;
}

/** Countdown derived from the server's expiresAt (never a local fixed timer). */
export function computeCountdown(expiresAtIso: string | null | undefined, nowMs: number): Countdown {
  const end = expiresAtIso ? Date.parse(expiresAtIso) : NaN;
  if (!Number.isFinite(end)) return { remainingSeconds: 0, expired: true, label: '0:00' };
  const remainingSeconds = Math.max(0, Math.ceil((end - nowMs) / 1000));
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  return { remainingSeconds, expired: remainingSeconds <= 0, label: `${m}:${String(s).padStart(2, '0')}` };
}

/** Poll delay with exponential backoff after consecutive failures. */
export function nextPollDelay(baseMs: number, consecutiveErrors: number, maxMs = 30000, retryAfterSeconds?: number): number {
  const backoff = Math.min(maxMs, baseMs * Math.pow(2, Math.min(consecutiveErrors, 6)));
  if (retryAfterSeconds && retryAfterSeconds > 0) return Math.max(backoff, Math.min(retryAfterSeconds * 1000, 120000));
  return backoff;
}

export function validateEmail(email: string): string | null {
  const e = email.trim();
  if (!e) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Enter a valid email address.';
  return null;
}
export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 128) return 'Use 128 characters or fewer.';
  return null;
}
