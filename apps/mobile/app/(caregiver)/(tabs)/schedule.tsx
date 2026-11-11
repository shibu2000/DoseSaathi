import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/state/AppContext';
import { AppScreen } from '@/components/AppScreen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState } from '@/components/EmptyState';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { Colors, Radii, Spacing, Typography } from '@/theme/tokens';

/** Shortcut to the selected family member's Today. With no one selected it asks to pick someone. */
export default function CaregiverScheduleTabScreen() {
  const router = useRouter();
  const { selectedRelationship, relationships } = useApp();
  const selected = selectedRelationship
    ? relationships.find((r) => r.relationshipId === selectedRelationship.relationshipId && r.status === 'ACTIVE')
    : undefined;

  if (!selected) {
    return (
      <AppScreen>
        <ScreenHeader title="Whose schedule?" />
        <EmptyState
          icon="📅"
          title="Choose a family member"
          description="Pick someone in the Family Hub to see their schedule and manage their medicines."
          buttonTitle="Go to Family Hub"
          onButtonPress={() => router.replace('/(caregiver)/(tabs)/family')}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScreenHeader title="Whose schedule?" subtitle="Open the family member you selected." />
      <View style={styles.card}>
        <Text style={styles.name}>{selected.patientDisplayName}</Text>
        <Text style={styles.label}>{selected.relationshipLabel}</Text>
        <PrimaryButton
          title={`Open ${selected.patientDisplayName}'s schedule`}
          onPress={() => router.push(`/(caregiver)/patient/${selected.relationshipId}/today`)}
        />
        <SecondaryButton title="Choose someone else" onPress={() => router.replace('/(caregiver)/(tabs)/family')} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.xl,
  },
  name: { ...Typography.headlineSmall, color: Colors.ink },
  label: { ...Typography.bodySmall, color: Colors.inkMuted, marginBottom: Spacing.sm },
});
