// Creates the draft GitHub release of this version before electron-builder
// publishes to it. electron-builder 26 uploads a build's files in parallel;
// when the draft does not exist yet, two uploads each create one, and the
// files of one version end up split between two drafts.
//
// Run after the release env is loaded (it needs GH_TOKEN). Safe to run many
// times: it does nothing when the release already exists.

const { version } = require("../package.json");
const config = require("../electron-builder.config.js");

const target = (config.publish || []).find((p) => p.provider === "github");
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const tag = `v${version}`;

async function github(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${target.owner}/${target.repo}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${init.method || "GET"} ${path}`);
  return res.json();
}

async function main() {
  if (!target) throw new Error("No github publish target in electron-builder.config.js");
  if (!token) throw new Error("GH_TOKEN is not set: load the release env first");

  // Drafts have no tag yet on GitHub, so they are found in the list, not by tag.
  for (let page = 1; page <= 5; page++) {
    const releases = await github(`/releases?per_page=100&page=${page}`);
    const existing = releases.find((r) => r.tag_name === tag);
    if (existing) {
      console.log(`[release] ${tag} already exists (${existing.draft ? "draft" : "published"})`);
      if (!existing.draft) {
        throw new Error(`${tag} is already published: bump the version before releasing`);
      }
      return;
    }
    if (releases.length < 100) break;
  }

  await github("/releases", {
    method: "POST",
    body: JSON.stringify({ tag_name: tag, name: version, draft: true }),
  });
  console.log(`[release] created draft ${tag}`);
}

main().catch((err) => {
  console.error(`[release] ${err.message}`);
  process.exit(1);
});
