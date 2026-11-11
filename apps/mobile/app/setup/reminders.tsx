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
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
import { useApp } from '@/state/AppContext';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

export default function ReminderSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

      if (testTimers.current.interval) clearInterval(testTimers.current.interval);
      const interval = setInterval(() => {
        setTestCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            testTimers.current.reset = setTimeout(() => {
              setTestSent(false);
              setTestCountdown(null);
            }, 3000);
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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Pinned Top Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Reminder setup</Text>
          <Text style={styles.headerStep}>Last step</Text>
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
          <Text style={styles.mainTitle}>
            Make sure reminders reach you
          </Text>
          <Text style={styles.mainSubtitle}>
            Allow these settings so dose reminders ring on time, even when your phone is asleep or in battery saver.
          </Text>
        </View>

        {/* Live Permission Group */}
        <View style={styles.permissionList}>
          {/* Item 1: Notifications */}
          <View style={styles.permissionRow}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, isNotifGranted && styles.iconCircleActive]}>
                <MaterialIcons
                  name={isNotifGranted ? 'notifications-active' : 'notifications'}
                  size={22}
                  color={isNotifGranted ? Colors.brand : Colors.ink}
                />
              </View>
              <View style={styles.textCol}>
                <View style={styles.titleBadgeRow}>
                  <Text style={styles.permTitle}>Notifications</Text>
                  <View style={isNotifGranted ? styles.enabledBadge : styles.notConfiguredBadge}>
                    <Text style={isNotifGranted ? styles.enabledBadgeText : styles.notConfiguredText}>
                      {isNotifGranted ? 'Enabled' : notificationPermission === 'denied' ? 'Blocked' : 'Required'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.permDesc}>
                  Get dose reminders with sound and buttons to mark a dose as taken.
                </Text>
              </View>
            </View>

            {isNotifGranted ? (
              <View style={styles.actionGrantedPill}>
                <MaterialIcons name="check-circle" size={18} color={Colors.brand} />
                <Text style={styles.actionGrantedText}>Allowed</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.actionBtnPrimary}
                onPress={handleRequestNotifications}
                disabled={requestingNotif}
                accessibilityRole="button"
                accessibilityLabel="Enable notification permissions"
              >
                {requestingNotif ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.actionBtnPrimaryText}>
                    {notificationPermission === 'denied' ? 'Settings' : 'Enable'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.divider} />

          {/* Item 2: Reliable Exact Alarms */}
          <View style={styles.permissionRow}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, isAlarmGranted && styles.iconCircleActive]}>
                <MaterialIcons
                  name="alarm"
                  size={22}
                  color={isAlarmGranted ? Colors.brand : Colors.ink}
                />
              </View>
              <View style={styles.textCol}>
                <View style={styles.titleBadgeRow}>
                  <Text style={styles.permTitle}>Reliable exact alarms</Text>
                  <View style={isAlarmGranted ? styles.enabledBadge : styles.notConfiguredBadge}>
                    <Text style={isAlarmGranted ? styles.enabledBadgeText : styles.notConfiguredText}>
                      {isAlarmGranted ? 'Enabled' : 'Recommended'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.permDesc}>
                  Lets Android ring your reminders at the exact time.
                </Text>
              </View>
            </View>

            {isAlarmGranted ? (
              <View style={styles.actionGrantedPill}>
                <MaterialIcons name="check-circle" size={18} color={Colors.brand} />
                <Text style={styles.actionGrantedText}>Allowed</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleRequestExactAlarm}
                disabled={requestingAlarm}
                accessibilityRole="button"
                accessibilityLabel="Configure exact alarm permission"
              >
                {requestingAlarm ? (
                  <ActivityIndicator size="small" color={Colors.brand} />
                ) : (
                  <Text style={styles.actionBtnText}>Configure</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.divider} />

          {/* Item 3: Background Battery Exemption */}
          <View style={styles.permissionRow}>
            <View style={styles.rowLeft}>
              <View style={styles.iconCircle}>
                <MaterialIcons name="battery-charging-full" size={22} color={Colors.ink} />
              </View>
              <View style={styles.textCol}>
                <View style={styles.titleBadgeRow}>
                  <Text style={styles.permTitle}>Background activity</Text>
                  <View style={styles.neutralBadge}>
                    <Text style={styles.neutralBadgeText}>Optional</Text>
                  </View>
                </View>
                <Text style={styles.permDesc}>
                  Stops battery saver from delaying your reminders.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={openBatteryOptimizationSettings}
              accessibilityRole="button"
              accessibilityLabel="Open battery optimization settings"
            >
              <Text style={styles.actionBtnText}>Battery settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Interactive Real Device Test Card */}
        <View style={styles.testCard}>
          <View style={styles.testCardHeader}>
            <View style={styles.testIconBox}>
              <Ionicons name="notifications-outline" size={20} color={Colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.testCardTitle}>Test a reminder</Text>
              <Text style={styles.testCardDesc}>
                Send yourself a reminder to check the sound, vibration, and full-screen alert on this phone.
              </Text>
            </View>
          </View>

          {testSent ? (
            <View style={styles.testSuccessBanner}>
              <MaterialIcons name="check-circle" size={18} color={Colors.brand} />
              <Text style={styles.testSuccessText}>
                {testCountdown !== null
                  ? `Reminder will ring in ${testCountdown} seconds.`
                  : 'Reminder sent. The alert should open now.'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: Spacing.xs }}>
              <TouchableOpacity
                style={styles.testActionBtn}
                onPress={handleSendTestAlarm}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Send test medication reminder in 5 seconds"
              >
                <MaterialIcons name="play-arrow" size={18} color={Colors.brand} />
                <Text style={styles.testActionText}>Send a test reminder in 5 seconds</Text>
              </TouchableOpacity>

              {__DEV__ && (
<TouchableOpacity
                style={styles.previewAlarmBtn}
                onPress={() => router.push('/alarm/test_occurrence_preview')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Open entire screen alarm preview"
              >
                <MaterialIcons name="fullscreen" size={20} color={Colors.brand} />
                <Text style={styles.previewAlarmText}>Preview full-screen alert</Text>
              </TouchableOpacity>
)}
            </View>
          )}
        </View>

        {/* Local Reassurance Banner */}
        <View style={styles.shieldBanner}>
          <MaterialIcons name="cloud-off" size={20} color={Colors.brand} />
          <Text style={styles.shieldText}>
            Reminders are set on this phone and work without internet. No account is needed.
          </Text>
        </View>

        {/* Bottom Primary Actions */}
        <View style={styles.footerActions}>
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={handleFinish}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Continue to DoseSaathi dashboard"
          >
            <Text style={styles.continueText}>
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
            <Text style={styles.laterText}>Set up later</Text>
          </TouchableOpacity>
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
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    height: 52,
    backgroundColor: Colors.canvas,
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
    color: Colors.ink,
  },
  headerStep: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    fontSize: 12,
  },
  titleSection: {
    marginVertical: Spacing.lg,
  },
  mainTitle: {
    ...Typography.headlineLarge,
    color: Colors.ink,
    lineHeight: 34,
    marginBottom: Spacing.xs,
  },
  mainSubtitle: {
    ...Typography.bodyMedium,
    color: Colors.inkMuted,
    lineHeight: 22,
  },
  permissionList: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
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
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  iconCircleActive: {
    backgroundColor: Colors.brandSoft,
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
    color: Colors.ink,
  },
  permDesc: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    lineHeight: 18,
  },
  enabledBadge: {
    backgroundColor: Colors.brandSoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radii.full,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  enabledBadgeText: {
    ...Typography.labelSmall,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.brand,
    includeFontPadding: false,
  },
  notConfiguredBadge: {
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radii.full,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  notConfiguredText: {
    ...Typography.labelSmall,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.warning,
    includeFontPadding: false,
  },
  neutralBadge: {
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radii.full,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  neutralBadgeText: {
    ...Typography.labelSmall,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.inkMuted,
    includeFontPadding: false,
  },
  actionBtn: {
    alignSelf: 'flex-start',
    marginLeft: 48,
    minHeight: 48,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    ...Typography.labelSmall,
    color: Colors.ink,
    fontWeight: '600',
  },
  actionBtnPrimary: {
    alignSelf: 'flex-start',
    marginLeft: 48,
    minHeight: 48,
    minWidth: 96,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.brand,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimaryText: {
    ...Typography.labelSmall,
    color: Colors.white,
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
    backgroundColor: Colors.brandSoft,
    borderRadius: Radii.full,
  },
  actionGrantedText: {
    ...Typography.labelSmall,
    color: Colors.brand,
    fontWeight: '600',
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceMuted,
    marginHorizontal: Spacing.sm,
  },
  // Test Card Styles
  testCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
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
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testCardTitle: {
    ...Typography.labelMedium,
    color: Colors.ink,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
  },
  testCardDesc: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    lineHeight: 18,
    marginTop: 2,
  },
  testActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.brandSoft,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.sm,
  },
  testActionText: {
    textAlign: 'center',
    ...Typography.labelMedium,
    color: Colors.brand,
  },
  previewAlarmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.outline,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.sm,
  },
  previewAlarmText: {
    textAlign: 'center',
    ...Typography.labelMedium,
    color: Colors.ink,
  },
  testSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.brandSoft,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.sm,
  },
  testSuccessText: {
    ...Typography.bodySmall,
    color: Colors.brand,
    fontWeight: '600',
    flex: 1,
  },
  shieldBanner: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radii.card,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  shieldText: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
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
    backgroundColor: Colors.brand,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  continueText: {
    textAlign: 'center',
    ...Typography.labelLarge,
    color: Colors.white,
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
    color: Colors.inkMuted,
  },
});
