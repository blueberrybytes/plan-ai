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

const SIGN_IDENTITY = "8NN84K7QKJ";
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
