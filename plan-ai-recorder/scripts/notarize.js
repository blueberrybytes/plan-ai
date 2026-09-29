const { notarize } = require('@electron/notarize');
const fs = require('fs');
const path = require('path');

/**
 * afterSign hook: notarizes the macOS (Developer ID) build.
 *
 * A build that is not notarized is blocked by Gatekeeper on users' machines,
 * so a missing credential is an error, not a warning. For a local build that
 * will never be shipped, set SKIP_NOTARIZE=1.
 *
 * Needs APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID (defaults to
 * the BLUEBERRYBYTES team).
 */
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Mac App Store builds ("mas") are checked by Apple on upload instead.
  if (electronPlatformName !== 'darwin') {
    return;
  }

  if (process.env.SKIP_NOTARIZE === '1') {
    console.warn('[Notarize] SKIP_NOTARIZE=1: this build is NOT notarized. Do not ship it.');
    return;
  }

  // Determine the app name (either House Group Plan AI or Plan AI Recorder)
  let appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  if (!fs.existsSync(appPath)) {
    throw new Error(`[Notarize] Cannot find the application at ${appPath}`);
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID || '8NN84K7QKJ';

  if (!appleId || !appleIdPassword) {
    throw new Error(
      '[Notarize] APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD are required to notarize the macOS build. ' +
        'Set them (e.g. in .env.production), or set SKIP_NOTARIZE=1 for a local build that will not be shipped.',
    );
  }

  console.log(`[Notarize] Notarizing ${appPath} with Apple ID ${appleId}...`);

  try {
    await notarize({
      appPath,
      appleId,
      appleIdPassword,
      teamId,
    });
    console.log('[Notarize] Notarization successful!');
  } catch (error) {
    console.error('[Notarize] Error during notarization:');
    console.error(error);
    // Throwing stops the build: an un-notarized app must not be published.
    throw error;
  }
};
