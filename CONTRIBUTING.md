# Contributing to Plan AI

Thanks for helping improve Plan AI! This guide covers the basics for proposing changes, running the toolchain, and keeping the project consistent.

## Before you start

1. **Review the README** – it explains architecture, environment setup, and deployment flow.
2. **Open an issue first** for large feature ideas or breaking changes so we can align early.
3. **Stay within scope** – Plan AI focuses on transcript-driven planning with a TypeScript-first stack. If in doubt, ask!

## Tooling overview

- **Monorepo** with `backend/` (Express + TSOA + Prisma) and `frontend/` (React + RTK Query + MUI).
- **Package manager:** Yarn 1.x. Use the provided scripts; avoid `npm`.
- **Formatting:** Prettier via `yarn format` (runs in both workspaces).
- **Linting:** `yarn lint` runs backend ESLint and frontend ESLint rules (SOLID, no `any`, etc.).
- **Testing / Coverage:**
  - Backend: `yarn --cwd backend test` or `yarn --cwd backend coverage` (Vitest with coverage thresholds).
  - Frontend: `yarn --cwd frontend test` (Jest + React Testing Library).
- **Code generation:** `yarn update` regenerates TSOA routes, Prisma clients, and frontend API typings.

## Environment setup

```bash
yarn install:all
yarn docker       # boots Postgres + Qdrant locally
cp backend/.env.template backend/.env
cp frontend/.env.template frontend/.env
```

Fill in Firebase, OpenAI, Jira, and Microsoft Clarity IDs as needed. The frontend reads `REACT_APP_*` env vars; the backend uses the `.env` file directly.

## Localization guidelines

All user-facing strings must go through `react-i18next` with entries in both `frontend/src/i18n/locales/en.json` and `frontend/src/i18n/locales/es.json`. When adding new UI copy:

1. Add keys to both locale files.
2. Destructure `const { t } = useTranslation()` in the component.
3. Replace literals with `t("namespace.key")`.

## Pull request checklist

- [ ] `yarn format`
- [ ] `yarn lint`
- [ ] Relevant tests added/updated (`yarn --cwd backend/ frontend/ test` as appropriate)
- [ ] `yarn update` if you changed swagger/Prisma schemas
- [ ] No secrets committed (`.env` files stay local)
- [ ] Screenshots or GIFs for notable UI changes
- [ ] English + Spanish strings present for new UI text

## Branching & merging

- Fork and branch from `main` (protected). Use descriptive branch names, e.g. `feature/i18n-signup`.
- Submit PRs against `main`. At least one reviewer approval + passing status checks are required.
- Squash or rebase before merging to keep history linear.

## Reporting issues

Use GitHub Issues with:

- Description and steps to reproduce
- Expected vs. actual behavior
- Logs, screenshots, or stack traces

Security vulnerabilities or data-sensitive concerns should be reported privately to `projects@blueberrybytes.com`.

## Code of conduct

Be respectful, constructive, and inclusive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/) spirit even if not yet formalized. Harassment or discriminatory behavior will not be tolerated.

Thanks again for contributing! If you have questions, open an issue or email `projects@blueberrybytes.com`.
