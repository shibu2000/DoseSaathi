import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

interface ThemeThumbnailProps {
  theme: 'nature' | 'ocean' | 'sunset' | 'lavender';
  width?: number;
  height?: number;
}

export function ThemeThumbnail({ theme, width = 64, height = 44 }: ThemeThumbnailProps) {
  if (theme === 'ocean') {
    return (
      <View style={[styles.container, { width, height }]}>
        <Svg width={width} height={height} viewBox="0 0 64 44" fill="none">
          <Defs>
            <LinearGradient id="oceanSky" x1="0" y1="0" x2="0" y2="44" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#BFE2F9" />
              <Stop offset="1" stopColor="#E2F1FB" />
            </LinearGradient>
            <LinearGradient id="wave1" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#4195D1" />
              <Stop offset="1" stopColor="#2A7DBB" />
            </LinearGradient>
            <LinearGradient id="wave2" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#1E659A" />
              <Stop offset="1" stopColor="#134B75" />
            </LinearGradient>
          </Defs>
          <Rect width="64" height="44" rx="10" fill="url(#oceanSky)" />
          {/* Gentle sun */}
          <Circle cx="32" cy="18" r="9" fill="#FFF275" opacity="0.9" />
          {/* Back wave */}
          <Path
            d="M-2 26 C14 21, 24 28, 40 24 C50 21, 58 24, 66 22 L66 46 L-2 46 Z"
            fill="url(#wave1)"
          />
          {/* Front wave */}
          <Path
            d="M-2 32 C12 28, 22 35, 36 30 C48 26, 56 32, 66 29 L66 46 L-2 46 Z"
            fill="url(#wave2)"
          />
        </Svg>
      </View>
    );
  }

  if (theme === 'sunset') {
    return (
      <View style={[styles.container, { width, height }]}>
        <Svg width={width} height={height} viewBox="0 0 64 44" fill="none">
          <Defs>
            <LinearGradient id="sunsetSky" x1="0" y1="0" x2="0" y2="44" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#FFC875" />
              <Stop offset="0.6" stopColor="#FF9B54" />
              <Stop offset="1" stopColor="#F56D42" />
            </LinearGradient>
            <LinearGradient id="sunHill1" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#C9512A" />
              <Stop offset="1" stopColor="#A83E1E" />
            </LinearGradient>
          </Defs>
          <Rect width="64" height="44" rx="10" fill="url(#sunsetSky)" />
          {/* Bright setting sun */}
          <Circle cx="32" cy="20" r="11" fill="#FFF8B6" />
          {/* Gentle warm hills */}
          <Path
            d="M-2 30 C16 23, 30 33, 44 26 C54 22, 60 26, 66 24 L66 46 L-2 46 Z"
            fill="#D95C2E"
            opacity="0.8"
          />
          <Path
            d="M-2 35 C14 31, 28 38, 42 33 C52 29, 60 34, 66 32 L66 46 L-2 46 Z"
            fill="url(#sunHill1)"
          />
        </Svg>
      </View>
    );
  }

  if (theme === 'lavender') {
    return (
      <View style={[styles.container, { width, height }]}>
        <Svg width={width} height={height} viewBox="0 0 64 44" fill="none">
          <Defs>
            <LinearGradient id="lavenderSky" x1="0" y1="0" x2="0" y2="44" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#D8D0EE" />
              <Stop offset="1" stopColor="#F1EDF8" />
            </LinearGradient>
            <LinearGradient id="lavMountain1" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#8A77B5" />
              <Stop offset="1" stopColor="#6C579A" />
            </LinearGradient>
            <LinearGradient id="lavMountain2" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#554280" />
              <Stop offset="1" stopColor="#3E2E63" />
            </LinearGradient>
          </Defs>
          <Rect width="64" height="44" rx="10" fill="url(#lavenderSky)" />
          {/* Soft moon/sun */}
          <Circle cx="32" cy="18" r="9" fill="#FFF9DE" opacity="0.95" />
          {/* Distant mountain */}
          <Path
            d="M-2 31 L18 19 L38 31 L66 21 L66 46 L-2 46 Z"
            fill="url(#lavMountain1)"
            opacity="0.75"
          />
          {/* Foreground mountain peak */}
          <Path
            d="M6 46 L28 25 L50 46 Z"
            fill="url(#lavMountain2)"
          />
        </Svg>
      </View>
    );
  }

  // Default: Nature Green
  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height} viewBox="0 0 64 44" fill="none">
        <Defs>
          <LinearGradient id="natureSky" x1="0" y1="0" x2="0" y2="44" gradientUnits="userSpaceOnUse">
            <Stop stopColor="#D5F1E5" />
            <Stop offset="1" stopColor="#EFF8F4" />
          </LinearGradient>
          <LinearGradient id="hillBack" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <Stop stopColor="#5CA68A" />
            <Stop offset="1" stopColor="#438E73" />
          </LinearGradient>
          <LinearGradient id="hillFront" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <Stop stopColor="#256B54" />
            <Stop offset="1" stopColor="#1B513F" />
          </LinearGradient>
        </Defs>
        <Rect width="64" height="44" rx="10" fill="url(#natureSky)" />
        {/* Morning sun */}
        <Circle cx="32" cy="17" r="9" fill="#FFDE6A" />
        {/* Back hill */}
        <Path
          d="M-2 26 C12 20, 24 28, 42 22 C52 19, 58 23, 66 21 L66 46 L-2 46 Z"
          fill="url(#hillBack)"
        />
        {/* Small cottage */}
        <Rect x="44" y="24" width="8" height="6" fill="#FFFDF8" rx="0.5" />
        <Path d="M42 24 L48 19 L54 24 Z" fill="#C8634B" />
        {/* Trees */}
        <Circle cx="12" cy="24" r="5" fill="#1C5E47" />
        <Circle cx="18" cy="26" r="4" fill="#2E7E62" />
        {/* Front rolling hill */}
        <Path
          d="M-2 32 C12 27, 26 35, 42 30 C54 26, 60 31, 66 29 L66 46 L-2 46 Z"
          fill="url(#hillFront)"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    overflow: 'hidden',
    flexShrink: 0,
  },
});
