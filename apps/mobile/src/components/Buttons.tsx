import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { Colors, Spacing, Radii, Typography } from '../theme/tokens';
import { Ionicons } from '@expo/vector-icons';

interface ButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode | string;
}

function resolveIcon(icon?: React.ReactNode | string, color: string = '#FFF'): React.ReactNode {
  const node = resolveIconInner(icon, color);
  // Explicit spacing instead of `gap`, so icon and label always sit the same distance apart
  return node ? <View style={{ marginRight: Spacing.sm, alignItems: 'center', justifyContent: 'center' }}>{node}</View> : null;
}

function resolveIconInner(icon?: React.ReactNode | string, color: string = '#FFF'): React.ReactNode {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  if (icon === '✓' || icon === 'check') {
    return <Ionicons name="checkmark-circle" size={20} color={color} />;
  }
  if (icon === '+' || icon === 'add') {
    return <Ionicons name="add" size={22} color={color} />;
  }
  if (typeof icon === 'string') {
    return <Text style={{ color, fontSize: 16 }}>{icon}</Text>;
  }
  return null;
}

export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const iconNode = resolveIcon(icon, Colors.white);

  return (
    <TouchableOpacity
      style={[
        styles.primaryButton,
        disabled && styles.disabledButton,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator color={Colors.white} />
      ) : (
        <View style={styles.contentRow}>
          {iconNode}
          <Text style={[styles.primaryText, textStyle]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function SecondaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const iconNode = resolveIcon(icon, Colors.brand);

  return (
    <TouchableOpacity
      style={[
        styles.secondaryButton,
        disabled && styles.disabledButton,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator color={Colors.brand} />
      ) : (
        <View style={styles.contentRow}>
          {iconNode}
          <Text style={[styles.secondaryText, textStyle]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function DestructiveButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const iconNode = resolveIcon(icon, Colors.danger);

  return (
    <TouchableOpacity
      style={[
        styles.destructiveButton,
        disabled && styles.disabledButton,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator color={Colors.danger} />
      ) : (
        <View style={styles.contentRow}>
          {iconNode}
          <Text style={[styles.destructiveText, textStyle]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // The row fills the button's inner width (alignSelf: 'stretch') so the label is measured against a
  // definite width. A shrink-wrapped row + shrinkable text made Android wrap the last letter ("Bac/k").
  contentRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: Colors.brand,
    minHeight: 56,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.card,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  primaryText: {
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    ...Typography.labelLarge,
    color: Colors.white,
  },
  secondaryButton: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
    borderWidth: 1.5,
    minHeight: 54,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.card,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  secondaryText: {
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    ...Typography.labelLarge,
    color: Colors.brand,
  },
  destructiveButton: {
    backgroundColor: 'transparent',
    borderColor: Colors.danger,
    borderWidth: 1.5,
    minHeight: 52,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.card,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  destructiveText: {
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    ...Typography.labelMedium,
    color: Colors.danger,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
