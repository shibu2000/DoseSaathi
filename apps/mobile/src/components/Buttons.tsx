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
import { Colors, Spacing, Radii, Typography, FontFamily, scaleFont } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
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
  const { colors, isGlass, glassStyles } = useTheme();
  const iconNode = resolveIcon(icon, colors.white);

  return (
    <TouchableOpacity
      style={[
        styles.primaryButton,
        { backgroundColor: isGlass ? colors.glassButtonBg : colors.brand },
        isGlass && glassStyles.button,
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
        <ActivityIndicator color={colors.white} />
      ) : (
        <View style={styles.contentRow}>
          {iconNode}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={[styles.primaryText, textStyle]}
          >
            {title}
          </Text>
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
  const { colors, isGlass, glassStyles } = useTheme();
  const iconNode = resolveIcon(icon, colors.brand);

  return (
    <TouchableOpacity
      style={[
        styles.secondaryButton,
        {
          backgroundColor: isGlass ? colors.glassSecondaryBg : colors.surface,
          borderColor: isGlass ? colors.cardBorder : colors.outline,
        },
        isGlass && glassStyles.secondaryButton,
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
        <ActivityIndicator color={colors.brand} />
      ) : (
        <View style={styles.contentRow}>
          {iconNode}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={[styles.secondaryText, { color: colors.brand }, textStyle]}
          >
            {title}
          </Text>
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
  const { colors, isGlass } = useTheme();
  const iconNode = resolveIcon(icon, colors.danger);

  return (
    <TouchableOpacity
      style={[
        styles.destructiveButton,
        {
          backgroundColor: isGlass ? 'rgba(163, 62, 56, 0.08)' : 'transparent',
          borderColor: colors.danger,
        },
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
        <ActivityIndicator color={colors.danger} />
      ) : (
        <View style={styles.contentRow}>
          {iconNode}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={[styles.destructiveText, { color: colors.danger }, textStyle]}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function IconButton({
  icon,
  onPress,
  disabled = false,
  style,
  accessibilityLabel,
}: {
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel: string;
}) {
  const { colors, isDark } = useTheme();
  return (
    <TouchableOpacity
      style={[
        {
          width: 44,
          height: 44,
          borderRadius: Radii.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceSecondary,
        },
        disabled && styles.disabledButton,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {icon}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(16),
    lineHeight: scaleFont(22),
    color: Colors.white,
    flexShrink: 1,
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
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(15),
    lineHeight: scaleFont(21),
    color: Colors.brand,
    flexShrink: 1,
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
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(15),
    lineHeight: scaleFont(20),
    color: Colors.danger,
    flexShrink: 1,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
