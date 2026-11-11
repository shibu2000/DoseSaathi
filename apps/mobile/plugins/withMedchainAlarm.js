const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Lets the main activity be shown over the lock screen and turn the display on. The native module
 * switches this OFF again for every launch that is not an alarm and when the alarm screen is closed,
 * so medicine data is never left visible on a locked phone.
 */
module.exports = function withMedchainAlarm(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (main) {
      main.$['android:showWhenLocked'] = 'true';
      main.$['android:turnScreenOn'] = 'true';
    }
    return cfg;
  });
};
