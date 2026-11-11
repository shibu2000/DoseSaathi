import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PatientContextBar } from '@/components/PatientContextBar';
import { StatusTag } from '@/components/StatusTag';
import { SecondaryButton, PrimaryButton } from '@/components/Buttons';
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
import { useApp } from '@/state/AppContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CheckingScreen, Notice, RefreshableScreen } from '@/caregiver/ui';
import { usePatientPlan, useRelationshipAccess } from '@/caregiver/hooks';
import { describeDeviceStatus, formatRelativeTime } from '@/caregiver/command-state';
import {
  buildTodayView,
  pickDisplayTimezone,
  todayStateLabel,
  type ActivityEventLike,
} from '@/caregiver/today-view';
import { localDateInZone } from '@medchain/domain';

const MAX_PAGES = 3;

export default function PatientTodayCaregiverViewScreen() {
  const { relationshipId } = useLocalSearchParams<{ relationshipId: string }>();
  const router = useRouter();
  const { api, relationshipsStale, relationshipsSyncedAt, refreshRelationships } = useApp();
  const access = useRelationshipAccess(relationshipId);
  const canView = access.state === 'ready' && access.canView;
  const canSeeLogs = access.state === 'ready' && access.canView && access.relationship.permissions.includes('VIEW_DOSE_LOGS');
  const plan = usePatientPlan(relationshipId, canView);
  const [events, setEvents] = useState<ActivityEventLike[]>([]);
  const [eventsOk, setEventsOk] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Keep "upcoming" vs "not confirmed yet" honest as the day goes on
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const loadEvents = useCallback(async () => {
    if (!relationshipId || !canSeeLogs) return;
    setEventsLoading(true);
    try {
      const all: ActivityEventLike[] = [];
      let cursor: string | undefined;
      const today = localDateInZone(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await api.getActivity(relationshipId, { limit: 100, cursor });
        all.push(...res.items);
        const oldest = res.items[res.items.length - 1];
        // Stop once the page reaches back before today (with a day of slack for time zones)
        if (!res.nextCursor || !oldest || localDateInZone(oldest.actionTimestamp, 'UTC') < shiftDate(today, -1)) break;
        cursor = res.nextCursor;
      }
      if (!alive.current) return;
      setEvents(all);
      setEventsOk(true);
    } catch {
      if (alive.current) setEventsOk(false);
    } finally {
      if (alive.current) setEventsLoading(false);
    }
  }, [api, relationshipId, canSeeLogs]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  if (access.state !== 'ready') return <CheckingScreen title="Today" />;
  const rel = access.relationship;
  const patientName = rel.patientDisplayName;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshRelationships(); // a real request: updates "last seen" for this person
      await Promise.all([plan.reload(), loadEvents()]);
      setNow(new Date());
    } finally {
      if (alive.current) setRefreshing(false);
    }
  };

  const header = (
    <>
      <ScreenHeader
        title={`${patientName}'s Today`}
        showBack={true}
        onBack={() => router.replace('/(caregiver)/(tabs)/family')}
      />
      <PatientContextBar
        patientName={patientName}
        relationshipLabel={rel.relationshipLabel}
        onSwitch={() => router.replace('/(caregiver)/(tabs)/family')}
      />
    </>
  );

  if (!access.canView) {
    return (
      <RefreshableScreen refreshing={false} onRefresh={() => {}}>
        {header}
        <Notice icon="lock-closed-outline" title="Not shared with you">
          {patientName} has not shared their schedule with you.
        </Notice>
      </RefreshableScreen>
    );
  }

  return (
    <TodayBody
      header={header}
      rel={rel}
      plan={plan}
      events={events}
      eventsOk={eventsOk}
      eventsLoading={eventsLoading}
      canSeeLogs={canSeeLogs}
      refreshing={refreshing}
      onRefresh={onRefresh}
      now={now}
      relationshipsStale={relationshipsStale}
      relationshipsSyncedAt={relationshipsSyncedAt}
      onOpenMedicines={() => router.push(`/(caregiver)/patient/${relationshipId}/medicines`)}
    />
  );
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function TodayBody(props: {
  header: React.ReactNode;
  rel: import('@medchain/contracts').RelationshipSummary;
  plan: ReturnType<typeof usePatientPlan>;
  events: ActivityEventLike[];
  eventsOk: boolean;
  eventsLoading: boolean;
  canSeeLogs: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  now: Date;
  relationshipsStale: boolean;
  relationshipsSyncedAt: string | null;
  onOpenMedicines: () => void;
}) {
  const { rel, plan, events, eventsOk, now } = props;
  const patientName = rel.patientDisplayName;
  const device = describeDeviceStatus(rel.deviceLastSeenAt, rel.lastSyncedAt, now);
  const stale = props.relationshipsStale || device.state !== 'recent';
  const report = plan.raw?.deviceReport ?? null;
  const reportedAt = (report as { reportedAt?: string } | null)?.reportedAt ?? null;

  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const { tz, fromPhone } = useMemo(() => pickDisplayTimezone(events, deviceTz), [events, deviceTz]);
  const view = useMemo(
    () =>
      buildTodayView({
        report,
        events,
        now,
        tz,
        includeUpcoming: !stale,
        eventsKnown: eventsOk,
      }),
    [report, events, now, tz, stale, eventsOk]
  );

  const dateLabel = (() => {
    try {
      return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(now);
    } catch {
      return view.localDate;
    }
  })();

  const lastUpdatedIso = reportedAt ?? [rel.deviceLastSeenAt, rel.lastSyncedAt].filter(Boolean).sort().pop() ?? null;

  return (
    <RefreshableScreen refreshing={props.refreshing} onRefresh={props.onRefresh}>
      {props.header}
      <Text style={styles.dateLabel}>{dateLabel}</Text>

      <View style={styles.syncRow} accessible accessibilityLabel={`Phone status: ${device.text}`}>
        <Ionicons
          name={device.state === 'recent' ? 'phone-portrait-outline' : 'time-outline'}
          size={18}
          color={device.state === 'recent' ? Colors.success : Colors.warning}
        />
        <Text style={[styles.syncText, { color: device.state === 'recent' ? Colors.success : Colors.warning }]}>{device.text}</Text>
      </View>

      {props.relationshipsStale ? (
        <Notice icon="cloud-offline-outline" title="Can't reach DoseSaathi">
          Showing a saved copy from {formatRelativeTime(props.relationshipsSyncedAt, now) ?? 'earlier'}. Pull down to check again.
        </Notice>
      ) : null}

      {stale ? (
        <Notice icon="time-outline" title={`Last updated ${lastUpdatedIso ? formatRelativeTime(lastUpdatedIso, now) : 'never'}`}>
          {patientName}'s phone has not checked in recently, so upcoming doses are hidden rather than guessed. What is shown below is what the phone last reported.
        </Notice>
      ) : null}

      {!props.canSeeLogs ? (
        <Notice icon="eye-off-outline" title="Dose confirmations are not shared">
          {patientName} has not allowed you to see whether doses were taken.
        </Notice>
      ) : !eventsOk && !props.eventsLoading ? (
        <Notice icon="cloud-offline-outline" tone="problem" title="Couldn't load dose confirmations" actionLabel="Try again" onAction={props.onRefresh}>
          Past doses are shown without a status until this loads.
        </Notice>
      ) : null}

      {!fromPhone && view.rows.length > 0 ? (
        <Text style={styles.tzNote}>Times use your phone's time zone because {patientName}'s zone is not known yet.</Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today's schedule (read-only)</Text>
        {plan.loading && !plan.raw ? (
          <ActivityIndicator size="small" color={Colors.brand} style={{ marginVertical: 20 }} accessibilityLabel="Loading" />
        ) : plan.error && !plan.raw ? (
          <Notice icon="cloud-offline-outline" tone="problem" title="Couldn't load the schedule" actionLabel="Try again" onAction={plan.reload}>
            {plan.error}
          </Notice>
        ) : !report ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{patientName}'s phone has not shared its schedule yet.</Text>
          </View>
        ) : view.rows.length === 0 && view.dependents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No doses are scheduled for today.</Text>
          </View>
        ) : (
          <>
            {view.rows.map((row) => {
              const st = todayStateLabel(row.state);
              return (
                <View
                  key={row.key}
                  style={styles.doseCard}
                  accessible
                  accessibilityLabel={`${row.timeLocal}. ${row.name}. ${row.dosageText}. ${st.label}`}
                >
                  <View style={styles.doseHeader}>
                    <Text style={styles.doseTime}>{row.timeLocal}</Text>
                    <StatusTag label={st.label} variant={st.variant} />
                  </View>
                  <Text style={styles.doseName}>{row.name}</Text>
                  {row.dosageText ? <Text style={styles.doseDosage}>{row.dosageText}</Text> : null}
                  {row.instructions ? <Text style={styles.doseDosage}>{row.instructions}</Text> : null}
                </View>
              );
            })}
            {view.dependents.map((d) => (
              <View key={d.medicationId} style={styles.dependentCard} accessible accessibilityLabel={`${d.name}: ${d.text}`}>
                <Text style={styles.dependentName}>{d.name}</Text>
                <Text style={styles.dependentText}>{d.text}</Text>
              </View>
            ))}
          </>
        )}
        <Text style={styles.readOnly}>Doses are confirmed on {patientName}'s phone. This is a read-only view.</Text>
      </View>

      <View style={styles.actionBlock}>
        <PrimaryButton
          title={medicinesButtonLabel(rel)}
          onPress={props.onOpenMedicines}
          icon={<MaterialCommunityIcons name="pill" size={20} color={Colors.white} />}
        />
        <SecondaryButton
          title="Refresh"
          onPress={props.onRefresh}
          loading={props.refreshing}
          icon={<Ionicons name="refresh" size={18} color={Colors.brand} />}
        />
      </View>
    </RefreshableScreen>
  );
}

function medicinesButtonLabel(rel: import('@medchain/contracts').RelationshipSummary): string {
  return rel.permissions.includes('EDIT_SCHEDULE') ? 'View and edit medicines' : 'View medicines';
}

const styles = StyleSheet.create({
  dateLabel: { ...Typography.bodyMedium, color: Colors.inkMuted, marginBottom: Spacing.sm },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md, minHeight: 28 },
  syncText: { ...Typography.bodySmall, fontWeight: '600', flexShrink: 1 },
  tzNote: { ...Typography.bodySmall, color: Colors.inkMuted, marginBottom: Spacing.sm },
  section: { marginVertical: Spacing.sm },
  sectionTitle: { ...Typography.headlineSmall, color: Colors.ink, marginBottom: Spacing.sm },
  emptyCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.outline,
    alignItems: 'center',
  },
  emptyText: { ...Typography.bodyMedium, color: Colors.inkMuted, textAlign: 'center' },
  doseCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.outline,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  doseHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.xs },
  doseTime: { ...Typography.headlineSmall, color: Colors.primary },
  doseName: { ...Typography.bodyLarge, fontWeight: '700', color: Colors.ink },
  doseDosage: { ...Typography.bodyMedium, color: Colors.inkMuted },
  dependentCard: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.outline,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  dependentName: { ...Typography.labelMedium, color: Colors.ink },
  dependentText: { ...Typography.bodySmall, color: Colors.inkMuted },
  readOnly: { ...Typography.bodySmall, color: Colors.inkMuted, marginTop: Spacing.sm },
  actionBlock: { gap: Spacing.sm, marginTop: Spacing.md },
});
