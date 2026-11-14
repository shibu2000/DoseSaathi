import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Spacing, Typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightAction,
}: ScreenHeaderProps) {
  const router = useRouter();
  const { colors, isGlass } = useTheme();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        {showBack && (
          <TouchableOpacity
            style={[
              styles.backButton,
              isGlass && {
                backgroundColor: 'rgba(255, 255, 255, 0.75)',
                borderColor: 'rgba(255, 255, 255, 0.9)',
                borderWidth: 1,
                borderRadius: 22,
              },
            ]}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color={colors.ink} />
          </TouchableOpacity>
        )}
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: colors.ink }]} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {rightAction && <View style={styles.rightAction}>{rightAction}</View>}
      </View>
      {subtitle && <Text style={[styles.subtitle, { color: colors.inkMuted }]}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
    marginLeft: 0,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    ...Typography.headlineLarge,
  },
  subtitle: {
    ...Typography.bodyMedium,
    marginTop: Spacing.xs,
  },
  rightAction: {
    marginLeft: Spacing.sm,
  },
});
