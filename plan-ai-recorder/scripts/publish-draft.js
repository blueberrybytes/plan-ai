const fs = require('fs');
const path = require('path');

async function main() {
  const envPath = path.join(__dirname, '..', '.env.production');
  let ghToken = process.env.GH_TOKEN;

  // Fallback to manually parse .env.production if it wasn't sourced
  if (!ghToken && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^GH_TOKEN=["']?(.*?)["']?$/m);
    if (match) ghToken = match[1];
  }

  if (!ghToken) {
    console.error("❌ GH_TOKEN not found in environment or .env.production file.");
    process.exit(1);
  }

  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = "v" + packageJson.version;
  
  const publishConfig = packageJson.build.publish[0];
  const owner = publishConfig.owner;
  const repo = publishConfig.repo;

  console.log(`🔍 Looking for draft release ${version} in ${owner}/${repo}...`);

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'Authorization': `Bearer ${ghToken}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API error: ${res.statusText} - ${await res.text()}`);

    const releases = await res.json();
    const targetRelease = releases.find(r => r.draft && r.tag_name === version);

    if (!targetRelease) {
      console.error(`❌ Could not find a draft release for version ${version}.`);
      console.log("Recent releases found:");
      releases.slice(0, 3).forEach(r => console.log(` - ${r.tag_name} (draft: ${r.draft})`));
      process.exit(1);
    }

    console.log(`✅ Found draft release id ${targetRelease.id}. Publishing...`);

    const updateRes = await fetch(`${url}/${targetRelease.id}`, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ draft: false })
    });

    if (!updateRes.ok) {
      throw new Error(`Failed to update release: ${updateRes.statusText} - ${await updateRes.text()}`);
    }

    const data = await updateRes.json();
    console.log(`🚀 Successfully published release ${version}!`);
    console.log(`🔗 URL: ${data.html_url}`);

  } catch (err) {
    console.error("\n❌ Error publishing release:");
    console.error(err.message);
    process.exit(1);
  }
}

main();
