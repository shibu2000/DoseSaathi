import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusTag, type StatusVariant } from '@/components/StatusTag';
import { PrimaryButton, SecondaryButton, DestructiveButton } from '@/components/Buttons';
import { Spacing, Radii, scaleFont, FontFamily } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
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
import { formatSchedule } from '@/utils/schedule-formatter';

function PersonalMedicineDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { medications, db, saveDraft, deleteMedication } = useApp();
  const { colors } = useTheme();

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
      <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={[styles.backCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Medicine details</Text>
        </View>
        <View style={{ padding: Spacing.xl }}>
          <Text style={[styles.missingText, { color: colors.textSecondary }]}>
            This medicine was not found. It may have been deleted.
          </Text>
        </View>
      </SafeAreaView>
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

  const handleDelete = () => {
    Alert.alert(
      `Delete ${med.name}?`,
      'This will remove the medicine, stop all its reminders, and clear upcoming doses from today.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMedication(med.id);
              router.replace('/(patient)/(tabs)/medicines');
            } catch {
              Alert.alert('Error', "Couldn't delete medicine. Please try again.");
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={[styles.backCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={[styles.screenTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {med.name}
            </Text>
            <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
              {med.dosageText}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: Spacing.xl }}>
          {/* Inline Low Stock Notice */}
          {isLowStock && (
            <View style={[styles.lowStockBanner, { backgroundColor: '#FFF9E6', borderColor: colors.warning }]}>
              <MaterialIcons name="warning" size={24} color={colors.warning} />
              <View style={styles.lowStockTextContainer}>
                <Text style={[styles.lowStockTitle, { color: colors.warning }]}>Low stock remaining</Text>
                <Text style={[styles.lowStockDesc, { color: colors.textPrimary }]}>
                  {med.currentStock} {med.doseUnit} left. You asked to be reminded at {med.lowStockThreshold}. You may need a refill soon.
                </Text>
              </View>
            </View>
          )}

          {/* Details Card */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Status</Text>
              <StatusTag label={statusText} variant={statusVariant} />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Schedule & Timing</Text>
              <View style={styles.timingValueContainer}>
                {scheduleSummary.timesLabel ? (
                  <View style={[styles.timeTag, { backgroundColor: colors.primaryLight }]}>
                    <MaterialIcons name="schedule" size={14} color={colors.primary} />
                    <Text style={[styles.timeTagText, { color: colors.primaryDark }]}>{scheduleSummary.timesLabel}</Text>
                  </View>
                ) : null}
                <Text style={[styles.value, { color: colors.textPrimary }]}>{scheduleSummary.frequencyLabel}</Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Dose per intake</Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>
                {med.doseQuantity} {med.doseUnit}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Instructions</Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>{med.instructions || 'None specified'}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Course type</Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>
                {med.courseType === 'ONGOING'
                  ? 'Ongoing'
                  : med.courseType === 'FIXED_DAYS'
                  ? 'Set number of days'
                  : med.courseType === 'FIXED_DOSES'
                  ? 'Set number of doses'
                  : med.courseType}
              </Text>
            </View>

            {med.courseType === 'FIXED_DAYS' && med.maxDurationDays && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Course duration</Text>
                  <Text style={[styles.value, { color: colors.textPrimary }]}>{med.maxDurationDays} days</Text>
                </View>
              </>
            )}

            {med.courseType === 'FIXED_DOSES' && med.maxTotalDoses && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Total doses required</Text>
                  <Text style={[styles.value, { color: colors.textPrimary }]}>{med.maxTotalDoses} doses</Text>
                </View>
              </>
            )}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Confirmed doses taken</Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>{med.dosesTakenCount} doses</Text>
            </View>

            {med.trackStock && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Current supply</Text>
                  <Text style={[styles.value, { color: colors.textPrimary }]}>{med.currentStock} {med.doseUnit} left</Text>
                </View>
              </>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
              onPress={handleEdit}
              activeOpacity={0.85}
            >
              <Ionicons name="create-outline" size={18} color={colors.surface} />
              <Text style={[styles.primaryActionText, { color: colors.surface }]}>Edit medicine</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.destructiveActionBtn, { backgroundColor: '#FDF2F0', borderColor: '#F5C6CB' }]}
              onPress={handleDelete}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={[styles.destructiveActionText, { color: colors.error }]}>Delete medicine</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.back()}
              activeOpacity={0.85}
            >
              <Text style={[styles.secondaryActionText, { color: colors.textSecondary }]}>Back to Medicines</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  const { colors } = useTheme();
  const access = useRelationshipAccess(relationshipId);
  const canView = access.state === 'ready' && access.canView;
  const plan = usePatientPlan(relationshipId, canView);
  const stagedStore = useStagedMedications(relationshipId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendKey = React.useRef(generateUUID());

  if (access.state !== 'ready') return <CheckingScreen title="Medicine" />;
  const rel = access.relationship;

  if (!access.canView) {
    return (
      <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={[styles.backCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Medicine</Text>
        </View>
        <PatientContextBar patientName={rel.patientDisplayName} relationshipLabel={rel.relationshipLabel} />
        <View style={{ padding: Spacing.xl }}>
          <Notice icon="lock-closed-outline" title="Not shared with you">
            {rel.patientDisplayName} has not shared their medicines with you.
          </Notice>
        </View>
      </SafeAreaView>
    );
  }

  const stagedMed = stagedStore.staged.find((m) => m.id === id);
  const planMed = plan.medications.find((m) => m.id === id);
  const med = stagedMed ?? planMed;

  if (!med) {
    return (
      <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={[styles.backCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Medicine</Text>
        </View>
        <PatientContextBar patientName={rel.patientDisplayName} relationshipLabel={rel.relationshipLabel} />
        <View style={{ padding: Spacing.xl }}>
          {plan.loading || !stagedStore.ready ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : plan.error ? (
            <Notice icon="cloud-offline-outline" tone="problem" title="Couldn't load this medicine" actionLabel="Try again" onAction={plan.reload}>
              {plan.error}
            </Notice>
          ) : (
            <Notice icon="help-circle-outline" title="Medicine not found">
              It may have been removed from the plan.
            </Notice>
          )}
        </View>
      </SafeAreaView>
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
    <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={[styles.backCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={[styles.screenTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {med.name}
            </Text>
            <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
              {med.dosageText}
            </Text>
          </View>
        </View>

        <PatientContextBar patientName={rel.patientDisplayName} relationshipLabel={rel.relationshipLabel} />

        <View style={{ paddingHorizontal: Spacing.xl }}>
          {error ? (
            <Notice icon="alert-circle-outline" tone="problem" title="Not sent">
              {error}
            </Notice>
          ) : null}

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Status</Text>
              <StatusTag label={statusLabel} variant={statusVariant} />
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Dose</Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>
                {med.doseQuantity} {med.doseUnit}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Schedule</Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>{describeSchedule(med, nameOf)}</Text>
            </View>
            {med.startsAfter ? (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Starts after</Text>
                  <Text style={[styles.value, { color: colors.textPrimary }]}>
                    {nameOf(med.startsAfter.prerequisiteMedicationId)}
                    {med.startsAfter.phaseDelayHours > 0 ? ` (plus ${med.startsAfter.phaseDelayHours} h wait)` : ''}
                  </Text>
                </View>
              </>
            ) : null}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Instructions</Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>{med.instructions || 'None specified'}</Text>
            </View>
            {status ? (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Doses confirmed on the phone</Text>
                  <Text style={[styles.value, { color: colors.textPrimary }]}>{status.dosesTakenCount}</Text>
                </View>
                {status.currentStock !== undefined ? (
                  <>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <View style={styles.row}>
                      <Text style={[styles.label, { color: colors.textSecondary }]}>Supply on the phone</Text>
                      <Text style={[styles.value, { color: colors.textPrimary }]}>{status.currentStock} left</Text>
                    </View>
                  </>
                ) : null}
              </>
            ) : null}
          </View>

          {access.canEdit ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
                onPress={handleEdit}
                disabled={busy}
                activeOpacity={0.85}
              >
                <Ionicons name="create-outline" size={18} color={colors.surface} />
                <Text style={[styles.primaryActionText, { color: colors.surface }]}>Edit medicine</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.destructiveActionBtn, { backgroundColor: '#FDF2F0', borderColor: '#F5C6CB' }]}
                onPress={handleRemove}
                disabled={busy}
                activeOpacity={0.85}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
                <Text style={[styles.destructiveActionText, { color: colors.error }]}>
                  {isStaged ? 'Discard unsent medicine' : 'Remove medicine'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Notice icon="eye-outline" title="View only">
              You can see this medicine but not change it.
            </Notice>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.huge,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitles: {
    flex: 1,
  },
  screenTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(22),
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13.5),
    marginTop: 2,
  },
  missingText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(15),
  },
  lowStockBanner: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  lowStockTextContainer: {
    flex: 1,
  },
  lowStockTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(14),
  },
  lowStockDesc: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13),
    marginTop: 2,
    lineHeight: scaleFont(18),
  },
  card: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 5,
  },
  label: {
    flexShrink: 1,
    marginRight: Spacing.md,
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(14),
  },
  value: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14),
    flexShrink: 1,
    maxWidth: '58%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    marginVertical: Spacing.xs + 2,
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
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.full,
    marginBottom: 4,
  },
  timeTagText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(12.5),
  },
  actions: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  primaryActionBtn: {
    height: 52,
    borderRadius: Radii.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    shadowColor: '#006156',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryActionText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(15.5),
  },
  destructiveActionBtn: {
    height: 48,
    borderRadius: Radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  destructiveActionText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14.5),
  },
  secondaryActionBtn: {
    height: 48,
    borderRadius: Radii.card,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14.5),
  },
});
