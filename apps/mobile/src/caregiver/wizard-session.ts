import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { PlanMedication } from '@medchain/contracts';
import { useApp } from '@/state/AppContext';
import type { WizardDraft } from '@/database';
import { baseFromPlanState, type PlanBase } from './plan-composer';
import {
  clearCaregiverDraft,
  loadCaregiverDraft,
  loadStaged,
  saveCaregiverDraft,
  type SettingsStore,
} from './staged-store';
import { useRelationshipAccess, type RelationshipAccess } from './hooks';

export interface ParentCandidate {
  id: string;
  name: string;
  dosageText: string;
  courseType: PlanMedication['courseType'];
  /** true when it is in "Not sent yet" and the phone does not have it yet */
  staged?: boolean;
}

export interface WizardSession {
  /** Non-null in caregiver mode. */
  relationshipId: string | null;
  isCaregiver: boolean;
  access: RelationshipAccess;
  getDraft: () => Promise<WizardDraft | null>;
  saveDraft: (d: WizardDraft) => Promise<void>;
  clearDraft: () => Promise<void>;
  /** Appends the relationshipId so every step of the wizard knows who is being managed. */
  route: (path: string) => any;
  /** Caregiver mode only: medicines on the plan + staged, for parent pickers. */
  planCandidates: ParentCandidate[];
  planBase: PlanBase | null;
  staged: PlanMedication[];
  planLoading: boolean;
  planError: string | null;
}

const PLAN_TTL_MS = 30_000;
const planCache = new Map<string, { at: number; base: PlanBase }>();

/**
 * Shared by the 4 wizard screens. In personal mode it is a thin wrapper over the local drafts
 * (behaviour unchanged). In caregiver mode (a `relationshipId` route param, or the selected
 * relationship while `mode === 'caregiver'`) drafts live per patient in device_settings and parent
 * pickers read the patient's PLAN, not the local database.
 */
export function useWizardSession(): WizardSession {
  const params = useLocalSearchParams<{ relationshipId?: string }>();
  const app = useApp();
  const paramId = typeof params.relationshipId === 'string' && params.relationshipId ? params.relationshipId : null;
  const relationshipId =
    paramId ?? (app.mode === 'caregiver' ? app.selectedRelationship?.relationshipId ?? null : null);
  const isCaregiver = !!relationshipId;
  const access = useRelationshipAccess(relationshipId ?? undefined);

  const { db, api } = app;
  const store = db?.settings as SettingsStore | undefined;

  const getDraft = useCallback(async () => {
    if (isCaregiver) return store && relationshipId ? loadCaregiverDraft(store, relationshipId) : null;
    return app.getDraft();
  }, [isCaregiver, store, relationshipId, app.getDraft]);

  const saveDraft = useCallback(
    async (d: WizardDraft) => {
      if (isCaregiver) {
        if (store && relationshipId) await saveCaregiverDraft(store, relationshipId, d);
        return;
      }
      await app.saveDraft(d);
    },
    [isCaregiver, store, relationshipId, app.saveDraft]
  );

  const clearDraft = useCallback(async () => {
    if (isCaregiver) {
      if (store && relationshipId) await clearCaregiverDraft(store, relationshipId);
      return;
    }
    await app.clearDraft();
  }, [isCaregiver, store, relationshipId, app.clearDraft]);

  const route = useCallback(
    (path: string) => (relationshipId ? `${path}?relationshipId=${encodeURIComponent(relationshipId)}` : path),
    [relationshipId]
  );

  const [planBase, setPlanBase] = useState<PlanBase | null>(null);
  const [staged, setStaged] = useState<PlanMedication[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isCaregiver || !relationshipId) return;
    let cancelled = false;
    (async () => {
      if (store) {
        try {
          const s = await loadStaged(store, relationshipId);
          if (!cancelled) setStaged(s);
        } catch {
          // unsent medicines simply do not appear as parent choices
        }
      }
      const cached = planCache.get(relationshipId);
      if (cached && Date.now() - cached.at < PLAN_TTL_MS) {
        setPlanBase(cached.base);
        return;
      }
      setPlanLoading(true);
      try {
        const plan = await api.getPlan(relationshipId);
        const base = baseFromPlanState(plan);
        planCache.set(relationshipId, { at: Date.now(), base });
        if (!cancelled) {
          setPlanBase(base);
          setPlanError(null);
        }
      } catch {
        if (!cancelled) {
          setPlanBase(cached?.base ?? null);
          setPlanError("Couldn't load the current medicines. Check your connection.");
        }
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCaregiver, relationshipId, store, api]);

  const planCandidates = useMemo<ParentCandidate[]>(() => {
    if (!isCaregiver) return [];
    const out = new Map<string, ParentCandidate>();
    for (const m of planBase?.medications ?? []) {
      out.set(m.id, { id: m.id, name: m.name, dosageText: m.dosageText, courseType: m.courseType });
    }
    for (const m of staged) out.set(m.id, { id: m.id, name: m.name, dosageText: m.dosageText, courseType: m.courseType, staged: true });
    return [...out.values()];
  }, [isCaregiver, planBase, staged]);

  return {
    relationshipId,
    isCaregiver,
    access,
    getDraft,
    saveDraft,
    clearDraft,
    route,
    planCandidates,
    planBase,
    staged,
    planLoading,
    planError,
  };
}

/** Drops cached plan reads for a patient after something was sent. */
export function invalidatePlanCache(relationshipId: string) {
  planCache.delete(relationshipId);
}
