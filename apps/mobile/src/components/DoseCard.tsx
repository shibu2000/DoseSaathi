import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/tokens';
import { PrimaryButton, SecondaryButton } from './Buttons';
import { StatusTag, StatusVariant } from './StatusTag';

interface DoseCardProps {
  timeStr: string;
  medicationName: string;
  dosageText: string;
  instructions?: string;
  statusLabel: string;
  statusVariant: StatusVariant;
  onTake: () => void;
  onSnooze?: () => void;
  onSkip?: () => void;
  isTaken?: boolean;
}

export function DoseCard({
  timeStr,
  medicationName,
  dosageText,
  instructions,
  statusLabel,
  statusVariant,
  onTake,
  onSnooze,
  onSkip,
  isTaken = false,
}: DoseCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.timeBadge}>
          <Text style={styles.timeText}>{timeStr}</Text>
        </View>
        <StatusTag label={statusLabel} variant={statusVariant} />
      </View>

      <Text style={styles.medName}>{medicationName}</Text>
      <Text style={styles.dosage}>{dosageText}</Text>
      {instructions && <Text style={styles.instructions}>{instructions}</Text>}

      {!isTaken ? (
        <View style={styles.actionContainer}>
          <PrimaryButton
            title="Taken"
            onPress={onTake}
            style={styles.takeButton}
            icon="✓"
          />
          <View style={styles.secondaryRow}>
            {onSnooze && (
              <SecondaryButton
                title="Remind me in 10 minutes"
                onPress={onSnooze}
                style={styles.halfButton}
              />
            )}
            {onSkip && (
              <SecondaryButton
                title="Skip this dose"
                onPress={onSkip}
                style={styles.halfButton}
              />
            )}
          </View>
        </View>
      ) : (
        <View style={styles.confirmedBox}>
          <Text style={styles.confirmedText}>✓ Recorded as taken</Text>
        </View>
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
    padding: Spacing.xl,
    marginVertical: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  timeBadge: {
    backgroundColor: Colors.brandSoft,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.sm,
  },
  timeText: {
    ...Typography.labelMedium,
    color: Colors.primary,
    fontWeight: '700',
  },
  medName: {
    ...Typography.headlineMedium,
    color: Colors.ink,
    marginBottom: Spacing.xs,
  },
  dosage: {
    ...Typography.bodyLarge,
    color: Colors.ink,
    marginBottom: Spacing.xs,
  },
  instructions: {
    ...Typography.bodyMedium,
    color: Colors.inkMuted,
    marginBottom: Spacing.md,
  },
  actionContainer: {
    marginTop: Spacing.md,
  },
  takeButton: {
    minHeight: 60,
    backgroundColor: Colors.brand,
  },
  // Stacked full-width: longer labels ("Remind me in 10 minutes") never wrap or clip
  secondaryRow: {
    flexDirection: 'column',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  halfButton: {
    alignSelf: 'stretch',
    minHeight: 52,
  },
  confirmedBox: {
    backgroundColor: Colors.brandSoft,
    borderRadius: Radii.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  confirmedText: {
    ...Typography.labelMedium,
    color: Colors.success,
    fontWeight: '600',
  },
});
