import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { AppScreen } from '@/components/AppScreen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PrimaryButton, SecondaryButton, DestructiveButton } from '@/components/Buttons';
import { Spacing, Typography, Radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { useApp } from '@/state/AppContext';
import { Notice } from '@/pairing/Notice';
import { FormField } from '@/components/FormField';
import { ApiError } from '@/sync';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export default function CaregiverProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { caregiver, caregiverLoading, signOutCaregiver, deleteCaregiverAccount } = useApp();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const runDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCaregiverAccount(deletePassword);
      setDeleteOpen(false);
      setDeletePassword('');
      router.replace('/welcome');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_CREDENTIALS') setDeleteError('That password is not correct.');
      else if (e instanceof ApiError && e.code === 'RATE_LIMITED') setDeleteError('Too many attempts. Please wait a few minutes and try again.');
      else if (e instanceof ApiError && e.isNetwork) setDeleteError('Could not reach the server. Your account was not deleted.');
      else setDeleteError('Your account could not be deleted. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    if (!deletePassword) {
      setDeleteError('Enter your password to confirm.');
      return;
    }
    Alert.alert(
      'Delete your account?',
      'Your account, your connections to family members and the plan changes you sent are permanently deleted from the server. Medicines on your family members\' phones are not deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: runDelete },
      ]
    );
  };
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setSigningOut(true);
    setError(null);
    try {
      await signOutCaregiver();
      router.replace('/welcome');
    } catch {
      setError("Couldn't sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  const isAnonymousDevice = caregiver?.email?.includes('@dosesaathi.app');

  return (
    <AppScreen>
      <ScreenHeader title="Your account" subtitle="Caregiver account and app settings" />

      {caregiver ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={[styles.avatarText, { color: colors.primary }]}>{initials(caregiver.displayName)}</Text>
          </View>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{caregiver.displayName}</Text>
          <Text style={[styles.email, { color: colors.textSecondary }]}>
            {isAnonymousDevice ? 'Device Paired Caregiver' : caregiver.email}
          </Text>
        </View>
      ) : caregiverLoading ? (
        <Text style={[styles.email, { color: colors.textSecondary }]}>Loading...</Text>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>You're not connected</Text>
          <Text style={[styles.email, { color: colors.textSecondary, marginBottom: Spacing.md }]}>
            Connect with a family member to see their medication schedule. No account required.
          </Text>
          <PrimaryButton title="Connect a family member" onPress={() => router.push('/(caregiver)/connect')} />
        </View>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      <View style={styles.actionBlock}>
        <PrimaryButton title="Manage connections" onPress={() => router.push('/(caregiver)/connections')} />
        <SecondaryButton title="App settings and appearance" onPress={() => router.push('/settings')} />
        {caregiver && <DestructiveButton title="Disconnect from this device" onPress={signOut} loading={signingOut} />}
      </View>

      {caregiver && !isAnonymousDevice && (
        <View style={[styles.actionBlock, { marginTop: Spacing.lg }]}>
          {!deleteOpen ? (
            <SecondaryButton title="Delete my account" onPress={() => setDeleteOpen(true)} />
          ) : (
            <>
              <Notice tone="warning">
                Deleting your account permanently removes it and your family connections from the server.
              </Notice>
              <FormField
                label="Your password"
                value={deletePassword}
                onChangeText={(t: string) => {
                  setDeletePassword(t);
                  setDeleteError(null);
                }}
                secureTextEntry
                autoCapitalize="none"
              />
              {deleteError && <Notice tone="error">{deleteError}</Notice>}
              <DestructiveButton title="Delete my account permanently" onPress={confirmDelete} loading={deleting} />
              <SecondaryButton
                title="Cancel"
                onPress={() => {
                  setDeleteOpen(false);
                  setDeletePassword('');
                  setDeleteError(null);
                }}
              />
            </>
          )}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: { ...Typography.headlineMedium, fontWeight: '700' },
  name: { ...Typography.headlineMedium, textAlign: 'center' },
  email: { ...Typography.bodyMedium, textAlign: 'center', marginTop: Spacing.xs },
  actionBlock: { gap: Spacing.xs },
});
