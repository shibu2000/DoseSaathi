import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Radii, Spacing, Typography, FontFamily, scaleFont } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

export const COMMON_UNITS = [
  { value: 'tablet', label: 'Tablet (Pill)', icon: 'medication' },
  { value: 'capsule', label: 'Capsule', icon: 'medication-liquid' },
  { value: 'drops', label: 'Drops (Water / Oral / Eye)', icon: 'opacity' },
  { value: 'mL', label: 'mL (Liquid / Syrup)', icon: 'local-drink' },
  { value: 'puff', label: 'Puff (Inhaler)', icon: 'air' },
  { value: 'injection', label: 'Injection (Insulin)', icon: 'healing' },
  { value: 'patch', label: 'Patch', icon: 'layers' },
  { value: 'sachet', label: 'Sachet (Powder)', icon: 'inventory' },
  { value: 'teaspoon', label: 'Teaspoon', icon: 'restaurant' },
  { value: 'application', label: 'Application (Cream)', icon: 'brush' },
];

export const COMMON_QUANTITIES = ['0.5', '1', '1.5', '2', '2.5', '3', '4', '5'];

interface DoseQuantityModalProps {
  visible: boolean;
  selectedQuantity: string;
  onSelect: (qty: string) => void;
  onClose: () => void;
}

export function DoseQuantityModal({
  visible,
  selectedQuantity,
  onSelect,
  onClose,
}: DoseQuantityModalProps) {
  const { colors, isDark } = useTheme();

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Select dose quantity</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            How many units to take per scheduled dose
          </Text>

          <View style={styles.qtyGrid}>
            {COMMON_QUANTITIES.map((q) => {
              const isSelected = selectedQuantity === q;
              return (
                <TouchableOpacity
                  key={q}
                  style={[
                    styles.qtyCell,
                    { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                    isSelected && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => {
                    onSelect(q);
                    onClose();
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.qtyCellText,
                      { color: colors.textPrimary },
                      isSelected && { color: colors.white, fontWeight: '700' },
                    ]}
                  >
                    {q}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface DoseUnitModalProps {
  visible: boolean;
  selectedUnit: string;
  onSelect: (unit: string) => void;
  onClose: () => void;
}

export function DoseUnitModal({
  visible,
  selectedUnit,
  onSelect,
  onClose,
}: DoseUnitModalProps) {
  const { colors, isDark } = useTheme();
  const [customUnit, setCustomUnit] = useState('');

  const handleApplyCustom = () => {
    if (customUnit.trim()) {
      onSelect(customUnit.trim());
      setCustomUnit('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Select medicine form / unit
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Choose medicine form or enter a custom unit below
          </Text>

          <ScrollView style={styles.unitsList} showsVerticalScrollIndicator={false}>
            {COMMON_UNITS.map((u) => {
              const isSelected = selectedUnit.toLowerCase() === u.value.toLowerCase();
              return (
                <TouchableOpacity
                  key={u.value}
                  style={[
                    styles.unitRow,
                    { backgroundColor: colors.surfaceSecondary, borderColor: 'transparent' },
                    isSelected && {
                      backgroundColor: isDark ? 'rgba(0, 97, 86, 0.25)' : colors.primaryLight,
                      borderColor: colors.primary,
                      borderWidth: 1.5,
                    },
                  ]}
                  onPress={() => {
                    onSelect(u.value);
                    onClose();
                  }}
                  activeOpacity={0.75}
                >
                  <View style={styles.unitLeft}>
                    <MaterialIcons
                      name={u.icon as any}
                      size={20}
                      color={isSelected ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.unitLabel,
                        { color: colors.textPrimary },
                        isSelected && { color: colors.primary, fontWeight: '700' },
                      ]}
                    >
                      {u.label}
                    </Text>
                  </View>
                  {isSelected && (
                    <MaterialIcons name="check" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Custom Unit Input */}
          <View style={[styles.customUnitContainer, { borderTopColor: colors.border }]}>
            <TextInput
              style={[
                styles.customUnitInput,
                {
                  backgroundColor: colors.surfaceSecondary,
                  color: colors.textPrimary,
                  borderColor: colors.border,
                },
              ]}
              placeholder="Or enter custom unit (e.g. drops with water)"
              placeholderTextColor={colors.textSecondary}
              value={customUnit}
              onChangeText={setCustomUnit}
              onSubmitEditing={handleApplyCustom}
              returnKeyType="done"
            />
            {customUnit.trim().length > 0 && (
              <TouchableOpacity
                style={[styles.customApplyBtn, { backgroundColor: colors.primary }]}
                onPress={handleApplyCustom}
                activeOpacity={0.8}
              >
                <Text style={[styles.customApplyBtnText, { color: colors.white }]}>Set</Text>
              </TouchableOpacity>
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
    maxHeight: '85%',
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(18),
  },
  sub: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(13),
    marginBottom: Spacing.md,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  qtyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'space-between',
    marginVertical: Spacing.sm,
  },
  qtyCell: {
    width: '23%',
    height: 52,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  qtyCellText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(18),
  },
  unitsList: {
    maxHeight: 300,
  },
  unitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
    marginBottom: Spacing.xs,
    borderWidth: 1,
  },
  unitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  unitLabel: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(14.5),
  },
  customUnitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  customUnitInput: {
    flex: 1,
    height: 48,
    borderRadius: Radii.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(14.5),
  },
  customApplyBtn: {
    height: 48,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customApplyBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(14),
  },
});
