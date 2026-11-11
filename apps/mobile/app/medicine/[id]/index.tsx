import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppScreen } from '@/components/AppScreen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StatusTag, type StatusVariant } from '@/components/StatusTag';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
import { useApp } from '@/state/AppContext';
import { DEFAULT_WIZARD_DRAFT, type WizardDraft } from '@/database';
import type { Schedule } from '@medchain/contracts';
import type { DependencyRecord } from '@/database/repositories/dependency-repository';
import { PatientContextBar } from '@/components/PatientContextBar';
import { Notice, CheckingScreen } from '@/caregiver/ui';
import { useRelationshipAccess, usePatientPlan, useStagedMedications } from '@/caregiver/hooks';
import { buildSnapshot, dependentsOf, describeSchedule } from '@/caregiver/plan-composer';
import { describeSubmitError, submitComposedPlan } from '@/caregiver/submit';
import { saveCaregiverDraft, saveTrackedCommand, type SettingsStore } from '@/caregiver/staged-store';
import { invalidatePlanCache } from '@/caregiver/wizard-session';
import { planMedicationToDraft } from '@/sync/plan-applier';
import { generateUUID } from '@/utils/uuid';
import { DestructiveButton } from '@/components/Buttons';
import { formatSchedule } from '@/utils/schedule-formatter';

function PersonalMedicineDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { medications, db, saveDraft, refreshMedications } = useApp();

  const med = medications.find((m) => m.id === id);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [parentDeps, setParentDeps] = useState<DependencyRecord[]>([]);

  useEffect(() => {
    async function loadExtra() {
      if (!db || !med) return;
      try {
        const s = await db.schedules.getByMedicationId(med.id);
        if (s) setSchedule(s);
        const pd = await db.dependencies.getParents(med.id);
        setParentDeps(pd);
      } catch {
        // details still show without the schedule
      }
    }
    loadExtra();
  }, [db, med]);

  if (!med) {
    return (
      <AppScreen>
        <ScreenHeader title="Medicine details" showBack={true} />
        <Text style={{ ...Typography.bodyMedium, color: Colors.inkMuted, marginTop: 20 }}>
          This medicine was not found. It may have been deleted.
        </Text>
      </AppScreen>
    );
  }

  const isLowStock = med.trackStock && med.currentStock <= med.lowStockThreshold;

  const parentMedName = parentDeps[0]
    ? medications.find((m) => m.id === parentDeps[0].parentMedicationId)?.name
    : undefined;
  const scheduleSummary = formatSchedule(schedule, med.instructions, parentMedName);

  let statusVariant: StatusVariant = 'taken';
  let statusText = 'Active';
  if (med.lifecycleStatus === 'QUEUED_PHASE') {
    statusVariant = 'queued';
    statusText = 'Starts later';
  } else if (med.lifecycleStatus === 'COMPLETED') {
    statusVariant = 'completed';
    statusText = 'Completed';
  }

  const handleEdit = async () => {
    const draft: WizardDraft = {
      ...DEFAULT_WIZARD_DRAFT,
      editingMedicationId: med.id,
      name: med.name,
      dosageText: med.dosageText,
      doseQuantity: med.doseQuantity,
      doseUnit: med.doseUnit,
      instructions: med.instructions || '',
      trackStock: med.trackStock,
      currentStock: med.currentStock,
      lowStockThreshold: med.lowStockThreshold,
      courseType: med.courseType,
      maxDurationDays: med.maxDurationDays ?? undefined,
      maxTotalDoses: med.maxTotalDoses ?? undefined,
      currentStep: 1,
    };

    if (schedule) {
      draft.scheduleType = schedule.scheduleType;
      draft.recurrenceType = schedule.recurrenceType;
      draft.fixedTimes = schedule.fixedTimes;
      draft.activeWeekdays = schedule.activeWeekdays;
      draft.intervalHours = schedule.intervalHours ?? 6;
      draft.intervalFirstTime = schedule.intervalFirstTime ?? '08:00';
      draft.cycleDaysOn = schedule.cycleDaysOn ?? 21;
      draft.cycleDaysOff = schedule.cycleDaysOff ?? 7;
    }

    if (parentDeps.length > 0) {
      const sameDay = parentDeps.find((d) => d.dependencyType === 'SAME_DAY_AFTER_TAKEN');
      if (sameDay) {
        draft.sameDayParentMedicationId = sameDay.parentMedicationId;
        draft.sameDayDelayMinutes = sameDay.delayMinutes;
        draft.sameDayFallbackPolicy = sameDay.fallbackPolicy ?? undefined;
        draft.sameDayFallbackTime = sameDay.fallbackTime ?? undefined;
      }
      const courseDep = parentDeps.find((d) => d.dependencyType === 'AFTER_COURSE_COMPLETED');
      if (courseDep) {
        draft.hasPrerequisiteCourse = true;
        draft.prerequisiteMedicationId = courseDep.parentMedicationId;
        draft.phaseDelayHours = courseDep.phaseDelayHours;
      }
    }

    try {
      await saveDraft(draft);
    } catch {
      Alert.alert("Couldn't open the editor", 'Something went wrong on this phone. Please try again.');
      return;
    }
    router.push('/medicine/new/details');
  };

  return (
    <AppScreen>
      <View style={{ paddingBottom: Spacing.xxl }}>
        <ScreenHeader
          title={med.name}
          subtitle={med.dosageText}
          showBack={true}
        />

        {/* Inline Low Stock Notice */}
        {isLowStock && (
          <View style={styles.lowStockBanner}>
            <MaterialIcons name="warning" size={24} color={Colors.warning} />
            <View style={styles.lowStockTextContainer}>
              <Text style={styles.lowStockTitle}>Low stock remaining</Text>
              <Text style={styles.lowStockDesc}>
                {med.currentStock} {med.doseUnit} left. You asked to be reminded at {med.lowStockThreshold}. You may need a refill.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <StatusTag label={statusText} variant={statusVariant} />
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>Schedule & Timing</Text>
            <View style={styles.timingValueContainer}>
              {scheduleSummary.timesLabel ? (
                <View style={styles.timeTag}>
                  <MaterialIcons name="schedule" size={14} color={Colors.primary} />
                  <Text style={styles.timeTagText}>{scheduleSummary.timesLabel}</Text>
                </View>
              ) : null}
              <Text style={styles.value}>{scheduleSummary.frequencyLabel}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>Dose per intake</Text>
            <Text style={styles.value}>
              {med.doseQuantity} {med.doseUnit}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>Instructions</Text>
            <Text style={styles.value}>{med.instructions || 'None specified'}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>Course type</Text>
            <Text style={styles.value}>{med.courseType === 'ONGOING' ? 'Ongoing' : med.courseType === 'FIXED_DAYS' ? 'Set number of days' : med.courseType === 'FIXED_DOSES' ? 'Set number of doses' : med.courseType}</Text>
          </View>

          {med.courseType === 'FIXED_DAYS' && med.maxDurationDays && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.label}>Course duration</Text>
                <Text style={styles.value}>{med.maxDurationDays} days</Text>
              </View>
            </>
          )}

          {med.courseType === 'FIXED_DOSES' && med.maxTotalDoses && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.label}>Total doses required</Text>
                <Text style={styles.value}>{med.maxTotalDoses} doses</Text>
              </View>
            </>
          )}

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>Confirmed doses taken</Text>
            <Text style={styles.value}>{med.dosesTakenCount} doses</Text>
          </View>

          {med.trackStock && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.label}>Current supply</Text>
                <Text style={styles.value}>{med.currentStock} {med.doseUnit} left</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            title="Edit medicine"
            onPress={handleEdit}
          />
          <SecondaryButton
            title="Back to Medicines"
            onPress={() => router.back()}
          />
        </View>
      </View>
    </AppScreen>
  );
}

export default function MedicationDetailsScreen() {
  const { relationshipId } = useLocalSearchParams<{ id: string; relationshipId?: string }>();
  if (typeof relationshipId === 'string' && relationshipId) {
    return <CaregiverMedicineDetails relationshipId={relationshipId} />;
  }
  return <PersonalMedicineDetails />;
}

/** Caregiver view: a medicine from the patient's PLAN plus the phone's reported progress. Never local data. */
function CaregiverMedicineDetails({ relationshipId }: { relationshipId: string }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { api, db } = useApp();
  const access = useRelationshipAccess(relationshipId);
  const canView = access.state === 'ready' && access.canView;
  const plan = usePatientPlan(relationshipId, canView);
  const stagedStore = useStagedMedications(relationshipId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendKey = React.useRef(generateUUID());

  if (access.state !== 'ready') return <CheckingScreen title="Medicine" />;
  const rel = access.relationship;

  const header = (
    <>
      <ScreenHeader title="Medicine" showBack={true} />
      <PatientContextBar patientName={rel.patientDisplayName} relationshipLabel={rel.relationshipLabel} />
    </>
  );

  if (!access.canView) {
    return (
      <AppScreen>
        {header}
        <Notice icon="lock-closed-outline" title="Not shared with you">
          {rel.patientDisplayName} has not shared their medicines with you.
        </Notice>
      </AppScreen>
    );
  }

  const stagedMed = stagedStore.staged.find((m) => m.id === id);
  const planMed = plan.medications.find((m) => m.id === id);
  const med = stagedMed ?? planMed;

  if (!med) {
    return (
      <AppScreen>
        {header}
        {plan.loading || !stagedStore.ready ? (
          <ActivityIndicator size="large" color={Colors.brand} style={{ marginTop: 40 }} accessibilityLabel="Loading" />
        ) : plan.error ? (
          <Notice icon="cloud-offline-outline" tone="problem" title="Couldn't load this medicine" actionLabel="Try again" onAction={plan.reload}>
            {plan.error}
          </Notice>
        ) : (
          <Notice icon="help-circle-outline" title="Medicine not found">
            It may have been removed from the plan.
          </Notice>
        )}
      </AppScreen>
    );
  }

  const allMeds = [...plan.medications.filter((m) => !stagedStore.staged.some((s) => s.id === m.id)), ...stagedStore.staged];
  const nameOf = (mid: string) => allMeds.find((m) => m.id === mid)?.name ?? 'another medicine';
  const status = plan.status.get(med.id);
  const isStaged = !!stagedMed;

  let statusLabel = 'Not on the phone yet';
  let statusVariant: StatusVariant = 'queued';
  if (isStaged) {
    statusLabel = 'Not sent yet';
  } else if (status?.lifecycleStatus === 'ACTIVE') {
    statusLabel = 'Active on the phone';
    statusVariant = 'taken';
  } else if (status?.lifecycleStatus === 'QUEUED_PHASE') {
    statusLabel = 'Starts later';
  } else if (status?.lifecycleStatus === 'COMPLETED') {
    statusLabel = 'Completed';
    statusVariant = 'completed';
  }

  const handleEdit = async () => {
    if (!db) return;
    const draft = planMedicationToDraft(med, true);
    draft.currentStep = 1;
    if (status?.currentStock !== undefined) draft.currentStock = status.currentStock;
    try {
      await saveCaregiverDraft(db.settings as SettingsStore, relationshipId, draft);
    } catch {
      setError("Couldn't open the editor. Please try again.");
      return;
    }
    router.push(`/medicine/new/details?relationshipId=${encodeURIComponent(relationshipId)}` as any);
  };

  const sendRemoval = async () => {
    if (!db) return;
    setBusy(true);
    setError(null);
    try {
      const res = await submitComposedPlan(api, relationshipId, (base) => buildSnapshot({ base, removeIds: [med.id] }), sendKey.current);
      await saveTrackedCommand(db.settings as SettingsStore, relationshipId, {
        commandId: res.commandId,
        sentAt: new Date().toISOString(),
        medicineNames: [`Remove ${med.name}`],
      });
      invalidatePlanCache(relationshipId);
      router.replace(`/(caregiver)/patient/${relationshipId}/medicines` as any);
    } catch (err) {
      setError(describeSubmitError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = () => {
    if (isStaged) {
      Alert.alert('Discard this medicine?', `${med.name} has not been sent yet. It will be removed from your unsent changes.`, [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            try {
              await stagedStore.replace(stagedStore.staged.filter((m) => m.id !== med.id));
              router.back();
            } catch {
              setError("Couldn't discard this medicine. Please try again.");
            }
          },
        },
      ]);
      return;
    }
    const dependents = dependentsOf(plan.medications, med.id);
    if (dependents.length > 0) {
      Alert.alert(
        `Can't remove ${med.name} yet`,
        `${dependents.map((d) => d.name).join(', ')} ${dependents.length === 1 ? 'depends' : 'depend'} on it. Change or remove ${dependents.length === 1 ? 'that medicine' : 'those medicines'} first.`
      );
      return;
    }
    Alert.alert(
      `Remove ${med.name}?`,
      `Its reminders on ${rel.patientDisplayName}'s phone will stop once the phone applies this. Doses already recorded stay in their history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: sendRemoval },
      ]
    );
  };

  return (
    <AppScreen>
      <ScreenHeader title={med.name} subtitle={med.dosageText} showBack={true} />
      <PatientContextBar patientName={rel.patientDisplayName} relationshipLabel={rel.relationshipLabel} />

      {error ? (
        <Notice icon="alert-circle-outline" tone="problem" title="Not sent">
          {error}
        </Notice>
      ) : null}

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <StatusTag label={statusLabel} variant={statusVariant} />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.label}>Dose</Text>
          <Text style={styles.value}>
            {med.doseQuantity} {med.doseUnit}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.label}>Schedule</Text>
          <Text style={styles.value}>{describeSchedule(med, nameOf)}</Text>
        </View>
        {med.startsAfter ? (
          <>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>Starts after</Text>
              <Text style={styles.value}>
                {nameOf(med.startsAfter.prerequisiteMedicationId)}
                {med.startsAfter.phaseDelayHours > 0 ? ` (plus ${med.startsAfter.phaseDelayHours} h wait)` : ''}
              </Text>
            </View>
          </>
        ) : null}
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.label}>Instructions</Text>
          <Text style={styles.value}>{med.instructions || 'None specified'}</Text>
        </View>
        {status ? (
          <>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>Doses confirmed on the phone</Text>
              <Text style={styles.value}>{status.dosesTakenCount}</Text>
            </View>
            {status.currentStock !== undefined ? (
              <>
                <View style={styles.divider} />
                <View style={styles.row}>
                  <Text style={styles.label}>Supply on the phone</Text>
                  <Text style={styles.value}>{status.currentStock} left</Text>
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </View>

      {access.canEdit ? (
        <View style={styles.actions}>
          <PrimaryButton title="Edit medicine" onPress={handleEdit} disabled={busy} />
          <DestructiveButton title={isStaged ? 'Discard unsent medicine' : 'Remove medicine'} onPress={handleRemove} loading={busy} />
        </View>
      ) : (
        <Notice icon="eye-outline" title="View only">
          You can see this medicine but not change it.
        </Notice>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  lowStockBanner: {
    backgroundColor: Colors.surface,
    borderColor: Colors.warning,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  lowStockTextContainer: {
    flex: 1,
  },
  lowStockTitle: {
    ...Typography.labelMedium,
    color: Colors.warning,
    fontWeight: '700',
  },
  lowStockDesc: {
    ...Typography.bodySmall,
    color: Colors.ink,
    marginTop: 2,
  },
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.xs,
  },
  label: {
    flexShrink: 1,
    marginRight: Spacing.md,
    ...Typography.bodyMedium,
    color: Colors.inkMuted,
  },
  value: {
    ...Typography.bodyMedium,
    color: Colors.ink,
    fontWeight: '600',
    flexShrink: 1,
    maxWidth: '58%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.outline,
    marginVertical: Spacing.sm,
  },
  actions: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  timingValueContainer: {
    alignItems: 'flex-end',
    flexShrink: 1,
    maxWidth: '65%',
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brandSoft,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.sm,
    marginBottom: 4,
  },
  timeTagText: {
    ...Typography.labelSmall,
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
});
