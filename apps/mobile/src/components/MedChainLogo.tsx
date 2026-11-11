import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { Colors } from '../theme/tokens';

interface MedChainLogoProps {
  size?: number;
  color?: string;
}

export function MedChainLogo({ size = 40, color = Colors.brand }: MedChainLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M24 4L24 44M4 24L44 24"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect
        x={14}
        y={14}
        width={20}
        height={20}
        rx={4}
        stroke={color}
        strokeWidth={2.4}
      />
    </Svg>
  );
}
