/**
 * prebuild-native.js — Compiles the macOS Swift binaries on darwin only.
 * This script is called by the "prebuild" npm script so that the Windows
 * build (run in a Windows CI environment or via electron-builder --win) can
 * proceed without a Swift toolchain.
 */

const { execSync } = require("child_process");
const { existsSync, mkdirSync } = require("fs");
const path = require("path");

if (process.platform !== "darwin") {
  console.log(
    "[prebuild-native] Skipping Swift compilation on non-macOS platform:",
    process.platform,
  );
  process.exit(0);
}

// The full certificate name, not just the team ID: "8NN84K7QKJ" matches every
// certificate of the team (iPhone Distribution, Mac App Store, Developer ID),
// and codesign refuses as soon as two of them share a name, which happens
// when a certificate is renewed and the old one stays in the keychain.
// Developer ID is what the direct-download build is signed with.
// MACOS_SIGN_IDENTITY overrides it (a SHA-1 from `security find-identity`
// works too, and "-" signs ad hoc on a machine without the team's certs).
const SIGN_IDENTITY =
  process.env.MACOS_SIGN_IDENTITY ||
  "Developer ID Application: BLUEBERRYBYTES SERVICES FZCO (8NN84K7QKJ)";
const MACOS_DIR = path.resolve(__dirname, "../macos");
const ENTITLEMENTS = path.join(MACOS_DIR, "entitlements.plist");

if (!existsSync(MACOS_DIR)) {
  mkdirSync(MACOS_DIR, { recursive: true });
}

function run(cmd) {
  console.log(`[prebuild-native] ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

run(
  `swiftc -O ${path.join(MACOS_DIR, "AudioCapture.swift")} -o ${path.join(MACOS_DIR, "AudioCapture")}`,
);
run(
  `codesign --force --sign "${SIGN_IDENTITY}" --entitlements ${ENTITLEMENTS} ${path.join(MACOS_DIR, "AudioCapture")}`,
);

run(
  `swiftc -O ${path.join(MACOS_DIR, "MicActivity.swift")} -o ${path.join(MACOS_DIR, "MicActivity")}`,
);
run(
  `codesign --force --sign "${SIGN_IDENTITY}" --entitlements ${ENTITLEMENTS} ${path.join(MACOS_DIR, "MicActivity")}`,
);

console.log(
  "[prebuild-native] macOS binaries compiled and signed successfully.",
);
