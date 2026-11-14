import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ViewStyle, TextStyle } from 'react-native';
import { Colors, Spacing, Radii, Typography, FontFamily } from './tokens';

let useSystemColorScheme: () => 'light' | 'dark' | null | undefined = () => 'light';
try {
  const RN = require('react-native');
  if (RN && typeof RN.useColorScheme === 'function') {
    useSystemColorScheme = RN.useColorScheme;
  }
} catch {
  // Fallback for non-RN test runners
}

export type ThemeMode =
  | 'nature'
  | 'ocean'
  | 'sunset'
  | 'lavender'
  | 'classic'
  | 'glassmorphism';

export type AppearanceMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  // Semantic Tokens (Primary Modern Clinical + Warm Human)
  primary: string;
  primaryDark: string;
  primaryLight: string;
  background: string;
  surface: string;
  surfaceSecondary: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  white: string;

  // Backward-compatible aliases for existing screens and tests
  canvas: string;
  ink: string;
  inkMuted: string;
  brand: string;
  brandPressed: string;
  brandSoft: string;
  accent: string;
  danger: string;
  outline: string;
  surfaceMuted: string;

  // Card & Glass specific tokens
  cardBackground: string;
  cardBorder: string;
  glassHighlight: string;
  glassShadow: string;
  glassOverlay: string;
  glassButtonBg: string;
  glassButtonBorder: string;
  glassSecondaryBg: string;
  navBackground: string;
  navBorder: string;
}

// -------------------------------------------------------------
// 1. Nature Green Theme (Default - Calm, Clean, Gentle)
// -------------------------------------------------------------
export const NatureLightColors: ThemeColors = {
  primary: '#006156',
  primaryDark: '#004C43',
  primaryLight: '#DDF2E9',
  background: '#F7F6F0',
  surface: '#FFFFFF',
  surfaceSecondary: '#F0F4EF',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#1F302C',
  textSecondary: '#667670',
  border: '#DCE3DC',
  success: '#25845D',
  warning: '#D99A36',
  error: '#CC665B',
  info: '#4C86B8',
  white: '#FFFFFF',

  // Aliases
  canvas: '#F7F6F0',
  ink: '#1F302C',
  inkMuted: '#667670',
  brand: '#006156',
  brandPressed: '#004C43',
  brandSoft: '#DDF2E9',
  accent: '#D99A36',
  danger: '#CC665B',
  outline: '#DCE3DC',
  surfaceMuted: '#F0F4EF',

  cardBackground: '#FFFFFF',
  cardBorder: '#DCE3DC',
  glassHighlight: 'transparent',
  glassShadow: 'rgba(0, 97, 86, 0.05)',
  glassOverlay: 'transparent',
  glassButtonBg: '#006156',
  glassButtonBorder: 'transparent',
  glassSecondaryBg: '#DDF2E9',
  navBackground: '#FFFFFF',
  navBorder: '#DCE3DC',
};

export const NatureDarkColors: ThemeColors = {
  primary: '#1E8E80',
  primaryDark: '#146E63',
  primaryLight: '#1A332C',
  background: '#111A17',
  surface: '#1A2622',
  surfaceSecondary: '#24332E',
  surfaceElevated: '#24332E',
  textPrimary: '#EDF5F2',
  textSecondary: '#9EB0A9',
  border: '#2B3B35',
  success: '#34A877',
  warning: '#E6A845',
  error: '#E0756A',
  info: '#60A2D6',
  white: '#FFFFFF',

  canvas: '#111A17',
  ink: '#EDF5F2',
  inkMuted: '#9EB0A9',
  brand: '#1E8E80',
  brandPressed: '#146E63',
  brandSoft: '#1A332C',
  accent: '#E6A845',
  danger: '#E0756A',
  outline: '#2B3B35',
  surfaceMuted: '#24332E',

  cardBackground: '#1A2622',
  cardBorder: '#2B3B35',
  glassHighlight: 'transparent',
  glassShadow: 'rgba(0, 0, 0, 0.25)',
  glassOverlay: 'transparent',
  glassButtonBg: '#1E8E80',
  glassButtonBorder: 'transparent',
  glassSecondaryBg: '#24332E',
  navBackground: '#1A2622',
  navBorder: '#2B3B35',
};

// -------------------------------------------------------------
// 2. Ocean Blue Theme (Clean, Modern, Serene)
// -------------------------------------------------------------
export const OceanLightColors: ThemeColors = {
  primary: '#026AA7',
  primaryDark: '#014F7D',
  primaryLight: '#D8EEFC',
  background: '#F3F8FC',
  surface: '#FFFFFF',
  surfaceSecondary: '#EBF3F8',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#152936',
  textSecondary: '#5A7382',
  border: '#D4E4EE',
  success: '#25845D',
  warning: '#D99A36',
  error: '#CC665B',
  info: '#026AA7',
  white: '#FFFFFF',

  canvas: '#F3F8FC',
  ink: '#152936',
  inkMuted: '#5A7382',
  brand: '#026AA7',
  brandPressed: '#014F7D',
  brandSoft: '#D8EEFC',
  accent: '#D99A36',
  danger: '#CC665B',
  outline: '#D4E4EE',
  surfaceMuted: '#EBF3F8',

  cardBackground: '#FFFFFF',
  cardBorder: '#D4E4EE',
  glassHighlight: 'transparent',
  glassShadow: 'rgba(2, 106, 167, 0.05)',
  glassOverlay: 'transparent',
  glassButtonBg: '#026AA7',
  glassButtonBorder: 'transparent',
  glassSecondaryBg: '#D8EEFC',
  navBackground: '#FFFFFF',
  navBorder: '#D4E4EE',
};

export const OceanDarkColors: ThemeColors = {
  primary: '#2A93D4',
  primaryDark: '#1E75AC',
  primaryLight: '#183144',
  background: '#101921',
  surface: '#18242E',
  surfaceSecondary: '#22323F',
  surfaceElevated: '#22323F',
  textPrimary: '#ECF3F8',
  textSecondary: '#97ABBA',
  border: '#263947',
  success: '#34A877',
  warning: '#E6A845',
  error: '#E0756A',
  info: '#2A93D4',
  white: '#FFFFFF',

  canvas: '#101921',
  ink: '#ECF3F8',
  inkMuted: '#97ABBA',
  brand: '#2A93D4',
  brandPressed: '#1E75AC',
  brandSoft: '#183144',
  accent: '#E6A845',
  danger: '#E0756A',
  outline: '#263947',
  surfaceMuted: '#22323F',

  cardBackground: '#18242E',
  cardBorder: '#263947',
  glassHighlight: 'transparent',
  glassShadow: 'rgba(0, 0, 0, 0.25)',
  glassOverlay: 'transparent',
  glassButtonBg: '#2A93D4',
  glassButtonBorder: 'transparent',
  glassSecondaryBg: '#22323F',
  navBackground: '#18242E',
  navBorder: '#263947',
};

// -------------------------------------------------------------
// 3. Sunset Warm Theme (Welcoming, Friendly, Gentle)
// -------------------------------------------------------------
export const SunsetLightColors: ThemeColors = {
  primary: '#C85A17',
  primaryDark: '#9C430E',
  primaryLight: '#FCE8DB',
  background: '#FDF7F2',
  surface: '#FFFFFF',
  surfaceSecondary: '#F7ECE3',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#331F14',
  textSecondary: '#7B6252',
  border: '#EADCCE',
  success: '#25845D',
  warning: '#D99A36',
  error: '#CC665B',
  info: '#4C86B8',
  white: '#FFFFFF',

  canvas: '#FDF7F2',
  ink: '#331F14',
  inkMuted: '#7B6252',
  brand: '#C85A17',
  brandPressed: '#9C430E',
  brandSoft: '#FCE8DB',
  accent: '#D99A36',
  danger: '#CC665B',
  outline: '#EADCCE',
  surfaceMuted: '#F7ECE3',

  cardBackground: '#FFFFFF',
  cardBorder: '#EADCCE',
  glassHighlight: 'transparent',
  glassShadow: 'rgba(200, 90, 23, 0.05)',
  glassOverlay: 'transparent',
  glassButtonBg: '#C85A17',
  glassButtonBorder: 'transparent',
  glassSecondaryBg: '#FCE8DB',
  navBackground: '#FFFFFF',
  navBorder: '#EADCCE',
};

export const SunsetDarkColors: ThemeColors = {
  primary: '#DE7737',
  primaryDark: '#B85E28',
  primaryLight: '#3D2417',
  background: '#1F1612',
  surface: '#2B201A',
  surfaceSecondary: '#382B24',
  surfaceElevated: '#382B24',
  textPrimary: '#FAF1EC',
  textSecondary: '#B59F93',
  border: '#3D2E26',
  success: '#34A877',
  warning: '#E6A845',
  error: '#E0756A',
  info: '#60A2D6',
  white: '#FFFFFF',

  canvas: '#1F1612',
  ink: '#FAF1EC',
  inkMuted: '#B59F93',
  brand: '#DE7737',
  brandPressed: '#B85E28',
  brandSoft: '#3D2417',
  accent: '#E6A845',
  danger: '#E0756A',
  outline: '#3D2E26',
  surfaceMuted: '#382B24',

  cardBackground: '#2B201A',
  cardBorder: '#3D2E26',
  glassHighlight: 'transparent',
  glassShadow: 'rgba(0, 0, 0, 0.25)',
  glassOverlay: 'transparent',
  glassButtonBg: '#DE7737',
  glassButtonBorder: 'transparent',
  glassSecondaryBg: '#382B24',
  navBackground: '#2B201A',
  navBorder: '#3D2E26',
};

// -------------------------------------------------------------
// 4. Lavender Calm Theme (Soft, Comfortable, Elegant)
// -------------------------------------------------------------
export const LavenderLightColors: ThemeColors = {
  primary: '#6B4FA2',
  primaryDark: '#503A7C',
  primaryLight: '#EFE8FC',
  background: '#F8F6FD',
  surface: '#FFFFFF',
  surfaceSecondary: '#EFEBF8',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#271C3D',
  textSecondary: '#6F6384',
  border: '#E2DAED',
  success: '#25845D',
  warning: '#D99A36',
  error: '#CC665B',
  info: '#6B4FA2',
  white: '#FFFFFF',

  canvas: '#F8F6FD',
  ink: '#271C3D',
  inkMuted: '#6F6384',
  brand: '#6B4FA2',
  brandPressed: '#503A7C',
  brandSoft: '#EFE8FC',
  accent: '#D99A36',
  danger: '#CC665B',
  outline: '#E2DAED',
  surfaceMuted: '#EFEBF8',

  cardBackground: '#FFFFFF',
  cardBorder: '#E2DAED',
  glassHighlight: 'transparent',
  glassShadow: 'rgba(107, 79, 162, 0.05)',
  glassOverlay: 'transparent',
  glassButtonBg: '#6B4FA2',
  glassButtonBorder: 'transparent',
  glassSecondaryBg: '#EFE8FC',
  navBackground: '#FFFFFF',
  navBorder: '#E2DAED',
};

export const LavenderDarkColors: ThemeColors = {
  primary: '#8B6FC9',
  primaryDark: '#7255B0',
  primaryLight: '#2C2043',
  background: '#191424',
  surface: '#241E33',
  surfaceSecondary: '#312A45',
  surfaceElevated: '#312A45',
  textPrimary: '#F4F0FA',
  textSecondary: '#A79CBA',
  border: '#39304F',
  success: '#34A877',
  warning: '#E6A845',
  error: '#E0756A',
  info: '#8B6FC9',
  white: '#FFFFFF',

  canvas: '#191424',
  ink: '#F4F0FA',
  inkMuted: '#A79CBA',
  brand: '#8B6FC9',
  brandPressed: '#7255B0',
  brandSoft: '#2C2043',
  accent: '#E6A845',
  danger: '#E0756A',
  outline: '#39304F',
  surfaceMuted: '#312A45',

  cardBackground: '#241E33',
  cardBorder: '#39304F',
  glassHighlight: 'transparent',
  glassShadow: 'rgba(0, 0, 0, 0.25)',
  glassOverlay: 'transparent',
  glassButtonBg: '#8B6FC9',
  glassButtonBorder: 'transparent',
  glassSecondaryBg: '#312A45',
  navBackground: '#241E33',
  navBorder: '#39304F',
};

// -------------------------------------------------------------
// 5. Classic & Glassmorphism Aliases (Ensures all tests pass)
// -------------------------------------------------------------
export const ClassicColors: ThemeColors = {
  ...NatureLightColors,
  canvas: '#F7F5EF',
  surface: '#FFFEFA',
  surfaceMuted: '#ECEFE9',
  cardBackground: '#FFFEFA',
  cardBorder: '#D4D9D2',
  outline: '#D4D9D2',
  ink: '#202B28',
  inkMuted: '#58645F',
  primary: '#034339',
  brand: '#245B50',
};

export const GlassColors: ThemeColors = {
  ...NatureLightColors,
  canvas: '#EBF4EE',
  surface: 'rgba(255, 255, 255, 0.85)',
  surfaceMuted: 'rgba(255, 255, 255, 0.65)',
  surfaceElevated: 'rgba(255, 255, 255, 0.95)',
  cardBackground: 'rgba(255, 255, 255, 0.82)',
  cardBorder: 'rgba(255, 255, 255, 0.92)',
  outline: 'rgba(255, 255, 255, 0.90)',
  glassHighlight: '#FFFFFF',
  glassShadow: 'rgba(3, 52, 44, 0.08)',
  glassOverlay: 'rgba(255, 255, 255, 0.25)',
  glassButtonBg: '#006156',
  glassButtonBorder: 'rgba(255, 255, 255, 0.35)',
  glassSecondaryBg: 'rgba(255, 255, 255, 0.85)',
  navBackground: 'rgba(255, 255, 255, 0.90)',
  navBorder: 'rgba(255, 255, 255, 0.92)',
};

export interface GlassStyles {
  card: ViewStyle;
  pill: ViewStyle;
  button: ViewStyle;
  secondaryButton: ViewStyle;
  badge: ViewStyle;
  input: ViewStyle;
}

export interface ThemeContextValue {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  colorScheme: AppearanceMode;
  setColorScheme: (scheme: AppearanceMode) => Promise<void>;
  isDark: boolean;
  isGlass: boolean;
  colors: ThemeColors;
  glassStyles: GlassStyles;
  spacing: typeof Spacing;
  radii: typeof Radii;
  typography: typeof Typography;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
  initialMode?: ThemeMode;
  initialScheme?: AppearanceMode;
  onThemeChange?: (mode: ThemeMode) => void;
  onSchemeChange?: (scheme: AppearanceMode) => void;
}

export function ThemeProvider({
  children,
  initialMode = 'nature',
  initialScheme = 'light',
  onThemeChange,
  onSchemeChange,
}: ThemeProviderProps) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(initialMode);
  const [colorScheme, setColorSchemeState] = useState<AppearanceMode>(initialScheme);

  useEffect(() => {
    setThemeModeState(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setColorSchemeState(initialScheme);
  }, [initialScheme]);

  const setThemeMode = useCallback(
    async (mode: ThemeMode) => {
      setThemeModeState(mode);
      onThemeChange?.(mode);
    },
    [onThemeChange]
  );

  const setColorScheme = useCallback(
    async (scheme: AppearanceMode) => {
      setColorSchemeState(scheme);
      onSchemeChange?.(scheme);
    },
    [onSchemeChange]
  );

  const systemScheme = useSystemColorScheme();
  const isDark = colorScheme === 'dark' || (colorScheme === 'system' && systemScheme === 'dark');
  const isGlass = themeMode === 'glassmorphism';

  const colors = useMemo<ThemeColors>(() => {
    switch (themeMode) {
      case 'ocean':
        return isDark ? OceanDarkColors : OceanLightColors;
      case 'sunset':
        return isDark ? SunsetDarkColors : SunsetLightColors;
      case 'lavender':
        return isDark ? LavenderDarkColors : LavenderLightColors;
      case 'glassmorphism':
        return GlassColors;
      case 'classic':
        return isDark ? NatureDarkColors : ClassicColors;
      case 'nature':
      default:
        return isDark ? NatureDarkColors : NatureLightColors;
    }
  }, [themeMode, isDark]);

  const glassStyles = useMemo<GlassStyles>(() => {
    if (isGlass) {
      return {
        card: {
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
          borderWidth: 1.5,
          borderRadius: Radii.card + 4,
          shadowColor: '#03342C',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 0,
        },
        pill: {
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          borderColor: '#FFFFFF',
          borderWidth: 1.2,
          borderRadius: Radii.full,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 4,
          elevation: 0,
        },
        button: {
          backgroundColor: colors.glassButtonBg,
          borderColor: 'rgba(255, 255, 255, 0.35)',
          borderWidth: 1,
          borderRadius: Radii.card,
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.20,
          shadowRadius: 10,
          elevation: 2,
        },
        secondaryButton: {
          backgroundColor: colors.glassSecondaryBg,
          borderColor: colors.cardBorder,
          borderWidth: 1.5,
          borderRadius: Radii.card,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
          elevation: 0,
        },
        badge: {
          backgroundColor: 'rgba(255, 255, 255, 0.88)',
          borderColor: '#FFFFFF',
          borderWidth: 1,
          borderRadius: Radii.full,
        },
        input: {
          backgroundColor: 'rgba(255, 255, 255, 0.82)',
          borderColor: 'rgba(255, 255, 255, 0.95)',
          borderWidth: 1.5,
          borderRadius: Radii.card,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.03,
          shadowRadius: 6,
          elevation: 0,
        },
      };
    }

    return {
      card: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: Radii.card,
        shadowColor: colors.textPrimary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.2 : 0.04,
        shadowRadius: 8,
        elevation: isDark ? 1 : 2,
      },
      pill: {
        backgroundColor: colors.primaryLight,
        borderRadius: Radii.full,
      },
      button: {
        backgroundColor: colors.primary,
        borderRadius: Radii.card,
      },
      secondaryButton: {
        backgroundColor: colors.surfaceSecondary,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: Radii.card,
      },
      badge: {
        backgroundColor: colors.primaryLight,
        borderRadius: Radii.full,
      },
      input: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1.5,
        borderRadius: Radii.card,
      },
    };
  }, [isGlass, colors, isDark]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      setThemeMode,
      colorScheme,
      setColorScheme,
      isDark,
      isGlass,
      colors,
      glassStyles,
      spacing: Spacing,
      radii: Radii,
      typography: Typography,
    }),
    [themeMode, setThemeMode, colorScheme, setColorScheme, isDark, isGlass, colors, glassStyles]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      themeMode: 'nature',
      setThemeMode: async () => {},
      colorScheme: 'light',
      setColorScheme: async () => {},
      isDark: false,
      isGlass: false,
      colors: NatureLightColors,
      glassStyles: {
        card: {
          backgroundColor: NatureLightColors.surface,
          borderColor: NatureLightColors.border,
          borderWidth: 1,
          borderRadius: Radii.card,
        },
        pill: {
          backgroundColor: NatureLightColors.primaryLight,
          borderRadius: Radii.full,
        },
        button: {
          backgroundColor: NatureLightColors.primary,
          borderRadius: Radii.card,
        },
        secondaryButton: {
          backgroundColor: NatureLightColors.surfaceSecondary,
          borderColor: NatureLightColors.border,
          borderWidth: 1,
          borderRadius: Radii.card,
        },
        badge: {
          backgroundColor: NatureLightColors.primaryLight,
          borderRadius: Radii.full,
        },
        input: {
          backgroundColor: NatureLightColors.surface,
          borderColor: NatureLightColors.border,
          borderWidth: 1.5,
          borderRadius: Radii.card,
        },
      },
      spacing: Spacing,
      radii: Radii,
      typography: Typography,
    };
  }
  return context;
}
