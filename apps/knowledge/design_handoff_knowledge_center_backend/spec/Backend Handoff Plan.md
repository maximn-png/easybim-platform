# Knowledge Center — plan for making the front end backend-ready

The agreed order of work and the shared understanding. Keep it updated as steps complete.

## Order of work
1. **Data layer `kc-api.js`** — all storage access through one module (`KC.API.*`), with a
   localStorage stub inside. The backend replaces only the method bodies. — **DONE**
   - two transports: `Local` (current) and `Http` (skeleton), switch via `KC.API.use('http',{baseUrl})`;
   - every storage key collected in `KC.API.KEYS` and mapped to its future endpoint in the file
     header (draft input for step 4);
   - methods that are network calls by nature are already Promises: `getTree`, `getDocument`,
     `importDocument`, `applyDocumentChange`, `sendDocument`, `askMentor`, `translate`;
   - `getDocument` returns `ready | importing | not_imported | error` — screens for these in step 7;
   - moved onto the layer: role, personal documents, notebook, proposals, assignments, bookmarks,
     mentor, dictionary, translation preferences, version log, send journal;
   - the only exception is the tiny inline script in `<body>` that reads role and the translation
     flag before first paint (to avoid a flash); with a real backend this becomes a server-rendered
     attribute on `<body>`.
2. **Block contract and resilient rendering** (`Block Contract.md` + `kc-blocks.js`) — **DONE**
   - table of types (`h`/`p`/`ul`/`ol`/`callout`/`fig`) with required and optional fields;
   - `KC.Blocks.normalize(blocks)` → `{blocks, issues, fatal}`; only normalized blocks are rendered;
   - degradation: unknown type → paragraph, empty field → skipped, level outside 2–4 → clamped,
     long list → truncated, missing image → placeholder frame, broken document → error screen;
   - validation mode: a yellow "Document digested with issues: N" strip, team lead only.
   This document defines what the backend is obliged to send.
3. **Data model** (`Data Model.md`) — **DONE**
   - 17 entities: user, workspace, tree node, document, figure, personal document, notebook, change
     proposal, version log, assignment, bookmark, progress, send record, project/consultant,
     mentor thread, dictionary term, preferences;
   - each with the target record JSON **and** the current mock shape, so the mapping is explicit;
   - relationship diagram + implementation notes (documents are the source of truth, soft-delete
     proposals, indexes to add, and the places where the mock stores display strings instead of
     machine values).
4. **Endpoint list** (`API Endpoints.md`) — **DONE**
   - 10 sections (session, tree, documents, personal docs & notebook, proposals, assignments,
     bookmarks, send, mentor/translation/dictionary, admin): "UI action → method + path → response",
     with an intern/employee/team-lead permission column and the `KC.API` method behind each row
     (methods still to add are marked *new*);
   - cross-cutting rules: one seam, server-side permissions, optimistic concurrency via
     `baseVersion` → `409`, machine values not display strings, pagination, idempotency keys.
5. **Integration points** (`Integration Points.md`) — **DONE**
   - five systems: Monday (structure, inbound only, match by item id, archive-not-delete),
     Google Docs (digest once, element→block mapping table, stable anchors, images to our storage,
     validate before store), email (server-side render + signature, idempotency, no optimistic
     success), ACC/Forma (read issues for context, deep-link hand-off, always journalled),
     AI (mentor with KB priority + citations as node ids; translation cached per document × language,
     anchors preserved for scroll sync);
   - per system: direction, what goes out, what must come back, failure behaviour, code seam;
   - the front end never calls an external system directly — everything goes through our backend;
   - recommended wiring order: Google Docs → Monday → AI → email → Forma.
6. **Roles and permissions** (`Roles and Permissions.md`) — **DONE**
   - capability matrix (reading / learning / personal workspace / contributing / review & management /
     administration) for intern · employee · team lead;
   - ownership rules that override role: a team lead sees an intern's progress, never their notebook,
     notes or mentor chats;
   - how roles are implemented in one codebase (`ROLES` table + `body.role-*` CSS, no forked files);
   - what production must add: role from identity not storage, server-side enforcement of every row,
     one gate in `KC.switchRole`, ownership checks returning `403`, audit trail, multiple team leads.
7. **UI states** (`UI States.md` + `kc-states.js`) — **DONE**
   - `KC.States.*` builders: `loading` (page-shaped skeleton), `importing` (progress + poll),
     `notImported` (import / open original), `error`, `empty`, `noAccess`, `conflict` (409 banner);
   - **wired for real**: `openDocPage` now goes through `KC.API.getDocument`, so the four document
     statuses render instead of being hypothetical;
   - documented copy for every empty state per list, the optimistic-autosave caveat, long-running
     work patterns, and a wiring checklist (every list can be empty, every mutation can 403/409);
   - preview any state during review: `KC.States.demo('importing')`.

All seven steps are complete. The front end is ready to hand over: one data seam, a validated content
contract, the data model, the endpoint list, the integration map, the role matrix, and the states.

## Shared understanding (agreed)

### Column 1 — Tree (Contents)
- One-way structure sync from the **Monday "Knowledge Center"** workspace: boards/groups/items →
  tree nodes. Monday stays the source of truth for structure; we never write back.
- A Monday item that links to a Google Doc carries that doc's id as node metadata (today this is
  `doc:"project-startup"` in the mockup).
- On top of that sit the user's **personal folders and files**; they live only in our database and
  never reach Monday.
- The "⋯" menu is the shared control surface: download, send, bookmark, "suggest to Knowledge
  Center", assign to an intern (team lead), and so on.

### Column 2 — Textbook and "digesting" a document
The understanding is correct, with one clarification: **the backend digests, the front end only asks.**

1. The user picks a node in the tree → the front end requests the document by `source_doc_id`.
2. The backend checks its own database:
   - **already there** → returns our block JSON immediately (no re-digesting);
   - **not there** → reads the Google Doc through the Docs API, converts it into our block format
     (`dp-h` / `dp-p` / `dp-list` / `dp-callout` / `fig`), **stores it as its own record in the root
     Knowledge Center database**, and returns it.
3. From then on the app works **only with that copy**: reading, edits, versions, bookmarks,
   translation, export. The original in Google Drive is never modified; there is no two-way sync.
4. Over time every document is migrated this way, and the old Google-Drive centre becomes a
   read-only archive.

**What this requires from the front end (this is what we are building):**
- a single method for fetching a document, `KC.API.getDocument(sourceId)` — the front end does not
  care whether it came from cache or was digested just now;
- states: `ready` (render), `importing` (a "document is being prepared" indicator),
  `not_imported` ("Import into Knowledge Center" button / link to the original), `error`;
- the document `version` in the response — to detect a conflict when two people edit the same thing;
- images arrive as links into our storage, not base64.

The converter itself is not embedded in the front end — it lives on the backend. The front end
carries the **reference block model** (how each block type renders), which is the converter's
specification, formalised in `Block Contract.md` (step 2). The front end does not trust the data:
it validates against the contract and degrades gracefully instead of crashing.
