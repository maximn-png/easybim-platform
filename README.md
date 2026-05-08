# EasyBIM Internal Tools Platform

A Turborepo monorepo hosting all internal tools that streamline EasyBIM workflows. Every app is deployed independently on Vercel, protected by a single shared Clerk authentication via the portal, and accessible from the central portal dashboard.

---

## Architecture

```
easybim-platform/
├── apps/
│   ├── portal/           # Central dashboard — single sign-in point + tool cards
│   ├── newsletter/       # AI-powered BIM newsletter generator (first live tool)
│   ├── drive-monday/     # (planned) Google Drive ↔ Monday.com connector
│   └── revit-sync/       # (planned) Revit MCP → Sheets / Docs / Monday.com
├── packages/
│   ├── ui/               # Shared React components (AppHeader, CursorEffect, Card…)
│   ├── assets/           # Brand asset source of truth — logos and icons
│   ├── auth/             # Shared Clerk config and middleware helpers
│   ├── db/               # Shared MongoDB/Mongoose connection and base models
│   └── config/           # Shared TypeScript, ESLint, and Tailwind configuration
├── scripts/
│   └── copy-assets.js    # Copies brand assets from packages/assets into each app's public/
├── turbo.json            # Turborepo task pipeline
└── package.json          # npm workspaces root
```

---

## Why a Monorepo?

Each app is independent (separate Vercel deployment, separate URL) but they share:

- **Auth** — one Clerk account, one sign-in page (portal). Employees authenticate once and all tools share the session.
- **UI** — a single component library ensures consistent branding across all tools
- **Assets** — logos and icons are maintained in one place and distributed automatically
- **DB utilities** — one MongoDB connection helper, shared models where relevant
- **Config** — TypeScript, ESLint, and Tailwind are configured once and extended per-app

Without a monorepo, every new tool would copy-paste auth code, UI components, and DB utilities. With the monorepo, a change to the shared `AppHeader` propagates to every app automatically.

---

## Authentication Architecture

**The portal is the single sign-in point for the entire platform.** No other app has its own sign-in or sign-up pages.

```
User visits newsletter.easybim.co.il/dashboard
          ↓ not authenticated
newsletter proxy.ts redirects →  tools.easybim.co.il/sign-in?redirect_url=newsletter.../dashboard
          ↓ signs in at portal
Clerk redirects back →  newsletter.easybim.co.il/dashboard  ✓
```

This works because:
- Both apps share the same Clerk publishable/secret keys → same session token
- In dev: cookies are scoped to `localhost` regardless of port, so both apps read the same session
- In prod: configure the newsletter as a Clerk satellite domain (see Deployment section)

**Each satellite app's `proxy.ts`** must redirect unauthenticated users to the portal, not to a local sign-in:

```ts
// apps/<any-tool>/proxy.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher(['/', '/api/webhook(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    const { userId } = await auth()
    if (!userId) {
      const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3000'
      const signInUrl = new URL(`${portalUrl}/sign-in`)
      signInUrl.searchParams.set('redirect_url', req.url)
      return NextResponse.redirect(signInUrl)
    }
  }
})
```

---

## Apps

### `apps/portal` — Internal Tools Portal
**URL (production):** `tools.easybim.co.il`

The home for all EasyBIM employees and the **only sign-in entry point** for the platform. Features a branded landing page with animated cursor, floating particles, and glassmorphism tool cards. Protected by Clerk — only `@easybim.co.il` accounts can log in. After sign-in, employees reach a dashboard that links to all available tools.

### `apps/newsletter` — Newsletter Generator
**URL (production):** `newsletter.easybim.co.il`

Generates AI-powered BIM industry newsletters from 21 RSS feeds using Google Gemini and Cohere. Stores generated newsletters in MongoDB. Unauthenticated users are redirected to the portal sign-in — the newsletter has no sign-in page of its own.

### `apps/drive-monday` _(planned)_
Syncs Google Drive files and folders to Monday.com boards. Will use Google Drive API and Monday.com GraphQL API via shared service helpers in `packages/`.

### `apps/revit-sync` _(planned)_
Connects Revit models (via Revit MCP) to Google Sheets, Google Docs, and Monday.com. Enables automated quantity take-offs, drawing registers, and model data exports.

---

## Shared Packages

### `packages/ui`
Shared React component library. Start here when building new apps — if a component already exists (`AppHeader`, `CursorEffect`, `ToolCard`, `Button`…), import it instead of rebuilding.

```ts
import { AppHeader, CursorEffect } from '@easybim/ui'
```

### `packages/assets`
Single source of truth for all EasyBIM brand files (logos, icons). **Never edit logo files directly inside an app's `public/` folder** — edit them here and the copy script will distribute them.

```
packages/assets/logos/
  easybim_logo-w.png   # Full logo — "Easy BIM / Innovative Engineering" (use on light backgrounds)
  easybim_logo-b.png   # Icon-only variant
  easybim_icon-w.png   # Standalone icon
  easybim_icon-b.png   # Standalone icon (dark variant)
```

Files are automatically copied into each app's `public/` folder before every `dev` and `build` run via `scripts/copy-assets.js`. The generated copies are gitignored in each app.

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

## Design System

All apps share the same visual language:

| Token | Value |
|---|---|
| Primary (navy) | `#1e248c` |
| Accent (cyan) | `#44b8d3` |
| Background | `linear-gradient(135deg, #eef6fb 0%, #f8f9ff 45%, #f0f4ff 100%)` |
| Card | `bg-white/65 backdrop-blur-sm border border-white/90 rounded-2xl` |

Key UI patterns defined in `packages/ui`:
- **`CursorEffect`** — animated glowing cyan cursor dot with lagging ring
- **`AppHeader`** — sticky frosted-glass header with the full EasyBIM logo
- **Landing / sign-in pages** — gradient background, radial blobs, floating particles, staggered fade-up animations

---

## Next.js 16 Notes

This monorepo uses **Next.js 16**, which has breaking changes from earlier versions:

- **`proxy.ts` replaces `middleware.ts`** — Clerk's `clerkMiddleware()` must be defined in `proxy.ts` at the app root, not `middleware.ts`.
- **`turbopack.root`** — must be set to the monorepo root (`path.resolve(__dirname, '../..')`) so Turbopack can find packages hoisted to the root `node_modules`.

---

## Running Locally

> **Windows users:** PowerShell 5.1 does not support `&&`. Use `;` to chain commands, or open separate terminals.

```powershell
# Install all dependencies (run from repo root)
npm install

# Run all apps in parallel (copy-assets runs automatically first)
npm run dev

# Run a single app (PowerShell — use separate terminals)
cd C:\easybim-platform\apps\portal; npm run dev        # http://localhost:3000
cd C:\easybim-platform\apps\newsletter; npm run dev    # http://localhost:3001
```

---

## Brand Assets

To update a logo or add a new asset:

1. Replace or add the file in `packages/assets/logos/`
2. Run `npm run copy-assets` from the repo root (or just restart `npm run dev`)
3. The file is automatically available at `/your-file.png` in every app

---

## Environment Variables

Each app has its own `.env.local` (not committed). Copy `.env.example` at the root as a reference.

### Portal (`apps/portal/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (shared with all apps) |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/dashboard` |
| `NEXT_PUBLIC_NEWSLETTER_URL` | Newsletter app URL (`http://localhost:3001` in dev) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (for Photos API) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Long-lived Google refresh token |
| `GOOGLE_PHOTOS_SHARE_TOKEN` | Google Photos shared album token |

### Newsletter (`apps/newsletter/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Same Clerk key as portal |
| `CLERK_SECRET_KEY` | Same Clerk secret as portal |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Portal sign-in URL (`http://localhost:3000/sign-in` in dev) |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Portal sign-up URL (`http://localhost:3000/sign-up` in dev) |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Newsletter dashboard URL after login (`http://localhost:3001/dashboard` in dev) |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Newsletter dashboard URL after signup |
| `NEXT_PUBLIC_PORTAL_URL` | Portal base URL (`http://localhost:3000` in dev) — used by middleware to build the redirect |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `ENCRYPTION_SECRET` | AES-256-GCM key for API keys stored in MongoDB (32 bytes hex) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `COHERE_API_KEY` | Cohere API key |

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

### Production: Clerk Satellite Domains

In production each app runs on a different subdomain, so Clerk sessions must be shared via satellite domain configuration:

1. In the [Clerk Dashboard](https://dashboard.clerk.com) → Domains → add `newsletter.easybim.co.il` as a satellite domain of `tools.easybim.co.il`
2. Set these env vars in the newsletter's Vercel project:
   ```
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=https://tools.easybim.co.il/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=https://tools.easybim.co.il/sign-up
   NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=https://newsletter.easybim.co.il/dashboard
   NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=https://newsletter.easybim.co.il/dashboard
   NEXT_PUBLIC_PORTAL_URL=https://tools.easybim.co.il
   ```
3. Repeat for every new satellite app.

---

## Adding a New Tool

1. `cp -r apps/newsletter apps/my-new-tool` as a starting template, or scaffold a fresh Next.js app
2. Update `apps/my-new-tool/package.json` — set `"name": "@easybim/my-new-tool"` and `"dev"` port to an unused one
3. Add `turbopack: { root: path.resolve(__dirname, '../..') }` to `next.config.ts`
4. Create `proxy.ts` at the app root using the satellite middleware pattern above (copy from `apps/newsletter/proxy.ts`) — **do not create `/sign-in` or `/sign-up` pages**
5. Set `NEXT_PUBLIC_PORTAL_URL` in the app's `.env.local`
6. Add a card for it in `apps/portal/app/dashboard/page.tsx`
7. Import shared packages from `@easybim/ui`, `@easybim/db`, `@easybim/auth` instead of duplicating code
8. Create a new Vercel project pointing to `apps/my-new-tool` and register it as a Clerk satellite domain

Brand assets are distributed automatically — no extra steps needed.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth | Clerk (single sign-in via portal) |
| Database | MongoDB Atlas (Mongoose) |
| AI | Google Gemini 2.5 Pro + Cohere |
| Styling | Tailwind CSS v4 |
| Build orchestration | Turborepo |
| Hosting | Vercel |
| Language | TypeScript |
