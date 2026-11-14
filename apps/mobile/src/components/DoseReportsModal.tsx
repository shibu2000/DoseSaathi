import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Radii, Spacing, scaleFont, FontFamily } from '../theme/tokens';
import type { OccurrenceWithMedication } from '../database';

interface DoseReportsModalProps {
  visible: boolean;
  onClose: () => void;
  occurrences: OccurrenceWithMedication[];
}

export function DoseReportsModal({ visible, onClose, occurrences }: DoseReportsModalProps) {
  const { colors, isDark } = useTheme();

  const total = occurrences.length;
  const taken = occurrences.filter((o) => o.state === 'TAKEN').length;
  const skipped = occurrences.filter((o) => o.state === 'SKIPPED').length;
  const pending = total - taken - skipped;
  const adherence = total > 0 ? Math.round((taken / total) * 100) : 100;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Medication Report</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Today's schedule & adherence summary
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.surfaceSecondary }]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close report"
            >
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            {/* Big Adherence Card */}
            <View
              style={[
                styles.adherenceCard,
                {
                  backgroundColor: isDark ? 'rgba(0, 97, 86, 0.2)' : '#E8F5EE',
                  borderColor: isDark ? 'rgba(0, 97, 86, 0.35)' : '#D7EDE2',
                },
              ]}
            >
              <View style={styles.adherenceLeft}>
                <Text style={[styles.adherencePercent, { color: colors.primary }]}>
                  {adherence}%
                </Text>
                <Text style={[styles.adherenceLabel, { color: colors.textSecondary }]}>
                  Today's adherence rate
                </Text>
              </View>
              <View style={[styles.adherenceBadge, { backgroundColor: colors.primary }]}>
                <Ionicons name="shield-checkmark" size={28} color="#FFFFFF" />
              </View>
            </View>

            {/* Breakdown Stats */}
            <View style={styles.statsGrid}>
              <View
                style={[
                  styles.statBox,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{total}</Text>
                <Text style={[styles.statName, { color: colors.textSecondary }]}>Total Doses</Text>
              </View>

              <View
                style={[
                  styles.statBox,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.statValue, { color: colors.success }]}>{taken}</Text>
                <Text style={[styles.statName, { color: colors.textSecondary }]}>Taken on time</Text>
              </View>

              <View
                style={[
                  styles.statBox,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.statValue, { color: colors.warning }]}>{pending}</Text>
                <Text style={[styles.statName, { color: colors.textSecondary }]}>Pending</Text>
              </View>

              <View
                style={[
                  styles.statBox,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.statValue, { color: colors.error }]}>{skipped}</Text>
                <Text style={[styles.statName, { color: colors.textSecondary }]}>Skipped</Text>
              </View>
            </View>

            {/* Clinical Disclaimer */}
            <View
              style={[
                styles.disclaimerBox,
                { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
              ]}
            >
              <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.disclaimerText, { color: colors.textSecondary }]}>
                This report reflects your recorded reminder tracking on this phone. Always consult your doctor or pharmacist regarding prescription schedules.
              </Text>
            </View>
          </ScrollView>

          {/* Close Action */}
          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: colors.primary }]}
            onPress={onClose}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    padding: Spacing.xl,
    maxHeight: '80%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(19),
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13),
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    marginBottom: 16,
  },
  adherenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderRadius: Radii.card,
    borderWidth: 1,
    marginBottom: 16,
  },
  adherenceLeft: {
    flex: 1,
  },
  adherencePercent: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(34),
    lineHeight: scaleFont(40),
  },
  adherenceLabel: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13.5),
    marginTop: 2,
  },
  adherenceBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    padding: 14,
    borderRadius: Radii.card - 4,
    borderWidth: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(22),
  },
  statName: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(12.5),
    marginTop: 4,
  },
  disclaimerBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    gap: 8,
    alignItems: 'flex-start',
  },
  disclaimerText: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(12),
    lineHeight: scaleFont(17),
  },
  doneButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(15.5),
    color: '#FFFFFF',
  },
});
