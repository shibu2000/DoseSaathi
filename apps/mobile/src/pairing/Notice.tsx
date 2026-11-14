import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Radii, Spacing, Typography } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

type Tone = 'error' | 'warning' | 'info' | 'success';

/** Status message that always pairs an icon with text (never colour alone). */
export function Notice({ tone, children, children2 }: { tone: Tone; children: React.ReactNode; children2?: React.ReactNode }) {
  const { colors, isDark } = useTheme();

  const tones: Record<Tone, { icon: React.ComponentProps<typeof MaterialIcons>['name']; color: string; label: string; bg?: string }> = {
    error: { icon: 'error-outline', color: colors.error, label: 'Error', bg: isDark ? 'rgba(204, 102, 91, 0.15)' : '#FDF3F2' },
    warning: { icon: 'warning-amber', color: colors.warning, label: 'Notice', bg: isDark ? 'rgba(217, 154, 54, 0.15)' : '#FDF9F0' },
    info: { icon: 'info-outline', color: colors.info, label: 'Info', bg: isDark ? 'rgba(76, 134, 184, 0.15)' : '#F0F6FB' },
    success: { icon: 'check-circle', color: colors.success, label: 'Done', bg: isDark ? 'rgba(37, 132, 93, 0.15)' : '#F0F9F5' },
  };

  const t = tones[tone];
  return (
    <View
      style={[
        styles.box,
        {
          borderColor: t.color,
          backgroundColor: t.bg || colors.surface,
        },
      ]}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
    >
      <MaterialIcons name={t.icon} size={22} color={t.color} accessibilityLabel={t.label} />
      <View style={styles.body}>
        <Text style={[styles.text, { color: colors.textPrimary }]}>{children}</Text>
        {children2}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderRadius: Radii.card,
    padding: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  body: { flex: 1 },
  text: { ...Typography.bodyMedium },
});
