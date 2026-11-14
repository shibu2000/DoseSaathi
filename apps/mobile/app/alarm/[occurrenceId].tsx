import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  ScrollView,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, Typography, Radii, FontFamily, scaleFont } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { useApp } from '@/state/AppContext';
import { MaterialIcons, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MedChainLogo } from '@/components/MedChainLogo';
import type { Medication } from '@medchain/contracts';
import type { DependencyRecord } from '@/database/repositories/dependency-repository';
import type { DoseOccurrenceRow } from '@/database';
import { MedchainAlarm } from '../../modules/medchain-alarm/src';

export default function MedicationAlarmScreen() {
  const { occurrenceId, action: launchAction } = useLocalSearchParams<{ occurrenceId: string; action?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const {
    db,
    todayOccurrences,
    medications,
    recordDoseTaken,
    recordDoseSnooze,
    recordDoseSkip,
    undoCourseCompletion,
  } = useApp();

  // The "Send test alarm" button in Settings uses this id; it never touches medicine data.
  const isTestPreview = occurrenceId === 'test_occurrence_preview';

  const [occurrence, setOccurrence] = useState<DoseOccurrenceRow | null>(null);
  const [med, setMed] = useState<Medication | null>(null);
  const [childDeps, setChildDeps] = useState<DependencyRecord[]>([]);
  const [alarmState, setAlarmState] = useState<
    'DUE' | 'TAKEN' | 'SNOOZED' | 'SKIPPED' | 'COURSE_COMPLETED'
  >('DUE');
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [transitionEventId, setTransitionEventId] = useState<string | null>(null);
  const [undoActive, setUndoActive] = useState(false);
  const [takenAtTimeStr, setTakenAtTimeStr] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [followUpNames, setFollowUpNames] = useState<string[]>([]);
  const [snoozedUntilStr, setSnoozedUntilStr] = useState<string | null>(null);
  const [handling, setHandling] = useState(false);

  // Start alarm vibration pattern on mount if due, cancel on unmount or action
  useEffect(() => {
    if (alarmState === 'DUE') {
      try {
        Vibration.vibrate([0, 500, 250, 500], true);
      } catch {}
    }
    return () => {
      try {
        Vibration.cancel();
      } catch {}
    };
  }, [alarmState]);

  // Load real data or prepare preview mock
  useEffect(() => {
    if (isTestPreview) {
      setTakenAtTimeStr(formatTime(new Date()));
      setLoaded(true);
      return;
    }

    async function loadData() {
      // 1. Try todayOccurrences first
      const foundToday = todayOccurrences.find((o) => o.id === occurrenceId);
      if (foundToday) {
        setOccurrence(foundToday);
        setMed(foundToday.medication);
        if (db) {
          const deps = await db.dependencies.getChildren(foundToday.medicationId);
          setChildDeps(deps);
        }
        setLoaded(true);
        return;
      }

      // 2. Query DB directly if not in todayOccurrences
      if (db && occurrenceId) {
        const occ = await db.occurrences.getById(occurrenceId);
        if (occ) {
          setOccurrence(occ);
          const m = await db.medications.getById(occ.medicationId);
          if (m) setMed(m);
          const deps = await db.dependencies.getChildren(occ.medicationId);
          setChildDeps(deps);
        }
      }
      setLoaded(true);
    }
    loadData();
  }, [db, occurrenceId, todayOccurrences, isTestPreview]);

  // Never fabricate a medicine: only a real record (or the dev-only preview) is ever rendered.
  const activeMed: Medication = useMemo(() => {
    if (isTestPreview) {
      const t = new Date().toISOString();
      return {
        id: 'test_med_preview',
        profileId: 'preview',
        name: 'Test alarm',
        dosageText: 'No medicine: this is only a test',
        doseQuantity: 1,
        doseUnit: 'dose',
        lifecycleStatus: 'ACTIVE',
        courseType: 'ONGOING',
        courseStartAt: t,
        dosesTakenCount: 0,
        trackStock: false,
        currentStock: 0,
        lowStockThreshold: 5,
        version: 1,
        createdAt: t,
        updatedAt: t,
      } as Medication;
    }
    return med as Medication;
  }, [isTestPreview, med]);

  const courseBadge = useMemo(() => {
    if (!med) return null;
    if (med.courseType === 'FIXED_DOSES' && med.maxTotalDoses) {
      return `Dose ${Math.min(med.dosesTakenCount + 1, med.maxTotalDoses)} of ${med.maxTotalDoses}`;
    }
    if (med.courseType === 'FIXED_DAYS' && med.maxDurationDays) {
      const start = new Date(med.courseStartAt);
      const day = Math.floor((Date.now() - start.getTime()) / 86400000) + 1;
      return `Day ${Math.min(Math.max(day, 1), med.maxDurationDays)} of ${med.maxDurationDays}`;
    }
    return null;
  }, [med]);

  const scheduledTimeStr = useMemo(() => {
    if (!occurrence?.scheduledLocalTime) return '';
    const [h, m] = occurrence.scheduledLocalTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return formatTime(d);
  }, [occurrence]);

  const scheduledDayLabel = useMemo(() => {
    if (!occurrence) return '';
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return occurrence.scheduledLocalDate === iso ? 'Today' : occurrence.scheduledLocalDate;
  }, [occurrence]);

  const snoozeTimeStr = useMemo(() => {
    if (snoozedUntilStr) return snoozedUntilStr;
    const d = new Date(Date.now() + 10 * 60 * 1000);
    return formatTime(d);
  }, [snoozedUntilStr]);

  const reloadMed = async (medicationId: string) => {
    if (!db) return;
    const fresh = await db.medications.getById(medicationId);
    if (fresh) setMed(fresh);
  };

  const handleTake = async () => {
    if (handling) return;
    setActionError(null);
    if (isTestPreview) {
      setTakenAtTimeStr(formatTime(new Date()));
      closeScreen();
      return;
    }
    setHandling(true);
    try {
      await recordDoseTaken(activeMed.id, occurrenceId);
      try {
        Vibration.cancel();
      } catch {}
      MedchainAlarm?.dismiss(occurrenceId).catch(() => {});
      closeScreen();
    } catch (err) {
      // Never show success for something that was not saved
      setActionError('We could not save this dose. Please try again.');
      setHandling(false);
    }
  };

  const handleSnooze = async () => {
    if (handling) return;
    setActionError(null);
    if (isTestPreview) {
      closeScreen();
      return;
    }
    setHandling(true);
    try {
      await recordDoseSnooze(activeMed.id, occurrenceId);
      try {
        Vibration.cancel();
      } catch {}
      MedchainAlarm?.dismiss(occurrenceId).catch(() => {});
      closeScreen();
    } catch (err) {
      setActionError('We could not set the reminder. Please try again.');
      setHandling(false);
    }
  };

  const fallbackDep = childDeps.find(
    (d) => d.dependencyType === 'SAME_DAY_AFTER_TAKEN' && d.fallbackPolicy === 'USE_FALLBACK_TIME' && !!d.fallbackTime
  );

  const handleSkip = () => {
    const hasSameDayChild =
      childDeps.some((d) => d.dependencyType === 'SAME_DAY_AFTER_TAKEN') || isTestPreview;
    if (hasSameDayChild) {
      setShowSkipModal(true);
    } else {
      confirmSkipWithPolicy('SKIP_CHILD');
    }
  };

  /** Leaves the alarm screen. Over a locked phone it also re-locks the app so no data stays visible. */
  const closeScreen = (fallback: string = '/(patient)/(tabs)/today') => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback as any);
    MedchainAlarm?.endAlarmSession().catch(() => {});
  };

  // Notification action buttons deep-link here with ?action=taken|snooze|skip and run once
  const autoActed = useRef(false);
  useEffect(() => {
    if (autoActed.current || !launchAction || !med || !occurrence || alarmState !== 'DUE') return;
    if (occurrence.state === 'TAKEN' || occurrence.state === 'SKIPPED') return;
    autoActed.current = true;
    if (launchAction === 'taken') handleTake();
    else if (launchAction === 'snooze') handleSnooze();
    else if (launchAction === 'skip') handleSkip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchAction, med, occurrence, alarmState]);

  const confirmSkipWithPolicy = async (policy: 'SKIP_CHILD' | 'USE_FALLBACK_TIME') => {
    if (handling) return;
    setShowSkipModal(false);
    setActionError(null);
    if (isTestPreview) {
      closeScreen();
      return;
    }
    setHandling(true);
    try {
      await recordDoseSkip(activeMed.id, occurrenceId, policy);
      try {
        Vibration.cancel();
      } catch {}
      MedchainAlarm?.dismiss(occurrenceId).catch(() => {});
      closeScreen();
    } catch (err) {
      setActionError('We could not save this change. Please try again.');
      setHandling(false);
    }
  };

  const handleUndo = async () => {
    if (!transitionEventId || handling) return;
    setHandling(true);
    try {
      const res = await undoCourseCompletion(transitionEventId, activeMed.id);
      if (res.success) {
        setUndoActive(false);
        await reloadMed(activeMed.id);
        setAlarmState('DUE');
      } else {
        setUndoActive(false);
        setActionError(res.reason || 'The undo window has ended.');
      }
    } catch (err) {
      setActionError('We could not undo this. Please try again.');
    } finally {
      setHandling(false);
    }
  };

  // Remaining stock display after taken
  const remainingStock = activeMed?.currentStock ?? 0;

  if (!isTestPreview && !med) {
    return (
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.canvas,
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 12,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          },
        ]}
      >
        <Text style={[styles.stateHeadline, { color: colors.textPrimary }]}>
          {loaded ? 'This reminder is no longer available' : 'Loading reminder'}
        </Text>
        {loaded && (
          <>
            <Text style={[styles.stateDetailText, { textAlign: 'center', color: colors.textSecondary }]}>
              The medicine may have been changed or its course may have ended.
            </Text>
            <TouchableOpacity
              style={[styles.primaryDoneButton, { backgroundColor: colors.primary, marginTop: Spacing.lg }]}
              onPress={() => router.replace('/(patient)/(tabs)/today')}
            >
              <Text style={styles.primaryDoneText}>Go to Today</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.canvas,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 12,
        },
      ]}
    >
      {/* Subtle ambient warm glow in center */}
      <View
        style={[
          styles.ambientGlow,
          { backgroundColor: isDark ? 'rgba(30, 142, 128, 0.12)' : colors.primaryLight },
        ]}
        pointerEvents="none"
      />

      {/* 1. MAIN ALARM VIEW: DUE NOW */}
      {alarmState === 'DUE' && (
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Top Brand & Schedule Context */}
          <View style={styles.topSection}>
            <View
              style={[
                styles.brandBadge,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceSecondary,
                  borderColor: colors.border,
                },
              ]}
            >
              <MedChainLogo size={18} />
              <Text style={[styles.brandBadgeText, { color: colors.primary }]}>DoseSaathi</Text>
            </View>

            <Text style={[styles.categoryTrackerText, { color: colors.textSecondary }]}>
              MEDICATION REMINDER
            </Text>

            {/* Glowing DUE NOW beacon */}
            <View style={styles.beaconRow}>
              <View
                style={[
                  styles.beaconOuter,
                  { backgroundColor: isDark ? 'rgba(30, 142, 128, 0.35)' : colors.primaryLight },
                ]}
              >
                <View style={[styles.beaconInner, { backgroundColor: colors.primary }]} />
              </View>
              <View style={[styles.dueNowBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.dueNowText}>DUE NOW</Text>
              </View>
            </View>

            <View style={styles.scheduleRow}>
              <MaterialIcons name="schedule" size={15} color={colors.textSecondary} />
              <Text style={[styles.scheduleText, { color: colors.textSecondary }]}>
                Scheduled for {scheduledTimeStr} • {scheduledDayLabel}
              </Text>
            </View>
          </View>

          {/* Center Medication Hero & Radiating Rings */}
          <View style={styles.centerHeroSection}>
            <View style={styles.pulseContainer}>
              <View
                style={[
                  styles.pulseRingOuter,
                  { backgroundColor: isDark ? 'rgba(30, 142, 128, 0.14)' : colors.primaryLight },
                ]}
              />
              <View
                style={[
                  styles.pulseRingInner,
                  { backgroundColor: isDark ? 'rgba(30, 142, 128, 0.26)' : 'rgba(0, 97, 86, 0.18)' },
                ]}
              />
              <View
                style={[
                  styles.pillIconCircle,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.primary,
                  },
                ]}
              >
                <MaterialCommunityIcons name="pill" size={36} color={colors.primary} />
              </View>
            </View>

            <Text style={[styles.medNameText, { color: colors.textPrimary }]}>{activeMed.name}</Text>
            <Text style={[styles.medDosageText, { color: colors.primary }]}>{activeMed.dosageText}</Text>

            {/* Intake Instructions Card with Badges */}
            <View
              style={[
                styles.instructionsCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.instructionBodyText, { color: colors.textPrimary }]}>
                {activeMed.instructions || `Take ${activeMed.doseQuantity} ${activeMed.doseUnit}.`}
              </Text>

              <View style={styles.badgesWrap}>
                {courseBadge && (
                  <View
                    style={[
                      styles.badgeMuted,
                      {
                        backgroundColor: colors.surfaceSecondary,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <MaterialIcons name="calendar-today" size={13} color={colors.textSecondary} />
                    <Text style={[styles.badgeMutedText, { color: colors.textSecondary }]}>
                      {courseBadge}
                    </Text>
                  </View>
                )}

                {activeMed.trackStock && (
                  <View
                    style={[
                      styles.badgeMuted,
                      {
                        backgroundColor: colors.surfaceSecondary,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <MaterialIcons name="inventory-2" size={13} color={colors.textSecondary} />
                    <Text style={[styles.badgeMutedText, { color: colors.textSecondary }]}>
                      Stock: {activeMed.currentStock} left
                    </Text>
                  </View>
                )}

                {(childDeps.length > 0 || isTestPreview) && (
                  <View
                    style={[
                      styles.badgePaired,
                      {
                        backgroundColor: isDark ? 'rgba(230, 168, 69, 0.16)' : '#FFECCF',
                        borderColor: colors.warning,
                      },
                    ]}
                  >
                    <MaterialIcons name="link" size={13} color={colors.warning} />
                    <Text style={[styles.badgePairedText, { color: colors.warning }]}>
                      Paired follow-up
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Action Center (Call-style hierarchy) */}
          <View style={styles.actionCenter}>
            {/* Primary Action: Mark as Taken */}
            <TouchableOpacity
              style={[
                styles.markTakenButton,
                {
                  backgroundColor: colors.primary,
                  shadowColor: colors.primary,
                },
              ]}
              onPress={handleTake}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Mark as Taken"
            >
              <View style={styles.takenBtnLeft}>
                <View style={styles.takenCheckCircle}>
                  <MaterialIcons name="check-circle" size={26} color="#FFFFFF" />
                </View>
                <View style={styles.btnTextCol}>
                  <Text style={styles.takenBtnTitle}>Mark as taken</Text>
                  <Text
                    style={[
                      styles.takenBtnSubtitle,
                      { color: isDark ? '#E0F2EE' : colors.primaryLight },
                    ]}
                  >
                    Confirms intake & stops alarm
                  </Text>
                </View>
              </View>
              <MaterialIcons name="arrow-forward" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Secondary Action: Snooze 10 minutes */}
            <TouchableOpacity
              style={[
                styles.snoozeButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              onPress={handleSnooze}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Snooze 10 minutes"
            >
              <View style={styles.snoozeBtnLeft}>
                <View
                  style={[
                    styles.snoozeIconCircle,
                    { backgroundColor: colors.surfaceSecondary },
                  ]}
                >
                  <MaterialIcons name="snooze" size={20} color={colors.textSecondary} />
                </View>
                <View style={styles.btnTextCol}>
                  <Text style={[styles.snoozeBtnTitle, { color: colors.textPrimary }]}>
                    Remind me in 10 minutes
                  </Text>
                  <Text style={[styles.snoozeBtnSubtitle, { color: colors.textSecondary }]}>
                    Rings again at {snoozeTimeStr}
                  </Text>
                </View>
              </View>
              <MaterialIcons name="notifications-paused" size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Tertiary Action: Skip Dose */}
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkip}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Skip this dose"
            >
              <MaterialIcons name="cancel" size={18} color={colors.textSecondary} />
              <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>
                Skip this dose
              </Text>
            </TouchableOpacity>

            {actionError && (
              <Text
                accessibilityRole="alert"
                style={{ color: colors.error, textAlign: 'center', marginTop: 8 }}
              >
                {actionError}
              </Text>
            )}

            {/* Reliability Footnote */}
            <View style={styles.reliabilityFootnote}>
              <MaterialIcons name="cloud-off" size={14} color={colors.textSecondary} />
              <Text style={[styles.reliabilityText, { color: colors.textSecondary }]}>
                Works without internet
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* 2. CONFIRMED TAKEN VIEW */}
      {alarmState === 'TAKEN' && (
        <View style={styles.stateContainer}>
          <View style={styles.stateTopBlock}>
            <View
              style={[
                styles.stampCircle,
                { backgroundColor: isDark ? 'rgba(52, 168, 119, 0.20)' : colors.primaryLight },
              ]}
            >
              <MaterialIcons name="task-alt" size={44} color={colors.success} />
            </View>
            <Text style={[styles.stateHeadline, { color: colors.textPrimary }]}>
              Dose marked as taken
            </Text>
            <Text style={[styles.stateTimestamp, { color: colors.success }]}>
              Recorded at {takenAtTimeStr} • Today
            </Text>

            {/* Medical Chain Link Status Card */}
            <View
              style={[
                styles.chainStatusCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              {activeMed.trackStock && (
                <View style={styles.chainStatusRow}>
                  <MaterialIcons name="inventory-2" size={22} color={colors.primary} />
                  <View style={styles.chainTextCol}>
                    <Text style={[styles.chainRowTitle, { color: colors.textPrimary }]}>
                      Inventory Updated
                    </Text>
                    <Text style={[styles.chainRowSub, { color: colors.textSecondary }]}>
                      {remainingStock} {activeMed.doseUnit} left.
                    </Text>
                  </View>
                </View>
              )}

              {(childDeps.length > 0 || isTestPreview) && (
                <>
                  {activeMed.trackStock && (
                    <View style={[styles.chainDivider, { backgroundColor: colors.border }]} />
                  )}
                  <View style={styles.chainStatusRow}>
                    <MaterialIcons name="hourglass-top" size={22} color={colors.warning} />
                    <View style={styles.chainTextCol}>
                      <Text style={[styles.chainRowTitle, { color: colors.textPrimary }]}>
                        Follow-up reminder set
                      </Text>
                      <Text style={[styles.chainRowSub, { color: colors.textSecondary }]}>
                        {childDeps.find((d) => d.dependencyType === 'SAME_DAY_AFTER_TAKEN')
                          ? `Rings ${childDeps.find((d) => d.dependencyType === 'SAME_DAY_AFTER_TAKEN')!.delayMinutes} minutes after you took this dose.`
                          : 'A follow-up reminder has been scheduled.'}
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          </View>

          <View style={styles.stateBottomBlock}>
            <TouchableOpacity
              style={[styles.primaryDoneButton, { backgroundColor: colors.primary }]}
              onPress={() => closeScreen()}
              activeOpacity={0.88}
            >
              <Text style={styles.primaryDoneText}>Done & Return to Schedule</Text>
            </TouchableOpacity>
            <Text style={[styles.stateFootnote, { color: colors.textSecondary }]}>
              Audio alarm disarmed successfully
            </Text>
          </View>
        </View>
      )}

      {/* 3. SNOOZED VIEW */}
      {alarmState === 'SNOOZED' && (
        <View style={styles.stateContainer}>
          <View style={styles.stateTopBlock}>
            <View
              style={[
                styles.snoozeStateCircle,
                { backgroundColor: colors.surfaceSecondary },
              ]}
            >
              <MaterialIcons name="notifications-paused" size={44} color={colors.textSecondary} />
            </View>
            <Text style={[styles.stateHeadline, { color: colors.textPrimary }]}>Alarm Postponed</Text>
            <Text style={[styles.stateSubtitleBrand, { color: colors.primary }]}>
              Snoozed for 10 minutes
            </Text>
            <Text style={[styles.stateDetailText, { color: colors.textSecondary }]}>
              This alarm will ring again at {snoozeTimeStr}.
            </Text>

            <View
              style={[
                styles.chainStatusCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.chainStatusRow}>
                <MaterialIcons name="info" size={22} color={colors.textSecondary} />
                <View style={styles.chainTextCol}>
                  <Text style={[styles.chainRowTitle, { color: colors.textPrimary }]}>
                    No Changes to Plan
                  </Text>
                  <Text style={[styles.chainRowSub, { color: colors.textSecondary }]}>
                    Dose has not been logged as taken. Follow-up medicine timers remain on hold.
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.stateBottomBlock}>
            <TouchableOpacity
              style={[
                styles.secondaryDoneButton,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => closeScreen()}
              activeOpacity={0.88}
            >
              <Text style={[styles.secondaryDoneText, { color: colors.textPrimary }]}>
                Close Screen
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 4. SKIPPED VIEW */}
      {alarmState === 'SKIPPED' && (
        <View style={styles.stateContainer}>
          <View style={styles.stateTopBlock}>
            <View
              style={[
                styles.snoozeStateCircle,
                { backgroundColor: colors.surfaceSecondary },
              ]}
            >
              <MaterialIcons name="event-busy" size={44} color={colors.textSecondary} />
            </View>
            <Text style={[styles.stateHeadline, { color: colors.textPrimary }]}>Dose Skipped</Text>
            <Text style={[styles.stateSubtitleMuted, { color: colors.textSecondary }]}>
              Logged as skipped for today
            </Text>
            <Text style={[styles.stateDetailText, { color: colors.textSecondary }]}>
              Inventory untouched. Audio alarm stopped.
            </Text>

            <View
              style={[
                styles.chainStatusCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.chainStatusRow}>
                <MaterialIcons name="check-circle" size={22} color={colors.success} />
                <View style={styles.chainTextCol}>
                  <Text style={[styles.chainRowTitle, { color: colors.textPrimary }]}>
                    Schedule Preserved
                  </Text>
                  <Text style={[styles.chainRowSub, { color: colors.textSecondary }]}>
                    Your routine will resume at your next regular dosage window.
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.stateBottomBlock}>
            <TouchableOpacity
              style={[
                styles.secondaryDoneButton,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => closeScreen()}
              activeOpacity={0.88}
            >
              <Text style={[styles.secondaryDoneText, { color: colors.textPrimary }]}>
                Done & Close Screen
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 5. COURSE COMPLETED VIEW */}
      {alarmState === 'COURSE_COMPLETED' && (
        <View style={styles.stateContainer}>
          <View style={styles.stateTopBlock}>
            <View
              style={[
                styles.stampCircleBrand,
                { backgroundColor: isDark ? 'rgba(230, 168, 69, 0.20)' : colors.primaryLight },
              ]}
            >
              <MaterialIcons name="verified" size={48} color={colors.warning} />
            </View>
            <Text style={[styles.stateHeadline, { color: colors.textPrimary }]}>
              Course Completed!
            </Text>
            <Text style={[styles.stateSubtitleBrand, { color: colors.primary }]}>
              {activeMed.name}
            </Text>
            <Text style={[styles.stateDetailText, { color: colors.textSecondary }]}>
              {followUpNames.length > 0
                ? `${activeMed.name} has ended. Reminders for ${followUpNames.join(', ')} are now active.`
                : `${activeMed.name} has ended. No further reminders for it will ring.`}
            </Text>

            <View
              style={[
                styles.chainStatusCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.chainStatusRow}>
                <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                <View style={styles.chainTextCol}>
                  <Text style={[styles.chainRowTitle, { color: colors.textPrimary }]}>
                    Treatment course finished
                  </Text>
                  <Text style={[styles.chainRowSub, { color: colors.textSecondary }]}>
                    You can undo this for the next 5 minutes if it was a mistake.
                  </Text>
                </View>
              </View>
            </View>

            {undoActive && (
              <TouchableOpacity
                style={[
                  styles.undoButton,
                  {
                    backgroundColor: isDark ? 'rgba(30, 142, 128, 0.20)' : colors.primaryLight,
                    borderColor: colors.primary,
                  },
                ]}
                onPress={handleUndo}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-undo" size={16} color={colors.primary} />
                <Text style={[styles.undoButtonText, { color: colors.primary }]}>
                  Undo Course Completion (5m)
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.stateBottomBlock}>
            <TouchableOpacity
              style={[styles.primaryDoneButton, { backgroundColor: colors.primary }]}
              onPress={() => closeScreen()}
              activeOpacity={0.88}
            >
              <Text style={styles.primaryDoneText}>Done & View Medications</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* SKIP CASCADE BOTTOM MODAL */}
      <Modal
        visible={showSkipModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSkipModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View
                style={[
                  styles.modalIconBox,
                  { backgroundColor: isDark ? 'rgba(230, 168, 69, 0.20)' : '#FFECCF' },
                ]}
              >
                <MaterialIcons name="link-off" size={22} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  This dose has a follow-up reminder
                </Text>
                <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
                  You have a follow-up medicine scheduled after this dose. How would you like to handle it?
                </Text>
              </View>
            </View>

            {/* Option 1: Skip both */}
            <TouchableOpacity
              style={[
                styles.modalChoiceBtn,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => confirmSkipWithPolicy('SKIP_CHILD')}
              activeOpacity={0.85}
            >
              <View>
                <Text style={[styles.choiceTitle, { color: colors.textPrimary }]}>
                  Skip the follow-up dose too
                </Text>
                <Text style={[styles.choiceSub, { color: colors.textSecondary }]}>
                  Cancels the paired reminder for today
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Option 2: only when a fallback time was entered from the prescription */}
            {fallbackDep && (
              <TouchableOpacity
                style={[
                  styles.modalChoiceBtn,
                  {
                    backgroundColor: colors.surfaceSecondary,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => confirmSkipWithPolicy('USE_FALLBACK_TIME')}
                activeOpacity={0.85}
              >
                <View>
                  <Text style={[styles.choiceTitle, { color: colors.textPrimary }]}>
                    Ring at prescribed fallback time
                  </Text>
                  <Text style={[styles.choiceSub, { color: colors.textSecondary }]}>
                    {fallbackDep
                      ? `Rings at ${fallbackDep.fallbackTime} today`
                      : 'No fallback time was set for this medicine'}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            )}

            {/* Cancel Modal */}
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowSkipModal(false)}
            >
              <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>
                Keep Alarm Active
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatTime(date: Date) {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: 'relative',
  },
  ambientGlow: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.5,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    justifyContent: 'space-between',
    flexGrow: 1,
  },
  topSection: {
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radii.full,
    borderWidth: 1,
    marginBottom: 2,
  },
  brandBadgeText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(12),
    letterSpacing: 0.5,
  },
  categoryTrackerText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(11.5),
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  beaconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  beaconOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beaconInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dueNowBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radii.full,
  },
  dueNowText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(11.5),
    letterSpacing: 0.5,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  scheduleText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13),
  },
  centerHeroSection: {
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  pulseContainer: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: Spacing.sm,
  },
  pulseRingOuter: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  pulseRingInner: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  pillIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  medNameText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(26),
    lineHeight: scaleFont(32),
    textAlign: 'center',
  },
  medDosageText: {
    fontFamily: FontFamily.semiBold,
    marginTop: 3,
    fontSize: scaleFont(16),
  },
  instructionsCard: {
    width: '100%',
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  instructionBodyText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(14.5),
    textAlign: 'center',
    lineHeight: scaleFont(21),
  },
  badgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  badgeMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
  badgeMutedText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(11),
  },
  badgePaired: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
  badgePairedText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(11),
  },
  actionCenter: {
    width: '100%',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  markTakenButton: {
    minHeight: 68,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderRadius: Radii.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  takenBtnLeft: {
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  takenCheckCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTextCol: {
    flex: 1,
    flexShrink: 1,
    justifyContent: 'center',
  },
  takenBtnTitle: {
    color: '#FFFFFF',
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(17),
  },
  takenBtnSubtitle: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(12),
  },
  snoozeButton: {
    minHeight: 56,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderRadius: Radii.card,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  snoozeBtnLeft: {
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  snoozeIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozeBtnTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(15),
  },
  snoozeBtnSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(11.5),
  },
  skipButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  skipButtonText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(14),
  },
  reliabilityFootnote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 2,
  },
  reliabilityText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(12),
  },
  // Confirmed Views Styles
  stateContainer: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'space-between',
  },
  stateTopBlock: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    gap: Spacing.xs,
  },
  stampCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  stampCircleBrand: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  snoozeStateCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  stateHeadline: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(22),
    textAlign: 'center',
  },
  stateTimestamp: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(15),
  },
  stateSubtitleBrand: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(15),
  },
  stateSubtitleMuted: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(15),
  },
  stateDetailText: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(14),
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    marginTop: 2,
  },
  chainStatusCard: {
    width: '100%',
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  chainStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  chainTextCol: {
    flex: 1,
  },
  chainRowTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(14),
  },
  chainRowSub: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(12.5),
    marginTop: 2,
  },
  chainDivider: {
    height: 1,
  },
  stateBottomBlock: {
    gap: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  primaryDoneButton: {
    height: 54,
    borderRadius: Radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryDoneText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(16),
  },
  secondaryDoneButton: {
    height: 54,
    borderRadius: Radii.card,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryDoneText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(16),
  },
  stateFootnote: {
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    fontSize: scaleFont(12),
    marginTop: 2,
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radii.full,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  undoButtonText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(12),
  },
  // Modal Sheet Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
    padding: Spacing.sm,
  },
  modalSheet: {
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: Spacing.xl,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  modalIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(16.5),
  },
  modalDesc: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(12.5),
    lineHeight: 18,
    marginTop: 2,
  },
  modalChoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  choiceTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14),
  },
  choiceSub: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(12),
    marginTop: 2,
  },
  modalCancelBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(14),
  },
});
