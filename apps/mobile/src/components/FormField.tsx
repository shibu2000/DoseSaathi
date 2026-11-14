import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { Radii, Spacing, Typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  helper?: string;
}

export function FormField({ label, error, helper, style, ...inputProps }: FormFieldProps) {
  const { colors, isGlass, glassStyles } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: isGlass ? colors.cardBackground : colors.surface,
            borderColor: error ? colors.danger : isGlass ? colors.cardBorder : colors.outline,
            color: colors.ink,
          },
          isGlass && glassStyles.input,
          error ? styles.inputError : undefined,
          style,
        ]}
        placeholderTextColor={colors.inkMuted}
        accessibilityLabel={label}
        {...inputProps}
      />
      {error ? (
        <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
      ) : helper ? (
        <Text style={[styles.helperText, { color: colors.inkMuted }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.sm,
  },
  label: {
    ...Typography.labelMedium,
    marginBottom: Spacing.xs,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: Radii.card,
    minHeight: 56,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
  },
  inputError: {
    borderWidth: 2,
  },
  errorText: {
    ...Typography.bodySmall,
    marginTop: Spacing.xs,
  },
  helperText: {
    ...Typography.bodySmall,
    marginTop: Spacing.xs,
  },
});
