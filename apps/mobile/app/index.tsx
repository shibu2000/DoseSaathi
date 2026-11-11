import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
import { useApp } from '@/state/AppContext';
import { MedChainLogo } from '@/components/MedChainLogo';

export default function SplashScreen() {
  const router = useRouter();
  const { isOnboarded, mode, isReady } = useApp();

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
  }, [isOnboarded, mode, isReady]);

  return (
    <View style={styles.container}>
      <View style={styles.brandContainer}>
        <View style={styles.logoBadge}>
          <MedChainLogo size={48} color={Colors.brand} />
        </View>
        <Text style={styles.title}>DoseSaathi</Text>
        <Text style={styles.subtitle}>
          Personal and family medication management, designed to work offline.
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Works offline</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
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
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: Radii.card,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.display,
    color: Colors.primary,
    marginBottom: Spacing.sm,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...Typography.bodyLarge,
    color: Colors.inkMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 26,
  },
  footer: {
    paddingBottom: Spacing.lg,
  },
  footerText: {
    ...Typography.labelSmall,
    color: Colors.inkMuted,
    letterSpacing: 0.5,
  },
});
