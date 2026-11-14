import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Radii, Spacing, scaleFont, FontFamily } from '../theme/tokens';

interface QuickActionsRowProps {
  onAddPress: () => void;
  onMedicinesPress: () => void;
  onFamilyPress: () => void;
  onReportsPress: () => void;
}

export function QuickActionsRow({
  onAddPress,
  onMedicinesPress,
  onFamilyPress,
  onReportsPress,
}: QuickActionsRowProps) {
  const { isDark, colors } = useTheme();

  const actions = [
    {
      id: 'add',
      title: 'Add\nMedicine',
      icon: <Ionicons name="add" size={24} color="#006156" />,
      bg: isDark ? 'rgba(0, 97, 86, 0.22)' : '#E8F5EE',
      onPress: onAddPress,
      accessibilityLabel: 'Add a new medicine',
    },
    {
      id: 'medicines',
      title: 'My\nMedicines',
      icon: <MaterialCommunityIcons name="pill" size={24} color="#D99A36" />,
      bg: isDark ? 'rgba(217, 154, 54, 0.22)' : '#FEF6E8',
      onPress: onMedicinesPress,
      accessibilityLabel: 'View my medicines',
    },
    {
      id: 'family',
      title: 'Family',
      icon: <Ionicons name="people-outline" size={24} color="#6B4FA2" />,
      bg: isDark ? 'rgba(107, 79, 162, 0.22)' : '#F0EDF9',
      onPress: onFamilyPress,
      accessibilityLabel: 'Manage family and caregivers',
    },
    {
      id: 'reports',
      title: 'Reports',
      icon: <Ionicons name="bar-chart-outline" size={23} color="#CC665B" />,
      bg: isDark ? 'rgba(204, 102, 91, 0.22)' : '#FCEEEF',
      onPress: onReportsPress,
      accessibilityLabel: 'View dose reports and history',
    },
  ];

  return (
    <View style={styles.container}>
      {actions.map((act) => (
        <TouchableOpacity
          key={act.id}
          style={[styles.actionCard, { backgroundColor: act.bg }]}
          onPress={act.onPress}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={act.accessibilityLabel}
        >
          <View style={styles.iconContainer}>{act.icon}</View>
          <Text
            style={[styles.actionTitle, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {act.title}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: Spacing.sm,
  },
  actionCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: Radii.card - 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
  },
  iconContainer: {
    marginBottom: 6,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(12),
    lineHeight: scaleFont(15),
    textAlign: 'center',
  },
});
