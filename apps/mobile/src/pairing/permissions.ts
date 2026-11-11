export type PairingPermission = 'VIEW_SCHEDULE' | 'EDIT_SCHEDULE' | 'VIEW_DOSE_LOGS' | 'RECEIVE_ALERTS';

export const ALL_PERMISSIONS: PairingPermission[] = ['VIEW_SCHEDULE', 'EDIT_SCHEDULE', 'VIEW_DOSE_LOGS', 'RECEIVE_ALERTS'];

/** Patient-facing wording (what the patient is agreeing to). */
export const PATIENT_PERMISSION_TEXT: Record<PairingPermission, string> = {
  VIEW_SCHEDULE: 'See my medicine schedule',
  EDIT_SCHEDULE: 'Add and change my medicines',
  VIEW_DOSE_LOGS: 'See when I take doses',
  RECEIVE_ALERTS: "Get an alert if a dose isn't confirmed",
};

/** Caregiver-facing wording (what the caregiver is asking for / has). */
export const CAREGIVER_PERMISSION_TEXT: Record<PairingPermission, string> = {
  VIEW_SCHEDULE: 'See their medicine schedule',
  EDIT_SCHEDULE: 'Add and change their medicines',
  VIEW_DOSE_LOGS: 'See when they take doses',
  RECEIVE_ALERTS: "Get an alert if a dose isn't confirmed",
};

export function isPairingPermission(p: string): p is PairingPermission {
  return (ALL_PERMISSIONS as string[]).includes(p);
}

/** Dedupes, drops unknown keys, enforces EDIT_SCHEDULE => VIEW_SCHEDULE, returns canonical order. */
export function normalizePermissions(input: readonly string[]): PairingPermission[] {
  const set = new Set(input.filter(isPairingPermission));
  if (set.has('EDIT_SCHEDULE')) set.add('VIEW_SCHEDULE');
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

/** Toggles one permission keeping the set valid (turning VIEW off also turns EDIT off). */
export function togglePermission(current: readonly string[], key: PairingPermission): PairingPermission[] {
  const set = new Set(normalizePermissions(current));
  if (set.has(key)) {
    set.delete(key);
    if (key === 'VIEW_SCHEDULE') set.delete('EDIT_SCHEDULE');
  } else {
    set.add(key);
  }
  return normalizePermissions([...set]);
}

export function describePermissions(perms: readonly string[], audience: 'patient' | 'caregiver'): string[] {
  const map = audience === 'patient' ? PATIENT_PERMISSION_TEXT : CAREGIVER_PERMISSION_TEXT;
  return normalizePermissions(perms).map((p) => map[p]);
}
