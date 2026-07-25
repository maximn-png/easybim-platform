# EasyBIM Knowledge Center (`@easybim/knowledge`)

Central hub for EasyBIM standards, BIM guides, templates, and best practices.
This is the `knowledge` card on the [portal](../portal) dashboard.

**Status:** scaffolded infrastructure — ready for feature development.
The app boots, authenticates, and all four integrations are wired. No product
features are built yet.

- **Port:** `3004` (portal 3000 · newsletter 3001 · epm 3002 · agents 3003)
- **Grant key:** `knowledge` (already a valid `AppId` in `@easybim/auth`; the
  portal card already exists in `apps/portal/lib/cards.ts`)

## Getting set up

1. Copy the ready-made env file from the R&D shared Drive:
   `G:\Shared drives\R&D\Claude env.local files\knowledge\.env.local`
   → `apps/knowledge/.env.local`
   (or copy `.env.example` and fill in the values yourself)
2. From the repo root: `npm install`
3. Start just this app: `cd apps/knowledge && npm run dev`
   (or `npm run dev` from the root to start everything via Turbo)
4. Verify every integration connects: open
   [http://localhost:3004/api/health](http://localhost:3004/api/health).
   You want `{ "ok": true }` with all four checks green.

## What's wired

| Service | Where | Notes |
| --- | --- | --- |
| **Clerk** (auth) | `proxy.ts`, `app/layout.tsx` | Satellite of the portal. Every route except `/api/health`, `/api/webhook*`, `/api/cron*` requires a signed-in user holding the `knowledge` grant. |
| **MongoDB** | `lib/db/mongoose.ts` | Cached connection to the dedicated `easybim-knowledge` database. `import { connectDB } from '@/lib/db/mongoose'`. |
| **monday.com** | `lib/integrations/monday.ts` | `mondayQuery(query, variables)` GraphQL helper. |
| **Google Drive** | `lib/integrations/gdrive.ts` | `getDrive()` returns an authenticated `drive_v3` client (OAuth, shared EasyBIM Google app). |

## Layout

```
apps/knowledge/
├── app/
│   ├── layout.tsx          # ClerkProvider + activity logging
│   ├── page.tsx            # placeholder landing page
│   ├── globals.css
│   └── api/health/route.ts # integration diagnostics (public)
├── lib/
│   ├── db/mongoose.ts      # Mongo connection
│   ├── integrations/
│   │   ├── monday.ts
│   │   └── gdrive.ts
│   └── models/             # add Mongoose models here
├── proxy.ts                # Clerk middleware (auth gating)
├── next.config.ts
└── .env.local              # live secrets (gitignored) — from the R&D Drive
```

## Going live (later)

When the app is ready to ship:

1. Deploy to Vercel as a new project; add the env vars from `.env.local`
   (production values: live Clerk keys, prod `NEXT_PUBLIC_CLERK_DOMAIN`, etc).
2. Set `NEXT_PUBLIC_KNOWLEDGE_URL` in the **portal** env and update the
   `knowledge` card in `apps/portal/lib/cards.ts` to read that URL and flip its
   status to `live` (mirror how the `agents` card does it).
3. Grant users the `knowledge` app via the portal's User Management page.

## Conventions

Mirror `apps/agents` — the newest app using the same Clerk-satellite + Mongo +
Monday + Drive stack. Models guard against recompilation
(`mongoose.models.X || mongoose.model(...)`); route handlers that must run
per-request use `export const dynamic = 'force-dynamic'`.
