// Structured JSON logs. Callers must only pass non-sensitive fields (ids, codes, counts).
const FORBIDDEN = /(token|secret|password|code|authorization|medication|dosage|pushtoken)/i;

export function log(level: 'info' | 'warn' | 'error', msg: string, fields: Record<string, unknown> = {}): void {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test' && !process.env.LOG_IN_TESTS) return;
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'errorCode' || !FORBIDDEN.test(k)) safe[k] = v;
  }
  const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...safe });
  if (level === 'error') console.error(line);
  else console.log(line);
}
