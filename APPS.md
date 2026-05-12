# Integration App Creation Guide

This document outlines the difficulty and steps required to create the necessary OAuth applications or API credentials to connect **Jira**, **Linear**, and **Trello** to the Plan AI backend.

---

## 1. Linear 
**Difficulty:** 🟢 **Easy**  
*Linear is renowned for its excellent developer experience. Setting up an OAuth2 application is incredibly straightforward and takes just a few minutes.*

### Steps to create an OAuth App:
1. Log in to your Linear account and go to **Settings > Workspace > API** (or simply visit [linear.app/settings/api](https://linear.app/settings/api)).
2. Scroll down to the **OAuth Applications** section and click **New Application**.
3. Fill in the basic details:
   - **App Name:** Plan AI (or your preferred name)
   - **Short Description:** AI-powered meeting task extractor
   - **Callback URLs:** `http://localhost:8080/api/auth/linear/callback` (for local dev) and your production callback URL.
4. (Optional) Check the Webhooks you want to listen to if you need two-way sync.
5. Click **Create Application**.
6. Copy the **Client ID** and **Client Secret** into your `.env` file.

---

## 2. Trello
**Difficulty:** 🟡 **Moderate**  
*Trello is relatively easy to set up, but its underlying authentication flow relies on an older implementation (OAuth 1.0a) or a simple API Key + Token pair, which is different from modern OAuth2 standards.*

### Steps to create an Integration App:
1. Go to the [Trello Power-Up Admin Console](https://trello.com/power-ups/admin).
2. Click **New Power-Up / Integration**.
3. Fill out the form with your App Name, Workspace, and Email.
4. Once created, navigate to the **API Key** tab in the sidebar on the left.
5. Here, you will find your **API Key** and a link to manually generate a **Token** (if you are just using this for a single personal account).
6. For multi-user SaaS (OAuth flow), scroll down to the **Allowed Origins** section and add your domain (e.g., `http://localhost:8080`).
7. Copy your **API Key** and the **Secret** (found below the API Key) into your `.env` file.

---

## 3. Jira (Atlassian)
**Difficulty:** 🔴 **Hard**  
*Atlassian's developer console and OAuth 2.0 (3LO) setup is notoriously complex. It requires granular scope configurations, distributing permissions, and dealing with a strict token rotation policy.*

### Steps to create an OAuth 2.0 (3LO) App:
1. Go to the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).
2. Click **Create** > **OAuth 2.0 integration**.
3. Give your app a name (e.g., "Plan AI Jira Integration") and agree to the terms.
4. Under the **Permissions** tab on the left sidebar:
   - Find the **Jira API** and click **Add**.
   - You must specifically add the exact granular scopes your app needs. For creating issues, you will generally need `write:jira-work`, `read:jira-work`, and `read:jira-user`. 
   - *Note: If you miss a scope, the API calls will silently fail or return 403s.*
5. Under the **Authorization** tab on the left sidebar:
   - Add your Callback URL (e.g., `http://localhost:8080/api/auth/jira/callback`).
6. Under the **Settings** tab, retrieve your **Client ID** and **Secret**.
7. Add these credentials to your `.env` file.

> **Shortcut for Personal Use:** If you are only connecting Jira for yourself, it is *infinitely* easier to use an API Token. You can generate one at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) and authenticate API requests using Basic Auth (`email:api_token`). However, this cannot be used for a multi-tenant SaaS.
