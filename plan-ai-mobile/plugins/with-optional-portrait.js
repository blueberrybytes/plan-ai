const { withAndroidManifest } = require("@expo/config-plugins");

// The app is locked to portrait (orientation in app.config.ts), so the main
// activity gets android:screenOrientation="portrait". Google Play reads that as
// a requirement for android.hardware.screen.portrait and refused to send
// version 4.4.7 for review: the app could not be installed on tablets,
// Chromebooks and Android XR devices. Declaring the feature as optional keeps
// the portrait lock and lets those devices install the app.

const FEATURE = "android.hardware.screen.portrait";

module.exports = function withOptionalPortrait(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const features = manifest["uses-feature"] ?? [];
    const existing = features.find((f) => f.$?.["android:name"] === FEATURE);
    if (existing) {
      existing.$["android:required"] = "false";
    } else {
      features.push({ $: { "android:name": FEATURE, "android:required": "false" } });
    }
    manifest["uses-feature"] = features;
    return mod;
  });
};
