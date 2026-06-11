const fs = require("fs");
const path = require("path");

const newVersion = process.argv[2];

if (!newVersion) {
  console.error(
    "Please provide a version number. Example: yarn set:version 2.0.1",
  );
  process.exit(1);
}

const packagePaths = [
  "./package.json",
  "./plan-ai/backend/package.json",
  "./plan-ai/frontend/package.json",
  "./plan-ai-mobile/package.json",
  "./plan-ai-recorder/package.json",
  "./plan-ai-mobile/app.config.ts",
];

let successCount = 0;

packagePaths.forEach((relPath) => {
  const fullPath = path.resolve(__dirname, "..", relPath);

  if (fs.existsSync(fullPath)) {
    try {
      if (relPath.endsWith("package.json")) {
        const fileData = fs.readFileSync(fullPath, "utf8");
        const packageObj = JSON.parse(fileData);

        const oldVersion = packageObj.version;
        packageObj.version = newVersion;

        fs.writeFileSync(
          fullPath,
          JSON.stringify(packageObj, null, 2) + "\n",
          "utf8",
        );
        console.log(`✅ Updated ${relPath} from ${oldVersion} -> ${newVersion}`);
      } else if (relPath.endsWith("app.config.ts")) {
        let fileData = fs.readFileSync(fullPath, "utf8");
        const updatedData = fileData.replace(
          /(const appVersion\s*=\s*")([^"]+)(")/,
          `$1${newVersion}$3`,
        );
        fs.writeFileSync(fullPath, updatedData, "utf8");
        console.log(`✅ Updated ${relPath} to ${newVersion}`);
      }
      successCount++;
    } catch (err) {
      console.error(`❌ Error updating ${relPath}:`, err.message);
    }
  } else {
    console.warn(`⚠️ Could not find ${relPath}`);
  }
});

console.log(
  `\n🎉 Successfully updated ${successCount} packages to version ${newVersion}`,
);
