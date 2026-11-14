import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Radii, Spacing, scaleFont, FontFamily } from '../theme/tokens';
import type { OccurrenceWithMedication } from '../database';

interface NextDoseHeroCardProps {
  occurrence: OccurrenceWithMedication;
  onTake: () => void;
  onSnooze: () => void;
  onSkip?: () => void;
  onDetailsPress?: () => void;
}

export function NextDoseHeroCard({
  occurrence,
  onTake,
  onSnooze,
  onSkip,
  onDetailsPress,
}: NextDoseHeroCardProps) {
  const { colors, isDark } = useTheme();
  const [showMenu, setShowMenu] = useState(false);

  const med = occurrence.medication;
  const timeStr = occurrence.scheduledLocalTime || '08:00';
  const dosageLine = `${med.doseQuantity} ${med.doseUnit || 'tablet'}${
    med.instructions ? ` • ${med.instructions}` : ''
  }`;

  return (
    <View style={styles.container}>
      {/* Section Title */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Next Dose</Text>
      </View>

      {/* Main Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: colors.textPrimary,
          },
        ]}
      >
        {/* Top Info Row */}
        <View style={styles.infoRow}>
          {/* Alarm Icon Badge */}
          <View
            style={[
              styles.alarmBadge,
              { backgroundColor: isDark ? 'rgba(0, 97, 86, 0.25)' : colors.primaryLight },
            ]}
          >
            <Ionicons name="alarm-outline" size={20} color={colors.primary} />
          </View>

          {/* Medicine Name and Dosage */}
          <View style={styles.medDetails}>
            <Text style={[styles.medName, { color: colors.textPrimary }]} numberOfLines={1}>
              {med.name} {med.dosageText ? med.dosageText : ''}
            </Text>
            <Text style={[styles.dosageText, { color: colors.textSecondary }]} numberOfLines={1}>
              {dosageLine}
            </Text>
          </View>

          {/* Scheduled Time Pill Badge */}
          <View
            style={[
              styles.timeBadge,
              { backgroundColor: isDark ? 'rgba(0, 97, 86, 0.25)' : colors.primaryLight },
            ]}
          >
            <Text style={[styles.timeText, { color: colors.primary }]}>{timeStr}</Text>
          </View>
        </View>

        {/* Action Row */}
        <View style={styles.actionsRow}>
          {/* Large Primary Mark As Taken Button */}
          <TouchableOpacity
            style={[
              styles.takeButton,
              { backgroundColor: colors.primary },
            ]}
            onPress={onTake}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${med.name} as taken`}
          >
            <Ionicons name="checkmark-sharp" size={19} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.takeButtonText}>Mark as Taken</Text>
          </TouchableOpacity>

          {/* More Options Button [...] */}
          <TouchableOpacity
            style={[
              styles.moreButton,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceSecondary,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setShowMenu(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="More dose options"
          >
            <Ionicons name="ellipsis-horizontal" size={19} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Options Menu Modal */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowMenu(false)}>
          <View
            style={[
              styles.menuCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                shadowColor: colors.textPrimary,
              },
            ]}
          >
            <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>Dose Options</Text>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                onSnooze();
              }}
            >
              <Ionicons name="time-outline" size={20} color={colors.warning} style={styles.menuIcon} />
              <View>
                <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>
                  Remind in 10 minutes
                </Text>
                <Text style={[styles.menuItemSubtext, { color: colors.textSecondary }]}>
                  Snooze alarm temporarily
                </Text>
              </View>
            </TouchableOpacity>

            {onSkip && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  onSkip();
                }}
              >
                <Ionicons name="close-circle-outline" size={20} color={colors.error} style={styles.menuIcon} />
                <View>
                  <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>
                    Skip this dose
                  </Text>
                  <Text style={[styles.menuItemSubtext, { color: colors.textSecondary }]}>
                    Mark dose as skipped
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {onDetailsPress && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  onDetailsPress();
                }}
              >
                <Ionicons name="information-circle-outline" size={20} color={colors.primary} style={styles.menuIcon} />
                <View>
                  <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>
                    View medicine details
                  </Text>
                  <Text style={[styles.menuItemSubtext, { color: colors.textSecondary }]}>
                    Schedule & instructions
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.sm,
  },
  sectionHeader: {
    marginBottom: Spacing.sm,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(18),
    letterSpacing: -0.2,
  },
  card: {
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  alarmBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  medDetails: {
    flex: 1,
    marginRight: 8,
  },
  medName: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(16.5),
    lineHeight: scaleFont(22),
  },
  dosageText: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13.5),
    marginTop: 2,
  },
  timeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radii.full,
    alignSelf: 'center',
  },
  timeText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(13.5),
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  takeButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  takeButtonText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(15.5),
    color: '#FFFFFF',
  },
  moreButton: {
    width: 50,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  menuCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: 20,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  menuTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(18),
    marginBottom: 14,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuIcon: {
    width: 32,
    marginRight: 12,
  },
  menuItemText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(15),
  },
  menuItemSubtext: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(12.5),
    marginTop: 1,
  },
});
