import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Colors, Radii, Spacing, Typography, scaleFont, FontFamily } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
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
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.headerContainer,
        {
          paddingTop: Math.max(insets.top, 24),
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.headerBar}>
        <View style={styles.headerBrand}>
          {isCommunityIcon ? (
            <MaterialCommunityIcons name={iconName} size={24} color={colors.primary} />
          ) : (
            <MaterialIcons name={iconName} size={24} color={colors.primary} />
          )}
          <Text style={[styles.headerBrandText, { color: colors.textPrimary }]}>{title}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[
              styles.headerSettingsButton,
              { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceSecondary },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push('/settings')}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function PatientTabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const hasBottomInset = insets.bottom > 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: hasBottomInset ? 62 + insets.bottom : 66,
          paddingTop: 6,
          paddingBottom: hasBottomInset ? insets.bottom : 6,
          elevation: isDark ? 2 : 4,
          shadowColor: colors.textPrimary,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: isDark ? 0.25 : 0.05,
          shadowRadius: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: 2,
        },
        tabBarLabelStyle: {
          fontFamily: FontFamily.semiBold,
          fontSize: scaleFont(11.5),
          marginTop: 2,
        },
      }}
    >
      {/* 1. Home / Today Screen */}
      <Tabs.Screen
        name="today"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={22}
              color={focused ? colors.primary : colors.textSecondary}
            />
          ),
        }}
      />

      {/* 2. Medicines List */}
      <Tabs.Screen
        name="medicines/index"
        options={{
          title: 'Medicines',
          tabBarLabel: 'Medicines',
          headerShown: true,
          header: () => <PatientTabHeader title="Medicines" iconName="medication" />,
          tabBarIcon: ({ focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'pill' : 'pill'}
              size={23}
              color={focused ? colors.primary : colors.textSecondary}
            />
          ),
        }}
      />

      {/* 3. Central Elevated Add Medicine Button */}
      <Tabs.Screen
        name="add"
        options={{
          title: '',
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          tabBarButton: () => (
            <View style={styles.centerAddWrapper}>
              <TouchableOpacity
                style={[
                  styles.centerAddButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={() => router.push('/medicine/new/details')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Add new medicine"
              >
                <Ionicons name="add" size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/medicine/new/details');
          },
        }}
      />

      {/* 4. Family Hub */}
      <Tabs.Screen
        name="family/link"
        options={{
          title: 'Family',
          tabBarLabel: 'Family',
          headerShown: true,
          header: () => <PatientTabHeader title="Family" iconName="diversity-1" />,
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'people' : 'people-outline'}
              size={23}
              color={focused ? colors.primary : colors.textSecondary}
            />
          ),
        }}
      />

      {/* 5. More / Settings Hub */}
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarLabel: 'More',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'grid' : 'grid-outline'}
              size={21}
              color={focused ? colors.primary : colors.textSecondary}
            />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/settings');
          },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    zIndex: 10,
  },
  headerBar: {
    minHeight: 54,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBrand: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBrandText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(19),
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerSettingsButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerAddWrapper: {
    top: -12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  centerAddButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#006156',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});
