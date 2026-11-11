import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/tokens';

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
  return (
    <View style={styles.bar}>
      <View style={styles.textContainer}>
        <Text style={styles.prefix}>Managing medicines for</Text>
        <Text style={styles.name}>
          {patientName} ({relationshipLabel})
        </Text>
      </View>
      {onSwitch && (
        <TouchableOpacity
          onPress={onSwitch}
          style={styles.switchButton}
          accessibilityRole="button"
          accessibilityLabel="Switch family member"
        >
          <Text style={styles.switchText}>Switch</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: Colors.brandSoft,
    borderColor: Colors.outline,
    borderWidth: 1,
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
    color: Colors.brand,
  },
  name: {
    ...Typography.labelMedium,
    color: Colors.primary,
    fontWeight: '700',
  },
  switchButton: {
    paddingHorizontal: Spacing.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  switchText: {
    ...Typography.labelSmall,
    color: Colors.brand,
    textDecorationLine: 'underline',
  },
});
