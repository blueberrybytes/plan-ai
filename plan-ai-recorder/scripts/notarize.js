const { notarize } = require('@electron/notarize');
const fs = require('fs');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;  
  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Determine the app name (either House Group Plan AI or Plan AI Recorder)
  let appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  
  if (!fs.existsSync(appPath)) {
    console.log(`[Notarize] Cannot find application at: ${appPath}`);
    return;
  }

  // We need APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID 
  // to be set in the environment variables
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID || '8NN84K7QKJ';

  if (!appleId || !appleIdPassword) {
    console.warn('[Notarize] Skipping macOS notarization. APPLE_ID or APPLE_APP_SPECIFIC_PASSWORD not set in environment.');
    return;
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
    // Throwing an error stops the build, which is what we want if notarization fails
    // for a production release, but for development we might want to let it pass
    throw error;
  }
};
