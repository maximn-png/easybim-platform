# @easybim/agents — the Agent Kingdom hub 🦁👑

Multi-agent app. Vision: see [agent-kingdom.md](./agent-kingdom.md) — ten animal agents, the **Lion** orchestrates and routes, each animal specializes. This app is the runtime + (Phase 2) dashboard for that kingdom.

**First agent built: 🦚 Peacock** — the EasyBIM LinkedIn / content agent. Plans, drafts, and routes weekly LinkedIn posts through a Monday board, with human approval.

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
```

---

## STATUS (2026-06-26) & how to continue

**Phases 1–3: VERIFIED WORKING LIVE (2026-06-26).** The whole Peacock loop runs end-to-end against the real `EasyBIM_Posts` board, plus the Agent Kingdom dashboard and branded-image-on-approval. Only the Vercel deploy + live Monday automation remain. Type-check GREEN across all workspaces.

- ✅ **Phase 1 — author + watcher (both branches) verified live.** Author drafts 2 posts → `Pending Approval`. Watcher on `Approved` → `Ready to Publish`; on `Revise` → reads Maxim's reply feedback, rewrites shorter, → `Pending Approval`. (Items `12378837665`, `12378873327`.)
- ✅ **Phase 2 — Agent Kingdom dashboard.** Portal card → agents `/` (Kingdom, agent cards from `registry` with live status) → `/dashboard/[agentKey]` (run history from `AgentRun` + message thread from `AgentMessage`, polling). Protected via Clerk satellite (portal session carries over, no re-login). Verified in-browser end-to-end.
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
