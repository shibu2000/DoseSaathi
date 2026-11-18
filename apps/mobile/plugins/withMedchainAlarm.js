const { withAndroidManifest } = require('expo/config-plugins');

/**
 * The medicine alarm is shown by the native AlarmActivity (declared in the medchain-alarm module), which
 * appears over the lock screen and wakes the display by itself. The main app must never show over the
 * lock screen, so this removes any such flags from MainActivity (e.g. left from older versions).
 */
module.exports = function withMedchainAlarm(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (main) {
      delete main.$['android:showWhenLocked'];
      delete main.$['android:turnScreenOn'];
    }
    return cfg;
  });
};
