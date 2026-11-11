import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { FormField } from '@/components/FormField';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
import { PatientContextBar } from '@/components/PatientContextBar';
import { useWizardSession } from '@/caregiver/wizard-session';
import { CheckingScreen, FormScreen, Notice } from '@/caregiver/ui';
import { DEFAULT_WIZARD_DRAFT, type WizardDraft } from '@/database';
import { Ionicons } from '@expo/vector-icons';
import { DoseQuantityModal, DoseUnitModal } from '@/components/DosePickerModal';

export default function Step1MedicineDetailsScreen() {
  const router = useRouter();
  const session = useWizardSession();
  const { getDraft, saveDraft } = session;

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
  const [showQtyModal, setShowQtyModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);

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

  const handleContinue = async () => {
    if (!name.trim()) {
      setError('Please enter a medicine name');
      return;
    }
    setError('');
    const qty = parseFloat(doseQuantity);
    if (isNaN(qty) || qty <= 0) {
      setQtyError('Enter a dose greater than 0, for example 1.');
      return;
    }
    setQtyError('');

    const updated: WizardDraft = {
      ...activeDraft,
      name: name.trim(),
      dosageText: dosageText.trim() || `${qty} ${doseUnit.trim() || 'tablet'}`,
      doseQuantity: qty,
      doseUnit: doseUnit.trim() || 'tablet',
      instructions: instructions.trim(),
      trackStock,
      currentStock: trackStock ? parseFloat(currentStock) || 0 : 0,
      lowStockThreshold: trackStock ? parseFloat(lowStockThreshold) || 5 : 5,
      currentStep: 2,
    };

    try {
      await saveDraft(updated);
    } catch {
      setError("Couldn't save this step on the phone. Please try again.");
      return;
    }
    router.push(session.route('/medicine/new/schedule') as any);
  };

  if (session.isCaregiver) {
    if (session.access.state !== 'ready') return <CheckingScreen title="Medicine details" />;
    if (!session.access.canEdit) {
      return (
        <FormScreen>
          <ScreenHeader title="Medicine details" showBack={true} />
          <PatientContextBar
            patientName={session.access.relationship.patientDisplayName}
            relationshipLabel={session.access.relationship.relationshipLabel}
          />
          <Notice icon="eye-outline" title="View only">
            {session.access.relationship.patientDisplayName} has not allowed you to change medicines. You can see them, but not add or edit.
          </Notice>
        </FormScreen>
      );
    }
  }

  return (
    <FormScreen>
      <ScreenHeader
        title="Medicine details"
        subtitle="Step 1 of 4: name, strength and dose form"
        showBack={true}
      />

      {session.isCaregiver && session.access.state === 'ready' && (
        <PatientContextBar
          patientName={session.access.relationship.patientDisplayName}
          relationshipLabel={session.access.relationship.relationshipLabel}
        />
      )}

      <View style={styles.formCard}>
        <FormField
          label="Medicine name (required)"
          placeholder="e.g. Metformin, Lisinopril"
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (error) setError('');
          }}
          error={error}
        />

        <FormField
          label="Strength or description"
          placeholder="e.g. 500 mg, 10 mL"
          value={dosageText}
          onChangeText={setDosageText}
          helper="Shown on reminders and dose cards"
        />

        <View style={styles.row}>
          <View style={styles.halfCol}>
            <Text style={styles.inputLabel}>Dose quantity (dropdown)</Text>
            <TouchableOpacity
              style={[styles.dropdownTrigger, qtyError ? styles.dropdownTriggerError : null]}
              onPress={() => setShowQtyModal(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Select dose quantity, currently ${doseQuantity}`}
            >
              <Text style={styles.dropdownValue}>{doseQuantity}</Text>
              <Ionicons name="chevron-down" size={18} color={Colors.inkMuted} />
            </TouchableOpacity>
            {qtyError ? <Text style={styles.errorText}>{qtyError}</Text> : null}
          </View>
          <View style={styles.halfCol}>
            <Text style={styles.inputLabel}>Unit or form (dropdown)</Text>
            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={() => setShowUnitModal(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Select medicine form, currently ${doseUnit}`}
            >
              <Text style={styles.dropdownValue} numberOfLines={1}>{doseUnit}</Text>
              <Ionicons name="chevron-down" size={18} color={Colors.inkMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <FormField
          label="Instructions (optional)"
          placeholder="e.g. Take with morning meal, do not crush"
          value={instructions}
          onChangeText={setInstructions}
        />

        <View style={styles.divider} />

        <View style={styles.switchRow}>
          <View style={styles.switchTextContainer}>
            <Text style={styles.switchLabel}>Track inventory stock</Text>
            <Text style={styles.switchDesc}>
              Stock goes down each time a dose is marked as taken.
            </Text>
          </View>
          <Switch
            value={trackStock}
            onValueChange={setTrackStock}
            accessibilityLabel="Track inventory stock"
            trackColor={{ false: Colors.outline, true: Colors.brand }}
          />
        </View>

        {trackStock && (
          <View style={styles.row}>
            <View style={styles.halfCol}>
              <FormField
                label="Stock on hand"
                keyboardType="decimal-pad"
                value={currentStock}
                onChangeText={setCurrentStock}
                helper={
                  session.isCaregiver && activeDraft.editingMedicationId
                    ? 'The phone keeps its own running count, so this only matters for new stock tracking.'
                    : undefined
                }
              />
            </View>
            <View style={styles.halfCol}>
              <FormField
                label="Remind to refill at"
                keyboardType="decimal-pad"
                value={lowStockThreshold}
                onChangeText={setLowStockThreshold}
                helper="Shown as low stock at this amount"
              />
            </View>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          title="Continue to Schedule"
          onPress={handleContinue}
        />
        <SecondaryButton
          title="Cancel"
          onPress={() => router.back()}
        />
      </View>

      {/* Dose Quantity & Unit Selection Modals */}
      <DoseQuantityModal
        visible={showQtyModal}
        selectedQuantity={doseQuantity}
        onSelect={(q) => {
          setDoseQuantity(q);
          if (qtyError) setQtyError('');
        }}
        onClose={() => setShowQtyModal(false)}
      />

      <DoseUnitModal
        visible={showUnitModal}
        selectedUnit={doseUnit}
        onSelect={(u) => setDoseUnit(u)}
        onClose={() => setShowUnitModal(false)}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  formCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    columnGap: Spacing.md,
  },
  halfCol: {
    flex: 1,
    flexBasis: 120,
    minWidth: 120,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.outline,
    marginVertical: Spacing.lg,
  },
  switchRow: {
    flexDirection: 'row',
    minHeight: 56,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  switchTextContainer: {
    flex: 1,
    marginRight: Spacing.md,
  },
  switchLabel: {
    ...Typography.labelMedium,
    color: Colors.ink,
  },
  switchDesc: {
    ...Typography.bodySmall,
    color: Colors.inkMuted,
    marginTop: 2,
  },
  footer: {
    gap: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  inputLabel: {
    ...Typography.labelMedium,
    color: Colors.ink,
    marginBottom: Spacing.xs,
  },
  dropdownTrigger: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.outline,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  dropdownTriggerError: {
    borderColor: Colors.danger,
  },
  dropdownValue: {
    ...Typography.bodyLarge,
    color: Colors.ink,
    fontWeight: '600',
    flex: 1,
  },
  errorText: {
    ...Typography.bodySmall,
    color: Colors.danger,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.xs,
  },
});
