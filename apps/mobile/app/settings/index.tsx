import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  Linking,
  TouchableOpacity,
  AppState,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppScreen } from '@/components/AppScreen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SecondaryButton, PrimaryButton } from '@/components/Buttons';
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
import { useApp } from '@/state/AppContext';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { MedchainAlarm } from '../../modules/medchain-alarm/src';
import type { SchedulerDiagnostics } from '@/alarms';

export default function SettingsScreen() {
  const router = useRouter();
  const {
    mode,
    setMode,
    api,
    db,
    scheduler,
    refreshPermissions,
    requestNotificationPermission,
    requestExactAlarmPermission,
    scheduleTestAlarm,
    resetToCleanSlate,
  } = useApp();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voice, setVoice] = useState<'female' | 'male'>('female');
  const [playing, setPlaying] = useState<'female' | 'male' | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [diagnostics, setDiagnostics] = useState<SchedulerDiagnostics | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [lastFire, setLastFire] = useState<null | {
    firedAtMillis: number;
    screenWasOn: boolean;
    deviceWasLocked: boolean;
    fullScreenIntentAllowed: boolean;
    notificationsEnabled: boolean;
    outcome: string;
  }>(null);

  const loadSettings = useCallback(async () => {
    if (db) {
      const sound = await db.settings.getBoolean('alarm_sound_enabled', true);
      const vib = await db.settings.getBoolean('alarm_vibration_enabled', true);
      setSoundEnabled(sound);
      setVoice((await db.settings.get('alarm_voice')) === 'male' ? 'male' : 'female');
      setVibrationEnabled(vib);
    }
    try {
      const raw = MedchainAlarm?.getLastFire();
      setLastFire(raw ? JSON.parse(raw) : null);
    } catch {
      setLastFire(null);
    }
    if (scheduler) {
      const diag = await scheduler.getDiagnostics();
      setDiagnostics(diag);
    }
  }, [db, scheduler]);

  useEffect(() => {
    loadSettings();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        loadSettings();
        refreshPermissions();
      }
    });
    return () => sub.remove();
  }, [loadSettings, refreshPermissions]);

  const handleRequestNotifications = async () => {
    const res = await requestNotificationPermission();
    await loadSettings();
    if (res === 'denied') {
      Alert.alert(
        'Notifications Disabled',
        'Please enable notifications in OS settings to receive medication alarms.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: handleOpenSystemSettings },
        ]
      );
    }
  };

  const handleRequestExactAlarm = async () => {
    await requestExactAlarmPermission();
    await loadSettings();
  };

  const handleSendTestAlarm = async () => {
    try {
      setTestSent(true);
      await scheduleTestAlarm(5);
      Alert.alert(
        '🔔 Test Alarm Scheduled',
        'A test medication reminder will trigger in 5 seconds. Lock your phone or leave the app to see the notification.',
        [{ text: 'OK' }]
      );
      setTimeout(() => setTestSent(false), 5000);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not schedule test alarm');
      setTestSent(false);
    }
  };

  const handleResetDatabase = () => {
    Alert.alert(
      'Delete all your medicines?',
      'This deletes every medicine, schedule and dose record on this phone. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: async () => {
            await resetToCleanSlate();
            Alert.alert('Done', 'All medicines and history on this phone were deleted.');
          },
        },
      ]
    );
  };

  const handleVoiceChange = async (v: 'female' | 'male') => {
    setVoice(v);
    setVoiceError(null);
    if (db) await db.settings.set('alarm_voice', v);
    // Re-arm the pending reminders so they use the newly chosen voice
    try {
      await scheduler?.reconcileAlarms();
    } catch {}
  };

  const handlePlaySample = async (v: 'female' | 'male') => {
    setVoiceError(null);
    try {
      if (playing === v) {
        await MedchainAlarm?.stopSample();
        setPlaying(null);
        return;
      }
      setPlaying(v);
      await MedchainAlarm?.playSample(v);
      // The sample is ~28 s; clear the playing marker when it ends
      setTimeout(() => setPlaying((cur) => (cur === v ? null : cur)), 28500);
    } catch (e: any) {
      setPlaying(null);
      setVoiceError('Could not play the sample on this build.');
    }
  };

  useEffect(() => () => {
    MedchainAlarm?.stopSample().catch(() => {});
  }, []);

  const handleSoundChange = async (val: boolean) => {
    setSoundEnabled(val);
    if (db) {
      await db.settings.setBoolean('alarm_sound_enabled', val);
    }
  };

  const handleVibrationChange = async (val: boolean) => {
    setVibrationEnabled(val);
    if (db) {
      await db.settings.setBoolean('alarm_vibration_enabled', val);
    }
  };

  const handleOpenSystemSettings = () => {
    if (Linking.openSettings) {
      Linking.openSettings().catch(() => {});
    }
  };

  const toggleMode = () => {
    const nextMode = mode === 'personal' ? 'caregiver' : 'personal';
    setMode(nextMode);
    if (nextMode === 'caregiver') {
      router.replace('/(caregiver)/(tabs)/family');
    } else {
      router.replace('/(patient)/(tabs)/today');
    }
  };

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
        <ScreenHeader
          title="Settings & Accessibility"
          subtitle="Device permissions, alarm alerts and storage"
          showBack={true}
          onBack={() => router.back()}
        />

        {/* Operating Mode Switcher */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Operating Mode</Text>
          <Text style={styles.cardDesc}>
            Using DoseSaathi as: <Text style={styles.boldText}>{mode === 'personal' ? 'Myself (my medicines)' : 'A family caregiver'}</Text>
          </Text>
          <SecondaryButton
            title={mode === 'personal' ? 'Switch to family caregiver' : 'Switch to my medicines'}
            onPress={toggleMode}
            style={styles.switchModeBtn}
          />
        </View>

        {/* Permissions & Native Alarms */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reminders and permissions</Text>

          {/* Exact Alarms */}
          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>Exact alarm timing</Text>
              <Text style={styles.settingSubtext}>
                {diagnostics?.exactAlarmGranted
                  ? 'Reminders ring at the exact minute'
                  : 'Needs your permission so reminders ring on time'}
              </Text>
            </View>
            <View style={[styles.grantedPill, !diagnostics?.exactAlarmGranted && styles.warningPill]}>
              <Text style={[styles.grantedText, !diagnostics?.exactAlarmGranted && styles.warningPillText]}>
                {diagnostics?.exactAlarmGranted ? 'Allowed' : 'Not Allowed'}
              </Text>
            </View>
          </View>

          {!diagnostics?.exactAlarmGranted && (
            <TouchableOpacity
              style={styles.fixPermissionBtn}
              onPress={handleRequestExactAlarm}
              activeOpacity={0.85}
            >
              <MaterialIcons name="alarm" size={16} color={Colors.brand} />
              <Text style={styles.fixPermissionText}>Allow exact alarms in System Settings</Text>
            </TouchableOpacity>
          )}

          <View style={styles.divider} />

          {/* Full-screen alarm (Android 14+ requires the user to allow it) */}
          {diagnostics?.fullScreenIntentGranted !== null && diagnostics?.fullScreenIntentGranted !== undefined && (
            <>
              <View style={styles.settingRow}>
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingLabel}>Full-screen alarm</Text>
                  <Text style={styles.settingSubtext}>
                    {diagnostics.fullScreenIntentGranted
                      ? 'Reminders can wake the screen and show over the lock screen'
                      : 'Not allowed: reminders appear as a notification only'}
                  </Text>
                </View>
                <View style={[styles.grantedPill, !diagnostics.fullScreenIntentGranted && styles.warningPill]}>
                  <Text style={[styles.grantedText, !diagnostics.fullScreenIntentGranted && styles.warningPillText]}>
                    {diagnostics.fullScreenIntentGranted ? 'Allowed' : 'Not Allowed'}
                  </Text>
                </View>
              </View>
              {!diagnostics.fullScreenIntentGranted && (
                <TouchableOpacity
                  style={styles.fixPermissionBtn}
                  onPress={() => MedchainAlarm?.openFullScreenIntentSettings().catch(() => {})}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <MaterialIcons name="fullscreen" size={16} color={Colors.brand} />
                  <Text style={styles.fixPermissionText}>Allow full-screen alarms in System Settings</Text>
                </TouchableOpacity>
              )}
              <View style={styles.divider} />
            </>
          )}

          {/* Notifications */}
          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>Notifications</Text>
              <Text style={styles.settingSubtext}>
                {diagnostics?.notificationGranted
                  ? 'Notification alerts enabled'
                  : 'Notifications disabled in OS settings'}
              </Text>
            </View>
            <View style={[styles.grantedPill, !diagnostics?.notificationGranted && styles.warningPill]}>
              <Text style={[styles.grantedText, !diagnostics?.notificationGranted && styles.warningPillText]}>
                {diagnostics?.notificationGranted ? 'Allowed' : 'Disabled'}
              </Text>
            </View>
          </View>

          {!diagnostics?.notificationGranted && (
            <TouchableOpacity
              style={styles.fixPermissionBtn}
              onPress={handleRequestNotifications}
              activeOpacity={0.85}
            >
              <MaterialIcons name="notifications-active" size={16} color={Colors.brand} />
              <Text style={styles.fixPermissionText}>Allow notifications</Text>
            </TouchableOpacity>
          )}

          <View style={styles.divider} />

          <SecondaryButton
            title={testSent ? 'Test alarm rings in 5 seconds...' : 'Send a test alarm (5 seconds)'}
            onPress={handleSendTestAlarm}
            icon={<MaterialIcons name="alarm-on" size={18} color={Colors.brand} />}
          />

          <View style={styles.divider} />

          {__DEV__ && (
          <SecondaryButton
            title="Open Full-Screen Alarm View"
            onPress={() => router.push('/alarm/test_occurrence_preview')}
            icon={<MaterialIcons name="fullscreen" size={18} color={Colors.brand} />}
          />
          )}

          <View style={styles.divider} />

          <SecondaryButton
            title="Open Android app settings"
            onPress={handleOpenSystemSettings}
            icon={<Ionicons name="settings-outline" size={18} color={Colors.brand} />}
          />

          <View style={styles.divider} />

          {/* Reminder voice: only on builds that include the native alarm module */}
          {MedchainAlarm && (
            <>
              <Text style={styles.settingLabel} accessibilityRole="header">Reminder voice</Text>
              <Text style={styles.settingSubtext}>
                Choose who says "It's time for your medicine" with the music.
              </Text>
              {(['female', 'male'] as const).map((v) => {
                const selected = voice === v;
                return (
                  <View key={v} style={styles.voiceRow}>
                    <TouchableOpacity
                      style={[styles.voiceOption, selected && styles.voiceOptionSelected]}
                      onPress={() => handleVoiceChange(v)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${v === 'female' ? 'Female' : 'Male'} voice`}
                      activeOpacity={0.85}
                    >
                      <MaterialIcons
                        name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                        size={22}
                        color={selected ? Colors.brand : Colors.inkMuted}
                      />
                      <Text style={styles.voiceOptionText}>{v === 'female' ? 'Female voice' : 'Male voice'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.voicePlayBtn}
                      onPress={() => handlePlaySample(v)}
                      accessibilityRole="button"
                      accessibilityLabel={playing === v ? `Stop ${v} voice sample` : `Play ${v} voice sample`}
                      activeOpacity={0.85}
                    >
                      <MaterialIcons name={playing === v ? 'stop' : 'play-arrow'} size={22} color={Colors.brand} />
                      <Text style={styles.fixPermissionText}>{playing === v ? 'Stop' : 'Listen'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {voiceError && <Text style={[styles.settingSubtext, { color: Colors.danger }]}>{voiceError}</Text>}
              <View style={styles.divider} />
            </>
          )}

          {/* Sound Toggle */}
          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>Alarm sound</Text>
              <Text style={styles.settingSubtext}>Play a sound with each reminder</Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={handleSoundChange}
              trackColor={{ false: Colors.outline, true: Colors.brand }}
              accessibilityLabel="Alarm Sound Toggle"
            />
          </View>

          <View style={styles.divider} />

          {/* Vibration Toggle */}
          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>Vibration</Text>
              <Text style={styles.settingSubtext}>Vibrate with each reminder</Text>
            </View>
            <Switch
              value={vibrationEnabled}
              onValueChange={handleVibrationChange}
              trackColor={{ false: Colors.outline, true: Colors.brand }}
              accessibilityLabel="Alarm Vibration Toggle"
            />
          </View>
        </View>

        {/* What Android actually did with the last alarm (Android builds with the native alarm module) */}
        {lastFire && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Last alarm: what happened</Text>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Fired at:</Text>
              <Text style={styles.diagValue}>{new Date(lastFire.firedAtMillis).toLocaleTimeString()}</Text>
            </View>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Screen was:</Text>
              <Text style={styles.diagValue}>{lastFire.screenWasOn ? 'on' : 'off'}{lastFire.deviceWasLocked ? ', locked' : ', unlocked'}</Text>
            </View>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Full-screen allowed:</Text>
              <Text style={styles.diagValue}>{lastFire.fullScreenIntentAllowed ? 'yes' : 'no (Android blocked it)'}</Text>
            </View>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Notifications on:</Text>
              <Text style={styles.diagValue}>{lastFire.notificationsEnabled ? 'yes' : 'no'}</Text>
            </View>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Result:</Text>
              <Text style={styles.diagValue}>{lastFire.outcome}</Text>
            </View>
            {lastFire.screenWasOn && !lastFire.deviceWasLocked && (
              <Text style={styles.cardDesc}>
                The phone was unlocked and in use, so Android shows a banner instead of taking over the screen. This is normal.
              </Text>
            )}
          </View>
        )}

        {/* Honest Diagnostics */}
        {diagnostics && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Reminder status</Text>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Phone:</Text>
              <Text style={styles.diagValue}>{diagnostics.platform === 'android' ? 'Android' : diagnostics.platform === 'ios' ? 'iPhone' : 'Test environment'}</Text>
            </View>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Reminder type:</Text>
              <Text style={styles.diagValue}>{({
                  FULL_SCREEN_INTENT: 'Full-screen alarm',
                  EXACT_ALARM_CLOCK: 'Exact alarm notification',
                  ALARM_KIT: 'System alarm',
                  LOCAL_NOTIFICATION_FALLBACK: 'Standard notification (limited)',
                } as Record<string, string>)[diagnostics.activeAlarmMode] ?? diagnostics.activeAlarmMode}</Text>
            </View>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>Reminders scheduled:</Text>
              <Text style={styles.diagValue}>{diagnostics.activeAlarmsCount}</Text>
            </View>
            {diagnostics.nextScheduledAlarmAt && (
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Next reminder:</Text>
                <Text style={styles.diagValue}>
                  {new Date(diagnostics.nextScheduledAlarmAt).toLocaleTimeString()}
                </Text>
              </View>
            )}
            {diagnostics.lastReconciledAt && (
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Last updated:</Text>
                <Text style={styles.diagValue}>
                  {new Date(diagnostics.lastReconciledAt).toLocaleTimeString()}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Truthful Storage & Data Privacy */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your data</Text>
          <Text style={styles.cardDesc}>
            Your medicines, schedules and dose history are stored on this phone.
          </Text>
          <Text style={styles.cardDesc}>
            Nothing is sent to a server until you link a family member. After that, dose updates and plan changes travel between your phones over HTTPS.
          </Text>

          <View style={styles.divider} />

          {api.isConfigured && (
            <>
              <SecondaryButton title="Privacy policy" onPress={() => Linking.openURL(`${api.publicBaseUrl}/privacy`).catch(() => {})} />
              <SecondaryButton
                title="How to delete your account and data"
                onPress={() => Linking.openURL(`${api.publicBaseUrl}/delete-account`).catch(() => {})}
              />
              <View style={styles.divider} />
            </>
          )}

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>App version</Text>
            <Text style={styles.settingSubtext}>
              {Constants.expoConfig?.version ?? 'unknown'}
              {Constants.expoConfig?.android?.versionCode ? ` (build ${Constants.expoConfig.android.versionCode})` : ''}
            </Text>
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Storage</Text>
            <Text style={styles.settingSubtext}>On this phone</Text>
          </View>

          <View style={styles.divider} />

          <SecondaryButton
            title="Show the welcome tour again"
            onPress={() => router.push('/welcome')}
            icon={<Ionicons name="sparkles-outline" size={18} color={Colors.brand} />}
          />

          <View style={styles.divider} />

          <SecondaryButton
            title="Delete all my medicines"
            onPress={handleResetDatabase}
            icon={<MaterialIcons name="delete-outline" size={18} color={Colors.danger} />}
          />
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    ...Typography.labelMedium,
    color: Colors.ink,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  cardDesc: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  boldText: {
    fontWeight: '700',
    color: Colors.brand,
  },
  switchModeBtn: {
    marginTop: Spacing.xs,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  settingTextContainer: {
    flex: 1,
    marginRight: Spacing.md,
  },
  settingLabel: {
    ...Typography.bodyMedium,
    color: Colors.ink,
    fontWeight: '600',
  },
  settingSubtext: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.outline,
    marginVertical: Spacing.md,
  },
  grantedPill: {
    flexShrink: 0,
    backgroundColor: '#E4F1EC',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.full,
  },
  grantedText: {
    ...Typography.labelSmall,
    color: Colors.brand,
    fontWeight: '700',
  },
  warningPill: {
    backgroundColor: '#FBF0DF',
  },
  warningPillText: {
    ...Typography.labelSmall,
    color: Colors.warning,
    fontWeight: '700',
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  diagLabel: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    flexShrink: 0,
    maxWidth: '55%',
  },
  diagValue: {
    ...Typography.bodySmall,
    color: Colors.ink,
    fontWeight: '600',
    flex: 1,
    flexShrink: 1,
    textAlign: 'right',
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  voiceOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: Colors.outline,
    backgroundColor: Colors.surface,
  },
  voiceOptionSelected: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brandSoft,
  },
  voiceOptionText: {
    ...Typography.labelMedium,
    color: Colors.ink,
    marginLeft: Spacing.sm,
    flexShrink: 1,
  },
  voicePlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 96,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
    backgroundColor: Colors.brandSoft,
  },
  fixPermissionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    backgroundColor: Colors.brandSoft,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.sm,
    marginTop: Spacing.xs,
  },
  fixPermissionText: {
    ...Typography.labelMedium,
    color: Colors.brand,
    fontWeight: '700',
    flexShrink: 1,
  },
});
