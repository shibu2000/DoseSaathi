import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Radii, Spacing, Typography, FontFamily, scaleFont } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { PrimaryButton, SecondaryButton } from './Buttons';

interface TimePickerModalProps {
  visible: boolean;
  initialTime?: string; // "HH:mm", e.g. "08:00" or "20:30"
  title: string;
  onConfirm: (time24h: string) => void;
  onClose: () => void;
  onClear?: () => void;
  clearLabel?: string;
}

export function TimePickerModal({
  visible,
  initialTime = '08:00',
  title,
  onConfirm,
  onClose,
  onClear,
  clearLabel = 'Clear time',
}: TimePickerModalProps) {
  const { colors, isDark } = useTheme();
  const [hour12, setHour12] = useState(8);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');

  useEffect(() => {
    if (initialTime && initialTime.includes(':')) {
      const [hStr, mStr] = initialTime.split(':');
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      if (!isNaN(h) && !isNaN(m)) {
        setHour12(h % 12 === 0 ? 12 : h % 12);
        setMinute(m);
        setAmpm(h >= 12 ? 'PM' : 'AM');
      }
    }
  }, [initialTime, visible]);

  const handlePreset = (h: number, m: number, ap: 'AM' | 'PM') => {
    setHour12(h);
    setMinute(m);
    setAmpm(ap);
  };

  const handleConfirm = () => {
    let h24 = hour12 % 12;
    if (ampm === 'PM') h24 += 12;
    const formatted = `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    onConfirm(formatted);
    onClose();
  };

  const adjustMinute = (delta: number) => {
    setMinute((prev) => {
      let next = prev + delta;
      if (next < 0) next = 55;
      if (next > 59) next = 0;
      return next;
    });
  };

  const hoursList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const minutesList = [0, 15, 30, 45];

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <MaterialIcons name="access-time" size={22} color={colors.primary} />
              <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close time picker">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Large Time Display & AM/PM Switcher */}
          <View
            style={[
              styles.displayCard,
              { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <View style={styles.timeDisplayRow}>
              <Text style={[styles.displayHour, { color: colors.primary }]}>
                {String(hour12).padStart(2, '0')}
              </Text>
              <Text style={[styles.displayColon, { color: colors.textSecondary }]}>:</Text>
              <Text style={[styles.displayMinute, { color: colors.primary }]}>
                {String(minute).padStart(2, '0')}
              </Text>
            </View>

            <View style={[styles.ampmSwitch, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity
                style={[
                  styles.ampmBtn,
                  ampm === 'AM' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setAmpm('AM')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.ampmText,
                    { color: colors.textSecondary },
                    ampm === 'AM' && { color: colors.white, fontWeight: '700' },
                  ]}
                >
                  AM
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.ampmBtn,
                  ampm === 'PM' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setAmpm('PM')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.ampmText,
                    { color: colors.textSecondary },
                    ampm === 'PM' && { color: colors.white, fontWeight: '700' },
                  ]}
                >
                  PM
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Presets */}
          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
            Common medication times
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetsRow}
          >
            {[
              { label: '🌅 Morning 8:00 AM', h: 8, m: 0, ap: 'AM' as const },
              { label: '☀️ Noon 12:00 PM', h: 12, m: 0, ap: 'PM' as const },
              { label: '☕ Evening 5:00 PM', h: 5, m: 0, ap: 'PM' as const },
              { label: '🌙 Night 8:00 PM', h: 8, m: 0, ap: 'PM' as const },
              { label: '🛏️ Bedtime 10:00 PM', h: 10, m: 0, ap: 'PM' as const },
            ].map((p, idx) => {
              const isSelected = hour12 === p.h && minute === p.m && ampm === p.ap;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(0, 97, 86, 0.25)'
                          : colors.primaryLight
                        : colors.surfaceSecondary,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => handlePreset(p.h, p.m, p.ap)}
                >
                  <Text style={[styles.presetChipText, { color: colors.textPrimary }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Hour Selector Grid */}
          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
            Select hour
          </Text>
          <View style={styles.grid}>
            {hoursList.map((h) => {
              const isSelected = hour12 === h;
              return (
                <TouchableOpacity
                  key={h}
                  style={[
                    styles.gridCell,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setHour12(h)}
                >
                  <Text
                    style={[
                      styles.gridCellText,
                      { color: isSelected ? colors.white : colors.textPrimary },
                      isSelected && { fontWeight: '700' },
                    ]}
                  >
                    {h}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Minute Selector */}
          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
            Select minute
          </Text>
          <View style={styles.minutesRow}>
            {minutesList.map((m) => {
              const isSelected = minute === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.minuteChip,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setMinute(m)}
                >
                  <Text
                    style={[
                      styles.minuteChipText,
                      { color: isSelected ? colors.white : colors.textPrimary },
                      isSelected && { fontWeight: '700' },
                    ]}
                  >
                    :{String(m).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[
                styles.stepBtn,
                { backgroundColor: isDark ? 'rgba(0, 97, 86, 0.25)' : colors.primaryLight },
              ]}
              onPress={() => adjustMinute(-5)}
            >
              <Text style={[styles.stepBtnText, { color: colors.primary }]}>-5m</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.stepBtn,
                { backgroundColor: isDark ? 'rgba(0, 97, 86, 0.25)' : colors.primaryLight },
              ]}
              onPress={() => adjustMinute(5)}
            >
              <Text style={[styles.stepBtnText, { color: colors.primary }]}>+5m</Text>
            </TouchableOpacity>
          </View>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <PrimaryButton title="Confirm time" onPress={handleConfirm} />
            {onClear && (
              <SecondaryButton
                title={clearLabel}
                onPress={() => {
                  onClear();
                  onClose();
                }}
              />
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
    maxHeight: '90%',
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(18),
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  displayCard: {
    borderRadius: Radii.card,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  timeDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  displayHour: {
    fontSize: scaleFont(38),
    fontFamily: FontFamily.bold,
  },
  displayColon: {
    fontSize: scaleFont(34),
    fontFamily: FontFamily.bold,
    marginHorizontal: 4,
  },
  displayMinute: {
    fontSize: scaleFont(38),
    fontFamily: FontFamily.bold,
  },
  ampmSwitch: {
    flexDirection: 'row',
    borderRadius: Radii.full,
    padding: 3,
    borderWidth: 1,
  },
  ampmBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radii.full,
  },
  ampmText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(12.5),
  },
  sectionHeading: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(12.5),
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  presetChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
  presetChipText: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(13),
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    justifyContent: 'space-between',
  },
  gridCell: {
    width: '14.5%',
    minWidth: 42,
    height: 42,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
    borderWidth: 1,
  },
  gridCellText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14),
  },
  minutesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
    marginTop: 2,
    marginBottom: Spacing.lg,
  },
  minuteChip: {
    flex: 1,
    minWidth: 50,
    height: 40,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  minuteChipText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(14),
  },
  stepBtn: {
    height: 40,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(12.5),
  },
  footer: {
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
});
