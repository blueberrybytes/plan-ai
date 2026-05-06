const fs = require("fs");
const path = require("path");

const packageJsonPath = path.join(__dirname, "..", "package.json");

try {
  const packageJsonData = fs.readFileSync(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonData);

  if (packageJson.build) {
    let currentVersion = parseInt(packageJson.build.buildVersion || "1", 10);
    if (isNaN(currentVersion)) currentVersion = 1;

    const nextVersion = currentVersion + 1;
    packageJson.build.buildVersion = nextVersion.toString();

    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2) + "\n",
      "utf8",
    );
    console.log(
      `\n\x1b[32m \u2714 Incremented generic buildVersion to: ${nextVersion}\x1b[0m\n`,
    );
  } else {
    console.warn(
      "\x1b[33mWarning: build config not found in package.json\x1b[0m",
    );
  }
} catch (error) {
  console.error("\x1b[31mError bumping build version:\x1b[0m", error);
  process.exit(1);
}
