import type { Medication, DoseEventType } from '@medchain/contracts';

export function calculateStockAfterAction(params: {
  medication: Medication;
  actionTaken: DoseEventType;
  confirmedDoseQuantity?: number;
}): {
  updatedStock: number;
  stockDecremented: boolean;
  decrementedAmount: number;
} {
  const { medication, actionTaken, confirmedDoseQuantity } = params;

  if (!medication.trackStock) {
    return {
      updatedStock: medication.currentStock,
      stockDecremented: false,
      decrementedAmount: 0,
    };
  }

  // Stock decrements ONLY on confirmed TAKEN action
  if (actionTaken === 'TAKEN') {
    const qty = confirmedDoseQuantity ?? medication.doseQuantity;
    const newStock = Math.max(0, medication.currentStock - qty);
    return {
      updatedStock: newStock,
      stockDecremented: true,
      decrementedAmount: qty,
    };
  }

  return {
    updatedStock: medication.currentStock,
    stockDecremented: false,
    decrementedAmount: 0,
  };
}
