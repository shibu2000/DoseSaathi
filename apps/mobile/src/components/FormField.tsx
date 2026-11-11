import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/tokens';

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  helper?: string;
}

export function FormField({ label, error, helper, style, ...inputProps }: FormFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          error ? styles.inputError : undefined,
          style,
        ]}
        placeholderTextColor={Colors.inkMuted}
        accessibilityLabel={label}
        {...inputProps}
      />
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : helper ? (
        <Text style={styles.helperText}>{helper}</Text>
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
    color: Colors.ink,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
    borderWidth: 1.5,
    borderRadius: Radii.card,
    minHeight: 56,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    color: Colors.ink,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  errorText: {
    ...Typography.bodySmall,
    color: Colors.danger,
    marginTop: Spacing.xs,
  },
  helperText: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    marginTop: Spacing.xs,
  },
});
