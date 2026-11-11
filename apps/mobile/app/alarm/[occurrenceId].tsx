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
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
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
      setAlarmState('TAKEN');
      return;
    }
    setHandling(true);
    try {
      const res = await recordDoseTaken(activeMed.id, occurrenceId);
      try {
        Vibration.cancel();
      } catch {}
      setTakenAtTimeStr(formatTime(new Date()));
      await reloadMed(activeMed.id);
      setFollowUpNames(res.activatedMedicationNames ?? []);
      if (res.courseCompleted && res.transitionEventId) {
        setTransitionEventId(res.transitionEventId);
        setUndoActive(true);
        setAlarmState('COURSE_COMPLETED');
      } else {
        setAlarmState('TAKEN');
      }
    } catch (err) {
      // Never show success for something that was not saved
      setActionError('We could not save this dose. Please try again.');
    } finally {
      setHandling(false);
    }
  };

  const handleSnooze = async () => {
    if (handling) return;
    setActionError(null);
    if (isTestPreview) {
      setAlarmState('SNOOZED');
      return;
    }
    setHandling(true);
    try {
      await recordDoseSnooze(activeMed.id, occurrenceId);
      try {
        Vibration.cancel();
      } catch {}
      const fresh = db ? await db.occurrences.getById(occurrenceId) : null;
      if (fresh?.snoozedUntil) setSnoozedUntilStr(formatTime(new Date(fresh.snoozedUntil)));
      setAlarmState('SNOOZED');
    } catch (err) {
      setActionError('We could not set the reminder. Please try again.');
    } finally {
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
      setAlarmState('SKIPPED');
      return;
    }
    setHandling(true);
    try {
      await recordDoseSkip(activeMed.id, occurrenceId, policy);
      try {
        Vibration.cancel();
      } catch {}
      setAlarmState('SKIPPED');
    } catch (err) {
      setActionError('We could not save this change. Please try again.');
    } finally {
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
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <Text style={styles.stateHeadline}>{loaded ? 'This reminder is no longer available' : 'Loading reminder'}</Text>
        {loaded && (
          <>
            <Text style={[styles.stateDetailText, { textAlign: 'center' }]}>
              The medicine may have been changed or its course may have ended.
            </Text>
            <TouchableOpacity style={styles.primaryDoneButton} onPress={() => router.replace('/(patient)/(tabs)/today')}>
              <Text style={styles.primaryDoneText}>Go to Today</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      {/* Subtle ambient warm glow in center */}
      <View style={styles.ambientGlow} pointerEvents="none" />

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
            <View style={styles.brandBadge}>
              <MedChainLogo size={15} color={Colors.brand} />
              <Text style={styles.brandBadgeText}>DoseSaathi</Text>
            </View>

            <Text style={styles.categoryTrackerText}>MEDICATION REMINDER</Text>

            {/* Glowing DUE NOW beacon */}
            <View style={styles.beaconRow}>
              <View style={styles.beaconOuter}>
                <View style={styles.beaconInner} />
              </View>
              <View style={styles.dueNowBadge}>
                <Text style={styles.dueNowText}>DUE NOW</Text>
              </View>
            </View>

            <View style={styles.scheduleRow}>
              <MaterialIcons name="schedule" size={15} color={Colors.inkMuted} />
              <Text style={styles.scheduleText}>Scheduled for {scheduledTimeStr} • {scheduledDayLabel}</Text>
            </View>
          </View>

          {/* Center Medication Hero & Radiating Rings */}
          <View style={styles.centerHeroSection}>
            <View style={styles.pulseContainer}>
              <View style={styles.pulseRingOuter} />
              <View style={styles.pulseRingInner} />
              <View style={styles.pillIconCircle}>
                <MaterialCommunityIcons name="pill" size={36} color={Colors.brand} />
              </View>
            </View>

            <Text style={styles.medNameText}>{activeMed.name}</Text>
            <Text style={styles.medDosageText}>{activeMed.dosageText}</Text>

            {/* Intake Instructions Card with Badges */}
            <View style={styles.instructionsCard}>
              <Text style={styles.instructionBodyText}>
                {activeMed.instructions || `Take ${activeMed.doseQuantity} ${activeMed.doseUnit}.`}
              </Text>

              <View style={styles.badgesWrap}>
                {courseBadge && (
                  <View style={styles.badgeMuted}>
                    <MaterialIcons name="calendar-today" size={13} color={Colors.inkMuted} />
                    <Text style={styles.badgeMutedText}>{courseBadge}</Text>
                  </View>
                )}

                {activeMed.trackStock && (
                  <View style={styles.badgeMuted}>
                    <MaterialIcons name="inventory-2" size={13} color={Colors.inkMuted} />
                    <Text style={styles.badgeMutedText}>Stock: {activeMed.currentStock} left</Text>
                  </View>
                )}

                {(childDeps.length > 0 || isTestPreview) && (
                  <View style={styles.badgePaired}>
                    <MaterialIcons name="link" size={13} color={Colors.warning} />
                    <Text style={styles.badgePairedText}>Paired follow-up</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Action Center (Call-style hierarchy) */}
          <View style={styles.actionCenter}>
            {/* Primary Action: Mark as Taken */}
            <TouchableOpacity
              style={styles.markTakenButton}
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
                  <Text style={styles.takenBtnSubtitle}>Confirms intake & stops alarm</Text>
                </View>
              </View>
              <MaterialIcons name="arrow-forward" size={24} color={Colors.brandSoft} />
            </TouchableOpacity>

            {/* Secondary Action: Snooze 10 minutes */}
            <TouchableOpacity
              style={styles.snoozeButton}
              onPress={handleSnooze}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Snooze 10 minutes"
            >
              <View style={styles.snoozeBtnLeft}>
                <View style={styles.snoozeIconCircle}>
                  <MaterialIcons name="snooze" size={20} color={Colors.inkMuted} />
                </View>
                <View style={styles.btnTextCol}>
                  <Text style={styles.snoozeBtnTitle}>Remind me in 10 minutes</Text>
                  <Text style={styles.snoozeBtnSubtitle}>Rings again at {snoozeTimeStr}</Text>
                </View>
              </View>
              <MaterialIcons name="notifications-paused" size={20} color={Colors.inkMuted} />
            </TouchableOpacity>

            {/* Tertiary Action: Skip Dose */}
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkip}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Skip this dose"
            >
              <MaterialIcons name="cancel" size={18} color={Colors.inkMuted} />
              <Text style={styles.skipButtonText}>Skip this dose</Text>
            </TouchableOpacity>

            {actionError && (
              <Text accessibilityRole="alert" style={{ color: Colors.danger, textAlign: 'center', marginTop: 8 }}>
                {actionError}
              </Text>
            )}

            {/* Reliability Footnote */}
            <View style={styles.reliabilityFootnote}>
              <MaterialIcons name="cloud-off" size={14} color={Colors.inkMuted} />
              <Text style={styles.reliabilityText}>
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
            <View style={styles.stampCircle}>
              <MaterialIcons name="task-alt" size={44} color={Colors.brand} />
            </View>
            <Text style={styles.stateHeadline}>Dose marked as taken</Text>
            <Text style={styles.stateTimestamp}>Recorded at {takenAtTimeStr} • Today</Text>

            {/* Medical Chain Link Status Card */}
            <View style={styles.chainStatusCard}>
              {activeMed.trackStock && (
                <View style={styles.chainStatusRow}>
                  <MaterialIcons name="inventory-2" size={22} color={Colors.brand} />
                  <View style={styles.chainTextCol}>
                    <Text style={styles.chainRowTitle}>Inventory Updated</Text>
                    <Text style={styles.chainRowSub}>
                      {remainingStock} {activeMed.doseUnit} left.
                    </Text>
                  </View>
                </View>
              )}

              {(childDeps.length > 0 || isTestPreview) && (
                <>
                  {activeMed.trackStock && <View style={styles.chainDivider} />}
                  <View style={styles.chainStatusRow}>
                    <MaterialIcons name="hourglass-top" size={22} color={Colors.warning} />
                    <View style={styles.chainTextCol}>
                      <Text style={styles.chainRowTitle}>Follow-up reminder set</Text>
                      <Text style={styles.chainRowSub}>
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
              style={styles.primaryDoneButton}
              onPress={() => closeScreen()}
              activeOpacity={0.88}
            >
              <Text style={styles.primaryDoneText}>Done & Return to Schedule</Text>
            </TouchableOpacity>
            <Text style={styles.stateFootnote}>Audio alarm disarmed successfully</Text>
          </View>
        </View>
      )}

      {/* 3. SNOOZED VIEW */}
      {alarmState === 'SNOOZED' && (
        <View style={styles.stateContainer}>
          <View style={styles.stateTopBlock}>
            <View style={styles.snoozeStateCircle}>
              <MaterialIcons name="notifications-paused" size={44} color={Colors.inkMuted} />
            </View>
            <Text style={styles.stateHeadline}>Alarm Postponed</Text>
            <Text style={styles.stateSubtitleBrand}>Snoozed for 10 minutes</Text>
            <Text style={styles.stateDetailText}>This alarm will ring again at {snoozeTimeStr}.</Text>

            <View style={styles.chainStatusCard}>
              <View style={styles.chainStatusRow}>
                <MaterialIcons name="info" size={22} color={Colors.inkMuted} />
                <View style={styles.chainTextCol}>
                  <Text style={styles.chainRowTitle}>No Changes to Plan</Text>
                  <Text style={styles.chainRowSub}>
                    Dose has not been logged as taken. Follow-up medicine timers remain on hold.
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.stateBottomBlock}>
            <TouchableOpacity
              style={styles.secondaryDoneButton}
              onPress={() => closeScreen()}
              activeOpacity={0.88}
            >
              <Text style={styles.secondaryDoneText}>Close Screen</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 4. SKIPPED VIEW */}
      {alarmState === 'SKIPPED' && (
        <View style={styles.stateContainer}>
          <View style={styles.stateTopBlock}>
            <View style={styles.snoozeStateCircle}>
              <MaterialIcons name="event-busy" size={44} color={Colors.inkMuted} />
            </View>
            <Text style={styles.stateHeadline}>Dose Skipped</Text>
            <Text style={styles.stateSubtitleMuted}>Logged as skipped for today</Text>
            <Text style={styles.stateDetailText}>Inventory untouched. Audio alarm stopped.</Text>

            <View style={styles.chainStatusCard}>
              <View style={styles.chainStatusRow}>
                <MaterialIcons name="check-circle" size={22} color={Colors.inkMuted} />
                <View style={styles.chainTextCol}>
                  <Text style={styles.chainRowTitle}>Schedule Preserved</Text>
                  <Text style={styles.chainRowSub}>
                    Your routine will resume at your next regular dosage window.
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.stateBottomBlock}>
            <TouchableOpacity
              style={styles.secondaryDoneButton}
              onPress={() => closeScreen()}
              activeOpacity={0.88}
            >
              <Text style={styles.secondaryDoneText}>Done & Close Screen</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 5. COURSE COMPLETED VIEW */}
      {alarmState === 'COURSE_COMPLETED' && (
        <View style={styles.stateContainer}>
          <View style={styles.stateTopBlock}>
            <View style={styles.stampCircleBrand}>
              <MaterialIcons name="verified" size={48} color={Colors.brand} />
            </View>
            <Text style={styles.stateHeadline}>Course Completed!</Text>
            <Text style={styles.stateSubtitleBrand}>{activeMed.name}</Text>
            <Text style={styles.stateDetailText}>
              {followUpNames.length > 0
                ? `${activeMed.name} has ended. Reminders for ${followUpNames.join(', ')} are now active.`
                : `${activeMed.name} has ended. No further reminders for it will ring.`}
            </Text>

            <View style={styles.chainStatusCard}>
              <View style={styles.chainStatusRow}>
                <MaterialIcons name="check-circle" size={20} color={Colors.brand} />
                <View style={styles.chainTextCol}>
                  <Text style={styles.chainRowTitle}>Treatment course finished</Text>
                  <Text style={styles.chainRowSub}>
                    You can undo this for the next 5 minutes if it was a mistake.
                  </Text>
                </View>
              </View>
            </View>

            {undoActive && (
              <TouchableOpacity
                style={styles.undoButton}
                onPress={handleUndo}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-undo" size={16} color={Colors.brand} />
                <Text style={styles.undoButtonText}>Undo Course Completion (5m)</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.stateBottomBlock}>
            <TouchableOpacity
              style={styles.primaryDoneButton}
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
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBox}>
                <MaterialIcons name="link-off" size={22} color={Colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>This dose has a follow-up reminder</Text>
                <Text style={styles.modalDesc}>
                  You have a follow-up medicine scheduled after this dose. How would you like to handle it?
                </Text>
              </View>
            </View>

            {/* Option 1: Skip both */}
            <TouchableOpacity
              style={styles.modalChoiceBtn}
              onPress={() => confirmSkipWithPolicy('SKIP_CHILD')}
              activeOpacity={0.85}
            >
              <View>
                <Text style={styles.choiceTitle}>Skip the follow-up dose too</Text>
                <Text style={styles.choiceSub}>Cancels the paired reminder for today</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={Colors.inkMuted} />
            </TouchableOpacity>

            {/* Option 2: only when a fallback time was entered from the prescription */}
            {fallbackDep && (
            <TouchableOpacity
              style={styles.modalChoiceBtn}
              onPress={() => confirmSkipWithPolicy('USE_FALLBACK_TIME')}
              activeOpacity={0.85}
            >
              <View>
                <Text style={styles.choiceTitle}>Ring at prescribed fallback time</Text>
                <Text style={styles.choiceSub}>
                  {fallbackDep ? `Rings at ${fallbackDep.fallbackTime} today` : 'No fallback time was set for this medicine'}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={Colors.inkMuted} />
            </TouchableOpacity>
            )}

            {/* Cancel Modal */}
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowSkipModal(false)}
            >
              <Text style={styles.modalCancelText}>Keep Alarm Active</Text>
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
    backgroundColor: Colors.canvas,
    position: 'relative',
  },
  ambientGlow: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: Colors.brandSoft,
    opacity: 0.45,
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
    backgroundColor: 'rgba(236,239,233,0.85)',
    borderRadius: Radii.full,
    marginBottom: 2,
  },
  brandBadgeText: {
    ...Typography.labelSmall,
    color: Colors.brand,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  categoryTrackerText: {
    ...Typography.labelSmall,
    fontSize: 12,
    letterSpacing: 1.5,
    color: Colors.inkMuted,
    fontWeight: '600',
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
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beaconInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  dueNowBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  dueNowText: {
    ...Typography.labelSmall,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  scheduleText: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    fontSize: 13,
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
    backgroundColor: 'rgba(220, 233, 226, 0.45)',
  },
  pulseRingInner: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(220, 233, 226, 0.85)',
  },
  pillIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  medNameText: {
    ...Typography.display,
    color: Colors.ink,
    textAlign: 'center',
    fontWeight: '700',
  },
  medDosageText: {
    ...Typography.headlineSmall,
    color: Colors.brand,
    marginTop: 2,
    fontWeight: '600',
    fontSize: 16,
  },
  instructionsCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
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
    ...Typography.bodyMedium,
    color: Colors.ink,
    textAlign: 'center',
    lineHeight: 22,
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
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radii.full,
  },
  badgeMutedText: {
    ...Typography.labelSmall,
    fontSize: 11,
    color: Colors.inkMuted,
  },
  badgeBrand: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.brandSoft,
    borderRadius: Radii.full,
  },
  badgeBrandText: {
    ...Typography.labelSmall,
    fontSize: 11,
    color: Colors.brand,
    fontWeight: '600',
  },
  badgePaired: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#FFECCF',
    borderRadius: Radii.full,
  },
  badgePairedText: {
    ...Typography.labelSmall,
    fontSize: 11,
    color: Colors.warning,
    fontWeight: '600',
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
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
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
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTextCol: {
    flex: 1,
    flexShrink: 1,
    justifyContent: 'center',
  },
  takenBtnTitle: {
    ...Typography.headlineSmall,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 17,
  },
  takenBtnSubtitle: {
    ...Typography.bodySmall,
    color: Colors.brandSoft,
    fontSize: 12,
  },
  snoozeButton: {
    minHeight: 56,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderRadius: Radii.card,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    borderColor: Colors.outline,
    borderWidth: 1,
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
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozeBtnTitle: {
    ...Typography.labelMedium,
    color: Colors.ink,
    fontWeight: '600',
    fontSize: 15,
  },
  snoozeBtnSubtitle: {
    ...Typography.labelSmall,
    color: Colors.inkMuted,
    fontSize: 11,
  },
  skipButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  skipButtonText: {
    ...Typography.labelMedium,
    color: Colors.inkMuted,
    fontSize: 14,
  },
  reliabilityFootnote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 2,
  },
  reliabilityText: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    fontSize: 12,
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
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  stampCircleBrand: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  snoozeStateCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  stateHeadline: {
    ...Typography.headlineLarge,
    color: Colors.ink,
    fontWeight: '700',
  },
  stateTimestamp: {
    ...Typography.bodyMedium,
    color: Colors.brand,
    fontWeight: '600',
  },
  stateSubtitleBrand: {
    ...Typography.labelLarge,
    color: Colors.brand,
    fontWeight: '600',
  },
  stateSubtitleMuted: {
    ...Typography.labelLarge,
    color: Colors.inkMuted,
    fontWeight: '600',
  },
  stateDetailText: {
    ...Typography.bodyMedium,
    color: Colors.inkMuted,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    marginTop: 2,
  },
  chainStatusCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
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
    ...Typography.labelMedium,
    color: Colors.ink,
    fontWeight: '700',
  },
  chainRowSub: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    marginTop: 2,
  },
  chainDivider: {
    height: 1,
    backgroundColor: Colors.surfaceMuted,
  },
  stateBottomBlock: {
    gap: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  primaryDoneButton: {
    height: 54,
    backgroundColor: Colors.primary,
    borderRadius: Radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryDoneText: {
    ...Typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  secondaryDoneButton: {
    height: 54,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radii.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryDoneText: {
    ...Typography.labelLarge,
    color: Colors.ink,
    fontWeight: '600',
  },
  stateFootnote: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    textAlign: 'center',
    fontSize: 12,
    marginTop: 2,
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: Colors.brandSoft,
    borderRadius: Radii.full,
    marginTop: Spacing.md,
  },
  undoButtonText: {
    ...Typography.labelSmall,
    color: Colors.brand,
    fontWeight: '700',
  },
  // Modal Sheet Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(32,43,40,0.45)',
    justifyContent: 'flex-end',
    padding: Spacing.sm,
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    padding: Spacing.xl,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
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
    backgroundColor: '#FFECCF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    ...Typography.headlineSmall,
    color: Colors.ink,
    fontSize: 17,
  },
  modalDesc: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    lineHeight: 18,
    marginTop: 2,
  },
  modalChoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radii.md,
  },
  choiceTitle: {
    ...Typography.labelMedium,
    color: Colors.ink,
    fontWeight: '600',
  },
  choiceSub: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    fontSize: 12,
  },
  modalCancelBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    ...Typography.labelMedium,
    color: Colors.ink,
  },
});
