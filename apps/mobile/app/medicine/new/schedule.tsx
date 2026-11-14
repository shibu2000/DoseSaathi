import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
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
import type { ScheduleType, RecurrenceType } from '@medchain/contracts';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { TimePickerModal } from '@/components/TimePickerModal';
import { formatTime12h } from '@/utils/schedule-formatter';
import { StepProgressBar } from '@/components/StepProgressBar';

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
  const { getDraft, saveDraft, clearDraft } = session;
  const { medications, createMedicationFromDraft } = useApp();
  const { colors, isDark } = useTheme();

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
  const [timePickerTarget, setTimePickerTarget] = useState<'fixed1' | 'fixed2' | 'interval' | 'fallback' | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const isEditing = Boolean(activeDraft.editingMedicationId);

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

  const validateSchedule = (): boolean => {
    const fail = (msg: string) => {
      setError(msg);
      return false;
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
    return true;
  };

  const handleContinue = async () => {
    if (!validateSchedule()) return;
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

  const handleQuickSave = async () => {
    if (!validateSchedule()) return;
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
    if (!validateSchedule()) return;
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
              Reminder schedule
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
            {isEditing ? 'Edit Schedule' : 'Add Medicine'}
          </Text>
        </View>

        {/* Step Progress Bar */}
        <StepProgressBar currentStep={2} totalSteps={4} stepName="Reminder schedule" />

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
            <TouchableOpacity style={[styles.stepTab, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
              <Text style={[styles.stepTabTextActive, { color: colors.surface }]}>2. Schedule</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stepTab}
              onPress={() => handleJumpToStep('/medicine/new/treatment', 3)}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepTabText, { color: colors.textSecondary }]}>3. Duration</Text>
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
          {/* Main Card */}
          <View
            style={[
              styles.formCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            {/* Schedule Type Selection */}
            <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>How often?</Text>
            <View style={[styles.tabRow, { backgroundColor: colors.surfaceSecondary }]}>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  scheduleType === 'FIXED_TIMES' && [
                    styles.activeTab,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ],
                ]}
                onPress={() => setScheduleType('FIXED_TIMES')}
                accessibilityRole="tab"
                accessibilityState={{ selected: scheduleType === 'FIXED_TIMES' }}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: scheduleType === 'FIXED_TIMES' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  Fixed times
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  scheduleType === 'INTERVAL' && [
                    styles.activeTab,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ],
                ]}
                onPress={() => setScheduleType('INTERVAL')}
                accessibilityRole="tab"
                accessibilityState={{ selected: scheduleType === 'INTERVAL' }}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: scheduleType === 'INTERVAL' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  Interval
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  scheduleType === 'SAME_DAY_DEPENDENT' && [
                    styles.activeTab,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ],
                ]}
                onPress={() => setScheduleType('SAME_DAY_DEPENDENT')}
                accessibilityRole="tab"
                accessibilityState={{ selected: scheduleType === 'SAME_DAY_DEPENDENT' }}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: scheduleType === 'SAME_DAY_DEPENDENT' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  After another
                </Text>
              </TouchableOpacity>
            </View>

            {scheduleType === 'FIXED_TIMES' && (
              <View style={styles.optionsBlock}>
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Recurrence</Text>
                <View style={styles.pillRow}>
                  <TouchableOpacity
                    style={[
                      styles.pill,
                      {
                        backgroundColor: recurrenceType === 'DAILY' ? colors.primaryLight : colors.surface,
                        borderColor: recurrenceType === 'DAILY' ? colors.primary : colors.border,
                      },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: recurrenceType === 'DAILY' }}
                    onPress={() => setRecurrenceType('DAILY')}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        {
                          color: recurrenceType === 'DAILY' ? colors.primaryDark : colors.textPrimary,
                          fontWeight: recurrenceType === 'DAILY' ? '700' : '500',
                        },
                      ]}
                    >
                      Every day
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.pill,
                      {
                        backgroundColor: recurrenceType === 'SPECIFIC_DAYS' ? colors.primaryLight : colors.surface,
                        borderColor: recurrenceType === 'SPECIFIC_DAYS' ? colors.primary : colors.border,
                      },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: recurrenceType === 'SPECIFIC_DAYS' }}
                    onPress={() => setRecurrenceType('SPECIFIC_DAYS')}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        {
                          color: recurrenceType === 'SPECIFIC_DAYS' ? colors.primaryDark : colors.textPrimary,
                          fontWeight: recurrenceType === 'SPECIFIC_DAYS' ? '700' : '500',
                        },
                      ]}
                    >
                      Selected days
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.pill,
                      {
                        backgroundColor: recurrenceType === 'CYCLE' ? colors.primaryLight : colors.surface,
                        borderColor: recurrenceType === 'CYCLE' ? colors.primary : colors.border,
                      },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: recurrenceType === 'CYCLE' }}
                    onPress={() => setRecurrenceType('CYCLE')}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        {
                          color: recurrenceType === 'CYCLE' ? colors.primaryDark : colors.textPrimary,
                          fontWeight: recurrenceType === 'CYCLE' ? '700' : '500',
                        },
                      ]}
                    >
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
                          style={[
                            styles.dayCircle,
                            {
                              backgroundColor: isSel ? colors.primary : colors.surface,
                              borderColor: isSel ? colors.primary : colors.border,
                            },
                          ]}
                          onPress={() => toggleDay(d.num)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isSel }}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              {
                                color: isSel ? colors.surface : colors.textSecondary,
                                fontWeight: isSel ? '700' : '500',
                              },
                            ]}
                          >
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

                {/* First time field */}
                <View style={styles.timeStackBlock}>
                  <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>First dose time (required)</Text>
                  <TouchableOpacity
                    style={[
                      styles.timeSelectTriggerStacked,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => setTimePickerTarget('fixed1')}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Select first time, currently ${formatTime12h(fixedTime1)}`}
                  >
                    <View style={styles.timeSelectInner}>
                      <MaterialIcons name="schedule" size={22} color={colors.primary} />
                      <Text style={[styles.timeSelectValueStacked, { color: colors.textPrimary }]}>
                        {formatTime12h(fixedTime1) || '08:00 AM'}
                      </Text>
                    </View>
                    <View style={styles.timeSelectAction}>
                      <Text style={[styles.timeSelectActionText, { color: colors.primary }]}>Change</Text>
                      <Ionicons name="chevron-down" size={16} color={colors.primary} />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Second time field */}
                <View style={styles.timeStackBlock}>
                  <View style={styles.timeStackHeader}>
                    <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Second dose time (optional)</Text>
                    {fixedTime2 ? (
                      <TouchableOpacity
                        onPress={() => setFixedTime2('')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Remove second dose time"
                      >
                        <Text style={[styles.removeSecondTimeText, { color: colors.textSecondary }]}>Remove (once daily only)</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.timeSelectTriggerStacked,
                      {
                        backgroundColor: fixedTime2 ? colors.surface : colors.surfaceSecondary,
                        borderColor: colors.border,
                        borderStyle: fixedTime2 ? 'solid' : 'dashed',
                      },
                    ]}
                    onPress={() => setTimePickerTarget('fixed2')}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={
                      fixedTime2
                        ? `Select second time, currently ${formatTime12h(fixedTime2)}`
                        : 'Add second dose time'
                    }
                  >
                    <View style={styles.timeSelectInner}>
                      <MaterialIcons
                        name={fixedTime2 ? 'schedule' : 'add-circle-outline'}
                        size={22}
                        color={fixedTime2 ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.timeSelectValueStacked,
                          {
                            color: fixedTime2 ? colors.textPrimary : colors.textSecondary,
                            fontWeight: fixedTime2 ? '700' : '500',
                            fontSize: fixedTime2 ? scaleFont(16) : scaleFont(14.5),
                          },
                        ]}
                      >
                        {fixedTime2 ? formatTime12h(fixedTime2) : 'Tap to add a second dose time'}
                      </Text>
                    </View>
                    <View style={styles.timeSelectAction}>
                      <Text
                        style={[
                          styles.timeSelectActionText,
                          { color: fixedTime2 ? colors.primary : colors.textSecondary },
                        ]}
                      >
                        {fixedTime2 ? 'Change' : '+ Add'}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={16}
                        color={fixedTime2 ? colors.primary : colors.textSecondary}
                      />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {scheduleType === 'INTERVAL' && (
              <View style={styles.optionsBlock}>
                <View style={styles.timeStackBlock}>
                  <FormField
                    label="Hours between doses"
                    placeholder="6"
                    keyboardType="numeric"
                    value={intervalHours}
                    onChangeText={setIntervalHours}
                  />
                </View>
                <View style={styles.timeStackBlock}>
                  <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>First dose time</Text>
                  <TouchableOpacity
                    style={[
                      styles.timeSelectTriggerStacked,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => setTimePickerTarget('interval')}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Select first interval dose time, currently ${formatTime12h(intervalFirstTime)}`}
                  >
                    <View style={styles.timeSelectInner}>
                      <MaterialIcons name="schedule" size={22} color={colors.primary} />
                      <Text style={[styles.timeSelectValueStacked, { color: colors.textPrimary }]}>
                        {formatTime12h(intervalFirstTime) || '08:00 AM'}
                      </Text>
                    </View>
                    <View style={styles.timeSelectAction}>
                      <Text style={[styles.timeSelectActionText, { color: colors.primary }]}>Change</Text>
                      <Ionicons name="chevron-down" size={16} color={colors.primary} />
                    </View>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                  Reminders every {intervalHours || 6} hours, starting at {intervalFirstTime || '08:00'}.
                </Text>
              </View>
            )}

            {scheduleType === 'SAME_DAY_DEPENDENT' && (
              <View style={styles.optionsBlock}>
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Take after which medicine?</Text>
                {candidateParents.length === 0 ? (
                  <Text style={[styles.warningText, { color: colors.warning }]}>
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
                          style={[
                            styles.parentOption,
                            {
                              backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                              borderColor: isSelected ? colors.primary : colors.border,
                            },
                          ]}
                          onPress={() => setParentMedId(p.id)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text
                            style={[
                              styles.parentName,
                              {
                                color: isSelected ? colors.primaryDark : colors.textPrimary,
                                fontWeight: isSelected ? '700' : '600',
                              },
                            ]}
                          >
                            {p.name}
                          </Text>
                          <Text style={[styles.parentDesc, { color: colors.textSecondary }]}>{p.dosageText}</Text>
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

                <Text style={[styles.sectionLabel, { marginTop: Spacing.md, color: colors.textPrimary }]}>
                  If that dose is skipped:
                </Text>
                <View style={styles.pillRow}>
                  <TouchableOpacity
                    style={[
                      styles.pill,
                      {
                        backgroundColor: fallbackPolicy === 'SKIP_CHILD' ? colors.primaryLight : colors.surface,
                        borderColor: fallbackPolicy === 'SKIP_CHILD' ? colors.primary : colors.border,
                      },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: fallbackPolicy === 'SKIP_CHILD' }}
                    onPress={() => setFallbackPolicy('SKIP_CHILD')}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        {
                          color: fallbackPolicy === 'SKIP_CHILD' ? colors.primaryDark : colors.textPrimary,
                          fontWeight: fallbackPolicy === 'SKIP_CHILD' ? '700' : '500',
                        },
                      ]}
                    >
                      Skip this medicine
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.pill,
                      {
                        backgroundColor: fallbackPolicy === 'USE_FALLBACK_TIME' ? colors.primaryLight : colors.surface,
                        borderColor: fallbackPolicy === 'USE_FALLBACK_TIME' ? colors.primary : colors.border,
                      },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: fallbackPolicy === 'USE_FALLBACK_TIME' }}
                    onPress={() => setFallbackPolicy('USE_FALLBACK_TIME')}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        {
                          color: fallbackPolicy === 'USE_FALLBACK_TIME' ? colors.primaryDark : colors.textPrimary,
                          fontWeight: fallbackPolicy === 'USE_FALLBACK_TIME' ? '700' : '500',
                        },
                      ]}
                    >
                      Remind at a set time
                    </Text>
                  </TouchableOpacity>
                </View>

                {fallbackPolicy === 'USE_FALLBACK_TIME' && (
                  <View style={styles.timeStackBlock}>
                    <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Fallback reminder time</Text>
                    <TouchableOpacity
                      style={[
                        styles.timeSelectTriggerStacked,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => setTimePickerTarget('fallback')}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Select fallback reminder time, currently ${formatTime12h(fallbackTime)}`}
                    >
                      <View style={styles.timeSelectInner}>
                        <MaterialIcons name="schedule" size={22} color={colors.primary} />
                        <Text style={[styles.timeSelectValueStacked, { color: colors.textPrimary }]}>
                          {formatTime12h(fallbackTime) || '12:00 PM'}
                        </Text>
                      </View>
                      <View style={styles.timeSelectAction}>
                        <Text style={[styles.timeSelectActionText, { color: colors.primary }]}>Change</Text>
                        <Ionicons name="chevron-down" size={16} color={colors.primary} />
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
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
                    {isUpdating ? 'Saving schedule…' : 'Save & update schedule'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={handleContinue}
                  disabled={isUpdating}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.secondaryActionText, { color: colors.textPrimary }]}>Next: Duration →</Text>
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

      {/* Interactive Time Picker Panel Modal */}
      <TimePickerModal
        visible={timePickerTarget !== null}
        title={
          timePickerTarget === 'fixed1'
            ? 'Select First Dose Time'
            : timePickerTarget === 'fixed2'
            ? 'Select Second Dose Time'
            : timePickerTarget === 'interval'
            ? 'Select First Dose Time'
            : 'Select Fallback Reminder Time'
        }
        initialTime={
          timePickerTarget === 'fixed1'
            ? fixedTime1
            : timePickerTarget === 'fixed2'
            ? fixedTime2 || '20:00'
            : timePickerTarget === 'interval'
            ? intervalFirstTime
            : fallbackTime
        }
        onConfirm={(hhmm) => {
          if (timePickerTarget === 'fixed1') setFixedTime1(hhmm);
          else if (timePickerTarget === 'fixed2') setFixedTime2(hhmm);
          else if (timePickerTarget === 'interval') setIntervalFirstTime(hhmm);
          else if (timePickerTarget === 'fallback') setFallbackTime(hhmm);
          setTimePickerTarget(null);
        }}
        onClose={() => setTimePickerTarget(null)}
        onClear={timePickerTarget === 'fixed2' ? () => setFixedTime2('') : undefined}
        clearLabel="Clear (Once daily only)"
      />
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
  tabRow: {
    flexDirection: 'row',
    borderRadius: Radii.full,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    borderRadius: Radii.full,
  },
  activeTab: {
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  tabText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(13.5),
    textAlign: 'center',
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
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13.5),
  },
  weekdaysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  dayCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(12.5),
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
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  parentName: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(15),
  },
  parentDesc: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13),
    marginTop: 2,
  },
  helperText: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13),
    marginTop: Spacing.xs,
  },
  warningText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13),
    marginBottom: Spacing.md,
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
  fieldLabel: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(14),
    marginBottom: Spacing.xs,
  },
  timeStackBlock: {
    marginBottom: Spacing.md,
  },
  timeStackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  removeSecondTimeText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(12.5),
    textDecorationLine: 'underline',
  },
  timeSelectTriggerStacked: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radii.card,
    paddingHorizontal: Spacing.md,
  },
  timeSelectInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  timeSelectValueStacked: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(16),
  },
  timeSelectAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeSelectActionText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(13),
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
