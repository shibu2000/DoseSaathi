import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StatusTag, type StatusVariant } from '@/components/StatusTag';
import { SecondaryButton } from '@/components/Buttons';
import { EmptyState } from '@/components/EmptyState';
import { Spacing, Typography, Radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
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

export default function CaregiverActivityTabScreen() {
  const { colors } = useTheme();
  const { api, relationships, refreshRelationships } = useApp();
  const members = useMemo(
    () => relationships.filter((r) => r.status === 'ACTIVE' && r.permissions.includes('VIEW_DOSE_LOGS')),
    [relationships]
  );

  const [filter, setFilter] = useState<'all' | string>('all');
  const [feeds, setFeeds] = useState<Record<string, Feed>>({});
  const [refreshing, setRefreshing] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchPage = useCallback(
    async (relationshipId: string, reset = false) => {
      const cur = feeds[relationshipId] ?? EMPTY_FEED;
      if (cur.loading) return;
      if (!reset && !cur.nextCursor && cur.items.length > 0) return;

      setFeeds((prev) => ({
        ...prev,
        [relationshipId]: { ...(prev[relationshipId] ?? EMPTY_FEED), loading: true, error: null },
      }));

      try {
        const cursor = reset ? undefined : cur.nextCursor ?? undefined;
        const res = await api.getActivity(relationshipId, { cursor, limit: PAGE });
        if (!mounted.current) return;
        setFeeds((prev) => {
          const prior = reset ? [] : (prev[relationshipId]?.items ?? []);
          return {
            ...prev,
            [relationshipId]: {
              items: [...prior, ...res.items],
              nextCursor: res.nextCursor,
              loading: false,
              error: null,
            },
          };
        });
      } catch (e) {
        if (!mounted.current) return;
        const msg =
          e instanceof ApiError && e.isNetwork
            ? "Couldn't reach DoseSaathi. Pull down to try again."
            : 'Could not load activity for this person.';
        setFeeds((prev) => ({
          ...prev,
          [relationshipId]: { ...(prev[relationshipId] ?? EMPTY_FEED), loading: false, error: msg },
        }));
      }
    },
    [api, feeds]
  );

  useEffect(() => {
    for (const m of members) {
      if (!feeds[m.relationshipId]) void fetchPage(m.relationshipId, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshRelationships();
      await Promise.all(members.map((m) => fetchPage(m.relationshipId, true)));
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  };

  const visibleIds = filter === 'all' ? members.map((m) => m.relationshipId) : [filter];
  const merged = useMemo(() => {
    const activeFeeds = visibleIds.map((id) => feeds[id] ?? EMPTY_FEED);
    return mergeFeeds(activeFeeds);
  }, [visibleIds, feeds]);

  const anyLoading = visibleIds.some((id) => feeds[id]?.loading);

  const loadMore = () => {
    for (const id of visibleIds) {
      const f = feeds[id];
      if (f?.nextCursor && !f.loading) void fetchPage(id);
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
            <Chip label={`Everyone (${members.length})`} selected={filter === 'all'} onPress={() => setFilter('all')} colors={colors} />
            {members.map((m) => (
              <Chip key={m.relationshipId} label={m.patientDisplayName} selected={filter === m.relationshipId} onPress={() => setFilter(m.relationshipId)} colors={colors} />
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
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 30 }} accessibilityLabel="Loading activity" />
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
                    style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    accessible
                    accessibilityLabel={`${item.patientDisplayName}. ${item.medicationName ?? 'Medicine'}. ${gentleLabel(item.statusLabel)}. ${action ? `Recorded ${action}.` : ''} ${sched ? `Scheduled ${sched}.` : ''}`}
                  >
                    <View style={styles.eventHeader}>
                      <Text style={[styles.patientTag, { color: colors.primary }]}>{item.patientDisplayName}</Text>
                      <StatusTag label={gentleLabel(item.statusLabel)} variant={variantFor(item.eventType)} />
                    </View>
                    <Text style={[styles.medName, { color: colors.textPrimary }]}>
                      {item.medicationName ?? 'Medicine'}
                      {item.dosageText ? ` • ${item.dosageText}` : ''}
                    </Text>
                    {action ? <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>Recorded {action}</Text> : null}
                    {sched ? <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>Scheduled for {sched}</Text> : null}
                    {showTz ? <Text style={[styles.tzLabel, { color: colors.textSecondary }]}>Times in {tz.replace(/_/g, ' ')} (their phone's time zone)</Text> : null}
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
            <Text style={[styles.endText, { color: colors.textSecondary }]}>That's everything so far.</Text>
          ) : null}
        </>
      )}
    </RefreshableScreen>
  );
}

function Chip({ label, selected, onPress, colors }: { label: string; selected: boolean; onPress: () => void; colors: any }) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={selected ? `${label}, selected` : label}
    >
      {selected ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
      <Text style={[styles.chipText, { color: selected ? colors.white : colors.textPrimary }, selected && styles.chipTextActive]}>
        {label}
      </Text>
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
  },
  chipText: { ...Typography.labelSmall, flexShrink: 1 },
  chipTextActive: { fontWeight: '700' },
  list: { gap: Spacing.md },
  eventCard: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.lg,
  },
  eventHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs, gap: Spacing.sm },
  patientTag: { ...Typography.labelSmall, fontWeight: '700', flexShrink: 1 },
  medName: { ...Typography.bodyLarge, fontWeight: '700', marginBottom: Spacing.xs },
  timeLabel: { ...Typography.bodySmall },
  tzLabel: { ...Typography.bodySmall, fontStyle: 'italic', marginTop: Spacing.xs },
  moreBlock: { marginTop: Spacing.lg, marginBottom: Spacing.xxl },
  endText: { ...Typography.bodySmall, textAlign: 'center', marginVertical: Spacing.xl },
});
