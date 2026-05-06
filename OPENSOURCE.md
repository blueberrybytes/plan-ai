# Open Sourcing Plan AI: Deep Investigation & Recommendations

Based on a deep investigation of the `plan` monorepo (which contains `plan-ai`, `plan-ai-mobile`, and `plan-ai-recorder`), here is a comprehensive analysis on whether open-sourcing is a good idea and what steps must be taken if you choose to proceed.

## 1. Strategic Business Considerations

**Is it a good idea?** It depends on your business model. Plan AI is currently structured as a proprietary SaaS platform ("AI-assisted meeting planning & execution platform by Blueberrybytes") with defined roles (Admin, Premium, Client) and monetization structures.

**Pros of Open Sourcing:**
* **Trust & Security:** For an app that records and analyzes sensitive meetings, open-sourcing the code (especially the mobile and desktop recorders) builds immense trust. Users can verify that audio isn't being secretly stored or misused.
* **Community Contributions:** Developers might build integrations for other platforms (e.g., Linear, Asana, Jira) that you don't have time to build.
* **Marketing:** A popular open-source project can drive traffic to your paid, hosted cloud version (the Open-Core model).

**Cons & Risks:**
* **Cloning:** Since the core value proposition relies heavily on AI wrapper logic and specific prompts (as detailed in `IMPROVEMENTS.md`), competitors could easily fork the code and launch a competing service.
* **Support Burden:** Maintaining an open-source project requires managing GitHub issues, PRs, and community expectations.

## 2. Licensing Solution: Business Source License (BSL)

You mentioned: *"the license must be that u can use it in ur business but u cannot resell this"*.

This perfectly describes the **Business Source License (BSL 1.1)**. This license is used by companies like Sentry and Couchbase who faced the exact same problem.

**How the BSL works for Plan AI:**
* **Free Internal Use:** Any company can download Plan AI and run it internally for their own team's meetings.
* **No Reselling (No SaaS Cloning):** They **CANNOT** host Plan AI and charge other people money for it. They cannot create a competing SaaS product using your code.
* **Time-Delayed Open Source:** The BSL typically includes a "Change Date" (e.g., 4 years from release). On that date, the code automatically converts to a fully open-source license (like MIT). This builds goodwill with the developer community while protecting your immediate commercial interests.

**Action Taken & Required:**
* I have created a `LICENSE` file in the root directory with the BSL 1.1 terms.
* I have updated your `package.json` files to use the `BUSL-1.1` license.

## 3. Codebase Readiness & Security Audit

Before making the repository public, several technical issues must be addressed:

### A. Secrets and Configurations
* **Good News:** The `plan-ai/backend/.gitignore` properly ignores `.env` and Google service account keys (`beapolo-dev-*.json`). My search did not reveal any obviously hardcoded API keys in the source files.
* **Action Required:** Ensure that `.env.template` files are fully scrubbed of any real development keys and have clear instructions for self-hosters.

### B. Mobile App Hardcoded Identifiers
In `plan-ai-mobile/app.config.ts`, there are several hardcoded identifiers linked to your specific infrastructure:
* Sentry Project: `organization: "blueberrybytes-services-fzco"`
* EAS Project ID: `1e48d947-aacd-4008-9f3e-80b260fd06b5`
* Bundle Identifier: `com.blueberrybytes.planai`

**Action Required:** These should be abstracted into environment variables (e.g., `process.env.EXPO_PUBLIC_EAS_PROJECT_ID`) so open-source users don't accidentally send crash reports or build requests to your infrastructure.

### C. Firebase Configuration Files
The mobile app relies on `GoogleService-Info.plist` and `google-services.json` (as seen in `app.config.ts`).
**Action Required:** Ensure these files are strictly added to `.gitignore`. While Firebase keys are meant to be embedded in apps, putting the raw configuration files in a public repo makes it too easy for scrapers to attempt quota-draining attacks. You should provide placeholder versions instead.

### D. Proprietary AI Prompts
Your `IMPROVEMENTS.md` mentions sophisticated "AI Task Coach" prompts and Persona-based system prompts.
**Action Required:** Decide if these prompts are your "secret sauce." If they are, you might want to keep the core prompt generation logic in a private repository or module, while open-sourcing the rest of the application (Open-Core model).

## 4. Final Verdict

Open-sourcing Plan AI is a **high-risk, high-reward** strategy. 

It is a **good idea IF** you want to use it as a lead-generation tool for a paid Cloud-Hosted version, and you want to build trust around data privacy (which is critical for an AI meeting recorder).
It is a **bad idea IF** your primary competitive advantage is simply the UI and basic AI integrations, as competitors can clone it instantly under the current MIT license.

**If you proceed, do these three things first:**
1. Change the license from MIT to AGPLv3 or BSL.
2. Abstract all Blueberrybytes-specific project IDs (EAS, Sentry) into `.env` files in the mobile app.
3. Verify that Firebase `.plist` and `.json` files are strictly ignored across all 3 repositories.
