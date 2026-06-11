# Database Migrations & Types

Plan AI utilizes a perfectly synchronized, end-to-end type safety pipeline. 

Any time you make a change to the database schema, that change must be propagated up through the backend controllers, out to the Swagger API specification, and finally injected into the front-end clients (Web, Desktop, and Mobile).

## The Golden Rule: `yarn update`

If you modify the database schema located at `plan-ai/backend/prisma/schema.prisma`, you **must not** run standard Prisma migration commands manually. 

Instead, always run the master update script from the root of the repository:

```bash
yarn update
```

## What does `yarn update` do?

When you run `yarn update`, the following automated pipeline triggers:

1.  **Database Migration:** Runs `prisma migrate dev` to update your PostgreSQL schema.
2.  **Prisma Client Generation:** Generates the new Node.js Prisma Client.
3.  **Controller Compilation:** Uses `tsoa` to parse your Express controllers and strictly typed request/response interfaces.
4.  **Swagger Generation:** Compiles a new `swagger.json` OpenAPI specification file.
5.  **Frontend Syncing:** Triggers `openapi-typescript` inside the Web App, Native Desktop App, and Mobile App. This automatically writes a new `api.d.ts` file in all three frontends.

Because of this pipeline, the moment you add a new column to the database, it instantly becomes available with full autocomplete in your React components.

## Deploying Migrations to Production

When you are deploying a new version of Plan AI to a production server (where you do not want to wipe the database), do not run `yarn update`.

Instead, use the standard deployment command:
```bash
cd plan-ai/backend
yarn prisma:deploy
```
This safely applies the existing SQL migration files to your production database without generating new migrations.
