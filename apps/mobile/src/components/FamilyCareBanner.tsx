import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Radii, Spacing, scaleFont, FontFamily } from '../theme/tokens';
import Svg, { Circle, Path, Rect, G } from 'react-native-svg';

interface FamilyCareBannerProps {
  onPress: () => void;
}

export function FamilyCareBanner({ onPress }: FamilyCareBannerProps) {
  const { colors, isDark } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: isDark ? 'rgba(0, 97, 86, 0.16)' : '#EBF5F0',
          borderColor: isDark ? 'rgba(0, 97, 86, 0.3)' : '#D7EBE1',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Care for your family together. Add family members and manage their medicines remotely."
    >
      {/* Friendly Family Illustration */}
      <View style={styles.illustrationContainer}>
        <Svg width={72} height={60} viewBox="0 0 72 60" fill="none">
          {/* Background circle */}
          <Circle cx="36" cy="30" r="28" fill={isDark ? '#1C332B' : '#D6EBDF'} />

          {/* Person 1 (Mother/Caregiver - left) */}
          <G transform="translate(10, 10)">
            <Circle cx="12" cy="10" r="7" fill="#E89B72" />
            <Path d="M4 29 C4 18, 20 18, 20 29 Z" fill="#2E6B5E" />
          </G>

          {/* Person 2 (Grandparent/Elder - center) */}
          <G transform="translate(26, 6)">
            <Circle cx="10" cy="11" r="7.5" fill="#F0B58D" />
            <Path d="M3 11 C3 6, 17 6, 17 11 Z" fill="#D9D5CD" />
            <Path d="M2 33 C2 21, 18 21, 18 33 Z" fill="#D99A36" />
          </G>

          {/* Person 3 (Child/Loved one - right) */}
          <G transform="translate(42, 14)">
            <Circle cx="10" cy="8" r="6" fill="#F2B792" />
            <Path d="M4 25 C4 16, 16 16, 16 25 Z" fill="#4C86B8" />
          </G>
        </Svg>
      </View>

      {/* Text Content */}
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Care for your family together
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Add family members and manage their medicines remotely.
        </Text>
      </View>

      {/* Arrow Button */}
      <View style={[styles.arrowButton, { backgroundColor: colors.primary }]}>
        <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: Radii.card,
    borderWidth: 1,
    marginVertical: Spacing.sm,
  },
  illustrationContainer: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(14.5),
    lineHeight: scaleFont(19),
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(12.5),
    lineHeight: scaleFont(17),
    marginTop: 2,
  },
  arrowButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
