import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Rect, Path, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';

interface MedicineBottleGraphicProps {
  size?: number;
}

export function MedicineBottleGraphic({ size = 110 }: MedicineBottleGraphicProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <Defs>
          <LinearGradient id="bgGlow" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop
              offset="0%"
              stopColor={isDark ? 'rgba(0, 97, 86, 0.25)' : '#DDF2E9'}
            />
            <Stop
              offset="100%"
              stopColor={isDark ? 'rgba(0, 97, 86, 0.08)' : '#EAF7F0'}
            />
          </LinearGradient>
        </Defs>

        {/* Soft Circular Backdrop */}
        <Circle cx="60" cy="60" r="54" fill="url(#bgGlow)" />

        {/* Medicine Bottle */}
        <G transform="translate(42, 28)">
          {/* Bottle Cap */}
          <Rect x="8" y="0" width="20" height="9" rx="3" fill="#6FB7A8" />
          <Rect x="11" y="9" width="14" height="4" fill="#589F91" />

          {/* Bottle Body */}
          <Rect x="0" y="13" width="36" height="48" rx="8" fill="#1C7D6F" />
          {/* Subtle highlight */}
          <Rect x="3" y="15" width="4" height="42" rx="2" fill="#3AA897" />

          {/* Label on Bottle */}
          <Rect x="4" y="24" width="28" height="26" rx="4" fill="#FFFFFF" />

          {/* Medical Cross on Label */}
          <Path
            d="M18 31V43M12 37H24"
            stroke="#1C7D6F"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </G>

        {/* Capsule Pill 1 (amber/yellow - bottom right) */}
        <G transform="translate(74, 76) rotate(35)">
          <Rect x="0" y="0" width="18" height="8" rx="4" fill="#F8C25B" />
          <Path d="M9 0 H14 C16.2 0 18 1.8 18 4 C18 6.2 16.2 8 14 8 H9 Z" fill="#F59A52" />
        </G>

        {/* Capsule Pill 2 (white/teal - bottom left) */}
        <G transform="translate(30, 80) rotate(-25)">
          <Rect x="0" y="0" width="16" height="7" rx="3.5" fill="#FFFFFF" />
          <Path d="M8 0 H12.5 C14.4 0 16 1.6 16 3.5 C16 5.4 14.4 7 12.5 7 H8 Z" fill="#4AA494" />
        </G>

        {/* Small round tablet (left) */}
        <Circle cx="30" cy="74" r="4" fill="#E8F4EE" stroke="#A8D5C8" strokeWidth="1" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
});
