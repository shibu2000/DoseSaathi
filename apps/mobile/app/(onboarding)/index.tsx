import React, { useState, useRef, useCallback } from 'react';
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
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
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
          <View style={styles.glowBackdrop} />
          <View style={styles.deviceMockup}>
            <View style={styles.deviceHeader} />
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="pill" size={38} color={Colors.brand} />
            </View>
            <View style={styles.offlineBadge}>
              <MaterialIcons name="cloud-off" size={16} color={Colors.brand} />
              <Text style={styles.offlineBadgeText}>Works offline</Text>
            </View>
            <Text style={styles.deviceSubtext}>Saved on this phone</Text>
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
          <View style={styles.chainCard}>
            <View style={styles.chainHeader}>
              <View style={styles.medLeft}>
                <View style={styles.takenIconCircle}>
                  <MaterialIcons name="check" size={18} color={Colors.success} />
                </View>
                <View>
                  <Text style={styles.medName}>Omeprazole</Text>
                  <Text style={styles.medDose}>20 mg · Capsule</Text>
                </View>
              </View>
              <View style={styles.takenBadge}>
                <View style={styles.takenDot} />
                <Text style={styles.takenBadgeText}>Taken</Text>
              </View>
            </View>
            <View style={styles.chainFooter}>
              <View style={styles.rowAlign}>
                <MaterialIcons name="check-circle" size={15} color={Colors.success} />
                <Text style={styles.takenTimeText}>Taken at 9:15 AM</Text>
              </View>
              <Text style={styles.scheduledTimeText}>Scheduled 9:00 AM</Text>
            </View>
          </View>

          {/* Connecting Stem with Gap Badge */}
          <View style={styles.stemContainer}>
            <View style={styles.verticalStem} />
            <View style={styles.gapBadge}>
              <MaterialIcons name="link" size={13} color={Colors.brand} />
              <Text style={styles.gapText}>+30 min after Taken</Text>
            </View>
          </View>

          {/* Card 2: Chained Dependent Medication (Upcoming) */}
          <View style={styles.chainCard}>
            <View style={styles.chainHeader}>
              <View style={styles.medLeft}>
                <View style={styles.upcomingIconCircle}>
                  <MaterialIcons name="schedule" size={18} color={Colors.warning} />
                </View>
                <View>
                  <Text style={styles.medName}>Sucralfate</Text>
                  <Text style={styles.medDose}>1 g · Suspension</Text>
                </View>
              </View>
              <View style={styles.upcomingBadge}>
                <View style={styles.upcomingDot} />
                <Text style={styles.upcomingBadgeText}>Upcoming</Text>
              </View>
            </View>
            <View style={styles.chainFooterStacked}>
              <View style={styles.rowBetween}>
                <View style={styles.rowAlign}>
                  <MaterialIcons name="alarm" size={15} color={Colors.brand} />
                  <Text style={styles.alarmTimeText}>Reminder: 09:45 AM</Text>
                </View>
                <View style={styles.autoDelayedBadge}>
                  <Text style={styles.autoDelayedText}>Auto-delayed</Text>
                </View>
              </View>
              <View style={styles.rowAlignIndent}>
                <MaterialIcons name="autorenew" size={12} color={Colors.inkMuted} />
                <Text style={styles.calcDetailText}>Calculated from actual dose time</Text>
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
          <View style={styles.syncCard}>
            <View style={styles.syncCardHeader}>
              <Text style={styles.phaseLabel}>Phase 1 · Active course</Text>
              <View style={styles.activeStatusBadge}>
                <Text style={styles.activeStatusText}>7/7 days</Text>
              </View>
            </View>
            <View style={styles.medRow}>
              <View style={styles.rowAlign}>
                <Ionicons name="sunny-outline" size={16} color={Colors.ink} />
                <Text style={styles.syncMedName}>Metformin 500 mg</Text>
              </View>
              <Text style={styles.syncMedTime}>Morning, evening</Text>
            </View>
          </View>

          {/* Connector Pill */}
          <View style={styles.connectorContainer}>
            <View style={styles.connectorPill}>
              <MaterialIcons name="schedule-send" size={13} color={Colors.brand} />
              <Text style={styles.connectorText}>Starts after this course</Text>
              <MaterialIcons name="arrow-downward" size={13} color={Colors.brand} />
            </View>
          </View>

          {/* Phase 2 Card */}
          <View style={styles.syncCard}>
            <View style={styles.syncCardHeader}>
              <Text style={styles.phaseLabel}>Phase 2 · Follow-up</Text>
              <View style={styles.queuedBadge}>
                <View style={styles.queuedDot} />
                <Text style={styles.queuedText}>Queued</Text>
              </View>
            </View>
            <View style={styles.queuedList}>
              <View style={styles.queuedRow}>
                <View style={styles.rowAlign}>
                  <Ionicons name="sunny-outline" size={14} color={Colors.inkMuted} />
                  <Text style={styles.queuedMedName}>Probiotic Complex</Text>
                </View>
                <Text style={styles.queuedMedDetail}>Morning</Text>
              </View>
              <View style={styles.queuedRow}>
                <View style={styles.rowAlign}>
                  <MaterialIcons name="link" size={14} color={Colors.brand} />
                  <Text style={styles.queuedMedName}>Sucralfate 1 g</Text>
                </View>
                <Text style={styles.queuedMedDetail}>30 min after</Text>
              </View>
              <View style={styles.queuedRow}>
                <View style={styles.rowAlign}>
                  <Ionicons name="moon-outline" size={14} color={Colors.inkMuted} />
                  <Text style={styles.queuedMedName}>Melatonin 3 mg</Text>
                </View>
                <Text style={styles.queuedMedDetail}>Bedtime</Text>
              </View>
            </View>
          </View>

          {/* Family Sync Feature Card */}
          <View style={styles.familySyncCard}>
            <View style={styles.rowAlign}>
              <View style={styles.avatarStack}>
                <View style={styles.avatar1}>
                  <Text style={styles.avatarText}>EV</Text>
                </View>
                <View style={styles.avatar2}>
                  <Text style={styles.avatarText}>AV</Text>
                </View>
              </View>
              <View style={styles.avatarTextCol}>
                <Text style={styles.familyCardTitle}>Care for family remotely</Text>
                <Text style={styles.familyCardSub}>Shared view of doses</Text>
              </View>
            </View>
            <View style={styles.syncCircle}>
              <MaterialIcons name="sync" size={18} color={Colors.brand} />
            </View>
          </View>
        </View>
      ),
    },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: Colors.canvas }]}>
      {/* Fixed Top Bar (Always at top) */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleSkip}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
        >
          <Text style={styles.skipText}>Skip</Text>
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
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
          </ScrollView>
        )}
      />

      {/* Permanently Fixed Bottom Container (Never moves or shifts dynamically) */}
      <View
        style={[
          styles.fixedFooter,
          {
            paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm,
          },
        ]}
      >
        {/* Tactile Progress Indicator Dots */}
        <View style={styles.paginationDots}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex && styles.activePill,
              ]}
            />
          ))}
        </View>

        {/* Primary Advance Button */}
        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNext}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={activeIndex === 2 ? 'Get started' : 'Next'}
        >
          <Text style={styles.nextButtonText}>
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
    color: Colors.inkMuted,
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
    color: Colors.ink,
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.bodyMedium,
    color: Colors.inkMuted,
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
    backgroundColor: Colors.brandSoft,
    opacity: 0.5,
  },
  deviceMockup: {
    width: 180,
    height: 180,
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
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
    backgroundColor: Colors.outline,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.sm,
    marginBottom: 2,
  },
  offlineBadgeText: {
    ...Typography.labelSmall,
    color: Colors.brand,
    fontWeight: '600',
  },
  deviceSubtext: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    fontSize: 12,
  },
  // Slide 2 Chaining styles
  chainingContainer: {
    width: '100%',
    maxWidth: 330,
  },
  chainCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
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
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medName: {
    ...Typography.headlineSmall,
    fontSize: 15,
    color: Colors.ink,
  },
  medDose: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    fontSize: 12,
  },
  takenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brandSoft,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  takenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  takenBadgeText: {
    ...Typography.labelSmall,
    color: Colors.success,
    fontSize: 12,
  },
  upcomingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  upcomingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.inkMuted,
  },
  upcomingBadgeText: {
    ...Typography.labelSmall,
    color: Colors.inkMuted,
    fontSize: 12,
  },
  chainFooter: {
    flexWrap: 'wrap',
    gap: 4,
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopColor: Colors.surfaceMuted,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chainFooterStacked: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopColor: Colors.surfaceMuted,
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
    color: Colors.success,
    fontSize: 12,
  },
  scheduledTimeText: {
    ...Typography.bodySmall,
    fontSize: 12,
    color: Colors.inkMuted,
  },
  alarmTimeText: {
    ...Typography.labelSmall,
    color: Colors.ink,
    fontSize: 12,
  },
  autoDelayedBadge: {
    backgroundColor: Colors.brandSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
  autoDelayedText: {
    ...Typography.labelSmall,
    fontSize: 12,
    color: Colors.brand,
  },
  calcDetailText: {
    ...Typography.bodySmall,
    fontSize: 12,
    color: Colors.inkMuted,
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
    backgroundColor: Colors.brandSoft,
  },
  gapBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceMuted,
    borderColor: Colors.outline,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.full,
    zIndex: 1,
  },
  gapText: {
    ...Typography.labelSmall,
    fontSize: 12,
    color: Colors.brand,
    fontWeight: '600',
  },
  // Slide 3 Sync styles
  syncStackContainer: {
    width: '100%',
    maxWidth: 330,
    gap: 4,
  },
  syncCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
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
    color: Colors.inkMuted,
  },
  activeStatusBadge: {
    backgroundColor: Colors.brandSoft,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radii.full,
  },
  activeStatusText: {
    ...Typography.labelSmall,
    color: Colors.brand,
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
    color: Colors.ink,
  },
  syncMedTime: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
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
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
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
    color: Colors.inkMuted,
  },
  queuedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radii.full,
  },
  queuedDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.inkMuted,
  },
  queuedText: {
    ...Typography.labelSmall,
    fontSize: 12,
    color: Colors.inkMuted,
  },
  queuedList: {
    gap: 4,
    marginTop: 2,
  },
  queuedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: Radii.sm,
    gap: 6,
  },
  queuedMedName: {
    ...Typography.bodySmall,
    color: Colors.ink,
    fontSize: 12,
  },
  queuedMedDetail: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    fontSize: 12,
    flexShrink: 0,
  },
  familySyncCard: {
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
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
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.surface,
    zIndex: 2,
  },
  avatar2: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
    borderWidth: 1.5,
    borderColor: Colors.surface,
    zIndex: 1,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink,
  },
  avatarTextCol: {
    flexShrink: 1,
    marginLeft: Spacing.xs,
  },
  familyCardTitle: {
    ...Typography.labelMedium,
    fontSize: 13,
    color: Colors.ink,
  },
  familyCardSub: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    fontSize: 12,
  },
  syncCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Permanently Fixed Bottom Container Styles
  fixedFooter: {
    backgroundColor: Colors.canvas,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
    borderTopColor: Colors.outline,
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
    backgroundColor: Colors.outline,
  },
  activePill: {
    width: 24,
    backgroundColor: Colors.brand,
  },
  nextButton: {
    width: '100%',
    minHeight: 56,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.brand,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  nextButtonText: {
    ...Typography.labelLarge,
    textAlign: 'center',
    color: Colors.white,
  },
});
