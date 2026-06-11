const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "..", "electron-builder.config.js");

try {
  let configData = fs.readFileSync(configPath, "utf8");
  
  const buildVersionMatch = configData.match(/buildVersion:\s*"(\d+)"/);
  
  if (buildVersionMatch) {
    let currentVersion = parseInt(buildVersionMatch[1], 10);
    if (isNaN(currentVersion)) currentVersion = 1;

    const nextVersion = currentVersion + 1;
    configData = configData.replace(
      /buildVersion:\s*"\d+"/,
      `buildVersion: "${nextVersion}"`
    );

    fs.writeFileSync(configPath, configData, "utf8");
    console.log(
      `\n\x1b[32m \u2714 Incremented buildVersion in electron-builder.config.js to: ${nextVersion}\x1b[0m\n`
    );
  } else {
    console.warn(
      "\x1b[33mWarning: buildVersion not found in electron-builder.config.js\x1b[0m"
    );
  }
} catch (error) {
  console.error("\x1b[31mError bumping build version:\x1b[0m", error);
  process.exit(1);
}
