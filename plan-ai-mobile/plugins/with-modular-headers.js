const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(file)) return config;
      
      let contents = fs.readFileSync(file, 'utf-8');
      
      const specificHeaders = `
pod 'GoogleDataTransport', :modular_headers => true
pod 'GoogleUtilities', :modular_headers => true
pod 'nanopb', :modular_headers => true
pod 'FirebaseAuthInterop', :modular_headers => true
pod 'FirebaseAppCheckInterop', :modular_headers => true
pod 'RecaptchaInterop', :modular_headers => true
pod 'FirebaseCoreExtension', :modular_headers => true
pod 'FirebaseSessions', :modular_headers => true
`;
      
      // Inject specific pod requirements before use_react_native!
      if (!contents.includes("pod 'GoogleDataTransport'")) {
        contents = contents.replace(
          /(use_react_native!)/g,
          `${specificHeaders}\n$1`
        );
        // Clean up the global use_modular_headers! if it was left from previous
        contents = contents.replace(/use_modular_headers!\n/g, '');
        fs.writeFileSync(file, contents);
      }
      
      return config;
    },
  ]);
};
