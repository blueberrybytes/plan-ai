const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withRnfbFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      
      if (!fs.existsSync(file)) {
        return config;
      }
      
      let contents = fs.readFileSync(file, 'utf-8');

      const fixCode = `
    # Fix for non-modular header errors in Firebase React Native
    if ['RNFBApp', 'RNFBAuth', 'RNFBAnalytics', 'RNFBCrashlytics'].include?(target.name)
      target.build_configurations.each do |config|
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        config.build_settings['DEFINES_MODULE'] = 'NO'
      end
    end
`;

      // Inject the fix before the end of the post_install block
      if (!contents.includes('CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES')) {
        contents = contents.replace(
          /post_install do \|installer\|/i,
          `post_install do |installer|\n  installer.pods_project.targets.each do |target|${fixCode}  end`
        );
        fs.writeFileSync(file, contents);
      }
      
      return config;
    },
  ]);
};
