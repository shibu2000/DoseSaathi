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

export const FontFamily = {
  regular: 'AtkinsonHyperlegibleNext_400Regular',
  medium: 'AtkinsonHyperlegibleNext_500Medium',
  semiBold: 'AtkinsonHyperlegibleNext_600SemiBold',
  bold: 'AtkinsonHyperlegibleNext_700Bold',
};

export const Typography = {
  display: {
    fontFamily: FontFamily.bold,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700' as const,
    color: Colors.ink,
  },
  headlineLarge: {
    fontFamily: FontFamily.bold,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
    color: Colors.ink,
  },
  headlineMedium: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    color: Colors.ink,
  },
  headlineSmall: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700' as const,
    color: Colors.ink,
  },
  bodyXL: {
    fontFamily: FontFamily.regular,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '400' as const,
    color: Colors.ink,
  },
  bodyLarge: {
    fontFamily: FontFamily.regular,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '400' as const,
    color: Colors.ink,
  },
  bodyMedium: {
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
    color: Colors.ink,
  },
  bodySmall: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
    color: Colors.inkMuted,
  },
  labelLarge: {
    fontFamily: FontFamily.semiBold,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
    color: Colors.ink,
  },
  labelMedium: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as const,
    color: Colors.ink,
  },
  labelSmall: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600' as const,
    color: Colors.inkMuted,
  },
};
