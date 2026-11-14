import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Radii, Spacing, Typography, scaleFont, FontFamily } from '../theme/tokens';
import { MedChainLogo } from './MedChainLogo';

interface DoseSaathiHeaderProps {
  onNotificationsPress?: () => void;
  onProfilePress?: () => void;
  hasUnreadNotifications?: boolean;
}

export function DoseSaathiHeader({
  onNotificationsPress,
  onProfilePress,
  hasUnreadNotifications = true,
}: DoseSaathiHeaderProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.container}>
      {/* Brand Logo & Name */}
      <View style={styles.brandGroup}>
        <MedChainLogo size={28} />
        <Text style={[styles.brandName, { color: colors.textPrimary }]}>DoseSaathi</Text>
      </View>

      {/* Header Actions (Notifications & User Avatar) */}
      <View style={styles.actionsGroup}>
        {/* Notification Bell */}
        <TouchableOpacity
          style={[
            styles.actionButton,
            { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F0F4EF' },
          ]}
          onPress={onNotificationsPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Ionicons
            name="notifications-outline"
            size={20}
            color={colors.textPrimary}
          />
          {hasUnreadNotifications && (
            <View style={[styles.unreadBadgeDot, { backgroundColor: colors.error }]} />
          )}
        </TouchableOpacity>

        {/* User Profile Avatar */}
        <TouchableOpacity
          style={[
            styles.avatarButton,
            { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E0E8E3' },
          ]}
          onPress={onProfilePress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Profile and account"
        >
          <Ionicons name="person" size={17} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#006156',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  brandName: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(20),
    letterSpacing: -0.3,
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  unreadBadgeDot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  avatarButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 97, 86, 0.2)',
  },
});
