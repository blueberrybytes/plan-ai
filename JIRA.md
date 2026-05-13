# Jira OAuth 2.0 Setup Guide

This guide outlines the steps to configure Jira as a one-click OAuth 2.0 integration for Plan AI.

## 1. App Verification Requirements

**Do you need to go through a strict app verification/review?**

**Short Answer:** No, as long as you aren't trying to list Plan AI in their official App Stores.

**Long Answer:**
You can create an Atlassian 3LO (OAuth 2.0) app in their developer console. You can distribute the authorization URL to your users immediately. They will see a consent screen ("Plan AI wants to access your Jira"). You only need to pass their strict security review if you want your app to be listed inside the public "Atlassian Marketplace".

## 2. Infrastructure Setup (Developer Console)

Jira's OAuth 2.0 implementation is called "3LO" (3-Legged OAuth).

1. Go to Atlassian Developer Console.
2. Create an OAuth 2.0 (3LO) Integration.
3. Set the Callback URL to `https://<your-domain>/api/jira/callback`.
4. Add the Jira API and configure granular scopes (`read:jira-work`, `write:jira-work`, `read:jira-user`). *Note: `offline_access` is also required, but it is a "free" scope that you do not configure in the console; it is requested dynamically in our backend code.*
5. Copy the `JIRA_CLIENT_ID` and `JIRA_CLIENT_SECRET` to the `.env` file.

## 3. Backend Implementation Details

- **Auth URL Endpoint:** `GET /api/jira/auth` generates an Atlassian authorization URL containing the `JIRA_CLIENT_ID`, scopes, and a secure `state` parameter (encodes `workspaceId`).
- **Callback Endpoint:** `GET /api/jira/callback` receives the `code`, validates the `workspaceId` from state, and exchanges it for an `accessToken` and `refreshToken`.
- **Database Update:** Save the tokens in the `WorkspaceIntegration` table with `authType: "OAUTH"`.
- **Cloud ID Resolution:** After getting the token, call `https://api.atlassian.com/oauth/token/accessible-resources` to get the `cloudId` and save it to the integration metadata.

## 4. Service Refactoring Details

- All methods in `JiraIntegrationService` accept `workspaceId` instead of `userId`.
- The base URL for Jira API calls changes from `https://{domain}.atlassian.net` to `https://api.atlassian.com/ex/jira/{cloudId}`.

## 5. Frontend Updates

- Remove Input Fields: Remove the manual API Key/Token text fields from `Integrations.tsx` for Jira.
- Add OAuth Buttons: Add a single "Connect Jira" button that redirects the user to the `/api/jira/auth`.
- Handle Errors: Ensure the frontend handles standard OAuth error callbacks (e.g., if the user clicks "Deny" on the Atlassian consent screen).
- RBAC: Only show connect/disconnect buttons to workspace Admins/Owners.
