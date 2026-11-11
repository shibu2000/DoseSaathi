import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '../theme/tokens';
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
    <View style={styles.card}>
      {/* Top Header Row with Icon, Section Tag and Countdown Pill */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View style={styles.clockEmblem}>
            <MaterialIcons
              name={countdown.isDue ? 'alarm' : 'schedule'}
              size={18}
              color={countdown.isDue ? Colors.danger : Colors.primary}
            />
          </View>
          <Text style={styles.headerLabel}>NEXT UPCOMING DOSE</Text>
        </View>

        <View
          style={[
            styles.countdownBadge,
            countdown.isDue ? styles.countdownBadgeDue : styles.countdownBadgeUpcoming,
          ]}
        >
          <Text
            style={[
              styles.countdownBadgeText,
              countdown.isDue ? styles.countdownBadgeTextDue : styles.countdownBadgeTextUpcoming,
            ]}
          >
            {countdown.badgeText}
          </Text>
        </View>
      </View>

      {/* Medication Name & Dosage */}
      <Text style={styles.medName}>{med.name}</Text>
      <Text style={styles.dosageText}>{dosageLine}</Text>

      {/* Scheduled Time & Detail Info */}
      <View style={styles.infoRow}>
        <View style={styles.timePill}>
          <Ionicons name="time-outline" size={14} color={Colors.primary} />
          <Text style={styles.timePillText}>{occurrence.scheduledLocalTime}</Text>
        </View>
        <Text style={styles.relativeDetailText}>{countdown.relativeDetail}</Text>
      </View>

      {med.instructions ? (
        <View style={styles.instructionsContainer}>
          <MaterialIcons name="info-outline" size={14} color={Colors.inkMuted} />
          <Text style={styles.instructionsText}>{med.instructions}</Text>
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
            pressed && styles.pinWidgetButtonPressed,
          ]}
          onPress={handlePinWidget}
          accessibilityRole="button"
          accessibilityLabel="Add DoseSaathi widget to phone home screen"
        >
          <MaterialIcons name="widgets" size={16} color={Colors.primary} />
          <Text style={styles.pinWidgetButtonText}>
            {pinAdded ? 'Widget request sent! Check home screen' : 'Place widget on phone home screen'}
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
    ...Typography.labelSmall,
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
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
    ...Typography.labelSmall,
    fontSize: 13,
    fontWeight: '700',
  },
  countdownBadgeTextUpcoming: {
    color: Colors.primary,
  },
  countdownBadgeTextDue: {
    color: Colors.danger,
  },
  medName: {
    ...Typography.headlineMedium,
    color: Colors.ink,
    fontSize: 22,
    fontWeight: '700',
    marginTop: Spacing.xs,
  },
  dosageText: {
    ...Typography.bodyLarge,
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
    ...Typography.labelSmall,
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  relativeDetailText: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    fontSize: 13,
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
    fontSize: 13,
    flex: 1,
  },
  actionContainer: {
    marginTop: Spacing.md,
  },
  takeButton: {
    minHeight: 56,
    backgroundColor: Colors.brand,
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
    fontWeight: '600',
    fontSize: 13,
  },
});
