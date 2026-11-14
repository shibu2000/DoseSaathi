import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography, scaleFont, FontFamily } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { PrimaryButton, SecondaryButton } from './Buttons';
import type { OccurrenceWithMedication } from '../database';
import { MedchainAlarm } from '../../modules/medchain-alarm/src';
import { formatCountdown } from '../utils/countdown';

export { formatCountdown };

interface UpcomingCountdownCardProps {
  occurrence: OccurrenceWithMedication;
  onTake: () => void;
  onSnooze: () => void;
  onSkip: () => void;
}

export function UpcomingCountdownCard({
  occurrence,
  onTake,
  onSnooze,
  onSkip,
}: UpcomingCountdownCardProps) {
  const { colors, isGlass, glassStyles } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const [canPin, setCanPin] = useState(false);
  const [pinAdded, setPinAdded] = useState(false);

  // Update countdown every 10 seconds for a live ticker feel
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  // Check if phone launcher supports widget pinning
  useEffect(() => {
    try {
      if (MedchainAlarm?.canPinWidget()) {
        setCanPin(true);
      }
    } catch {
      setCanPin(false);
    }
  }, []);

  const targetMs = useMemo(() => {
    return new Date(occurrence.snoozedUntil || occurrence.scheduledAtUtc).getTime();
  }, [occurrence.snoozedUntil, occurrence.scheduledAtUtc]);

  const isSnoozed = Boolean(occurrence.snoozedUntil && targetMs > now);
  const countdown = useMemo(() => formatCountdown(targetMs, now, isSnoozed), [targetMs, now, isSnoozed]);

  const handlePinWidget = async () => {
    try {
      await MedchainAlarm?.requestPinWidget();
      setPinAdded(true);
      setTimeout(() => setPinAdded(false), 4000);
    } catch {
      // Graceful fallback
    }
  };

  const med = occurrence.medication;
  const dosageLine = `${med.dosageText} • ${med.doseQuantity} ${med.doseUnit}`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isGlass ? colors.cardBackground : colors.surface,
          borderColor: isGlass ? colors.cardBorder : colors.brand,
          borderWidth: isGlass ? 1.5 : 2,
        },
        isGlass && glassStyles.card,
      ]}
    >
      {/* Top Header Row with Icon, Section Tag and Countdown Pill */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View
            style={[
              styles.clockEmblem,
              {
                backgroundColor: isGlass ? 'rgba(255, 255, 255, 0.85)' : colors.brandSoft,
                borderColor: isGlass ? 'rgba(255, 255, 255, 0.95)' : 'transparent',
                borderWidth: isGlass ? 1 : 0,
              },
            ]}
          >
            <MaterialIcons
              name={countdown.isDue ? 'alarm' : 'schedule'}
              size={18}
              color={countdown.isDue ? colors.danger : colors.primary}
            />
          </View>
          <Text style={[styles.headerLabel, { color: colors.primary }]}>
            {countdown.isDue ? 'TIME FOR MEDICINE' : 'UPCOMING DOSE'}
          </Text>
        </View>

        <View
          style={[
            styles.countdownBadge,
            countdown.isDue ? styles.countdownBadgeDue : styles.countdownBadgeUpcoming,
            isGlass && {
              backgroundColor: countdown.isDue ? 'rgba(255, 218, 214, 0.85)' : 'rgba(30, 88, 77, 0.12)',
              borderColor: 'rgba(255, 255, 255, 0.8)',
              borderWidth: 1,
            },
          ]}
        >
          <Text
            style={[
              styles.countdownBadgeText,
              countdown.isDue ? styles.countdownBadgeTextDue : styles.countdownBadgeTextUpcoming,
              isGlass && !countdown.isDue && { color: colors.primary },
            ]}
          >
            {countdown.badgeText}
          </Text>
        </View>
      </View>

      {/* Medication Name & Dosage */}
      <Text style={[styles.medName, { color: colors.ink }]}>{med.name}</Text>
      <Text style={[styles.dosageText, { color: colors.ink }]}>{dosageLine}</Text>

      {/* Scheduled Time & Detail Info */}
      <View style={styles.infoRow}>
        <View
          style={[
            styles.timePill,
            {
              backgroundColor: isGlass ? 'rgba(255, 255, 255, 0.8)' : colors.brandSoft,
              borderColor: isGlass ? 'rgba(255, 255, 255, 0.95)' : 'transparent',
              borderWidth: isGlass ? 1 : 0,
            },
          ]}
        >
          <Ionicons name="time-outline" size={14} color={colors.primary} />
          <Text style={[styles.timePillText, { color: colors.primary }]}>
            {occurrence.scheduledLocalTime}
          </Text>
        </View>
        <Text style={[styles.relativeDetailText, { color: colors.inkMuted }]}>
          {countdown.relativeDetail}
        </Text>
      </View>

      {med.instructions ? (
        <View
          style={[
            styles.instructionsContainer,
            {
              backgroundColor: isGlass ? 'rgba(255, 255, 255, 0.50)' : colors.surfaceMuted,
              borderColor: isGlass ? 'rgba(255, 255, 255, 0.75)' : 'transparent',
              borderWidth: isGlass ? 1 : 0,
            },
          ]}
        >
          <MaterialIcons name="info-outline" size={14} color={colors.inkMuted} />
          <Text style={[styles.instructionsText, { color: colors.inkMuted }]}>
            {med.instructions}
          </Text>
        </View>
      ) : null}

      {/* Primary & Secondary Action Buttons */}
      <View style={styles.actionContainer}>
        <PrimaryButton
          title="Mark as taken"
          onPress={onTake}
          style={styles.takeButton}
          icon="✓"
        />

        <View style={styles.secondaryRow}>
          <SecondaryButton
            title="Remind in 10 minutes"
            onPress={onSnooze}
            style={styles.actionSecondaryButton}
          />
          <SecondaryButton
            title="Skip this dose"
            onPress={onSkip}
            style={styles.actionSecondaryButton}
          />
        </View>
      </View>

      {/* Quick Home Screen Widget Pinning Shortcut */}
      {canPin && (
        <Pressable
          style={({ pressed }) => [
            styles.pinWidgetButton,
            isGlass && {
              backgroundColor: pressed ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.65)',
              borderColor: 'rgba(255, 255, 255, 0.95)',
              borderWidth: 1.5,
            },
            pressed && !isGlass && styles.pinWidgetButtonPressed,
          ]}
          onPress={handlePinWidget}
          accessibilityRole="button"
          accessibilityLabel="Add DoseSaathi widget to phone home screen"
        >
          <MaterialIcons name="widgets" size={16} color={colors.primary} />
          <Text style={[styles.pinWidgetButtonText, { color: colors.primary }]}>
            {pinAdded ? '✓ Widget placed on home screen!' : 'Place widget on phone home screen'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.brand,
    borderWidth: 2,
    borderRadius: Radii.card,
    padding: Spacing.lg,
    marginVertical: Spacing.sm,
    shadowColor: '#202B28',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  clockEmblem: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    fontFamily: FontFamily.bold,
    color: Colors.primary,
    fontSize: scaleFont(12.5),
    letterSpacing: 0.8,
  },
  countdownBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radii.full,
  },
  countdownBadgeUpcoming: {
    backgroundColor: Colors.brandSoft,
  },
  countdownBadgeDue: {
    backgroundColor: '#FFDAD6',
  },
  countdownBadgeText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(13.5),
  },
  countdownBadgeTextUpcoming: {
    color: Colors.primary,
  },
  countdownBadgeTextDue: {
    color: Colors.danger,
  },
  medName: {
    fontFamily: FontFamily.bold,
    color: Colors.ink,
    fontSize: scaleFont(23),
    lineHeight: scaleFont(29),
    marginTop: Spacing.xs,
  },
  dosageText: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(16.5),
    lineHeight: scaleFont(23),
    color: Colors.ink,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brandSoft,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.sm,
  },
  timePillText: {
    fontFamily: FontFamily.bold,
    color: Colors.primary,
    fontSize: scaleFont(13.5),
  },
  relativeDetailText: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    fontSize: scaleFont(13.5),
    lineHeight: scaleFont(19),
  },
  instructionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radii.sm,
  },
  instructionsText: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    fontSize: scaleFont(13.5),
    lineHeight: scaleFont(19),
    flex: 1,
  },
  actionContainer: {
    marginTop: Spacing.md,
  },
  takeButton: {
    minHeight: 56,
  },
  secondaryRow: {
    flexDirection: 'column',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  actionSecondaryButton: {
    alignSelf: 'stretch',
    minHeight: 48,
  },
  pinWidgetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(220, 233, 226, 0.45)',
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: 'rgba(36, 91, 80, 0.25)',
  },
  pinWidgetButtonPressed: {
    backgroundColor: Colors.brandSoft,
  },
  pinWidgetButtonText: {
    ...Typography.labelSmall,
    color: Colors.primary,
    fontSize: 13,
  },
});
