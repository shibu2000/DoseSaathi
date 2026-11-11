import { describe, expect, it } from 'bun:test';
import { parsePairingPayload } from '../src/pairing/qr';
import { normalizePermissions, togglePermission, describePermissions } from '../src/pairing/permissions';
import { formatPairingCode, sanitizeCodeInput, computeCountdown, nextPollDelay, validateEmail, validatePassword } from '../src/pairing/format';
import { describeError } from '../src/pairing/errors';

const SID = '123e4567-e89b-42d3-a456-426614174000';

describe('QR payload parser', () => {
  it('accepts a valid payload', () => {
    expect(parsePairingPayload(`dosesaathi://pair?session=${SID}&secret=abcDEF123_-xyz`)).toEqual({ sessionId: SID, secret: 'abcDEF123_-xyz' });
  });
  it('rejects wrong scheme, host, bad uuid, extra/duplicate params, junk', () => {
    expect(parsePairingPayload('https://pair?session=' + SID + '&secret=abcdefgh')).toBeNull();
    expect(parsePairingPayload('dosesaathi://other?session=' + SID + '&secret=abcdefgh')).toBeNull();
    expect(parsePairingPayload('dosesaathi://pair?session=nope&secret=abcdefgh')).toBeNull();
    expect(parsePairingPayload(`dosesaathi://pair?session=${SID}&secret=abcdefgh&x=1`)).toBeNull();
    expect(parsePairingPayload(`dosesaathi://pair?session=${SID}&session=${SID}`)).toBeNull();
    expect(parsePairingPayload(`dosesaathi://pair?session=${SID}&secret=short`)).toBeNull();
    expect(parsePairingPayload(`dosesaathi://pair?session=${SID}&secret=abc<script>`)).toBeNull();
    expect(parsePairingPayload('')).toBeNull();
    expect(parsePairingPayload(null)).toBeNull();
  });
});

describe('permissions', () => {
  it('EDIT implies VIEW and order is canonical', () => {
    expect(normalizePermissions(['EDIT_SCHEDULE'])).toEqual(['VIEW_SCHEDULE', 'EDIT_SCHEDULE']);
    expect(normalizePermissions(['RECEIVE_ALERTS', 'bogus', 'RECEIVE_ALERTS'])).toEqual(['RECEIVE_ALERTS']);
  });
  it('turning VIEW off removes EDIT', () => {
    expect(togglePermission(['VIEW_SCHEDULE', 'EDIT_SCHEDULE', 'VIEW_DOSE_LOGS'], 'VIEW_SCHEDULE')).toEqual(['VIEW_DOSE_LOGS']);
  });
  it('turning EDIT on adds VIEW', () => {
    expect(togglePermission([], 'EDIT_SCHEDULE')).toEqual(['VIEW_SCHEDULE', 'EDIT_SCHEDULE']);
  });
  it('plain language', () => {
    expect(describePermissions(['VIEW_DOSE_LOGS'], 'patient')).toEqual(['See when I take doses']);
  });
});

describe('formatting', () => {
  it('formats code', () => {
    expect(formatPairingCode('123456')).toBe('123 456');
    expect(formatPairingCode('12')).toBe('12');
    expect(sanitizeCodeInput('12a 34-5678')).toBe('123456');
  });
  it('countdown comes from expiresAt', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(computeCountdown('2026-01-01T00:09:05Z', now)).toEqual({ remainingSeconds: 545, expired: false, label: '9:05' });
    expect(computeCountdown('2025-12-31T23:59:00Z', now).expired).toBe(true);
    expect(computeCountdown(null, now).expired).toBe(true);
  });
  it('backoff', () => {
    expect(nextPollDelay(3000, 0)).toBe(3000);
    expect(nextPollDelay(3000, 2)).toBe(12000);
    expect(nextPollDelay(3000, 10)).toBe(30000);
    expect(nextPollDelay(3000, 0, 30000, 20)).toBe(20000);
  });
  it('validation', () => {
    expect(validateEmail('a@b.co')).toBeNull();
    expect(validateEmail('nope')).not.toBeNull();
    expect(validatePassword('123456789')).not.toBeNull();
    expect(validatePassword('1234567890')).toBeNull();
  });
});

describe('error mapping', () => {
  it('maps codes honestly', () => {
    expect(describeError({ status: 0, code: 'NETWORK_ERROR' }).kind).toBe('network');
    expect(describeError({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 7 }).message).toContain('7 seconds');
    expect(describeError({ status: 404, code: 'PAIRING_CODE_INVALID' }).kind).toBe('code_invalid');
    expect(describeError({ status: 401, code: 'SESSION_EXPIRED' }).kind).toBe('auth');
    expect(describeError({ status: 0, code: 'API_NOT_CONFIGURED' }).kind).toBe('unconfigured');
  });
});
