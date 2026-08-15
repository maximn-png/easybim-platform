# Knowledge Center — Integration Points (step 5)

Five external systems the app depends on. For each: what it is used for, direction of data flow,
what goes out, what must come back, failure behaviour, and where it plugs into the code.

Entity shapes: `Data Model.md`. Calls: `API Endpoints.md`. Front-end seam: `kc-api.js`.

---

## Summary

| # | System | Purpose | Direction | Owner of truth |
|---|---|---|---|---|
| 1 | Monday.com | tree structure (boards → nodes) | inbound only | Monday |
| 2 | Google Docs / Drive | source content, digested once | inbound only | our DB after digest |
| 3 | Email (SMTP / MS Graph) | send a document to a consultant | outbound | mail system |
| 4 | Autodesk ACC / Forma | issue context + hand-off | inbound read, outbound link | Autodesk |
| 5 | AI provider | mentor answers, translation | outbound request | — (stateless) |

Rule that applies to all five: **the front end never talks to these systems directly.** Every one is
called by our backend, and the front end only sees our own endpoints. This keeps tokens server-side
and lets us cache, retry and degrade in one place.

---

## 1. Monday.com — structure sync

**Purpose.** The Plan tree (column 1) mirrors the Monday "Knowledge Center" workspace:
boards/groups/items → tree nodes.

**Direction.** One-way, inbound. We never write back to Monday — not even titles.

**Out.** A scheduled job (and a manual `POST /admin/sync/monday`) queries the Monday GraphQL API for
the workspace: boards → groups → items, with each item's link column.

**Back (per item).**

| Monday field | Our field | Notes |
|---|---|---|
| board / group / item hierarchy | `parentId`, `order` | order preserved from Monday |
| item name | `title` | |
| item id | `mondayItemId` | provenance, used to match on re-sync |
| Google Doc link column | `sourceDocId` | id extracted from the URL; absent → topic without a document |

**Matching rule.** Match by `mondayItemId`, not by title — titles change. A node whose Monday item
disappeared is **archived, not deleted** (assignments, bookmarks and proposals may reference it).

**Personal nodes** (`origin:"personal"`) are ours only; the sync must never touch or reorder them.

**Failure.** Sync failure is invisible to users: the last successful tree stays served. Log the
failure and surface it in the admin issues view. Never serve a half-synced tree — write the new tree
in one transaction.

**Front end.** `KC.API.getTree()` — today resolves `window.KC_TREE` from `kc-data.js`.

---

## 2. Google Docs — content digest

**Purpose.** Turn a source Google Doc into our block model, once, and store it as our own document
record. This is the core of the migration: over time the Drive-based centre becomes a read-only
archive.

**Direction.** One-way, inbound. The original in Drive is never modified. Two-way sync is explicitly
ruled out as too risky.

**Trigger.** `GET /documents/:sourceDocId` finds no stored copy → returns `not_imported`; the user
(employee or team lead) presses "Import into Knowledge Center" → `POST …/import` runs the converter.
Re-digesting an existing document is explicit only (`/redigest`) and warns that stored edits are lost.

**Out.** Docs API `documents.get` — the **structured** document (paragraphs, headings, lists,
inline images), not a flat text or HTML export.

**Back → our blocks** (see `Block Contract.md`):

| Google Docs element | Our block |
|---|---|
| Heading 1–3 (+ numbering) | `{t:'h', lvl:2–5, num, anchor}` |
| normal paragraph | `{t:'p', txt, sub}` |
| bulleted / numbered list | `{t:'ul' / 'ol', items[]}` |
| highlighted note paragraph | `{t:'callout', txt}` |
| inline image + caption paragraph | `{t:'fig', id, cap}` — image uploaded to our storage, block keeps only the id |
| table, deep nesting, arbitrary styling | not in the contract → reduce, or extend the contract and bump its version |

**Rules.**
- Anchors are generated per section (`sec-1` … `sec-n`) and must be stable across re-digests — the
  version log and the TOC link to them.
- Images are downloaded and stored by us; never embed base64 in a document record.
- The digest result is validated against the contract before it is stored. Issues are recorded and
  shown to the team lead as "Document digested with issues: N".
- Store `contractVersion` on the document so a future contract change can be migrated deliberately.

**Failure.** No access / doc deleted → document `status:"error"` with a message and a link to the
original; the app shows the error screen instead of a blank page. Import in flight → `importing`
with progress, the UI polls.

**Front end.** `KC.API.getDocument`, `KC.API.importDocument`; rendering through `KC.Blocks.normalize`
→ `KC.DocPage`.

---

## 3. Email — send a document

**Purpose.** The Send wizard's "Email a consultant" route.

**Direction.** Outbound.

**Out.** `POST /sends` with `{documentId, projectCode, recipients[], subject, body}`. The backend
renders the document to a self-contained web page (the same output as Download → Web page), attaches
it, and sends via SMTP or Microsoft Graph under the company mailbox.

**Back.** A send record (`Data Model.md` §13) with `status: sent | failed`, plus the message id from
the provider for traceability.

**Rules.**
- Subject defaults to `[PROJECT CODE] Document title`; the standard EasyBIM signature is appended
  server-side, not composed in the browser.
- One project per send; the project name is locked into the subject.
- Personal artefacts (bookmarks, sticky notes) are stripped from the attachment.
- `Idempotency-Key` required — a double click must not send twice.

**Failure.** Bad address / provider rejection → the record is stored with `failed` and the reason,
and the wizard shows it on the final step. Never report success optimistically.

**Front end.** `KC.API.sendDocument`; journal via `KC.API.getSendLog`.

---

## 4. Autodesk ACC / Forma — issue hand-off

**Purpose.** Route a document into the project's coordination flow without rebuilding Autodesk's UI.
We show the project's recent open issues for context and hand the user over to Forma, where the
comment is written natively.

**Direction.** Inbound read (issues, ACC folder availability) + outbound deep link. We do not post
comments through the API.

**Out / back.**

| Need | Call | Back |
|---|---|---|
| does the project have an ACC folder | platform base / ACC API | `acc: true/false`, `accAlert` |
| recent open issues | ACC Issues API | `{id, type, status, discipline, placement, title}` |
| hand-off | `window.open(accUrl)` in a new tab | — |

**Rules.**
- The ACC route is disabled for a project with `acc:false` (the wizard already reflects this).
- Every hand-off is recorded in our send journal (`channel:"acc"`, with the issue id when one was
  picked), so the trail exists even though the comment lives in Forma.
- Issues are cached briefly (minutes) — this is context, not a live board.

**Failure.** Issues unavailable → show the hand-off button without the context list rather than
blocking the route.

**Front end.** `KC.Send` (project/issue data seeded in `kc-send.js` today), journal via `KC.API`.

---

## 5. AI provider — mentor and translation

**Purpose.** Two separate features on one integration: the Mentor chat (topic tutor and free
assistant modes) and document/fragment translation (RU / EN / HE).

**Direction.** Outbound request per action; no state at the provider.

### Mentor

**Out.** `POST /mentor/ask` `{mode, nodeId, question}`. The backend builds the prompt: the current
topic's blocks as context, plus retrieval over the Knowledge Center corpus.

**Back.** `{answer, citations:[{nodeId, title, anchor}]}`.

**Rules.**
- **EasyBIM's own knowledge base takes priority over the web** — this was an explicit requirement.
- `citations` must carry `nodeId`s so the UI renders them as clickable topic links.
- Topic threads are bound to a node; the assistant thread is free. Both are stored per user
  (`Data Model.md` §15) — history is ours, not the provider's.
- Never send personal notes, notebooks or bookmarks as context without the user asking.

### Translation

**Out.** `POST /translate` `{documentId | text, lang}`.

**Back.** For a document: blocks in the target language, in the same order and with the same anchors
(the scroll sync pairs headings by anchor and section number — it breaks if those are not preserved).
For a fragment: plain text.

**Rules.**
- Cache per `documentId × lang` and invalidate when `document.version` changes; do not re-translate
  on every open.
- Hebrew is rendered RTL by the UI — the API returns text only, no markup.

**Failure.** Provider unavailable → mentor shows "the assistant is unavailable, try again";
translation falls back to the last cached version, or an explicit empty state. Neither blocks reading.

**Front end.** `KC.API.askMentor`, `KC.API.translate` (mock: canned answers and a pre-translated
document in `KC.TR_DOC`).

---

## What is mocked today (nothing here is wired yet)

| Integration | Mock stand-in |
|---|---|
| Monday | `window.KC_TREE` in `kc-data.js` |
| Google Docs | one manually mapped document, `KC.DocPage.data` |
| Email | send wizard + `kc_send_log`, no delivery |
| ACC / Forma | seeded projects and issues in `kc-send.js`, real deep links |
| AI | scripted mentor replies, hand-written RU/EN/HE translation of one section |

Order of wiring we recommend: **2 (Google Docs) → 1 (Monday) → 5 (AI) → 3 (email) → 4 (Forma)**.
Content is what makes the platform useful; structure without content is an empty tree, and the
remaining three are conveniences on top.
