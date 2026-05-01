# EasyBIM Internal Tools Platform

A Turborepo monorepo hosting all internal tools that streamline EasyBIM workflows. Every app is deployed independently on Vercel, protected by a shared Clerk authentication, and accessible from the central portal.

---

## Architecture

```
easybim-platform/
├── apps/
│   ├── portal/           # Central dashboard — lists and links to all tools
│   ├── newsletter/       # AI-powered BIM newsletter generator (first live tool)
│   ├── drive-monday/     # (planned) Google Drive ↔ Monday.com connector
│   └── revit-sync/       # (planned) Revit MCP → Sheets / Docs / Monday.com
├── packages/
│   ├── ui/               # Shared React components (AppHeader, Card, Button…)
│   ├── auth/             # Shared Clerk config and middleware helpers
│   ├── db/               # Shared MongoDB/Mongoose connection and base models
│   └── config/           # Shared TypeScript, ESLint, and Tailwind configuration
├── turbo.json            # Turborepo task pipeline
└── package.json          # npm workspaces root
```

---

## Why a Monorepo?

Each app is independent (separate Vercel deployment, separate URL) but they share:

- **Auth** — one Clerk account, employees sign in once via the portal
- **UI** — a single component library ensures consistent branding across all tools
- **DB utilities** — one MongoDB connection helper, shared models where relevant
- **Config** — TypeScript, ESLint, and Tailwind are configured once and extended per-app

Without a monorepo, every new tool would copy-paste auth code, UI components, and DB utilities. With the monorepo, a change to the shared `AppHeader` propagates to every app automatically.

---

## Apps

### `apps/portal` — Internal Tools Portal
**URL (production):** `tools.easybim.co.il`

The home page for all EasyBIM employees. Shows a dashboard of available tools, each as a card with title, description, and a link. Protected by Clerk — only `@easybim.co.il` accounts can log in.

### `apps/newsletter` — Newsletter Generator
**URL (production):** `newsletter.easybim.co.il`

Generates AI-powered BIM industry newsletters from RSS feeds. Uses Google Gemini for content generation and MongoDB to store generated newsletters. First live tool on the platform.

### `apps/drive-monday` _(planned)_
Syncs Google Drive files and folders to Monday.com boards. Will use Google Drive API and Monday.com GraphQL API via shared service helpers in `packages/`.

### `apps/revit-sync` _(planned)_
Connects Revit models (via Revit MCP) to Google Sheets, Google Docs, and Monday.com. Enables automated quantity take-offs, drawing registers, and model data exports.

---

## Shared Packages

### `packages/ui`
Shared React component library. Start here when building new apps — if a component already exists (AppHeader, ToolCard, Button…), import it instead of rebuilding.

```ts
import { AppHeader, ToolCard } from '@easybim/ui'
```

### `packages/auth`
Clerk configuration shared across all apps. Exports the middleware factory and auth helpers so every app uses the same protection logic.

```ts
import { createClerkMiddleware } from '@easybim/auth'
```

### `packages/db`
MongoDB connection utility (Mongoose). Provides a cached connection that works correctly in Next.js serverless environments.

```ts
import { connectDB } from '@easybim/db'
```

### `packages/config`
Base TypeScript configuration (`tsconfig.base.json`) and ESLint config extended by every app. Keeps compiler settings consistent.

---

## Deployment

Each app in `apps/` is a separate Vercel project, all pointing to this single GitHub repository.

| App | Vercel Root Directory | Domain |
|---|---|---|
| portal | `apps/portal` | `tools.easybim.co.il` |
| newsletter | `apps/newsletter` | `newsletter.easybim.co.il` |

**Steps to add a new app to Vercel:**
1. Create the app in `apps/<name>/`
2. Push to GitHub
3. In Vercel → New Project → import this repo → set Root Directory to `apps/<name>`
4. Add environment variables
5. Add a custom domain

---

## Running Locally

```bash
# Install all dependencies (run from repo root)
npm install

# Run all apps in parallel
npm run dev

# Run a single app
cd apps/portal && npm run dev        # http://localhost:3000
cd apps/newsletter && npm run dev    # http://localhost:3001
```

---

## Environment Variables

Each app has its own `.env.local` (not committed). Copy `.env.example` at the root as a reference.

All apps share the same Clerk publishable/secret keys. Other variables (MongoDB URI, AI API keys) are per-app.

After deploying the newsletter to Vercel, update `NEXT_PUBLIC_NEWSLETTER_URL` in the portal's `.env.local` (and Vercel env settings) with the live URL.

---

## Adding a New Tool

1. `cp -r apps/newsletter apps/my-new-tool` as a starting template, or scaffold a fresh Next.js app
2. Update `apps/my-new-tool/package.json` — set `"name": "@easybim/my-new-tool"` and `"dev"` port to an unused one
3. Add a card for it in `apps/portal/app/dashboard/page.tsx`
4. Import shared packages from `@easybim/ui`, `@easybim/db`, `@easybim/auth` instead of duplicating code
5. Create a new Vercel project pointing to `apps/my-new-tool`

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth | Clerk |
| Database | MongoDB Atlas (Mongoose) |
| AI | Google Gemini 2.5 Pro |
| Styling | Tailwind CSS v4 |
| Build orchestration | Turborepo |
| Hosting | Vercel |
| Language | TypeScript |
