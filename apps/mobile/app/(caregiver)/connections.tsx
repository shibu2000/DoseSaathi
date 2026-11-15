import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { AppScreen } from '@/components/AppScreen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PrimaryButton, DestructiveButton } from '@/components/Buttons';
import { Spacing, Typography, Radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { useApp } from '@/state/AppContext';
import { Notice } from '@/pairing/Notice';
import { describeError } from '@/pairing/errors';
import { describePermissions } from '@/pairing/permissions';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown date';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function CaregiverConnectionsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { api, caregiver, relationships, selectedRelationship, setSelectedRelationship, refreshRelationships, relationshipsStale, relationshipsSyncedAt } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [listError, setListError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const active = relationships.filter((r) => r.status === 'ACTIVE');

  const disconnect = async (id: string) => {
    setBusyId(id);
    setErrors((e) => {
      const { [id]: _drop, ...rest } = e;
      return rest;
    });
    try {
      await api.disconnectRelationship(id);
      if (selectedRelationship?.relationshipId === id) setSelectedRelationship(null);
      try {
        await refreshRelationships();
      } catch (e) {
        if (mounted.current) setListError(describeError(e).message);
      }
    } catch (e) {
      if (mounted.current) setErrors((prev) => ({ ...prev, [id]: describeError(e).message }));
    } finally {
      if (mounted.current) setBusyId(null);
    }
  };

  const confirm = (id: string, name: string) => {
    Alert.alert(
      `Disconnect from ${name}?`,
      `You will stop seeing ${name}'s medicines and dose activity. Their own medicines are not deleted. They can connect you again later.`,
      [
        { text: 'Stay connected', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: () => disconnect(id) },
      ]
    );
  };

  return (
    <AppScreen>
      <ScreenHeader title="Manage connections" subtitle="People you can see on DoseSaathi." showBack />

      {!caregiver && (
        <Notice tone="info">
          Connect with a family member to see your connections.
        </Notice>
      )}
      {!caregiver && (
        <PrimaryButton title="Connect a family member" onPress={() => router.push('/(caregiver)/connect')} />
      )}

      {caregiver && relationshipsStale && (
        <Notice tone="warning">
          Showing the last list we received{relationshipsSyncedAt ? ` (${new Date(relationshipsSyncedAt).toLocaleString()})` : ''}. We could not reach the server just now.
        </Notice>
      )}
      {listError && <Notice tone="error">{listError}</Notice>}

      {caregiver && active.length === 0 && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>No connections yet</Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>Connect to a family member to see their medicine schedule.</Text>
        </View>
      )}

      {active.map((r) => (
        <View key={r.relationshipId} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{r.patientDisplayName}</Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {r.relationshipLabel ? `${r.relationshipLabel} · ` : ''}Connected {formatDate(r.confirmedAt)}
          </Text>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>What you can do</Text>
          {describePermissions(r.permissions, 'caregiver').map((t) => (
            <View key={t} style={styles.permRow}>
              <MaterialIcons name="check" size={18} color={colors.success} />
              <Text style={[styles.body, { color: colors.textPrimary }]}>{t}</Text>
            </View>
          ))}
          {errors[r.relationshipId] && (
            <Notice tone="error">{`${errors[r.relationshipId]} The connection is still active.`}</Notice>
          )}
          <DestructiveButton
            title={errors[r.relationshipId] ? 'Try again' : 'Disconnect'}
            loading={busyId === r.relationshipId}
            disabled={busyId !== null}
            onPress={() => confirm(r.relationshipId, r.patientDisplayName)}
          />
        </View>
      ))}

      {caregiver && (
        <PrimaryButton title="Connect another family member" icon="add" onPress={() => router.push('/(caregiver)/connect')} />
      )}
      <Text style={[styles.footnote, { color: colors.textSecondary }]}>
        Disconnecting only ends your access. It does not delete or change the patient's own medicines.
      </Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.xl,
    marginVertical: Spacing.sm,
  },
  name: { ...Typography.headlineSmall },
  muted: { ...Typography.bodyMedium, marginTop: Spacing.xs },
  body: { ...Typography.bodyMedium, flex: 1 },
  sectionLabel: { ...Typography.labelSmall, marginTop: Spacing.lg, marginBottom: Spacing.xs },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 32 },
  footnote: { ...Typography.bodySmall, marginTop: Spacing.md, textAlign: 'center' },
});
