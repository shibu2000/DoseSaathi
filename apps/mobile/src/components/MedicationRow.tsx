import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Radii, Spacing, scaleFont, FontFamily } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { StatusTag, StatusVariant } from './StatusTag';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

interface MedicationRowProps {
  name: string;
  dosage: string;
  scheduleText: string;
  statusLabel: string;
  statusVariant: StatusVariant;
  stockText?: string;
  onPress: () => void;
}

export function MedicationRow({
  name,
  dosage,
  scheduleText,
  statusLabel,
  statusVariant,
  stockText,
  onPress,
}: MedicationRowProps) {
  const { colors, isDark } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${dosage}, ${scheduleText}, ${statusLabel}`}
    >
      {/* Pill Emblem Badge */}
      <View style={[styles.emblemBadge, { backgroundColor: colors.primaryLight }]}>
        <MaterialCommunityIcons name="pill" size={22} color={colors.primary} />
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          <StatusTag label={statusLabel} variant={statusVariant} />
        </View>

        <Text style={[styles.dosage, { color: colors.textSecondary }]}>{dosage}</Text>
        
        <View style={styles.scheduleRow}>
          <Ionicons name="time-outline" size={13} color={colors.textSecondary} style={{ marginRight: 4 }} />
          <Text style={[styles.scheduleText, { color: colors.textSecondary }]} numberOfLines={1}>
            {scheduleText}
          </Text>
        </View>

        {stockText && (
          <View style={styles.stockRow}>
            <View style={[styles.stockBadge, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Ionicons name="cube-outline" size={12} color={colors.warning} style={{ marginRight: 4 }} />
              <Text style={[styles.stockText, { color: colors.warning }]}>{stockText}</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.chevronContainer}>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.md + 2,
    marginVertical: Spacing.xs + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  emblemBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(16),
    flex: 1,
    marginRight: Spacing.xs,
  },
  dosage: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13.5),
    marginBottom: 4,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduleText: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(12.5),
    flex: 1,
  },
  stockRow: {
    marginTop: 6,
    flexDirection: 'row',
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
  stockText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(11.5),
  },
  chevronContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
});
