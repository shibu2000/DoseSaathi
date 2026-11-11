import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AppScreen } from '@/components/AppScreen';
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
import { useApp } from '@/state/AppContext';
import { MedChainLogo } from '@/components/MedChainLogo';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

export default function WelcomeScreen() {
  const router = useRouter();
  const { setMode } = useApp();

  const handlePatientMode = () => {
    setMode('personal');
    router.push('/(onboarding)');
  };

  const handleCaregiverMode = () => {
    setMode('caregiver');
    router.push('/(caregiver)/connect');
  };

  return (
    <AppScreen scrollable={true}>
      <View style={styles.container}>
        {/* Brand Header Mark */}
        <View style={styles.header}>
          <MedChainLogo size={44} color={Colors.brand} />
          <Text style={styles.title}>Welcome to DoseSaathi</Text>
          <Text style={styles.subtitle}>
            Medication care, made simpler for you and your family.
          </Text>
        </View>

        {/* Pathway Selection Cards */}
        <View style={styles.cardsContainer}>
          {/* Option 1: Personal Medication Pathway */}
          <TouchableOpacity
            style={styles.modeCard}
            onPress={handlePatientMode}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Manage my medications. Set schedules, track doses, works offline. Get started."
          >
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <MaterialIcons name="medication" size={26} color={Colors.brand} />
              </View>
              <View style={styles.headerTitleRow}>
                <Text style={styles.cardTitle}>Manage my medications</Text>
                <View style={styles.primaryDot} />
              </View>
            </View>
            <Text style={styles.cardDescription}>
              Create medication schedules, track doses, and receive reminders. Works offline.
            </Text>
            <View style={styles.primaryActionBtn}>
              <Text style={styles.primaryActionText}>Get started</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          {/* Option 2: Family Caregiver Pathway */}
          <TouchableOpacity
            style={styles.modeCard}
            onPress={handleCaregiverMode}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Connect with family. Link to a family member's device to coordinate care."
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconCircle, styles.caregiverCircle]}>
                <MaterialIcons name="groups" size={26} color={Colors.brand} />
              </View>
              <View style={styles.headerTitleRow}>
                <Text style={styles.cardTitle}>Connect with family</Text>
              </View>
            </View>
            <Text style={styles.cardDescription}>
              Link to a family member's device and help manage their medication schedules.
            </Text>
            <View style={styles.secondaryActionBtn}>
              <MaterialIcons name="qr-code-scanner" size={18} color={Colors.ink} />
              <Text style={styles.secondaryActionText}>Pair with device</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Reassurance & Privacy Affirmation */}
        <View style={styles.footer}>
          <View style={styles.reassuranceRow}>
            <MaterialIcons name="lock" size={16} color={Colors.inkMuted} />
            <Text style={styles.reassuranceLabel}>No account required</Text>
          </View>
          <Text style={styles.reassuranceText}>
            Your medicine schedules are stored on this phone. They are shared only with family members you connect.
          </Text>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: Spacing.sm,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  brandCaption: {
    ...Typography.labelSmall,
    color: Colors.inkMuted,
    letterSpacing: 1.5,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  title: {
    marginTop: Spacing.md,
    ...Typography.headlineLarge,
    color: Colors.ink,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.bodyMedium,
    color: Colors.inkMuted,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 22,
  },
  cardsContainer: {
    gap: Spacing.md,
    marginVertical: Spacing.md,
  },
  modeCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radii.md,
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caregiverCircle: {
    backgroundColor: Colors.surfaceMuted,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    flexShrink: 1,
    ...Typography.headlineSmall,
    color: Colors.ink,
  },
  primaryDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.brand,
    marginLeft: Spacing.xs,
  },
  cardDescription: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  primaryActionBtn: {
    minHeight: 52,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.brand,
    borderRadius: Radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  primaryActionText: {
    flexShrink: 1,
    textAlign: 'center',
    ...Typography.labelLarge,
    color: Colors.white,
    fontWeight: '600',
  },
  secondaryActionBtn: {
    minHeight: 52,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  secondaryActionText: {
    flexShrink: 1,
    textAlign: 'center',
    ...Typography.labelLarge,
    color: Colors.ink,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  reassuranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  reassuranceLabel: {
    ...Typography.labelSmall,
    color: Colors.ink,
    fontWeight: '600',
  },
  reassuranceText: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
