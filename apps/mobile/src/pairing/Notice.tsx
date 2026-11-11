import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '@/theme/tokens';

type Tone = 'error' | 'warning' | 'info' | 'success';

const TONES: Record<Tone, { icon: React.ComponentProps<typeof MaterialIcons>['name']; color: string; label: string }> = {
  error: { icon: 'error-outline', color: Colors.danger, label: 'Error' },
  warning: { icon: 'warning-amber', color: Colors.warning, label: 'Notice' },
  info: { icon: 'info-outline', color: Colors.inkMuted, label: 'Info' },
  success: { icon: 'check-circle', color: Colors.success, label: 'Done' },
};

/** Status message that always pairs an icon with text (never colour alone). */
export function Notice({ tone, children, children2 }: { tone: Tone; children: React.ReactNode; children2?: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <View style={[styles.box, { borderColor: t.color }]} accessibilityRole={tone === 'error' ? 'alert' : undefined}>
      <MaterialIcons name={t.icon} size={22} color={t.color} accessibilityLabel={t.label} />
      <View style={styles.body}>
        <Text style={styles.text}>{children}</Text>
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
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderRadius: Radii.card,
    padding: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  body: { flex: 1 },
  text: { ...Typography.bodyMedium, color: Colors.ink },
});
