# EasyBIM Finance Management (`@easybim/finance`)

Financial management hub for EasyBIM — billing, invoices, finance documents,
and project finance overview. Data is synced from monday.com and Google Drive
into the dedicated `easybim-finance` MongoDB database.
This is the `finance` card on the [portal](../portal) dashboard.

**Status:** scaffolded infrastructure — ready for feature development.
The app boots, authenticates, and all four integrations are wired. No product
features are built yet.

- **Port:** `3005` (portal 3000 · newsletter 3001 · epm 3002 · agents 3003 · knowledge 3004)
- **Grant key:** `finance` (valid `AppId` in `@easybim/auth`; portal card in
  `apps/portal/lib/cards.ts`). Access is restricted to the finance team —
  grant via the portal's User Management page.

## Getting set up

1. Copy `.env.example` to `.env.local` and fill in the values (shared secrets
   can be pulled from sibling apps' `.env.local` files — Clerk/Mongo/Monday/
   Drive are the same across apps; only the Mongo database name differs:
   `easybim-finance`).
2. From the repo root: `npm install`
3. Start just this app: `cd C:\easybim-platform\apps\finance; npm run dev`
4. Verify every integration connects: open
   [http://localhost:3005/api/health](http://localhost:3005/api/health).
   You want `{ "ok": true }` with all four checks green.

## What's wired

| Service | Where | Notes |
| --- | --- | --- |
| **Clerk** (auth) | `proxy.ts`, `app/layout.tsx` | Satellite of the portal. Every route except `/api/health`, `/api/webhook*`, `/api/cron*` requires a signed-in user holding the `finance` grant. |
| **MongoDB** | `lib/db/mongoose.ts` | Cached connection to the dedicated `easybim-finance` database. `import { connectDB } from '@/lib/db/mongoose'`. |
| **monday.com** | `lib/integrations/monday.ts` | `mondayQuery(query, variables)` GraphQL helper. |
| **Google Drive** | `lib/integrations/gdrive.ts` | `getDrive()` returns an authenticated `drive_v3` client (OAuth, shared EasyBIM Google app). |

## Planned modules

Each module ("application") gets its own page + Monday/Drive sources:

1. **Billing Status** — bills/invoices per project & milestone from Monday.
2. **Finance Documents** — contracts and invoices indexed from Google Drive.
3. **Project Finance Overview** — contract totals, billed-to-date, cost insight.

Planned collections in `easybim-finance`: `finance_projects`, `bills`,
`documents`, `sync_runs`.

## Layout

```
apps/finance/
├── app/
│   ├── layout.tsx          # ClerkProvider + activity logging
│   ├── page.tsx            # landing page with planned modules
│   ├── globals.css
│   └── api/health/route.ts # integration diagnostics (public)
├── lib/
│   ├── db/mongoose.ts      # Mongo connection (easybim-finance)
│   ├── integrations/
│   │   ├── monday.ts
│   │   └── gdrive.ts
│   └── models/             # add Mongoose models here
├── proxy.ts                # Clerk middleware (auth + finance grant gating)
├── next.config.ts
└── .env.local              # live secrets (gitignored)
```

## Going live (later)

1. Deploy to Vercel as a new project; add the env vars from `.env.local`.
2. Add a production satellite domain (e.g. `finance.easybim.co.il`) in Clerk.
3. Set `NEXT_PUBLIC_FINANCE_URL` on the portal's Vercel project so the card
   goes live.
4. Add the hourly sync cron (`vercel.json` crons + `CRON_SECRET`).
