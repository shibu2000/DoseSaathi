import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Radii, Spacing, Typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

interface PatientContextBarProps {
  patientName: string;
  relationshipLabel: string;
  onSwitch?: () => void;
}

export function PatientContextBar({
  patientName,
  relationshipLabel,
  onSwitch,
}: PatientContextBarProps) {
  const { colors, isGlass, glassStyles } = useTheme();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: isGlass ? colors.cardBackground : colors.brandSoft,
          borderColor: isGlass ? colors.cardBorder : colors.outline,
          borderWidth: isGlass ? 1.5 : 1,
        },
        isGlass && glassStyles.card,
      ]}
    >
      <View style={styles.textContainer}>
        <Text style={[styles.prefix, { color: colors.brand }]}>Managing medicines for</Text>
        <Text style={[styles.name, { color: colors.primary }]}>
          {patientName} ({relationshipLabel})
        </Text>
      </View>
      {onSwitch && (
        <TouchableOpacity
          onPress={onSwitch}
          style={[
            styles.switchButton,
            {
              backgroundColor: isGlass ? 'rgba(255, 255, 255, 0.8)' : colors.surface,
              borderColor: isGlass ? 'rgba(255, 255, 255, 0.95)' : colors.outline,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Switch family member"
        >
          <Text style={[styles.switchText, { color: colors.brand }]}>Switch</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  prefix: {
    ...Typography.labelSmall,
  },
  name: {
    ...Typography.labelMedium,
    fontWeight: '700',
  },
  switchButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radii.sm,
    borderWidth: 1,
  },
  switchText: {
    ...Typography.labelSmall,
    fontWeight: '600',
  },
});
