// Config plugin: verwijdert de ongebruikte microfoon-permissies (RECORD_AUDIO,
// MODIFY_AUDIO_SETTINGS) die expo-audio standaard toevoegt. Heitje neemt géén audio
// op — createAudioPlayer wordt alleen gebruikt voor korte tap-geluidjes (afspelen
// heeft deze permissies niet nodig). Schoon voor de Google Play Families-review:
// geen ongebruikte gevoelige permissies in het manifest.
//
// Moet vóór de build controleren of tap-geluidjes nog werken; zo niet, herstel dan
// MODIFY_AUDIO_SETTINGS (dat is "normal" protection, geen microfoon).
const { withAndroidManifest } = require("@expo/config-plugins");

const STRIP = ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"];

module.exports = function stripMicPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const perms = manifest["uses-permission"] || [];
    manifest["uses-permission"] = perms.filter(
      (p) => p && p.$ && !STRIP.includes(p.$["android:name"])
    );
    return cfg;
  });
};
