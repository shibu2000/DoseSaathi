import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { Colors, Spacing, Typography, Radii, scaleFont, FontFamily } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { PatientContextBar } from '@/components/PatientContextBar';
import { useWizardSession } from '@/caregiver/wizard-session';
import { CheckingScreen, FormScreen, Notice } from '@/caregiver/ui';
import { DEFAULT_WIZARD_DRAFT, type WizardDraft } from '@/database';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '@/state/AppContext';
import { DoseUnitModal, COMMON_UNITS } from '@/components/DosePickerModal';
import { StepProgressBar } from '@/components/StepProgressBar';
import { MedicineBottleGraphic } from '@/components/MedicineBottleGraphic';

export default function Step1MedicineDetailsScreen() {
  const router = useRouter();
  const session = useWizardSession();
  const { getDraft, saveDraft, clearDraft } = session;
  const { createMedicationFromDraft } = useApp();
  const { colors, isDark } = useTheme();

  const [activeDraft, setActiveDraft] = useState<WizardDraft>(DEFAULT_WIZARD_DRAFT);
  const [name, setName] = useState('');
  const [dosageText, setDosageText] = useState('');
  const [doseQuantity, setDoseQuantity] = useState('1');
  const [doseUnit, setDoseUnit] = useState('tablet');
  const [instructions, setInstructions] = useState('');
  const [trackStock, setTrackStock] = useState(false);
  const [currentStock, setCurrentStock] = useState('30');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');
  const [error, setError] = useState('');
  const [qtyError, setQtyError] = useState('');
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const isEditing = Boolean(activeDraft.editingMedicationId);

  useEffect(() => {
    async function load() {
      const draft = await getDraft();
      if (draft) {
        setActiveDraft(draft);
        setName(draft.name || '');
        setDosageText(draft.dosageText || '');
        setDoseQuantity(String(draft.doseQuantity ?? 1));
        setDoseUnit(draft.doseUnit || 'tablet');
        setInstructions(draft.instructions || '');
        setTrackStock(!!draft.trackStock);
        setCurrentStock(String(draft.currentStock ?? 30));
        setLowStockThreshold(String(draft.lowStockThreshold ?? 5));
      }
    }
    load();
  }, [getDraft]);

  const handleStepQuantity = (delta: number) => {
    const current = parseFloat(doseQuantity) || 1;
    const next = Math.max(0.25, current + delta);
    setDoseQuantity(Number.isInteger(next) ? String(next) : next.toFixed(2));
    if (qtyError) setQtyError('');
  };

  const buildUpdatedDraft = (targetStep: number): WizardDraft | null => {
    if (!name.trim()) {
      setError('Please enter a medicine name');
      return null;
    }
    setError('');
    const qty = parseFloat(doseQuantity);
    if (isNaN(qty) || qty <= 0) {
      setQtyError('Enter a dose greater than 0, for example 1.');
      return null;
    }
    setQtyError('');

    return {
      ...activeDraft,
      name: name.trim(),
      dosageText: dosageText.trim() || `${qty} ${doseUnit.trim() || 'tablet'}`,
      doseQuantity: qty,
      doseUnit: doseUnit.trim() || 'tablet',
      instructions: instructions.trim(),
      trackStock,
      currentStock: trackStock ? parseFloat(currentStock) || 0 : 0,
      lowStockThreshold: trackStock ? parseFloat(lowStockThreshold) || 5 : 5,
      currentStep: targetStep,
    };
  };

  const handleContinue = async () => {
    const updated = buildUpdatedDraft(2);
    if (!updated) return;

    try {
      await saveDraft(updated);
    } catch {
      setError("Couldn't save this step on the phone. Please try again.");
      return;
    }
    router.push(session.route('/medicine/new/schedule') as any);
  };

  const handleQuickSave = async () => {
    const updated = buildUpdatedDraft(activeDraft.currentStep || 1);
    if (!updated) return;

    if (session.isCaregiver) {
      try {
        await saveDraft(updated);
        router.push(session.route('/medicine/new/review') as any);
      } catch {
        setError("Couldn't save changes. Please try again.");
      }
      return;
    }

    try {
      setIsUpdating(true);
      await createMedicationFromDraft(updated);
      await clearDraft();
      router.replace('/(patient)/(tabs)/medicines');
    } catch {
      setError("Couldn't update this medicine. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  if (session.isCaregiver) {
    if (session.access.state !== 'ready') return <CheckingScreen title="Medicine details" />;
    if (!session.access.canEdit) {
      return (
        <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
          <View style={styles.topHeader}>
            <TouchableOpacity
              style={[styles.backCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
              Medicine details
            </Text>
          </View>
          <PatientContextBar
            patientName={session.access.relationship.patientDisplayName}
            relationshipLabel={session.access.relationship.relationshipLabel}
          />
          <Notice icon="eye-outline" title="View only">
            {session.access.relationship.patientDisplayName} has not allowed you to change medicines. You can see them, but not add or edit.
          </Notice>
        </SafeAreaView>
      );
    }
  }

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(patient)/(tabs)/medicines');
    }
  };

  return (
    <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Header matching reference Phone 2 */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={[styles.backCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {isEditing ? `Edit ${activeDraft.name || 'Medicine'}` : 'Add Medicine'}
          </Text>
        </View>

        {/* 4-Step Progress Bar */}
        <StepProgressBar
          currentStep={1}
          totalSteps={4}
          stepName="Medicine details"
        />

        {session.isCaregiver && session.access.state === 'ready' && (
          <View style={{ paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm }}>
            <PatientContextBar
              patientName={session.access.relationship.patientDisplayName}
              relationshipLabel={session.access.relationship.relationshipLabel}
            />
          </View>
        )}

        {isEditing && (
          <View style={[styles.stepTabsRow, { backgroundColor: colors.surfaceSecondary, marginHorizontal: Spacing.xl }]}>
            <TouchableOpacity style={[styles.stepTab, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
              <Text style={[styles.stepTabTextActive, { color: colors.surface }]}>1. Details</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stepTab}
              onPress={() => router.push('/medicine/new/schedule' as any)}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepTabText, { color: colors.textSecondary }]}>2. Schedule</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stepTab}
              onPress={() => router.push('/medicine/new/treatment' as any)}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepTabText, { color: colors.textSecondary }]}>3. Duration</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stepTab}
              onPress={() => router.push('/medicine/new/review' as any)}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepTabText, { color: colors.textSecondary }]}>4. Review</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.formContainer}>
          {/* Friendly Centered Medicine Graphic (matches Phone 2) */}
          <MedicineBottleGraphic size={106} />

        {/* Medicine Name Input */}
        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
            Medicine name *
          </Text>
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: colors.surface,
                borderColor: error ? colors.error : colors.border,
              },
            ]}
          >
            <Ionicons name="search-outline" size={18} color={colors.textSecondary} style={styles.inputPrefixIcon} />
            <TextInput
              style={[styles.inputField, { color: colors.textPrimary }]}
              placeholder="e.g. Metformin, Amlodipine"
              placeholderTextColor={colors.textSecondary}
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (error) setError('');
              }}
              accessibilityLabel="Medicine name"
            />
          </View>
          {error ? <Text style={[styles.fieldError, { color: colors.error }]}>{error}</Text> : null}
        </View>

        {/* Strength Input */}
        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
            Strength (e.g. 500 mg)
          </Text>
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <TextInput
              style={[styles.inputField, { color: colors.textPrimary }]}
              placeholder="e.g. 500 mg"
              placeholderTextColor={colors.textSecondary}
              value={dosageText}
              onChangeText={setDosageText}
              accessibilityLabel="Medicine strength"
            />
          </View>
        </View>

        {/* Two-Column Row: Dose Quantity Stepper + Unit/Form Dropdown */}
        <View style={styles.twoColumnRow}>
          {/* Dose Quantity with Stepper */}
          <View style={styles.halfCol}>
            <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
              Dose quantity
            </Text>
            <View
              style={[
                styles.stepperContainer,
                {
                  backgroundColor: colors.surface,
                  borderColor: qtyError ? colors.error : colors.border,
                },
              ]}
            >
              <TouchableOpacity
                style={[styles.stepperBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceSecondary }]}
                onPress={() => handleStepQuantity(-1)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Decrease dose quantity"
              >
                <Ionicons name="remove" size={18} color={colors.textPrimary} />
              </TouchableOpacity>

              <TextInput
                style={[styles.stepperInput, { color: colors.textPrimary }]}
                keyboardType="decimal-pad"
                value={doseQuantity}
                onChangeText={(v) => {
                  setDoseQuantity(v);
                  if (qtyError) setQtyError('');
                }}
                accessibilityLabel="Dose quantity number"
              />

              <TouchableOpacity
                style={[styles.stepperBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceSecondary }]}
                onPress={() => handleStepQuantity(1)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Increase dose quantity"
              >
                <Ionicons name="add" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {qtyError ? <Text style={[styles.fieldError, { color: colors.error }]}>{qtyError}</Text> : null}
          </View>

          {/* Unit / Form Dropdown */}
          <View style={styles.halfCol}>
            <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
              Unit / Form
            </Text>
            <TouchableOpacity
              style={[
                styles.dropdownTrigger,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => setShowUnitModal(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Select medicine form, currently ${doseUnit}`}
            >
              <MaterialCommunityIcons name="pill" size={18} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={[styles.dropdownValue, { color: colors.textPrimary }]} numberOfLines={1}>
                {COMMON_UNITS.find((u) => u.value.toLowerCase() === doseUnit.toLowerCase())?.label || doseUnit}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Instructions Input */}
        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
            Instructions (optional)
          </Text>
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} style={styles.inputPrefixIcon} />
            <TextInput
              style={[styles.inputField, { color: colors.textPrimary }]}
              placeholder="e.g. After food, before sleep"
              placeholderTextColor={colors.textSecondary}
              value={instructions}
              onChangeText={setInstructions}
              accessibilityLabel="Instructions"
            />
          </View>
        </View>

        {/* Track Stock Toggle Card */}
        <View
          style={[
            styles.stockCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.stockHeaderRow}>
            <View style={[styles.stockIconBadge, { backgroundColor: isDark ? 'rgba(0, 97, 86, 0.25)' : colors.primaryLight }]}>
              <Ionicons name="archive-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.stockTitle, { color: colors.textPrimary }]}>Track stock</Text>
              <Text style={[styles.stockSubtitle, { color: colors.textSecondary }]}>
                Get a reminder when it's low.
              </Text>
            </View>
            <Switch
              value={trackStock}
              onValueChange={setTrackStock}
              trackColor={{ false: isDark ? '#333' : '#DCE3DC', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Sub-inputs when Track Stock is ON */}
          {trackStock && (
            <View style={styles.stockInputsRow}>
              <View style={styles.halfCol}>
                <Text style={[styles.subLabel, { color: colors.textSecondary }]}>Stock on hand</Text>
                <TextInput
                  style={[styles.smallInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                  keyboardType="decimal-pad"
                  value={currentStock}
                  onChangeText={setCurrentStock}
                />
              </View>
              <View style={styles.halfCol}>
                <Text style={[styles.subLabel, { color: colors.textSecondary }]}>Alert threshold</Text>
                <TextInput
                  style={[styles.smallInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                  keyboardType="decimal-pad"
                  value={lowStockThreshold}
                  onChangeText={setLowStockThreshold}
                />
              </View>
            </View>
          )}
        </View>

        {/* Bottom Actions */}
        <View style={styles.actionsContainer}>
          <PrimaryButton
            title="Continue →"
            onPress={handleContinue}
            style={{ minHeight: 52, borderRadius: 14 }}
          />

          {isEditing && (
            <SecondaryButton
              title="Save & Exit"
              onPress={handleQuickSave}
              loading={isUpdating}
              style={{ minHeight: 48, borderRadius: 14, marginTop: 8 }}
            />
          )}
        </View>
        </View>
      </ScrollView>

      {/* Dose Unit / Form Selection Modal */}
      <DoseUnitModal
        visible={showUnitModal}
        selectedUnit={doseUnit}
        onSelect={(u) => {
          setDoseUnit(u);
          setShowUnitModal(false);
        }}
        onClose={() => setShowUnitModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.huge,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    gap: Spacing.md,
  },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  screenTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(22),
    letterSpacing: -0.3,
  },
  stepTabsRow: {
    flexDirection: 'row',
    borderRadius: Radii.md,
    padding: 3,
    marginBottom: Spacing.md,
    gap: 4,
  },
  stepTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.sm,
  },
  stepTabText: {
    fontFamily: FontFamily.semiBold,
    fontSize: scaleFont(11),
  },
  stepTabTextActive: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(11),
  },
  formContainer: {
    paddingHorizontal: Spacing.xl,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(14),
    marginBottom: 7,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: Radii.md,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  inputPrefixIcon: {
    marginRight: 10,
  },
  inputField: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(15),
    height: '100%',
  },
  fieldError: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(12.5),
    marginTop: 4,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  halfCol: {
    flex: 1,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    borderRadius: Radii.md,
    borderWidth: 1,
    paddingHorizontal: 6,
  },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperInput: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(16),
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    borderRadius: Radii.md,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  dropdownValue: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(14.5),
  },
  stockCard: {
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  stockHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stockIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stockTitle: {
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(15),
  },
  stockSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: scaleFont(12.5),
    marginTop: 1,
  },
  stockInputsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E8E3',
  },
  subLabel: {
    fontFamily: FontFamily.medium,
    fontSize: scaleFont(12),
    marginBottom: 4,
  },
  smallInput: {
    height: 44,
    borderRadius: Radii.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontFamily: FontFamily.bold,
    fontSize: scaleFont(14),
  },
  actionsContainer: {
    marginTop: Spacing.sm,
  },
});
