---

# Plan AI Release Checklist

Follow this checklist every time you cut a new release/tag. Adjust commands if you use a CI pipeline.

## 1. Prep work

- [ ] Ensure `main` is green (CI passing) and includes all desired commits.
- [ ] Update dependencies / run `yarn update` to refresh generated clients.
- [ ] Verify `CHANGELOG.md` has entries for the new version (features, fixes, breaking changes).
- [ ] Confirm docs (README, deployment steps) match the new behavior.

## 2. Version bump & changelog

- [ ] Update version numbers where needed (e.g., `package.json`, Docker images if tagged).
- [ ] Finalize the changelog entry and include highlights + contributor credits.

## 3. Tagging

- [ ] Create a signed tag: `git tag -s vX.Y.Z -m "Plan AI vX.Y.Z"` (omit `-s` if you don’t sign tags).
- [ ] Push the tag: `git push origin vX.Y.Z`.

## 4. GitHub Release

- [ ] Draft a release on GitHub using the tag.
- [ ] Copy the changelog section into the release notes.
- [ ] Attach screenshots/GIFs that showcase marquee changes.
- [ ] Highlight Blueberrybytes services + roadmap links for marketing.

## 5. Repository metadata

- [ ] Update repository topics (e.g., `plan-ai`, `ai`, `meeting-notes`, `openai`, `firebase`, `typescript`, `blueberrybytes`).
- [ ] Pin the release or issue if needed.

## 6. Post-release

- [ ] Share the announcement on your blog/Discord/LinkedIn.
- [ ] Create or update `good first issue` tickets for community members.
- [ ] Monitor issues/Discussions for regressions or install friction.
- [ ] Schedule follow-up patch releases if needed.

> Tip: For hotfixes, cherry-pick the fix onto `main`, rerun this checklist, and cut `vX.Y.Z+1`.
