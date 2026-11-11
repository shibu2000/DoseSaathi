/**
 * Extracts the doorbell `type` from whatever shape the platform delivers. The push carries no
 * authority and no medicine data: it only tells us to ask the server what changed.
 */
export function extractDoorbellType(payload: unknown): string | null {
  const p = payload as any;
  const candidates: any[] = [p, p?.data, p?.notification?.data, p?.data?.notification?.data];
  for (const c of candidates) {
    if (c && typeof c === 'object') {
      if (typeof c.type === 'string') return c.type;
      if (typeof c.dataString === 'string') {
        try {
          const parsed = JSON.parse(c.dataString);
          if (typeof parsed?.type === 'string') return parsed.type;
        } catch {}
      }
      if (typeof c.body === 'string') {
        try {
          const parsed = JSON.parse(c.body);
          if (typeof parsed?.type === 'string') return parsed.type;
        } catch {}
      }
    }
  }
  return null;
}

