import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Colors, Typography, Spacing } from '@/theme/tokens';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function CaregiverTabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasBottomInset = insets.bottom > 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: Colors.canvas },
        headerShadowVisible: false,
        headerTitleStyle: { ...Typography.headlineSmall, color: Colors.ink },
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.outline,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: hasBottomInset ? 64 + insets.bottom : 68,
          paddingTop: 6,
          paddingBottom: hasBottomInset ? insets.bottom : 6,
          elevation: 4,
          shadowColor: Colors.ink,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 6,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.inkMuted,
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
            <Ionicons name="settings-outline" size={22} color={Colors.ink} />
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
          tabBarIcon: ({ color }) => (
            <Ionicons name="people-outline" size={22} color={typeof color === 'string' ? color : Colors.brand} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarLabel: 'Schedule',
          tabBarAccessibilityLabel: 'Schedule of the selected family member',
          tabBarIcon: ({ color }) => (
            <Ionicons name="calendar-outline" size={22} color={typeof color === 'string' ? color : Colors.brand} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarLabel: 'Activity',
          tabBarIcon: ({ color }) => (
            <Ionicons name="receipt-outline" size={22} color={typeof color === 'string' ? color : Colors.brand} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-circle-outline" size={22} color={typeof color === 'string' ? color : Colors.brand} />
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
