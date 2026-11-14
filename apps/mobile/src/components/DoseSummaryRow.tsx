import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Radii, Spacing, scaleFont, FontFamily } from '../theme/tokens';

interface DoseSummaryRowProps {
  dueCount: number;
  takenCount: number;
  upcomingCount: number;
  dateText?: string;
  onFilterPress?: (type: 'due' | 'taken' | 'upcoming') => void;
}

export function DoseSummaryRow({
  dueCount,
  takenCount,
  upcomingCount,
  dateText,
  onFilterPress,
}: DoseSummaryRowProps) {
  const { colors, isDark } = useTheme();

  const formattedDate = dateText || new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <View style={styles.container}>
      {/* Section Header Row */}
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          Today's Medicines
        </Text>
        <Text style={[styles.dateText, { color: colors.textSecondary }]}>
          {formattedDate}
        </Text>
      </View>

      {/* 3 Summary Stat Cards */}
      <View style={styles.cardsRow}>
        {/* 1. Due Card */}
        <TouchableOpacity
          style={[
            styles.statCard,
            {
              backgroundColor: isDark ? 'rgba(0, 97, 86, 0.18)' : '#E8F5EE',
              borderColor: isDark ? 'rgba(0, 97, 86, 0.35)' : '#D7EDE2',
            },
          ]}
          onPress={() => onFilterPress?.('due')}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${dueCount} medicines due`}
        >
          <View style={styles.iconRow}>
            <MaterialCommunityIcons name="spoon-sugar" size={19} color={colors.primary} />
          </View>
          <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{dueCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Due</Text>
        </TouchableOpacity>

        {/* 2. Taken Card */}
        <TouchableOpacity
          style={[
            styles.statCard,
            {
              backgroundColor: isDark ? 'rgba(37, 132, 93, 0.18)' : '#E2F3EB',
              borderColor: isDark ? 'rgba(37, 132, 93, 0.35)' : '#D2EBDD',
            },
          ]}
          onPress={() => onFilterPress?.('taken')}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${takenCount} medicines taken`}
        >
          <View style={styles.iconRow}>
            <Ionicons name="checkmark-sharp" size={19} color={colors.success} />
          </View>
          <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{takenCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Taken</Text>
        </TouchableOpacity>

        {/* 3. Upcoming Card */}
        <TouchableOpacity
          style={[
            styles.statCard,
            {
              backgroundColor: isDark ? 'rgba(217, 154, 54, 0.18)' : '#FEF6E8',
              borderColor: isDark ? 'rgba(217, 154, 54, 0.35)' : '#FAEACF',
            },
          ]}
          onPress={() => onFilterPress?.('upcoming')}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${upcomingCount} upcoming medicines`}
        >
          <View style={styles.iconRow}>
            <Ionicons name="time-outline" size={19} color={colors.warning} />
          </View>
          <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{upcomingCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Upcoming</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm + 2,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(18),
    letterSpacing: -0.2,
  },
  dateText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13),
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: Radii.card,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 96,
  },
  iconRow: {
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(23),
    lineHeight: scaleFont(28),
  },
  statLabel: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(12.5),
    marginTop: 1,
  },
});
