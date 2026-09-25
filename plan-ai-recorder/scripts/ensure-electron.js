/**
 * ensure-electron.js — Makes the Electron binary from npm runnable on macOS
 * for `yarn dev`. Runs before every dev start (see "predev").
 *
 * Why: macOS has the stock Electron 31.7.7 darwin-arm64 build on its
 * revocation list (`spctl -a -vv` on it says "notarization indicates this
 * code has been revoked"). macOS kills it on launch and then removes
 * Electron.app from node_modules, so every `yarn dev` after the first failed
 * with "spawn .../Electron.app/Contents/MacOS/Electron ENOENT".
 *
 * Fix: extract the app again when it's missing, and re-sign it ad hoc on this
 * machine. That gives it a new code hash, which isn't the revoked one, and
 * ad-hoc signed apps run locally. Development only: electron-builder signs
 * the packaged app with the Developer ID certificate and notarizes it, so
 * what users download is unaffected.
 */

const { execFileSync, spawnSync } = require("child_process");
const { existsSync, mkdirSync, writeFileSync } = require("fs");
const os = require("os");
const path = require("path");

if (process.platform !== "darwin") process.exit(0);

const electronDir = path.resolve(__dirname, "../node_modules/electron");
const app = path.join(electronDir, "dist", "Electron.app");
const log = (msg) => console.log(`[ensure-electron] ${msg}`);

const version = require(path.join(electronDir, "package.json")).version;
const cacheDir =
  process.env.electron_config_cache || path.join(os.homedir(), "Library", "Caches", "electron");
const zip = path.join(cacheDir, `electron-v${version}-darwin-${process.arch}.zip`);

if (!existsSync(app)) {
  if (!existsSync(zip)) {
    log(`Electron ${version} not downloaded yet, fetching it`);
    spawnSync(process.execPath, [path.join(electronDir, "install.js")], { stdio: "inherit" });
  }
  if (!existsSync(app) && existsSync(zip)) {
    // ditto keeps the symlinks inside the app's frameworks intact.
    log(`Extracting Electron ${version} from the download cache`);
    mkdirSync(path.join(electronDir, "dist"), { recursive: true });
    execFileSync("ditto", ["-x", "-k", zip, path.join(electronDir, "dist")]);
  }
  if (!existsSync(app)) {
    console.error(
      `[ensure-electron] Electron.app is still missing. Delete ${zip} and run \`yarn\` again.`,
    );
    process.exit(1);
  }
}

// A marker next to the app, not the signature type: the stock build carries
// no team signature either, so "is it ad hoc?" can't tell the two apart. The
// marker goes away with the app whenever it's extracted again.
const marker = path.join(electronDir, "dist", ".resigned-adhoc");
if (!existsSync(marker)) {
  log("Re-signing Electron.app ad hoc so macOS lets it run");
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "ignore" });
  writeFileSync(marker, `${version}\n`);
}
