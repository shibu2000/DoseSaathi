import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/tokens';
import { MaterialIcons } from '@expo/vector-icons';

export type StatusVariant =
  | 'taken'
  | 'due'
  | 'snoozed'
  | 'skipped'
  | 'queued'
  | 'completed'
  | 'lowStock'
  | 'unconfirmed';

interface StatusTagProps {
  label: string;
  variant: StatusVariant;
  icon?: React.ReactNode | string;
}

export function StatusTag({ label, variant, icon }: StatusTagProps) {
  const getStyle = () => {
    switch (variant) {
      case 'taken':
      case 'completed':
        return {
          bg: '#E6FFFA',
          text: Colors.success,
          iconNode: <MaterialIcons name="check" size={13} color={Colors.success} />,
        };
      case 'due':
        return {
          bg: Colors.brandSoft,
          text: Colors.brand,
          iconNode: <MaterialIcons name="schedule" size={13} color={Colors.brand} />,
        };
      case 'snoozed':
      case 'lowStock':
      case 'unconfirmed':
        return {
          bg: '#FDF3E3',
          text: Colors.warning,
          iconNode: <MaterialIcons name="warning" size={13} color={Colors.warning} />,
        };
      case 'skipped':
        return {
          bg: Colors.surfaceMuted,
          text: Colors.inkMuted,
          iconNode: <MaterialIcons name="block" size={13} color={Colors.inkMuted} />,
        };
      case 'queued':
        return {
          bg: Colors.surfaceMuted,
          text: Colors.brand,
          iconNode: <MaterialIcons name="hourglass-empty" size={13} color={Colors.brand} />,
        };
      default:
        return {
          bg: Colors.surfaceMuted,
          text: Colors.ink,
          iconNode: <MaterialIcons name="circle" size={8} color={Colors.inkMuted} />,
        };
    }
  };

  const current = getStyle();

  return (
    <View style={[styles.container, { backgroundColor: current.bg }]}>
      <View style={styles.iconContainer}>
        {icon ? (
          typeof icon === 'string' ? <Text style={styles.rawIcon}>{icon}</Text> : icon
        ) : (
          current.iconNode
        )}
      </View>
      <Text style={[styles.label, { color: current.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 4,
    borderRadius: Radii.full,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  iconContainer: {
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rawIcon: {
    fontSize: 12,
  },
  label: {
    ...Typography.labelSmall,
    fontSize: 12,
    lineHeight: 16,
    includeFontPadding: false,
  },
});
