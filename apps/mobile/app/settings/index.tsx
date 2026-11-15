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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Spacing, Radii, scaleFont, FontFamily } from '@/theme/tokens';
import { useTheme, type ThemeMode, type AppearanceMode } from '@/theme/ThemeContext';
import { useApp } from '@/state/AppContext';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { MedchainAlarm } from '../../modules/medchain-alarm/src';
import type { SchedulerDiagnostics } from '@/alarms';
import { ThemeThumbnail } from '@/components/ThemeThumbnail';
import { MedChainLogo } from '@/components/MedChainLogo';
import { FormField } from '@/components/FormField';

const SOUND_STYLES: Array<{
  id: 'companion' | 'melodic' | 'classic';
  name: string;
  badge: string;
  description: string;
}> = [
  {
    id: 'companion',
    name: 'Warm Companion',
    badge: 'Recommended',
    description: 'Upbeat acoustic guitar & marimba groove with caring hydration & wellness check-ins.',
  },
  {
    id: 'melodic',
    name: 'Melodic Pop Ringtone',
    badge: 'Catchy & Musical',
    description: '124 BPM glockenspiel bells & acoustic pop arpeggio with concise voice reminder.',
  },
  {
    id: 'classic',
    name: 'Classic Jingle',
    badge: 'Calm Chime',
    description: 'Gentle acoustic chime with crisp spoken announcement.',
  },
];

export default function SettingsScreen() {
  const router = useRouter();
  const {
    mode,
    setMode,
    db,
    scheduler,
    themeMode,
    setThemeMode,
    patientName,
    setPatientName,
    refreshPermissions,
    requestNotificationPermission,
    requestExactAlarmPermission,
    scheduleTestAlarm,
    resetToCleanSlate,
  } = useApp();
  const { colors, colorScheme, setColorScheme, isDark } = useTheme();

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundStyle, setSoundStyle] = useState<'companion' | 'melodic' | 'classic'>('companion');
  const [voiceGender, setVoiceGender] = useState<'female' | 'male'>('female');
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [diagnostics, setDiagnostics] = useState<SchedulerDiagnostics | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [userName, setUserName] = useState(
    patientName && patientName.toLowerCase() !== 'me' ? patientName : ''
  );

  useEffect(() => {
    if (patientName && patientName.toLowerCase() !== 'me') {
      setUserName(patientName);
    }
  }, [patientName]);

  const handleSaveName = async (val: string) => {
    try {
      await setPatientName(val);
    } catch {}
  };

  // Accordion section states
  const [expandedSection, setExpandedSection] = useState<'notifications' | 'backup' | 'language' | 'accessibility' | null>(null);

  const getFullSoundKey = (style: 'companion' | 'melodic' | 'classic', gender: 'female' | 'male') => {
    if (style === 'companion') return `companion_${gender}`;
    if (style === 'melodic') return `melodic_${gender}`;
    return gender;
  };

  const loadSettings = useCallback(async () => {
    if (db) {
      const sound = await db.settings.getBoolean('alarm_sound_enabled', true);
      const vib = await db.settings.getBoolean('alarm_vibration_enabled', true);
      setSoundEnabled(sound);
      setVibrationEnabled(vib);

      const savedVoice = await db.settings.get('alarm_voice');
      if (savedVoice?.startsWith('companion_')) {
        setSoundStyle('companion');
        setVoiceGender(savedVoice.endsWith('male') && !savedVoice.endsWith('female') ? 'male' : 'female');
      } else if (savedVoice?.startsWith('melodic_')) {
        setSoundStyle('melodic');
        setVoiceGender(savedVoice.endsWith('male') && !savedVoice.endsWith('female') ? 'male' : 'female');
      } else if (savedVoice === 'male') {
        setSoundStyle('classic');
        setVoiceGender('male');
      } else if (savedVoice === 'female') {
        setSoundStyle('classic');
        setVoiceGender('female');
      } else {
        setSoundStyle('companion');
        setVoiceGender('female');
      }
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
        'Please enable notifications in phone settings so you can receive reminder alerts for your medicines.',
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
        '🔔 Test Reminder Scheduled',
        'A test reminder will ring in 5 seconds. You can lock your phone now to see how it appears on your lock screen.',
        [{ text: 'OK' }]
      );
      setTimeout(() => setTestSent(false), 5000);
    } catch (err: any) {
      Alert.alert('Notice', err?.message || 'Could not schedule test reminder');
      setTestSent(false);
    }
  };

  const handleResetDatabase = () => {
    Alert.alert(
      'Delete all your medicines?',
      'This erases all medicines, schedules and dose history saved on this phone. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: async () => {
            await resetToCleanSlate();
            Alert.alert('Done', 'All medicines and records on this phone have been cleared.');
          },
        },
      ]
    );
  };

  const handleSelectSound = async (newStyle: 'companion' | 'melodic' | 'classic', newGender: 'female' | 'male') => {
    setSoundStyle(newStyle);
    setVoiceGender(newGender);
    setVoiceError(null);
    const key = getFullSoundKey(newStyle, newGender);
    if (db) await db.settings.set('alarm_voice', key);
    try {
      await scheduler?.reconcileAlarms();
    } catch {}
  };

  const handleTogglePlaySample = async (sampleKey: string) => {
    setVoiceError(null);
    try {
      if (playingKey === sampleKey) {
        await MedchainAlarm?.stopSample();
        setPlayingKey(null);
        return;
      }
      setPlayingKey(sampleKey);
      if (MedchainAlarm) {
        await MedchainAlarm.playSample(sampleKey);
        setTimeout(() => setPlayingKey((cur) => (cur === sampleKey ? null : cur)), 24000);
      } else {
        setTimeout(() => setPlayingKey((cur) => (cur === sampleKey ? null : cur)), 2500);
      }
    } catch (e: any) {
      setPlayingKey(null);
      setVoiceError('Could not play the sample on this device.');
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

  const toggleAccordion = (section: 'notifications' | 'backup' | 'language' | 'accessibility') => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const themes: Array<{
    id: ThemeMode;
    name: string;
    subtitle: string;
    thumbnail: 'nature' | 'ocean' | 'sunset' | 'lavender';
    accent: string;
  }> = [
    {
      id: 'nature',
      name: 'Nature Green',
      subtitle: 'Calm, clean and easy on the eyes.',
      thumbnail: 'nature',
      accent: '#006156',
    },
    {
      id: 'ocean',
      name: 'Ocean Blue',
      subtitle: 'Clean and modern look.',
      thumbnail: 'ocean',
      accent: '#186594',
    },
    {
      id: 'sunset',
      name: 'Sunset Warm',
      subtitle: 'Warm and friendly.',
      thumbnail: 'sunset',
      accent: '#9E5716',
    },
    {
      id: 'lavender',
      name: 'Lavender Calm',
      subtitle: 'Soft and comfortable.',
      thumbnail: 'lavender',
      accent: '#5B4D82',
    },
  ];

  return (
    <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header matching Phone 3 */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={[styles.backCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTextGroup}>
            <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
              Settings & Appearance
            </Text>
            <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
              Customize your experience for you and your family.
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: Spacing.xl }}>
          {/* ========================================================
              1. APPEARANCE SECTION (MATCHES PHONE 3 REFERENCE)
          ======================================================== */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Appearance Header */}
            <View style={styles.sectionHeaderRow}>
              <MedChainLogo size={24} style={{ marginRight: 8 }} />
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Appearance</Text>
            </View>

            {/* Segmented Light / Dark / System Mode Switch */}
            <View style={[styles.modeSegmentContainer, { backgroundColor: colors.surfaceSecondary }]}>
              {(['light', 'dark', 'system'] as AppearanceMode[]).map((scheme) => {
                const isSelected = colorScheme === scheme;
                return (
                  <TouchableOpacity
                    key={scheme}
                    style={[
                      styles.modeSegmentItem,
                      isSelected && [
                        styles.modeSegmentActive,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ],
                    ]}
                    onPress={() => setColorScheme(scheme)}
                    activeOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Ionicons
                      name={
                        scheme === 'light'
                          ? 'sunny-outline'
                          : scheme === 'dark'
                          ? 'moon-outline'
                          : 'laptop-outline'
                      }
                      size={16}
                      color={isSelected ? colors.primary : colors.textSecondary}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.modeSegmentText,
                        {
                          color: isSelected ? colors.primaryDark : colors.textSecondary,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {scheme.charAt(0).toUpperCase() + scheme.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 4 Theme Cards */}
            <View style={styles.themeCardsStack}>
              {themes.map((t) => {
                const isSelected = themeMode === t.id || (themeMode === 'classic' && t.id === 'nature');
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.themeCardItem,
                      {
                        backgroundColor: isSelected ? colors.surfaceSecondary : colors.surface,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setThemeMode(t.id)}
                    activeOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                  >
                    {/* Themed Brand Icon + Landscape Thumbnail */}
                    <MedChainLogo size={38} theme={t.id} style={{ marginRight: 8 }} />
                    <ThemeThumbnail theme={t.thumbnail} width={50} height={38} />

                    <View style={styles.themeInfoCol}>
                      <Text style={[styles.themeItemTitle, { color: colors.textPrimary }]}>
                        {t.name}
                      </Text>
                      <Text style={[styles.themeItemSubtitle, { color: colors.textSecondary }]}>
                        {t.subtitle}
                      </Text>
                    </View>

                    {/* Radio/Check Circle */}
                    <View
                      style={[
                        styles.themeRadioCircle,
                        {
                          backgroundColor: isSelected ? colors.primary : 'transparent',
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      {isSelected && <Ionicons name="checkmark" size={14} color={colors.surface} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ========================================================
              2. GROUPED SETTINGS ROWS (MATCHES PHONE 3 REFERENCE)
          ======================================================== */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 0 }]}>
            {/* Row 1: Notifications */}
            <TouchableOpacity
              style={styles.settingListItem}
              onPress={() => toggleAccordion('notifications')}
              activeOpacity={0.7}
            >
              <View style={[styles.listIconCircle, { backgroundColor: '#DDF2E9' }]}>
                <Ionicons name="notifications" size={20} color="#006156" />
              </View>
              <View style={styles.listTextCol}>
                <Text style={[styles.listTitle, { color: colors.textPrimary }]}>Notifications</Text>
                <Text style={[styles.listSubtitle, { color: colors.textSecondary }]}>
                  Dose reminders, alerts and updates
                </Text>
              </View>
              <Ionicons
                name={expandedSection === 'notifications' ? 'chevron-down' : 'chevron-forward'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {/* Notifications Sub-Panel */}
            {expandedSection === 'notifications' && (
              <View style={[styles.expandedPanel, { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border }]}>
                {/* Alarm Ringtone & Style */}
                <Text style={[styles.subpanelHeader, { color: colors.textPrimary }]}>Alarm ringtone & melody</Text>
                <Text style={[styles.subpanelDesc, { color: colors.textSecondary }]}>
                  Choose your favorite musical ringtone and caring voice companion.
                </Text>

                {SOUND_STYLES.map((st) => {
                  const isSelected = soundStyle === st.id;
                  const sampleKey = getFullSoundKey(st.id, voiceGender);
                  const isPlaying = playingKey === sampleKey;
                  return (
                    <View
                      key={st.id}
                      style={[
                        styles.soundCardOption,
                        {
                          backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <TouchableOpacity
                        style={styles.soundCardLeft}
                        onPress={() => handleSelectSound(st.id, voiceGender)}
                        activeOpacity={0.85}
                      >
                        <MaterialIcons
                          name={isSelected ? 'radio-button-checked' : 'radio-button-unchecked'}
                          size={22}
                          color={isSelected ? colors.primary : colors.textSecondary}
                        />
                        <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' }}>
                            <Text style={[styles.voiceTitle, { color: colors.textPrimary }]}>{st.name}</Text>
                            <View style={[styles.soundBadge, { backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary }]}>
                              <Text style={[styles.soundBadgeText, { color: isSelected ? '#FFFFFF' : colors.textSecondary }]}>
                                {st.badge}
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.voiceSubtitle, { color: colors.textSecondary, marginTop: 3 }]}>
                            {st.description}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.voicePlayBtn,
                          {
                            backgroundColor: isPlaying ? colors.primary : colors.surface,
                            borderColor: isPlaying ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => handleTogglePlaySample(sampleKey)}
                        accessibilityRole="button"
                        activeOpacity={0.85}
                      >
                        <MaterialIcons
                          name={isPlaying ? 'stop' : 'play-arrow'}
                          size={18}
                          color={isPlaying ? '#FFFFFF' : colors.primary}
                        />
                        <Text style={[styles.voicePlayText, { color: isPlaying ? '#FFFFFF' : colors.primary }]}>
                          {isPlaying ? 'Stop' : 'Listen'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {/* Voice Gender Selection */}
                <Text style={[styles.subpanelHeader, { color: colors.textPrimary, marginTop: Spacing.md }]}>Voice tone</Text>
                <View style={styles.voiceGenderRow}>
                  {(['female', 'male'] as const).map((g) => {
                    const isSelected = voiceGender === g;
                    return (
                      <TouchableOpacity
                        key={g}
                        style={[
                          styles.voiceGenderOption,
                          {
                            backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => handleSelectSound(soundStyle, g)}
                        activeOpacity={0.85}
                      >
                        <MaterialIcons
                          name={isSelected ? 'radio-button-checked' : 'radio-button-unchecked'}
                          size={18}
                          color={isSelected ? colors.primary : colors.textSecondary}
                        />
                        <Text style={[styles.voiceGenderText, { color: isSelected ? colors.primary : colors.textPrimary }]}>
                          {g === 'female' ? '🌸 Female voice' : '🎙️ Male voice'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {voiceError && <Text style={[styles.subpanelDesc, { color: colors.error, marginTop: 4 }]}>{voiceError}</Text>}

                {/* Alarm Sound Switch */}
                <View style={[styles.subpanelSwitchRow, { borderTopColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.switchLabel, { color: colors.textPrimary }]}>Alarm sound</Text>
                    <Text style={[styles.switchSubtext, { color: colors.textSecondary }]}>Play gentle chime with reminders</Text>
                  </View>
                  <Switch
                    value={soundEnabled}
                    onValueChange={handleSoundChange}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={colors.surface}
                  />
                </View>

                {/* Vibration Switch */}
                <View style={[styles.subpanelSwitchRow, { borderTopColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.switchLabel, { color: colors.textPrimary }]}>Vibration</Text>
                    <Text style={[styles.switchSubtext, { color: colors.textSecondary }]}>Vibrate during alarms</Text>
                  </View>
                  <Switch
                    value={vibrationEnabled}
                    onValueChange={handleVibrationChange}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={colors.surface}
                  />
                </View>

                {/* Test Reminder Button */}
                <TouchableOpacity
                  style={[styles.testReminderBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
                  onPress={handleSendTestAlarm}
                  activeOpacity={0.85}
                >
                  <Ionicons name="alarm-outline" size={18} color={colors.primaryDark} />
                  <Text style={[styles.testReminderText, { color: colors.primaryDark }]}>
                    {testSent ? 'Reminder ringing in 5 seconds…' : 'Ring a test reminder (5 seconds)'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.listDivider, { backgroundColor: colors.border }]} />

            {/* Row 2: Family & Caregivers */}
            <TouchableOpacity
              style={styles.settingListItem}
              onPress={() => router.push('/(patient)/(tabs)/family/link')}
              activeOpacity={0.7}
            >
              <View style={[styles.listIconCircle, { backgroundColor: '#E0F2F1' }]}>
                <Ionicons name="people" size={20} color="#00695C" />
              </View>
              <View style={styles.listTextCol}>
                <Text style={[styles.listTitle, { color: colors.textPrimary }]}>Family & Caregivers</Text>
                <Text style={[styles.listSubtitle, { color: colors.textSecondary }]}>
                  Manage family members and access
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={[styles.listDivider, { backgroundColor: colors.border }]} />

            {/* Row 3: Backup & Sync */}
            <TouchableOpacity
              style={styles.settingListItem}
              onPress={() => toggleAccordion('backup')}
              activeOpacity={0.7}
            >
              <View style={[styles.listIconCircle, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="cloud-outline" size={20} color="#2E7D32" />
              </View>
              <View style={styles.listTextCol}>
                <Text style={[styles.listTitle, { color: colors.textPrimary }]}>Backup & Sync</Text>
                <Text style={[styles.listSubtitle, { color: colors.textSecondary }]}>
                  Keep your data safe and in sync
                </Text>
              </View>
              <Ionicons
                name={expandedSection === 'backup' ? 'chevron-down' : 'chevron-forward'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {/* Backup & Sync Sub-Panel */}
            {expandedSection === 'backup' && (
              <View style={[styles.expandedPanel, { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border }]}>
                <Text style={[styles.subpanelHeader, { color: colors.textPrimary }]}>Local Database Status</Text>
                <Text style={[styles.subpanelDesc, { color: colors.textSecondary }]}>
                  DoseSaathi stores your medicines, reminders, and history completely offline on your phone's encrypted SQLite database.
                </Text>
                {diagnostics && (
                  <View style={[styles.diagContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.diagRow}>
                      <Text style={[styles.diagKey, { color: colors.textSecondary }]}>Active scheduled doses:</Text>
                      <Text style={[styles.diagVal, { color: colors.textPrimary }]}>{diagnostics.activeAlarmsCount}</Text>
                    </View>
                    <View style={styles.diagRow}>
                      <Text style={[styles.diagKey, { color: colors.textSecondary }]}>Alarm engine:</Text>
                      <Text style={[styles.diagVal, { color: colors.textPrimary }]}>
                        {diagnostics.activeAlarmMode === 'FULL_SCREEN_INTENT' ? 'Screen wake & exact timer' : 'Exact alarm notification'}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            <View style={[styles.listDivider, { backgroundColor: colors.border }]} />

            {/* Row 4: Language */}
            <TouchableOpacity
              style={styles.settingListItem}
              onPress={() => toggleAccordion('language')}
              activeOpacity={0.7}
            >
              <View style={[styles.listIconCircle, { backgroundColor: '#E0F7FA' }]}>
                <Ionicons name="globe-outline" size={20} color="#00838F" />
              </View>
              <View style={styles.listTextCol}>
                <Text style={[styles.listTitle, { color: colors.textPrimary }]}>Language</Text>
                <Text style={[styles.listSubtitle, { color: colors.textSecondary }]}>
                  English (India)
                </Text>
              </View>
              <Ionicons
                name={expandedSection === 'language' ? 'chevron-down' : 'chevron-forward'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {expandedSection === 'language' && (
              <View style={[styles.expandedPanel, { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border }]}>
                <Text style={[styles.subpanelDesc, { color: colors.textSecondary }]}>
                  Currently set to English (India). Multi-language support (Hindi, Bengali, Marathi, Tamil, Telugu) is coming soon in the next release!
                </Text>
              </View>
            )}

            <View style={[styles.listDivider, { backgroundColor: colors.border }]} />

            {/* Row 5: Accessibility */}
            <TouchableOpacity
              style={styles.settingListItem}
              onPress={() => toggleAccordion('accessibility')}
              activeOpacity={0.7}
            >
              <View style={[styles.listIconCircle, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="accessibility-outline" size={20} color="#1B5E20" />
              </View>
              <View style={styles.listTextCol}>
                <Text style={[styles.listTitle, { color: colors.textPrimary }]}>Accessibility</Text>
                <Text style={[styles.listSubtitle, { color: colors.textSecondary }]}>
                  Larger text, high contrast and more
                </Text>
              </View>
              <Ionicons
                name={expandedSection === 'accessibility' ? 'chevron-down' : 'chevron-forward'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {expandedSection === 'accessibility' && (
              <View style={[styles.expandedPanel, { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border }]}>
                <Text style={[styles.subpanelDesc, { color: colors.textSecondary }]}>
                  DoseSaathi automatically adapts to your device's Dynamic Type and system font scaling, ensuring all headings and instructions remain comfortably legible for elderly family members.
                </Text>
              </View>
            )}
          </View>

          {/* ========================================================
              3. USER PROFILE (YOUR NAME)
          ======================================================== */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.iconCircleBadge, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Your Profile</Text>
            </View>
            <Text style={[styles.modeDesc, { color: colors.textSecondary }]}>
              Customize your name for personalized greetings on the home dashboard.
            </Text>
            <View style={{ marginTop: Spacing.sm }}>
              <FormField
                label="Your name (optional)"
                placeholder="e.g. Shibu"
                value={userName}
                onChangeText={setUserName}
                onBlur={() => handleSaveName(userName)}
                onSubmitEditing={() => handleSaveName(userName)}
                returnKeyType="done"
              />
            </View>
          </View>

          {/* ========================================================
              4. USER MODE SWITCHER
          ======================================================== */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.iconCircleBadge, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="person-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Who is using this phone?</Text>
            </View>
            <Text style={[styles.modeDesc, { color: colors.textSecondary }]}>
              Current user:{' '}
              <Text style={{ fontWeight: '700', color: colors.primaryDark }}>
                {mode === 'personal'
                  ? 'Myself (tracking my own medicines)'
                  : 'Family caregiver (managing for loved ones)'}
              </Text>
            </Text>
            <TouchableOpacity
              style={[styles.switchUserButton, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
              onPress={toggleMode}
              activeOpacity={0.8}
            >
              <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
              <Text style={[styles.switchUserText, { color: colors.primary }]}>
                {mode === 'personal'
                  ? 'Switch to family caregiver mode'
                  : 'Switch to tracking my own medicines'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ========================================================
              4. ABOUT DOSESAATHI CARD
          ======================================================== */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.iconCircleBadge, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>About DoseSaathi</Text>
            </View>

            <Text style={[styles.aboutMissionText, { color: colors.textSecondary }]}>
              DoseSaathi is a warm, trustworthy, and offline-first medicine reminder companion built to bridge clinical precision with elderly-friendly accessibility.
            </Text>

            <View style={[styles.aboutMetaRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.aboutMetaLabel, { color: colors.textSecondary }]}>App version</Text>
              <Text style={[styles.aboutMetaVal, { color: colors.textPrimary }]}>
                v{Constants.expoConfig?.version ?? '1.0.4'}
              </Text>
            </View>

            <View style={[styles.aboutMetaRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.aboutMetaLabel, { color: colors.textSecondary }]}>Architecture</Text>
              <Text style={[styles.aboutMetaVal, { color: colors.textPrimary }]}>
                100% Offline-First (SQLite)
              </Text>
            </View>

            <View style={[styles.aboutMetaRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.aboutMetaLabel, { color: colors.textSecondary }]}>License</Text>
              <Text style={[styles.aboutMetaVal, { color: colors.textPrimary }]}>
                MIT Open Source
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.actionRowBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, marginTop: Spacing.sm }]}
              onPress={() => Linking.openURL('https://github.com/shibu2000/DoseSaathi').catch(() => {})}
              activeOpacity={0.8}
            >
              <Ionicons name="logo-github" size={18} color={colors.primary} />
              <Text style={[styles.actionRowText, { color: colors.primary }]}>
                Source code & GitHub Repository
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionRowBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              onPress={() => Linking.openURL('https://github.com/shibu2000/DoseSaathi/releases/latest').catch(() => {})}
              activeOpacity={0.8}
            >
              <Ionicons name="cloud-download-outline" size={18} color={colors.primary} />
              <Text style={[styles.actionRowText, { color: colors.primary }]}>
                Release notes & Latest APKs
              </Text>
            </TouchableOpacity>
          </View>

          {/* ========================================================
              5. DATA & PRIVACY CARD
          ======================================================== */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.iconCircleBadge, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Your Data & Privacy</Text>
            </View>
            <Text style={[styles.privacyDesc, { color: colors.textSecondary }]}>
              🔒 Your medicine names, schedules, and dose records are stored safely on this phone. No medical data is shared over the internet unless you choose to connect with a family caregiver.
            </Text>

            <View style={[styles.appVersionRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.appVersionLabel, { color: colors.textSecondary }]}>App version</Text>
              <Text style={[styles.appVersionVal, { color: colors.textPrimary }]}>
                {Constants.expoConfig?.version ?? '1.0.3'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.actionRowBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              onPress={() => router.push('/welcome')}
              activeOpacity={0.8}
            >
              <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
              <Text style={[styles.actionRowText, { color: colors.primary }]}>
                Take the app welcome tour again
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteButton, { backgroundColor: '#FDF2F0', borderColor: '#F5C6CB' }]}
              onPress={handleResetDatabase}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={[styles.deleteButtonText, { color: colors.error }]}>
                Delete all medicines on this phone
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
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
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginTop: 2,
  },
  headerTextGroup: {
    flex: 1,
  },
  screenTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(23),
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13.5),
    lineHeight: scaleFont(19),
    marginTop: 2,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  iconCircleBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(16.5),
  },
  modeSegmentContainer: {
    flexDirection: 'row',
    borderRadius: Radii.full,
    padding: 4,
    marginBottom: Spacing.md,
  },
  modeSegmentItem: {
    flex: 1,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.full,
  },
  modeSegmentActive: {
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  modeSegmentText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(13),
  },
  themeCardsStack: {
    gap: Spacing.sm,
  },
  themeCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.sm + 2,
    gap: Spacing.md,
  },
  themeInfoCol: {
    flex: 1,
  },
  themeItemTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(15),
  },
  themeItemSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(12.5),
    marginTop: 2,
  },
  themeRadioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 2,
    gap: Spacing.md,
  },
  listIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTextCol: {
    flex: 1,
  },
  listTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(15.5),
  },
  listSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13),
    marginTop: 2,
  },
  listDivider: {
    height: 1,
    marginLeft: Spacing.lg + 38 + Spacing.md,
  },
  expandedPanel: {
    borderTopWidth: 1,
    padding: Spacing.lg,
  },
  subpanelHeader: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(14.5),
    marginBottom: 4,
  },
  subpanelDesc: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13),
    lineHeight: scaleFont(18),
    marginBottom: Spacing.md,
  },
  soundCardOption: {
    borderWidth: 1.5,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  soundCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  soundBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  soundBadgeText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(11),
  },
  voiceGenderRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  voiceGenderOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md - 2,
    borderRadius: Radii.md,
    borderWidth: 1.5,
  },
  voiceGenderText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(13.5),
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  voiceOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  voiceTextCol: {
    flex: 1,
  },
  voiceTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14),
  },
  voiceSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(12),
  },
  voicePlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    height: 48,
  },
  voicePlayText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(13),
  },
  subpanelSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm + 2,
    borderTopWidth: 1,
    marginTop: Spacing.xs,
  },
  switchLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14),
  },
  switchSubtext: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(12.5),
    marginTop: 2,
  },
  testReminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radii.card,
    height: 48,
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  testReminderText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(14),
  },
  diagContainer: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginTop: Spacing.xs,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  diagKey: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13),
  },
  diagVal: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(13),
  },
  modeDesc: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13.5),
    lineHeight: scaleFont(19),
    marginBottom: Spacing.md,
  },
  switchUserButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radii.card,
    height: 50,
    gap: Spacing.xs,
  },
  switchUserText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14.5),
  },
  aboutMissionText: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13.5),
    lineHeight: scaleFont(19),
    marginBottom: Spacing.md,
  },
  aboutMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
  },
  aboutMetaLabel: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13.5),
  },
  aboutMetaVal: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(13.5),
  },
  privacyDesc: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13.5),
    lineHeight: scaleFont(19),
    marginBottom: Spacing.md,
  },
  appVersionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    marginBottom: Spacing.sm,
  },
  appVersionLabel: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13.5),
  },
  appVersionVal: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(13.5),
  },
  actionRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radii.card,
    height: 48,
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  actionRowText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14),
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radii.card,
    height: 48,
    gap: Spacing.xs,
  },
  deleteButtonText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14),
  },
});
