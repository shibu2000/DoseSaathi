import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
import type { ScheduleType, RecurrenceType } from '@medchain/contracts';

/** Accepts "8:00", "08:00", "8.30"; returns "HH:mm" or null. */
function normalizeTime(raw: string): string | null {
  const m = /^\s*(\d{1,2})\s*[:.]\s*(\d{2})\s*$/.exec(raw);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function positiveInt(raw: string): number | null {
  if (!/^\s*\d+\s*$/.test(raw)) return null;
  const n = parseInt(raw, 10);
  return n > 0 ? n : null;
}

const TIME_HINT = 'Use 24-hour time, like 08:00 or 20:30.';

export default function Step2ReminderScheduleScreen() {
  const router = useRouter();
  const session = useWizardSession();
  const { getDraft, saveDraft } = session;
  const { medications } = useApp();

  const [activeDraft, setActiveDraft] = useState<WizardDraft>(DEFAULT_WIZARD_DRAFT);
  const [scheduleType, setScheduleType] = useState<ScheduleType>('FIXED_TIMES');
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('DAILY');
  const [fixedTime1, setFixedTime1] = useState('08:00');
  const [fixedTime2, setFixedTime2] = useState('');
  const [intervalHours, setIntervalHours] = useState('6');
  const [intervalFirstTime, setIntervalFirstTime] = useState('08:00');
  const [cycleDaysOn, setCycleDaysOn] = useState('21');
  const [cycleDaysOff, setCycleDaysOff] = useState('7');
  const [dependentDelay, setDependentDelay] = useState('30');
  const [parentMedId, setParentMedId] = useState<string>('');
  const [fallbackPolicy, setFallbackPolicy] = useState<'SKIP_CHILD' | 'USE_FALLBACK_TIME'>('SKIP_CHILD');
  const [fallbackTime, setFallbackTime] = useState('12:00');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [error, setError] = useState('');

  const weekdays = [
    { num: 1, label: 'Mon' },
    { num: 2, label: 'Tue' },
    { num: 3, label: 'Wed' },
    { num: 4, label: 'Thu' },
    { num: 5, label: 'Fri' },
    { num: 6, label: 'Sat' },
    { num: 7, label: 'Sun' },
  ];

  // Personal mode lists the phone's own active medicines; caregiver mode lists the patient's PLAN (+ not-yet-sent).
  const candidateParents: Array<{ id: string; name: string; dosageText: string }> = session.isCaregiver
    ? session.planCandidates.filter((m) => m.id !== activeDraft.editingMedicationId && m.id !== activeDraft.id)
    : medications.filter(
        (m) => m.lifecycleStatus === 'ACTIVE' && (!activeDraft.editingMedicationId || m.id !== activeDraft.editingMedicationId)
      );

  useEffect(() => {
    async function load() {
      const draft = await getDraft();
      if (draft) {
        setActiveDraft(draft);
        setScheduleType(draft.scheduleType || 'FIXED_TIMES');
        setRecurrenceType(draft.recurrenceType || 'DAILY');
        if (draft.fixedTimes && draft.fixedTimes.length > 0) {
          setFixedTime1(draft.fixedTimes[0]);
          setFixedTime2(draft.fixedTimes[1] || '');
        }
        setIntervalHours(String(draft.intervalHours ?? 6));
        setIntervalFirstTime(draft.intervalFirstTime || '08:00');
        setCycleDaysOn(String(draft.cycleDaysOn ?? 21));
        setCycleDaysOff(String(draft.cycleDaysOff ?? 7));
        setDependentDelay(String(draft.sameDayDelayMinutes ?? 30));
        setParentMedId(draft.sameDayParentMedicationId || (session.isCaregiver ? '' : candidateParents[0]?.id ?? ''));
        setFallbackPolicy(draft.sameDayFallbackPolicy || 'SKIP_CHILD');
        setFallbackTime(draft.sameDayFallbackTime || '12:00');
        if (draft.activeWeekdays && draft.activeWeekdays.length > 0) {
          setSelectedDays(draft.activeWeekdays);
        }
      }
    }
    load();
  }, [getDraft]);

  const toggleDay = (num: number) => {
    setSelectedDays((prev) =>
      prev.includes(num) ? prev.filter((d) => d !== num) : [...prev, num].sort()
    );
  };

  const buildDraft = (): WizardDraft => {
    const fixedTimes: string[] = [];
    const t1 = normalizeTime(fixedTime1) ?? fixedTime1.trim();
    const t2 = normalizeTime(fixedTime2) ?? fixedTime2.trim();
    if (t1) fixedTimes.push(t1);
    if (t2 && t2 !== t1) fixedTimes.push(t2);

    return {
      ...activeDraft,
      scheduleType,
      recurrenceType,
      fixedTimes: fixedTimes.length > 0 ? fixedTimes : ['08:00'],
      activeWeekdays: selectedDays,
      intervalHours: parseInt(intervalHours, 10) || 6,
      intervalFirstTime: normalizeTime(intervalFirstTime) ?? (intervalFirstTime.trim() || '08:00'),
      cycleDaysOn: parseInt(cycleDaysOn, 10) || 21,
      cycleDaysOff: parseInt(cycleDaysOff, 10) || 7,
      sameDayParentMedicationId: scheduleType === 'SAME_DAY_DEPENDENT' ? parentMedId : undefined,
      sameDayDelayMinutes: parseInt(dependentDelay, 10) || 30,
      sameDayFallbackPolicy: fallbackPolicy,
      sameDayFallbackTime: fallbackPolicy === 'USE_FALLBACK_TIME' ? normalizeTime(fallbackTime) ?? fallbackTime.trim() : undefined,
    };
  };

  const handleContinue = async () => {
    const fail = (msg: string) => {
      setError(msg);
    };
    if (scheduleType === 'FIXED_TIMES') {
      if (!fixedTime1.trim()) return fail('Add at least one reminder time, like 08:00.');
      if (!normalizeTime(fixedTime1)) return fail(`The first time is not valid. ${TIME_HINT}`);
      if (fixedTime2.trim() && !normalizeTime(fixedTime2)) return fail(`The second time is not valid. ${TIME_HINT}`);
      if (recurrenceType === 'SPECIFIC_DAYS' && selectedDays.length === 0) return fail('Choose at least one day of the week.');
      if (recurrenceType === 'CYCLE') {
        if (!positiveInt(cycleDaysOn)) return fail('Enter how many days in a row this medicine is taken (1 or more).');
        if (!positiveInt(cycleDaysOff)) return fail('Enter how many days off between cycles (1 or more).');
      }
    }
    if (scheduleType === 'INTERVAL') {
      const n = positiveInt(intervalHours);
      if (!n || n > 24) return fail('Enter hours between doses, from 1 to 24.');
      if (!normalizeTime(intervalFirstTime)) return fail(`The first dose time is not valid. ${TIME_HINT}`);
    }
    if (scheduleType === 'SAME_DAY_DEPENDENT') {
      if (!parentMedId) return fail('Choose which medicine this one follows.');
      if (!positiveInt(dependentDelay)) return fail('Enter the minutes to wait after the other dose (1 or more).');
      if (fallbackPolicy === 'USE_FALLBACK_TIME' && !normalizeTime(fallbackTime)) return fail(`The reminder time is not valid. ${TIME_HINT}`);
    }
    setError('');

    const updated = buildDraft();
    updated.currentStep = 3;
    try {
      await saveDraft(updated);
    } catch {
      setError("Couldn't save this step on the phone. Please try again.");
      return;
    }
    router.push(session.route('/medicine/new/treatment') as any);
  };

  const handleBack = async () => {
    const updated = buildDraft();
    updated.currentStep = 1;
    try {
      await saveDraft(updated);
    } catch {
      // going back must never be blocked
    }
    router.back();
  };

  if (session.isCaregiver) {
    if (session.access.state !== 'ready') return <CheckingScreen title="Reminder schedule" />;
    if (!session.access.canEdit) {
      return (
        <FormScreen>
          <ScreenHeader title="Reminder schedule" showBack={true} />
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
        title="Reminder schedule"
        subtitle="Step 2 of 4: reminder times and repeat"
        showBack={true}
      />

      {session.isCaregiver && session.access.state === 'ready' && (
        <PatientContextBar
          patientName={session.access.relationship.patientDisplayName}
          relationshipLabel={session.access.relationship.relationshipLabel}
        />
      )}

      <View style={styles.formCard}>
        {/* Schedule Type Selection */}
        <Text style={styles.sectionLabel}>How often?</Text>
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabButton, scheduleType === 'FIXED_TIMES' && styles.activeTab]}
            onPress={() => setScheduleType('FIXED_TIMES')}
            accessibilityRole="tab"
            accessibilityState={{ selected: scheduleType === 'FIXED_TIMES' }}
          >
            <Text style={[styles.tabText, scheduleType === 'FIXED_TIMES' && styles.activeTabText]}>
              Fixed times
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, scheduleType === 'INTERVAL' && styles.activeTab]}
            onPress={() => setScheduleType('INTERVAL')}
            accessibilityRole="tab"
            accessibilityState={{ selected: scheduleType === 'INTERVAL' }}
          >
            <Text style={[styles.tabText, scheduleType === 'INTERVAL' && styles.activeTabText]}>
              Interval
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, scheduleType === 'SAME_DAY_DEPENDENT' && styles.activeTab]}
            onPress={() => setScheduleType('SAME_DAY_DEPENDENT')}
            accessibilityRole="tab"
            accessibilityState={{ selected: scheduleType === 'SAME_DAY_DEPENDENT' }}
          >
            <Text style={[styles.tabText, scheduleType === 'SAME_DAY_DEPENDENT' && styles.activeTabText]}>
              After another
            </Text>
          </TouchableOpacity>
        </View>

        {scheduleType === 'FIXED_TIMES' && (
          <View style={styles.optionsBlock}>
            <Text style={styles.sectionLabel}>Recurrence</Text>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, recurrenceType === 'DAILY' && styles.activePill]}
                accessibilityRole="radio"
                accessibilityState={{ selected: recurrenceType === 'DAILY' }}
                onPress={() => setRecurrenceType('DAILY')}
              >
                <Text style={[styles.pillText, recurrenceType === 'DAILY' && styles.activePillText]}>
                  Every day
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, recurrenceType === 'SPECIFIC_DAYS' && styles.activePill]}
                accessibilityRole="radio"
                accessibilityState={{ selected: recurrenceType === 'SPECIFIC_DAYS' }}
                onPress={() => setRecurrenceType('SPECIFIC_DAYS')}
              >
                <Text style={[styles.pillText, recurrenceType === 'SPECIFIC_DAYS' && styles.activePillText]}>
                  Selected days
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, recurrenceType === 'CYCLE' && styles.activePill]}
                accessibilityRole="radio"
                accessibilityState={{ selected: recurrenceType === 'CYCLE' }}
                onPress={() => setRecurrenceType('CYCLE')}
              >
                <Text style={[styles.pillText, recurrenceType === 'CYCLE' && styles.activePillText]}>
                  On/off cycle
                </Text>
              </TouchableOpacity>
            </View>

            {recurrenceType === 'SPECIFIC_DAYS' && (
              <View style={styles.weekdaysRow}>
                {weekdays.map((d) => {
                  const isSel = selectedDays.includes(d.num);
                  return (
                    <TouchableOpacity
                      key={d.num}
                      style={[styles.dayCircle, isSel && styles.activeDayCircle]}
                      onPress={() => toggleDay(d.num)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSel }}
                    >
                      <Text style={[styles.dayText, isSel && styles.activeDayText]}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {recurrenceType === 'CYCLE' && (
              <View style={styles.row}>
                <View style={styles.halfCol}>
                  <FormField
                    label="Days on"
                    keyboardType="numeric"
                    value={cycleDaysOn}
                    onChangeText={setCycleDaysOn}
                  />
                </View>
                <View style={styles.halfCol}>
                  <FormField
                    label="Days off"
                    keyboardType="numeric"
                    value={cycleDaysOff}
                    onChangeText={setCycleDaysOff}
                  />
                </View>
              </View>
            )}

            <View style={styles.row}>
              <View style={styles.halfCol}>
                <FormField
                  label="First time (24-hour)"
                  placeholder="08:00"
                  maxLength={5}
                  helper="For example 08:00"
                  value={fixedTime1}
                  onChangeText={setFixedTime1}
                />
              </View>
              <View style={styles.halfCol}>
                <FormField
                  label="Second time (optional)"
                  placeholder="20:00"
                  maxLength={5}
                  helper="For example 20:00"
                  value={fixedTime2}
                  onChangeText={setFixedTime2}
                />
              </View>
            </View>
          </View>
        )}

        {scheduleType === 'INTERVAL' && (
          <View style={styles.optionsBlock}>
            <View style={styles.row}>
              <View style={styles.halfCol}>
                <FormField
                  label="Hours between doses"
                  placeholder="6"
                  keyboardType="numeric"
                  value={intervalHours}
                  onChangeText={setIntervalHours}
                />
              </View>
              <View style={styles.halfCol}>
                <FormField
                  label="First dose time (24-hour)"
                  placeholder="08:00"
                  maxLength={5}
                  value={intervalFirstTime}
                  onChangeText={setIntervalFirstTime}
                />
              </View>
            </View>
            <Text style={styles.helperText}>
              Reminders every {intervalHours || 6} hours, starting at {intervalFirstTime || '08:00'}.
            </Text>
          </View>
        )}

        {scheduleType === 'SAME_DAY_DEPENDENT' && (
          <View style={styles.optionsBlock}>
            <Text style={styles.sectionLabel}>Take after which medicine?</Text>
            {candidateParents.length === 0 ? (
              <Text style={styles.warningText}>
                {session.isCaregiver && session.planError
                  ? session.planError
                  : session.isCaregiver && session.planLoading
                  ? 'Loading the current medicines…'
                  : session.isCaregiver
                  ? 'No other medicines on the plan yet. Add the first medicine, then link this one to it, or choose Fixed times.'
                  : 'No other active medicines yet. Add that medicine first, or choose Fixed times.'}
              </Text>
            ) : (
              <View style={styles.parentList}>
                {candidateParents.map((p) => {
                  const isSelected = parentMedId === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.parentOption, isSelected && styles.selectedParentOption]}
                      onPress={() => setParentMedId(p.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text style={[styles.parentName, isSelected && styles.selectedParentName]}>
                        {p.name}
                      </Text>
                      <Text style={styles.parentDesc}>{p.dosageText}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <FormField
              label="Minutes after that dose is taken"
              placeholder="30"
              keyboardType="numeric"
              value={dependentDelay}
              onChangeText={setDependentDelay}
              helper="If that dose is snoozed, this reminder waits too."
            />

            <Text style={[styles.sectionLabel, { marginTop: Spacing.md }]}>
              If that dose is skipped:
            </Text>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, fallbackPolicy === 'SKIP_CHILD' && styles.activePill]}
                accessibilityRole="radio"
                accessibilityState={{ selected: fallbackPolicy === 'SKIP_CHILD' }}
                onPress={() => setFallbackPolicy('SKIP_CHILD')}
              >
                <Text style={[styles.pillText, fallbackPolicy === 'SKIP_CHILD' && styles.activePillText]}>
                  Skip this medicine
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, fallbackPolicy === 'USE_FALLBACK_TIME' && styles.activePill]}
                accessibilityRole="radio"
                accessibilityState={{ selected: fallbackPolicy === 'USE_FALLBACK_TIME' }}
                onPress={() => setFallbackPolicy('USE_FALLBACK_TIME')}
              >
                <Text style={[styles.pillText, fallbackPolicy === 'USE_FALLBACK_TIME' && styles.activePillText]}>
                  Remind at a set time
                </Text>
              </TouchableOpacity>
            </View>

            {fallbackPolicy === 'USE_FALLBACK_TIME' && (
              <FormField
                label="Reminder time (24-hour)"
                placeholder="12:00"
                maxLength={5}
                value={fallbackTime}
                onChangeText={setFallbackTime}
              />
            )}
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
          title="Continue to Duration"
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
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radii.full,
    padding: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radii.full,
  },
  activeTab: {
    backgroundColor: Colors.surface,
    elevation: 1,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabText: {
    ...Typography.labelMedium,
    textAlign: 'center',
    color: Colors.inkMuted,
  },
  activeTabText: {
    color: Colors.brand,
    fontWeight: '700',
  },
  optionsBlock: {
    marginTop: Spacing.xs,
  },
  pillRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    flexWrap: 'wrap',
  },
  pill: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surface,
  },
  activePill: {
    backgroundColor: Colors.brandSoft,
    borderColor: Colors.brand,
  },
  pillText: {
    ...Typography.labelSmall,
    color: Colors.ink,
  },
  activePillText: {
    color: Colors.brand,
    fontWeight: '700',
  },
  weekdaysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  dayCircle: {
    minWidth: 56,
    minHeight: 48,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDayCircle: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  dayText: {
    ...Typography.labelSmall,
    color: Colors.inkMuted,
  },
  activeDayText: {
    color: Colors.white,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    columnGap: Spacing.md,
  },
  halfCol: {
    flex: 1,
    flexBasis: 120,
    minWidth: 120,
  },
  parentList: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  parentOption: {
    borderWidth: 1,
    borderColor: Colors.outline,
    borderRadius: Radii.sm,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
  },
  selectedParentOption: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brandSoft,
  },
  parentName: {
    ...Typography.labelMedium,
    color: Colors.ink,
  },
  selectedParentName: {
    color: Colors.brand,
    fontWeight: '700',
  },
  parentDesc: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
  },
  helperText: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    marginTop: Spacing.xs,
  },
  warningText: {
    ...Typography.bodySmall,
    color: Colors.warning,
    marginBottom: Spacing.md,
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
