import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState as RNAppState } from 'react-native';
import type { Medication, Schedule, RelationshipSummary, PatientRelationship } from '@medchain/contracts';
import Constants from 'expo-constants';
import { localDateInZone } from '@medchain/domain';
import {
  getAppDatabase,
  AppDatabase,
  type OccurrenceWithMedication,
  type WizardDraft,
  type DoseActionResult,
  deviceTimeZone,
} from '@/database';
import { notifyLowStock, notifyCourseTransition } from '@/services/local-notifications';
import { SchedulerService } from '@/alarms';
import { ApiClient, ApiError, SyncWorker, type SyncResult, type CaregiverSession } from '@/sync';
import {
  checkDevicePermissions,
  requestNotificationPermission as reqNotifPermission,
  requestExactAlarmPermission as reqExactPermission,
  openBatteryOptimizationSettings as openBatterySettings,
  openAppSettings as openSystemSettings,
  scheduleTestAlarm as schedTestAlarm,
} from '@/services/permission-service';
import { MedchainAlarm } from '../../modules/medchain-alarm/src';

export type AppMode = 'personal' | 'caregiver';

export interface CaregiverRelationshipContext {
  relationshipId: string;
  patientName: string;
  relationshipLabel: string;
  permissions?: string[];
}

export type CaregiverUser = CaregiverSession['caregiver'];

export interface AppState {
  isReady: boolean;
  db: AppDatabase | null;
  scheduler: SchedulerService | null;
  api: ApiClient;
  mode: AppMode;
  isOnboarded: boolean;
  isOnline: boolean;
  patientName: string;
  /** Server-issued relationships for the signed-in caregiver (or the last cached copy when offline). */
  relationships: RelationshipSummary[];
  /** ISO time the relationship list was last confirmed by the server; null if never. */
  relationshipsSyncedAt: string | null;
  relationshipsStale: boolean;
  caregiver: CaregiverUser | null;
  caregiverLoading: boolean;
  signInCaregiver: (email: string, password: string) => Promise<void>;
  signUpCaregiver: (email: string, password: string, displayName: string) => Promise<void>;
  signOutCaregiver: () => Promise<void>;
  /** Permanently deletes the caregiver account and its server data. Throws ApiError on a wrong password. */
  deleteCaregiverAccount: (password: string) => Promise<void>;
  /** Patient side: ends all sharing and erases everything the server holds for this phone. Local medicines stay. */
  stopSharingAndEraseServerData: () => Promise<void>;
  selectedRelationship: CaregiverRelationshipContext | null;
  /** Patient side: true while at least one caregiver is linked to this phone. */
  sharingActive: boolean;
  patientRelationships: PatientRelationship[];
  refreshPatientRelationships: () => Promise<void>;
  startFamilySharing: (displayName: string) => Promise<void>;
  syncNow: () => Promise<SyncResult>;
  lastSync: { at: string; result: SyncResult } | null;
  medications: Medication[];
  schedules: Schedule[];
  todayOccurrences: OccurrenceWithMedication[];
  notificationPermission: 'granted' | 'denied' | 'prompt';
  exactAlarmPermission: 'granted' | 'denied' | 'prompt';
  setMode: (mode: AppMode) => void;
  setOnboarded: (onboarded: boolean) => void;
  setSelectedRelationship: (rel: CaregiverRelationshipContext | null) => void;
  refreshRelationships: () => Promise<void>;
  refreshMedications: () => Promise<void>;
  refreshTodayOccurrences: () => Promise<void>;
  addMedicationWithSchedule: (med: Medication, sched: Schedule) => void;
  updateMedication: (med: Medication) => void;
  recordDoseTaken: (medicationId: string, occurrenceId: string) => Promise<DoseActionResult>;
  recordDoseSnooze: (medicationId: string, occurrenceId: string) => Promise<void>;
  recordDoseSkip: (
    medicationId: string,
    occurrenceId: string,
    fallbackPolicy?: 'SKIP_CHILD' | 'USE_FALLBACK_TIME'
  ) => Promise<void>;
  undoCourseCompletion: (
    transitionEventId: string,
    courseId: string
  ) => Promise<{ success: boolean; reason?: string }>;
  saveDraft: (draft: WizardDraft) => Promise<void>;
  getDraft: () => Promise<WizardDraft | null>;
  clearDraft: () => Promise<void>;
  createMedicationFromDraft: (draft: WizardDraft) => Promise<{ medication: Medication; schedule: Schedule }>;
  refreshPermissions: () => Promise<{ notifications: string; exactAlarms: string }>;
  requestNotificationPermission: () => Promise<string>;
  requestExactAlarmPermission: () => Promise<string>;
  openBatteryOptimizationSettings: () => Promise<void>;
  openAppSettings: () => Promise<void>;
  scheduleTestAlarm: (delaySeconds?: number) => Promise<string>;
  resetToCleanSlate: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({
  children,
  initialDatabase,
  initialApiClient,
}: {
  children: React.ReactNode;
  initialDatabase?: AppDatabase;
  initialApiClient?: ApiClient;
}) {
  const [api] = useState<ApiClient>(() => initialApiClient || new ApiClient());
  const [db, setDb] = useState<AppDatabase | null>(initialDatabase || null);
  const [scheduler, setScheduler] = useState<SchedulerService | null>(
    initialDatabase ? new SchedulerService(initialDatabase) : null
  );
  const [isReady, setIsReady] = useState<boolean>(false);
  const [mode, setModeState] = useState<AppMode>('personal');
  const [isOnboarded, setOnboardedState] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [patientName, setPatientName] = useState<string>('Me');
  const [relationships, setRelationships] = useState<RelationshipSummary[]>([]);
  const [relationshipsSyncedAt, setRelationshipsSyncedAt] = useState<string | null>(null);
  const [relationshipsStale, setRelationshipsStale] = useState(false);
  const [caregiver, setCaregiver] = useState<CaregiverUser | null>(null);
  const [caregiverLoading, setCaregiverLoading] = useState(true);
  const [sharingActive, setSharingActive] = useState(false);
  const [patientRelationships, setPatientRelationships] = useState<PatientRelationship[]>([]);
  const [lastSync, setLastSync] = useState<{ at: string; result: SyncResult } | null>(null);
  const [selectedRelationship, setSelectedRelationship] =
    useState<CaregiverRelationshipContext | null>(null);

  const [medications, setMedications] = useState<Medication[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [todayOccurrences, setTodayOccurrences] = useState<OccurrenceWithMedication[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [exactAlarmPermission, setExactAlarmPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');

  const refreshPermissions = useCallback(async () => {
    try {
      const res = await checkDevicePermissions();
      const nState = res.notifications === 'unsupported' ? 'granted' : res.notifications;
      const eState = res.exactAlarms === 'unsupported' ? 'granted' : res.exactAlarms;
      setNotificationPermission(nState as 'granted' | 'denied' | 'prompt');
      setExactAlarmPermission(eState as 'granted' | 'denied' | 'prompt');
      return { notifications: nState, exactAlarms: eState };
    } catch {
      return { notifications: 'denied', exactAlarms: 'denied' };
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    const res = await reqNotifPermission();
    await refreshPermissions();
    return res;
  }, [refreshPermissions]);

  const requestExactAlarmPermission = useCallback(async () => {
    const res = await reqExactPermission();
    await refreshPermissions();
    return res;
  }, [refreshPermissions]);

  const openBatteryOptimizationSettings = useCallback(async () => {
    await openBatterySettings();
  }, []);

  const openAppSettings = useCallback(async () => {
    await openSystemSettings();
  }, []);

  const scheduleTestAlarm = useCallback(async (delaySeconds: number = 5) => {
    const v = (await db?.settings.get('alarm_voice')) === 'male' ? 'male' : 'female';
    return await schedTestAlarm(delaySeconds, v);
  }, [db]);

  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  const toContext = (r: RelationshipSummary): CaregiverRelationshipContext => ({
    relationshipId: r.relationshipId,
    patientName: r.patientDisplayName,
    relationshipLabel: r.relationshipLabel,
    permissions: r.permissions,
  });

  const applyRelationships = useCallback((items: RelationshipSummary[]) => {
    setRelationships(items);
    setSelectedRelationship((prev) => {
      // A revoked/removed relationship must never leak into the next view
      if (prev && items.some((i) => i.relationshipId === prev.relationshipId)) return prev;
      return items.length > 0 ? toContext(items[0]) : null;
    });
  }, []);

  const refreshRelationships = useCallback(async () => {
    const session = await api.credentials.getCaregiver();
    if (!session) {
      setRelationships([]);
      setSelectedRelationship(null);
      return;
    }
    try {
      const res = await api.listRelationships();
      const nowIso = new Date().toISOString();
      applyRelationships(res.items);
      setRelationshipsSyncedAt(nowIso);
      setRelationshipsStale(false);
      if (db) {
        await db.relationshipCache.clear();
        for (const item of res.items) await db.relationshipCache.upsertSummary(item, session.caregiver.id, nowIso);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'SESSION_EXPIRED' || err.code === 'NOT_SIGNED_IN')) {
        setCaregiver(null);
        setRelationships([]);
        return;
      }
      // Offline or server trouble: show the last confirmed copy, clearly labelled as such
      if (db) {
        const cached = await db.relationshipCache.getAllSummaries();
        applyRelationships(cached.map((c) => c.summary));
        setRelationshipsSyncedAt(cached.length ? cached.map((c) => c.lastSyncedAt).sort().slice(-1)[0] : null);
        setRelationshipsStale(true);
      }
    }
  }, [api, db, applyRelationships]);

  const signInCaregiver = useCallback(
    async (email: string, password: string) => {
      const s = await api.login({ email, password });
      setCaregiver(s.caregiver);
      await refreshRelationships();
    },
    [api, refreshRelationships]
  );

  const signUpCaregiver = useCallback(
    async (email: string, password: string, displayName: string) => {
      const s = await api.register({ email, password, displayName });
      setCaregiver(s.caregiver);
      await refreshRelationships();
    },
    [api, refreshRelationships]
  );

  const signOutCaregiver = useCallback(async () => {
    await api.logout();
    setCaregiver(null);
    setRelationships([]);
    setSelectedRelationship(null);
    setRelationshipsSyncedAt(null);
    // Nothing cached for this caregiver may outlive their session
    if (db) await db.relationshipCache.clear();
  }, [api, db]);

  const deleteCaregiverAccount = useCallback(
    async (password: string) => {
      await api.deleteCaregiverAccount(password);
      setCaregiver(null);
      setRelationships([]);
      setSelectedRelationship(null);
      setRelationshipsSyncedAt(null);
      if (db) await db.relationshipCache.clear();
    },
    [api, db]
  );

  // Restore the caregiver session (tokens live in SecureStore) on launch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await api.currentCaregiver();
        if (!cancelled) setCaregiver(c);
      } catch {
        if (!cancelled) setCaregiver(null);
      } finally {
        if (!cancelled) setCaregiverLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const refreshMedications = useCallback(async () => {
    if (!db) return;
    const [meds, scheds] = await Promise.all([
      db.medications.getAll(),
      db.schedules.getAll(),
    ]);
    setMedications(meds);
    setSchedules(scheds);
  }, [db]);

  const refreshTodayOccurrences = useCallback(async () => {
    if (!db) return;
    const today = localDateInZone(new Date(), deviceTimeZone());
    // Ensure occurrences are generated for today if not already
    await db.materializeOccurrences(today, today);
    const occs = await db.getOccurrencesWithMedication(today);
    setTodayOccurrences(occs);
  }, [db]);

  const resetToCleanSlate = useCallback(async () => {
    if (db) {
      await db.clearAllUserData();
      await refreshMedications();
      await refreshTodayOccurrences();
    }
  }, [db, refreshMedications, refreshTodayOccurrences]);

  // Keep native Android home screen widget updated with the next upcoming medicine & countdown
  useEffect(() => {
    if (!MedchainAlarm) return;
    const nowMs = Date.now();
    const unhandled = todayOccurrences.filter((o) => o.state !== 'TAKEN' && o.state !== 'SKIPPED');

    // Prioritize upcoming doses or currently active due doses (scheduled within last 45 minutes or upcoming)
    const upcomingOrDue = unhandled.filter((o) => {
      const triggerTime = new Date(o.snoozedUntil || o.scheduledAtUtc).getTime();
      return triggerTime >= nowMs - 45 * 60 * 1000;
    });

    const nextOcc = upcomingOrDue[0];
    if (nextOcc) {
      const triggerTime = new Date(nextOcc.snoozedUntil || nextOcc.scheduledAtUtc).getTime();
      MedchainAlarm.updateWidgetData({
        hasUpcoming: true,
        medicationName: nextOcc.medication.name,
        dosageText: `${nextOcc.medication.dosageText} • ${nextOcc.medication.doseQuantity} ${nextOcc.medication.doseUnit}`,
        scheduledTimeStr: nextOcc.scheduledLocalTime,
        triggerAtMillis: triggerTime,
        occurrenceId: nextOcc.id,
        state: nextOcc.snoozedUntil ? 'SNOOZED' : 'UPCOMING',
      }).catch(() => {});
    } else {
      MedchainAlarm.updateWidgetData({ hasUpcoming: false }).catch(() => {});
    }
  }, [todayOccurrences]);

  // Initial SQLite Setup & Seed
  useEffect(() => {
    let isCancelled = false;

    async function init() {
      try {
        const activeDb = initialDatabase || (await getAppDatabase());
        if (isCancelled) return;
        setDb(activeDb);

        // Seed initial data if first launch
        await activeDb.ensurePrimaryProfile();

        // Read profile
        const primary = await activeDb.profiles.getPrimary();
        if (primary && !isCancelled) {
          setPatientName(primary.displayName);
        }

        // Read settings
        const savedMode = (await activeDb.settings.get('app_mode')) as AppMode | null;
        if (savedMode && !isCancelled) setModeState(savedMode);

        const savedOnboarded = await activeDb.settings.getBoolean('is_onboarded', false);
        if (!isCancelled) setOnboardedState(savedOnboarded);

        // Query initial data
        const [meds, scheds] = await Promise.all([
          activeDb.medications.getAll(),
          activeDb.schedules.getAll(),
        ]);
        const today = localDateInZone(new Date(), deviceTimeZone());
        await activeDb.materializeOccurrences(today, today);
        const occs = await activeDb.getOccurrencesWithMedication(today);

        const schedService = new SchedulerService(activeDb);
        await schedService.reconcileAlarms();

        if (!isCancelled) {
          setScheduler(schedService);
          setMedications(meds);
          setSchedules(scheds);
          setTodayOccurrences(occs);
          setIsReady(true);
        }
      } catch (err) {
        console.error('Failed to initialize database:', err);
        if (!isCancelled) setIsReady(true);
      }
    }

    init();

    return () => {
      isCancelled = true;
    };
  }, [initialDatabase]);

  // Once the local database is ready, load family state (relationship list, sharing status)
  useEffect(() => {
    if (!db || !isReady) return;
    refreshRelationships();
    refreshPatientRelationships();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, isReady]);

  const setMode = useCallback(
    (newMode: AppMode) => {
      setModeState(newMode);
      if (db) {
        db.settings.set('app_mode', newMode).catch(() => {});
      }
    },
    [db]
  );

  const setOnboarded = useCallback(
    (onboarded: boolean) => {
      setOnboardedState(onboarded);
      if (db) {
        db.settings.setBoolean('is_onboarded', onboarded).catch(() => {});
      }
    },
    [db]
  );

  const addMedicationWithSchedule = useCallback((med: Medication, sched: Schedule) => {
    setMedications((prev) => [...prev, med]);
    setSchedules((prev) => [...prev, sched]);
  }, []);

  const updateMedication = useCallback((med: Medication) => {
    setMedications((prev) => prev.map((m) => (m.id === med.id ? med : m)));
  }, []);

  /** Re-reads state and re-arms native alarms after anything that can change the plan. */
  const afterPlanChange = useCallback(async () => {
    if (scheduler) {
      try {
        await scheduler.reconcileAlarms();
      } catch (err) {
        console.warn('Alarm reconciliation failed:', err);
      }
    }
    await refreshMedications();
    await refreshTodayOccurrences();
  }, [scheduler, refreshMedications, refreshTodayOccurrences]);

  const syncWorker = useMemo(
    () => (db && scheduler ? new SyncWorker(db, scheduler, api) : null),
    [db, scheduler, api]
  );

  const refreshPatientRelationships = useCallback(async () => {
    if (!db) return;
    if (!(await api.hasDeviceIdentity())) {
      setSharingActive(false);
      await db.settings.setBoolean('family_sharing_active', false);
      setPatientRelationships([]);
      return;
    }
    try {
      const res = await api.patientRelationships();
      setPatientRelationships(res.items);
      const active = res.items.some((r) => r.status === 'ACTIVE');
      setSharingActive(active);
      await db.settings.setBoolean('family_sharing_active', active);
    } catch {
      // Offline: keep the last known sharing state; local features are unaffected
    }
  }, [api, db]);

  const stopSharingAndEraseServerData = useCallback(async () => {
    if (!db) throw new Error('Database not initialized');
    await api.purgeDeviceData();
    // Nothing is queued for a server that no longer knows this phone
    await db.settings.setBoolean('family_sharing_active', false);
    await db.connection.run(`DELETE FROM sync_outbox;`);
    for (const key of ['sync_changes_cursor', 'sync_plan_hash', 'sync_server_plan_version']) await db.settings.delete(key);
    setSharingActive(false);
    setPatientRelationships([]);
  }, [api, db]);

  const syncNow = useCallback(async (): Promise<SyncResult> => {
    if (!syncWorker) {
      return { uploadedEventsCount: 0, appliedCommandsCount: 0, rejectedCommandsCount: 0, planPublished: false, errors: [], skippedReason: 'ERROR' };
    }
    const result = await syncWorker.syncAll();
    setLastSync({ at: new Date().toISOString(), result });
    setIsOnline(result.skippedReason !== 'OFFLINE');
    if (result.appliedCommandsCount > 0) {
      await refreshMedications();
      await refreshTodayOccurrences();
    }
    return result;
  }, [syncWorker, refreshMedications, refreshTodayOccurrences]);

  const startFamilySharing = useCallback(
    async (displayName: string) => {
      if (!db) throw new Error('Database not initialized');
      const name = displayName.trim();
      if (!name) throw new Error('Enter the name your family will see.');
      let pushToken: string | undefined;
      try {
        const N = await import('expo-notifications');
        pushToken = (await N.getDevicePushTokenAsync()).data as string;
      } catch {
        // No FCM/APNs token (not configured or permission off): sync still works when the app is opened
      }
      await api.registerDevice({
        displayName: name,
        appVersion: Constants.expoConfig?.version ?? '0.0.0',
        pushToken,
      });
      const primary = await db.profiles.getPrimary();
      if (primary) {
        await db.profiles.update({ id: primary.id, displayName: name, updatedAt: new Date().toISOString() });
        setPatientName(name);
      }
    },
    [api, db]
  );

  /**
   * Runs whenever the app returns to the foreground (and once at launch): retires calendar-day courses
   * that ended while the app was closed, flags doses nobody confirmed, re-arms alarms, refreshes state.
   * Time-critical work never depends on this: alarms themselves live in the OS.
   */
  const runMaintenance = useCallback(async () => {
    if (!db || !scheduler) return;
    try {
      const completed = await db.completeDueCalendarCourses();
      for (const c of completed) {
        const ended = await db.medications.getById(c.medicationId);
        if (ended) notifyCourseTransition(ended.name, c.activatedNames);
      }
      await db.markUnconfirmedDoses();
      await scheduler.reconcileAlarms();
      await refreshMedications();
      await refreshTodayOccurrences();
    } catch (err) {
      console.warn('Maintenance failed:', err);
    }
    // Family sync is best-effort and separate: a failure here never affects local reminders
    try {
      if (await db.settings.getBoolean('family_sharing_active', false)) await syncNow();
    } catch {}
  }, [db, scheduler, refreshMedications, refreshTodayOccurrences, syncNow]);

  const maintenanceRef = useRef(runMaintenance);
  maintenanceRef.current = runMaintenance;

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') {
        maintenanceRef.current();
        refreshPermissions();
        // Quiet reachability check; local features never depend on it
        api.health().then(() => setIsOnline(true)).catch(() => setIsOnline(false));
      }
    });
    return () => sub.remove();
  }, [api, refreshPermissions]);

  const recordDoseTaken = useCallback(
    async (medicationId: string, occurrenceId: string) => {
      if (!db) throw new Error('Database not initialized');
      const result = await db.recordDoseAction({
        medicationId,
        occurrenceId,
        action: 'TAKEN',
        actionTimestampUtc: new Date().toISOString(),
      });
      scheduler?.dismissOccurrence(occurrenceId).catch(() => {});
      if (result.lowStock) notifyLowStock(result.lowStock);
      if (result.courseCompleted) {
        const ended = await db.medications.getById(medicationId);
        if (ended) notifyCourseTransition(ended.name, result.activatedMedicationNames ?? []);
      }
      await afterPlanChange();
      return result;
    },
    [db, scheduler, afterPlanChange]
  );

  const recordDoseSnooze = useCallback(
    async (medicationId: string, occurrenceId: string) => {
      if (!db) throw new Error('Database not initialized');
      await db.recordDoseAction({
        medicationId,
        occurrenceId,
        action: 'SNOOZED',
        actionTimestampUtc: new Date().toISOString(),
      });
      scheduler?.dismissOccurrence(occurrenceId).catch(() => {});
      // Re-arms the native alarm for the snoozed time
      await afterPlanChange();
    },
    [db, afterPlanChange]
  );

  const recordDoseSkip = useCallback(
    async (
      medicationId: string,
      occurrenceId: string,
      fallbackPolicy?: 'SKIP_CHILD' | 'USE_FALLBACK_TIME'
    ) => {
      if (!db) throw new Error('Database not initialized');
      await db.recordDoseAction({
        medicationId,
        occurrenceId,
        action: 'SKIPPED',
        actionTimestampUtc: new Date().toISOString(),
        fallbackPolicy,
      });
      scheduler?.dismissOccurrence(occurrenceId).catch(() => {});
      await afterPlanChange();
    },
    [db, afterPlanChange]
  );

  const undoCourseCompletionAction = useCallback(
    async (transitionEventId: string, courseId: string) => {
      if (!db) throw new Error('Database not initialized');
      const nowIso = new Date().toISOString();
      const res = await db.undoCourseCompletion({
        transitionEventId,
        courseId,
        currentTimestampUtc: nowIso,
      });
      await afterPlanChange();
      return res;
    },
    [db, afterPlanChange]
  );

  const saveDraft = useCallback(
    async (draft: WizardDraft) => {
      if (!db) throw new Error('Database not initialized');
      await db.drafts.saveDraft(draft);
    },
    [db]
  );

  const getDraft = useCallback(async () => {
    if (!db) return null;
    return await db.drafts.getDraft();
  }, [db]);

  const clearDraft = useCallback(async () => {
    if (!db) return;
    await db.drafts.clearDraft();
  }, [db]);

  const createMedicationFromDraft = useCallback(
    async (draft: WizardDraft) => {
      if (!db) throw new Error('Database not initialized');
      const res = await db.createMedicationWithSchedule(draft);
      await afterPlanChange();
      return res;
    },
    [db, afterPlanChange]
  );

  return (
    <AppContext.Provider
      value={{
        isReady,
        db,
        scheduler,
        api,
        mode,
        isOnboarded,
        isOnline,
        patientName,
        relationships,
        relationshipsSyncedAt,
        relationshipsStale,
        caregiver,
        caregiverLoading,
        signInCaregiver,
        signUpCaregiver,
        signOutCaregiver,
        deleteCaregiverAccount,
        stopSharingAndEraseServerData,
        sharingActive,
        patientRelationships,
        refreshPatientRelationships,
        startFamilySharing,
        syncNow,
        lastSync,
        selectedRelationship,
        medications,
        schedules,
        todayOccurrences,
        notificationPermission,
        exactAlarmPermission,
        setMode,
        setOnboarded,
        setSelectedRelationship,
        refreshRelationships,
        refreshMedications,
        refreshTodayOccurrences,
        addMedicationWithSchedule,
        updateMedication,
        recordDoseTaken,
        recordDoseSnooze,
        recordDoseSkip,
        undoCourseCompletion: undoCourseCompletionAction,
        saveDraft,
        getDraft,
        clearDraft,
        createMedicationFromDraft,
        refreshPermissions,
        requestNotificationPermission,
        requestExactAlarmPermission,
        openBatteryOptimizationSettings,
        openAppSettings,
        scheduleTestAlarm,
        resetToCleanSlate,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
}
