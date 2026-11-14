import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FormField } from '@/components/FormField';
import { Spacing, Radii, scaleFont, FontFamily } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { useApp } from '@/state/AppContext';
import { PatientContextBar } from '@/components/PatientContextBar';
import { useWizardSession } from '@/caregiver/wizard-session';
import { CheckingScreen, FormScreen, Notice } from '@/caregiver/ui';
import { DEFAULT_WIZARD_DRAFT, type WizardDraft } from '@/database';
import type { CourseType } from '@medchain/contracts';
import { Ionicons } from '@expo/vector-icons';
import { StepProgressBar } from '@/components/StepProgressBar';

const COURSE_TEXT: Record<string, string> = {
  ONGOING: 'Ongoing',
  FIXED_DAYS: 'Set number of days',
  FIXED_DOSES: 'Set number of doses',
};

export default function Step3TreatmentDurationScreen() {
  const router = useRouter();
  const session = useWizardSession();
  const { getDraft, saveDraft, clearDraft } = session;
  const { medications, createMedicationFromDraft } = useApp();
  const { colors, isDark } = useTheme();

  const [activeDraft, setActiveDraft] = useState<WizardDraft>(DEFAULT_WIZARD_DRAFT);
  const [courseType, setCourseType] = useState<CourseType>('ONGOING');
  const [durationDays, setDurationDays] = useState('7');
  const [totalDoses, setTotalDoses] = useState('14');
  const [hasPrerequisite, setHasPrerequisite] = useState(false);
  const [prereqMedId, setPrereqMedId] = useState<string>('');
  const [phaseDelayHours, setPhaseDelayHours] = useState('0');
  const [error, setError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const isEditing = Boolean(activeDraft.editingMedicationId);

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

  const validateTreatment = (): boolean => {
    if (courseType === 'FIXED_DAYS') {
      const days = parseInt(durationDays, 10);
      if (isNaN(days) || days <= 0) {
        setError('Enter how many days the course lasts, for example 7.');
        return false;
      }
    }
    if (courseType === 'FIXED_DOSES') {
      const doses = parseInt(totalDoses, 10);
      if (isNaN(doses) || doses <= 0) {
        setError('Enter how many doses the course has, for example 14.');
        return false;
      }
    }
    if (hasPrerequisite && !prereqMedId) {
      setError('Choose which medicine this one starts after.');
      return false;
    }
    if (hasPrerequisite && phaseDelayHours.trim() && !/^\d+$/.test(phaseDelayHours.trim())) {
      setError('Enter the hours to wait as a whole number, like 0 or 24.');
      return false;
    }
    setError('');
    return true;
  };

  const handleContinue = async () => {
    if (!validateTreatment()) return;

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

  const handleQuickSave = async () => {
    if (!validateTreatment()) return;
    const updated = buildDraft();

    if (session.isCaregiver) {
      try {
        await saveDraft(updated);
        router.push(session.route('/medicine/new/review') as any);
      } catch {
        setError("Couldn't save changes. Please try again.");
      }
      return;
    }

    try {
      setIsUpdating(true);
      await createMedicationFromDraft(updated);
      await clearDraft();
      router.replace('/(patient)/(tabs)/medicines');
    } catch {
      setError("Couldn't update this medicine. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleJumpToStep = async (stepRoute: string, stepNum: number) => {
    if (!validateTreatment()) return;
    const updated = buildDraft();
    updated.currentStep = stepNum;
    try {
      await saveDraft(updated);
      router.push(session.route(stepRoute) as any);
    } catch {
      setError("Couldn't save step. Please try again.");
    }
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
              Treatment duration
            </Text>
          </View>
          <Notice icon="eye-outline" title="View only">
            You do not have permission to change {session.access.relationship.patientDisplayName}'s medicines.
          </Notice>
        </FormScreen>
      );
    }
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
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
            {isEditing ? 'Edit Duration' : 'Add Medicine'}
          </Text>
        </View>

        {/* Step Progress Bar */}
        <StepProgressBar currentStep={3} totalSteps={4} stepName="Duration & course" />

        {session.isCaregiver && session.access.state === 'ready' && (
          <View style={{ paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm }}>
            <PatientContextBar
              patientName={session.access.relationship.patientDisplayName}
              relationshipLabel={session.access.relationship.relationshipLabel}
            />
          </View>
        )}

        {isEditing && (
          <View style={[styles.stepTabsRow, { backgroundColor: colors.surfaceSecondary, marginHorizontal: Spacing.xl }]}>
            <TouchableOpacity
              style={styles.stepTab}
              onPress={() => handleJumpToStep('/medicine/new/details', 1)}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepTabText, { color: colors.textSecondary }]}>1. Details</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stepTab}
              onPress={() => handleJumpToStep('/medicine/new/schedule', 2)}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepTabText, { color: colors.textSecondary }]}>2. Schedule</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.stepTab, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
              <Text style={[styles.stepTabTextActive, { color: colors.surface }]}>3. Duration</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stepTab}
              onPress={() => handleJumpToStep('/medicine/new/review', 4)}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepTabText, { color: colors.textSecondary }]}>4. Review</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ paddingHorizontal: Spacing.xl }}>
          <View
            style={[
              styles.formCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>How long is the treatment?</Text>
            <View style={styles.radioGroup}>
              {/* Ongoing */}
              <TouchableOpacity
                style={[
                  styles.radioCard,
                  {
                    backgroundColor: courseType === 'ONGOING' ? colors.primaryLight : colors.surfaceSecondary,
                    borderColor: courseType === 'ONGOING' ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setCourseType('ONGOING')}
                accessibilityRole="radio"
                accessibilityState={{ selected: courseType === 'ONGOING' }}
              >
                <View style={styles.radioTop}>
                  <Text style={[styles.radioTitle, { color: courseType === 'ONGOING' ? colors.primaryDark : colors.textPrimary }]}>
                    Ongoing
                  </Text>
                  <View
                    style={[
                      styles.outerCircle,
                      { borderColor: courseType === 'ONGOING' ? colors.primary : colors.border },
                    ]}
                  >
                    {courseType === 'ONGOING' && <View style={[styles.innerCircle, { backgroundColor: colors.primary }]} />}
                  </View>
                </View>
                <Text style={[styles.radioDesc, { color: colors.textSecondary }]}>
                  Taken long term, with no end date.
                </Text>
              </TouchableOpacity>

              {/* Fixed Days */}
              <TouchableOpacity
                style={[
                  styles.radioCard,
                  {
                    backgroundColor: courseType === 'FIXED_DAYS' ? colors.primaryLight : colors.surfaceSecondary,
                    borderColor: courseType === 'FIXED_DAYS' ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setCourseType('FIXED_DAYS')}
                accessibilityRole="radio"
                accessibilityState={{ selected: courseType === 'FIXED_DAYS' }}
              >
                <View style={styles.radioTop}>
                  <Text style={[styles.radioTitle, { color: courseType === 'FIXED_DAYS' ? colors.primaryDark : colors.textPrimary }]}>
                    Set number of days
                  </Text>
                  <View
                    style={[
                      styles.outerCircle,
                      { borderColor: courseType === 'FIXED_DAYS' ? colors.primary : colors.border },
                    ]}
                  >
                    {courseType === 'FIXED_DAYS' && <View style={[styles.innerCircle, { backgroundColor: colors.primary }]} />}
                  </View>
                </View>
                <Text style={[styles.radioDesc, { color: colors.textSecondary }]}>
                  Ends after a number of days, like a 7-day course.
                </Text>
              </TouchableOpacity>

              {/* Fixed Doses */}
              <TouchableOpacity
                style={[
                  styles.radioCard,
                  {
                    backgroundColor: courseType === 'FIXED_DOSES' ? colors.primaryLight : colors.surfaceSecondary,
                    borderColor: courseType === 'FIXED_DOSES' ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setCourseType('FIXED_DOSES')}
                accessibilityRole="radio"
                accessibilityState={{ selected: courseType === 'FIXED_DOSES' }}
              >
                <View style={styles.radioTop}>
                  <Text style={[styles.radioTitle, { color: courseType === 'FIXED_DOSES' ? colors.primaryDark : colors.textPrimary }]}>
                    Set number of doses
                  </Text>
                  <View
                    style={[
                      styles.outerCircle,
                      { borderColor: courseType === 'FIXED_DOSES' ? colors.primary : colors.border },
                    ]}
                  >
                    {courseType === 'FIXED_DOSES' && <View style={[styles.innerCircle, { backgroundColor: colors.primary }]} />}
                  </View>
                </View>
                <Text style={[styles.radioDesc, { color: colors.textSecondary }]}>
                  Ends after a number of doses are marked as taken.
                </Text>
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

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Multi-day course dependency */}
            <View style={styles.switchRow}>
              <View style={styles.switchTextContainer}>
                <Text style={[styles.switchLabel, { color: colors.textPrimary }]}>
                  Start after another medicine completes
                </Text>
                <Text style={[styles.switchDesc, { color: colors.textSecondary }]}>
                  Starts after this course. It stays out of reminders until the other course has finished.
                </Text>
              </View>
              <Switch
                value={hasPrerequisite}
                onValueChange={setHasPrerequisite}
                accessibilityLabel="Start after another medicine completes"
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.surface}
              />
            </View>

            {hasPrerequisite && (
              <View style={styles.prereqBlock}>
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Which medicine comes first?</Text>
                {candidatePrereqs.length === 0 ? (
                  <Text style={[styles.warningText, { color: colors.warning }]}>
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
                          style={[
                            styles.prereqOption,
                            {
                              backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                              borderColor: isSelected ? colors.primary : colors.border,
                            },
                          ]}
                          onPress={() => setPrereqMedId(p.id)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text
                            style={[
                              styles.prereqName,
                              {
                                color: isSelected ? colors.primaryDark : colors.textPrimary,
                                fontWeight: isSelected ? '700' : '600',
                              },
                            ]}
                          >
                            {p.name}
                          </Text>
                          <Text style={[styles.prereqDesc, { color: colors.textSecondary }]}>
                            {p.dosageText} • {COURSE_TEXT[p.courseType] ?? p.courseType}
                          </Text>
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
            <View style={[styles.errorBox, { borderColor: colors.error }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          {/* Action Footer */}
          <View style={styles.footer}>
            {isEditing ? (
              <>
                <TouchableOpacity
                  style={[styles.continueButton, { backgroundColor: colors.primary }]}
                  onPress={handleQuickSave}
                  disabled={isUpdating}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.continueButtonText, { color: colors.surface }]}>
                    {isUpdating ? 'Saving duration…' : 'Save & update duration'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={handleContinue}
                  disabled={isUpdating}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.secondaryActionText, { color: colors.textPrimary }]}>Next: Review →</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={handleBack}
                  disabled={isUpdating}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.secondaryActionText, { color: colors.textSecondary }]}>Back</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.continueButton, { backgroundColor: colors.primary }]}
                  onPress={handleContinue}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.continueButtonText, { color: colors.surface }]}>
                    Continue →
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={handleBack}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.secondaryActionText, { color: colors.textSecondary }]}>Back</Text>
                </TouchableOpacity>
              </>
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
  formCard: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(15),
    marginBottom: Spacing.sm,
  },
  radioGroup: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  radioCard: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.md,
  },
  radioTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  radioTitle: {
    flex: 1,
    marginRight: Spacing.sm,
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(15),
  },
  radioDesc: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13),
  },
  outerCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  divider: {
    height: 1,
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
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14.5),
  },
  switchDesc: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13),
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
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  prereqName: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(15),
  },
  prereqDesc: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13),
    marginTop: 2,
  },
  warningText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13),
    marginBottom: Spacing.sm,
  },
  errorBox: {
    borderWidth: 1.5,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13.5),
  },
  footer: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  continueButton: {
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
  continueButtonText: {
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
    fontSize: scaleFont(15),
  },
});
