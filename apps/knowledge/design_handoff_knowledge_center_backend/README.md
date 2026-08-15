# Task: build the backend for the EasyBIM Knowledge Center

You are Claude Code. This bundle contains a **finished, working frontend** and a **complete
written specification** for the backend that has to sit under it. Your job is to build that
backend and connect it — not to redesign, restyle, or rewrite the frontend.

Read this file first, in full, then `PRD.md`, before touching anything.

**Release 1 ships the Employee role only** — no Onboarding role, no Team Lead console, no
progress tracking, no assignments — but *with* all the real external connections and a real AI
mentor. See `PRD.md` for the exact scope split and section 5 below for the phases.

---

## 0. Ground rules

1. **The frontend is done. Do not redesign it.** No restyling, no component rewrites, no
   framework migration, no "improvements" to layout or copy. If you believe a UI change is
   required to make something work, **stop and ask** instead of doing it.
2. **There is exactly one place where the frontend talks to data: `frontend/kc-api.js`.**
   Everything else in the app goes through `KC.API.*`. Your integration work happens there
   and in the backend you write. If you find yourself editing `kc-app.js`, `kc-teamlead.js`,
   `kc-suggest.js`, `kc-send.js` or `kc-docpage.js` to make data flow, you have taken a wrong
   turn — go back to the seam.
3. **The spec is authoritative.** Where this README and `spec/` disagree, `spec/` wins.
   Where the spec is silent, ask rather than invent.
4. **English only** in code, comments, filenames, commits and docs. User-facing UI copy is
   localized (currently Russian, with Hebrew document content) — leave those strings alone.
5. **Work in phases** (section 5). Finish and verify a phase before starting the next one.
   Do not attempt the whole thing in one pass.

---

## 1. What the product is

An internal learning and documentation platform for EasyBIM (a BIM/MEP engineering practice).
Three workspaces — Logistics & Administration, BIM Methodology & Tools, EasyBIM Teams — each
rendered as five resizable columns:

| Column | Name | Purpose |
|---|---|---|
| c1 | Plan | Content tree: table of contents, progress, assignments |
| c2 | Textbook | Reading column: official documents and the user's own documents |
| ctr | Translation | Side-by-side translation drawer (RU / EN / HE) |
| c3 | Notebook | Free-form personal notes, autosaved |
| c4 | Mentor | AI tutor chat, dictionary, study tools |

Three roles live in **one codebase**, switched by a flag rather than by forking:
`intern` (labeled "Onboarding" in the UI — never rename the key), `employee`, `teamlead`.
The team lead additionally gets a docked management console: content-review queue, team
progress, topic assignment.

Open `frontend/EasyBIM Knowledge Center.html` in a browser and use it before you write
anything. It runs fully on mock data. Switch roles from the dropdown in the cabinet header
(top right) to see all three views.

---

## 2. What is in this bundle

```
PRD.md       The product spec: what ships in Release 1, what waits for Release 2.
PROMPT.md    The kickoff prompt and the session-by-session order (for the human).
frontend/    The complete working frontend. Static files, no build step.
             Entry point: EasyBIM Knowledge Center.html
             kc-api.js  ← the seam. Your integration point.
spec/        The specification set. Read in the order given in section 3.
```

The app becomes a new application inside the existing **`easybim-platform` Turborepo**
(Next.js, pnpm), signed in through the existing **Portal** identity. Do not build a second
authentication system.

`frontend/` is **production frontend code**, not a throwaway mockup — it is intended to ship
as-is, backed by your API. It is deliberately vanilla JS on the EasyBIM CSS tokens; there is
no React bundle and none should be introduced.

---

## 3. Reading order for the spec

1. **`spec/Data Model.md`** — 17 entities. For each: the target record JSON *and* the current
   mock shape, plus a relationship diagram. Design the schema from this.
2. **`spec/API Endpoints.md`** — every UI action → HTTP method + path → response, with a
   permission column (intern / employee / lead) and the `KC.API` method it backs. Also the
   cross-cutting rules: one seam, server-side permission checks, `baseVersion` → `409`
   concurrency, pagination, idempotency. **This is your contract. Implement it as written.**
3. **`spec/Block Contract.md`** — the content-block format the Textbook renders
   (`h` / `p` / `ul` / `ol` / `callout` / `fig`) and how the UI degrades on malformed data.
   Anything you store as document content must satisfy this. `frontend/kc-blocks.js` is the
   client-side validator; mirror its rules server-side.
4. **`spec/UI States.md`** — loading / importing / not_imported / error / empty / no-access /
   conflict. The four document statuses are already wired through `KC.API.getDocument`, so
   returning the correct status string is enough to drive the UI.
5. **`spec/Roles and Permissions.md`** — capability matrix, plus ownership rules that override
   role (a lead sees progress but must never see notebooks, notes, or mentor chats), and the
   production checklist.
6. **`spec/Integration Points.md`** — Monday, Google Docs, email, ACC/Forma, AI: direction,
   payloads, failure behaviour, code seam, recommended wiring order.
7. **`spec/Frontend Architecture (CLAUDE).md`** — module-by-module description of the
   frontend. Reference material: consult it when you need to understand *why* the UI asks for
   something. Not required end-to-end reading.
8. **`spec/Backend Handoff Plan.md`** — the plan the above came out of. Index only.

---

## 4. Content architecture — the decisions that are already made

Do not relitigate these. They were decided deliberately.

- **Structure syncs one-way from Monday.com.** The "Knowledge Center" workspace
  (boards/groups → tree nodes) is the source of truth for the *tree*. We never write back to
  Monday. Each item that links to a Google Doc carries that doc's id as node metadata — the
  role that `doc:"project-startup"` plays in `kc-data.js` today, with a real Doc id.
- **Document content is digested once, not synced live.** A converter reads a Google Doc via
  the Docs API (structured paragraphs / headings / lists / images — *not* a flat export) and
  maps it onto the block model in `spec/Block Contract.md`. **The digested copy is stored as
  our own record** and from then on is the only thing the app reads or writes: rendering,
  suggestions, approvals, versions, bookmarks, translation, export. The original Doc in Drive
  is left untouched. **Two-way sync is explicitly out of scope** — do not build it.
- **Migration is gradual, per document.** Topics that have not been digested keep the
  placeholder / link-out behaviour that already exists in the UI. Over time the old
  Drive-based center becomes a read-only archive.

---

## 5. Phases

Complete each phase, verify it against its acceptance criteria, then **stop and report** before
starting the next one. Do not attempt several phases in one pass.

### R1.0 — Setup
Propose the stack and the project structure inside the monorepo, and get agreement **before
writing code**. Then scaffold: the schema from `spec/Data Model.md`, migrations, and a seed
script reproducing the current mock data so the app looks identical when pointed at the real
backend.
*Done when:* the schema exists, migrations run, seed loads, one health endpoint responds.

### R1.1 — Identity
Authentication through the existing Portal. Every authenticated user gets the **Employee**
role; the role comes from identity, never from `localStorage.kc_role`. Hide the role switcher.
Every endpoint from here on enforces permissions **server-side** per
`spec/Roles and Permissions.md`.
*Done when:* a Portal user lands in the Employee UI with no client-side role flag involved, and
a request for another user's notebook returns `403`.

### R1.2 — Tree
`GET /tree` served from the Monday sync. Build the sync job (scheduled + manual trigger),
one-way, idempotent. Never write to Monday.
*Done when:* the Plan column in all three workspaces renders from the API, and a change made in
Monday appears after a sync run.

### R1.3 — Documents (the critical path)
`GET /documents/:sourceId` returning `ready | importing | not_imported | error` plus normalized
blocks, and the Google Docs digest job behind it. Validate every stored block against the
contract server-side. Include the figure pipeline (Docs images → stored assets → `fig` blocks).
A topic with no digested document keeps the existing link-out behaviour.
*Done when:* the Project Startup document renders through the real API identically to today,
all four statuses can be produced on demand, and **the hardest real document** (Hebrew RTL,
many figures) digests with zero contract warnings. Validate against that one early — not the
easiest one.

### R1.4 — Personal state
Notebooks, personal documents, bookmarks, dictionary, preferences, resume position. Per-user
rows; keep the existing debounced autosave UX exactly as it behaves now.
*Done when:* nothing writes to `localStorage` any more, and all personal state survives a
different browser on a different machine.

### R1.5 — AI
Mentor and translation. The mentor answers **from the digested documents first** — retrieval
across the whole knowledge base, with clickable links to the source topic — and falls back to
the open web only when the base has nothing, labeling that clearly in the answer. Two modes
(topic-bound and free assistant), history per topic. Translation RU / EN / HE per document,
cached.
*Done when:* the mentor answers a real question about EasyBIM methodology citing the right
topic, and a real document translates into Hebrew well enough to work from.

### R1.6 — Sending
Email send with the document attached, the ACC/Forma hand-off (show the project's open issues
for context, open Forma in a new tab — do **not** rebuild the Autodesk UI), and the send log.
*Done when:* a real email leaves the system with its attachment and one Forma hand-off is made
and logged.

### R1.7 — Suggestion capture
Store proposals (`edit` / `add` / `new`) and show the author their own as pending. **No review
console in Release 1** — the product owner gets one read-only page listing everything that has
come in. Proposals accumulate for Release 2.
*Done when:* a proposal submitted by one user is visible in that list and survives a reload.

---

### Release 2 — do not start without explicit instruction

Team Lead role and review console (approvals, version log fed by approvals, tree markers) →
Onboarding role and progress → assignments and notifications → quiz and flashcards → team view.

Release 2 is additive and reopens none of the Release 1 decisions. Approving an edit must
update the stored document record itself, so every later read — including exports — reflects
it; implement `baseVersion` → `409` then (the conflict UI already exists in `kc-states.js`).

---

## 6. Known gaps in the current frontend

Deliberate, and listed so you do not mistake them for bugs:

- Auth is not implemented; role comes from local state and switching is free.
- Email sending and Forma posting are mocked; attempts are written to a local log.
- Mentor answers and translation are canned content.
- The Notebook is a hand-rolled `contenteditable`. **If a genuinely robust rich-text editor is
  needed, propose replacing it with Tiptap/ProseMirror — do not attempt to harden the current
  implementation.** This is the one frontend change that is pre-approved to *propose*, and it
  still needs a yes before you start.
- Not built anywhere: threaded comments on a single proposal, suggestions on personal
  documents, byline carry-through on nodes published from a suggestion, per-version diff view.
  Treat these as out of scope unless asked.

---

## 7. How to verify your work

The frontend is the test harness. For each phase, point `kc-api.js` at your backend
(`KC.API.use('http', { baseUrl })`), open the app, and exercise the flows as an Employee
(all three roles, once Release 2 lands).
Nothing in the UI should look or behave differently from the mock version except that data now
persists across browsers and users. Any visual difference is a bug in your integration, not a
prompt to adjust the UI.

Write tests for the API contract itself — permission matrix and the `409` path especially,
since those are the parts the UI cannot exercise casually.
