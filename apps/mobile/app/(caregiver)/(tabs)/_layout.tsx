import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Typography, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function CaregiverTabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const hasBottomInset = insets.bottom > 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.canvas },
        headerShadowVisible: false,
        headerTitleStyle: { ...Typography.headlineSmall, color: colors.textPrimary },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: hasBottomInset ? 64 + insets.bottom : 68,
          paddingTop: 6,
          paddingBottom: hasBottomInset ? insets.bottom : 6,
          elevation: 4,
          shadowColor: isDark ? '#000000' : 'rgba(0,0,0,0.08)',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: 2,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 2,
        },
        headerRight: () => (
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="family"
        options={{
          title: 'Family Hub',
          tabBarLabel: 'Family',
          tabBarAccessibilityLabel: 'Family Hub',
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={focused ? colors.primary : colors.textSecondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarLabel: 'Schedule',
          tabBarAccessibilityLabel: 'Schedule of the selected family member',
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={focused ? colors.primary : colors.textSecondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarLabel: 'Activity',
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={focused ? colors.primary : colors.textSecondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={22} color={focused ? colors.primary : colors.textSecondary} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  settingsButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
});
