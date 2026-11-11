import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { FormField } from '@/components/FormField';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
import { useApp } from '@/state/AppContext';
import { PatientContextBar } from '@/components/PatientContextBar';
import { useWizardSession } from '@/caregiver/wizard-session';
import { CheckingScreen, FormScreen, Notice } from '@/caregiver/ui';
import { DEFAULT_WIZARD_DRAFT, type WizardDraft } from '@/database';
import type { CourseType } from '@medchain/contracts';

const COURSE_TEXT: Record<string, string> = {
  ONGOING: 'Ongoing',
  FIXED_DAYS: 'Set number of days',
  FIXED_DOSES: 'Set number of doses',
};

export default function Step3TreatmentDurationScreen() {
  const router = useRouter();
  const session = useWizardSession();
  const { getDraft, saveDraft } = session;
  const { medications } = useApp();

  const [activeDraft, setActiveDraft] = useState<WizardDraft>(DEFAULT_WIZARD_DRAFT);
  const [courseType, setCourseType] = useState<CourseType>('ONGOING');
  const [durationDays, setDurationDays] = useState('7');
  const [totalDoses, setTotalDoses] = useState('14');
  const [hasPrerequisite, setHasPrerequisite] = useState(false);
  const [prereqMedId, setPrereqMedId] = useState<string>('');
  const [phaseDelayHours, setPhaseDelayHours] = useState('0');
  const [error, setError] = useState('');

  // Caregiver mode: only medicines on the patient's plan (+ not-yet-sent) that actually end can be followed.
  const candidatePrereqs: Array<{ id: string; name: string; dosageText: string; courseType: string }> = session.isCaregiver
    ? session.planCandidates.filter(
        (m) => m.id !== activeDraft.editingMedicationId && m.id !== activeDraft.id && m.courseType !== 'ONGOING'
      )
    : medications.filter((m) => !activeDraft.editingMedicationId || m.id !== activeDraft.editingMedicationId);

  useEffect(() => {
    async function load() {
      const draft = await getDraft();
      if (draft) {
        setActiveDraft(draft);
        setCourseType(draft.courseType || 'ONGOING');
        setDurationDays(String(draft.maxDurationDays ?? 7));
        setTotalDoses(String(draft.maxTotalDoses ?? 14));
        setHasPrerequisite(!!draft.hasPrerequisiteCourse);
        setPrereqMedId(draft.prerequisiteMedicationId || (session.isCaregiver ? '' : candidatePrereqs[0]?.id ?? ''));
        setPhaseDelayHours(String(draft.phaseDelayHours ?? 0));
      }
    }
    load();
  }, [getDraft]);

  const buildDraft = (): WizardDraft => {
    return {
      ...activeDraft,
      courseType,
      maxDurationDays: courseType === 'FIXED_DAYS' ? parseInt(durationDays, 10) || 7 : undefined,
      maxTotalDoses: courseType === 'FIXED_DOSES' ? parseInt(totalDoses, 10) || 14 : undefined,
      hasPrerequisiteCourse: hasPrerequisite,
      prerequisiteMedicationId: hasPrerequisite ? prereqMedId : undefined,
      phaseDelayHours: parseInt(phaseDelayHours, 10) || 0,
    };
  };

  const handleContinue = async () => {
    if (courseType === 'FIXED_DAYS') {
      const days = parseInt(durationDays, 10);
      if (isNaN(days) || days <= 0) {
        setError('Enter how many days the course lasts, for example 7.');
        return;
      }
    }
    if (courseType === 'FIXED_DOSES') {
      const doses = parseInt(totalDoses, 10);
      if (isNaN(doses) || doses <= 0) {
        setError('Enter how many doses the course has, for example 14.');
        return;
      }
    }
    if (hasPrerequisite && !prereqMedId) {
      setError('Choose which medicine this one starts after.');
      return;
    }
    if (hasPrerequisite && phaseDelayHours.trim() && !/^\d+$/.test(phaseDelayHours.trim())) {
      setError('Enter the hours to wait as a whole number, like 0 or 24.');
      return;
    }
    setError('');

    const updated = buildDraft();
    updated.currentStep = 4;
    try {
      await saveDraft(updated);
    } catch {
      setError("Couldn't save this step on the phone. Please try again.");
      return;
    }
    router.push(session.route('/medicine/new/review') as any);
  };

  const handleBack = async () => {
    const updated = buildDraft();
    updated.currentStep = 2;
    try {
      await saveDraft(updated);
    } catch {
      // going back must never be blocked
    }
    router.back();
  };

  if (session.isCaregiver) {
    if (session.access.state !== 'ready') return <CheckingScreen title="Treatment duration" />;
    if (!session.access.canEdit) {
      return (
        <FormScreen>
          <ScreenHeader title="Treatment duration" showBack={true} />
          <Notice icon="eye-outline" title="View only">
            You do not have permission to change {session.access.relationship.patientDisplayName}'s medicines.
          </Notice>
        </FormScreen>
      );
    }
  }

  return (
    <FormScreen>
      <ScreenHeader
        title="Treatment duration"
        subtitle="Step 3 of 4: how long the course lasts"
        showBack={true}
      />

      {session.isCaregiver && session.access.state === 'ready' && (
        <PatientContextBar
          patientName={session.access.relationship.patientDisplayName}
          relationshipLabel={session.access.relationship.relationshipLabel}
        />
      )}

      <View style={styles.formCard}>
        <Text style={styles.sectionLabel}>How long is the treatment?</Text>
        <View style={styles.radioGroup}>
          {/* Ongoing */}
          <TouchableOpacity
            style={[styles.radioCard, courseType === 'ONGOING' && styles.selectedRadio]}
            onPress={() => setCourseType('ONGOING')}
            accessibilityRole="radio"
            accessibilityState={{ selected: courseType === 'ONGOING' }}
          >
            <View style={styles.radioTop}>
              <Text style={styles.radioTitle}>Ongoing</Text>
              <View style={[styles.outerCircle, courseType === 'ONGOING' && styles.selectedOuterCircle]}>
                {courseType === 'ONGOING' && <View style={styles.innerCircle} />}
              </View>
            </View>
            <Text style={styles.radioDesc}>Taken long term, with no end date.</Text>
          </TouchableOpacity>

          {/* Fixed Days */}
          <TouchableOpacity
            style={[styles.radioCard, courseType === 'FIXED_DAYS' && styles.selectedRadio]}
            onPress={() => setCourseType('FIXED_DAYS')}
            accessibilityRole="radio"
            accessibilityState={{ selected: courseType === 'FIXED_DAYS' }}
          >
            <View style={styles.radioTop}>
              <Text style={styles.radioTitle}>Set number of days</Text>
              <View style={[styles.outerCircle, courseType === 'FIXED_DAYS' && styles.selectedOuterCircle]}>
                {courseType === 'FIXED_DAYS' && <View style={styles.innerCircle} />}
              </View>
            </View>
            <Text style={styles.radioDesc}>Ends after a number of days, like a 7-day course.</Text>
          </TouchableOpacity>

          {/* Fixed Doses */}
          <TouchableOpacity
            style={[styles.radioCard, courseType === 'FIXED_DOSES' && styles.selectedRadio]}
            onPress={() => setCourseType('FIXED_DOSES')}
            accessibilityRole="radio"
            accessibilityState={{ selected: courseType === 'FIXED_DOSES' }}
          >
            <View style={styles.radioTop}>
              <Text style={styles.radioTitle}>Set number of doses</Text>
              <View style={[styles.outerCircle, courseType === 'FIXED_DOSES' && styles.selectedOuterCircle]}>
                {courseType === 'FIXED_DOSES' && <View style={styles.innerCircle} />}
              </View>
            </View>
            <Text style={styles.radioDesc}>Ends after a number of doses are marked as taken.</Text>
          </TouchableOpacity>
        </View>

        {courseType === 'FIXED_DAYS' && (
          <FormField
            label="Number of days"
            keyboardType="numeric"
            value={durationDays}
            onChangeText={setDurationDays}
            helper="The course ends after this many days."
          />
        )}

        {courseType === 'FIXED_DOSES' && (
          <FormField
            label="Number of doses"
            keyboardType="numeric"
            value={totalDoses}
            onChangeText={setTotalDoses}
            helper="Only doses marked as taken are counted. Skipped doses are not."
          />
        )}

        <View style={styles.divider} />

        {/* Multi-day course dependency */}
        <View style={styles.switchRow}>
          <View style={styles.switchTextContainer}>
            <Text style={styles.switchLabel}>Start after another medicine completes</Text>
            <Text style={styles.switchDesc}>
              Starts after this course. It stays out of reminders until the other course has finished.
            </Text>
          </View>
          <Switch
            value={hasPrerequisite}
            onValueChange={setHasPrerequisite}
            accessibilityLabel="Start after another medicine completes"
            trackColor={{ false: Colors.outline, true: Colors.brand }}
          />
        </View>

        {hasPrerequisite && (
          <View style={styles.prereqBlock}>
            <Text style={styles.sectionLabel}>Which medicine comes first?</Text>
            {candidatePrereqs.length === 0 ? (
              <Text style={styles.warningText}>
                {session.isCaregiver && session.planError
                  ? session.planError
                  : session.isCaregiver
                  ? 'No medicine with an end date or dose count to follow yet. Add a medicine with a set duration first.'
                  : 'There are no other medicines to follow yet.'}
              </Text>
            ) : (
              <View style={styles.prereqList}>
                {candidatePrereqs.map((p) => {
                  const isSelected = prereqMedId === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.prereqOption, isSelected && styles.selectedPrereqOption]}
                      onPress={() => setPrereqMedId(p.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text style={[styles.prereqName, isSelected && styles.selectedPrereqName]}>
                        {p.name}
                      </Text>
                      <Text style={styles.prereqDesc}>{p.dosageText} • {COURSE_TEXT[p.courseType] ?? p.courseType}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <FormField
              label="Hours to wait after it finishes"
              placeholder="0"
              keyboardType="numeric"
              value={phaseDelayHours}
              onChangeText={setPhaseDelayHours}
              helper="For example 24 to start the next day. Use 0 to start right away."
            />
          </View>
        )}
      </View>

      {error ? (
        <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <PrimaryButton
          title="Continue to Review"
          onPress={handleContinue}
        />
        <SecondaryButton
          title="Back"
          onPress={handleBack}
        />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  formCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    ...Typography.labelMedium,
    color: Colors.ink,
    marginBottom: Spacing.sm,
  },
  radioGroup: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  radioCard: {
    minHeight: 56,
    backgroundColor: Colors.surfaceMuted,
    borderColor: Colors.outline,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.md,
  },
  selectedRadio: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brandSoft,
  },
  radioTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  radioTitle: {
    flex: 1,
    marginRight: Spacing.sm,
    ...Typography.labelMedium,
    color: Colors.ink,
    fontWeight: '700',
  },
  radioDesc: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
  },
  outerCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedOuterCircle: {
    borderColor: Colors.brand,
  },
  innerCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.brand,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.outline,
    marginVertical: Spacing.lg,
  },
  switchRow: {
    minHeight: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  switchTextContainer: {
    flex: 1,
    marginRight: Spacing.md,
  },
  switchLabel: {
    ...Typography.labelMedium,
    color: Colors.ink,
  },
  switchDesc: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    marginTop: 2,
  },
  prereqBlock: {
    marginTop: Spacing.sm,
  },
  prereqList: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  prereqOption: {
    borderWidth: 1,
    borderColor: Colors.outline,
    borderRadius: Radii.sm,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
  },
  selectedPrereqOption: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brandSoft,
  },
  prereqName: {
    ...Typography.labelMedium,
    color: Colors.ink,
  },
  selectedPrereqName: {
    color: Colors.brand,
    fontWeight: '700',
  },
  prereqDesc: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
  },
  warningText: {
    ...Typography.bodySmall,
    color: Colors.warning,
    marginBottom: Spacing.sm,
  },
  errorBox: {
    borderWidth: 1.5,
    borderColor: Colors.danger,
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    ...Typography.bodyMedium,
    color: Colors.danger,
  },
  footer: {
    gap: Spacing.xs,
    marginBottom: Spacing.xl,
  },
});
