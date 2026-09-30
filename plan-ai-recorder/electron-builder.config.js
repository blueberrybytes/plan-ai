/**
 * Dynamic electron-builder configuration file.
 * We resolve BRAND_KEY from the environment to dynamically switch Build IDs, Icons, and Protocols.
 */

// Bypass electron-builder's Mac App Store installer detection bug by explicitly providing the SHA-1 hash
process.env.CSC_INSTALLER_NAME = "E2924F8F6A8AE10A6C53556380E189C362799B84";

const brandKey = process.env.BRAND_KEY || "blueberrybytes";
const isHouseGroup = brandKey === "housegroup";

console.log(`[electron-builder] Building for BRAND_KEY: ${brandKey}`);

const appId = isHouseGroup
  ? "media.housegroup.plan-ai-recorder"
  : "com.blueberrybytes.plan-ai-recorder";

const productName = isHouseGroup ? "House Group Plan AI" : "Plan AI Recorder";
const protocolScheme = isHouseGroup
  ? "housegroup-recorder"
  : "blueberrybytes-recorder";

const iconPath = `resources/${brandKey}`; // We expect icon.icns, icon.ico, icon.png in these subfolders

// ─── Windows code signing ────────────────────────────────────────────────────
// With a certificate, the app and installer are signed, and electron-updater
// installs an update only if it is signed by the same publisher (publisherName
// is written into app-update.yml). Without one the build stays unsigned and
// updates are not checked, as before. Two ways to provide it:
//  - A .pfx file: WIN_CSC_LINK (path, https URL or base64) and
//    WIN_CSC_KEY_PASSWORD. Leave WIN_PUBLISHER_NAME empty: it is read from
//    the certificate.
//  - Azure Trusted Signing (the build must run on Windows): AZURE_TENANT_ID,
//    AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, plus AZURE_SIGN_ENDPOINT,
//    AZURE_SIGN_ACCOUNT and AZURE_SIGN_PROFILE.
// With Azure, WIN_PUBLISHER_NAME is required and must match the certificate's
// subject CN exactly.
// With a .pfx, electron-builder reads the publisher from the certificate, which
// is the safest source: a name that does not match makes every later update
// fail its signature check. Azure Trusted Signing needs it set explicitly.
const winPublisherName = process.env.WIN_PUBLISHER_NAME;
const winAzureSigning =
  winPublisherName &&
  process.env.AZURE_SIGN_ENDPOINT &&
  process.env.AZURE_SIGN_ACCOUNT &&
  process.env.AZURE_SIGN_PROFILE
    ? {
        azureSignOptions: {
          publisherName: winPublisherName,
          endpoint: process.env.AZURE_SIGN_ENDPOINT,
          codeSigningAccountName: process.env.AZURE_SIGN_ACCOUNT,
          certificateProfileName: process.env.AZURE_SIGN_PROFILE,
        },
      }
    : null;
// Only WIN_CSC_LINK: CSC_LINK is the Apple certificate on this machine.
const winCertificateSigning = process.env.WIN_CSC_LINK
  ? { signtoolOptions: winPublisherName ? { publisherName: winPublisherName } : {} }
  : null;
const winSigning = winAzureSigning || winCertificateSigning || {};
if (process.argv.includes("--win") && !winAzureSigning && !winCertificateSigning) {
  console.warn(
    "[electron-builder] WARNING: no Windows signing certificate. The Windows build is UNSIGNED and its updates are not verified.",
  );
}

module.exports = {
  appId: appId,
  productName: productName,
  publish: [
    {
      provider: "github",
      owner: "blueberrybytes",
      repo: "plan-ai-recorder-releases",
      releaseType: "draft",
      channel: isHouseGroup ? "housegroup" : "latest",
    },
  ],
  buildVersion: "178",
  protocols: [
    {
      name: productName,
      schemes: [protocolScheme],
    },
  ],
  afterSign: "scripts/notarize.js",
  directories: {
    output: "release",
  },
  files: [
    "dist-electron/**/*",
    "!**/node_modules/@sentry/cli*/**",
    "!**/node_modules/@sentry/cli/**/*",
  ],
  // Electron fuses, flipped in the binary before signing. They switch off the
  // ways to run arbitrary code through the signed app: ELECTRON_RUN_AS_NODE,
  // NODE_OPTIONS, --inspect, and app code outside a verified app.asar.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    enableCookieEncryption: true,
    // Unsigned arm64 test builds need a fresh ad hoc signature after the flip.
    resetAdHocDarwinSignature: true,
  },
  mac: {
    // Notarization runs in scripts/notarize.js (afterSign), which fails the
    // build when the Apple credentials are missing unless SKIP_NOTARIZE=1.
    notarize: false,
    icon: `${iconPath}/icon.icns`,
    category: "public.app-category.productivity",
    // Electron 43 is the last line that runs on macOS 12 (Monterey). Moving to
    // 44 drops it, and the auto-updater would install a build that does not start.
    minimumSystemVersion: "12.0.0",
    target: ["dmg", "zip", "mas"],
    binaries: ["macos/AudioCapture", "macos/MicActivity"],
    extraFiles: [
      {
        from: "macos/AudioCapture",
        to: "Resources/bin/AudioCapture",
      },
      {
        from: "macos/MicActivity",
        to: "Resources/bin/MicActivity",
      },
    ],
    hardenedRuntime: true,
    entitlements: "macos/entitlements.plist",
    entitlementsInherit: "macos/entitlements.plist",
    extendInfo: {
      NSMicrophoneUsageDescription: `${productName} securely captures your microphone input and transmits it to our AI servers to transcribe your voice during meetings.`,
      NSScreenCaptureUsageDescription: `${productName} securely captures your system audio output and transmits it to our AI servers to transcribe video meetings. No visual UI screen content is recorded.`,
      // Required by Electron 39+ for system audio capture on macOS 14.2+.
      NSAudioCaptureUsageDescription: `${productName} captures your system audio output to transcribe video meetings.`,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  win: {
    icon: `${iconPath}/icon.ico`,
    ...winSigning,
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
  },
  mas: {
    entitlements: "macos/entitlements.mas.plist",
    entitlementsInherit: "macos/entitlements.mas.inherit.plist",
    provisioningProfile: "build/mas.provisionprofile",
    identity: "BLUEBERRYBYTES SERVICES FZCO (8NN84K7QKJ)",
    hardenedRuntime: false,
    binaries: ["macos/AudioCapture", "macos/MicActivity"],
  },
  linux: {
    icon: `${iconPath}/icon.png`,
    target: ["AppImage", "deb"],
    category: "Office",
  },
};
