const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withAdiRegistration(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const targetPath = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "assets"
      );

      // Ensure the assets directory exists
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }

      const sourcePath = path.join(
        config.modRequest.projectRoot,
        "adi-registration.properties"
      );
      
      const destinationPath = path.join(targetPath, "adi-registration.properties");

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destinationPath);
        console.log(`Copied adi-registration.properties to ${destinationPath}`);
      } else {
        console.warn(`Could not find ${sourcePath}`);
      }

      return config;
    },
  ]);
};
