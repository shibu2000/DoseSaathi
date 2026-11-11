import { describe, it, expect } from 'bun:test';
import { extractDoorbellType } from '../src/sync/doorbell';

describe('push doorbell payload parsing', () => {
  it('reads the type from every payload shape the platforms deliver', () => {
    expect(extractDoorbellType({ type: 'PLAN_VERSION' })).toBe('PLAN_VERSION');
    expect(extractDoorbellType({ data: { type: 'RELATIONSHIP_CHANGED' } })).toBe('RELATIONSHIP_CHANGED');
    expect(extractDoorbellType({ data: { dataString: JSON.stringify({ type: 'PAIRING_REQUEST', sessionId: 'x' }) } })).toBe('PAIRING_REQUEST');
    expect(extractDoorbellType({ notification: { data: { type: 'PLAN_VERSION' } } })).toBe('PLAN_VERSION');
    expect(extractDoorbellType(null)).toBeNull();
    expect(extractDoorbellType({ foo: 'bar' })).toBeNull();
  });
});
