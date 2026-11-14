import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radii, Spacing, scaleFont } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
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
  const { colors, isGlass } = useTheme();

  const getStyle = () => {
    switch (variant) {
      case 'taken':
      case 'completed':
        return {
          bg: isGlass ? 'rgba(47, 107, 79, 0.12)' : '#E6FFFA',
          text: colors.success,
          iconNode: <MaterialIcons name="check" size={13} color={colors.success} />,
        };
      case 'due':
        return {
          bg: isGlass ? 'rgba(30, 88, 77, 0.14)' : colors.brandSoft,
          text: colors.brand,
          iconNode: <MaterialIcons name="schedule" size={13} color={colors.brand} />,
        };
      case 'snoozed':
      case 'lowStock':
      case 'unconfirmed':
        return {
          bg: isGlass ? 'rgba(215, 154, 53, 0.14)' : '#FDF3E3',
          text: colors.warning,
          iconNode: <MaterialIcons name="warning" size={13} color={colors.warning} />,
        };
      case 'skipped':
        return {
          bg: isGlass ? 'rgba(120, 130, 125, 0.14)' : colors.surfaceMuted,
          text: colors.inkMuted,
          iconNode: <MaterialIcons name="block" size={13} color={colors.inkMuted} />,
        };
      case 'queued':
        return {
          bg: isGlass ? 'rgba(30, 88, 77, 0.10)' : colors.surfaceMuted,
          text: colors.brand,
          iconNode: <MaterialIcons name="hourglass-empty" size={13} color={colors.brand} />,
        };
      default:
        return {
          bg: isGlass ? 'rgba(120, 130, 125, 0.1)' : colors.surfaceMuted,
          text: colors.ink,
          iconNode: <MaterialIcons name="circle" size={8} color={colors.inkMuted} />,
        };
    }
  };

  const current = getStyle();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: current.bg,
          borderColor: isGlass ? 'rgba(255, 255, 255, 0.75)' : 'transparent',
          borderWidth: isGlass ? 1 : 0,
        },
      ]}
    >
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
    fontSize: scaleFont(12.5),
    fontWeight: '700',
    lineHeight: scaleFont(17),
  },
});
