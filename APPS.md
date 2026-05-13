# Integration Architecture & App Creation Guide

## Integration Scope Model

Plan AI uses a **hybrid integration model** where different providers are managed at different scopes:

### Workspace-Level Integrations (Shared)
- **Jira**, **Linear**, **Trello**
- Connected once by an **Owner** or **Admin** of the workspace
- Shared across all workspace members — everyone can push tasks
- Stored in the `WorkspaceIntegration` table (`@@unique([workspaceId, provider])`)
- Only Admins/Owners can connect, disconnect, or change default project/team/board settings
- Regular members can **view** integration status and **use** the integration (push tasks) but **cannot configure** it

### User-Level Integrations (Personal)
- **GitHub**, **Google Drive**
- Each user connects their own account
- Stored in the `UserIntegration` table (`@@unique([userId, provider])`)
- Every user manages their own connection independently

### RBAC Enforcement
- Backend: `BaseWorkspaceController.requireAdminOrOwner()` enforces role checks on connect/disconnect/edit endpoints for workspace-level providers
- Frontend: `Integrations.tsx` uses a `canEdit` flag derived from the user's workspace role to conditionally show/hide connect forms, disconnect buttons, and configuration dropdowns
- Non-admin members see a "Read-only" badge and an info alert explaining they need an admin to manage workspace integrations

---

## Jira & Trello OAuth 2.0 Migration Plan

This plan outlines the steps to migrate our Jira and Trello integrations from the manual "Bring Your Token" model to a seamless, one-click OAuth 2.0 flow (similar to how we just implemented Linear).

### 1. App Verification Requirements
**Do you need to go through a strict app verification/review?**

**Short Answer:** No, as long as you aren't trying to list Plan AI in their official App Stores.

**Long Answer:**
- **Jira (Atlassian):** You can create an Atlassian 3LO (OAuth 2.0) app in their developer console. You can distribute the authorization URL to your users immediately. They will see a consent screen ("Plan AI wants to access your Jira"). You only need to pass their strict security review if you want your app to be listed inside the public "Atlassian Marketplace".
- **Trello:** Trello is owned by Atlassian and now uses the exact same Atlassian developer console for modern OAuth 2.0. Similarly, you only need verification if you want to be listed in the public Trello "Power-Up Directory".

### 2. Phase 1: Jira OAuth 2.0 Migration
Jira's OAuth 2.0 implementation is called "3LO" (3-Legged OAuth).

#### A. Infrastructure Setup
1. Go to Atlassian Developer Console.
2. Create an OAuth 2.0 (3LO) Integration.
3. Set the Callback URL to `https://<your-domain>/api/jira/callback`.
4. Add the Jira API and configure granular scopes (`read:jira-work`, `write:jira-work`, `read:jira-user`, `offline_access`).
5. Copy the `JIRA_CLIENT_ID` and `JIRA_CLIENT_SECRET` to the `.env` file.

#### B. Backend Implementation
- **Auth URL Endpoint:** `GET /api/jira/auth` generates an Atlassian authorization URL containing the `JIRA_CLIENT_ID`, scopes, and a secure `state` parameter (encodes `workspaceId`).
- **Callback Endpoint:** `GET /api/jira/callback` receives the `code`, validates the `workspaceId` from state, and exchanges it for an `accessToken` and `refreshToken`.
- **Database Update:** Save the tokens in the `WorkspaceIntegration` table with `authType: "OAUTH"`.
- **Cloud ID Resolution:** After getting the token, call `https://api.atlassian.com/oauth/token/accessible-resources` to get the `cloudId` and save it to the integration metadata.

#### C. Service Refactoring
- All methods in `JiraIntegrationService` accept `workspaceId` instead of `userId`.
- The base URL for Jira API calls changes from `https://{domain}.atlassian.net` to `https://api.atlassian.com/ex/jira/{cloudId}`.

### 3. Phase 2: Trello OAuth 2.0 Migration
Trello's legacy API (which we currently use) relies on an API Key + Token. Trello now supports OAuth 2.0 via the Atlassian developer console.

#### A. Infrastructure Setup
1. In the same Atlassian Developer Console, enable the Trello API for your app.
2. Configure Trello scopes (`read:trello`, `write:trello`, `offline_access`).
3. Set the Callback URL to `https://<your-domain>/api/trello/callback`.
4. Copy the `TRELLO_CLIENT_ID` and `TRELLO_CLIENT_SECRET`.

#### B. Backend Implementation
- Auth URL Endpoint: Create `GET /api/trello/auth-url`.
- Callback Endpoint: Create `GET /api/trello/callback` to exchange the code for tokens.
- Database Update: Save tokens in `WorkspaceIntegration` with `authType: "OAUTH"`.

#### C. Service Refactoring
- All methods in `TrelloIntegrationService` accept `workspaceId` instead of `userId`.
- Remove the old `key={apiKey}&token={token}` query parameters.
- Switch to standard `Authorization: Bearer {accessToken}` headers for all Trello API calls.

### 4. Frontend Updates
- Remove Input Fields: Remove the manual API Key/Token text fields from `Integrations.tsx` for both Jira and Trello.
- Add OAuth Buttons: Add a single "Connect Jira" and "Connect Trello" button that redirects the user to the `/api/jira/auth` and `/api/trello/auth-url` respectively.
- Handle Errors: Ensure the frontend handles standard OAuth error callbacks (e.g., if the user clicks "Deny" on the Atlassian consent screen).
- RBAC: Only show connect/disconnect buttons to workspace Admins/Owners.