import type { Medication, Schedule } from '@medchain/contracts';
import { generateOccurrencesForRange } from '../schedules/generator';
import { addDays } from '../schedules/date-utils';

export interface StockForecastResult {
  currentStock: number;
  dailyConsumptionRate: number;
  daysRemaining: number;
  isLowStock: boolean;
}

export function forecastMedicationStock(params: {
  medication: Medication;
  schedule: Schedule;
  currentLocalDate: string; // 'YYYY-MM-DD'
  forecastWindowDays?: number; // default 30 days
}): StockForecastResult {
  const { medication, schedule, currentLocalDate, forecastWindowDays = 30 } = params;

  if (!medication.trackStock) {
    return {
      currentStock: medication.currentStock,
      dailyConsumptionRate: 0,
      daysRemaining: Infinity,
      isLowStock: false,
    };
  }

  if (medication.currentStock <= 0) {
    return {
      currentStock: 0,
      dailyConsumptionRate: 0,
      daysRemaining: 0,
      isLowStock: true,
    };
  }

  // Simulate next N days to obtain true empirical consumption across cycles and intervals
  const windowEndLocalDate = addDays(currentLocalDate, forecastWindowDays);
  const futureOccurrences = generateOccurrencesForRange({
    medication: { ...medication, lifecycleStatus: 'ACTIVE' },
    schedule,
    fromLocalDate: currentLocalDate,
    toLocalDate: windowEndLocalDate,
  });

  const totalDosesInWindow = futureOccurrences.length;
  if (totalDosesInWindow === 0) {
    return {
      currentStock: medication.currentStock,
      dailyConsumptionRate: 0,
      daysRemaining: Infinity,
      isLowStock: false,
    };
  }

  const dailyDoseCount = totalDosesInWindow / (forecastWindowDays + 1);
  const dailyConsumptionRate = dailyDoseCount * medication.doseQuantity;

  const daysRemaining = dailyConsumptionRate > 0
    ? Math.floor(medication.currentStock / dailyConsumptionRate)
    : Infinity;

  const threshold = medication.lowStockThreshold ?? 5;
  const isLowStock = daysRemaining <= threshold;

  return {
    currentStock: medication.currentStock,
    dailyConsumptionRate: Number(dailyConsumptionRate.toFixed(2)),
    daysRemaining,
    isLowStock,
  };
}
