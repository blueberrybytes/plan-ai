# Notion Integration Plan (OAuth Only)

## Overview
Implement Notion integration allowing users to connect their Notion workspace via OAuth (Public App) to export AI-generated tasks directly into Notion Databases. 
Per requirements, this will **only** support OAuth ("app") and **will not** support manual integration tokens.

## 1. Schema & Types
- **Prisma**: Add `NOTION` to the `IntegrationProvider` enum in `plan-ai/backend/prisma/schema.prisma`.
- **Sync**: Run `yarn update` from the root to apply database migrations, regenerate Swagger specs, and sync frontend API types automatically.
- **Environment Variables**: Add `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, and `NOTION_REDIRECT_URI` to `.env.template`.

## 2. Backend Services (`notionIntegrationService.ts`)
Create a new service in `plan-ai/backend/src/services/` to handle:
- **OAuth Flow**:
  - `getAuthUrl(state)`: Construct the Notion authorization URL (`https://api.notion.com/v1/oauth/authorize`).
  - `exchangeCode(code)`: Call Notion's token endpoint (`https://api.notion.com/v1/oauth/token`) using HTTP Basic auth with Client ID/Secret.
- **Data Fetching**:
  - `getNotionSummary(workspaceId)`: Use the `@notionhq/client` to fetch a list of accessible Databases (using the `search` endpoint filtered by `database`).
- **Task Export**:
  - `createNotionPage(workspaceId, taskId, databaseId)`: Map the local `Task` entity to Notion properties and create a new page in the target Database.

## 3. Backend Controllers
- **`notionController.ts`**:
  - `GET /api/notion/auth-url`: Return the authorization URL (similar to Jira/Linear/Trello).
  - `GET /api/notion/callback`: Handle the OAuth redirect, securely exchange the code, and upsert the `WorkspaceIntegration` record with `NOTION`.
  - `GET /api/notion/summary`: Return connected databases/pages to the frontend.
- **`taskIntegrationController.ts`**:
  - Update `exportTaskToIntegration` to route `NOTION` exports to `notionIntegrationService.createNotionPage()`.

## 4. Frontend Implementation (`Integrations.tsx`)
- **Add Notion Tab**: Add `NOTION` to the provider tabs in `plan-ai/frontend/src/pages/Integrations.tsx`.
- **UI State**: Because we are *only* doing OAuth, we will skip building the "Manual Token" input form. The UI will just be a "Connect Notion" button.
- **Routing Parity**: Use the standard `?provider=notion` redirect pattern to ensure the UI snaps to the correct tab after the OAuth callback.
- **Auto-Selection Hook**: Implement the same robust `useRef` auto-selection `useEffect` we built for the others. If a user connects Notion and has databases, instantly auto-select the first available database as the default sync target.
- **Summary UI**: Render Notion statistics (e.g., "Active Databases") when the integration is connected.

## 5. Execution Steps
1. Update `schema.prisma` and run `yarn update`.
2. Install `@notionhq/client` in the backend.
3. Build `notionIntegrationService.ts` and `notionController.ts`.
4. Update `Integrations.tsx` and the RTK Query `api.ts` for Notion endpoints.
5. Implement the ticket push logic in `taskIntegrationController.ts`.
6. End-to-end testing of the OAuth flow and task export.
