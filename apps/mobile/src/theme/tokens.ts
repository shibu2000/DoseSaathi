export const Colors = {
  canvas: '#F7F5EF',
  surface: '#FFFEFA',
  surfaceMuted: '#ECEFE9',
  ink: '#202B28',
  inkMuted: '#58645F',
  primary: '#034339',
  brand: '#245B50',
  brandPressed: '#19483F',
  brandSoft: '#DCE9E2',
  accent: '#D79A35',
  success: '#2F6B4F',
  warning: '#8A5A16',
  danger: '#A33E38',
  outline: '#D4D9D2',
  white: '#FFFFFF',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
};

export const Radii = {
  sm: 8,
  md: 12,
  card: 18,
  full: 9999,
};

export const Typography = {
  display: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700' as const,
    color: Colors.ink,
  },
  headlineLarge: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
    color: Colors.ink,
  },
  headlineMedium: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    color: Colors.ink,
  },
  headlineSmall: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700' as const,
    color: Colors.ink,
  },
  bodyXL: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '400' as const,
    color: Colors.ink,
  },
  bodyLarge: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '400' as const,
    color: Colors.ink,
  },
  bodyMedium: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
    color: Colors.ink,
  },
  bodySmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
    color: Colors.inkMuted,
  },
  labelLarge: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
    color: Colors.ink,
  },
  labelMedium: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as const,
    color: Colors.ink,
  },
  labelSmall: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600' as const,
    color: Colors.inkMuted,
  },
};
