# Trello OAuth 1.0 (Token Flow) Setup Guide

This guide outlines the steps to configure Trello as a one-click integration for Plan AI. 

**Important Clarification:** Although Atlassian acquired Trello, Trello’s core API *does not* yet use the standard Atlassian 3LO (OAuth 2.0) flow found in the Atlassian Developer Console. Trello maintains its own separate developer portal and relies on an API Key + User Token authorization model (Implicit Grant / OAuth 1.0).

To make this a "one-click" experience for our users, we will configure a Global Trello API Key for the entire application. 

## 1. Infrastructure Setup (Trello Power-Up Admin)

1. Go to the [Trello Power-Ups Admin Portal](https://trello.com/power-ups/admin).
2. Click **New** to create a new Power-Up / App (name it "Plan AI").
3. Navigate to the **API Key** tab.
4. Add your frontend domain (e.g., `http://localhost:3000` or your production domain) to the **Allowed Origins**. This is strictly required for the token flow to work.
5. Copy the **API Key**. (You do *not* need the Secret for the implicit token flow).

## 2. Environment Variables

Update `.env`, `.env.template`, and `docs/src/self-hosting/environment-variables.md` to include your global key. 

```env
# Trello
TRELLO_GLOBAL_API_KEY="your-trello-api-key"
```

## 3. Frontend Implementation (`Integrations.tsx`)

The frontend handles the "Option 1" one-click redirect:

- **Redirect to Trello**: Add a "Connect via Trello" button that redirects the user to:
  `https://trello.com/1/authorize?key=${TRELLO_GLOBAL_API_KEY}&name=Plan%20AI&scope=read,write&expiration=never&response_type=token&return_url=${FRONTEND_URL}/integrations/trello/callback`
- **Intercept Callback**: When Trello redirects back, it places the token in the URL fragment (`#token=xxxx`). The frontend must extract this token from `window.location.hash`.
- **Send to Backend**: The frontend then makes an API call to the backend (e.g., `POST /api/trello/auto-connect`) passing the extracted `token`.

## 4. Backend Implementation (`trelloController.ts`)

Add a new endpoint to handle the automated connection:

- **Auto-Connect Endpoint (`POST /api/trello/auto-connect`)**: Receives the `token` from the frontend.
- **Database Update**: Validates the token against the Trello API using the `TRELLO_GLOBAL_API_KEY` (from `process.env`). If valid, saves the connection in `WorkspaceIntegration` with `authType: "OAUTH"` or `"AUTOMATIC"`, storing the global API key and the user's token.

## 5. Service Refactoring (`trelloIntegrationService.ts`)

Currently, `fetchTrello` requires `apiKey` and `token` to be passed in explicitly. 
- Refactor the service to automatically pull `TRELLO_GLOBAL_API_KEY` from the environment if the integration type is `"AUTOMATIC"`. 
- If the type is `"MANUAL"`, it continues to use the custom `apiKey` provided by the user in the "Option 2: Connect Manually" form.

## 6. Summary of Options in the UI

The UI will now look identical to Linear and Jira:
- **Option 1: Connect via Trello (Recommended)**: Uses the `TRELLO_GLOBAL_API_KEY` and the one-click implicit token flow.
- **Option 2: Connect Manually**: The existing 2-field form (`API Key`, `Token`) for users who want to use their own personal Trello developer credentials.
