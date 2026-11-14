import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
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
  const { colors, isGlass, glassStyles } = useTheme();

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
      <View style={styles.headerRow}>
        <View
          style={[
            styles.timeBadge,
            {
              backgroundColor: isGlass ? 'rgba(255, 255, 255, 0.85)' : colors.brandSoft,
              borderColor: isGlass ? 'rgba(255, 255, 255, 0.95)' : 'transparent',
              borderWidth: isGlass ? 1 : 0,
            },
          ]}
        >
          <Text style={[styles.timeText, { color: colors.primary }]}>{timeStr}</Text>
        </View>
        <StatusTag label={statusLabel} variant={statusVariant} />
      </View>

      <Text style={[styles.medName, { color: colors.ink }]}>{medicationName}</Text>
      <Text style={[styles.dosage, { color: colors.ink }]}>{dosageText}</Text>
      {instructions && <Text style={[styles.instructions, { color: colors.inkMuted }]}>{instructions}</Text>}

      {!isTaken ? (
        <View style={styles.actionContainer}>
          <PrimaryButton
            title="Mark as taken"
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
        <View
          style={[
            styles.confirmedBox,
            {
              backgroundColor: isGlass ? 'rgba(47, 107, 79, 0.12)' : colors.brandSoft,
              borderColor: isGlass ? 'rgba(255, 255, 255, 0.7)' : 'transparent',
              borderWidth: isGlass ? 1 : 0,
            },
          ]}
        >
          <Text style={[styles.confirmedText, { color: colors.success }]}>✓ Recorded as taken</Text>
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
  },
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
