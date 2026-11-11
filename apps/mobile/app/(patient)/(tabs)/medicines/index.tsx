import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MedicationRow } from '@/components/MedicationRow';
import { EmptyState } from '@/components/EmptyState';
import { PrimaryButton } from '@/components/Buttons';
import { Colors, Radii, Spacing, Typography } from '@/theme/tokens';
import { useApp } from '@/state/AppContext';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

type FilterType = 'all' | 'active' | 'queued' | 'completed';

export default function MedicinesListScreen() {
  const router = useRouter();
  const { medications, refreshMedications, clearDraft } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Intro Subtitle & Quick Add Header Row */}
        <View style={styles.headerSubtitleRow}>
          <Text style={styles.headerSubtitle}>Manage your medication plans.</Text>
          <TouchableOpacity
            style={styles.quickAddButton}
            onPress={handleAddMedicine}
            accessibilityRole="button"
            accessibilityLabel="Add medication"
            activeOpacity={0.7}
          >
            <MaterialIcons name="add" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterContainer}>
          {(['all', 'active', 'queued', 'completed'] as FilterType[]).map((tab) => {
            const isSelected = filter === tab;
            const labels: Record<FilterType, string> = {
              all: 'All',
              active: 'Active',
              queued: 'Queued',
              completed: 'Completed',
            };
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.filterTab, isSelected && styles.filterTabSelected]}
                onPress={() => setFilter(tab)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${labels[tab]} medicines`}
                accessibilityState={{ selected: isSelected }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={[
                    styles.filterTabText,
                    isSelected && styles.filterTabTextSelected,
                  ]}
                >
                  {labels[tab]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {isEmpty ? (
          <EmptyState
            icon={<MaterialCommunityIcons name="pill" size={44} color={Colors.brand} />}
            title="No medicines added"
            description="You have not added any medicines to your local schedule yet."
            buttonTitle="Add your first medicine"
            onButtonPress={handleAddMedicine}
          />
        ) : filteredMeds.length === 0 ? (
          <View style={styles.emptyFilterBox}>
            <Text style={styles.emptyFilterText}>No medicines in this category.</Text>
          </View>
        ) : (
          <>
            {/* List rendered according to category filter */}
            {filter === 'all' ? (
              <>
                {activeMeds.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionHeading}>Current schedule</Text>
                      <Text style={styles.sectionCount}>{activeMeds.length} active</Text>
                    </View>
                    {activeMeds.map((med) => {
                      const isLowStock = med.trackStock && med.currentStock <= med.lowStockThreshold;
                      return (
                        <MedicationRow
                          key={med.id}
                          name={med.name}
                          dosage={med.dosageText}
                          scheduleText={med.instructions || 'No instructions added'}
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
                      <Text style={styles.sectionHeading}>Starts later</Text>
                      <Text style={styles.sectionCount}>{queuedMeds.length} queued</Text>
                    </View>
                    {queuedMeds.map((med) => (
                      <MedicationRow
                        key={med.id}
                        name={med.name}
                        dosage={med.dosageText}
                        scheduleText="Starts after this course"
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
                      <Text style={styles.sectionHeading}>Completed</Text>
                      <Text style={styles.sectionCount}>{completedMeds.length} finished</Text>
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
                      scheduleText={med.instructions || 'No instructions added'}
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
                title="Add medicine"
                onPress={handleAddMedicine}
                icon={<Ionicons name="add" size={22} color={Colors.white} />}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.huge,
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerSubtitle: {
    flex: 1,
    paddingRight: Spacing.sm,
    ...Typography.bodyMedium,
    color: Colors.inkMuted,
  },
  quickAddButton: {
    width: 48,
    height: 48,
    borderRadius: Radii.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(212, 217, 210, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceMuted,
    padding: 4,
    borderRadius: Radii.md,
    marginBottom: Spacing.lg,
  },
  filterTab: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 2,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabSelected: {
    backgroundColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  filterTabText: {
    ...Typography.labelSmall,
    color: Colors.inkMuted,
    fontSize: 13,
  },
  filterTabTextSelected: {
    color: Colors.white,
    fontWeight: '700',
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  sectionHeading: {
    ...Typography.labelSmall,
    color: Colors.inkMuted,
  },
  sectionCount: {
    ...Typography.labelSmall,
    color: Colors.primary,
    fontWeight: '600',
  },
  emptyFilterBox: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },
  emptyFilterText: {
    ...Typography.bodyMedium,
    color: Colors.inkMuted,
  },
  addCta: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
});
