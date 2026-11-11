import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StatusTag, type StatusVariant } from '@/components/StatusTag';
import { SecondaryButton } from '@/components/Buttons';
import { EmptyState } from '@/components/EmptyState';
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
import { useApp } from '@/state/AppContext';
import { ApiError, type ActivityResponse } from '@/sync/api-client';
import { Notice, RefreshableScreen } from '@/caregiver/ui';
import { mergeFeeds } from '@/caregiver/activity-merge';

type Item = ActivityResponse['items'][number];
interface Feed {
  items: Item[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
}
const EMPTY_FEED: Feed = { items: [], nextCursor: null, loading: false, error: null };
const PAGE = 30;

function variantFor(eventType: string): StatusVariant {
  switch (eventType) {
    case 'DOSE_TAKEN':
      return 'taken';
    case 'DOSE_SKIPPED':
      return 'skipped';
    case 'DOSE_SNOOZED':
      return 'snoozed';
    case 'DOSE_NOT_CONFIRMED':
      return 'unconfirmed';
    case 'COURSE_TRANSITION_COMPLETED':
      return 'completed';
    default:
      return 'queued';
  }
}

/** Never shames: the server label is shown, but "missed" is softened. */
function gentleLabel(label: string): string {
  return label.replace(/missed/gi, 'not confirmed');
}

function formatInZone(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: tz }).format(d);
  } catch {
    return new Intl.DateTimeFormat(undefined, opts).format(d);
  }
}

function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isNetwork) return "Couldn't reach DoseSaathi. Check your connection.";
    if (err.code === 'PERMISSION_DENIED') return 'You do not have permission to see this activity.';
    if (err.code === 'RELATIONSHIP_INACTIVE') return 'This connection has ended.';
  }
  return "Couldn't load activity.";
}

export default function FamilyActivityScreen() {
  const { api, relationships, selectedRelationship } = useApp();
  const members = useMemo(
    () => relationships.filter((r) => r.status === 'ACTIVE' && r.permissions.includes('VIEW_DOSE_LOGS')),
    [relationships]
  );
  const [filter, setFilter] = useState<string>('all');
  const [feeds, setFeeds] = useState<Record<string, Feed>>({});
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Start on the selected person when there is one, but only until the user picks a chip.
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current || members.length === 0) return;
    initialised.current = true;
    if (selectedRelationship && members.some((m) => m.relationshipId === selectedRelationship.relationshipId)) {
      setFilter(selectedRelationship.relationshipId);
    }
  }, [members, selectedRelationship]);

  // If the chosen person disappears (revoked), fall back to everyone
  useEffect(() => {
    if (filter !== 'all' && !members.some((m) => m.relationshipId === filter)) setFilter('all');
  }, [members, filter]);

  const memberKey = members.map((m) => m.relationshipId).join(',');
  const visibleIds = useMemo(
    () => (filter === 'all' ? members.map((m) => m.relationshipId) : members.filter((m) => m.relationshipId === filter).map((m) => m.relationshipId)),
    [filter, memberKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const feedsRef = useRef(feeds);
  feedsRef.current = feeds;

  const fetchPage = useCallback(
    async (relId: string, reset: boolean) => {
      const cur = feedsRef.current[relId] ?? EMPTY_FEED;
      const cursor = reset ? undefined : cur.nextCursor ?? undefined;
      if (!reset && !cur.nextCursor) return;
      setFeeds((p) => ({ ...p, [relId]: { ...(reset ? EMPTY_FEED : cur), loading: true, error: null } }));
      try {
        const res = await api.getActivity(relId, { limit: PAGE, cursor });
        if (!alive.current) return;
        setFeeds((p) => {
          const base = reset ? [] : (p[relId]?.items ?? []);
          return { ...p, [relId]: { items: [...base, ...res.items], nextCursor: res.nextCursor, loading: false, error: null } };
        });
      } catch (err) {
        if (!alive.current) return;
        setFeeds((p) => ({ ...p, [relId]: { ...(p[relId] ?? EMPTY_FEED), loading: false, error: errorText(err) } }));
      }
    },
    [api]
  );

  // First load for anyone not loaded yet
  useEffect(() => {
    for (const id of visibleIds) {
      if (!feedsRef.current[id]) void fetchPage(id, true);
    }
  }, [visibleIds, fetchPage]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all(visibleIds.map((id) => fetchPage(id, true)));
    if (alive.current) setRefreshing(false);
  };

  const shownFeeds = visibleIds.map((id) => feeds[id] ?? EMPTY_FEED);
  const merged = mergeFeeds(shownFeeds.map((f) => ({ items: f.items, nextCursor: f.nextCursor })));
  const anyLoading = shownFeeds.some((f) => f.loading);
  const loadMore = () => {
    for (const id of visibleIds) {
      const f = feeds[id];
      if (f?.nextCursor && !f.loading) void fetchPage(id, false);
    }
  };
  const nameOfRel = (id: string) => relationships.find((r) => r.relationshipId === id)?.patientDisplayName;
  const failed = visibleIds.filter((id) => feeds[id]?.error);
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <RefreshableScreen refreshing={refreshing} onRefresh={onRefresh}>
      <ScreenHeader title="Family activity" subtitle="Dose updates reported by the phones" />

      {members.length === 0 ? (
        <EmptyState
          icon="📋"
          title={relationships.length === 0 ? 'No one connected yet' : 'No activity shared'}
          description={
            relationships.length === 0
              ? 'Connect with a family member to see their dose updates here.'
              : 'None of your connections have shared dose history with you.'
          }
        />
      ) : (
        <>
          <View style={styles.filterRow} accessibilityRole="tablist">
            <Chip label={`Everyone (${members.length})`} selected={filter === 'all'} onPress={() => setFilter('all')} />
            {members.map((m) => (
              <Chip key={m.relationshipId} label={m.patientDisplayName} selected={filter === m.relationshipId} onPress={() => setFilter(m.relationshipId)} />
            ))}
          </View>

          {failed.map((id) => (
            <Notice
              key={id}
              icon="cloud-offline-outline"
              tone="problem"
              title={`Couldn't load ${nameOfRel(id) ?? 'activity'}`}
              actionLabel="Try again"
              onAction={() => void fetchPage(id, true)}
            >
              {feeds[id]?.error}
            </Notice>
          ))}

          {merged.items.length === 0 && anyLoading ? (
            <ActivityIndicator size="small" color={Colors.brand} style={{ marginVertical: 30 }} accessibilityLabel="Loading activity" />
          ) : merged.items.length === 0 && failed.length === 0 ? (
            <EmptyState icon="📋" title="No activity yet" description="Dose updates will appear here after the phone syncs." />
          ) : (
            <View style={styles.list}>
              {merged.items.map((item) => {
                const tz = item.timezoneId || deviceTz;
                const action = formatInZone(item.actionTimestamp, tz);
                const sched = formatInZone(item.scheduledAt, tz);
                const showTz = tz !== deviceTz;
                return (
                  <View
                    key={item.eventId}
                    style={styles.eventCard}
                    accessible
                    accessibilityLabel={`${item.patientDisplayName}. ${item.medicationName ?? 'Medicine'}. ${gentleLabel(item.statusLabel)}. ${action ? `Recorded ${action}.` : ''} ${sched ? `Scheduled ${sched}.` : ''}`}
                  >
                    <View style={styles.eventHeader}>
                      <Text style={styles.patientTag}>{item.patientDisplayName}</Text>
                      <StatusTag label={gentleLabel(item.statusLabel)} variant={variantFor(item.eventType)} />
                    </View>
                    <Text style={styles.medName}>
                      {item.medicationName ?? 'Medicine'}
                      {item.dosageText ? ` • ${item.dosageText}` : ''}
                    </Text>
                    {action ? <Text style={styles.timeLabel}>Recorded {action}</Text> : null}
                    {sched ? <Text style={styles.timeLabel}>Scheduled for {sched}</Text> : null}
                    {showTz ? <Text style={styles.tzLabel}>Times in {tz.replace(/_/g, ' ')} (their phone's time zone)</Text> : null}
                  </View>
                );
              })}
            </View>
          )}

          {merged.hasMore ? (
            <View style={styles.moreBlock}>
              <SecondaryButton title="Load more" onPress={loadMore} loading={anyLoading} />
            </View>
          ) : merged.items.length > 0 ? (
            <Text style={styles.endText}>That's everything so far.</Text>
          ) : null}
        </>
      )}
    </RefreshableScreen>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={selected ? `${label}, selected` : label}
    >
      {selected ? <Ionicons name="checkmark" size={16} color={Colors.white} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  chip: {
    flexDirection: 'row',
    maxWidth: '100%',
    alignItems: 'center',
    gap: 4,
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  chipText: { ...Typography.labelSmall, color: Colors.ink, flexShrink: 1 },
  chipTextActive: { color: Colors.white, fontWeight: '700' },
  list: { gap: Spacing.md },
  eventCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.lg,
  },
  eventHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs, gap: Spacing.sm },
  patientTag: { ...Typography.labelSmall, color: Colors.brand, fontWeight: '700', flexShrink: 1 },
  medName: { ...Typography.bodyLarge, fontWeight: '700', color: Colors.ink, marginBottom: Spacing.xs },
  timeLabel: { ...Typography.bodySmall, color: Colors.inkMuted },
  tzLabel: { ...Typography.bodySmall, color: Colors.inkMuted, fontStyle: 'italic', marginTop: Spacing.xs },
  moreBlock: { marginTop: Spacing.lg, marginBottom: Spacing.xxl },
  endText: { ...Typography.bodySmall, color: Colors.inkMuted, textAlign: 'center', marginVertical: Spacing.xl },
});
