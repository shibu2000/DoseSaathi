import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Radii, Spacing, scaleFont, FontFamily } from '../theme/tokens';

interface StepProgressBarProps {
  currentStep: number;
  totalSteps?: number;
  stepName: string;
}

export function StepProgressBar({
  currentStep,
  totalSteps = 4,
  stepName,
}: StepProgressBarProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.container}>
      {/* Step Header Label */}
      <Text style={[styles.stepLabel, { color: colors.textSecondary }]}>
        Step {currentStep} of {totalSteps}: {stepName}
      </Text>

      {/* Progress Bars */}
      <View style={styles.barsContainer}>
        {Array.from({ length: totalSteps }).map((_, idx) => {
          const stepNumber = idx + 1;
          const isFilled = stepNumber <= currentStep;
          return (
            <View
              key={idx}
              style={[
                styles.segment,
                {
                  backgroundColor: isFilled
                    ? colors.primary
                    : isDark
                    ? 'rgba(255, 255, 255, 0.12)'
                    : '#DCE3DC',
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  stepLabel: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13.5),
    marginBottom: 8,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segment: {
    flex: 1,
    height: 4.5,
    borderRadius: Radii.full,
  },
});
