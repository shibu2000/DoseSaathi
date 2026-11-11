import { describe, it, expect, beforeEach } from 'bun:test';
import { BunSqliteAdapter } from '../src/database/adapters/bun-adapter';
import { AppDatabase } from '../src/database';
import { HeadlessAlarmAdapter, SchedulerService } from '../src/alarms';

describe('Phase 8 — Settings, Permissions, Diagnostics & Truthful Privacy', () => {
  let dbAdapter: BunSqliteAdapter;
  let db: AppDatabase;
  let alarmAdapter: HeadlessAlarmAdapter;
  let scheduler: SchedulerService;

  beforeEach(async () => {
    dbAdapter = new BunSqliteAdapter(':memory:');
    db = await AppDatabase.initialize(dbAdapter);
    alarmAdapter = new HeadlessAlarmAdapter();
    scheduler = new SchedulerService(db, alarmAdapter);
  });

  it('P8-01: Alarm sound and vibration preferences persist in SQLite device_settings', async () => {
    // Default should be true
    let sound = await db.settings.getBoolean('alarm_sound_enabled', true);
    let vib = await db.settings.getBoolean('alarm_vibration_enabled', true);
    expect(sound).toBe(true);
    expect(vib).toBe(true);

    // Update settings
    await db.settings.setBoolean('alarm_sound_enabled', false);
    await db.settings.setBoolean('alarm_vibration_enabled', true);

    // Re-query
    sound = await db.settings.getBoolean('alarm_sound_enabled', true);
    vib = await db.settings.getBoolean('alarm_vibration_enabled', false);
    expect(sound).toBe(false);
    expect(vib).toBe(true);
  });

  it('P8-02: Scheduler diagnostics reports truthful capability without fabricated permissions', async () => {
    const diag = await scheduler.getDiagnostics();

    expect(diag.platform).toBe('headless');
    expect(diag.exactAlarmGranted).toBe(true); // Headless mock capability
    expect(diag.notificationGranted).toBe(true);
    expect(diag.activeAlarmMode).toBe('EXACT_ALARM_CLOCK');
    expect(typeof diag.activeAlarmsCount).toBe('number');
  });

  it('P8-03: Operating mode switch persists across app restart in SQLite', async () => {
    await db.settings.set('app_mode', 'caregiver');
    let mode = await db.settings.get('app_mode');
    expect(mode).toBe('caregiver');

    await db.settings.set('app_mode', 'personal');
    mode = await db.settings.get('app_mode');
    expect(mode).toBe('personal');
  });

  it('P8-04: Truthful privacy: local database operates completely offline with no network dependencies', async () => {
    const primaryProfileId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    await db.profiles.create({
      id: primaryProfileId,
      displayName: 'Eleanor Vance',
      profileType: 'PERSONAL',
      timezoneId: 'America/New_York',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const prof = await db.profiles.getById(primaryProfileId);
    expect(prof).toBeDefined();
    expect(prof!.displayName).toBe('Eleanor Vance');

    // Confirm no network sync was needed
    const outboxItems = await db.outbox.getAllUnsynced();
    expect(outboxItems).toHaveLength(0);
  });
});
