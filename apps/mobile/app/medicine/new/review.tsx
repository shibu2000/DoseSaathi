import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PatientContextBar } from '@/components/PatientContextBar';
import { Spacing, Radii, scaleFont, FontFamily } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { useApp } from '@/state/AppContext';
import { DEFAULT_WIZARD_DRAFT, type WizardDraft } from '@/database';
import { generateUUID } from '@/utils/uuid';
import { useWizardSession, invalidatePlanCache } from '@/caregiver/wizard-session';
import { CheckingScreen, Notice } from '@/caregiver/ui';
import {
  buildSnapshot,
  draftToPlanMedication,
  stageMedication,
  validateSnapshot,
} from '@/caregiver/plan-composer';
import { describeSubmitError, submitComposedPlan } from '@/caregiver/submit';
import { clearStaged, saveStaged, saveTrackedCommand, type SettingsStore } from '@/caregiver/staged-store';
import { Ionicons } from '@expo/vector-icons';
import { StepProgressBar } from '@/components/StepProgressBar';

export default function Step4ReviewConfirmScreen() {
  const router = useRouter();
  const { api, db, createMedicationFromDraft, medications } = useApp();
  const session = useWizardSession();
  const { getDraft, saveDraft, clearDraft } = session;
  const { colors, isDark } = useTheme();

  const [draft, setDraft] = useState<WizardDraft>(DEFAULT_WIZARD_DRAFT);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  // One idempotency key per review screen: a retry after a network failure replays instead of duplicating.
  const sendKey = useRef(generateUUID());

  useEffect(() => {
    async function load() {
      const d = await getDraft();
      if (d) setDraft(d);
      setLoading(false);
    }
    load();
  }, [getDraft]);

  const navigateToStep = async (step: number, route: string) => {
    const updated = { ...draft, currentStep: step };
    try {
      await saveDraft(updated);
    } catch {
      setErrorText("Couldn't save your changes on the phone. Please try again.");
      return;
    }
    router.push(session.route(route) as any);
  };

  const handleCaregiverSave = async (addFollowUp: boolean) => {
    if (session.access.state !== 'ready' || !session.relationshipId || !db) return;
    const rel = session.access.relationship;
    const store = db.settings as SettingsStore;
    const relId = session.relationshipId;
    setErrorText(null);

    const medId = draft.editingMedicationId ?? draft.id ?? generateUUID();
    const composed = draftToPlanMedication(draft, medId);
    const stagedAll = stageMedication(session.staged, composed);

    // Quick local check against the plan we last read; the authoritative check re-runs on fresh data when sending.
    if (session.planBase) {
      const preview = buildSnapshot({ base: session.planBase, upserts: stagedAll });
      const issues = validateSnapshot(preview);
      if (issues.length > 0) {
        setErrorText(issues[0].message);
        return;
      }
    } else if (addFollowUp) {
      setErrorText(session.planError ?? 'Still loading the current medicines. Try again in a moment.');
      return;
    }

    setIsSaving(true);
    try {
      if (addFollowUp) {
        await saveStaged(store, relId, stagedAll);
        const followUp: WizardDraft = {
          ...DEFAULT_WIZARD_DRAFT,
          id: generateUUID(),
          hasPrerequisiteCourse: true,
          prerequisiteMedicationId: medId,
          currentStep: 1,
        };
        await saveDraft(followUp);
        router.replace(session.route('/medicine/new/details') as any);
        return;
      }

      const res = await submitComposedPlan(api, relId, (base) => buildSnapshot({ base, upserts: stagedAll }), sendKey.current);
      await saveTrackedCommand(store, relId, {
        commandId: res.commandId,
        sentAt: new Date().toISOString(),
        medicineNames: stagedAll.map((m) => m.name),
      });
      await clearStaged(store, relId);
      await clearDraft();
      invalidatePlanCache(relId);
      // Nothing is "applied" yet: the Medicines screen shows the real state as the phone reports it.
      router.replace(`/(caregiver)/patient/${rel.relationshipId}/medicines` as any);
    } catch (err) {
      setErrorText(describeSubmitError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (addFollowUp = false) => {
    if (isSaving) return;
    if (session.isCaregiver) {
      await handleCaregiverSave(addFollowUp);
      return;
    }
    setIsSaving(true);
    setErrorText(null);

    try {
      // Personal mode: atomic SQLite transaction
      const { medication } = await createMedicationFromDraft(draft);

      if (addFollowUp) {
        // Initialize follow-up draft with prerequisite course linked
        const followUpDraft: WizardDraft = {
          ...DEFAULT_WIZARD_DRAFT,
          hasPrerequisiteCourse: true,
          prerequisiteMedicationId: medication.id,
          currentStep: 1,
        };
        await saveDraft(followUpDraft);
        setIsSaving(false);
        router.replace('/medicine/new/details');
      } else {
        await clearDraft();
        setIsSaving(false);
        router.replace('/(patient)/(tabs)/medicines');
      }
    } catch (err) {
      console.error('Error saving medication:', err);
      setErrorText("Couldn't save this medicine. Nothing was lost. Please try again.");
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (session.isCaregiver) {
    if (session.access.state !== 'ready') return <CheckingScreen title="Review and confirm" />;
    if (!session.access.canEdit) {
      return (
        <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
          <View style={styles.topHeader}>
            <TouchableOpacity
              style={[styles.backCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
              Review and confirm
            </Text>
          </View>
          <View style={{ padding: Spacing.xl }}>
            <Notice icon="eye-outline" title="View only">
              You do not have permission to change {session.access.relationship.patientDisplayName}'s medicines.
            </Notice>
          </View>
        </SafeAreaView>
      );
    }
  }

  // Formatting helpers
  const nameOf = (medId?: string) =>
    session.isCaregiver
      ? session.planCandidates.find((m) => m.id === medId)?.name
      : medications.find((m) => m.id === medId)?.name;
  const parentMed = { name: nameOf(draft.sameDayParentMedicationId) };
  const prereqMed = { name: nameOf(draft.prerequisiteMedicationId) };
  const isCaregiverReady = session.isCaregiver && session.access.state === 'ready';
  const caregiverRel = session.access.state === 'ready' ? session.access.relationship : null;
  const isEditing = Boolean(draft.editingMedicationId);
  const stagedOthers = session.staged.filter(
    (m) => m.id !== (draft.editingMedicationId ?? draft.id)
  );

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const SCHEDULE_TEXT: Record<string, string> = {
    FIXED_TIMES: 'Fixed times',
    INTERVAL: 'Every few hours',
    SAME_DAY_DEPENDENT: 'After another medicine',
  };
  let scheduleSummary = 'Every day';
  if (draft.scheduleType === 'FIXED_TIMES') {
    const timesStr = draft.fixedTimes?.join(', ') || '08:00';
    if (draft.recurrenceType === 'DAILY') {
      scheduleSummary = `Every day at ${timesStr}`;
    } else if (draft.recurrenceType === 'SPECIFIC_DAYS') {
      scheduleSummary = `${(draft.activeWeekdays ?? []).map((d) => DAY_NAMES[d - 1]).filter(Boolean).join(', ')} at ${timesStr}`;
    } else if (draft.recurrenceType === 'CYCLE') {
      scheduleSummary = `${draft.cycleDaysOn} days on, ${draft.cycleDaysOff} days off, at ${timesStr}`;
    }
  } else if (draft.scheduleType === 'INTERVAL') {
    scheduleSummary = `Every ${draft.intervalHours} hours starting at ${draft.intervalFirstTime}`;
  } else if (draft.scheduleType === 'SAME_DAY_DEPENDENT') {
    scheduleSummary = `${draft.sameDayDelayMinutes} min after ${parentMed?.name || 'the other medicine'} is taken`;
  }

  let durationSummary = 'Ongoing, no end date';
  if (draft.courseType === 'FIXED_DAYS') {
    durationSummary = `${draft.maxDurationDays} days`;
  } else if (draft.courseType === 'FIXED_DOSES') {
    durationSummary = `${draft.maxTotalDoses} doses`;
  }

  return (
    <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header matching reference Phone 2 */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={[styles.backCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
            {isEditing ? 'Review Changes' : 'Add Medicine'}
          </Text>
        </View>

        {/* Step Progress Bar */}
        <StepProgressBar currentStep={4} totalSteps={4} stepName="Review & confirm" />

        {isEditing && (
          <View style={[styles.stepTabsRow, { backgroundColor: colors.surfaceSecondary, marginHorizontal: Spacing.xl }]}>
            <TouchableOpacity
              style={styles.stepTab}
              onPress={() => navigateToStep(1, '/medicine/new/details')}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepTabText, { color: colors.textSecondary }]}>1. Details</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stepTab}
              onPress={() => navigateToStep(2, '/medicine/new/schedule')}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepTabText, { color: colors.textSecondary }]}>2. Schedule</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stepTab}
              onPress={() => navigateToStep(3, '/medicine/new/treatment')}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepTabText, { color: colors.textSecondary }]}>3. Duration</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.stepTab, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
              <Text style={[styles.stepTabTextActive, { color: colors.surface }]}>4. Review</Text>
            </TouchableOpacity>
          </View>
        )}

        {isCaregiverReady && caregiverRel && (
          <View style={{ paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm }}>
            <PatientContextBar
              patientName={caregiverRel.patientDisplayName}
              relationshipLabel={caregiverRel.relationshipLabel}
            />
          </View>
        )}

        {isSaving && isCaregiverReady && (
          <View style={[styles.waitingBanner, { backgroundColor: colors.primaryLight }]} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.waitingText, { color: colors.primaryDark }]}>Sending…</Text>
          </View>
        )}

        <View style={{ paddingHorizontal: Spacing.xl }}>
          {/* Section 1: Identification & Dose */}
          <View
            style={[
              styles.reviewCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardHeader, { color: colors.textPrimary }]}>Medicine details</Text>
              <TouchableOpacity
                style={styles.editBtn}
                accessibilityRole="button"
                accessibilityLabel="Edit this section"
                onPress={() => navigateToStep(1, '/medicine/new/details')}
              >
                <Text style={[styles.editLink, { color: colors.primary }]}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Name</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{draft.name || 'Unnamed'}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Strength</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{draft.dosageText || 'Not set'}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Dose</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                {draft.doseQuantity} {draft.doseUnit}
              </Text>
            </View>

            {draft.instructions ? (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Instructions</Text>
                  <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{draft.instructions}</Text>
                </View>
              </>
            ) : null}

            {draft.trackStock ? (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Stock</Text>
                  <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                    {draft.currentStock} {draft.doseUnit} (low stock at {draft.lowStockThreshold})
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          {/* Section 2: Reminder Schedule */}
          <View
            style={[
              styles.reviewCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardHeader, { color: colors.textPrimary }]}>Reminder schedule</Text>
              <TouchableOpacity
                style={styles.editBtn}
                accessibilityRole="button"
                accessibilityLabel="Edit this section"
                onPress={() => navigateToStep(2, '/medicine/new/schedule')}
              >
                <Text style={[styles.editLink, { color: colors.primary }]}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Repeats</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                {SCHEDULE_TEXT[draft.scheduleType] ?? draft.scheduleType}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Timing</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{scheduleSummary}</Text>
            </View>

            {draft.scheduleType === 'SAME_DAY_DEPENDENT' && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>If that dose is skipped</Text>
                  <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                    {draft.sameDayFallbackPolicy === 'SKIP_CHILD'
                      ? 'Skip this medicine too'
                      : `Remind at ${draft.sameDayFallbackTime}`}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Section 3: Treatment Duration */}
          <View
            style={[
              styles.reviewCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardHeader, { color: colors.textPrimary }]}>Treatment duration</Text>
              <TouchableOpacity
                style={styles.editBtn}
                accessibilityRole="button"
                accessibilityLabel="Edit this section"
                onPress={() => navigateToStep(3, '/medicine/new/treatment')}
              >
                <Text style={[styles.editLink, { color: colors.primary }]}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Length</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{durationSummary}</Text>
            </View>

            {draft.hasPrerequisiteCourse && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Starts after this course</Text>
                  <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                    {prereqMed?.name || 'Another medicine'}
                    {draft.phaseDelayHours > 0 ? ` (plus ${draft.phaseDelayHours} h wait)` : ''}
                  </Text>
                </View>
              </>
            )}
          </View>

          {isCaregiverReady && stagedOthers.length > 0 && (
            <Notice icon="layers-outline" title={`Also sending ${stagedOthers.length} other ${stagedOthers.length === 1 ? 'medicine' : 'medicines'}`}>
              {stagedOthers.map((m) => m.name).join(', ')}. They are sent together as one prescription.
            </Notice>
          )}

          {isCaregiverReady && (
            <Notice icon="information-circle-outline" title="Not applied until the phone confirms">
              Sending saves this for the phone. You will see its real status on the Medicines screen once it arrives.
            </Notice>
          )}

          {errorText ? (
            <Notice icon="alert-circle-outline" tone="problem" title={isCaregiverReady ? 'Not sent' : 'Not saved'}>
              {errorText}
            </Notice>
          ) : null}

          {/* Action Buttons */}
          <View style={styles.actions}>
            {isCaregiverReady && caregiverRel && (
              <Text style={[styles.sendingTo, { color: colors.primary }]} accessibilityRole="header">
                Sending to {caregiverRel.patientDisplayName} ({caregiverRel.relationshipLabel})
              </Text>
            )}

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={() => handleSave(false)}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              <Text style={[styles.saveButtonText, { color: colors.surface }]}>
                {isSaving
                  ? isCaregiverReady
                    ? 'Sending…'
                    : 'Saving changes…'
                  : isCaregiverReady && caregiverRel
                  ? `Send to ${caregiverRel.patientDisplayName}'s phone`
                  : isEditing
                  ? 'Update medicine'
                  : 'Save medicine'}
              </Text>
            </TouchableOpacity>

            {!isEditing && (
              <TouchableOpacity
                style={[styles.secondaryActionBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => handleSave(true)}
                disabled={isSaving}
                activeOpacity={0.85}
              >
                <Text style={[styles.secondaryActionText, { color: colors.textPrimary }]}>
                  Save and add a follow-up medicine
                </Text>
              </TouchableOpacity>
            )}
          </View>
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
    paddingBottom: Spacing.xs,
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
  screenTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(22),
    letterSpacing: -0.3,
  },
  stepTabsRow: {
    flexDirection: 'row',
    borderRadius: Radii.md,
    padding: 3,
    marginBottom: Spacing.md,
    gap: 4,
  },
  stepTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.sm,
  },
  stepTabText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(11),
  },
  stepTabTextActive: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(11),
  },
  waitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radii.card,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  waitingText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13),
    flex: 1,
  },
  reviewCard: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cardHeader: {
    flex: 1,
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(16),
  },
  editBtn: {
    minHeight: 36,
    minWidth: 48,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  editLink: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(13.5),
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.xs,
  },
  detailLabel: {
    flexShrink: 1,
    marginRight: Spacing.md,
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13.5),
  },
  detailValue: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(13.5),
    flexShrink: 1,
    maxWidth: '62%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    marginVertical: Spacing.xs,
  },
  sendingTo: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14),
    marginBottom: Spacing.xs,
  },
  actions: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  saveButton: {
    height: 54,
    borderRadius: Radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#006156',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 3,
  },
  saveButtonText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(16),
    letterSpacing: 0.2,
  },
  secondaryActionBtn: {
    height: 50,
    borderRadius: Radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryActionText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14.5),
  },
});
