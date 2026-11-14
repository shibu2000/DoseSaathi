import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MedicationRow } from '@/components/MedicationRow';
import { EmptyState } from '@/components/EmptyState';
import { PrimaryButton } from '@/components/Buttons';
import { Radii, Spacing, scaleFont, FontFamily } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { useApp } from '@/state/AppContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatSchedule } from '@/utils/schedule-formatter';

type FilterType = 'all' | 'active' | 'queued' | 'completed';

export default function MedicinesListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { medications, schedules, refreshMedications, clearDraft } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const getScheduleDisplay = (med: (typeof medications)[number]) => {
    const sched = schedules.find((s) => s.medicationId === med.id);
    return formatSchedule(sched, med.instructions).combinedSummary;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshMedications();
    } catch {
      // Keep the current list if refreshing fails.
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddMedicine = async () => {
    try {
      await clearDraft();
    } catch {
      // A leftover draft is harmless; continue to the form.
    }
    router.push('/medicine/new/details');
  };

  const activeMeds = useMemo(
    () => medications.filter((m) => m.lifecycleStatus === 'ACTIVE'),
    [medications]
  );
  const queuedMeds = useMemo(
    () => medications.filter((m) => m.lifecycleStatus === 'QUEUED_PHASE'),
    [medications]
  );
  const completedMeds = useMemo(
    () => medications.filter((m) => m.lifecycleStatus === 'COMPLETED'),
    [medications]
  );

  const filteredMeds = useMemo(() => {
    let list = medications;
    if (filter === 'active') list = activeMeds;
    else if (filter === 'queued') list = queuedMeds;
    else if (filter === 'completed') list = completedMeds;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q));
    }
    return list;
  }, [medications, filter, activeMeds, queuedMeds, completedMeds, searchQuery]);

  const isEmpty = medications.length === 0;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Screen Header */}
        <View style={styles.topHeader}>
          <View style={styles.headerTitles}>
            <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>My Medicines</Text>
            <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
              {medications.length} {medications.length === 1 ? 'medicine' : 'medicines'} tracked on this phone
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.quickAddButton, { backgroundColor: colors.primary }]}
            onPress={handleAddMedicine}
            accessibilityRole="button"
            accessibilityLabel="Add medication"
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={24} color={colors.surface} />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        {!isEmpty && (
          <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search medicines..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Segmented Control Filter Tabs */}
        {!isEmpty && (
          <View style={[styles.filterContainer, { backgroundColor: colors.surfaceSecondary }]}>
            {(['all', 'active', 'queued', 'completed'] as FilterType[]).map((tab) => {
              const isSelected = filter === tab;
              const labels: Record<FilterType, string> = {
                all: 'All',
                active: `Active (${activeMeds.length})`,
                queued: `Queued (${queuedMeds.length})`,
                completed: `Done (${completedMeds.length})`,
              };
              return (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.filterTab,
                    isSelected && [
                      styles.filterTabSelected,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ],
                  ]}
                  onPress={() => setFilter(tab)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${labels[tab]} medicines`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.filterTabText,
                      {
                        color: isSelected ? colors.primaryDark : colors.textSecondary,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {labels[tab]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {isEmpty ? (
          <EmptyState
            icon={<MaterialCommunityIcons name="pill" size={44} color={colors.primary} />}
            title="No medicines added yet"
            description="Add your prescribed medicines to get reliable on-time reminders and track your family's health."
            buttonTitle="Add your first medicine"
            onButtonPress={handleAddMedicine}
          />
        ) : filteredMeds.length === 0 ? (
          <View style={styles.emptyFilterBox}>
            <Text style={[styles.emptyFilterText, { color: colors.textSecondary }]}>
              {searchQuery ? `No medicines matching "${searchQuery}"` : 'No medicines in this category.'}
            </Text>
          </View>
        ) : (
          <>
            {/* List rendered according to category filter */}
            {filter === 'all' ? (
              <>
                {activeMeds.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>CURRENT SCHEDULE</Text>
                      <Text style={[styles.sectionCount, { color: colors.primary }]}>{activeMeds.length} active</Text>
                    </View>
                    {activeMeds.map((med) => {
                      const isLowStock = med.trackStock && med.currentStock <= med.lowStockThreshold;
                      return (
                        <MedicationRow
                          key={med.id}
                          name={med.name}
                          dosage={med.dosageText}
                          scheduleText={getScheduleDisplay(med)}
                          statusLabel={isLowStock ? 'Low stock' : 'Active'}
                          statusVariant={isLowStock ? 'lowStock' : 'taken'}
                          stockText={med.trackStock ? `${med.currentStock} ${med.doseUnit} left` : undefined}
                          onPress={() => router.push(`/medicine/${med.id}`)}
                        />
                      );
                    })}
                  </View>
                )}

                {queuedMeds.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>STARTS LATER</Text>
                      <Text style={[styles.sectionCount, { color: colors.primary }]}>{queuedMeds.length} queued</Text>
                    </View>
                    {queuedMeds.map((med) => (
                      <MedicationRow
                        key={med.id}
                        name={med.name}
                        dosage={med.dosageText}
                        scheduleText={getScheduleDisplay(med) || 'Starts after this course'}
                        statusLabel="Starts later"
                        statusVariant="queued"
                        onPress={() => router.push(`/medicine/${med.id}`)}
                      />
                    ))}
                  </View>
                )}

                {completedMeds.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>COMPLETED</Text>
                      <Text style={[styles.sectionCount, { color: colors.primary }]}>{completedMeds.length} finished</Text>
                    </View>
                    {completedMeds.map((med) => (
                      <MedicationRow
                        key={med.id}
                        name={med.name}
                        dosage={med.dosageText}
                        scheduleText="Treatment course finished"
                        statusLabel="Completed"
                        statusVariant="completed"
                        onPress={() => router.push(`/medicine/${med.id}`)}
                      />
                    ))}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.section}>
                {filteredMeds.map((med) => {
                  const isLowStock = med.trackStock && med.currentStock <= med.lowStockThreshold;
                  return (
                    <MedicationRow
                      key={med.id}
                      name={med.name}
                      dosage={med.dosageText}
                      scheduleText={getScheduleDisplay(med)}
                      statusLabel={isLowStock ? 'Low stock' : med.lifecycleStatus === 'ACTIVE' ? 'Active' : med.lifecycleStatus === 'COMPLETED' ? 'Completed' : 'Starts later'}
                      statusVariant={isLowStock ? 'lowStock' : med.lifecycleStatus === 'ACTIVE' ? 'taken' : 'queued'}
                      stockText={med.trackStock ? `${med.currentStock} ${med.doseUnit} left` : undefined}
                      onPress={() => router.push(`/medicine/${med.id}`)}
                    />
                  );
                })}
              </View>
            )}

            <View style={styles.addCta}>
              <PrimaryButton
                title="Add another medicine"
                onPress={handleAddMedicine}
                icon={<Ionicons name="add" size={20} color={colors.surface} />}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.huge,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerTitles: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  screenTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(24),
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13.5),
    marginTop: 2,
  },
  quickAddButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#006156',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.card,
    paddingHorizontal: Spacing.md,
    height: 46,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(14),
  },
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    padding: 3,
    borderRadius: Radii.full,
    marginBottom: Spacing.lg,
  },
  filterTab: {
    flex: 1,
    height: 36,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterTabSelected: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  filterTabText: {
    fontSize: scaleFont(12.5),
    textAlign: 'center',
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
    paddingHorizontal: 2,
  },
  sectionHeading: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(11.5),
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(12),
  },
  emptyFilterBox: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },
  emptyFilterText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(14),
  },
  addCta: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
});
