import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { AppScreen } from '@/components/AppScreen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { PatientContextBar } from '@/components/PatientContextBar';
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
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

export default function Step4ReviewConfirmScreen() {
  const router = useRouter();
  const { api, db, createMedicationFromDraft, medications } = useApp();
  const session = useWizardSession();
  const { getDraft, saveDraft, clearDraft } = session;

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
      <AppScreen>
        <ActivityIndicator size="large" color={Colors.brand} style={{ marginTop: 40 }} />
      </AppScreen>
    );
  }

  if (session.isCaregiver) {
    if (session.access.state !== 'ready') return <CheckingScreen title="Review and confirm" />;
    if (!session.access.canEdit) {
      return (
        <AppScreen>
          <ScreenHeader title="Review and confirm" showBack={true} />
          <Notice icon="eye-outline" title="View only">
            You do not have permission to change {session.access.relationship.patientDisplayName}'s medicines.
          </Notice>
        </AppScreen>
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
    <AppScreen>
      <ScreenHeader
        title="Review and confirm"
        subtitle="Step 4 of 4: check the details"
        showBack={true}
      />

      {isCaregiverReady && caregiverRel && (
        <PatientContextBar
          patientName={caregiverRel.patientDisplayName}
          relationshipLabel={caregiverRel.relationshipLabel}
        />
      )}

      {isSaving && isCaregiverReady && (
        <View style={styles.waitingBanner} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={Colors.brand} />
          <Text style={styles.waitingText}>Sending…</Text>
        </View>
      )}

      {/* Section 1: Identification & Dose */}
      <View style={styles.reviewCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardHeader}>Medicine details</Text>
          <TouchableOpacity style={styles.editBtn} accessibilityRole="button" accessibilityLabel="Edit this section" onPress={() => navigateToStep(1, '/medicine/new/details')}>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Name</Text>
          <Text style={styles.detailValue}>{draft.name || 'Unnamed'}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Strength</Text>
          <Text style={styles.detailValue}>{draft.dosageText || 'Not set'}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Dose</Text>
          <Text style={styles.detailValue}>
            {draft.doseQuantity} {draft.doseUnit}
          </Text>
        </View>

        {draft.instructions ? (
          <>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Instructions</Text>
              <Text style={styles.detailValue}>{draft.instructions}</Text>
            </View>
          </>
        ) : null}

        {draft.trackStock ? (
          <>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Stock</Text>
              <Text style={styles.detailValue}>
                {draft.currentStock} {draft.doseUnit} (low stock at {draft.lowStockThreshold})
              </Text>
            </View>
          </>
        ) : null}
      </View>

      {/* Section 2: Reminder Schedule */}
      <View style={styles.reviewCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardHeader}>Reminder schedule</Text>
          <TouchableOpacity style={styles.editBtn} accessibilityRole="button" accessibilityLabel="Edit this section" onPress={() => navigateToStep(2, '/medicine/new/schedule')}>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Repeats</Text>
          <Text style={styles.detailValue}>{SCHEDULE_TEXT[draft.scheduleType] ?? draft.scheduleType}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Timing</Text>
          <Text style={styles.detailValue}>{scheduleSummary}</Text>
        </View>

        {draft.scheduleType === 'SAME_DAY_DEPENDENT' && (
          <>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>If that dose is skipped</Text>
              <Text style={styles.detailValue}>
                {draft.sameDayFallbackPolicy === 'SKIP_CHILD'
                  ? 'Skip this medicine too'
                  : `Remind at ${draft.sameDayFallbackTime}`}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Section 3: Treatment Duration */}
      <View style={styles.reviewCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardHeader}>Treatment duration</Text>
          <TouchableOpacity style={styles.editBtn} accessibilityRole="button" accessibilityLabel="Edit this section" onPress={() => navigateToStep(3, '/medicine/new/treatment')}>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Length</Text>
          <Text style={styles.detailValue}>{durationSummary}</Text>
        </View>

        {draft.hasPrerequisiteCourse && (
          <>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Starts after this course</Text>
              <Text style={styles.detailValue}>
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
          <Text style={styles.sendingTo} accessibilityRole="header">
            Sending to {caregiverRel.patientDisplayName} ({caregiverRel.relationshipLabel})
          </Text>
        )}
        <PrimaryButton
          title={
            isSaving
              ? isCaregiverReady
                ? 'Sending…'
                : 'Saving…'
              : isCaregiverReady && caregiverRel
              ? `Send to ${caregiverRel.patientDisplayName}'s phone`
              : 'Save medicine'
          }
          onPress={() => handleSave(false)}
          disabled={isSaving}
        />
        <SecondaryButton
          title="Save and add a follow-up medicine"
          onPress={() => handleSave(true)}
          disabled={isSaving}
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  waitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.brandSoft,
    padding: Spacing.md,
    borderRadius: Radii.card,
    marginBottom: Spacing.md,
  },
  waitingText: {
    ...Typography.bodySmall,
    color: Colors.brand,
    flex: 1,
  },
  reviewCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flex: 1,
    ...Typography.labelMedium,
    color: Colors.ink,
    fontWeight: '700',
  },
  editBtn: { minHeight: 48, minWidth: 48, alignItems: 'flex-end', justifyContent: 'center' },
  editLink: {
    ...Typography.labelSmall,
    color: Colors.brand,
    fontWeight: '700',
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
    ...Typography.bodySmall,
    color: Colors.inkMuted,
  },
  detailValue: {
    ...Typography.bodySmall,
    color: Colors.ink,
    fontWeight: '600',
    flexShrink: 1,
    maxWidth: '62%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.outline,
    marginVertical: Spacing.xs,
  },
  sendingTo: {
    ...Typography.labelMedium,
    color: Colors.primary,
  },
  actions: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.xxl,
  },
});
