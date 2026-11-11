import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Colors, Radii, Spacing, Typography } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

interface PatientTabHeaderProps {
  title: string;
  iconName: any;
  isCommunityIcon?: boolean;
}

function PatientTabHeader({ title, iconName, isCommunityIcon = false }: PatientTabHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <View style={styles.headerBrand}>
          {isCommunityIcon ? (
            <MaterialCommunityIcons name={iconName} size={26} color={Colors.primary} />
          ) : (
            <MaterialIcons name={iconName} size={26} color={Colors.primary} />
          )}
          <Text style={styles.headerBrandText}>{title}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerSettingsButton}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push('/settings')}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={22} color={Colors.ink} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function PatientTabsLayout() {
  const insets = useSafeAreaInsets();
  const hasBottomInset = insets.bottom > 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
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
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarLabel: 'Today',
          header: () => <PatientTabHeader title="Today" iconName="pill" isCommunityIcon />,
          tabBarIcon: ({ color }) => (
            <MaterialIcons
              name="calendar-today"
              size={24}
              color={typeof color === 'string' ? color : Colors.primary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="medicines/index"
        options={{
          title: 'Medicines',
          tabBarLabel: 'Medicines',
          header: () => <PatientTabHeader title="Medicines" iconName="medication" />,
          tabBarIcon: ({ color }) => (
            <MaterialIcons
              name="medication"
              size={24}
              color={typeof color === 'string' ? color : Colors.primary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="family/link"
        options={{
          title: 'Family',
          tabBarLabel: 'Family',
          header: () => <PatientTabHeader title="Family" iconName="diversity-1" />,
          tabBarIcon: ({ color }) => (
            <MaterialIcons
              name="diversity-1"
              size={24}
              color={typeof color === 'string' ? color : Colors.primary}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outline,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 3,
    zIndex: 10,
  },
  headerBar: {
    minHeight: 56,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBrand: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerBrandText: {
    ...Typography.headlineSmall,
    color: Colors.ink,
    fontSize: 20,
    lineHeight: 26,
    flexShrink: 1,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerSettingsButton: {
    width: 48,
    height: 48,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
