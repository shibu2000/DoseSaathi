import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AppScreen } from '@/components/AppScreen';
import { Spacing, Typography, Radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { useApp } from '@/state/AppContext';
import { MedChainLogo } from '@/components/MedChainLogo';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

export default function WelcomeScreen() {
  const router = useRouter();
  const { setMode } = useApp();
  const { colors, isGlass, glassStyles } = useTheme();

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
          <MedChainLogo size={56} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Welcome to DoseSaathi</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Medication care, made simpler for you and your family.
          </Text>
        </View>

        {/* Pathway Selection Cards */}
        <View style={styles.cardsContainer}>
          {/* Option 1: Personal Medication Pathway */}
          <TouchableOpacity
            style={[
              styles.modeCard,
              {
                backgroundColor: isGlass ? colors.cardBackground : colors.surface,
                borderColor: isGlass ? colors.cardBorder : colors.border,
                borderWidth: isGlass ? 1.5 : 1,
              },
              isGlass && glassStyles.card,
            ]}
            onPress={handlePatientMode}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Manage my medications. Set schedules, track doses, works offline. Get started."
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconCircle, { backgroundColor: colors.brandSoft }]}>
                <MaterialIcons name="medication" size={26} color={colors.primary} />
              </View>
              <View style={styles.headerTitleRow}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Manage my medications</Text>
                <View style={[styles.primaryDot, { backgroundColor: colors.primary }]} />
              </View>
            </View>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
              Create medication schedules, track doses, and receive reminders. Works offline.
            </Text>
            <View style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}>
              <Text style={[styles.primaryActionText, { color: colors.white }]}>Get started</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.white} />
            </View>
          </TouchableOpacity>

          {/* Option 2: Family Caregiver Pathway */}
          <TouchableOpacity
            style={[
              styles.modeCard,
              {
                backgroundColor: isGlass ? colors.cardBackground : colors.surface,
                borderColor: isGlass ? colors.cardBorder : colors.border,
                borderWidth: isGlass ? 1.5 : 1,
              },
              isGlass && glassStyles.card,
            ]}
            onPress={handleCaregiverMode}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Connect with family. Link to a family member's device to coordinate care."
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSecondary }]}>
                <MaterialIcons name="groups" size={26} color={colors.primary} />
              </View>
              <View style={styles.headerTitleRow}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Connect with family</Text>
              </View>
            </View>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
              Link to a family member's device and help manage their medication schedules.
            </Text>
            <View
              style={[
                styles.secondaryActionBtn,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderColor: colors.border,
                  borderWidth: 1,
                },
              ]}
            >
              <MaterialIcons name="qr-code-scanner" size={18} color={colors.textPrimary} />
              <Text style={[styles.secondaryActionText, { color: colors.textPrimary }]}>Pair with device</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Reassurance & Privacy Affirmation */}
        <View style={styles.footer}>
          <View style={styles.reassuranceRow}>
            <MaterialIcons name="lock" size={16} color={colors.textSecondary} />
            <Text style={[styles.reassuranceLabel, { color: colors.textPrimary }]}>No account required</Text>
          </View>
          <Text style={[styles.reassuranceText, { color: colors.textSecondary }]}>
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
  title: {
    marginTop: Spacing.md,
    ...Typography.headlineLarge,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 22,
  },
  cardsContainer: {
    gap: Spacing.md,
    marginVertical: Spacing.md,
  },
  modeCard: {
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
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  primaryDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginLeft: Spacing.xs,
  },
  cardDescription: {
    ...Typography.bodySmall,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  primaryActionBtn: {
    minHeight: 52,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  primaryActionText: {
    textAlign: 'center',
    ...Typography.labelLarge,
  },
  secondaryActionBtn: {
    minHeight: 52,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  secondaryActionText: {
    textAlign: 'center',
    ...Typography.labelLarge,
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
    fontWeight: '600',
  },
  reassuranceText: {
    ...Typography.bodySmall,
    textAlign: 'center',
    lineHeight: 20,
  },
});
