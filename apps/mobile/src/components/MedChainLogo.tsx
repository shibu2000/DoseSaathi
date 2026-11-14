import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';
import { useTheme, type ThemeMode } from '../theme/ThemeContext';

const THEMED_ICONS: Record<string, any> = {
  nature: require('../../assets/brand-icon-nature.png'),
  ocean: require('../../assets/brand-icon-ocean.png'),
  sunset: require('../../assets/brand-icon-sunset.png'),
  lavender: require('../../assets/brand-icon-lavender.png'),
  classic: require('../../assets/brand-icon-nature.png'),
  glassmorphism: require('../../assets/brand-icon-nature.png'),
};

export interface MedChainLogoProps {
  size?: number;
  color?: string;
  theme?: ThemeMode;
  style?: StyleProp<ImageStyle>;
}

export function MedChainLogo({ size = 40, theme, style }: MedChainLogoProps) {
  let activeTheme: ThemeMode = 'nature';
  try {
    const themeContext = useTheme();
    activeTheme = theme || themeContext.themeMode || 'nature';
  } catch {
    activeTheme = theme || 'nature';
  }

  const iconSource = THEMED_ICONS[activeTheme] || THEMED_ICONS.nature;

  return (
    <Image
      source={iconSource}
      style={[
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.225),
        },
        style,
      ]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="DoseSaathi Logo"
    />
  );
}
