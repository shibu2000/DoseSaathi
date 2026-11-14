import { describe, it, expect } from 'bun:test';
import { formatCountdown } from '../src/utils/countdown';

describe('formatCountdown', () => {
  const baseNow = 1700000000000;

  it('reports "Due now" when time has passed or is 0', () => {
    const resExact = formatCountdown(baseNow, baseNow, false);
    expect(resExact.badgeText).toBe('Due now');
    expect(resExact.isDue).toBe(true);
    expect(resExact.relativeDetail).toBe('Due right now');

    const resPast = formatCountdown(baseNow - 5 * 60 * 1000, baseNow, false);
    expect(resPast.badgeText).toBe('Due now');
    expect(resPast.isDue).toBe(true);
    expect(resPast.relativeDetail).toBe('Due 5 min ago');
  });

  it('formats upcoming countdown in minutes when under 1 hour', () => {
    const res10m = formatCountdown(baseNow + 10 * 60 * 1000, baseNow, false);
    expect(res10m.badgeText).toBe('in next 10 min');
    expect(res10m.isDue).toBe(false);
    expect(res10m.relativeDetail).toBe('Scheduled in next 10 minutes');

    const res45m = formatCountdown(baseNow + 45 * 60 * 1000, baseNow, false);
    expect(res45m.badgeText).toBe('in next 45 min');
    expect(res45m.isDue).toBe(false);
  });

  it('formats upcoming countdown in hours when >= 1 hour', () => {
    const res1h = formatCountdown(baseNow + 60 * 60 * 1000, baseNow, false);
    expect(res1h.badgeText).toBe('in next 1 hour');
    expect(res1h.isDue).toBe(false);

    const res2h = formatCountdown(baseNow + 2 * 60 * 60 * 1000, baseNow, false);
    expect(res2h.badgeText).toBe('in next 2 hours');
    expect(res2h.isDue).toBe(false);

    const res2h15m = formatCountdown(baseNow + (2 * 60 + 15) * 60 * 1000, baseNow, false);
    expect(res2h15m.badgeText).toBe('in next 2h 15m');
    expect(res2h15m.isDue).toBe(false);
  });

  it('formats snoozed countdown correctly', () => {
    const resSnoozed = formatCountdown(baseNow + 8 * 60 * 1000, baseNow, true);
    expect(resSnoozed.badgeText).toBe('Snoozed • in next 8m');
    expect(resSnoozed.isDue).toBe(false);
    expect(resSnoozed.relativeDetail).toContain('Reminder will ring in next 8 minutes');
  });

  it('theme tokens expose distinct visual styles for classic and glassmorphism', () => {
    const { ClassicColors, GlassColors } = require('../src/theme');
    expect(ClassicColors.cardBackground).toBe('#FFFEFA');
    expect(GlassColors.cardBackground).toContain('rgba');
    expect(GlassColors.outline).toContain('rgba');
    expect(GlassColors.canvas).not.toBe(ClassicColors.canvas);
  });
});
