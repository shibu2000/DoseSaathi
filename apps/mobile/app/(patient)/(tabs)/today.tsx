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
import { Colors, Radii, Spacing, Typography, scaleFont, FontFamily } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { useApp } from '@/state/AppContext';
import { DoseCard } from '@/components/DoseCard';
import { DoseSaathiHeader } from '@/components/DoseSaathiHeader';
import { NatureLandscapeBanner } from '@/components/NatureLandscapeBanner';
import { DoseSummaryRow } from '@/components/DoseSummaryRow';
import { NextDoseHeroCard } from '@/components/NextDoseHeroCard';
import { QuickActionsRow } from '@/components/QuickActionsRow';
import { FamilyCareBanner } from '@/components/FamilyCareBanner';
import { DoseReportsModal } from '@/components/DoseReportsModal';
import { GlassBackdrop } from '@/components/GlassBackdrop';
import { formatCountdown } from '@/components/UpcomingCountdownCard';
import { MedchainAlarm } from '../../../modules/medchain-alarm/src';

export default function PatientTodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isGlass, isDark } = useTheme();
  const {
    patientName,
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
  const [showReportsModal, setShowReportsModal] = useState(false);

  // Android 14+ full-screen notification check
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

  // Live ticker
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
    } catch {}
    router.push('/medicine/new/details');
  };

  // Dynamic time-based greeting (updates with live clock)
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, [now]);

  // Display Name personalization (only display name if customized, never "Me")
  const greetingFullName = useMemo(() => {
    const cleanName = patientName?.trim();
    if (cleanName && cleanName.toLowerCase() !== 'me') {
      return `${greeting}, ${cleanName} 👋`;
    }
    return `${greeting} 👋`;
  }, [greeting, patientName]);

  // Separate due vs finished occurrences
  const dueOccurrences = useMemo(
    () => todayOccurrences.filter((o) => o.state !== 'TAKEN' && o.state !== 'SKIPPED'),
    [todayOccurrences]
  );

  const finishedOccurrences = useMemo(
    () => todayOccurrences.filter((o) => o.state === 'TAKEN' || o.state === 'SKIPPED'),
    [todayOccurrences]
  );

  // Exact Counts for the 3 Stat Cards
  const takenCount = useMemo(
    () => todayOccurrences.filter((o) => o.state === 'TAKEN').length,
    [todayOccurrences]
  );

  const dueCount = useMemo(() => {
    const nowMs = Date.now();
    return todayOccurrences.filter((o) => {
      if (o.state === 'TAKEN' || o.state === 'SKIPPED') return false;
      const t = new Date(o.snoozedUntil || o.scheduledAtUtc).getTime();
      return t <= nowMs + 15 * 60 * 1000;
    }).length;
  }, [todayOccurrences, now]);

  const upcomingCount = useMemo(() => {
    const nowMs = Date.now();
    return todayOccurrences.filter((o) => {
      if (o.state === 'TAKEN' || o.state === 'SKIPPED') return false;
      const t = new Date(o.snoozedUntil || o.scheduledAtUtc).getTime();
      return t > nowMs + 15 * 60 * 1000;
    }).length;
  }, [todayOccurrences, now]);

  const heroOccurrence = useMemo(() => {
    const nowMs = Date.now();
    const upcomingOrDue = dueOccurrences.filter((o) => {
      const triggerTime = new Date(o.snoozedUntil || o.scheduledAtUtc).getTime();
      return triggerTime >= nowMs - 45 * 60 * 1000;
    });
    return upcomingOrDue[0] || dueOccurrences[0];
  }, [dueOccurrences, now]);

  const laterDueOccurrences = useMemo(
    () => dueOccurrences.filter((o) => o.id !== heroOccurrence?.id),
    [dueOccurrences, heroOccurrence]
  );

  const statusFor = (occ: (typeof todayOccurrences)[number]): { label: string; variant: any } => {
    if (occ.state === 'UNCONFIRMED') return { label: 'Not confirmed yet', variant: 'unconfirmed' };
    const effective = new Date(occ.snoozedUntil || occ.scheduledAtUtc).getTime();
    const isSnoozed = Boolean(occ.snoozedUntil && effective > now);
    const cd = formatCountdown(effective, now, isSnoozed);
    if (cd.isDue) return { label: cd.badgeText, variant: 'due' };
    if (isSnoozed) return { label: cd.badgeText, variant: 'snoozed' };
    return { label: cd.badgeText, variant: 'queued' };
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {isGlass && <GlassBackdrop />}

      {/* Top Brand Header */}
      <View style={{ paddingTop: Math.max(insets.top, 16) }}>
        <DoseSaathiHeader
          onNotificationsPress={() => router.push('/settings')}
          onProfilePress={() => router.push('/settings')}
          hasUnreadNotifications={dueCount > 0}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Personalized Greeting */}
        <View style={styles.greetingSection}>
          <Text style={[styles.greetingTitle, { color: colors.textPrimary }]}>
            {greetingFullName}
          </Text>
          <Text style={[styles.greetingSubtitle, { color: colors.textSecondary }]}>
            Stay consistent with your medicines.
          </Text>
        </View>

        {/* Nature Landscape Banner */}
        <NatureLandscapeBanner height={116} />

        {/* Today's Medicines Summary (3 Cards: Due, Taken, Upcoming) */}
        <DoseSummaryRow
          dueCount={dueCount}
          takenCount={takenCount}
          upcomingCount={upcomingCount}
          onFilterPress={(type) => {
            if (type === 'due' && heroOccurrence) {
              // Focus on next dose
            } else if (type === 'taken') {
              // Show report
              setShowReportsModal(true);
            }
          }}
        />

        {/* System Permission Alerts */}
        {fullScreenAllowed === false && (
          <View
            style={[
              styles.alertCard,
              { backgroundColor: isDark ? 'rgba(217, 154, 54, 0.15)' : '#FFF9EE', borderColor: colors.warning },
            ]}
            accessibilityRole="alert"
          >
            <Ionicons name="warning-outline" size={20} color={colors.warning} style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertTitle, { color: colors.textPrimary }]}>
                Full-screen alarm permission needed
              </Text>
              <Text style={[styles.alertSubtitle, { color: colors.textSecondary }]}>
                Allow alarms over lock screen so medicine reminders never get delayed.
              </Text>
              <TouchableOpacity
                style={[styles.alertButton, { backgroundColor: colors.primary }]}
                onPress={() => MedchainAlarm?.openFullScreenIntentSettings().catch(() => {})}
              >
                <Text style={styles.alertButtonText}>Enable permission</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {error && (
          <View style={[styles.errorCard, { backgroundColor: isDark ? '#2C1B1B' : '#FDF0ED', borderColor: colors.error }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        {transition && (
          <View
            style={[
              styles.alertCard,
              { backgroundColor: isDark ? 'rgba(0, 97, 86, 0.2)' : '#E8F5EE', borderColor: colors.primary },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertTitle, { color: colors.textPrimary }]}>Course complete</Text>
              <Text style={[styles.alertSubtitle, { color: colors.textSecondary }]}>
                {transition.startedNames.length > 0
                  ? `${transition.endedName} has ended. Reminders for ${transition.startedNames.join(', ')} are now active.`
                  : `${transition.endedName} has ended.`}
              </Text>
              <TouchableOpacity
                style={[styles.alertButton, { backgroundColor: colors.primary }]}
                onPress={handleUndoTransition}
              >
                <Text style={styles.alertButtonText}>Undo (5 mins remaining)</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Next Dose Hero Card */}
        {heroOccurrence ? (
          <NextDoseHeroCard
            occurrence={heroOccurrence}
            onTake={() => handleTake(heroOccurrence.medicationId, heroOccurrence.id)}
            onSnooze={() => handleSnooze(heroOccurrence.medicationId, heroOccurrence.id)}
            onSkip={() => handleOpenAlarm(heroOccurrence.id)}
            onDetailsPress={() => router.push(`/medicine/${heroOccurrence.medicationId}`)}
          />
        ) : todayOccurrences.length > 0 ? (
          /* All doses completed banner */
          <View
            style={[
              styles.completedBanner,
              {
                backgroundColor: isDark ? 'rgba(37, 132, 93, 0.16)' : '#EBF7F1',
                borderColor: isDark ? 'rgba(37, 132, 93, 0.3)' : '#D0EFE0',
              },
            ]}
          >
            <View style={[styles.completedIconBadge, { backgroundColor: colors.success }]}>
              <Ionicons name="checkmark" size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, paddingRight: 6 }}>
              <Text style={[styles.completedTitle, { color: colors.textPrimary }]}>
                All medicines taken today!
              </Text>
              <Text style={[styles.completedSubtitle, { color: colors.textSecondary }]}>
                Excellent job staying consistent with your health.
              </Text>
            </View>
          </View>
        ) : (
          /* Empty State when no medicines exist */
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={[styles.emptyIconBadge, { backgroundColor: colors.primaryLight }]}>
              <MaterialCommunityIcons name="pill" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Your schedule starts here.
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Add your first medicine to get timely reminders for you and your family.
            </Text>
            <TouchableOpacity
              style={[styles.emptyAddButton, { backgroundColor: colors.primary }]}
              onPress={handleAddMedicine}
              activeOpacity={0.82}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.emptyAddButtonText}>Add your first medicine</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Actions Row (Add Medicine, My Medicines, Family, Reports) */}
        <QuickActionsRow
          onAddPress={handleAddMedicine}
          onMedicinesPress={() => router.push('/medicines')}
          onFamilyPress={() => router.push('/family/link')}
          onReportsPress={() => setShowReportsModal(true)}
        />

        {/* Family Care Banner */}
        <FamilyCareBanner onPress={() => router.push('/family/link')} />

        {/* Later Today Remaining Doses */}
        {laterDueOccurrences.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
              Later today ({laterDueOccurrences.length})
            </Text>
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

        {/* Done Today Doses */}
        {finishedOccurrences.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
              Completed today ({finishedOccurrences.length})
            </Text>
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

        {/* Offline Safety Assurance Footer */}
        <View
          style={[
            styles.offlineBadge,
            { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : colors.surfaceSecondary, borderColor: colors.border },
          ]}
        >
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
          <Text style={[styles.offlineText, { color: colors.textSecondary }]}>
            Reminders work 100% offline on this phone.
          </Text>
        </View>
      </ScrollView>

      {/* Reports & Adherence Modal */}
      <DoseReportsModal
        visible={showReportsModal}
        onClose={() => setShowReportsModal(false)}
        occurrences={todayOccurrences}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xs,
    paddingBottom: 96,
  },
  greetingSection: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  greetingTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(24),
    lineHeight: scaleFont(30),
    letterSpacing: -0.3,
  },
  greetingSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(14),
    lineHeight: scaleFont(19),
    marginTop: 2,
  },
  sectionContainer: {
    marginVertical: Spacing.sm,
  },
  sectionHeading: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(17),
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  alertCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: Radii.card,
    borderWidth: 1,
    marginVertical: 8,
    alignItems: 'flex-start',
  },
  alertTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(14),
  },
  alertSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(17),
    marginTop: 2,
  },
  alertButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
  },
  alertButtonText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(12),
    color: '#FFFFFF',
  },
  errorCard: {
    padding: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    marginVertical: 6,
  },
  errorText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13),
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: Radii.card,
    borderWidth: 1,
    marginVertical: Spacing.sm,
    gap: 12,
  },
  completedIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(15.5),
    lineHeight: scaleFont(21),
  },
  completedSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13),
    marginTop: 2,
  },
  emptyCard: {
    padding: 24,
    borderRadius: Radii.card,
    borderWidth: 1,
    alignItems: 'center',
    marginVertical: Spacing.sm,
  },
  emptyIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(18),
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13.5),
    lineHeight: scaleFont(19),
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  emptyAddButtonText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(14.5),
    color: '#FFFFFF',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Radii.full,
    borderWidth: 1,
    marginTop: Spacing.lg,
    gap: 6,
  },
  offlineText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(12.5),
  },
});
