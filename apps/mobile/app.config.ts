import { existsSync } from 'node:fs';
import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Extends app.json at build time so secrets/paths are never committed:
 * - EXPO_PUBLIC_API_URL: the deployed Worker URL (https://...)
 * - GOOGLE_SERVICES_JSON: path to the Firebase google-services.json (Android push); falls back to ./google-services.json
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServices =
    process.env.GOOGLE_SERVICES_JSON ?? (existsSync('./google-services.json') ? './google-services.json' : undefined);
  return {
    ...config,
    plugins: [...(config.plugins ?? []), './plugins/withMedchainAlarm'],
    name: config.name ?? 'DoseSaathi',
    slug: config.slug ?? 'dosesaathi',
    ios: {
      ...config.ios,
      infoPlist: { ...config.ios?.infoPlist, UIBackgroundModes: ['remote-notification'] },
    },
    android: { ...config.android, ...(googleServices ? { googleServicesFile: googleServices } : {}) },
    extra: { ...config.extra, apiBaseUrl: process.env.EXPO_PUBLIC_API_URL ?? config.extra?.apiBaseUrl },
  };
};
