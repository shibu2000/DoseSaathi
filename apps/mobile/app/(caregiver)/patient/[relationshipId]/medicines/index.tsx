import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PatientContextBar } from '@/components/PatientContextBar';
import { MedicationRow } from '@/components/MedicationRow';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
import { useApp } from '@/state/AppContext';
import { DEFAULT_WIZARD_DRAFT } from '@/database';
import { generateUUID } from '@/utils/uuid';
import { CheckingScreen, CommandStatusCard, Notice, RefreshableScreen } from '@/caregiver/ui';
import { useRelationshipAccess, usePatientPlan, useStagedMedications, useTrackedCommand } from '@/caregiver/hooks';
import { buildSnapshot, describeSchedule } from '@/caregiver/plan-composer';
import { describeSubmitError, submitComposedPlan } from '@/caregiver/submit';
import { saveCaregiverDraft, saveTrackedCommand, clearStaged, type SettingsStore } from '@/caregiver/staged-store';
import { invalidatePlanCache } from '@/caregiver/wizard-session';
import { describeDeviceStatus, formatRelativeTime } from '@/caregiver/command-state';
import type { PlanMedication } from '@medchain/contracts';

export default function PatientMedicinesCaregiverViewScreen() {
  const { relationshipId } = useLocalSearchParams<{ relationshipId: string }>();
  const router = useRouter();
  const { api, db } = useApp();
  const access = useRelationshipAccess(relationshipId);
  const canView = access.state === 'ready' && access.canView;
  const plan = usePatientPlan(relationshipId, canView);
  const stagedStore = useStagedMedications(relationshipId);
  const tracked = useTrackedCommand(relationshipId);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const sendKey = React.useRef(generateUUID());

  const { reload: reloadPlan } = plan;
  const { reload: reloadStaged } = stagedStore;
  const { reload: reloadTracked } = tracked;
  const reloadAll = useCallback(async () => {
    await Promise.all([reloadPlan(), reloadStaged(), reloadTracked()]);
  }, [reloadPlan, reloadStaged, reloadTracked]);

  // Coming back from the wizard or the detail screen: show what is true now.
  useFocusEffect(
    useCallback(() => {
      void reloadStaged();
      void reloadTracked();
    }, [reloadStaged, reloadTracked])
  );

  if (access.state !== 'ready') return <CheckingScreen title="Medicines" />;
  const rel = access.relationship;
  const patientName = rel.patientDisplayName;

  const goFamily = () => router.replace('/(caregiver)/(tabs)/family');
  const header = (
    <>
      <ScreenHeader
        title={`${patientName}'s Medicines`}
        subtitle="Prescriptions and course plans"
        showBack={true}
        onBack={() => router.back()}
      />
      <PatientContextBar patientName={patientName} relationshipLabel={rel.relationshipLabel} onSwitch={goFamily} />
    </>
  );

  if (!access.canView) {
    return (
      <RefreshableScreen refreshing={false} onRefresh={() => {}}>
        {header}
        <Notice icon="lock-closed-outline" title="Not shared with you">
          {patientName} has not shared their medicines with you.
        </Notice>
      </RefreshableScreen>
    );
  }

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await reloadAll();
    } catch {
      // each section shows its own error state
    } finally {
      setRefreshing(false);
    }
  };

  const stagedIds = new Set(stagedStore.staged.map((m) => m.id));
  const planMeds = plan.medications.filter((m) => !stagedIds.has(m.id));
  const allMeds: PlanMedication[] = [...planMeds, ...stagedStore.staged];
  const nameOf = (id: string) => allMeds.find((m) => m.id === id)?.name ?? 'another medicine';

  const withStatus = planMeds.map((m) => ({ med: m, st: plan.status.get(m.id) }));
  const active = withStatus.filter((x) => x.st?.lifecycleStatus === 'ACTIVE');
  const later = withStatus.filter((x) => x.st?.lifecycleStatus === 'QUEUED_PHASE');
  const completed = withStatus.filter((x) => x.st?.lifecycleStatus === 'COMPLETED');
  const notYet = withStatus.filter((x) => !x.st);

  const openMed = (id: string) => router.push(`/medicine/${id}?relationshipId=${encodeURIComponent(relationshipId)}` as any);

  const handleAdd = async () => {
    if (!db) return;
    try {
      await saveCaregiverDraft(db.settings as SettingsStore, relationshipId, {
        ...DEFAULT_WIZARD_DRAFT,
        id: generateUUID(),
        currentStep: 1,
      });
    } catch {
      Alert.alert("Couldn't start", 'Something went wrong on this phone. Please try again.');
      return;
    }
    router.push(`/medicine/new/details?relationshipId=${encodeURIComponent(relationshipId)}` as any);
  };

  const handleSendStaged = async () => {
    if (!db || stagedStore.staged.length === 0 || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const upserts = stagedStore.staged;
      const res = await submitComposedPlan(api, relationshipId, (base) => buildSnapshot({ base, upserts }), sendKey.current);
      await saveTrackedCommand(db.settings as SettingsStore, relationshipId, {
        commandId: res.commandId,
        sentAt: new Date().toISOString(),
        medicineNames: upserts.map((m) => m.name),
      });
      await clearStaged(db.settings as SettingsStore, relationshipId);
      invalidatePlanCache(relationshipId);
      sendKey.current = generateUUID();
      await reloadAll();
    } catch (err) {
      setSendError(describeSubmitError(err));
    } finally {
      setSending(false);
    }
  };

  const handleDiscardStaged = () => {
    Alert.alert('Discard unsent medicines?', `${stagedStore.staged.length === 1 ? 'This medicine has' : `These ${stagedStore.staged.length} medicines have`} not been sent to ${patientName}'s phone and will be deleted from your list.`, [
      { text: 'Keep them', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void stagedStore.replace([]) },
    ]);
  };

  const device = describeDeviceStatus(rel.deviceLastSeenAt, rel.lastSyncedAt);
  const waitingForPhone = !!plan.raw && plan.raw.latestPlanVersion > plan.raw.lastAppliedVersion;

  const row = (m: PlanMedication, label: string, variant: 'taken' | 'queued' | 'completed' | 'due', extra?: string) => (
    <MedicationRow
      key={m.id}
      name={m.name}
      dosage={m.dosageText}
      scheduleText={describeSchedule(m, nameOf)}
      statusLabel={label}
      statusVariant={variant}
      stockText={extra}
      onPress={() => openMed(m.id)}
    />
  );

  return (
    <RefreshableScreen refreshing={refreshing} onRefresh={onRefresh}>
      {header}

      {tracked.tracked ? (
        <CommandStatusCard
          relationshipId={relationshipId}
          tracked={tracked.tracked}
          patientName={patientName}
          onDismiss={tracked.dismiss}
          onStateChange={(s) => {
            if (s === 'APPLIED' || s === 'REJECTED') void reloadPlan();
          }}
        />
      ) : null}

      {device.state !== 'recent' ? (
        <Notice icon="phone-portrait-outline" title={device.text}>
          {device.state === 'never'
            ? `Changes will reach ${patientName}'s phone once it connects.`
            : 'What you see is what the phone last reported and may be out of date.'}
        </Notice>
      ) : null}

      {waitingForPhone && !tracked.tracked ? (
        <Notice icon="time-outline" tone="waiting" title="Waiting for the phone to connect">
          It will be applied when {patientName}'s phone connects.
        </Notice>
      ) : null}

      {plan.error ? (
        <Notice icon="cloud-offline-outline" tone="problem" title="Couldn't refresh" actionLabel="Try again" onAction={plan.reload}>
          {plan.error}
          {plan.loadedAt ? ` Showing what was loaded ${formatRelativeTime(plan.loadedAt)}.` : ''}
        </Notice>
      ) : null}

      {stagedStore.staged.length > 0 ? (
        <View style={styles.stagedCard} accessible={false}>
          <Text style={styles.sectionHeading}>Not sent yet ({stagedStore.staged.length})</Text>
          <Text style={styles.stagedHelp}>
            These are only on your phone. Send them together so {patientName}'s phone gets the whole prescription at once.
          </Text>
          {stagedStore.staged.map((m) => row(m, 'Not sent yet', 'queued'))}
          {sendError ? (
            <Notice icon="alert-circle-outline" tone="problem" title="Not sent">
              {sendError}
            </Notice>
          ) : null}
          {access.canEdit ? (
            <>
              <PrimaryButton
                title={`Send to ${patientName}'s phone`}
                onPress={handleSendStaged}
                loading={sending}
              />
              <SecondaryButton title="Discard" onPress={handleDiscardStaged} disabled={sending} />
            </>
          ) : null}
        </View>
      ) : null}

      {plan.loading && !plan.raw ? (
        <ActivityIndicator size="small" color={Colors.brand} style={{ marginVertical: 30 }} accessibilityLabel="Loading medicines" />
      ) : plan.raw ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Active ({active.length})</Text>
            {active.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {plan.medications.length === 0
                    ? `No medicines yet. ${plan.raw.deviceReport ? '' : `${patientName}'s phone has not shared a plan.`}`
                    : 'No medicines are active on the phone right now.'}
                </Text>
              </View>
            ) : (
              active.map(({ med, st }) =>
                row(
                  med,
                  st && med.trackStock && st.currentStock !== undefined && st.currentStock <= med.lowStockThreshold ? 'Low stock' : 'Active',
                  st && med.trackStock && st.currentStock !== undefined && st.currentStock <= med.lowStockThreshold ? 'due' : 'taken',
                  med.trackStock && st?.currentStock !== undefined ? `Stock on the phone: ${st.currentStock} (${med.doseUnit})` : undefined
                )
              )
            )}
          </View>

          {later.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Starts later ({later.length})</Text>
              {later.map(({ med }) => row(med, 'Starts later', 'queued'))}
            </View>
          ) : null}

          {notYet.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Waiting for the phone ({notYet.length})</Text>
              {notYet.map(({ med }) => row(med, 'Not on the phone yet', 'queued'))}
            </View>
          ) : null}

          {completed.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Completed ({completed.length})</Text>
              {completed.map(({ med }) => row(med, 'Completed', 'completed'))}
            </View>
          ) : null}
        </>
      ) : null}

      <View style={styles.addCta}>
        {access.canEdit ? (
          <PrimaryButton title={`Add medicine for ${patientName}`} onPress={handleAdd} icon="+" />
        ) : (
          <Notice icon="eye-outline" title="View only">
            You can see {patientName}'s medicines but not add or change them.
          </Notice>
        )}
        <SecondaryButton title="Refresh" onPress={onRefresh} loading={refreshing} />
      </View>
    </RefreshableScreen>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.xl },
  sectionHeading: { ...Typography.headlineSmall, color: Colors.ink, marginBottom: Spacing.xs },
  stagedCard: {
    backgroundColor: Colors.brandSoft,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.outline,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  stagedHelp: { ...Typography.bodySmall, color: Colors.ink, marginBottom: Spacing.sm },
  emptyCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.outline,
    alignItems: 'center',
    marginVertical: Spacing.xs,
  },
  emptyText: { ...Typography.bodyMedium, color: Colors.inkMuted, textAlign: 'center' },
  addCta: { marginVertical: Spacing.lg, gap: Spacing.sm },
});
