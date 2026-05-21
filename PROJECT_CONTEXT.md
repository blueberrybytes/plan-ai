# Refactor Contexts to Projects in UI

This plan outlines the changes required to hide the "Context" concept in the frontend, exposing only "Projects" to the user, while keeping the "Context" terminology and architecture in the backend for things like documents, chats, and AI context grounding.

## User Review Required

> [!WARNING]
> **Data Migration Strategy:** You currently have existing `Projects` and `Contexts` in your database. 
> Since we are mapping 1 Project to 1 Context, we will need to handle existing data. 
> I propose:
> 1. For every existing `Project` that doesn't have a context, we automatically generate one.
> 2. For every existing `Context` that isn't linked to a project, do we want to wrap it in a new Project, or leave it hidden?

## Open Questions

> [!IMPORTANT]
> 1. **Sidebar Navigation:** I will remove "Contexts" from the sidebar. I assume users will upload files to their project's "brain" directly from the `ProjectDetails` view. I plan to add a "Knowledge Base" (or "Files") tab to the Project Details page to handle this. Is this layout acceptable?
> 2. **Multi-select:** Currently, users can select multiple Contexts when starting a chat or creating a document. Should they now be able to select **multiple Projects** as the context source? (Behind the scenes, we would just pass the `contextId` from each selected project).

## Proposed Changes

---

### Backend (Database & Controllers)

#### [MODIFY] `backend/prisma/schema.prisma`
Add a 1-to-1 relationship between `Project` and `Context`. We will add a `projectId` to the `Context` model so that deleting a project automatically cleans up its context.
- **Context:** Add `projectId String? @unique` and `project Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)`.
- **Project:** Add `context Context?`.

#### [MODIFY] `backend/src/controller/projectController.ts`
- Update `createProject` logic: When a new project is created, automatically spawn a `Context` with the same name and link it via `projectId`.
- Update `getProjectById` and `getAllProjects`: Add `include: { context: true }` so the frontend always has access to the underlying `contextId`.

#### [NEW] `backend/prisma/migrations/...`
- Run `yarn update` (or Prisma migrate) to generate the schema changes. We will also need to execute a small data-fill script for existing projects if required.

---

### Frontend (UI & Logic)

#### [MODIFY] `frontend/src/components/layout/SidebarLayout.tsx`
- Remove the "Contexts" link from the sidebar menu to hide the concept completely.

#### [DELETE] `frontend/src/pages/Contexts.tsx`
- This page is no longer needed since contexts are managed within Projects.

#### [MODIFY] `frontend/src/pages/ProjectDetails.tsx`
- Add a new tab (e.g., "Knowledge Base" or "Files").
- Render the existing `ContextFileViewer` component inside this tab, passing it the project's associated `context.id`.

#### [MODIFY] Context Selection Dropdowns (Multiple Files)
Anywhere the user is prompted to "Select Context(s)", we will change the UI to "Select Project(s)". The API payloads will remain exactly the same (`contextIds: string[]`), but the UI will derive these IDs from the selected projects (`project.context.id`).
Files to update:
- `frontend/src/components/chat/ChatContextDialog.tsx`
- `frontend/src/components/project/ProjectTranscriptDialog.tsx`
- `frontend/src/pages/DiagramCreate.tsx`
- `frontend/src/pages/DocCreate.tsx`
- `frontend/src/pages/PresentationCreate.tsx`
- `frontend/src/pages/Chat.tsx` / `ChatFull.tsx` (Update labels)

## Verification Plan

### Automated Tests
- Run `yarn typecheck:all` to ensure no frontend types are broken by the removal of explicit Context UI models where Projects are now used.

### Manual Verification
1. **Create Project:** Verify that creating a new Project via the UI automatically generates a linked Context.
2. **Upload Files:** Navigate to the new Project's Knowledge Base tab and upload a file. Verify it uploads to the correct underlying context.
3. **Chat/Docs Generation:** Open a new Chat or Document creation dialog. Verify the dropdown says "Projects" and selecting a project successfully injects its context files into the AI request.
