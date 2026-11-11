import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  AppState,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '@/theme/tokens';
import { useApp } from '@/state/AppContext';
import { DoseCard } from '@/components/DoseCard';
import { UpcomingCountdownCard, formatCountdown } from '@/components/UpcomingCountdownCard';
import { MedchainAlarm } from '../../../modules/medchain-alarm/src';

export default function PatientTodayScreen() {
  const router = useRouter();
  const {
    todayOccurrences,
    refreshTodayOccurrences,
    recordDoseTaken,
    recordDoseSnooze,
    undoCourseCompletion,
    clearDraft,
  } = useApp();

  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  // Android 14+ only lets an alarm take over the screen once the user allows "full-screen notifications"
  const [fullScreenAllowed, setFullScreenAllowed] = useState<boolean | null>(null);
  const checkFullScreen = useCallback(() => {
    try {
      setFullScreenAllowed(MedchainAlarm ? MedchainAlarm.getStatus().canUseFullScreenIntent : null);
    } catch {
      setFullScreenAllowed(null);
    }
  }, []);
  useEffect(() => {
    checkFullScreen();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && checkFullScreen());
    return () => sub.remove();
  }, [checkFullScreen]);
  const [transition, setTransition] = useState<{
    eventId: string;
    courseId: string;
    endedName: string;
    startedNames: string[];
    until: number;
  } | null>(null);

  // Keep "Due now" / "Upcoming" countdown honest with a live ticker
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!transition) return;
    const ms = transition.until - Date.now();
    if (ms <= 0) {
      setTransition(null);
      return;
    }
    const t = setTimeout(() => setTransition(null), ms);
    return () => clearTimeout(t);
  }, [transition]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshTodayOccurrences();
    } catch {
      setError('We could not refresh. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleTake = async (medId: string, occId: string) => {
    setError(null);
    try {
      const res = await recordDoseTaken(medId, occId);
      if (res.courseCompleted && res.transitionEventId) {
        const ended = todayOccurrences.find((o) => o.id === occId)?.medication.name ?? 'This course';
        setTransition({
          eventId: res.transitionEventId,
          courseId: medId,
          endedName: ended,
          startedNames: res.activatedMedicationNames ?? [],
          until: Date.now() + 5 * 60 * 1000,
        });
      }
    } catch (err) {
      setError('We could not save that dose. Please try again.');
    }
  };

  const handleOpenAlarm = (occId: string) => {
    router.push(`/alarm/${occId}`);
  };

  const handleSnooze = async (medId: string, occId: string) => {
    setError(null);
    try {
      await recordDoseSnooze(medId, occId);
    } catch {
      setError('We could not set the reminder. Please try again.');
    }
  };

  const handleUndoTransition = async () => {
    if (!transition) return;
    try {
      const res = await undoCourseCompletion(transition.eventId, transition.courseId);
      if (!res.success) setError(res.reason || 'The undo window has ended.');
    } catch {
      setError('We could not undo that. Please try again.');
    }
    setTransition(null);
  };

  const handleAddMedicine = async () => {
    try {
      await clearDraft();
    } catch {
      // A leftover draft is harmless; continue to the form.
    }
    router.push('/medicine/new/details');
  };

  // Dynamic greeting based on current hour
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Dynamic date badge ("Today, Nov 8")
  const dateBadgeText = useMemo(() => {
    const now = new Date();
    const monthShort = now.toLocaleDateString('en-US', { month: 'short' });
    const dayNumber = now.getDate();
    return `Today, ${monthShort} ${dayNumber}`;
  }, []);

  // Separate due vs finished occurrences
  const dueOccurrences = useMemo(
    () => todayOccurrences.filter((o) => o.state !== 'TAKEN' && o.state !== 'SKIPPED'),
    [todayOccurrences]
  );
  const finishedOccurrences = useMemo(
    () => todayOccurrences.filter((o) => o.state === 'TAKEN' || o.state === 'SKIPPED'),
    [todayOccurrences]
  );

  const hhmm = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const statusFor = (occ: (typeof todayOccurrences)[number]): { label: string; variant: any } => {
    if (occ.state === 'UNCONFIRMED') return { label: 'Not confirmed yet', variant: 'unconfirmed' };
    const effective = new Date(occ.snoozedUntil || occ.scheduledAtUtc).getTime();
    const isSnoozed = Boolean(occ.snoozedUntil && effective > now);
    const cd = formatCountdown(effective, now, isSnoozed);
    if (cd.isDue) {
      return { label: cd.badgeText, variant: 'due' };
    }
    if (isSnoozed) {
      return { label: cd.badgeText, variant: 'snoozed' };
    }
    return { label: cd.badgeText, variant: 'queued' };
  };

  const heroOccurrence = dueOccurrences[0];
  const laterDueOccurrences = dueOccurrences.slice(1);

  return (
    <View style={styles.screen}>
      {/* Main Single Scroll Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Greeting Header */}
        <View style={styles.greetingSection}>
          <View style={styles.greetingTextContainer}>
            <Text style={styles.greetingTitle}>{greeting}</Text>
            <Text style={styles.greetingSubtitle}>Let's stay on track with your medication.</Text>
          </View>
          <TouchableOpacity
            style={styles.greetingAvatarButton}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push('/settings')}
            activeOpacity={0.75}
          >
            <Ionicons name="settings-outline" size={22} color={Colors.ink} />
          </TouchableOpacity>
        </View>

        {/* Today's Schedule Section */}
        <View style={styles.scheduleSection}>
          {/* Section Header Row */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Today's schedule</Text>
            <View style={styles.dateBadge}>
              <MaterialIcons name="calendar-today" size={16} color={Colors.primary} />
              <Text style={styles.dateBadgeText}>{dateBadgeText}</Text>
            </View>
          </View>

          {fullScreenAllowed === false && (
            <View style={styles.emptyCard} accessibilityRole="alert">
              <Text style={styles.emptyCardTitle}>Reminders won't wake your screen</Text>
              <Text style={styles.emptyCardSubtitle}>
                Android needs your permission to show a medicine alarm over the lock screen. Until you allow it,
                reminders only play a sound and show a small notification.
              </Text>
              <Pressable
                style={styles.primaryActionButton}
                onPress={() => MedchainAlarm?.openFullScreenIntentSettings().catch(() => {})}
                accessibilityRole="button"
                accessibilityLabel="Allow full-screen alarms in system settings"
              >
                <Text style={styles.primaryActionButtonText}>Allow full-screen alarms</Text>
              </Pressable>
            </View>
          )}

          {error && (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {error}
            </Text>
          )}

          {transition && (
            <View style={styles.emptyCard} accessibilityRole="summary">
              <Text style={styles.emptyCardTitle}>Course complete</Text>
              <Text style={styles.emptyCardSubtitle}>
                {transition.startedNames.length > 0
                  ? `${transition.endedName} has ended. Reminders for ${transition.startedNames.join(', ')} are now active.`
                  : `${transition.endedName} has ended.`}
              </Text>
              <Pressable
                style={styles.addSecondaryButton}
                onPress={handleUndoTransition}
                accessibilityRole="button"
                accessibilityLabel="Undo course completion"
              >
                <Text style={styles.addSecondaryButtonText}>Undo (available for 5 minutes)</Text>
              </Pressable>
            </View>
          )}

          {/* Empty State vs Scheduled Doses */}
          {todayOccurrences.length === 0 ? (
            /* Tactile Empty State Card */
            <View style={styles.emptyCard}>
              <View style={styles.tactileEmblem}>
                <MaterialIcons name="medication" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.emptyCardTitle}>Your schedule is empty</Text>
              <Text style={styles.emptyCardSubtitle}>
                Add your first medicine to start managing your daily reminders.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryActionButton,
                  pressed && styles.primaryActionButtonPressed,
                ]}
                onPress={handleAddMedicine}
                accessibilityRole="button"
                accessibilityLabel="Add medication"
              >
                <MaterialIcons name="add" size={22} color={Colors.white} />
                <Text style={styles.primaryActionButtonText}>Add medication</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.dosesContainer}>
              {/* Up Next / Upcoming Dose Countdown Widget */}
              {heroOccurrence && (
                <View style={styles.subSection}>
                  <Text style={styles.subSectionTitle}>Up next</Text>
                  <UpcomingCountdownCard
                    occurrence={heroOccurrence}
                    onTake={() => handleTake(heroOccurrence.medicationId, heroOccurrence.id)}
                    onSnooze={() => handleSnooze(heroOccurrence.medicationId, heroOccurrence.id)}
                    onSkip={() => handleOpenAlarm(heroOccurrence.id)}
                  />
                </View>
              )}

              {/* All completed celebratory banner if all today's doses are done */}
              {!heroOccurrence && finishedOccurrences.length > 0 && (
                <View style={styles.completedAllBanner}>
                  <View style={styles.completedAllEmblem}>
                    <MaterialIcons name="task-alt" size={26} color={Colors.success} />
                  </View>
                  <View style={styles.completedAllContent}>
                    <Text style={styles.completedAllTitle}>All doses complete for today!</Text>
                    <Text style={styles.completedAllSubtitle}>
                      Great job staying consistent with your daily medications.
                    </Text>
                  </View>
                </View>
              )}

              {/* Later Today */}
              {laterDueOccurrences.length > 0 && (
                <View style={styles.subSection}>
                  <Text style={styles.subSectionTitle}>Later today</Text>
                  {laterDueOccurrences.map((occ) => (
                    <DoseCard
                      key={occ.id}
                      timeStr={occ.scheduledLocalTime}
                      medicationName={occ.medication.name}
                      dosageText={`${occ.medication.dosageText} • ${occ.medication.doseQuantity} ${occ.medication.doseUnit}`}
                      instructions={occ.medication.instructions}
                      statusLabel={statusFor(occ).label}
                      statusVariant={statusFor(occ).variant}
                      isTaken={false}
                      onTake={() => handleTake(occ.medicationId, occ.id)}
                      onSnooze={() => handleSnooze(occ.medicationId, occ.id)}
                      onSkip={() => handleOpenAlarm(occ.id)}
                    />
                  ))}
                </View>
              )}

              {/* Completed Today */}
              {finishedOccurrences.length > 0 && (
                <View style={styles.subSection}>
                  <Text style={styles.subSectionTitle}>Done today</Text>
                  {finishedOccurrences.map((occ) => {
                    const isTaken = occ.state === 'TAKEN';
                    return (
                      <DoseCard
                        key={occ.id}
                        timeStr={occ.scheduledLocalTime}
                        medicationName={occ.medication.name}
                        dosageText={`${occ.medication.dosageText} • ${occ.medication.doseQuantity} ${occ.medication.doseUnit}`}
                        instructions={occ.medication.instructions}
                        statusLabel={isTaken ? 'Taken' : 'Skipped'}
                        statusVariant={isTaken ? 'taken' : 'skipped'}
                        isTaken={isTaken}
                        onTake={() => {}}
                        onSnooze={() => {}}
                        onSkip={() => {}}
                      />
                    );
                  })}
                </View>
              )}

              {/* Add another medicine CTA */}
              <Pressable
                style={({ pressed }) => [
                  styles.addSecondaryButton,
                  pressed && styles.addSecondaryButtonPressed,
                ]}
                onPress={handleAddMedicine}
                accessibilityRole="button"
                accessibilityLabel="Add another medication"
              >
                <MaterialIcons name="add" size={20} color={Colors.primary} />
                <Text style={styles.addSecondaryButtonText}>Add medication</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Discreet Offline Reassurance Row */}
        <View style={styles.offlineReassuranceRow}>
          <View style={styles.offlineReassuranceIcon}>
            <MaterialIcons name="cloud-off" size={20} color={Colors.primary} />
          </View>
          <View style={styles.offlineReassuranceContent}>
            <Text style={styles.offlineReassuranceTitle}>Works offline</Text>
            <Text style={styles.offlineReassuranceSubtitle}>
              Your reminders are set on this phone and work without internet.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: 96,
  },
  greetingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  greetingTextContainer: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  greetingTitle: {
    ...Typography.headlineMedium,
    color: Colors.ink,
    fontWeight: '700',
  },
  greetingSubtitle: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    marginTop: Spacing.xs,
  },
  greetingAvatarButton: {
    width: 48,
    height: 48,
    borderRadius: Radii.full,
    backgroundColor: Colors.surface,
    shadowColor: '#202B28',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(212, 217, 210, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleSection: {
    marginTop: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  errorText: {
    ...Typography.bodyMedium,
    color: Colors.danger,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    flexShrink: 1,
    ...Typography.headlineSmall,
    color: Colors.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radii.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(212, 217, 210, 0.5)',
  },
  dateBadgeText: {
    ...Typography.labelSmall,
    color: Colors.ink,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
  emptyCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    padding: Spacing.xxl,
    shadowColor: '#202B28',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(212, 217, 210, 0.4)',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  tactileEmblem: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardTitle: {
    ...Typography.headlineSmall,
    color: Colors.ink,
    marginTop: Spacing.lg,
    fontWeight: '700',
  },
  emptyCardSubtitle: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    marginTop: Spacing.xs,
    maxWidth: 260,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryActionButton: {
    width: '100%',
    minHeight: 56,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: Radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xxl,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryActionButtonPressed: {
    backgroundColor: Colors.brandPressed,
  },
  primaryActionButtonText: {
    textAlign: 'center',
    ...Typography.labelLarge,
    color: Colors.white,
    fontSize: 18,
    lineHeight: 24,
  },
  dosesContainer: {
    marginTop: Spacing.xs,
  },
  subSection: {
    marginBottom: Spacing.lg,
  },
  subSectionTitle: {
    ...Typography.labelMedium,
    color: Colors.inkMuted,
    marginBottom: Spacing.xs,
  },
  addSecondaryButton: {
    minHeight: 48,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  addSecondaryButtonPressed: {
    backgroundColor: Colors.brandSoft,
  },
  addSecondaryButtonText: {
    flexShrink: 1,
    textAlign: 'center',
    ...Typography.labelMedium,
    color: Colors.primary,
    fontWeight: '600',
  },
  offlineReassuranceRow: {
    width: '100%',
    marginTop: Spacing.lg,
    backgroundColor: 'rgba(236, 239, 233, 0.7)',
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  offlineReassuranceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineReassuranceContent: {
    flex: 1,
  },
  offlineReassuranceTitle: {
    ...Typography.labelSmall,
    color: Colors.ink,
    fontWeight: '600',
    fontSize: 14,
  },
  offlineReassuranceSubtitle: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  completedAllBanner: {
    width: '100%',
    backgroundColor: '#E6FFFA',
    borderRadius: Radii.card,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(47, 107, 79, 0.2)',
    marginBottom: Spacing.md,
  },
  completedAllEmblem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  completedAllContent: {
    flex: 1,
  },
  completedAllTitle: {
    ...Typography.labelMedium,
    color: Colors.success,
    fontWeight: '700',
    fontSize: 16,
  },
  completedAllSubtitle: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    fontSize: 13,
    marginTop: 2,
  },
});
