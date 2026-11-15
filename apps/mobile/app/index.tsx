import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Spacing, Typography, Radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { useApp } from '@/state/AppContext';
import { MedChainLogo } from '@/components/MedChainLogo';

export default function SplashScreen() {
  const router = useRouter();
  const { isOnboarded, mode, isReady } = useApp();
  const { colors } = useTheme();

  useEffect(() => {
    if (!isReady) return;

    const timer = setTimeout(() => {
      if (!isOnboarded) {
        router.replace('/welcome');
      } else if (mode === 'caregiver') {
        router.replace('/(caregiver)/(tabs)/family');
      } else {
        router.replace('/(patient)/(tabs)/today');
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [isOnboarded, mode, isReady, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.canvas }]}>
      <View style={styles.brandContainer}>
        <MedChainLogo size={76} style={{ marginBottom: Spacing.xl }} />
        <Text style={[styles.title, { color: colors.primary }]}>DoseSaathi</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Personal and family medication management, designed to work offline.
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>Works offline</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.huge,
    paddingHorizontal: Spacing.xxl,
  },
  brandContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Typography.display,
    marginBottom: Spacing.sm,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...Typography.bodyLarge,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 26,
  },
  footer: {
    paddingBottom: Spacing.lg,
  },
  footerText: {
    ...Typography.labelSmall,
    letterSpacing: 0.5,
  },
});
