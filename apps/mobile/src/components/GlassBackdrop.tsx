import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Defs, RadialGradient, LinearGradient, Stop, Rect } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Clean, serene Apple iOS frosted-glass backdrop.
 * Designed specifically for a medical reminder app:
 * - Replaces muddy clashing blobs with a tranquil, clean pearl-mint gradient mesh.
 * - Delivers high contrast, calm aesthetics, and optimal readability for patients.
 */
export function GlassBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}`} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* Pristine Ambient Canvas Gradient */}
          <LinearGradient id="sereneCanvas" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#EBF4EE" />
            <Stop offset="35%" stopColor="#F2F8F4" />
            <Stop offset="70%" stopColor="#EEF6F1" />
            <Stop offset="100%" stopColor="#E4EEE7" />
          </LinearGradient>

          {/* Gentle Top Navigation Emerald Aura */}
          <RadialGradient
            id="topHeaderAura"
            cx="65%"
            cy="0%"
            r="65%"
            fx="65%"
            fy="0%"
          >
            <Stop offset="0%" stopColor="#1E6E5D" stopOpacity="0.14" />
            <Stop offset="50%" stopColor="#2A7F6D" stopOpacity="0.05" />
            <Stop offset="100%" stopColor="#EBF4EE" stopOpacity="0" />
          </RadialGradient>

          {/* Soft Mid-Screen Gentle Mint Glow */}
          <RadialGradient
            id="ambientMidGlow"
            cx="15%"
            cy="38%"
            r="55%"
            fx="15%"
            fy="38%"
          >
            <Stop offset="0%" stopColor="#2F947E" stopOpacity="0.09" />
            <Stop offset="60%" stopColor="#3DA48E" stopOpacity="0.02" />
            <Stop offset="100%" stopColor="#F2F8F4" stopOpacity="0" />
          </RadialGradient>

          {/* Subtle Bottom Ambient Anchor */}
          <RadialGradient
            id="bottomAnchorGlow"
            cx="85%"
            cy="90%"
            r="60%"
            fx="85%"
            fy="90%"
          >
            <Stop offset="0%" stopColor="#195B4D" stopOpacity="0.12" />
            <Stop offset="55%" stopColor="#287867" stopOpacity="0.03" />
            <Stop offset="100%" stopColor="#E4EEE7" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Base Serene Gradient */}
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sereneCanvas)" />

        {/* Ambient Lighting Blooms */}
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#topHeaderAura)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ambientMidGlow)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bottomAnchorGlow)" />
      </Svg>
    </View>
  );
}
