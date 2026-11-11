import { describe, it, expect, beforeEach } from 'bun:test';
import { BunSqliteAdapter } from '../src/database/adapters/bun-adapter';
import { AppDatabase, type WizardDraft, DEFAULT_WIZARD_DRAFT } from '../src/database';
import { formatISODate } from '@medchain/domain';

describe('Phase 3 — Patient UI, Wizard & Medication Workflows', () => {
  let adapter: BunSqliteAdapter;
  let db: AppDatabase;
  let profileId: string;

  beforeEach(async () => {
    adapter = new BunSqliteAdapter(':memory:');
    db = await AppDatabase.initialize(adapter);
    db.tz = 'UTC';
    db.clock = () => new Date('2026-11-09T03:00:00.000Z');

    const nowIso = new Date().toISOString();
    profileId = crypto.randomUUID();
    await db.profiles.create({
      id: profileId,
      displayName: 'Eleanor Vance',
      profileType: 'PERSONAL',
      timezoneId: 'America/New_York',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  });

  it('P3-01: Wizard draft persists to SQLite across steps and survives draft resumption', async () => {
    // Step 1: Save basics
    const step1Draft: WizardDraft = {
      ...DEFAULT_WIZARD_DRAFT,
      name: 'Atorvastatin',
      dosageText: '20 mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      instructions: 'Take at bedtime',
      trackStock: true,
      currentStock: 30,
      lowStockThreshold: 5,
      currentStep: 2,
    };
    await db.drafts.saveDraft(step1Draft);

    let loaded = await db.drafts.getDraft();
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('Atorvastatin');
    expect(loaded!.dosageText).toBe('20 mg');
    expect(loaded!.trackStock).toBe(true);
    expect(loaded!.currentStep).toBe(2);

    // Step 2: Add schedule
    const step2Draft: WizardDraft = {
      ...loaded!,
      scheduleType: 'FIXED_TIMES',
      recurrenceType: 'DAILY',
      fixedTimes: ['21:00'],
      currentStep: 3,
    };
    await db.drafts.saveDraft(step2Draft);

    loaded = await db.drafts.getDraft();
    expect(loaded!.fixedTimes).toEqual(['21:00']);
    expect(loaded!.currentStep).toBe(3);

    // Step 3: Add course duration
    const step3Draft: WizardDraft = {
      ...loaded!,
      courseType: 'ONGOING',
      currentStep: 4,
    };
    await db.drafts.saveDraft(step3Draft);

    // Step 4: Verify complete draft
    loaded = await db.drafts.getDraft();
    expect(loaded!.name).toBe('Atorvastatin');
    expect(loaded!.fixedTimes).toEqual(['21:00']);
    expect(loaded!.courseType).toBe('ONGOING');
    expect(loaded!.currentStep).toBe(4);

    // Step 4 back to Step 1: Edit name without losing Step 2 & 3 settings
    const editedDraft: WizardDraft = {
      ...loaded!,
      name: 'Atorvastatin Calcium',
      currentStep: 1,
    };
    await db.drafts.saveDraft(editedDraft);

    loaded = await db.drafts.getDraft();
    expect(loaded!.name).toBe('Atorvastatin Calcium');
    expect(loaded!.fixedTimes).toEqual(['21:00']);
    expect(loaded!.courseType).toBe('ONGOING');
    expect(loaded!.currentStep).toBe(1);

    // Clear draft
    await db.drafts.clearDraft();
    loaded = await db.drafts.getDraft();
    expect(loaded).toBeNull();
  });

  it('P3-02: Patient creates an ongoing medicine with fixed times -> persists and materializes today occurrences', async () => {
    const draft: WizardDraft = {
      ...DEFAULT_WIZARD_DRAFT,
      name: 'Metformin',
      dosageText: '500 mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      instructions: 'Take with breakfast',
      trackStock: true,
      currentStock: 60,
      lowStockThreshold: 5,
      scheduleType: 'FIXED_TIMES',
      recurrenceType: 'DAILY',
      fixedTimes: ['08:00', '20:00'],
      courseType: 'ONGOING',
      hasPrerequisiteCourse: false,
      phaseDelayHours: 0,
      currentStep: 4,
    };

    const result = await db.createMedicationWithSchedule(draft, profileId);
    expect(result.medication.name).toBe('Metformin');
    expect(result.medication.lifecycleStatus).toBe('ACTIVE');
    expect(result.schedule.fixedTimes).toEqual(['08:00', '20:00']);

    // Verify stored in SQLite
    const savedMed = await db.medications.getById(result.medication.id);
    expect(savedMed).not.toBeNull();
    expect(savedMed!.trackStock).toBe(true);
    expect(savedMed!.currentStock).toBe(60);

    // Verify today occurrences generated
    const today = formatISODate(db.clock());
    const todayOccurrences = await db.getOccurrencesWithMedication(today);
    expect(todayOccurrences.length).toBeGreaterThanOrEqual(2);

    const metOccurrences = todayOccurrences.filter((o) => o.medicationId === result.medication.id);
    expect(metOccurrences).toHaveLength(2);
    expect(metOccurrences[0].scheduledLocalTime).toBe('08:00');
    expect(metOccurrences[1].scheduledLocalTime).toBe('20:00');
    expect(metOccurrences[0].medication.name).toBe('Metformin');
  });

  it('P3-03: Patient creates a fixed-day short course (7-day antibiotic)', async () => {
    const draft: WizardDraft = {
      ...DEFAULT_WIZARD_DRAFT,
      name: 'Azithromycin',
      dosageText: '250 mg',
      doseQuantity: 1,
      doseUnit: 'capsule',
      instructions: 'Take once daily for 7 days',
      trackStock: true,
      currentStock: 7,
      lowStockThreshold: 2,
      scheduleType: 'FIXED_TIMES',
      recurrenceType: 'DAILY',
      fixedTimes: ['09:00'],
      courseType: 'FIXED_DAYS',
      maxDurationDays: 7,
      hasPrerequisiteCourse: false,
      phaseDelayHours: 0,
      currentStep: 4,
    };

    const result = await db.createMedicationWithSchedule(draft, profileId);
    expect(result.medication.courseType).toBe('FIXED_DAYS');
    expect(result.medication.maxDurationDays).toBe(7);
    expect(result.medication.lifecycleStatus).toBe('ACTIVE');

    const saved = await db.medications.getById(result.medication.id);
    expect(saved!.maxDurationDays).toBe(7);
  });

  it('P3-04: Patient creates a cyclical ON/OFF schedule (21 days ON, 7 days OFF)', async () => {
    const today = formatISODate(db.clock());
    const draft: WizardDraft = {
      ...DEFAULT_WIZARD_DRAFT,
      name: 'Ethinyl Estradiol',
      dosageText: '0.03 mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      scheduleType: 'FIXED_TIMES',
      recurrenceType: 'CYCLE',
      cycleDaysOn: 21,
      cycleDaysOff: 7,
      cycleAnchorDate: today,
      fixedTimes: ['08:00'],
      courseType: 'ONGOING',
      hasPrerequisiteCourse: false,
      phaseDelayHours: 0,
      currentStep: 4,
    };

    const result = await db.createMedicationWithSchedule(draft, profileId);
    const savedSched = await db.schedules.getByMedicationId(result.medication.id);
    expect(savedSched).not.toBeNull();
    expect(savedSched!.recurrenceType).toBe('CYCLE');
    expect(savedSched!.cycleDaysOn).toBe(21);
    expect(savedSched!.cycleDaysOff).toBe(7);

    // Since today is anchor date (day 1 of cycle), occurrence must be generated for today
    const occs = await db.getOccurrencesWithMedication(today);
    const medOccs = occs.filter((o) => o.medicationId === result.medication.id);
    expect(medOccs).toHaveLength(1);
    expect(medOccs[0].scheduledLocalTime).toBe('08:00');
  });

  it('P3-05: Patient creates an interval schedule (every 6 hours)', async () => {
    const draft: WizardDraft = {
      ...DEFAULT_WIZARD_DRAFT,
      name: 'Ibuprofen',
      dosageText: '400 mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      instructions: 'Take every 6 hours as needed for pain',
      scheduleType: 'INTERVAL',
      recurrenceType: 'DAILY',
      intervalHours: 6,
      intervalFirstTime: '06:00',
      courseType: 'ONGOING',
      hasPrerequisiteCourse: false,
      phaseDelayHours: 0,
      currentStep: 4,
    };

    const result = await db.createMedicationWithSchedule(draft, profileId);
    const today = formatISODate(db.clock());
    const occs = await db.getOccurrencesWithMedication(today);
    const ibuOccs = occs.filter((o) => o.medicationId === result.medication.id);

    // 06:00, 12:00, 18:00 -> 3 doses within 24h
    expect(ibuOccs.length).toBeGreaterThanOrEqual(3);
    const times = ibuOccs.map((o) => o.scheduledLocalTime);
    expect(times).toContain('06:00');
    expect(times).toContain('12:00');
    expect(times).toContain('18:00');
  });

  it('P3-06: Same-day dependent dose: linked parent schedule triggers child dose upon TAKEN', async () => {
    // 1. Create parent medicine
    const parent = await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Levothyroxine',
        dosageText: '50 mcg',
        doseQuantity: 1,
        doseUnit: 'tablet',
        instructions: 'Take on empty stomach 30m before breakfast',
        scheduleType: 'FIXED_TIMES',
        recurrenceType: 'DAILY',
        fixedTimes: ['07:00'],
        courseType: 'ONGOING',
        hasPrerequisiteCourse: false,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );

    // 2. Create child same-day dependent medicine (Calcium Carbonate, 30 min after Levothyroxine)
    const child = await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Calcium Carbonate',
        dosageText: '500 mg',
        doseQuantity: 1,
        doseUnit: 'tablet',
        scheduleType: 'SAME_DAY_DEPENDENT',
        recurrenceType: 'DAILY',
        sameDayParentMedicationId: parent.medication.id,
        sameDayDelayMinutes: 30,
        sameDayFallbackPolicy: 'SKIP_CHILD',
        courseType: 'ONGOING',
        hasPrerequisiteCourse: false,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );

    // Verify dependency link exists
    const deps = await db.dependencies.getChildren(parent.medication.id);
    expect(deps).toHaveLength(1);
    expect(deps[0].childMedicationId).toBe(child.medication.id);
    expect(deps[0].dependencyType).toBe('SAME_DAY_AFTER_TAKEN');
    expect(deps[0].delayMinutes).toBe(30);

    // Child should NOT have occurrences prior to parent TAKEN
    const today = formatISODate(db.clock());
    let occs = await db.getOccurrencesWithMedication(today);
    let childOccs = occs.filter((o) => o.medicationId === child.medication.id);
    expect(childOccs).toHaveLength(0);

    // Take parent dose
    const parentOcc = occs.find((o) => o.medicationId === parent.medication.id)!;
    const takeResult = await db.recordDoseAction({
      medicationId: parent.medication.id,
      occurrenceId: parentOcc.id,
      action: 'TAKEN',
      actionTimestampUtc: '2026-11-09T07:05:00.000Z',
    });
    expect(takeResult.childOccurrenceScheduled).toBe(true);

    // Child occurrence should now exist dynamically scheduled 30m after taken (07:35)
    occs = await db.getOccurrencesWithMedication(today);
    childOccs = occs.filter((o) => o.medicationId === child.medication.id);
    expect(childOccs).toHaveLength(1);
    expect(childOccs[0].scheduledLocalTime).toBe('07:35');
  });

  it('P3-07: "Save & add follow-up medicine" sequence links prerequisite course and preserves status', async () => {
    // 1. Create first medicine: 7-day antibiotic
    const antibiotic = await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Amoxicillin Course',
        dosageText: '500 mg',
        doseQuantity: 1,
        doseUnit: 'capsule',
        scheduleType: 'FIXED_TIMES',
        recurrenceType: 'DAILY',
        fixedTimes: ['08:00'],
        courseType: 'FIXED_DAYS',
        maxDurationDays: 7,
        hasPrerequisiteCourse: false,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );
    expect(antibiotic.medication.lifecycleStatus).toBe('ACTIVE');

    // 2. Add follow-up medicine (Probiotic, starts after antibiotic finishes)
    const probiotic = await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Probiotic Support',
        dosageText: '1 capsule',
        doseQuantity: 1,
        doseUnit: 'capsule',
        scheduleType: 'FIXED_TIMES',
        recurrenceType: 'DAILY',
        fixedTimes: ['08:00'],
        courseType: 'FIXED_DAYS',
        maxDurationDays: 14,
        hasPrerequisiteCourse: true,
        prerequisiteMedicationId: antibiotic.medication.id,
        phaseDelayHours: 24,
        currentStep: 4,
      },
      profileId
    );

    // Probiotic must be QUEUED_PHASE
    expect(probiotic.medication.lifecycleStatus).toBe('QUEUED_PHASE');

    // Verify course dependency link
    const deps = await db.dependencies.getChildren(antibiotic.medication.id);
    const courseDep = deps.find((d) => d.dependencyType === 'AFTER_COURSE_COMPLETED');
    expect(courseDep).toBeDefined();
    expect(courseDep!.childMedicationId).toBe(probiotic.medication.id);
    expect(courseDep!.phaseDelayHours).toBe(24);

    // Queued course must NOT have dose occurrences
    const today = formatISODate(db.clock());
    const occs = await db.getOccurrencesWithMedication(today);
    const probOccs = occs.filter((o) => o.medicationId === probiotic.medication.id);
    expect(probOccs).toHaveLength(0);
  });

  it('P3-08: Editing an existing medicine updates the record in-place without duplicates', async () => {
    const med = await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Metformin',
        dosageText: '500 mg',
        doseQuantity: 1,
        doseUnit: 'tablet',
        instructions: 'With breakfast',
        trackStock: true,
        currentStock: 30,
        lowStockThreshold: 5,
        scheduleType: 'FIXED_TIMES',
        recurrenceType: 'DAILY',
        fixedTimes: ['08:00'],
        courseType: 'ONGOING',
        hasPrerequisiteCourse: false,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );

    // Edit: increase dose to 1000 mg and quantity to 2 tablets
    const editDraft: WizardDraft = {
      ...DEFAULT_WIZARD_DRAFT,
      editingMedicationId: med.medication.id,
      name: 'Metformin Extended Release',
      dosageText: '1000 mg',
      doseQuantity: 2,
      doseUnit: 'tablet',
      instructions: 'With evening meal',
      trackStock: true,
      currentStock: 28,
      lowStockThreshold: 5,
      scheduleType: 'FIXED_TIMES',
      recurrenceType: 'DAILY',
      fixedTimes: ['20:00'],
      courseType: 'ONGOING',
      hasPrerequisiteCourse: false,
      phaseDelayHours: 0,
      currentStep: 4,
    };

    const updated = await db.createMedicationWithSchedule(editDraft, profileId);
    expect(updated.medication.id).toBe(med.medication.id);

    const allMeds = await db.medications.getAll();
    expect(allMeds).toHaveLength(1);
    expect(allMeds[0].name).toBe('Metformin Extended Release');
    expect(allMeds[0].dosageText).toBe('1000 mg');
    expect(allMeds[0].doseQuantity).toBe(2);
    expect(allMeds[0].instructions).toBe('With evening meal');
  });

  it('P3-09: Low-stock detection identifies supplies <= threshold', async () => {
    await db.createMedicationWithSchedule(
      {
        ...DEFAULT_WIZARD_DRAFT,
        name: 'Lisinopril',
        dosageText: '10 mg',
        doseQuantity: 1,
        doseUnit: 'tablet',
        trackStock: true,
        currentStock: 4, // below threshold 5
        lowStockThreshold: 5,
        scheduleType: 'FIXED_TIMES',
        recurrenceType: 'DAILY',
        fixedTimes: ['08:00'],
        courseType: 'ONGOING',
        hasPrerequisiteCourse: false,
        phaseDelayHours: 0,
        currentStep: 4,
      },
      profileId
    );

    const meds = await db.medications.getAll();
    const lisinopril = meds[0];
    const isLowStock = lisinopril.trackStock && lisinopril.currentStock <= lisinopril.lowStockThreshold;
    expect(isLowStock).toBe(true);
  });
});
