const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

// The notifee 9 AAR declares app.notifee.core.ForegroundService with
// foregroundServiceType="shortService". Android stops a shortService after
// about 3 minutes, and with targetSdk 34 or higher a service that records the
// microphone in the background must declare the "microphone" type. This plugin
// overrides the type in the app manifest, and tools:replace makes the manifest
// merger keep our value over the one in the AAR.

const TOOLS_NAMESPACE = "http://schemas.android.com/tools";
const SERVICE_NAME = "app.notifee.core.ForegroundService";
const SERVICE_TYPE = "microphone";
const REQUIRED_PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.POST_NOTIFICATIONS",
];

function addToolsReplace(currentValue, attribute) {
  const attributes = (currentValue || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!attributes.includes(attribute)) {
    attributes.push(attribute);
  }
  return attributes.join(",");
}

function setMicrophoneService(androidManifest) {
  const manifest = androidManifest.manifest;
  manifest.$ = manifest.$ || {};
  if (!manifest.$["xmlns:tools"]) {
    manifest.$["xmlns:tools"] = TOOLS_NAMESPACE;
  }

  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  application.service = application.service || [];

  let service = application.service.find(
    (entry) => entry.$ && entry.$["android:name"] === SERVICE_NAME,
  );
  if (!service) {
    service = { $: { "android:name": SERVICE_NAME } };
    application.service.push(service);
  }

  service.$["android:foregroundServiceType"] = SERVICE_TYPE;
  service.$["tools:replace"] = addToolsReplace(
    service.$["tools:replace"],
    "android:foregroundServiceType",
  );

  AndroidConfig.Permissions.ensurePermissions(androidManifest, REQUIRED_PERMISSIONS);
  return androidManifest;
}

function withNotifeeMicrophoneService(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults = setMicrophoneService(config.modResults);
    return config;
  });
}

module.exports = withNotifeeMicrophoneService;
module.exports.setMicrophoneService = setMicrophoneService;
