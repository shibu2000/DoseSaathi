import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import type { DeviceMedicationStatus, PlanMedication, PlanCommandState, RelationshipSummary } from '@medchain/contracts';
import { useApp } from '@/state/AppContext';
import { ApiError, type PlanStateResponse } from '@/sync/api-client';
import {
  clearTrackedCommand,
  loadStaged,
  loadTrackedCommand,
  saveStaged,
  type SettingsStore,
  type TrackedCommand,
} from './staged-store';
import { describeCommandState } from './command-state';

export type RelationshipAccess =
  | { state: 'checking' }
  | { state: 'missing' }
  | { state: 'ready'; relationship: RelationshipSummary; canView: boolean; canEdit: boolean };

/**
 * Verifies that a route's relationshipId belongs to the signed-in caregiver. If the id is unknown it
 * asks the server once (a real refresh) before giving up, then sends the user back to Family Hub.
 */
export function useRelationshipAccess(relationshipId: string | undefined): RelationshipAccess {
  const router = useRouter();
  const { relationships, caregiverLoading, refreshRelationships, setSelectedRelationship, selectedRelationship } = useApp();
  const [refreshed, setRefreshed] = useState(false);
  const rel = relationships.find((r) => r.relationshipId === relationshipId && r.status === 'ACTIVE');

  useEffect(() => {
    if (!relationshipId || rel || caregiverLoading || refreshed) return;
    let cancelled = false;
    (async () => {
      try {
        await refreshRelationships();
      } finally {
        if (!cancelled) setRefreshed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [relationshipId, rel, caregiverLoading, refreshed, refreshRelationships]);

  const missing = !!relationshipId && !rel && !caregiverLoading && refreshed;

  useEffect(() => {
    if (missing) router.replace('/(caregiver)/(tabs)/family');
  }, [missing, router]);

  // Keep the global selection in sync with the route, so tabs and wizards always know who is being managed.
  useEffect(() => {
    if (rel && selectedRelationship?.relationshipId !== rel.relationshipId) {
      setSelectedRelationship({
        relationshipId: rel.relationshipId,
        patientName: rel.patientDisplayName,
        relationshipLabel: rel.relationshipLabel,
        permissions: rel.permissions,
      });
    }
  }, [rel, selectedRelationship?.relationshipId, setSelectedRelationship]);

  if (rel) {
    return {
      state: 'ready',
      relationship: rel,
      canView: rel.permissions.includes('VIEW_SCHEDULE'),
      canEdit: rel.permissions.includes('EDIT_SCHEDULE') && rel.permissions.includes('VIEW_SCHEDULE'),
    };
  }
  return missing ? { state: 'missing' } : { state: 'checking' };
}

export interface PatientPlanView {
  /** Prescription as last known by the server (includes a not-yet-applied caregiver edit). */
  medications: PlanMedication[];
  status: Map<string, DeviceMedicationStatus>;
  raw: PlanStateResponse | null;
  loading: boolean;
  error: string | null;
  /** ISO time of the last successful fetch */
  loadedAt: string | null;
  reload: () => Promise<void>;
}

function describeLoadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isNetwork) return "Couldn't reach DoseSaathi. Check your connection.";
    if (err.code === 'PERMISSION_DENIED') return 'You do not have permission to see these medicines.';
    if (err.code === 'RELATIONSHIP_INACTIVE') return 'This connection has ended.';
    return err.message || 'Could not load the medicines.';
  }
  return 'Could not load the medicines.';
}

export function usePatientPlan(relationshipId: string | undefined, enabled: boolean): PatientPlanView {
  const { api } = useApp();
  const [raw, setRaw] = useState<PlanStateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!relationshipId || !enabled) return;
    setLoading(true);
    try {
      const res = await api.getPlan(relationshipId);
      if (!alive.current) return;
      setRaw(res);
      setError(null);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      if (alive.current) setError(describeLoadError(err));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [api, relationshipId, enabled]);

  useEffect(() => {
    setRaw(null);
    setLoadedAt(null);
    void reload();
  }, [reload]);

  const medications = useMemo(
    () => raw?.planSnapshot?.medications ?? raw?.deviceReport?.medications ?? [],
    [raw]
  );
  const status = useMemo(() => {
    const m = new Map<string, DeviceMedicationStatus>();
    for (const s of raw?.deviceReport?.status ?? []) m.set(s.medicationId, s);
    return m;
  }, [raw]);

  return { medications, status, raw, loading, error, loadedAt, reload };
}

/** Staged ("not sent yet") medicines for one patient, persisted in SQLite so they survive restarts. */
export function useStagedMedications(relationshipId: string | undefined) {
  const { db } = useApp();
  const [staged, setStaged] = useState<PlanMedication[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!db || !relationshipId) return;
    setStaged(await loadStaged(db.settings as SettingsStore, relationshipId));
    setReady(true);
  }, [db, relationshipId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const replace = useCallback(
    async (meds: PlanMedication[]) => {
      if (!db || !relationshipId) return;
      await saveStaged(db.settings as SettingsStore, relationshipId, meds);
      setStaged(meds);
    },
    [db, relationshipId]
  );

  return { staged, ready, reload, replace };
}

const POLL_MS = [3000, 5000, 8000, 15000];

/**
 * Follows a plan command until it reaches a terminal state. Polling stops on unmount and on any
 * terminal state. A failed check never changes the shown state; it only reports that it can't check.
 */
export function useCommandTracker(relationshipId: string | undefined, commandId: string | null) {
  const { api } = useApp();
  const [state, setState] = useState<PlanCommandState | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    setState(null);
    setCheckFailed(false);
    if (!relationshipId || !commandId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const tick = async () => {
      try {
        const s = await api.getPlanCommand(relationshipId, commandId);
        if (cancelled) return;
        setState(s);
        setCheckFailed(false);
        if (describeCommandState(s).terminal) return;
      } catch {
        if (cancelled) return;
        setCheckFailed(true);
      }
      timer = setTimeout(tick, POLL_MS[Math.min(attempt++, POLL_MS.length - 1)]);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [api, relationshipId, commandId]);

  return { state, checkFailed };
}

export function useTrackedCommand(relationshipId: string | undefined) {
  const { db } = useApp();
  const [tracked, setTracked] = useState<TrackedCommand | null>(null);

  const reload = useCallback(async () => {
    if (!db || !relationshipId) return;
    setTracked(await loadTrackedCommand(db.settings as SettingsStore, relationshipId));
  }, [db, relationshipId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dismiss = useCallback(async () => {
    if (!db || !relationshipId) return;
    await clearTrackedCommand(db.settings as SettingsStore, relationshipId);
    setTracked(null);
  }, [db, relationshipId]);

  return { tracked, reload, dismiss };
}
