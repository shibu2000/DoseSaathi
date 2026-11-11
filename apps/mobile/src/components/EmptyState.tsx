import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/tokens';
import { PrimaryButton } from './Buttons';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

export function OfflineBanner() {
  return (
    <View style={styles.banner}>
      <MaterialIcons name="cloud-off" size={16} color={Colors.inkMuted} style={styles.icon} />
      <Text style={styles.text}>Offline. Changes are saved on this phone and will sync when you are connected.</Text>
    </View>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode | string;
  title: string;
  description: string;
  buttonTitle?: string;
  onButtonPress?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  buttonTitle,
  onButtonPress,
}: EmptyStateProps) {
  const renderIcon = () => {
    if (React.isValidElement(icon)) {
      return icon;
    }
    if (typeof icon === 'string' && icon.length > 2) {
      // Named icon fallback or string
      return <MaterialCommunityIcons name="pill" size={44} color={Colors.brand} />;
    }
    if (typeof icon === 'string') {
      return <Text style={styles.emptyIcon}>{icon}</Text>;
    }
    return <MaterialCommunityIcons name="pill" size={44} color={Colors.brand} />;
  };

  return (
    <View style={styles.emptyContainer}>
      <View style={styles.iconWrapper}>{renderIcon()}</View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {buttonTitle && onButtonPress && (
        <PrimaryButton
          title={buttonTitle}
          onPress={onButtonPress}
          style={styles.emptyButton}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: Colors.surfaceMuted,
    borderColor: Colors.outline,
    borderWidth: 1,
    borderRadius: Radii.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  text: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    ...Typography.headlineMedium,
    color: Colors.ink,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  emptyDescription: {
    ...Typography.bodyMedium,
    color: Colors.inkMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  emptyButton: {
    minWidth: 200,
  },
});
