import { PlanMedicationSchema, type PlanMedication } from '@medchain/contracts';
import type { WizardDraft } from '../database/repositories/draft-repository';

/** Minimal slice of DeviceSettingsRepository so this module stays testable. */
export interface SettingsStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const stagedKey = (relationshipId: string) => `caregiver_staged_${relationshipId}`;
export const caregiverDraftKey = (relationshipId: string) => `caregiver_draft_${relationshipId}`;
export const lastCommandKey = (relationshipId: string) => `caregiver_last_command_${relationshipId}`;

export async function loadStaged(store: SettingsStore, relationshipId: string): Promise<PlanMedication[]> {
  const raw = await store.get(stagedKey(relationshipId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { medications?: unknown[] };
    const out: PlanMedication[] = [];
    for (const item of parsed.medications ?? []) {
      const r = PlanMedicationSchema.safeParse(item);
      if (r.success) out.push(r.data);
    }
    return out;
  } catch {
    return [];
  }
}

export async function saveStaged(store: SettingsStore, relationshipId: string, meds: PlanMedication[]): Promise<void> {
  if (meds.length === 0) {
    await store.delete(stagedKey(relationshipId));
    return;
  }
  await store.set(stagedKey(relationshipId), JSON.stringify({ v: 1, medications: meds }));
}

export async function clearStaged(store: SettingsStore, relationshipId: string): Promise<void> {
  await store.delete(stagedKey(relationshipId));
}

/** The caregiver's in-progress wizard draft is kept per patient so it never mixes with personal-mode drafts. */
export async function loadCaregiverDraft(store: SettingsStore, relationshipId: string): Promise<WizardDraft | null> {
  const raw = await store.get(caregiverDraftKey(relationshipId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WizardDraft;
  } catch {
    return null;
  }
}

export async function saveCaregiverDraft(store: SettingsStore, relationshipId: string, draft: WizardDraft): Promise<void> {
  await store.set(caregiverDraftKey(relationshipId), JSON.stringify(draft));
}

export async function clearCaregiverDraft(store: SettingsStore, relationshipId: string): Promise<void> {
  await store.delete(caregiverDraftKey(relationshipId));
}

export interface TrackedCommand {
  commandId: string;
  sentAt: string;
  medicineNames: string[];
}

export async function loadTrackedCommand(store: SettingsStore, relationshipId: string): Promise<TrackedCommand | null> {
  const raw = await store.get(lastCommandKey(relationshipId));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as TrackedCommand;
    return v && typeof v.commandId === 'string' ? v : null;
  } catch {
    return null;
  }
}

export async function saveTrackedCommand(store: SettingsStore, relationshipId: string, cmd: TrackedCommand): Promise<void> {
  await store.set(lastCommandKey(relationshipId), JSON.stringify(cmd));
}

export async function clearTrackedCommand(store: SettingsStore, relationshipId: string): Promise<void> {
  await store.delete(lastCommandKey(relationshipId));
}
