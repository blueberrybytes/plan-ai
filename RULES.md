# Project Rules & Guidelines

## Core Principles

1.  **SOLID Principles**: Adhere to SOLID principles in both frontend and backend code.
2.  **Small Components**: Avoid large, monolithic files on the frontend. Break down UIs into smaller, reusable components (e.g., `ChatSidebar`, `ChatWindow`).
3.  **Type Safety**: Avoid `any`. Use generated types whenever possible.

## Tech Stack Overview

### Frontend

- **Framework**: React (Vite)
- **UI Library**: Material UI (MUI) v5
- **State Management**: Redux Toolkit (RTK) + RTK Query
- **Routing**: React Router DOM (v6)
- **Internationalization**: `react-i18next`
- **Utilities**: `date-fns` for dates.

### Backend

- **Runtime**: Node.js
- **Framework**: Express
- **API Definition**: TSOA (Generates OpenAPI spec & routes)
- **Database**: Prisma ORM (PostgreSQL)
- **Authentication**: Firebase Admin SDK
- **AI**: Vercel AI SDK (`ai`, `@ai-sdk/openai`), OpenAI

## Development Workflows

### 🔄 Type Generation (Critical)

When you modify the backend (controllers/models), you **MUST** synchronize the types with the frontend.
Run the following command in the root directory:

```bash
yarn update
```

This command:

1.  Regenerates Prisma client.
2.  Regenerates TSOA routes and spec.
3.  Regenerates Frontend API client (`frontend/src/types/api.d.ts`).

**Frontend Rule**: ALWAYS use types from `src/types/api.d.ts` for API responses/requests.

## Coding Standards

### Frontend

1.  **Translations**:
    - NEVER hardcode text.
    - Use `t("key")` from `useTranslation()`.
    - Update `frontend/src/i18n/locales/en.json` immediately when adding new text.
2.  **Layouts**:
    - Ensure pages that require navigation are wrapped in `SidebarLayout`.
3.  **RTK Query**:
    - Define endpoints in `frontend/src/store/apis/*Api.ts`.
    - Use `builder.query` for GET and `builder.mutation` for POST/PUT/DELETE.

### Backend

1.  **Controllers (TSOA)**:
    - Use decorators: `@Get`, `@Post`, `@Route`, `@Security("jwt")`, `@Body`.
    - Extend `Controller` from `tsoa`.
2.  **Authentication**:
    - Use `@Request() request: AuthenticatedRequest`.
    - User is available at `request.user` (contains Firebase `uid`).
    - **Pattern**: Always look up the database user via `firebaseUid` to get the internal `id`.
    ```typescript
    const user = await prisma.user.findUnique({ where: { firebaseUid: request.user.uid } });
    ```
3.  **Services**:
    - Encapsulate business logic in service classes (e.g., `ChatService`, `SessionService`).
    - Keep controllers thin; they should mostly handle HTTP concerns and call services.

## File Structure Highlights

- `frontend/src/components`: Reusable UI components.
- `frontend/src/pages`: Top-level route components.
- `frontend/src/store/apis`: RTK Query definitions.
- `backend/src/controller`: API Endpoints (TSOA).
- `backend/src/services`: Business logic.
- `backend/prisma/schema.prisma`: Database schema.
