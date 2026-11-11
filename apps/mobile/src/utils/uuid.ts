/**
 * Robust UUID v4 generator that works reliably across:
 * - React Native Hermes engine (Android/iOS)
 * - Bun runtime (unit tests)
 * - Web browsers
 */
export function generateUUID(): string {
  // 1. Check if native global crypto.randomUUID is present (Bun, Node, modern browsers)
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      // Fall through
    }
  }

  // 2. Try expo-crypto if available in Expo environment
  try {
    const Crypto = require('expo-crypto');
    if (Crypto && typeof Crypto.randomUUID === 'function') {
      return Crypto.randomUUID();
    }
  } catch {
    // Fall through
  }

  // 3. RFC4122 version 4 UUID generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Global polyfill for environments where globalThis.crypto is missing (e.g. Hermes on Android)
if (typeof globalThis !== 'undefined') {
  if (typeof (globalThis as any).crypto === 'undefined') {
    (globalThis as any).crypto = {};
  }
  if (typeof (globalThis as any).crypto.randomUUID !== 'function') {
    (globalThis as any).crypto.randomUUID = () => generateUUID();
  }
}
