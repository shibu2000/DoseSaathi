let screenWidth = 390;
let roundToNearestPixel = (val: number) => Math.round(val);

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RN = require('react-native');
  if (RN && RN.Dimensions && typeof RN.Dimensions.get === 'function') {
    const w = RN.Dimensions.get('window')?.width;
    if (w) screenWidth = w;
  }
  if (RN && RN.PixelRatio && typeof RN.PixelRatio.roundToNearestPixel === 'function') {
    roundToNearestPixel = RN.PixelRatio.roundToNearestPixel.bind(RN.PixelRatio);
  }
} catch {
  // Safe fallback for non-React-Native environments (e.g., unit test runners)
}

const BASE_WIDTH = 390;

/**
 * Calculates responsive, balanced font size based on device screen width.
 * Uses gentle moderate scaling (factor = 0.35) so:
 * - Smaller devices (e.g. 360px) scale text down smoothly to prevent awkward wrapping.
 * - Standard & larger devices (390px - 430px+) scale up with crisp visual hierarchy.
 */
export function scaleFont(size: number, factor = 0.35): number {
  if (!screenWidth) return size;
  const scale = screenWidth / BASE_WIDTH;
  const target = size + (scale * size - size) * factor;
  return Math.round(roundToNearestPixel(target));
}

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
    fontSize: scaleFont(32),
    lineHeight: scaleFont(40),
    color: Colors.ink,
  },
  headlineLarge: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(26),
    lineHeight: scaleFont(33),
    color: Colors.ink,
  },
  headlineMedium: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(22),
    lineHeight: scaleFont(28),
    color: Colors.ink,
  },
  headlineSmall: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(19),
    lineHeight: scaleFont(25),
    color: Colors.ink,
  },
  bodyXL: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(19),
    lineHeight: scaleFont(26),
    color: Colors.ink,
  },
  bodyLarge: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(17),
    lineHeight: scaleFont(24),
    color: Colors.ink,
  },
  bodyMedium: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(15.5),
    lineHeight: scaleFont(22),
    color: Colors.ink,
  },
  bodySmall: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(14),
    lineHeight: scaleFont(20),
    color: Colors.inkMuted,
  },
  labelLarge: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(17),
    lineHeight: scaleFont(23),
    color: Colors.ink,
  },
  labelMedium: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(15),
    lineHeight: scaleFont(21),
    color: Colors.ink,
  },
  labelSmall: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(13),
    lineHeight: scaleFont(18),
    color: Colors.inkMuted,
  },
};
