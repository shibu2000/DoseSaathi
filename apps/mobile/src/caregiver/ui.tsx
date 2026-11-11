import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, RefreshControl, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '@/theme/tokens';
import { AppScreen } from '@/components/AppScreen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { describeCommandState, type CommandTone } from './command-state';
import { useCommandTracker } from './hooks';
import type { TrackedCommand } from './staged-store';

const toneIcon: Record<CommandTone, keyof typeof Ionicons.glyphMap> = {
  waiting: 'time-outline',
  progress: 'sync-outline',
  success: 'checkmark-circle-outline',
  problem: 'alert-circle-outline',
  neutral: 'information-circle-outline',
};

export function toneColors(tone: CommandTone) {
  switch (tone) {
    case 'success':
      return { fg: Colors.success, bg: Colors.surface };
    case 'problem':
      return { fg: Colors.danger, bg: Colors.surface };
    case 'waiting':
    case 'progress':
      return { fg: Colors.brand, bg: Colors.brandSoft };
    default:
      return { fg: Colors.inkMuted, bg: Colors.surfaceMuted };
  }
}

/** AppScreen with pull-to-refresh (AppScreen itself has no refresh support). */
export function RefreshableScreen({
  children,
  refreshing,
  onRefresh,
}: {
  children: React.ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} colors={[Colors.brand]} />}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Scrolling screen for forms: lifts content above the keyboard (also on edge-to-edge Android) and
 * lets a tap on a button work on the first try while the keyboard is open.
 */
export function FormScreen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function CheckingScreen({ title = 'Opening' }: { title?: string }) {
  return (
    <AppScreen>
      <ScreenHeader title={title} />
      <ActivityIndicator size="large" color={Colors.brand} style={{ marginTop: 40 }} accessibilityLabel="Loading" />
    </AppScreen>
  );
}

/** A plain notice with an icon; never relies on colour alone. */
export function Notice({
  icon = 'information-circle-outline',
  title,
  children,
  tone = 'neutral',
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  children?: React.ReactNode;
  tone?: CommandTone;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const c = toneColors(tone);
  return (
    <View style={[styles.notice, { backgroundColor: c.bg }]} accessible accessibilityRole="summary">
      <Ionicons name={icon} size={22} color={c.fg} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.noticeTitle, { color: c.fg }]}>{title}</Text>
        {children ? <Text style={styles.noticeBody}>{children}</Text> : null}
        {actionLabel && onAction ? (
          <TouchableOpacity
            onPress={onAction}
            style={styles.noticeAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <Text style={[styles.noticeActionText, { color: c.fg }]}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

/** Live state of the last command sent to a patient's phone. */
export function CommandStatusCard({
  relationshipId,
  tracked,
  patientName,
  onDismiss,
  onStateChange,
}: {
  relationshipId: string;
  tracked: TrackedCommand;
  patientName: string;
  onDismiss: () => void;
  onStateChange?: (status: string) => void;
}) {
  const { state, checkFailed } = useCommandTracker(relationshipId, tracked.commandId);
  const status = state?.status;
  React.useEffect(() => {
    if (status) onStateChange?.(status);
  }, [status, onStateChange]);

  const view = state ? describeCommandState(state) : null;
  const names = tracked.medicineNames.length ? tracked.medicineNames.join(', ') : 'your changes';
  return (
    <View
      style={[styles.statusCard, { backgroundColor: view ? toneColors(view.tone).bg : Colors.surfaceMuted }]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Change for ${patientName}: ${view?.label ?? 'checking'}`}
    >
      <Text style={styles.statusKicker}>Last change sent to {patientName}</Text>
      <Text style={styles.statusNames}>{names}</Text>
      {view ? (
        <View style={styles.statusRow}>
          <Ionicons name={toneIcon[view.tone]} size={22} color={toneColors(view.tone).fg} />
          <Text style={[styles.statusLabel, { color: toneColors(view.tone).fg }]}>{view.label}</Text>
        </View>
      ) : (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={Colors.brand} />
          <Text style={styles.statusLabel}>Checking with the phone…</Text>
        </View>
      )}
      {view?.detail ? <Text style={styles.noticeBody}>{view.detail}</Text> : null}
      {checkFailed ? <Text style={styles.noticeBody}>Can't check right now. Showing the last known status.</Text> : null}
      {view?.terminal ? (
        <TouchableOpacity onPress={onDismiss} style={styles.noticeAction} accessibilityRole="button" accessibilityLabel="Dismiss status">
          <Text style={[styles.noticeActionText, { color: Colors.brand }]}>Dismiss</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.canvas },
  scrollContent: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.xxxl },
  notice: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.outline,
    marginBottom: Spacing.md,
  },
  noticeTitle: { ...Typography.labelMedium },
  noticeBody: { ...Typography.bodySmall, color: Colors.ink, marginTop: 2 },
  noticeAction: { minHeight: 48, justifyContent: 'center' },
  noticeActionText: { ...Typography.labelMedium, textDecorationLine: 'underline' },
  statusCard: {
    padding: Spacing.lg,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.outline,
    marginBottom: Spacing.md,
  },
  statusKicker: { ...Typography.labelSmall, color: Colors.inkMuted },
  statusNames: { ...Typography.labelMedium, color: Colors.ink, marginVertical: Spacing.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  statusLabel: { ...Typography.labelMedium, flexShrink: 1 },
});
