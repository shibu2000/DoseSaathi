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
import { Colors, Radii, Spacing, Typography } from '../theme/tokens';
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
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <MaterialIcons name="access-time" size={22} color={Colors.primary} />
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close time picker">
              <Ionicons name="close" size={22} color={Colors.inkMuted} />
            </TouchableOpacity>
          </View>

          {/* Large Time Display & AM/PM Switcher */}
          <View style={styles.displayCard}>
            <View style={styles.timeDisplayRow}>
              <Text style={styles.displayHour}>{String(hour12).padStart(2, '0')}</Text>
              <Text style={styles.displayColon}>:</Text>
              <Text style={styles.displayMinute}>{String(minute).padStart(2, '0')}</Text>
            </View>

            <View style={styles.ampmSwitch}>
              <TouchableOpacity
                style={[styles.ampmBtn, ampm === 'AM' && styles.ampmBtnActive]}
                onPress={() => setAmpm('AM')}
                activeOpacity={0.8}
              >
                <Text style={[styles.ampmText, ampm === 'AM' && styles.ampmTextActive]}>AM</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ampmBtn, ampm === 'PM' && styles.ampmBtnActive]}
                onPress={() => setAmpm('PM')}
                activeOpacity={0.8}
              >
                <Text style={[styles.ampmText, ampm === 'PM' && styles.ampmTextActive]}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Presets */}
          <Text style={styles.sectionHeading}>Common medication times</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetsRow}
          >
            <TouchableOpacity
              style={[styles.presetChip, hour12 === 8 && minute === 0 && ampm === 'AM' && styles.presetChipActive]}
              onPress={() => handlePreset(8, 0, 'AM')}
            >
              <Text style={styles.presetChipText}>🌅 Morning 8:00 AM</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetChip, hour12 === 12 && minute === 0 && ampm === 'PM' && styles.presetChipActive]}
              onPress={() => handlePreset(12, 0, 'PM')}
            >
              <Text style={styles.presetChipText}>☀️ Noon 12:00 PM</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetChip, hour12 === 5 && minute === 0 && ampm === 'PM' && styles.presetChipActive]}
              onPress={() => handlePreset(5, 0, 'PM')}
            >
              <Text style={styles.presetChipText}>☕ Evening 5:00 PM</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetChip, hour12 === 8 && minute === 0 && ampm === 'PM' && styles.presetChipActive]}
              onPress={() => handlePreset(8, 0, 'PM')}
            >
              <Text style={styles.presetChipText}>🌙 Night 8:00 PM</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetChip, hour12 === 10 && minute === 0 && ampm === 'PM' && styles.presetChipActive]}
              onPress={() => handlePreset(10, 0, 'PM')}
            >
              <Text style={styles.presetChipText}>🛏️ Bedtime 10:00 PM</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Hour Selector Grid */}
          <Text style={styles.sectionHeading}>Select hour</Text>
          <View style={styles.grid}>
            {hoursList.map((h) => {
              const isSelected = hour12 === h;
              return (
                <TouchableOpacity
                  key={h}
                  style={[styles.gridCell, isSelected && styles.gridCellActive]}
                  onPress={() => setHour12(h)}
                >
                  <Text style={[styles.gridCellText, isSelected && styles.gridCellTextActive]}>
                    {h}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Minute Selector */}
          <Text style={styles.sectionHeading}>Select minute</Text>
          <View style={styles.minutesRow}>
            {minutesList.map((m) => {
              const isSelected = minute === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.minuteChip, isSelected && styles.minuteChipActive]}
                  onPress={() => setMinute(m)}
                >
                  <Text style={[styles.minuteChipText, isSelected && styles.minuteChipTextActive]}>
                    :{String(m).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustMinute(-5)}>
              <Text style={styles.stepBtnText}>-5m</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepBtn} onPress={() => adjustMinute(5)}>
              <Text style={styles.stepBtnText}>+5m</Text>
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
    backgroundColor: 'rgba(32, 43, 40, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
    maxHeight: '90%',
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
    ...Typography.headlineSmall,
    color: Colors.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  displayCard: {
    backgroundColor: Colors.surfaceMuted,
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
    fontSize: 38,
    fontFamily: Typography.display.fontFamily,
    fontWeight: '700',
    color: Colors.primary,
  },
  displayColon: {
    fontSize: 34,
    fontWeight: '700',
    color: Colors.inkMuted,
    marginHorizontal: 4,
  },
  displayMinute: {
    fontSize: 38,
    fontFamily: Typography.display.fontFamily,
    fontWeight: '700',
    color: Colors.primary,
  },
  ampmSwitch: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radii.full,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.outline,
  },
  ampmBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radii.full,
  },
  ampmBtnActive: {
    backgroundColor: Colors.primary,
  },
  ampmText: {
    ...Typography.labelSmall,
    fontWeight: '700',
    color: Colors.inkMuted,
  },
  ampmTextActive: {
    color: Colors.white,
  },
  sectionHeading: {
    ...Typography.labelSmall,
    color: Colors.inkMuted,
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
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  presetChipActive: {
    backgroundColor: Colors.brandSoft,
    borderColor: Colors.brand,
  },
  presetChipText: {
    ...Typography.labelSmall,
    color: Colors.ink,
    fontSize: 13,
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
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  gridCellActive: {
    backgroundColor: Colors.primary,
  },
  gridCellText: {
    ...Typography.labelMedium,
    color: Colors.ink,
    fontWeight: '600',
  },
  gridCellTextActive: {
    color: Colors.white,
    fontWeight: '700',
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
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minuteChipActive: {
    backgroundColor: Colors.primary,
  },
  minuteChipText: {
    ...Typography.labelMedium,
    color: Colors.ink,
    fontWeight: '600',
  },
  minuteChipTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  stepBtn: {
    height: 40,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.sm,
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    ...Typography.labelSmall,
    color: Colors.primary,
    fontWeight: '700',
  },
  footer: {
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
});
