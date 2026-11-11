import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/tokens';
import { StatusTag, StatusVariant } from './StatusTag';
import { Ionicons } from '@expo/vector-icons';

interface MedicationRowProps {
  name: string;
  dosage: string;
  scheduleText: string;
  statusLabel: string;
  statusVariant: StatusVariant;
  stockText?: string;
  onPress: () => void;
}

export function MedicationRow({
  name,
  dosage,
  scheduleText,
  statusLabel,
  statusVariant,
  stockText,
  onPress,
}: MedicationRowProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${dosage}, ${scheduleText}, ${statusLabel}`}
    >
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <StatusTag label={statusLabel} variant={statusVariant} />
        </View>

        <Text style={styles.dosage}>{dosage}</Text>
        <Text style={styles.scheduleText}>{scheduleText}</Text>

        {stockText && (
          <View style={styles.stockRow}>
            <Text style={styles.stockText}>{stockText}</Text>
          </View>
        )}
      </View>
      <View style={styles.chevronContainer}>
        <Ionicons name="chevron-forward" size={18} color={Colors.inkMuted} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.lg,
    marginVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  name: {
    ...Typography.bodyLarge,
    fontWeight: '700',
    color: Colors.ink,
    flex: 1,
    flexBasis: 140,
    marginRight: Spacing.sm,
  },
  dosage: {
    ...Typography.bodyMedium,
    color: Colors.ink,
    marginBottom: Spacing.xs,
  },
  scheduleText: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
  },
  stockRow: {
    marginTop: Spacing.xs,
  },
  stockText: {
    ...Typography.labelSmall,
    color: Colors.warning,
  },
  chevronContainer: {
    paddingLeft: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevron: {
    fontSize: 24,
    color: Colors.outline,
    fontWeight: 'bold',
  },
});
