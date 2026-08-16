# @easybim/agents — the Agent Kingdom hub 🦁👑

Multi-agent app. Vision: see [agent-kingdom.md](./agent-kingdom.md) — ten animal agents, the **Lion** orchestrates and routes, each animal specializes. This app is the runtime + (Phase 2) dashboard for that kingdom.

**First agent built: 🦚 Peacock** — the EasyBIM LinkedIn / content agent. Plans and drafts weekly LinkedIn posts, pulls project + marketing material from Google Drive, and tracks a **content plan on the web dashboard**. Maxim reviews in the dashboard and publishes to LinkedIn manually.

> **✅ Migrated off Monday (2026-07-29).** Peacock no longer uses the Monday `EasyBIM_Posts` board — the whole board was imported into the platform and `lib/agents/peacock/board.ts` is deleted. Posts live in the local `peacock_posts` store (`lib/models/PeacockPost.ts`) exposed via `/api/dashboard/peacock/posts`. The landing page is a **dashboard** (`app/dashboard/[agentKey]/PeacockDashboard.tsx`, gated by `hasDashboard` in `presentation.ts`) with **Posts & Timeline**, **Project Status** and **Ask Peacock**. Chat/author tools are Drive + content-plan based (`lib/agents/peacock/{drive,driveTools,posts,postChat,tools,chat}.ts`). The sections below marked "Monday" describe the **old** flow and are superseded — the only Monday remnant is the no-op webhook at `app/api/webhooks/peacock/monday/route.ts`, kept so a still-configured Monday automation gets a clean 200; **delete the automation in Monday, then delete that route.** Still pending: LinkedIn analytics (Impressions / engagement are "Connect LinkedIn" placeholders), newsletter link.

### Posts & Timeline (the planning surface, 2026-07-29)

`app/dashboard/[agentKey]/PostsBoard.tsx` — a full-width split view replacing the Monday board: **list left, Gantt right**, sharing `ROW_H`/`HEADER_H` so each row lines up with its bar.
- **List** mirrors the board's columns: Item (+ thread bubble with message count), Owner (Clerk avatar, `/api/dashboard/peacock/users`), Status, Publish Date (red flag when overdue), PostType — all inline-editable, plus `Add item`.
- **Gantt** spans the planning horizon (1/2/3 months, default 2) in day columns, **starting one week in the past** so slipped posts stay visible; Fri/Sat shaded, today line, bars colored by status with a ◆ at the publish day. **Drag a bar** to reschedule (`PATCH { shiftDays }` → `shiftPostDates`, window length preserved); **drag its left edge** to resize the drafting window (clamped at the publish day). A dated post outside the window gets a clickable off-range chip instead of an empty row.
- **Scope tabs** — `Active plan` (default) / `Archive` / `All`. Needed because the import brought 154 published posts; the list is fetched **slim** (no bodies) and the drawer loads the full draft on open.
- **Status set** = the board's 8 labels: `idea → drafting → pending_approval → approved → ready_to_publish → scheduled → published`, plus `revise`. The author cron hands off at `pending_approval`; `approved`/`ready_to_publish`/`scheduled` are Maxim's calls and `published` is always manual.
- Every post has a `draftStartDate` (default `publishDate − 4d`, `DRAFT_WINDOW_DAYS`) — that's the bar's left edge. `updatePost` keeps it attached to `publishDate` unless the patch sets it explicitly.

**Per-post chat = Monday's Updates column, in-platform.** `AgentConversation.postId` pins a thread to one post (excluded from the personal chat sidebar; shared with the team). `PostDrawer.tsx` puts the draft (Preview/HTML, `Copy for LinkedIn`) beside that thread; `lib/agents/peacock/postChat.ts` builds a system prompt containing the **live draft** and binds every tool to that post (`update_draft`, `read_draft`, `generate_image`, `list_posts`, Drive tools, `save_guidance`) — so "תקצר את זה" edits the right post and the editor shows the rewrite when the turn returns. Route: `/api/dashboard/peacock/posts/[postId]/chat`, which returns the reply **and** the post as it now stands.

### LinkedIn analytics (2026-07-29)

The Impressions card and the engagement column are real now, fed by whichever of three sources exists:

| Source | Needs | Status |
|---|---|---|
| **Paste the page export** | nothing | works today — `Import` on the Impressions card |
| **Type a post's numbers** | nothing | works today — Performance row in the post drawer |
| **Live API sync** | a LinkedIn app + LinkedIn's approval | wired, unverified (see below) |

- `lib/agents/peacock/analytics.ts` — weekly series, 30-day summary, top posts. Page-level daily rows (`peacock_linkedin_daily`) are the primary source; a week with no page data **falls back to summing that week's per-post metrics**, so typing numbers into a few posts is enough to make the chart real. Week buckets are keyed by **local** YYYY-MM-DD (`localDayKey`) — never `toISOString()`, since local midnight in Israel is the previous day in UTC.
- `lib/agents/peacock/analyticsImport.ts` — the export parser, deliberately pure and DB-free so it is directly testable. Finds the header row under LinkedIn's title/date-range preamble, matches columns by name (English **and** Hebrew), tolerates CSV or a spreadsheet paste, `1,204` thousands separators, and day-first `01/07/2026`. Covered by `analytics-import.test.mjs` — **26 assertions, run `node .\analytics-import.test.mjs`** (it compiles the real module, not a copy).
- `PeacockAnalytics.tsx` — the chart is columns, one series, **no legend** (the title names it) and **no dual axis**: engagements live in the tooltip and the summary line, never a second y-scale. `#7b5cff` was checked with the dataviz palette validator (lightness band / chroma floor / ≥3:1 contrast all pass on white). Values are never tooltip-gated — there is a table-view twin, and the peak + latest columns are directly labelled.
- Per-post metrics are embedded on the post (`metrics`), since one post is one share. `source` records whether a number was typed, imported, or synced; the sync overwrites manual entries.

**Connecting LinkedIn (the part that needs you).** Nothing here is done — EasyBIM has no LinkedIn developer app, so `lib/integrations/linkedin/client.ts` is written from the documented contract but **has never been executed**. Expect the response field names to need one correction on the first real call; they're all funnelled through `rest()` and small mappers so it's a single-place fix.

1. Create an app at <https://www.linkedin.com/developers/apps> owned by the **EasyBIM company page**, and verify the page association.
2. Request the **Community Management API** product. This is an application reviewed by LinkedIn (days, sometimes weeks) — the `r_organization_social` / `rw_organization_admin` scopes are not self-serve. Everything below stays inert until it's granted.
3. Add the callback URL exactly: `<agents-url>/api/dashboard/peacock/linkedin/callback` (locally `http://localhost:3003/...`).
4. Set `LINKEDIN_CLIENT_ID` + `LINKEDIN_CLIENT_SECRET` in `.env.local` (and Vercel). The dashboard shows `Connect LinkedIn` only once these exist; before that it says so plainly instead of offering a button that fails.
5. Click **Connect LinkedIn**, approve as page admin. Tokens are stored AES-256-GCM encrypted (`peacock_linkedin_account`, via `lib/utils/encryption.ts`); only non-secret display fields ever reach the browser.
6. The daily cron `/api/cron/peacock/linkedin` (04:00, in `vercel.json`) then pulls page day-stats + per-post lifetime stats. It **no-ops with 200 when not connected**, so it's safe to leave scheduled. `shareUrnFromUrl` maps a pasted post URL to its share URN, so per-post sync needs the LinkedIn URL filled in.

### Newsletter → post ideas (2026-07-29)

The BIM newsletter (`apps/newsletter`, 21 issues of ~7 RSS-sourced topics) is now Peacock's idea source for **"1. Professional"** posts, so thought leadership starts from something real with a citable source.

- `lib/agents/peacock/newsletter.ts` reads the `bim-newsletter` DB cross-DB (same pattern as `projects.ts` for EPM). ⚠️ **Two constraints, both learned the hard way from the live collection (21 docs, ~8MB each, 165MB total):** sort by **`_id`, never `date`** — the only indexes are `_id` and `{userId,date}`, so a bare `date` sort is an in-memory sort of the whole collection and Mongo aborts it (`QueryExceededMemoryLimitNoDiskUseAllowed`); and project the **four named topic subfields, never `topics: 1`** — topics carry `imageBase64`, so `topics: 1` is ~8MB per doc versus ~32KB for four whole issues.
- Tools: `list_newsletter_topics`, `read_newsletter_topic`, `list_newsletter_issues` — in the author cron, the advisor chat and every post thread. `brand.ts` points the Professional pillar at them before asking Maxim for a subject.
- `NewsletterIdeas.tsx` on the dashboard lists recent topics with the source, and **Draft post** seeds a `1. Professional` post from a topic and opens it in the drawer. `sourceUrl` is stored on the post, so a topic already used is marked **used** and won't be posted twice.

**The one-off import:** `migrate-peacock-posts.mjs` (idempotent via `mondayItemId`; `--dry-run` supported). Resolves the board's columns by title, maps the 8 statuses, matches owners to Clerk users by name/email, derives each draft body from the newest long update, and replays the Updates threads (updates ≥300 chars = Peacock's draft → `assistant`; shorter ones and replies → `user`). It also normalizes legacy `ready` → `ready_to_publish` and backfills missing `draftStartDate`. Verified live: **165 posts, 103 threads, 286 messages** (154 published archive, 10 pending approval, 1 idea).

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
# 🦚 LinkedIn analytics (optional — the dashboard runs on imports/manual entry without these).
# Needs a LinkedIn app with the Community Management API product approved; see "Connecting LinkedIn".
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
NEXT_PUBLIC_AGENTS_URL=        # this app's own base URL — the OAuth callback is built from it
# shared with the portal, used for the dashboard's Newsletter link:
NEXT_PUBLIC_NEWSLETTER_URL=http://localhost:3001
# 🐿️ Squirrel (price quotes) — Google Drive/Sheets + SheetCopier:
GOOGLE_SERVICE_ACCOUNT_JSON=   # base64 (or raw JSON) of the Finance service_account.json
SHEET_COPIER_URL=              # SheetCopier.gs /exec web-app URL (from the PriceQuotes config.json)
SHEET_COPIER_SECRET=           # matching SheetCopier secret
# Work-plan templates — Price Quotes/001 - Templates & Standards/02 - PQ Templates
PQ_TEMPLATE_SHEET_ID=1z67wf1VuUszAAGriGY6xiSFZod7jCub0y7nbOigIyg0    # Type C  → "TYPE C_EasyBIM - תכנון עבודה"
PQ_TEMPLATE_SHEET_A_ID=1sJZNxFu9d9hDignfgMs-1_TKZQtD4pVvpXepionpnlU  # A/A.1/A.2 → "A-PlannedWork Template"
PQ_DRIVE_NAME=Finance
PQ_CLIENTS_ROOT=Clients
# MONDAY_API_TOKEN (write scope) is reused for the board writes AND written into each project's _meta sheet.
```

---

## STATUS (2026-07-29) & how to continue

**Peacock is fully off Monday and plans in-platform (2026-07-29).** Posts, statuses, owners, publish dates and the Updates discussions were imported from `EasyBIM_Posts` into the local store; planning happens on **Posts & Timeline** (list + draggable 2-month Gantt) and each post carries its own Peacock thread. Build + type-check GREEN; import verified live (165 posts / 103 threads / 286 messages) and the timeline geometry checked against the real dates.

The phase notes below are the earlier Monday-based history, kept for context — the Monday specifics in them no longer apply.

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

**Next, in order (Peacock):**
1. **Browse `/dashboard/peacock` → Posts & Timeline** signed in, and check the 11 active posts + the archive tab against what the board used to show. The Monday-era statuses/dates/owners/threads are all imported (see the import section above).
2. **Delete the Monday automation** on `EasyBIM_Posts` ("Status → Approved/Revise → POST …/webhooks/peacock/monday"), then delete `app/api/webhooks/peacock/monday/route.ts`. That's the last Monday touchpoint for Peacock. (`MONDAY_API_TOKEN` stays — Squirrel and EPM use it, and the import script needs it if re-run.)
3. **Author cron** — `vercel.json` weekly Sun 06:00 → `/api/cron/peacock/author`. It now writes into the local plan and hands off at `pending_approval`, and prioritizes `revise` posts. Worth one manual run to confirm against the imported plan.
4. **Vercel deploy** for `apps/agents` (root dir `apps/agents`). Env: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `MONDAY_API_TOKEN`, `CRON_SECRET`, `MONGODB_URI`, `ENCRYPTION_SECRET`, Clerk (`NEXT_PUBLIC_CLERK_*`, `CLERK_SECRET_KEY`) with the **production** satellite domain + `NEXT_PUBLIC_PORTAL_URL`. Then point the portal card's `NEXT_PUBLIC_AGENTS_URL` at it.
5. **LinkedIn API access** — the analytics cards are real and fed by import/manual entry; the only missing piece is the live sync, which needs the developer app + LinkedIn's approval (steps in "Connecting LinkedIn" above). Until then, paste the page export.

**Later (not started):** Gmail/Canva/newsletter/WhatsApp tools; the 🦁 Lion orchestrator + agent-to-agent messaging (revisit Managed Agents here); extract a shared `agent-core` package.

> Branch: `feature/maxim-desktop`.
