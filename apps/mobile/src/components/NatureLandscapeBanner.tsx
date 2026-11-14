import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Circle,
  Path,
  G,
} from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { Radii } from '../theme/tokens';

interface NatureLandscapeBannerProps {
  height?: number;
}

export function NatureLandscapeBanner({ height = 112 }: NatureLandscapeBannerProps) {
  const { themeMode, isDark } = useTheme();
  const screenWidth = Dimensions.get('window').width;
  const bannerWidth = Math.max(screenWidth - 40, 320); // Account for 20px horizontal margins

  // Theme-aware landscape palette matching the reference image
  const palette = useMemo(() => {
    if (isDark) {
      return {
        skyTop: '#13201C',
        skyBottom: '#1D2E28',
        sunColor: '#E6A845',
        sunGlow: 'rgba(230, 168, 69, 0.20)',
        farHill: '#1F382E',
        midHill: '#27473B',
        nearHill: '#2E5446',
        houseWall: '#E0DDD4',
        houseRoof: '#BA6D4D',
        houseDoor: '#1F382E',
        treeLeaves: '#366654',
        treeTrunk: '#5E4A3B',
      };
    }

    switch (themeMode) {
      case 'ocean':
        return {
          skyTop: '#E2F0F9',
          skyBottom: '#CBE5F5',
          sunColor: '#FDD87D',
          sunGlow: 'rgba(253, 216, 125, 0.35)',
          farHill: '#A8D2EB',
          midHill: '#75B5DD',
          nearHill: '#4E9ECB',
          houseWall: '#FAF8F5',
          houseRoof: '#D9754C',
          houseDoor: '#026AA7',
          treeLeaves: '#3A8BB7',
          treeTrunk: '#6F5C4E',
        };
      case 'sunset':
        return {
          skyTop: '#FCE7DA',
          skyBottom: '#F8D1BD',
          sunColor: '#F59A52',
          sunGlow: 'rgba(245, 154, 82, 0.40)',
          farHill: '#E6A680',
          midHill: '#D78454',
          nearHill: '#B86536',
          houseWall: '#FAF4EF',
          houseRoof: '#9C3D18',
          houseDoor: '#422416',
          treeLeaves: '#8C4D2E',
          treeTrunk: '#5A3723',
        };
      case 'lavender':
        return {
          skyTop: '#EFEBF8',
          skyBottom: '#DFD8F0',
          sunColor: '#FCD680',
          sunGlow: 'rgba(252, 214, 128, 0.35)',
          farHill: '#BFAFE0',
          midHill: '#9F88CD',
          nearHill: '#7D63B5',
          houseWall: '#FAF8FD',
          houseRoof: '#D4715A',
          houseDoor: '#4E347A',
          treeLeaves: '#6B4FA2',
          treeTrunk: '#5C483F',
        };
      case 'nature':
      default:
        // Reference image exact colors (rolling green hills, golden sun, cozy cottage)
        return {
          skyTop: '#E6F3E6',
          skyBottom: '#CEE8D0',
          sunColor: '#FBD170',
          sunGlow: 'rgba(251, 209, 112, 0.35)',
          farHill: '#97BF94',
          midHill: '#6B9F68',
          nearHill: '#4D854A',
          houseWall: '#FFFBF5',
          houseRoof: '#D46747',
          houseDoor: '#3A6337',
          treeLeaves: '#2E5E2C',
          treeTrunk: '#6A5343',
        };
    }
  }, [themeMode, isDark]);

  return (
    <View style={[styles.container, { height }]}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 360 115"
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <LinearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={palette.skyTop} />
            <Stop offset="100%" stopColor={palette.skyBottom} />
          </LinearGradient>
          <LinearGradient id="sunGlowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={palette.sunGlow} />
            <Stop offset="100%" stopColor="transparent" />
          </LinearGradient>
        </Defs>

        {/* Sky Background */}
        <Rect x="0" y="0" width="360" height="115" fill="url(#skyGrad)" />

        {/* Rising / Setting Warm Sun */}
        <Circle cx="155" cy="58" r="28" fill="url(#sunGlowGrad)" />
        <Circle cx="155" cy="58" r="15" fill={palette.sunColor} />

        {/* Far Background Rolling Hills */}
        <Path
          d="M-10 115 L-10 75 Q40 50 110 65 T240 68 Q290 55 370 70 L370 115 Z"
          fill={palette.farHill}
        />

        {/* Middle Hills */}
        <Path
          d="M-10 115 L-10 82 Q60 66 140 80 T280 72 Q320 68 370 78 L370 115 Z"
          fill={palette.midHill}
        />

        {/* Cozy Cottage on the right hill */}
        <G transform="translate(262, 54)">
          {/* Chimney */}
          <Rect x="26" y="0" width="5" height="12" fill="#B3583C" />
          {/* Roof */}
          <Path d="M-4 13 L17 0 L38 13 Z" fill={palette.houseRoof} />
          {/* Walls */}
          <Rect x="0" y="13" width="34" height="24" fill={palette.houseWall} rx="1" />
          {/* Door */}
          <Rect x="13" y="23" width="8" height="14" fill={palette.houseDoor} rx="1" />
          {/* Small Window */}
          <Rect x="4" y="17" width="6" height="6" fill="#FEECA8" rx="1" />
        </G>

        {/* Trees around the house and on hills */}
        {/* Tree Left (Large) */}
        <G transform="translate(18, 52)">
          <Rect x="14" y="24" width="4" height="18" fill={palette.treeTrunk} rx="1" />
          <Circle cx="16" cy="18" r="14" fill={palette.treeLeaves} />
          <Circle cx="10" cy="14" r="10" fill={palette.nearHill} />
        </G>
        {/* Tree Left (Small) */}
        <G transform="translate(42, 60)">
          <Rect x="8" y="18" width="3" height="14" fill={palette.treeTrunk} rx="1" />
          <Circle cx="10" cy="12" r="10" fill={palette.treeLeaves} />
        </G>

        {/* Tree Right behind house */}
        <G transform="translate(235, 48)">
          <Rect x="10" y="22" width="4" height="16" fill={palette.treeTrunk} rx="1" />
          <Circle cx="12" cy="16" r="13" fill={palette.treeLeaves} />
        </G>
        {/* Tree far right */}
        <G transform="translate(315, 52)">
          <Rect x="10" y="20" width="4" height="16" fill={palette.treeTrunk} rx="1" />
          <Circle cx="12" cy="14" r="12" fill={palette.treeLeaves} />
        </G>

        {/* Near Foreground Hill */}
        <Path
          d="M-10 115 L-10 94 Q70 82 170 96 T370 88 L370 115 Z"
          fill={palette.nearHill}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: Radii.card,
    overflow: 'hidden',
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
});
