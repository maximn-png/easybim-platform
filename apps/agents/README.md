# @easybim/agents — the Agent Kingdom hub 🦁👑

Multi-agent app. Vision: see [agent-kingdom.md](./agent-kingdom.md) — ten animal agents, the **Lion** orchestrates and routes, each animal specializes. This app is the runtime + (Phase 2) dashboard for that kingdom.

**First agent built: 🦚 Peacock** — the EasyBIM LinkedIn / content agent. Plans, drafts, and routes weekly LinkedIn posts through a Monday board, with human approval.

**Second agent: 🐿️ Squirrel** — the price-quote management agent (`lib/agents/squirrel/`). On a Monday webhook for a new **Type-C** item on **MA-001-Price Quotes** (`6105725242`) **with a `מספר הצעה` (quote number) set**, it does the unattended plumbing that the old local Python automation did: build `Clients/<Client>/<מספר הצעה> - <item name>/{הצעות מחיר, חוזה, חומר שהתקבל מהמזמין}`, copy the Type-C Sheets template **via the SheetCopier.gs web app** (so the bound `📄 הצעת מחיר` menu keeps working), write the hidden `_meta` sheet, download the Monday attachments, and write the Sheets + GDrive links back to Monday. Then it reads the received materials and **proposes** a work-scope as a Monday update (it never fills `ToQuote` directly). The two in-document Apps Script menus (`📄 הצעת מחיר`, `📧 שליחה`) are unchanged — Squirrel reproduces the exact folder layout + `_meta` they depend on. New Google Drive/Sheets integration lives in `lib/integrations/google/client.ts` (service-account auth). Dashboard chat + how-it-works are now presentation-driven (`lib/agents/presentation.ts`), so both animals render the same UI. Monday automation to wire: *"When `מספר הצעה` changes (and `סוג פרויקט` is C) → POST `/api/webhooks/squirrel/monday?token=<MONDAY_WEBHOOK_SECRET>`"* — the handler re-validates both conditions and is idempotent.

**Squirrel quote index + analytics.** Squirrel also maintains a `QuoteRecord` Mongo index (one doc per board item) so the chat can filter/aggregate/compare quotes fast. `lib/agents/squirrel/quoteIndex.ts` `syncFromMonday()` bulk-upserts every item's columns; `backfillAreas()` reads each linked work-plan sheet and extracts the project area (anchored on the "שטח" label in the `ToQuote`/`WorkingSheet` tabs). Chat tools in `lib/agents/squirrel/analytics.ts`: `query_quotes`, `aggregate_quotes`, `get_quote`, `sync_index`. A **daily cron** `/api/cron/squirrel/sync` (in `vercel.json`, 05:00) keeps it fresh + backfills a batch of areas; "רענן את האינדקס" in chat triggers `sync_index` on demand.
- **Six contact parties** (all mirror/board-relation columns → MA-006-Contacts `8161875627`) are indexed & queryable/groupable: `developer` (יזם ראשי, also the primary `client`), `developerContact` (איש קשר מטעם היזם), `projectManagement` (ניהול הפרויקט), `projectManagerContact` (איש קשר מטעם מנהל פרויקט), `workOrderer` (מזמין העבודה), `workOrdererContact` (איש קשר טעם מזמין העבודה).
- ⚠️ **Monday gotcha (verified 2026-07-03):** the client/מזמין is NOT `formula_mkzmngff` — that formula column returns the literal string `"null"` over the API. The six parties above come from their mirror/relation columns via `display_value`. Mirror/formula/board-relation columns need the typed GraphQL fragments (`... on MirrorValue { display_value }` etc.) — see `COLUMN_VALUES` in `lib/integrations/monday/client.ts` and `disp()` in `squirrel/board.ts`.
- ⚠️ **Dev gotcha:** after changing `QuoteRecord`'s schema, **restart** the dev server — Mongoose caches the compiled model and (strict mode) silently strips fields the cached schema doesn't know, so new columns won't persist until a fresh process re-registers the schema.

> Source-of-truth design + the proven prototype live on the shared drive:
> `G:\Shared drives\Marketing\Claude-Marketing-Skills\` — `easybim-agent-platform-architecture.md`, `easybim-brand guidline/`, `easybim-monday-orchestrator/SKILL.md` + `posttype-playbook.md`, `easybim-post-writer/`, `easybim-linkedin-package/`, `nanobana-picgenerator/`.

---

## Structure (built for many agents)

```
apps/agents/
  app/
    api/cron/<agent>/<pass>/route.ts        # Vercel Cron entrypoints (secured by CRON_SECRET)
    api/webhooks/<agent>/<source>/route.ts  # external webhooks (e.g. Monday)
    layout.tsx · page.tsx · globals.css
  lib/
    core/        types.ts · agentRuntime.ts · registry.ts   # shared, agent-agnostic
    integrations/ monday/client.ts                          # shared, cross-agent clients
    models/      AgentRun.ts · AgentMessage.ts              # shared Mongo models
    agents/peacock/  board.ts · brand.ts · prompts.ts · tools.ts · index.ts
  proxy.ts · middleware.ts (Clerk; cron+webhook routes public)
  vercel.json (cron)
```

Runs on **port 3003** (portal 3000, newsletter 3001, epm 3002). Mirrors `apps/newsletter` conventions (app-local `lib/`, cached `connectDB`, AES-256-GCM `encryption.ts`, Clerk satellite via `proxy.ts`, routes with `runtime='nodejs'` + `maxDuration=300`).

### Add a new animal agent
1. `lib/agents/<animal>/` with `board.ts`/config + `prompts.ts` + `tools.ts` (`betaZodTool`s) + `index.ts` exporting an `AgentDefinition`.
2. Routes under `app/api/cron/<animal>/...` and/or `app/api/webhooks/<animal>/...`.
3. Register it in `lib/core/registry.ts`.

---

## How the agent runs (Peacock)

- **Runtime:** `lib/core/agentRuntime.ts` drives the Anthropic SDK **beta tool runner** (`@anthropic-ai/sdk@0.69`, model `claude-opus-4-8`), persisting an `AgentRun` + `AgentMessage`s.
- **Author pass** — weekly Vercel Cron → `GET /api/cron/peacock/author`. Reads the Monday backlog, drafts 2 posts (Mon+Thu), posts each to the item's Updates, tags Maxim, sets Status `Pending Approval`.
- **Watcher pass** — Monday automation "Status → Approved/Revise" → `POST /api/webhooks/peacock/monday`. On `Approved` → `Ready to Publish` (image + package = Phase 3); on `Revise` → reads comments, rewrites, re-posts, stays `Pending Approval`. Uses `after()` to ack Monday fast.

### Resolved Monday facts (board `EasyBIM_Posts`)
- board `18419189644`, group `Posts` `________mkkf70xa`, Maxim user `26773504`.
- columns: Status `status`, PostType `dropdown_mm05jq6f`, Publish Date `dup__of_start_mkm8svar`, Drive Link `link_mm4mqdp`.
- status filter uses **label indexes**: Idea 7, Drafting 9, Pending Approval 0, Approved 3, Ready to Publish 4, Scheduled 10, Published 1, Revise 2.
- ⚠️ set Publish Date with `change_multiple_column_values` and **read back** (setting it inside `create_item` dropped the day in testing).
- ⚠️ `items_page` status filter (Monday 2024-10): `column_id` is `ID!`, `compare_value` is the `CompareValue` scalar, and label indexes must be **integers** — `["7","9"]` silently matches nothing; `[7,9]` works. (See `getItemsByStatusLabelIds` in `lib/integrations/monday/client.ts`.)

---

## Env (`apps/agents/.env.local`)
```
ANTHROPIC_API_KEY=
MONDAY_API_TOKEN=          # write scope
MONDAY_WEBHOOK_SECRET=     # checked as ?token= on the webhook
CRON_SECRET=               # Vercel sends Authorization: Bearer <CRON_SECRET>
# shared with other apps:
MONGODB_URI=
ENCRYPTION_SECRET=         # 64-char hex
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_PORTAL_URL=http://localhost:3000
# GEMINI_API_KEY (Phase 3 branded image — use a FRESH key)
# 🐿️ Squirrel (price quotes) — Google Drive/Sheets + SheetCopier:
GOOGLE_SERVICE_ACCOUNT_JSON=   # base64 (or raw JSON) of the Finance service_account.json
SHEET_COPIER_URL=              # SheetCopier.gs /exec web-app URL (from the PriceQuotes config.json)
SHEET_COPIER_SECRET=           # matching SheetCopier secret
PQ_TEMPLATE_SHEET_ID=1aKTp7HN1Y5plb6LBPdXEm16WV0Xt0-WNW7HWYPrlXXM
PQ_DRIVE_NAME=Finance
PQ_CLIENTS_ROOT=Clients
# MONDAY_API_TOKEN (write scope) is reused for the board writes AND written into each project's _meta sheet.
```

---

## STATUS (2026-06-26) & how to continue

**Phases 1–3: VERIFIED WORKING LIVE (2026-06-26).** The whole Peacock loop runs end-to-end against the real `EasyBIM_Posts` board, plus the Agent Kingdom dashboard and branded-image-on-approval. Only the Vercel deploy + live Monday automation remain. Type-check GREEN across all workspaces.

- ✅ **Phase 1 — author + watcher (both branches) verified live.** Author drafts 2 posts → `Pending Approval`. Watcher on `Approved` → `Ready to Publish`; on `Revise` → reads Maxim's reply feedback, rewrites shorter, → `Pending Approval`. (Items `12378837665`, `12378873327`.)
- ✅ **Phase 2 — Agent Kingdom dashboard.** Portal card → agents `/` (Kingdom, agent cards from `registry` with live status) → `/dashboard/[agentKey]` (a "why this animal" blurb, a graphical how-it-works strip, an advisor **chat**, and run history from `AgentRun` + message thread from `AgentMessage`, polling). Protected via Clerk satellite (portal session carries over, no re-login). Verified in-browser end-to-end.
  - **Chat** (advisor): asks/answers, persisted as `AgentMessage` with no `runId`. Two writes only: `save_guidance` (durable feedback → `AgentGuidance`, injected into author/watcher system prompts so the agent adapts — verified live) and `draft_item_now` (on-demand: drafts a specific Monday item → Pending Approval, never publishes; runs a manual author pass). Read tools (`get_backlog`/`read_item`) let it find an item by name.
  - **Access:** gated to any signed-in portal user (not restricted to Maxim). Note: saved guidance is per-agent and applies globally.
- ✅ **Phase 3 — branded image on approval.** `generate_image` tool (Nano Banana `gemini-2.5-flash-image`) builds an on-brand cover image from the post, `addFileToUpdate` attaches it to Monday, then `Ready to Publish`. Verified live: themed building-core wireframe attached.
- ✅ The reused Monday token (from `apps/epm`) **has write scope** — items/updates/notifications/status/file-upload all worked. Anthropic + Gemini keys + Mongo persistence confirmed.
- ✅ **`get_backlog` bug fixed.** `getItemsByStatusLabelIds` failed twice during the run (so the agent created new items instead of developing the backlog). Root cause: Monday 2024-10 GraphQL types — `column_id` must be `ID!` (was `String!`), `compare_value` must be the `CompareValue` scalar (was `[String!]!`), and label indexes must be **integers** (string indexes silently match nothing). Fixed in `lib/integrations/monday/client.ts`; verified it now returns the real Idea/Drafting backlog.
- ✅ **Type-check passes.** (Earlier zod fix: `@anthropic-ai/sdk@0.69`'s `betaZodTool` is typed against **zod v4**; app now declares `zod@^4.3.6`, deduped to `zod@4.4.3`.)
- ✅ **`apps/agents/.env.local` reconstructed** (gitignored) from sibling apps: Mongo/Clerk/Encryption/Gemini ← newsletter, Monday/Cron ← epm, Anthropic key added manually. Clerk satellite needs the absolute sign-in URLs (`NEXT_PUBLIC_CLERK_SIGN_IN_URL=http://localhost:3000/sign-in`, etc.) or the app 500s on every route.

> Local notes: Node isn't on PATH in fresh shells — prepend `C:\Program Files\nodejs`. Dev server: `npm run dev` (port 3003 — moved off 3002 which `apps/epm` uses). `proxy.ts` (Next 16) is the active middleware (the stale `middleware.ts` was removed).

**Architecture decision (2026-06-26):** build the kingdom on the **custom Next.js app (this repo)**, not Claude Cowork (desktop-only, dies when the machine sleeps — can't run unattended) and not Managed Agents (container model is overkill for API-call agents like Peacock). Revisit Managed Agents later for the 🦁 Lion orchestrator (its multiagent coordinator fits) and any future container-using agents (Owl/analytics, Octopus/support).

**Next, in order — the Vercel deploy (last local-first step):**
1. **Create the Vercel project** for `apps/agents` (root dir `apps/agents`, or the monorepo with the right root). Set env vars: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `MONDAY_API_TOKEN` (write scope), `MONDAY_WEBHOOK_SECRET`, `CRON_SECRET`, `MONGODB_URI`, `ENCRYPTION_SECRET`, and Clerk (`NEXT_PUBLIC_CLERK_*`, `CLERK_SECRET_KEY`) with the **production** satellite domain + `NEXT_PUBLIC_PORTAL_URL`.
2. **Point the portal card** `NEXT_PUBLIC_AGENTS_URL` at the deployed agents URL.
3. **Monday automation** → webhook: "when Status changes to Approved or Revise, POST to `<deployed-url>/api/webhooks/peacock/monday?token=<MONDAY_WEBHOOK_SECRET>`" (this is the only piece that needs a public URL; the handler is already proven via replayed payloads).
4. **Cron** is in `vercel.json` (weekly Sun 06:00 → `/api/cron/peacock/author`). Smoke-test the deployed cron + webhook.

**Later (not started):** Drive/Gmail/Canva/newsletter/WhatsApp tools; the 🦁 Lion orchestrator + agent-to-agent messaging (revisit Managed Agents here); extract a shared `agent-core` package once a 2nd animal lands.

> Branch: `dev1`.
