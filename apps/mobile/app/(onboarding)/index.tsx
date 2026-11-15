import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  useWindowDimensions,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, Typography, Radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

interface OnboardingSlide {
  id: string;
  renderGraphic: () => React.ReactNode;
  title: string;
  subtitle: string;
}

export default function OnboardingSwiperScreen(props?: { initialIndex?: number }) {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ index?: string }>();
  const parsedIndex = props?.initialIndex ?? (searchParams.index ? parseInt(searchParams.index, 10) : 0);
  const startIdx = isNaN(parsedIndex) ? 0 : Math.min(Math.max(parsedIndex, 0), 2);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(startIdx);
  const flatListRef = useRef<FlatList>(null);
  const { colors } = useTheme();

  const handleNext = () => {
    if (activeIndex < 2) {
      const nextIdx = activeIndex + 1;
      flatListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
      setActiveIndex(nextIdx);
    } else {
      router.replace('/setup/reminders');
    }
  };

  const handleSkip = () => {
    router.replace('/setup/reminders');
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);
    if (index >= 0 && index <= 2) {
      setActiveIndex(index);
    }
  };

  const slides: OnboardingSlide[] = [
    {
      id: 'offline',
      title: 'Your medicines.\nAlways accessible.',
      subtitle:
        'Manage your medications and reminders anytime, even without an internet connection. No account required.',
      renderGraphic: () => (
        <View style={styles.illustrationCard}>
          <View style={[styles.glowBackdrop, { backgroundColor: colors.brandSoft }]} />
          <View style={[styles.deviceMockup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.deviceHeader, { backgroundColor: colors.border }]} />
            <View style={[styles.iconCircle, { backgroundColor: colors.brandSoft }]}>
              <MaterialCommunityIcons name="pill" size={38} color={colors.primary} />
            </View>
            <View style={[styles.offlineBadge, { backgroundColor: colors.surfaceSecondary }]}>
              <MaterialIcons name="cloud-off" size={16} color={colors.primary} />
              <Text style={[styles.offlineBadgeText, { color: colors.primary }]}>Works offline</Text>
            </View>
            <Text style={[styles.deviceSubtext, { color: colors.textSecondary }]}>Saved on this phone</Text>
          </View>
        </View>
      ),
    },
    {
      id: 'reminders',
      title: 'Reminders that adapt to your day.',
      subtitle:
        "When one medicine depends on another, the next reminder starts after you mark the first dose as taken. Even if you're late, your schedule adjusts automatically.",
      renderGraphic: () => (
        <View style={styles.chainingContainer}>
          {/* Card 1: Trigger Medication (Taken) */}
          <View style={[styles.chainCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.chainHeader}>
              <View style={styles.medLeft}>
                <View style={[styles.takenIconCircle, { backgroundColor: colors.brandSoft }]}>
                  <MaterialIcons name="check" size={18} color={colors.success} />
                </View>
                <View>
                  <Text style={[styles.medName, { color: colors.textPrimary }]}>Omeprazole</Text>
                  <Text style={[styles.medDose, { color: colors.textSecondary }]}>20 mg · Capsule</Text>
                </View>
              </View>
              <View style={[styles.takenBadge, { backgroundColor: colors.brandSoft }]}>
                <View style={[styles.takenDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.takenBadgeText, { color: colors.success }]}>Taken</Text>
              </View>
            </View>
            <View style={[styles.chainFooter, { borderTopColor: colors.border }]}>
              <View style={styles.rowAlign}>
                <MaterialIcons name="check-circle" size={15} color={colors.success} />
                <Text style={[styles.takenTimeText, { color: colors.success }]}>Taken at 9:15 AM</Text>
              </View>
              <Text style={[styles.scheduledTimeText, { color: colors.textSecondary }]}>Scheduled 9:00 AM</Text>
            </View>
          </View>

          {/* Connecting Stem with Gap Badge */}
          <View style={styles.stemContainer}>
            <View style={[styles.verticalStem, { backgroundColor: colors.brandSoft }]} />
            <View style={[styles.gapBadge, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <MaterialIcons name="link" size={13} color={colors.primary} />
              <Text style={[styles.gapText, { color: colors.primary }]}>+30 min after Taken</Text>
            </View>
          </View>

          {/* Card 2: Chained Dependent Medication (Upcoming) */}
          <View style={[styles.chainCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.chainHeader}>
              <View style={styles.medLeft}>
                <View style={[styles.upcomingIconCircle, { backgroundColor: colors.surfaceSecondary }]}>
                  <MaterialIcons name="schedule" size={18} color={colors.warning} />
                </View>
                <View>
                  <Text style={[styles.medName, { color: colors.textPrimary }]}>Sucralfate</Text>
                  <Text style={[styles.medDose, { color: colors.textSecondary }]}>1 g · Suspension</Text>
                </View>
              </View>
              <View style={[styles.upcomingBadge, { backgroundColor: colors.surfaceSecondary }]}>
                <View style={[styles.upcomingDot, { backgroundColor: colors.textSecondary }]} />
                <Text style={[styles.upcomingBadgeText, { color: colors.textSecondary }]}>Upcoming</Text>
              </View>
            </View>
            <View style={[styles.chainFooterStacked, { borderTopColor: colors.border }]}>
              <View style={styles.rowBetween}>
                <View style={styles.rowAlign}>
                  <MaterialIcons name="alarm" size={15} color={colors.primary} />
                  <Text style={[styles.alarmTimeText, { color: colors.textPrimary }]}>Reminder: 09:45 AM</Text>
                </View>
                <View style={[styles.autoDelayedBadge, { backgroundColor: colors.brandSoft }]}>
                  <Text style={[styles.autoDelayedText, { color: colors.primary }]}>Auto-delayed</Text>
                </View>
              </View>
              <View style={styles.rowAlignIndent}>
                <MaterialIcons name="autorenew" size={12} color={colors.textSecondary} />
                <Text style={[styles.calcDetailText, { color: colors.textSecondary }]}>Calculated from actual dose time</Text>
              </View>
            </View>
          </View>
        </View>
      ),
    },
    {
      id: 'family-sync',
      title: 'Your treatment. Always in sync.',
      subtitle:
        'Plan complete treatment courses that transition automatically. Stay connected with family and manage their medication schedules remotely.',
      renderGraphic: () => (
        <View style={styles.syncStackContainer}>
          {/* Phase 1 Card */}
          <View style={[styles.syncCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.syncCardHeader}>
              <Text style={[styles.phaseLabel, { color: colors.textSecondary }]}>Phase 1 · Active course</Text>
              <View style={[styles.activeStatusBadge, { backgroundColor: colors.brandSoft }]}>
                <Text style={[styles.activeStatusText, { color: colors.primary }]}>7/7 days</Text>
              </View>
            </View>
            <View style={styles.medRow}>
              <View style={styles.rowAlign}>
                <Ionicons name="sunny-outline" size={16} color={colors.textPrimary} />
                <Text style={[styles.syncMedName, { color: colors.textPrimary }]}>Metformin 500 mg</Text>
              </View>
              <Text style={[styles.syncMedTime, { color: colors.textSecondary }]}>Morning, evening</Text>
            </View>
          </View>

          {/* Connector Pill */}
          <View style={styles.connectorContainer}>
            <View style={[styles.connectorPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="schedule-send" size={13} color={colors.primary} />
              <Text style={[styles.connectorText, { color: colors.textSecondary }]}>Starts after this course</Text>
              <MaterialIcons name="arrow-downward" size={13} color={colors.primary} />
            </View>
          </View>

          {/* Phase 2 Card */}
          <View style={[styles.syncCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.syncCardHeader}>
              <Text style={[styles.phaseLabel, { color: colors.textSecondary }]}>Phase 2 · Follow-up</Text>
              <View style={[styles.queuedBadge, { backgroundColor: colors.surfaceSecondary }]}>
                <View style={[styles.queuedDot, { backgroundColor: colors.textSecondary }]} />
                <Text style={[styles.queuedText, { color: colors.textSecondary }]}>Queued</Text>
              </View>
            </View>
            <View style={styles.queuedList}>
              <View style={[styles.queuedRow, { backgroundColor: colors.surfaceSecondary }]}>
                <View style={styles.rowAlign}>
                  <Ionicons name="sunny-outline" size={14} color={colors.textSecondary} />
                  <Text style={[styles.queuedMedName, { color: colors.textPrimary }]}>Probiotic Complex</Text>
                </View>
                <Text style={[styles.queuedMedDetail, { color: colors.textSecondary }]}>Morning</Text>
              </View>
              <View style={[styles.queuedRow, { backgroundColor: colors.surfaceSecondary }]}>
                <View style={styles.rowAlign}>
                  <MaterialIcons name="link" size={14} color={colors.primary} />
                  <Text style={[styles.queuedMedName, { color: colors.textPrimary }]}>Sucralfate 1 g</Text>
                </View>
                <Text style={[styles.queuedMedDetail, { color: colors.textSecondary }]}>30 min after</Text>
              </View>
              <View style={[styles.queuedRow, { backgroundColor: colors.surfaceSecondary }]}>
                <View style={styles.rowAlign}>
                  <Ionicons name="moon-outline" size={14} color={colors.textSecondary} />
                  <Text style={[styles.queuedMedName, { color: colors.textPrimary }]}>Melatonin 3 mg</Text>
                </View>
                <Text style={[styles.queuedMedDetail, { color: colors.textSecondary }]}>Bedtime</Text>
              </View>
            </View>
          </View>

          {/* Family Sync Feature Card */}
          <View style={[styles.familySyncCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.rowAlign}>
              <View style={styles.avatarStack}>
                <View style={[styles.avatar1, { backgroundColor: colors.brandSoft, borderColor: colors.surface }]}>
                  <Text style={[styles.avatarText, { color: colors.textPrimary }]}>EV</Text>
                </View>
                <View style={[styles.avatar2, { backgroundColor: colors.surfaceSecondary, borderColor: colors.surface }]}>
                  <Text style={[styles.avatarText, { color: colors.textPrimary }]}>AV</Text>
                </View>
              </View>
              <View style={styles.avatarTextCol}>
                <Text style={[styles.familyCardTitle, { color: colors.textPrimary }]}>Care for family remotely</Text>
                <Text style={[styles.familyCardSub, { color: colors.textSecondary }]}>Shared view of doses</Text>
              </View>
            </View>
            <View style={[styles.syncCircle, { backgroundColor: colors.surfaceSecondary }]}>
              <MaterialIcons name="sync" size={18} color={colors.primary} />
            </View>
          </View>
        </View>
      ),
    },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: colors.canvas }]}>
      {/* Fixed Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleSkip}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
        >
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Horizontally Swipable Slide Carousel */}
      <FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={styles.carousel}
        initialScrollIndex={startIdx}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        renderItem={({ item }) => (
          <ScrollView
            style={{ width }}
            contentContainerStyle={styles.slideScrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Slide Visual Graphic */}
            <View style={styles.slideCenter}>{item.renderGraphic()}</View>

            {/* Slide Headline & Copy */}
            <View style={styles.textBlock}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{item.title}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{item.subtitle}</Text>
            </View>
          </ScrollView>
        )}
      />

      {/* Permanently Fixed Bottom Container */}
      <View
        style={[
          styles.fixedFooter,
          {
            paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm,
            backgroundColor: colors.canvas,
            borderTopColor: colors.border,
          },
        ]}
      >
        {/* Progress Indicator Dots */}
        <View style={styles.paginationDots}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: colors.border },
                i === activeIndex && [styles.activePill, { backgroundColor: colors.primary }],
              ]}
            />
          ))}
        </View>

        {/* Primary Advance Button */}
        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: colors.primary }]}
          onPress={handleNext}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={activeIndex === 2 ? 'Get started' : 'Next'}
        >
          <Text style={[styles.nextButtonText, { color: colors.white }]}>
            {activeIndex === 2 ? 'Get started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  carousel: {
    flex: 1,
  },
  topBar: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.xl,
  },
  skipText: {
    ...Typography.labelMedium,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  slideScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  slideCenter: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.sm,
  },
  textBlock: {
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
  },
  title: {
    ...Typography.headlineLarge,
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 22,
  },
  // Slide 1 Illustration styles
  illustrationCard: {
    width: '100%',
    maxWidth: 300,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glowBackdrop: {
    position: 'absolute',
    width: 200,
    height: 160,
    borderRadius: 80,
    opacity: 0.5,
  },
  deviceMockup: {
    width: 180,
    height: 180,
    borderWidth: 1.5,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    padding: Spacing.sm,
  },
  deviceHeader: {
    position: 'absolute',
    top: 10,
    width: 44,
    height: 4,
    borderRadius: 2,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.sm,
    marginBottom: 2,
  },
  offlineBadgeText: {
    ...Typography.labelSmall,
    fontWeight: '600',
  },
  deviceSubtext: {
    ...Typography.bodySmall,
    fontSize: 12,
  },
  // Slide 2 Chaining styles
  chainingContainer: {
    width: '100%',
    maxWidth: 330,
  },
  chainCard: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.sm + 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  chainHeader: {
    flexWrap: 'wrap',
    gap: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  medLeft: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  takenIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medName: {
    ...Typography.headlineSmall,
    fontSize: 15,
  },
  medDose: {
    ...Typography.bodySmall,
    fontSize: 12,
  },
  takenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  takenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  takenBadgeText: {
    ...Typography.labelSmall,
    fontSize: 12,
  },
  upcomingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  upcomingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  upcomingBadgeText: {
    ...Typography.labelSmall,
    fontSize: 12,
  },
  chainFooter: {
    flexWrap: 'wrap',
    gap: 4,
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chainFooterStacked: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    gap: 2,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  rowAlign: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowAlignIndent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 18,
  },
  takenTimeText: {
    ...Typography.labelSmall,
    fontSize: 12,
  },
  scheduledTimeText: {
    ...Typography.bodySmall,
    fontSize: 12,
  },
  alarmTimeText: {
    ...Typography.labelSmall,
    fontSize: 12,
  },
  autoDelayedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
  autoDelayedText: {
    ...Typography.labelSmall,
    fontSize: 12,
  },
  calcDetailText: {
    ...Typography.bodySmall,
    fontSize: 12,
  },
  stemContainer: {
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  verticalStem: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
  },
  gapBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.full,
    zIndex: 1,
  },
  gapText: {
    ...Typography.labelSmall,
    fontSize: 12,
    fontWeight: '600',
  },
  // Slide 3 Sync styles
  syncStackContainer: {
    width: '100%',
    maxWidth: 330,
    gap: 4,
  },
  syncCard: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  syncCardHeader: {
    flexWrap: 'wrap',
    gap: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  phaseLabel: {
    ...Typography.labelSmall,
    fontSize: 12,
    letterSpacing: 1,
  },
  activeStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radii.full,
  },
  activeStatusText: {
    ...Typography.labelSmall,
    fontSize: 12,
    fontWeight: '600',
  },
  medRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  syncMedName: {
    ...Typography.labelLarge,
    fontSize: 14,
  },
  syncMedTime: {
    ...Typography.bodySmall,
    fontSize: 12,
    flexShrink: 0,
  },
  connectorContainer: {
    alignItems: 'center',
    marginVertical: -2,
    zIndex: 2,
  },
  connectorPill: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  connectorText: {
    flexShrink: 1,
    ...Typography.labelSmall,
    fontSize: 12,
  },
  queuedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radii.full,
  },
  queuedDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  queuedText: {
    ...Typography.labelSmall,
    fontSize: 12,
  },
  queuedList: {
    gap: 4,
    marginTop: 2,
  },
  queuedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: Radii.sm,
    gap: 6,
  },
  queuedMedName: {
    ...Typography.bodySmall,
    fontSize: 12,
  },
  queuedMedDetail: {
    ...Typography.bodySmall,
    fontSize: 12,
    flexShrink: 0,
  },
  familySyncCard: {
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar1: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    zIndex: 2,
  },
  avatar2: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
    borderWidth: 1.5,
    zIndex: 1,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700',
  },
  avatarTextCol: {
    flexShrink: 1,
    marginLeft: Spacing.xs,
  },
  familyCardTitle: {
    ...Typography.labelMedium,
    fontSize: 13,
  },
  familyCardSub: {
    ...Typography.bodySmall,
    fontSize: 12,
  },
  syncCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Permanently Fixed Bottom Container Styles
  fixedFooter: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
    borderTopWidth: 1,
  },
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activePill: {
    width: 24,
  },
  nextButton: {
    width: '100%',
    minHeight: 56,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  nextButtonText: {
    ...Typography.labelLarge,
    textAlign: 'center',
  },
});
