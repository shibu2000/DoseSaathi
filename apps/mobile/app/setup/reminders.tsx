import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, Typography, Radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { useApp } from '@/state/AppContext';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

export default function ReminderSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const {
    setOnboarded,
    notificationPermission,
    exactAlarmPermission,
    refreshPermissions,
    requestNotificationPermission,
    requestExactAlarmPermission,
    openBatteryOptimizationSettings,
    openAppSettings,
    scheduleTestAlarm,
  } = useApp();

  const [requestingNotif, setRequestingNotif] = useState(false);
  const [requestingAlarm, setRequestingAlarm] = useState(false);
  const [testCountdown, setTestCountdown] = useState<number | null>(null);
  const [testSent, setTestSent] = useState(false);
  const testTimers = useRef<{ interval?: ReturnType<typeof setInterval>; reset?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => {
    const timers = testTimers.current;
    return () => {
      if (timers.interval) clearInterval(timers.interval);
      if (timers.reset) clearTimeout(timers.reset);
    };
  }, []);

  // Sync permissions when returning from system settings
  useEffect(() => {
    refreshPermissions();
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshPermissions();
      }
    });
    return () => sub.remove();
  }, [refreshPermissions]);

  const handleRequestNotifications = async () => {
    setRequestingNotif(true);
    try {
      const result = await requestNotificationPermission();
      if (result === 'denied') {
        Alert.alert(
          'Notifications are blocked',
          'Notifications are turned off for DoseSaathi. Turn them on in system settings so DoseSaathi can remind you when a dose is due.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open settings', onPress: () => openAppSettings() },
          ]
        );
      }
    } catch (err) {
      console.warn('Failed to request notifications:', err);
    } finally {
      setRequestingNotif(false);
    }
  };

  const handleRequestExactAlarm = async () => {
    setRequestingAlarm(true);
    try {
      await requestExactAlarmPermission();
    } catch (err) {
      console.warn('Failed to request exact alarm permission:', err);
    } finally {
      setRequestingAlarm(false);
    }
  };

  const handleSendTestAlarm = async () => {
    if (notificationPermission !== 'granted') {
      Alert.alert(
        'Turn on notifications first',
        'Allow notifications above before sending a test reminder.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Turn on', onPress: handleRequestNotifications },
        ]
      );
      return;
    }

    try {
      setTestSent(true);
      setTestCountdown(5);
      await scheduleTestAlarm(5);

      const interval = setInterval(() => {
        setTestCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            testTimers.current.reset = setTimeout(() => {
              setTestSent(false);
              setTestCountdown(null);
            }, 6000);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      testTimers.current.interval = interval;
    } catch (err: any) {
      Alert.alert('Test reminder failed', err?.message || 'Could not schedule the test reminder.');
      setTestSent(false);
      setTestCountdown(null);
    }
  };

  const handleFinish = () => {
    if (notificationPermission !== 'granted') {
      Alert.alert(
        'Reminders are not turned on',
        'Without notifications, DoseSaathi cannot remind you when a dose is due. Continue anyway?',
        [
          { text: 'Turn on notifications', onPress: handleRequestNotifications },
          {
            text: 'Continue anyway',
            style: 'destructive',
            onPress: () => {
              setOnboarded(true);
              router.replace('/(patient)/(tabs)/today');
            },
          },
        ]
      );
      return;
    }

    setOnboarded(true);
    router.replace('/(patient)/(tabs)/today');
  };

  const isNotifGranted = notificationPermission === 'granted';
  const isAlarmGranted = exactAlarmPermission === 'granted';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.canvas }]}>
      {/* Pinned Top Header Bar */}
      <View style={[styles.headerBar, { backgroundColor: colors.canvas }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Reminder setup</Text>
          <Text style={[styles.headerStep, { color: colors.textSecondary }]}>Last step</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Narrative Headline */}
        <View style={styles.titleSection}>
          <Text style={[styles.mainTitle, { color: colors.textPrimary }]}>
            Make sure reminders reach you
          </Text>
          <Text style={[styles.mainSubtitle, { color: colors.textSecondary }]}>
            Allow these settings so dose reminders ring on time, even when your phone is asleep or in battery saver.
          </Text>
        </View>

        {/* Live Permission Group */}
        <View style={[styles.permissionList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Item 1: Notifications */}
          <View style={styles.permissionRow}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: isNotifGranted ? colors.brandSoft : colors.surfaceSecondary }]}>
                <MaterialIcons
                  name={isNotifGranted ? 'notifications-active' : 'notifications'}
                  size={22}
                  color={isNotifGranted ? colors.primary : colors.textPrimary}
                />
              </View>
              <View style={styles.textCol}>
                <View style={styles.titleBadgeRow}>
                  <Text style={[styles.permTitle, { color: colors.textPrimary }]}>Notifications</Text>
                  <View
                    style={[
                      styles.badgePill,
                      {
                        backgroundColor: isNotifGranted
                          ? colors.brandSoft
                          : notificationPermission === 'denied'
                          ? 'rgba(204, 102, 91, 0.15)'
                          : colors.surfaceSecondary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color: isNotifGranted
                            ? colors.primary
                            : notificationPermission === 'denied'
                            ? colors.error
                            : colors.textSecondary,
                        },
                      ]}
                    >
                      {isNotifGranted ? 'Enabled' : notificationPermission === 'denied' ? 'Blocked' : 'Required'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.permDesc, { color: colors.textSecondary }]}>
                  Get dose reminders with sound and buttons to mark a dose as taken.
                </Text>
              </View>
            </View>

            {isNotifGranted ? (
              <View style={[styles.actionGrantedPill, { backgroundColor: colors.brandSoft }]}>
                <MaterialIcons name="check-circle" size={18} color={colors.primary} />
                <Text style={[styles.actionGrantedText, { color: colors.primary }]}>Allowed</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.actionBtnPrimary, { backgroundColor: colors.primary }]}
                onPress={handleRequestNotifications}
                disabled={requestingNotif}
                accessibilityRole="button"
                accessibilityLabel="Enable notification permissions"
              >
                {requestingNotif ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={[styles.actionBtnPrimaryText, { color: colors.white }]}>
                    {notificationPermission === 'denied' ? 'Settings' : 'Enable'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Item 2: Reliable Exact Alarms */}
          <View style={styles.permissionRow}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: isAlarmGranted ? colors.brandSoft : colors.surfaceSecondary }]}>
                <MaterialIcons
                  name="alarm"
                  size={22}
                  color={isAlarmGranted ? colors.primary : colors.textPrimary}
                />
              </View>
              <View style={styles.textCol}>
                <View style={styles.titleBadgeRow}>
                  <Text style={[styles.permTitle, { color: colors.textPrimary }]}>Reliable exact alarms</Text>
                  <View
                    style={[
                      styles.badgePill,
                      { backgroundColor: isAlarmGranted ? colors.brandSoft : colors.surfaceSecondary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: isAlarmGranted ? colors.primary : colors.warning },
                      ]}
                    >
                      {isAlarmGranted ? 'Enabled' : 'Recommended'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.permDesc, { color: colors.textSecondary }]}>
                  Lets Android ring your reminders at the exact time.
                </Text>
              </View>
            </View>

            {isAlarmGranted ? (
              <View style={[styles.actionGrantedPill, { backgroundColor: colors.brandSoft }]}>
                <MaterialIcons name="check-circle" size={18} color={colors.primary} />
                <Text style={[styles.actionGrantedText, { color: colors.primary }]}>Allowed</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }]}
                onPress={handleRequestExactAlarm}
                disabled={requestingAlarm}
                accessibilityRole="button"
                accessibilityLabel="Configure exact alarm permission"
              >
                {requestingAlarm ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>Configure</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Item 3: Background Battery Exemption */}
          <View style={styles.permissionRow}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSecondary }]}>
                <MaterialIcons name="battery-charging-full" size={22} color={colors.textPrimary} />
              </View>
              <View style={styles.textCol}>
                <View style={styles.titleBadgeRow}>
                  <Text style={[styles.permTitle, { color: colors.textPrimary }]}>Background activity</Text>
                  <View style={[styles.badgePill, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={[styles.badgeText, { color: colors.textSecondary }]}>Optional</Text>
                  </View>
                </View>
                <Text style={[styles.permDesc, { color: colors.textSecondary }]}>
                  Stops battery saver from delaying your reminders.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }]}
              onPress={openBatteryOptimizationSettings}
              accessibilityRole="button"
              accessibilityLabel="Open battery optimization settings"
            >
              <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>Battery settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Interactive Real Device Test Card */}
        <View style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.testCardHeader}>
            <View style={[styles.testIconBox, { backgroundColor: colors.brandSoft }]}>
              <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.testCardTitle, { color: colors.textPrimary }]}>Test a reminder</Text>
              <Text style={[styles.testCardDesc, { color: colors.textSecondary }]}>
                Send yourself a reminder to check the sound, vibration, and full-screen alert on this phone.
              </Text>
            </View>
          </View>

          {testSent ? (
            <View style={[styles.testSuccessBanner, { backgroundColor: colors.brandSoft }]}>
              <MaterialIcons name="check-circle" size={18} color={colors.primary} />
              <Text style={[styles.testSuccessText, { color: colors.primary }]}>
                {testCountdown !== null
                  ? `Reminder will ring in ${testCountdown} seconds.`
                  : 'Reminder sent. The alert should open now.'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: Spacing.xs }}>
              <TouchableOpacity
                style={[styles.testActionBtn, { backgroundColor: colors.brandSoft }]}
                onPress={handleSendTestAlarm}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Send test medication reminder in 5 seconds"
              >
                <MaterialIcons name="play-arrow" size={18} color={colors.primary} />
                <Text style={[styles.testActionText, { color: colors.primary }]}>Send a test reminder in 5 seconds</Text>
              </TouchableOpacity>

              {__DEV__ && (
                <TouchableOpacity
                  style={[styles.previewAlarmBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  onPress={() => router.push('/alarm/test_occurrence_preview')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Open entire screen alarm preview"
                >
                  <MaterialIcons name="fullscreen" size={20} color={colors.primary} />
                  <Text style={[styles.previewAlarmText, { color: colors.textPrimary }]}>Preview full-screen alert</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Local Reassurance Banner */}
        <View style={[styles.shieldBanner, { backgroundColor: colors.surfaceSecondary }]}>
          <MaterialIcons name="cloud-off" size={20} color={colors.primary} />
          <Text style={[styles.shieldText, { color: colors.textSecondary }]}>
            Reminders are set on this phone and work without internet. No account is needed.
          </Text>
        </View>

        {/* Bottom Primary Actions */}
        <View style={styles.footerActions}>
          <TouchableOpacity
            style={[styles.continueBtn, { backgroundColor: colors.primary }]}
            onPress={handleFinish}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Continue to DoseSaathi dashboard"
          >
            <Text style={[styles.continueText, { color: colors.white }]}>
              {isNotifGranted ? 'Continue to DoseSaathi' : 'Continue'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.laterBtn}
            onPress={() => {
              setOnboarded(true);
              router.replace('/(patient)/(tabs)/today');
            }}
            accessibilityRole="button"
            accessibilityLabel="Set up later"
          >
            <Text style={[styles.laterText, { color: colors.textSecondary }]}>Set up later</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    height: 52,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.huge * 2,
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  headerSpacer: {
    width: 48,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.headlineSmall,
  },
  headerStep: {
    ...Typography.bodySmall,
    fontSize: 12,
  },
  titleSection: {
    marginVertical: Spacing.lg,
  },
  mainTitle: {
    ...Typography.headlineLarge,
    lineHeight: 34,
    marginBottom: Spacing.xs,
  },
  mainSubtitle: {
    ...Typography.bodyMedium,
    lineHeight: 22,
  },
  permissionList: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    marginBottom: Spacing.md,
  },
  permissionRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    gap: Spacing.sm,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textCol: {
    flex: 1,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 2,
  },
  permTitle: {
    ...Typography.headlineSmall,
    fontSize: 16,
  },
  permDesc: {
    ...Typography.bodySmall,
    lineHeight: 18,
  },
  badgePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radii.full,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  badgeText: {
    ...Typography.labelSmall,
    fontSize: 12,
    lineHeight: 16,
    includeFontPadding: false,
    fontWeight: '600',
  },
  actionBtn: {
    alignSelf: 'flex-start',
    marginLeft: 48,
    minHeight: 48,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    ...Typography.labelSmall,
    fontWeight: '600',
  },
  actionBtnPrimary: {
    alignSelf: 'flex-start',
    marginLeft: 48,
    minHeight: 48,
    minWidth: 96,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimaryText: {
    ...Typography.labelSmall,
    fontWeight: '600',
  },
  actionGrantedPill: {
    alignSelf: 'flex-start',
    marginLeft: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radii.full,
  },
  actionGrantedText: {
    ...Typography.labelSmall,
    fontWeight: '600',
    fontSize: 12,
  },
  divider: {
    height: 1,
    marginHorizontal: Spacing.sm,
  },
  testCard: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  testCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  testIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testCardTitle: {
    ...Typography.labelMedium,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
  },
  testCardDesc: {
    ...Typography.bodySmall,
    lineHeight: 18,
    marginTop: 2,
  },
  testActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.sm,
  },
  testActionText: {
    textAlign: 'center',
    ...Typography.labelMedium,
  },
  previewAlarmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.sm,
  },
  previewAlarmText: {
    textAlign: 'center',
    ...Typography.labelMedium,
  },
  testSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.sm,
  },
  testSuccessText: {
    ...Typography.bodySmall,
    fontWeight: '600',
    flex: 1,
  },
  shieldBanner: {
    borderRadius: Radii.card,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  shieldText: {
    ...Typography.bodySmall,
    flex: 1,
    lineHeight: 18,
  },
  footerActions: {
    gap: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  continueBtn: {
    minHeight: 52,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  continueText: {
    textAlign: 'center',
    ...Typography.labelLarge,
    fontWeight: '600',
  },
  laterBtn: {
    minHeight: 48,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterText: {
    ...Typography.labelMedium,
  },
});
