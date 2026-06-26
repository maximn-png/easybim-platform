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

Runs on **port 3002** (portal 3000, newsletter 3001). Mirrors `apps/newsletter` conventions (app-local `lib/`, cached `connectDB`, AES-256-GCM `encryption.ts`, Clerk satellite via `proxy.ts`, routes with `runtime='nodejs'` + `maxDuration=300`).

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

**Phase 1: VERIFIED WORKING LIVE.** Author pass ran end-to-end against the real `EasyBIM_Posts` board — drafted 2 on-brand posts, set PostType + Publish Date, posted to Updates, tagged Maxim, set `Pending Approval`, and persisted the `AgentRun` to Mongo. Type-check GREEN across all workspaces.

- ✅ **Live author dry-run passed** (2026-06-26). Created items `12378837665` + `12378873327` at `Pending Approval`. The reused Monday token (from `apps/epm`) **has write scope** — items/updates/notifications/status all worked. Anthropic key + Mongo persistence confirmed.
- ✅ **`get_backlog` bug fixed.** `getItemsByStatusLabelIds` failed twice during the run (so the agent created new items instead of developing the backlog). Root cause: Monday 2024-10 GraphQL types — `column_id` must be `ID!` (was `String!`), `compare_value` must be the `CompareValue` scalar (was `[String!]!`), and label indexes must be **integers** (string indexes silently match nothing). Fixed in `lib/integrations/monday/client.ts`; verified it now returns the real Idea/Drafting backlog.
- ✅ **Type-check passes.** (Earlier zod fix: `@anthropic-ai/sdk@0.69`'s `betaZodTool` is typed against **zod v4**; app now declares `zod@^4.3.6`, deduped to `zod@4.4.3`.)
- ✅ **`apps/agents/.env.local` reconstructed** (gitignored) from sibling apps: Mongo/Clerk/Encryption/Gemini ← newsletter, Monday/Cron ← epm, Anthropic key added manually. Clerk satellite needs the absolute sign-in URLs (`NEXT_PUBLIC_CLERK_SIGN_IN_URL=http://localhost:3000/sign-in`, etc.) or the app 500s on every route.

> Local notes: Node isn't on PATH in fresh shells — prepend `C:\Program Files\nodejs`. Dev server: `npm run dev` (port 3002). `proxy.ts` (Next 16) is the active middleware; the duplicate `middleware.ts` is stale and should be removed.

**Architecture decision (2026-06-26):** build the kingdom on the **custom Next.js app (this repo)**, not Claude Cowork (desktop-only, dies when the machine sleeps — can't run unattended) and not Managed Agents (container model is overkill for API-call agents like Peacock). Revisit Managed Agents later for the 🦁 Lion orchestrator (its multiagent coordinator fits) and any future container-using agents (Owl/analytics, Octopus/support).

**Next, in order:**
1. **Test the watcher pass** — in Monday, set a draft's Status to `Approved` (or `Revise`) and `POST` the Monday webhook payload to `/api/webhooks/peacock/monday?token=<MONDAY_WEBHOOK_SECRET>`. Approved → `Ready to Publish`; Revise → reads comments, rewrites, re-posts.
2. **Monday automation** → webhook: "when Status changes to Approved or Revise, POST to `<deployed-url>/api/webhooks/peacock/monday?token=<MONDAY_WEBHOOK_SECRET>`".
3. **Vercel deploy** — create the project, set env vars, wire the weekly cron (`vercel.json`).
4. **Re-run author** once the backlog fix is live to confirm it now develops existing Idea/Drafting items instead of creating new ones.

**Phase 2:** agents dashboard UI (list from `registry`, run history/status from `AgentRun`, SSE chat from `AgentMessage`).
**Phase 3:** branded image (port `nanobana` Nano Banana template), Drive/Gmail/Canva/newsletter/WhatsApp tools, the 🦁 Lion orchestrator + agent-to-agent messaging; extract a shared `agent-core` package once a 2nd animal lands.

> Branch: `dev1`.
