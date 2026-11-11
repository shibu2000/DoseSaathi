import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '@/theme/tokens';
import { ALL_PERMISSIONS, PairingPermission, togglePermission } from './permissions';

interface Props {
  value: PairingPermission[];
  onChange: (next: PairingPermission[]) => void;
  labels: Record<PairingPermission, string>;
  disabled?: boolean;
}

export function PermissionToggles({ value, onChange, labels, disabled }: Props) {
  return (
    <View>
      {ALL_PERMISSIONS.map((p) => {
        const on = value.includes(p);
        return (
          <View key={p} style={styles.row}>
            <Text style={styles.label}>{labels[p]}</Text>
            <Switch
              value={on}
              disabled={disabled}
              onValueChange={() => onChange(togglePermission(value, p))}
              trackColor={{ false: Colors.outline, true: Colors.brand }}
              thumbColor={Colors.white}
              accessibilityLabel={`${labels[p]}: ${on ? 'on' : 'off'}`}
            />
          </View>
        );
      })}
      <Text style={styles.hint}>Changing medicines also needs seeing the schedule.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  label: { ...Typography.bodyMedium, flex: 1, color: Colors.ink },
  hint: { ...Typography.bodySmall, marginTop: Spacing.xs },
});
