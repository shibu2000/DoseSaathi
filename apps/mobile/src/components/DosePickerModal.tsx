import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '../theme/tokens';

export const COMMON_UNITS = [
  { value: 'tablet', label: 'Tablet (Pill)', icon: 'medication' },
  { value: 'capsule', label: 'Capsule', icon: 'medication-liquid' },
  { value: 'mL', label: 'mL (Liquid / Syrup)', icon: 'local-drink' },
  { value: 'drops', label: 'Drops (Eye / Ear)', icon: 'opacity' },
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
  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Select dose quantity</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.inkMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sub}>How many units to take per scheduled dose</Text>

          <View style={styles.qtyGrid}>
            {COMMON_QUANTITIES.map((q) => {
              const isSelected = selectedQuantity === q;
              return (
                <TouchableOpacity
                  key={q}
                  style={[styles.qtyCell, isSelected && styles.qtyCellSelected]}
                  onPress={() => {
                    onSelect(q);
                    onClose();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.qtyCellText, isSelected && styles.qtyCellTextSelected]}>
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
  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Select unit or form</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.inkMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sub}>Choose medicine form from dropdown</Text>

          <ScrollView style={styles.unitsList} showsVerticalScrollIndicator={false}>
            {COMMON_UNITS.map((u) => {
              const isSelected = selectedUnit.toLowerCase() === u.value.toLowerCase();
              return (
                <TouchableOpacity
                  key={u.value}
                  style={[styles.unitRow, isSelected && styles.unitRowSelected]}
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
                      color={isSelected ? Colors.primary : Colors.inkMuted}
                    />
                    <Text style={[styles.unitLabel, isSelected && styles.unitLabelSelected]}>
                      {u.label}
                    </Text>
                  </View>
                  {isSelected && (
                    <MaterialIcons name="check" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    ...Typography.headlineSmall,
    color: Colors.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  sub: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
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
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  qtyCellSelected: {
    backgroundColor: Colors.brandSoft,
    borderColor: Colors.brand,
  },
  qtyCellText: {
    ...Typography.headlineSmall,
    fontSize: 18,
    color: Colors.ink,
    fontWeight: '600',
  },
  qtyCellTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  unitsList: {
    maxHeight: 360,
  },
  unitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceMuted,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  unitRowSelected: {
    backgroundColor: Colors.brandSoft,
    borderColor: Colors.brand,
  },
  unitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  unitLabel: {
    ...Typography.bodyMedium,
    color: Colors.ink,
    fontWeight: '500',
  },
  unitLabelSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
