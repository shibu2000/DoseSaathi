import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { Radii, Spacing, Typography } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { ALL_PERMISSIONS, PairingPermission, togglePermission } from './permissions';

interface Props {
  value: PairingPermission[];
  onChange: (next: PairingPermission[]) => void;
  labels: Record<PairingPermission, string>;
  disabled?: boolean;
}

export function PermissionToggles({ value, onChange, labels, disabled }: Props) {
  const { colors } = useTheme();

  return (
    <View>
      {ALL_PERMISSIONS.map((p) => {
        const on = value.includes(p);
        return (
          <View key={p} style={styles.row}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>{labels[p]}</Text>
            <Switch
              value={on}
              disabled={disabled}
              onValueChange={() => onChange(togglePermission(value, p))}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.white}
              accessibilityLabel={`${labels[p]}: ${on ? 'on' : 'off'}`}
            />
          </View>
        );
      })}
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Changing medicines also needs seeing the schedule.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  label: { ...Typography.bodyMedium, flex: 1 },
  hint: { ...Typography.bodySmall, marginTop: Spacing.xs },
});
