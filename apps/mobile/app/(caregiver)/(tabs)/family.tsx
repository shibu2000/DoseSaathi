import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { EmptyState } from '@/components/EmptyState';
import { Spacing, Typography, Radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { useApp } from '@/state/AppContext';
import { Notice, RefreshableScreen } from '@/caregiver/ui';
import { describeDeviceStatus, formatRelativeTime } from '@/caregiver/command-state';
import type { RelationshipSummary } from '@medchain/contracts';

function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return letters || '?';
}

export default function FamilyHubScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { relationships, refreshRelationships, setSelectedRelationship, relationshipsStale, relationshipsSyncedAt, caregiver } = useApp();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const active = relationships.filter((r) => r.status === 'ACTIVE');

  const handleOpenPatient = (rel: RelationshipSummary) => {
    setSelectedRelationship({
      relationshipId: rel.relationshipId,
      patientName: rel.patientDisplayName,
      relationshipLabel: rel.relationshipLabel,
      permissions: rel.permissions,
    });
    router.push(`/(caregiver)/patient/${rel.relationshipId}/today`);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshRelationships();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <RefreshableScreen refreshing={isRefreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title={active.length > 0 ? 'People you care for' : 'Connect with family'}
      />

      {relationshipsStale ? (
        <Notice icon="cloud-offline-outline" title={`Last updated ${formatRelativeTime(relationshipsSyncedAt) ?? 'earlier'}`}>
          Can't reach DoseSaathi right now, so this is the last copy saved on your phone. Pull down to try again.
        </Notice>
      ) : null}

      {active.length === 0 ? (
        <EmptyState
          icon="👪"
          title="No one connected yet"
          description={
            caregiver
              ? "Connect with a family member's phone to see their schedule and help manage their medicines. They stay in control and approve what you can see."
              : 'Connect with a family member to see their schedule and help manage their medicines. No account required.'
          }
          buttonTitle="Connect a family member"
          onButtonPress={() => router.push('/(caregiver)/connect')}
        />
      ) : (
        active.map((rel) => {
          const device = describeDeviceStatus(rel.deviceLastSeenAt, rel.lastSyncedAt);
          const waiting = rel.latestPlanVersion > rel.lastAppliedVersion;
          const canEdit = rel.permissions.includes('EDIT_SCHEDULE');
          const accessText = canEdit ? 'Can edit medicines' : rel.permissions.includes('VIEW_SCHEDULE') ? 'View only' : 'Limited access';
          return (
            <TouchableOpacity
              key={rel.relationshipId}
              style={[
                styles.memberCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => handleOpenPatient(rel)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${rel.patientDisplayName}, ${rel.relationshipLabel}. ${accessText}. Phone: ${device.text}.${waiting ? ' A change is waiting for the phone to connect.' : ''} Opens their schedule.`}
            >
              <View style={styles.topRow}>
                <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>{initialsOf(rel.patientDisplayName)}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={[styles.memberName, { color: colors.textPrimary }]}>{rel.patientDisplayName}</Text>
                  <Text style={[styles.relationshipLabel, { color: colors.textSecondary }]}>{rel.relationshipLabel}</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
              </View>

              <View style={styles.statusRow}>
                <Ionicons
                  name={device.state === 'recent' ? 'phone-portrait-outline' : device.state === 'never' ? 'help-circle-outline' : 'time-outline'}
                  size={18}
                  color={device.state === 'recent' ? colors.success : colors.warning}
                />
                <Text style={[styles.statusText, { color: device.state === 'recent' ? colors.success : colors.warning }]}>{device.text}</Text>
              </View>

              {waiting ? (
                <View style={styles.statusRow}>
                  <Ionicons name="hourglass-outline" size={18} color={colors.primary} />
                  <Text style={[styles.statusText, { color: colors.primary }]}>Waiting for the phone to connect</Text>
                </View>
              ) : null}

              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.statusRow}>
                <Ionicons name={canEdit ? 'create-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
                <Text style={[styles.accessText, { color: colors.textSecondary }]}>{accessText}</Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      <View style={styles.actionsBlock}>
        <SecondaryButton title="Refresh" onPress={handleRefresh} loading={isRefreshing} icon={<Ionicons name="refresh" size={18} color={colors.primary} />} />
        {active.length > 0 ? <PrimaryButton title="Connect another family member" onPress={() => router.push('/(caregiver)/connect')} icon="+" /> : null}
        <SecondaryButton title="Manage connections" onPress={() => router.push('/(caregiver)/connections')} />
      </View>
    </RefreshableScreen>
  );
}

const styles = StyleSheet.create({
  memberCard: {
    borderWidth: 1.5,
    borderRadius: Radii.card,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    minHeight: 48,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarText: { ...Typography.labelMedium, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { ...Typography.headlineSmall },
  relationshipLabel: { ...Typography.bodySmall },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  statusText: { ...Typography.bodySmall, fontWeight: '600', flexShrink: 1 },
  divider: { height: 1, marginVertical: Spacing.sm },
  accessText: { ...Typography.bodySmall },
  actionsBlock: { gap: Spacing.xs, marginTop: Spacing.md },
});
