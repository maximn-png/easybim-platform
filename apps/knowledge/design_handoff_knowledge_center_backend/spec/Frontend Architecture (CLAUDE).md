# EasyBIM Knowledge Center — project state & handoff

Interactive mockup of EasyBIM's internal **learning platform** ("Knowledge Center"). Re-skinned
from a generic mockup into EasyBIM's brand and iterated heavily. This file is the source of truth
for a fresh chat — read it before changing anything, and keep it updated as decisions are made.

## Files
- **`kc-api.js`** — DATA LAYER (step 1 of the handoff plan, BUILT). The only place that talks to
  storage: `KC.API.*` with a `Local` (localStorage) and an `Http` (skeleton) transport, all keys in
  `KC.API.KEYS`, a key→endpoint map in the file header, and Promise-based methods for what will be
  network calls (`getTree`, `getDocument` → `ready|importing|not_imported|error`, `importDocument`,
  `applyDocumentChange`, `sendDocument`, `askMentor`, `translate`). Loaded FIRST, before kc-data.js.
  No other file may call `localStorage` directly — the only exception is the inline pre-render
  script in `<body>` that reads role + translation flag to avoid a flash.
- **`kc-states.js`** — UI STATES (step 7, BUILT). `KC.States.*` builders — `loading` (page-shaped
  skeleton), `importing` (progress + Check again), `notImported` (Import into KC / open original),
  `error`, `empty(title,sub,icon)`, `noAccess`, `conflict(container,who)` (amber 409 banner) — plus
  `paint(el,html)` and `demo(name)` for design review. Own `.kcs-*` CSS, injected once. `openDocPage`
  in kc-app.js routes through `KC.API.getDocument`, so the four document statuses are live. Spec:
  **`UI States.md`** (also carries the per-list empty-state copy that is not wired yet).
- **`kc-blocks.js`** — BLOCK CONTRACT + resilient rendering (step 2, BUILT). `KC.Blocks.normalize(blocks)`
  → `{blocks, issues, fatal}`; only normalized blocks are rendered. Types `h`(lvl 2–4)/`p`/`ul`/`ol`/
  `callout`/`fig`; degradation: unknown type → paragraph, empty required field → dropped, level clamped,
  long list truncated, bad anchor ignored, empty doc → `fatal` (error screen). `KC.Blocks.describe(issue)`
  gives the human string for the team-lead notice. Human-readable spec: **`Block Contract.md`** — keep both
  in sync. Loaded before kc-docpage.js. DocPage wiring: `DP.check`, `DP.issuesHTML` (teamlead-only yellow
  strip "Документ переварен с замечаниями: N"), `DP.errorHTML`, `DP.lastCheck`.
- **`EasyBIM Knowledge Center.html`** — the deliverable. All CSS (in one `<style>`), all markup, and an
  inline `<script>` with the layout primitives: `tog(id,side)` (collapse a column to a spine),
  `xp(id)` (expand a spine), `togTr(id)` (open/close translation), `setIcon`, `toast`, sync logic.
- **`kc-app.js`** — the `KC.*` namespace: Plan-tree renderer, custom nodes, progress rings,
  notebook doc editor, column resizing (`KC.startResize`), translation tab (`KC.trTab`),
  breadcrumb nav (`KC.goTo`), dictionary, etc.
- **`kc-data.js`** — `window.KC_TREE`: the real Knowledge Center content for the 3 workspaces.
- **`kc-teamlead.js`** — `KC.TL.*`: the Team Lead console (overlay) — Overview / Content review /
  Team tabs, suggestion queue, roster + progress, assign-topic modal. Demo data lives at the top of
  this file (`TEAM`, `QUEUE`, `ASSIGNABLE`). Loaded after `kc-app.js`.
- **`kc-suggest.js`** — inline change proposals on OFFICIAL docs (backlog #8, BUILT). **ONE selection-popup
  entry** now: select any text on an official page → **“Suggest an edit”**. The compose card carries an in-card
  **segmented toggle “Change text / Add after”** (`KC.composeMode`, `.kc-sugmodes`/`.kc-sugmode`, card class
  `mode-edit`/`mode-add`); edit shows Before/Proposed, add shows a single New-paragraph field. Submit → one
  “Submit for review” (author) / “Approve” (teamlead). The two separate popup buttons were merged (legacy
  `KC.proposeAdd` kept as an alias that opens the card + flips to add). **Works on EVERY official text block, not
  just paragraphs:** static `.doc-p` pages AND the DocPage’s `.dp-p`, `.dp-callout`, `.dp-list > li`, and `.dp-h`.
  The popup gate (`onSelect` in kc-app.js) accepts `el.closest('.doc-p, .kc-docpage .dp-p, .kc-docpage .dp-callout,
  .kc-docpage .dp-list > li, .kc-docpage .dp-h')` and only excludes editable custom docs (`.kc-doc` not
  `.kc-docpage`) + sugcards. Block indexing in kc-suggest.js: `editBlocks(cb)` (all `BLK_SEL` blocks in order) +
  `bIndexOf` locate an EDIT target across reloads (`rec.bIdx`); `topBlocks(cb)`/`topIndexOf`/`topOf` anchor an ADD
  after the nearest top-level `.dp-body` child (`rec.tIdx`) so a new `.dp-p` never lands inside a `<ul>`. The card
  itself is inserted via `topOf(block).after(card)`. `clearMark` distinguishes a block-marked target by
  `kc-edit-line`. `KC.submitProposal` reads mode from the card class; add clears the fragment outline. `paras()`
  (paragraph-only) is retained for legacy `pIdx` fallback in `renderPending`. `KC.submitProposal` writes `type:'edit'|'add'` records into `kc_suggestions`
  (author → pending, cancellable; teamlead → applied immediately). `KC.applyProposalDOM` (called by the
  Team Lead’s `doApprove`/`doReject`) mutates the doc. `KC.renderPending` re-injects cards + `.kc-edit-orig`
  outlines on load for every role. Loaded after `kc-teamlead.js`. **`pathOf(cb)` (BUG FIX this session) now also
  reads the DocPage’s `.dp-bc` breadcrumb** (was `.bcrumb`-only, so any suggestion on the DocPage silently got a
  bogus `path:['Knowledge Center'], title:'Topic'` — this was the root cause of both “review card path is missing
  the document name” AND “Team Lead eye click does nothing” for DocPage suggestions, since `findTreeRow` in
  `kc-teamlead.js` couldn’t match a tree row by the wrong title, so `data-sugid` never got set on the row.
- **`kc-send.js`** — “Send this document” flow (backlog #14, BUILT). Reached from the Textbook ⋯ menu’s
  **Send to…** item (the two Download rows were merged into one **Download** row with a Web page /
  Editable document sub-menu, freeing the space). `KC.Send.open()` reads the current doc from `KC._dlCtx`
  (title + breadcrumb + workspace) and opens a wizard overlay (`#sndBg`/`#sndModal`, its own `.snd-*` CSS):
  **project** (search the platform base `window.KC_PROJECTS` by name OR code — REAL EasyBIM projects: 5-digit
  codes 22101… + Hebrew names, `dir="auto"`; `acc:true/false` mirrors the platform ACC-folder column,
  `accAlert:true` = amber dot) → **route** (Email a consultant | Attach in ACC — ACC route disabled when a
  project has `acc:false`) → **recipients** (consultants on that project, filtered by discipline / company /
  search, multi-select checkboxes; one project per send, its name locked into the subject) → **compose**
  (auto subject `[CODE] Title`, editable cover text, standard signature, mock attachment) → **done**.
  **ACC branch = Autodesk Forma hand-off (option C)** (`stepAccIssue` → `Send.openAcc`): NO in-app comment box
  — we don’t rebuild the Autodesk UI. We show the project’s recent open **Forma Issues for context**
  (real shape: id `#317`, `COR` type badge, status Open/Pending/In progress with colored dot, assigned
  discipline + placement) + an “Open project issues in Autodesk Forma” button; each row / the button
  `window.open`s the Forma issues URL (`accUrl`) in a new tab, logs the hand-off, comment written natively
  in Forma. Every send/hand-off is recorded in `localStorage.kc_send_log` (`Send.loadLog/saveLog`) shown in
  the header **Log** tab. All roles may send. Real projects/consultants/issues seed at the top of the file
  (`PROJECTS`). NOT yet: real SMTP/Graph send, real Forma API posting, per-doc sent-byline (ties to #9).

## User views (roles) — ONE codebase, role as a switch
Three user types: **Intern** (built), **Employee** (built), **Team Lead** (`teamlead` — built: a
working reference user PLUS a management console). All three live in the **single** root file set.
(The role was called `admin` earlier; `kc_role==='admin'` is migrated to `teamlead` on read.)

- **Role source of truth:** `kc-app.js` top defines `const ROLES = {intern,employee,teamlead}` with
    per-role flags `{label, icon, progress, markDone, mentorStart}`. The `intern` role’s **user-facing
    label is “Onboarding”** (icon `sprout`) — the internal KEY stays `intern` (localStorage `kc_role`,
    `role-intern` CSS, `role==='intern'` filters). Never rename the key; change only labels/copy. `teamlead` also carries
    `identity:{ name:'Gal Shem Tov', mail:'gal@easybim.co.il', initials:'GS' }` — `applyRoleUI` swaps
    the cabinet name/email/avatar initials to Gal in Team Lead, back to Polina (DEFAULT_IDENTITY)
    otherwise. Active role is read from `localStorage.kc_role` (default `intern`) into closure var
    `ROLE`; exposed as `KC.role` / `KC.ROLES` / `KC.identity`.
- **Switching:** `KC.switchRole(role)` writes `kc_role` and **reloads**. The switcher is a small dropdown in the **cabinet header top-right**
  (`.role-dd` in `.up-head`, next to the user name): `toggleRoleDD()` opens it; each `.role-dd-opt`
  calls `KC.switchRole`. `KC.applyRoleUI()` (called in init) sets the dropdown label/icon + active
  option. The old "Learning mode / Role" `.role-seg` segmented control was removed.
- **How differences are expressed (never by forking the file):**
  1. **Visual differences → `body.role-*` CSS** in the root `<style>`. An inline script at the top of
     `<body>` sets `body.class = role-<kc_role>` before render (no flash). Reference roles
     (`role-employee`, `role-teamlead`) hide learning progress: `.ps`, `.ws-progress`, `.ws-ipct`,
     neutralise tree rings/dots + `done` dimming, hide the `.role-learn` cabinet sections
     (Continue-learning `#upResumeSec` + Your-progress `#upProgSec` + their `<hr>`), and hide the
     mentor `.mtool[data-tool="quiz"]` / `[data-tool="cards"]` buttons.
  2. **Logic differences → the `ROLES` table.** `markDone` gates the "Mark as done" item in the tree
     ⋯ menu (intern only). `mentorStart` sets the mentor's opening mode in init (`intern`→Topic tutor,
     `employee`/`teamlead`→Assistant).
- **Team Lead console** (`kc-teamlead.js`, `KC.TL`): a **docked, resizable column** `#tlc` styled like the
  the seam is the collapse **handle** (`.tlc-hnd`, chevron on its left edge → `KC.TL.close()`) and a
  **drag-resize** grip (`.tlc-resize`, cyan center highlight on hover). The head buttons (max / close)
  were **removed** — fold via the handle, resize via the grip, like the other columns.
  The old top-bar **Manage** button was **removed** — the spine is the only entry point now.
  **Mentor (c4) ⇄ Manage are mutually exclusive:** opening Manage folds **Mentor** to its spine
  (`collapseNeighbors` folds ONLY c4 now — Notebook/c3 is left alone); `close()` restores Mentor.
  Expanding Mentor from its spine (`xp('wNc4')`, wrapped in `boot()`) folds Manage back to its spine.
  So at most 4 full columns show (Plan, Textbook, Notebook + one of Mentor/Manage), which fits normally.
  States: spine / `.open` (docked column) / `.max`. Do NOT put a CSS `transition` on `.tlc` flex-basis.
  **Manage is a plain in-flow flex column** (NOT sticky/overlay — an earlier `position:sticky;right:0`
  pin was tried and reverted: it always painted over the neighbour mid-scroll and left an empty gutter
  in fullscreen). Collapsed = a 54px `.tlc` spine at the end of the row; open = `flex:1 1 0` (min-width
  260px, `margin-left:12px` seam gap) beside the workspace's `flex:4 1 0`, so all columns divide the
  screen roughly equally. Resize sets inline `flex:0 0 <w>px` (cleared on open/close). When a viewport is
  too narrow for everything, `.app{overflow-x:auto;overflow-y:hidden}` lets the whole row **scroll
  horizontally** — nothing overlaps, the spine is simply the last (rightmost) element, reachable by
  scrolling (same as any other collapsed column). All menus are `position:fixed`, so scroll never clips
  them. `TL.fitCheck()` remains as a last-resort narrow fallback (run on open, on neighbour-expand via
  wrapped `window.xp`, and on resize).
  **Parallel review flow (the whole point):** Manage, the Plan tree, and the Textbook work together.
  - **Tree markers** (`KC.TL.markTree()`, team-lead only, run at boot + refreshed after approve/reject):
    edits/corrections mark the target leaf with a cyan **✎ `.tl-sugmark`** + row tint; new topics inject a
    dashed **ghost node** (`.tl-ghost`, indigo, no `.dot` so it doesn't count toward progress) under the
    parent; every ancestor branch gets a **`+N` `.tl-branch-badge`** (visible even collapsed). Clicking any
    marker → `KC.TL.reviewFromTree(id)`.
  - **Every suggestion is a whole NEW document** (`type:'new'`). Corrections/edits are made by duplicating
    the file (custom node) and submitting the copy — so there is ONE type, one preview, one approval path.
    Card = avatar + author, **time under the name**, a **“New document”** tag, the short path breadcrumb, and
    three compact icon buttons (eye/✓/✕). No role chip, no note/body (there's no compose box, so it was fake).
  - **The eye = navigation only** (`KC.TL.review`): NO detail page inside Manage anymore (`renderDetail`/
    `placementHTML`/`contentHTML` are dead) — it switches workspace, `highlightInTree` + `previewInTextbook`.
    `previewInTextbook` renders the proposal **as an ordinary Textbook page** (breadcrumb + `.tl-rvw-title` +
    `.doc-p` body) — the real page's `.cb` children are hidden with `.tl-orig-hidden` and restored on clear,
    so nothing stacks over unrelated content and nothing duplicates the Manage card. A slim sticky
    `.tl-rvwbar` on top carries Approve / Reject / Done-reviewing (`.tl-ib` icon buttons). Manage stays on
    the queue list. (The old heavy `.tl-rvw` banner + before/after diff was removed.)
  - **Review in context does NOT close Manage.** `KC.TL.review(id)` renders the detail in-column AND `highlightInTree(s)` (reveal+outline the node) AND `previewInTextbook(s)` (a `.tl-rvw` banner at the top
    of the active workspace's `.c2 .cb` showing the before/after diff or the proposed new content, with
    Approve/Reject + “Done reviewing”). `reviewFromTree` also `switchWS` to the suggestion's workspace first.
    `openInTree`/“Reveal in the tree” now highlights **without** closing. `KC.TL.clearReview()` dismisses the
    banner + outline. Approve of a `new` item still calls `KC.publishToTree` (real insert), then re-marks.
    **BUG FIX (this session) — eye navigation for edit/add suggestions:** `TL.review`/`TL.openInTree` now
    also make sure the suggestion's OWN document is the one open in the Textbook before previewing it
    (compares the live `.bc-cur`/`.dp-bc-cur` text to `s.title`; if it doesn't match, finds the marked tree row
    via `data-sugid` and calls `KC.select(row)` to open it, then retries the preview) — previously it assumed
    the doc was already showing, so clicking the eye from a different topic silently did nothing.
    `previewInTextbook` now also flashes the actual changed fragment/block (`.kc-jump-flash`, a temporary
    dashed-cyan frame) in addition to the card, and bails out (rather than silently no-oping) when the card
    truly isn't found. New CSS `.kc-jump-flash` in the root `<style>`.
  Inside: a `.tlc-nav` section switcher at the top (mono **Sections** label + vertical `.tlc-navitem`
  list with `.active` highlight, styled like the Plan column's `.ws-nav` workspace switcher) — **Content
  review / Team** only. The old **Overview** tab was **removed** (it only mirrored Review + Team; dropping
  it freed vertical room). `TL.tab('review'|'team')` toggles `.tlc-navitem.active` and fills `#tlcMain`;
  default tab is `review`. `KC.treeChildren` / `KC.publishToTree`
  (in `kc-app.js`) read/mutate `window.KC_TREE`. Demo data (`TEAM`, `QUEUE`, `ASSIGNABLE`) at file top.
  - **Team tab = interns only** (`renderTeam` filters `role==='intern'`; employees dropped — the tab is for
    regulating interns' assigned material). Review cards use **compact icon buttons** `.tl-ib` (eye/✓/✕,
    tooltips) so they never overflow the narrow column; detail/review-banner acts are normal `.tl-btn` (not `.lg`).
  - **Per-intern card mirrors the intern cabinet** (`personHTML`): avatar + name + `joined…` meta + a big
    **overall %** (`.tl-person-ov`), then a **progress accordion** (`.tlp-*`, identical structure to the
    cabinet's `.upg`/`.upr`/`.ups`) — 3 workspaces with % + bar, each expands (`KC.TL.togPg(pIdx,wsIdx)` →
    `buildPersonSub`) to its top-level blocks with %. The **reference intern** (name===`KC.internIdentityName()`,
    Polina) reads **live** numbers from the trees (`KC.progressData(wsIdx)` / `KC.overallPct()` in kc-app.js) so
    the card matches her own cabinet exactly; other demo interns use their demo `prog[]` + deterministic
    fabricated sub-%. A **`.tl-pending`** pill shows N unaccepted assignments (`kc_assign` where `!accepted`);
    Progress everywhere is framed as **% of assigned material**, not
    the whole Knowledge Center bank.
  - **View details** was **removed** from the intern card (it duplicated Assign-a-topic). `KC.TL.details`/`tldItems`/
    `tldStatus`/`TL.unassign` remain in kc-teamlead.js (+ `.tld-*` CSS) but are no longer wired to a button.
    Assigning from the tree ⋯ (`Add to intern's plan → pick intern`) is the primary flow.
  - **Cabinet (intern) has a big overall plaque** `#upOverall` (`.up-overall`) above Your-progress, filled by
    `syncUserProgress` from `KC.overallPct()`. Progress everywhere is framed as **% of assigned material**, not
    the whole Knowledge Center bank.
- **Plan ⋯ menu is the shared control surface (team-lead extras).** `KC.menu` (kc-app.js) stashes
  `KC._menuCtx={treeId,title,ws,path}` and, when `ROLE==='teamlead'`, appends: **Review in context / Approve /
  Reject** when the row carries `data-sugid` (a pending suggestion), plus **“Add to intern’s plan”** which
  toggles an **inline nested submenu** built INTO the same `#ctxmenu` at open time (`KC.toggleAssignSub` shows the
  `.ctx-sub` list of `KC.TL.interns()` — NO innerHTML re-render, so the outside-click closer never fires and it
  reliably opens). Each name → `KC.assignPick` → `KC.assignNode(ctx, internName)`. (`KC.assignMenu` is now a no-op
  legacy stub — the earlier re-render approach detached the clicked button and got auto-closed.)
- **Assignments (team-lead → intern) + intern notifications** — one localStorage store `kc_assign`
  (`KC.loadAssign/saveAssign`), shared across roles (switching reloads). Record: `{id,ws,treeId,title,path,
  intern,accepted,when}`. The single reference intern is `DEFAULT_IDENTITY.name` (Polina) — `KC.myAssignments()`.
  - `KC.markAssignedTree()` (run at boot for every role + after each assign/accept): **intern** rows for
    unaccepted assignments get an **attention** state `.kc-attn` (cyan row) + pulsing **`.kc-attn-mark`** sparkle
    until accepted.
  - **Intern cabinet** has a **“New for you”** section `#upAssignSec` / `#upAssignList` (`KC.renderAssignments()`,
    `role-learn`, intern-only) listing unaccepted items with **go-to** (`KC.gotoAssignment`) + **got-it**
    (`KC.acceptAssignment` → marks accepted, clears tree attention). A red **`.nav-user-dot`** on the avatar shows
    when there are new items.
- **Plan tree progress is now block bars, not rings.** Rings + centre counts were **removed** from branches
  (`.ring` CSS is dead). Only **top-level blocks** (depth-0 branches) carry a thin **`.blk-bar`/`.blk-fill`**
  (% of descendant leaves done, computed by `computeBlockBars` in `updateProgress`), styled like the intern
  cabinet's per-workspace bars and **shown for the intern role only** (`body:not(.role-intern) .blk-bar{display:none}`).
  Leaves keep their small **status `.dot`** (todo/active/done). Topics/leaves get no bar (bars are block-level only).
  **Progress excludes custom (user) folders/files** — `KC.progressData`/`overallPct`/`updateProgress`/`computeBlockBars`
  all filter out `.node.custom` dots (custom blocks get no `.blk-bar`), so progress reflects only assigned/official
  material. `buildUpgSub` (cabinet accordion) delegates to `KC.progressData` so cabinet + Team Lead cards stay identical.
- **To change something for ALL roles:** edit the shared markup/JS once — it's one file now.
  **To change ONE role:** edit its row in `ROLES` and/or its `body.role-*` CSS. That's the whole model.
- Permissions ("who may switch to which role") are **not** implemented yet — switching is free during
  design. When identity/auth lands, gate it in `KC.switchRole` (one place).

## Backend handoff plan — `Backend Handoff Plan.md`
Steps 1–7 DONE (the plan is complete): data layer `kc-api.js`, block contract `kc-blocks.js` + `Block Contract.md`,
**`Data Model.md`** (17 entities — target record JSON + the current mock shape for each, relationship
diagram, implementation notes), **`API Endpoints.md`** (10 sections of "UI action → method + path
→ response" with an I/E/L permission column, the `KC.API` method per row, and cross-cutting rules:
one seam, server-side permissions, `baseVersion`→`409` concurrency, pagination, idempotency), and
**`Integration Points.md`** (Monday / Google Docs / email / ACC-Forma / AI — direction, payloads,
element→block mapping, failure behaviour, code seam, and the recommended wiring order), and
**`Roles and Permissions.md`** (capability matrix for intern/employee/teamlead, ownership rules that
override role — a lead sees progress but never notebooks/notes/chats — how roles are expressed in one
codebase, and the production checklist: role from identity, server-side enforcement, one gate,
ownership `403`s, audit trail), and **`UI States.md`** + **`kc-states.js`** (loading / importing /
not-imported / error / empty / no-access / conflict, with the document states wired through
`KC.API.getDocument`).
Plus the shared understanding of
column 1 (Monday structure sync) and column 2 (backend "digests" a Google Doc once into our block
JSON, stored in the root KC database; the front end only calls `KC.API.getDocument` and renders the
states ready / importing / not_imported / error). **Read and update that file as steps complete.**

## Real-content architecture (decided, NOT yet built — strategic direction)
Discussed and agreed with the user: how the real Knowledge Center content plugs into this app long-term.
1. **Structure sync, one-way.** The Plan tree (column 1) mirrors the real Monday.com "Knowledge Center"
   workspace (boards/groups → tree nodes); each Monday item that links to a Google Doc carries that doc's
   id as node metadata (the same role `doc:"project-startup"` plays in `kc-data.js` today, just with a real
   Google Doc id instead of a hardcoded slug). Monday stays the source of truth for STRUCTURE; we never
   write back to it.
2. **Content is "digested" into our own format, NOT displayed as raw Google Docs, and NOT synced live.**
   A converter reads a Google Doc via the Docs API (structured paragraphs/headings/lists/images — not a
   flat export) and maps it onto our DocPage block model (`dp-h`/`dp-p`/`dp-list`/`dp-callout`/`fig`),
   exactly the manual mapping done once for the Project Startup demo doc, but automatic and per-document.
   **The digested copy is stored as its own record in our database** (`documents(source_doc_id, blocks_json,
   version, ...)` — DP.data today is a stand-in for that row) and becomes the ONLY thing the app reads/writes
   from then on: Textbook rendering, suggestions/approvals, versions, bookmarks, translation, and downloads
   all operate on this copy, never on the live Google Doc. The original Doc in Drive is left untouched — no
   two-way sync (explicitly ruled out as too risky). This also fixes the "approved edits don't stick" gap:
   once content lives as our own record instead of being rebuilt from a static in-memory blob, an approved
   suggestion updates that ONE row directly, so every future read (including exports) reflects it.
3. **Migration is gradual, per-document, with the old and new center coexisting.** Not-yet-digested topics
   keep behaving as they do in this mock (a link out / placeholder). Digested topics render through the rich
   DocPage machinery immediately. Over time, as more of the real Knowledge Center is digested, the "old"
   Google-Drive-based center becomes read-only archive/backup and this app becomes the source of truth —
   the user explicitly framed this as "old Knowledge Center becomes an archive."
4. **Notebook should ultimately be Google-Docs-quality editing, backed by our own DB.** Swap the
   `localStorage` autosave (mock-only) for a real per-user, per-workspace row (`notebooks(user_id,
   workspace_id, content_json, updated_at)`) with the same debounce autosave UX already built. For genuinely
   robust rich-text editing (no cursor/list/image bugs), recommend a real editor engine (Tiptap/ProseMirror or
   equivalent) instead of hand-rolled `contenteditable` when this becomes a real backend, not before.
5. **Export fidelity fix (in progress this session):** the current "Editable document" download for a
   DocPage is unreliable when opened via Google Docs — missing TOC/versions/masthead (only body blocks are
   exported), no styling for our custom block classes, and base64 images embedded in an HTML file disguised
   as `.doc` are dropped by Google's (not real Word's) `.doc` importer. Fix in flight: a dedicated DocPage
   export template with real semantic heading hierarchy (h1 doc title → h2/h3 sections) so Google Docs'
   auto-outline matches our own TOC, TOC + versions rendered as real HTML lists/tables, brand-consistent
   inline CSS for our custom blocks, and — the key change — **save the "Editable document" as a genuine
   `.html` file instead of a fake `.doc`**: plain HTML with inline `<img>` (even base64) round-trips through
   Google Drive's "Open with Google Docs" conversion far more reliably than the Word-flavored-HTML-as-`.doc`
   trick, which only real Microsoft Word handles well. The user never sees the `.html` extension as a
   limitation — Drive converts it straight into a normal editable Google Doc on open.

5. **Export fidelity fix (BUILT this session):** the "Editable document" download for a DocPage was
   unreliable in Google Docs — missing TOC/versions/masthead (only body blocks exported), no styling for
   our custom block classes, and base64 images embedded in an HTML file disguised as `.doc` were dropped by
   Google's (not real Word's) `.doc` importer. Fixed via `DP.editableHTML()` (kc-docpage.js) — a dedicated,
   self-contained plain-HTML export (NOT reusing `blocksHTML`/`editableDoc`): real semantic heading hierarchy
   (`<h1>` doc title, `<h2>` for lvl≤3 sections incl. the two intro headings, `<h3>` for lvl4 subsections) so
   Google Docs' auto-outline matches our own TOC; TOC and the versions log rendered as a real `<ol>`/`<table>`;
   every element carries brand-consistent **inline** styles (Docs import keeps inline styles far better than
   a `<style>` block); figures embed as real `<img src="data:...">` (via `DP.editableBlocksHTML`, using the
   same `DP._fig` cache `loadFigures()` populates). Saved as a genuine **`.html`** file (not a fake `.doc`) —
   both `resolveLeafExport` (kc-app.js, tree ⋯ Download) and `KC.doDownload`'s docpage branch now call
   `KC.DocPage.editableHTML()` and write `.html` for the "Editable document" choice. Verified: real `<h1>`,
   9×`<h2>`, 17×`<h3>`, a real `<table>` of versions, a TOC list, and all 17 figures as inline data-URL `<img>`.

## Brand / system (do not drift)
- EasyBIM tokens only: navy `#1e248c`, cyan `#44b8d3`, glass surfaces, soft navy-tinted shadows,
  gradient icon tiles. Fonts Hanken Grotesk / Inter / JetBrains Mono. **Lucide** icons.
- **Light theme only** (dark mode was removed — do not reintroduce a toggle).
- **Do NOT load the design-system React bundle.** This is an intentional dense **vanilla-JS** app on
  the EasyBIM **CSS tokens**. The recurring oxlint "load the bundle" warning is knowingly ignored —
  this app's components (tree, notebook, translation, mentor, dictionary) are not in the bundle.
- Canonical HTML (close every tag, double-quote attrs). There may be an `__om-edit-overrides`
  `<style>` block holding user direct-edits with `!important` — edit/remove those rules when
  restyling the elements they target.

## Layout — 5 columns per workspace
3 workspaces: `ws0` Logistics & Administration, `ws1` BIM Methodology & Tools, `ws2` EasyBIM Teams.
A top switcher changes workspace and shows per-workspace progress %.
Columns (ids `w{0|1|2}{c1|c2|ctr|c3|c4}`):
1. **c1 Plan** (Содержание) — interactive content tree.
2. **c2 Textbook** (Учебник) — reading column.
3. **ctr Translation** (Перевод) — a drawer that slides out **from behind** the Textbook.
4. **c3 Notebook** (Тетрадь) — free-writing notes.
5. **c4 Mentor** (Ментор) — AI tutor chat.

## Behaviors (current, agreed)
- **Plan tree:** branches show a chevron + a **progress ring with the sub-topic count in its center**;
  leaves show a **status dot** (todo / active / done). Unlimited depth — any node can grow a child via
  the ⋯ menu ("Add my sub-topic"). **Custom (user) nodes** carry a gradient folder badge **before the
  name**, inherited by all descendants. Only custom nodes show **"Suggest to Knowledge Center"** in ⋯.
  Examples already in data: custom block "My Study Space" + custom topic "Monday Agents — my research".
  Only custom nodes show **"Suggest to Knowledge Center"** — this now really submits: `KC.suggest`
  writes a record to `localStorage.kc_suggestions` (`KC.loadSuggestions/saveSuggestions/removeSuggestion`,
  numeric id so it embeds unquoted in the review onclicks; `type:'new'`; `path=[wsName,...parentChain]`,
  `title`, `content`=the saved doc body as text — requires a Saved Textbook body, else it toasts to
  add+save first). kc-teamlead.js concats these into `QUEUE` at load; approve/reject also
  `KC.removeSuggestion(id)` so they don't reappear after the role reload. So a user Suggest really
  shows up in the team lead's Content review, previews as its page, and Approve publishes it.
  New top-level sections are created ONLY by the folder button top-right of the search (`.adbtn` →
  `KC.addBlock`); the old duplicate "New section of my own" row at the bottom of the tree was removed.
- **Tree ⋯ Download → format/scope dialog (BUG FIX + BUILT this session).** Previously a folder download
  always zipped generic placeholder `.html` stubs (ignoring real DocPage/custom-doc content) with no format
  choice and `.keep` markers for empty folders; a single-leaf download had the same placeholder problem.
  Now both go through one dialog (`KC.dlNode` → `ensureDlDOM`/`dlRender`, `.snd-bg`/`.dl-modal` shell, new
  `.dl-*` CSS): pick **Format** (Web page / Editable document, same meaning as the Textbook's own Download)
  and, for a folder that contains any `.node.custom` descendant, **Personal documents: Include / Official
  only**. `KC.dlConfirm` resolves every leaf via `resolveLeafExport(node, ws, fmt)` — the one seam real
  content plugs into: a node with `data-doc` renders through `KC.DocPage` (`standaloneHTML`/`editableDoc`+
  `blocksHTML`, same as the Textbook's own download), a `.node.custom` leaf pulls its saved body from
  `KC.loadDocs()`, everything else still falls back to a placeholder — but now rendered through the same
  `buildDoc`/`editableDoc` templates as real content, so format is consistent across the archive. Empty
  folders are never created (no `.keep`). This is a **pattern**, not per-node content: when real authored
  content exists for every topic, the same `resolveLeafExport` seam serves it with no further plumbing.
- **Editable custom documents.** Selecting a **custom leaf** opens an **editable page in the Textbook**
  (`openCustomDoc` in `KC.select`): a Notebook-style toolbar (`DOC_TOOLBAR`: B/I/U, lists, checklist,
  image, link) + breadcrumb + editable `.kc-doc-title` + `.note-doc.kc-doc-body`, with a **Save** button
  (`KC.saveDoc`). Official (non-custom) topics keep their static page — selecting one calls
  `closeCustomDoc` (removes `.kc-doc`, unhides the `.kc-doc-hidden` originals). Content persists per node
  in `localStorage.kc_docs` keyed by `ws.id + '::' + nodePath.join('›')` (`KC.loadDocs/saveDocs`).
- **Breadcrumbs** atop the Textbook are clickable → `KC.goTo(treeId, name)` reveals+selects that node.
- **Line-level bookmarks = margin index-tab stickers (writable).** Each Textbook line (`.doc-p` on official
  pages, `.kc-doc-body` block children in custom docs) gets an **add** affordance `.kc-bm` (a faint **mini
  arrow-tab** — same clip-path shape as the sticker, just smaller — at the right on hover, hidden once the line
  is `.bk-set`), injected by `KC.setupBookmarks()` at init.
  Clicking plants a small **left-pointing arrow tab** (`.kc-tab`, clip-path arrow) flush at the line’s right
  edge — like a paper index-tab in the margin (photo reference from the user). It carries NO inline text (stays
  small); a `.has-note` dot + `title` tooltip mark a written one. Clicking the tab opens a single floating
  **note popover** `#kcTabPop` (`.kc-tabpop`, created once, appended to body): a `textarea` (`KC.tabNote`), five
  arrow color swatches (`.kc-tcol` → `KC.tabColor`; TAB_COLORS = yellow/blue/green/orange/pink, default yellow)
  and a Remove button (`KC.tabRemove`). `KC.tabOpen(anchor)` positions it left of the tab, focuses the textarea;
  `KC._tabOutside` (capturing mousedown) closes on outside click. Record `{treeId,name,pIdx,snippet,note,color}`
  in `localStorage.kc_bookmarks` (`KC.loadBk/saveBk`, `KC.findBk` looks one up; `bkEq` unchanged). `name` = page
  `.bc-cur` topic, `pIdx` = paragraph index (topic-level ⋯-menu bookmark still uses `pIdx=null`, note-less).
  `KC.applyLineBk()` toggles `.bk-set` + builds/removes each tab via `ensureTab`; on add (`KC.toggleLineBk`) the
  popover auto-opens. Cabinet section **My sticky notes** (`KC.renderBookmarks`): small colored arrow chip
  (`.bk-dot.c-*`) + topic name + italic note preview; click → `KC.openBookmark` → switchWS + `goTo` +
  `KC.scrollToLine(idx,pIdx)` + `.bk-flash`. Tabs are stripped (`.kc-bm,.kc-tab`) from custom-doc HTML in
  `KC.saveDoc` and rebuilt from the store on reopen (`KC.setupDocBookmarks`). Resume chip is separate/unchanged.
  **Bookmarks are a personal tool — never part of the document:** `KC.doDownload`/`KC.dlTextbook` strip
  `.kc-bm,.kc-tab` (and reset `data-pidx`/`.bk-set`/inline position) from the clone, and `KC.saveDoc` strips them
  too, so tabs never leak into a downloaded **Web page / Editable document** or the **Send** attachment (Send
  reads title/path only). They also never touch `window.KC_TREE` / the root file.
- **Translation:** collapsed by default. A **subtle cyan icon tab** at the Textbook's top-right
  (`.tr-tab`, `KC.trTab`) **opens it on click and resizes it on drag**. Open header is a standard
  horizontal "Translation" title + sync (link) button + RU/EN/HE select. Opens even when Textbook is
  collapsed. **Live test translation (ws1 only):** `#w1trdoc` renders `KC.TR_DOC` — a faithful RU/EN/HE
  translation of the open **Project Startup** doc's intro + section 1 (`KC.trRender(lang)`); the RU/EN/HE
  `<select onchange="KC.trLang">` switches language (HE shown RTL as the original), choice persisted in
  `localStorage.kc_tr_lang`. ws0/ws2 keep their old short `.trp` placeholder. **Sync = heading-anchored,
  NOT proportional.** The link button (`KC.syncLock`, single click toggles, cyan `.locked` state) links
  scrolling so the SAME heading stays at the top of both panels: `KC._trPairs` matches each `.tr-h`
  (carrying `data-anc`=section anchor id and/or `data-num`=section number) to the Textbook's `.dp-h`
  (by `#anchor` id, or by `.dp-hnum` number text for sub-headings); `KC._trAlign` finds the current
  heading segment and interpolates between consecutive headings. Falls back to proportional (`setFrac`)
  when no heading pairs exist (ws0/ws2). Short translation simply pins to its bottom past its last heading.
- **Notebook:** a single Docs-style free-writing doc with a sticky top toolbar (B/I/U, text color,
  highlight, bullet + numbered lists, checklist item, insert image) and a **"Save as topic"** button.
  No separate "blocks". The Notebook draft **autosaves** (debounced ~650ms on input, `KC.autoSaveNote`,
  wired per-workspace in init) to `localStorage.kc_note_<wsId>`; a subtle header status `.nb-status`
  (check + "Saved" / spinner + "Saving…") replaced the old manual Save button — there is NO Save button
  in the Notebook anymore. `KC.saveNote` is kept (unused by UI). **Custom Textbook docs still have an
  explicit Save button** (`KC.saveDoc`) — only the Notebook autosaves. All editable surfaces (Notebook + custom
  Textbook docs) — the Notebook autosaves; custom Textbook docs keep an explicit Save button.
- **Mentor:** a large chat space. A dictionary is a **separate page** (`KC.dict`) opened from its own
  button; quiz / cards / summary / checklist / find-resources are tools (Intern gets all five;
  Employee gets summary / checklist / resources — Quiz + Flashcards stay hidden). Tool buttons
  belong to **Topic Mentor mode only** — in Assistant mode the whole `.mentor-tools` bar is hidden
  (`.col.asst-mode .mentor-tools`, toggled in `KC.mentorMode`); there, search/lookup happens purely
  through chat. Intern opens in Topic mode (tools shown); Employee opens in Assistant (tools hidden
  until switched to Topic Mentor). The Mentor column can grow to fill freed space.
- **Column resizing:** each interior boundary is draggable from **both sides**. Handles: c1 right;
  c2 left+right; c3 left+right; c4 left; translation via its tab. A **clamp keeps everything inside the
  visible viewport** (neighbors can't be pushed below their min-widths). There is **no "reset to auto
  width"** (removed). Collapse handles (`.hnd`) fold a column to a 54px spine (`.ss`, click to expand).
  Plan folds left (handle on right edge, chevron-left). Mentor's collapse handle is on its **left edge**
  with a right-pointing chevron and folds into a **right-side spine**.

## Pending backlog (discussed, NOT yet built)
1. **Resume / "you are here":** a "Continue: …" chip still auto-remembers the last-opened topic per workspace
   (unchanged). **Line-level bookmarks are BUILT** (see below); still open: a reading-progress bar inside the
   Textbook and **hybrid completion** (open = in-progress, manual check = done).
2. **Mentor memory / modes:** a **topic-bound** chat (history per topic, opens with the material) **and**
   a separate free **"smart assistant"** mode (bot, not tied to a topic, reachable anytime). Prioritize
   answers from EasyBIM's own knowledge base over the web; answers link to topics (clickable, like
   breadcrumbs).
3. **Dictionary** — **BUILT.** Data-driven now: `DICT[]` in kc-app.js (each term `{w,src,added,he,ru,def:{en,ru,he}}`),
   rendered into every `.dict-list` by `KC.renderDict()` (called in init). Header has a **gear** (`KC.dictGear`
   → `.dict-menu`) with three checkboxes (`KC.dictPref`) toggling per-card slots — **Hebrew translation / Russian
   translation / Definition** — via `body`-less `.dict-page` classes `pref-he/pref-ru/pref-def` (slots always
   in the markup, CSS hides them). A `.dict-toolbar` carries a **global definition-language segmented switcher**
   (RU/EN/HE, `KC.dictLang` → `.dict-page.lang-*` shows the matching `.dd-*` span) and **time-period presets**
   (Week/Month/All, `KC.dictPeriod`) with a **`.dict-count`** pill (`KC.dictApplyPeriod` counts terms in the
   period: "N added", or "N terms" for All; hides out-of-period cards via `.dt-np`). Prefs persist in
   `localStorage.kc_dict_prefs`. HE rows/defs are `dir="rtl"`. Selection-menu "Add to dictionary" →
   `KC.dictAddTerm(word,defEn)` unshifts a `My term` dated today and re-renders. `KC.dictFilter` search now
   toggles `.dt-nf` (co-exists with period `.dt-np`).
4. **Selection mini-menu** — extend the "add to notebook / translate / ask mentor / add to dictionary"
   popover so it appears on **any** text the user selects in the Textbook (and Notebook, minus
   "add to notebook").
5. **Notebook image annotations** — draw / arrows / captions over inserted images (phase 2).
6. **User profile popover** — design proposed (avatar → glass card with stats, per-workspace progress,
   quick settings); on hold pending feedback from leadership.
7. **Content corrections** — the user will send a corrected content tree to refine column 1 (`kc-data.js`).
8. **Inline edits instead of copy-to-suggest** — **BUILT** (`kc-suggest.js`). Two proposal types now
   flow to the Team Lead’s Content review queue: `type:'new'` (whole new doc, as before) **and**
   `type:'edit'` / `type:'add'` on OFFICIAL docs. **Edit:** select a fragment in the Textbook → selection
   popup “Suggest an edit” → the fragment is outlined in a dashed “before/proposed” span (`.kc-edit-orig`;
   block-level `.doc-p.kc-edit-line` fallback when a fragment crosses inner elements) and a pinned
   `.kc-sugcard.edit` (Before / Proposed + comment box) opens below the paragraph. **Add:** the selection
   popup’s “Suggest an addition” pins a `.kc-sugcard.add` (“NEW” tag) after the selected paragraph.
   Submit writes to `kc_suggestions`; author roles → card turns “Pending review”
   (cancellable), teamlead → the card applies immediately (“Approve”). Team Lead sees each in the queue
   (`.tl-tchip` type tag), the tree ✎ marker, and the pending card renders in a “review” state inline in
   the doc with Approve / Reject; approve mutates the doc via `KC.applyProposalDOM`, reject removes it.
   Cards + outlines persist across reload via `KC.renderPending` (all roles). NOT yet: threaded/multi
   comments on one proposal; edits on custom docs (those are edited directly).
9. **Document authorship plaque** — **BUILT.** A `.kc-byline` strip renders under the breadcrumb on every
   Textbook page: **Created** — name · date, and (when it differs) **Last updated** — name · date, each with a
   gradient initials avatar. Helpers `KC.bylineHTML(meta)` / `KC.fmtDate(ts)` / `KC.initialsOf(name)` in
   kc-app.js. **Official pages** carry a hand-written byline in the static HTML (seeded EasyBIM authors: Gal
   Shem Tov, Maxim Nikolsky, Yael Regev). **Custom/editable docs** record it automatically in `kc_docs`
   (`{title,html,createdBy,createdAt,editedBy,editedAt}`): first `KC.saveDoc` stamps creator+createdAt; every
   save updates editedBy/editedAt to the current `KC.identity`; `openCustomDoc` renders the byline (Draft if
   never saved) and Save re-renders it live. NOT yet: byline on published-from-suggestion official nodes (they
   have no distinct page in the mock) — wire author-through when that matters.
10. **Webpage document form (read-only share) + official document template** — **DESIGN BUILT**
    (`Project Startup Document.html` + `kc-docpage.js`, uses `image-slot.js`). A standalone design artifact,
    NOT yet wired into the app. `KC.DocPage` renders ONE Hebrew-RTL content model (`DP.data`, the real
    Project Startup guide from `uploads/DXXXX - Project Startup-*.pdf`) into **two views** via a demo toggle:
    `mode:'textbook'` (reading card inside the app, column c2) and `mode:'web'` (polished shareable page:
    sticky running header with the EasyBIM logo + a footer **colophon**, plus a **“מסמכים וקישורים קשורים”**
    related-links block — backlog-#10 link-surfacing, internal links → `KC.DocPage.openLink`). Components carried
    over from the source doc: series label + **document code chip** (`DXXXX`, kept as placeholder per user),
    **byline** (created / last-updated), **versions table**, numbered sections 1–7 with sub-sections /
    bullets (● and hollow ○) / **callouts**, and per-figure **image slots** (`<image-slot fit="contain">` +
    caption + a **zoom/lightbox** button `KC.DocPage.zoom` — the KC standard for captioned screenshots).
    Latin technical terms auto-wrap in a mono chip (`tech()` — splits raw text THEN escapes so `&amp;`
    entities aren't sliced). **Versions interaction (user-requested):** hovering a version row reveals a
    **“מעבר לשינוי”** button → `KC.DocPage.jumpToChange(anchor)` scrolls to the section and wraps it in a
    temporary dashed-cyan **`.dp-changeflash`** frame (same visual language as edit proposals); change
    descriptions per version are mock. **Versions = live change-log (BUILT this session).** v1 is rendered
    with a gradient **“Created”** badge (not the number “1”) + a subtle tint (`.dp-vrow.dp-vcreate`) so it
    reads as the document’s origin; rows 2+ are numbered corrections. Approving a suggested **edit/add** on the
    Project Startup doc now appends a version row: `KC.DocPage.logVersion({who,change,anchor})` computes the next
    sequential number, stamps the **approval date** (`DP.fmtToday()`) and the **initiating employee** as author
    (change text = the author’s note, else a generic), persists it in `localStorage.kc_docpage_versions`
    (`DP.loadLog/saveLog`), and `DP.renderVersions()` re-renders the table in place. `DP.allVersions(d)` merges
    seed `DP.data.versions` + the persisted log, so the row shows even if the doc wasn’t open at approval time.
    Wired from both `doApprove` (kc-teamlead.js) and the team-lead immediate-apply branch of `KC.submitProposal`
    (kc-suggest.js), gated on `/project startup/i.test(title)`. **Approved rows now carry a section anchor →
    click-to-jump (BUILT this session):** `KC.applyProposalDOM` computes `rec.anchor` from the DOM via
    `sectionAnchorOf(node)` (nearest preceding `.dp-h[id]` inside `.kc-docpage`, using `compareDocumentPosition`)
    for both edit (the changed `.kc-edit-orig` span) and add (the inserted block), and passes it into `logVersion`,
    so logged rows jump to their section exactly like the seed rows. **Versions box redesigned to echo the
    suggestion/review cards (BUILT this session):** the `<table>` was replaced by a `.dp-vlog` stack of `.dp-vitem`
    cards — each = a gradient initials **avatar** (`.dp-vava`, `KC.initialsOf`), a header row with the version
    **chip** (`.dp-vchip` `vN`, or the gradient `.dp-vbadge` **Created** on v1), author (`.dp-vwho2`) + date
    (`.dp-vdate2`), and the change text (`.dp-vchg2`); clickable rows get `.clickable` hover + a `corner-down-right`
    `.dp-vgo` arrow, matching `.tl-card`/`.kc-sugcard`. The old `.dp-vtable`/`.dp-vrow`/`.dp-vnum` CSS + mobile
    container-query were removed. NOT yet: a per-version diff view.
    **Corrected company contacts** (in `DP.company`): tel 050-331-8763,
    www.easybim.co.il, office@easybim.co.il, רחוב תובל 22 רמת גן (company name unchanged). Fonts: Heebo
    (display) + Assistant (body) + JetBrains Mono, on the EasyBIM color tokens. NOT yet: wired into the app's
    Plan tree / `KC.select` (one ws1 Revit topic should open this rich page instead of a static one), hooking
    the app's Download “Web page” variant to `DP.mount(...,{mode:'web'})`, and porting the figure/lightbox
    pattern to other official docs. Awaiting design feedback before integration.
    **INTEGRATED (this session):** the ws1 → Revit → Docs node `DXXXX - Project Startup` carries
    `doc:"project-startup"` in `kc-data.js`; `norm()`/`buildNode` copy it to `node.dataset.doc`, and `KC.select`
    routes a `data-doc` node to **`openDocPage(ws,node)`** (kc-app.js) — same hide-static-children /
    inject-`.kc-doc` pattern as `openCustomDoc`, wrapper `.kc-doc.kc-docpage`, content from
    `KC.DocPage.mount(wrap,{mode:'textbook'})`. `closeCustomDoc` removes `.kc-doc` so switching topics cleans up.
    **Download → Web page** wired: `KC.doDownload` detects `.kc-docpage` in the textbook `ci` and emits
    **`KC.DocPage.standaloneHTML(logo)`** (self-contained: inlined `DP.CSS`, Google-fonts + lucide via CDN,
    figures **baked** to static `<img>`/placeholder from live slots via `DP.slotSrc`; `DP.loadLogo` → logo
    data-URL); Editable-document uses `editableDoc(title, blocksHTML static)`. Styling lives ONLY in `DP.CSS`
    (`DP.injectCSS`/`injectFonts` add it once on mount; vars are `--dp-*` scoped to `.dp-tb,.dp-web,.dp-lightbox`
    so no collision with app tokens). App loads `image-slot.js` + `kc-docpage.js` after kc-send.js. NOT yet:
    Send-to reads the docpage title/breadcrumb (Send keys off `.bcrumb`); more official docs on this template.
    **TOC + nav (this session):** the intro "עיקרי המדריך" list is now a clickable **`t:'toc'`** block ("תוכן
    העניינים" card, `.dp-toc*`) → `KC.DocPage.goToSection(anchor)` smooth-scrolls to `sec-1…sec-7`. Both it and
    the versions `jumpToChange` go through **`DP.scrollToAnchor(anchor,flash)`** which finds the nearest
    scrollable ancestor via `DP._scroller` (fixes in-app scrolling — the doc scrolls inside `.c2 .cb`, not the
    window). Source text re-verified against `uploads/project-startup-source.docx` (copy of the .docx; original
    filename has parens which the file tools reject) — matches `DP.data`, no content changes needed.
    **Redesign pass (this session), per user:** the document **infrastructure is now English + LTR**, content stays
    Hebrew (RTL via `dir="auto"` on every text node — headings text, paragraphs, list items, captions, callouts,
    TOC/related labels). `.dp-tb,.dp-web{direction:ltr}`; breadcrumb/versions/TOC/related use chevron-right +
    left-aligned. **Series** → "Revit Working Guide"; **versions** headers English (No./Date/Author/Change),
    author **names transliterated to English** (Maxim Naftaliev, Reut Chafetz) to tie to real platform users;
    change text English. **Byline removed** from the masthead (redundant with the versions table). **Title
    smaller** (27px). **TOC moved above the intro**, made **compact** (2-col grid) and **pinnable**:
    `DP.tocHTML` renders `#dpToc` with a **pin button** (`DP.togglePin`) → `.dp-toc.pinned` becomes a
    `position:sticky` compact bar; clicking its head (`DP.tocHeadClick`) drops the list as an overlay
    (`.open`); `DP.goToSection` closes it. **Real screenshots baked in:** the 17 figure PNGs were extracted
    from the .docx (`word/media/*`, mapped in doc order) into **`assets/docpage/f-*.png`** (id = figure id);
    figures render `<image-slot src="assets/docpage/<id>.png">` (user can still drop a replacement), and
    `DP.loadFigures()` preloads them as data-URLs (`DP._fig`) so `standaloneHTML` bakes portable `<img>` for the
    download. `openDocPage` + the docpage Download branch both call `loadFigures()`. Verified in the demo file
    (LTR frame, English chrome, Hebrew RTL body, real Revit screenshots, pin toggle) — no console errors.
    **Refinement pass (this session), per user:** (1) **breadcrumb path is now clickable** (`DP.bcHTML`/`DP.navPath`
    → `KC.goTo` reveals the node in the Plan tree); the last crumb stays plain. (2) series + code moved into a
    **slim classification strip** (`.dp-classbar`, mono, subtle) under the path, freeing the title. (3) **Title
    smaller** (22px). (4) **Versions** box is compact + **collapsible** (caret `DP.versToggle`, `.dp-versions.collapsed`,
    count pill). (5) **TOC** is now **single-column**, **collapsible** inline (caret `DP.tocToggle`) AND **pinnable**
    (`DP.togglePin` → sticky bar under the header; `DP.tocHeadClick` drops the list). (6) all embedded blocks
    are denser. (7) **Bilingual headings**: Hebrew headings render Hebrew text **right** + auto English translation
    **left** from the `DP.EN` map (`.dp-h-bi`/`.dp-hhe`/`.dp-hen`); English-only headings unchanged. (8) **Footer
    redesigned** (`DP.colophonHTML`): navy bar, `easybim_logo-b.png`, English company name, address with `רחוב`
    stripped, and **icon links** (phone/globe/mail/LinkedIn/Facebook/map-pin). **Line sticky-notes restored on the
    DocPage** — `bkLines` now recognises `.kc-docpage .dp-body > .dp-p`, `bkTopicOf` falls back to `.dp-bc-cur`,
    and `openDocPage` calls `KC.setupDocBookmarks(cb)`. **Cabinet split into two sections** — a new **Bookmarks**
    list (`#upBmarks`, whole-topic saves where `pIdx==null`, from the ⋯-menu `KC.bkToggle`) ABOVE the existing
    **My sticky notes** (`#upBookmarks`, line notes where `pIdx!=null`); `KC.renderBookmarks` fills both. Colophon
    contacts still tel 050-331-8763 / www.easybim.co.il / office@easybim.co.il / תובל 22 רמת גן.
    **Refinement pass 3 (this session), per user feedback:** (1) in-text **subheadings shrunk further** (h3 15 / h4 13 /
    h5 12) so they don't rival the doc title. (2) **Heading numbers back on the RIGHT** for Hebrew headings —
    removed the `flex-direction:row-reverse` double-flip; `dir="rtl"` on the `<h>` now places the `.dp-hnum` on the
    right naturally (`.dp-h[dir=rtl]{text-align:right}`). (3) **TOC pin now truly works**: pinned = `position:sticky;
    top:56px` (rides under the sticky doc header), a **"Pinned" pill** + filled navy pin rotated 45° show it's stuck;
    clicking the header while pinned drops the list as an absolute dropdown (`.dp-toc.pinned.open .dp-blk-body{display:
    block!important}` beats `.collapsed`). Unpin returns it inline. (4) **TOC labels**: Hebrew on top (black, `.dp-toc-he`
    `order:1`), English translation below (gray, `.dp-toc-en` `order:2`); English-only entries render gray
    (`.dp-toc-only`). (5) **Footer links static** — no hover color shift (`.dp-colophon a,a:hover{color:cyan-deep}`).
    (6) **Sticky-note flags reverted to the arrow-tab shape** (same `clip-path` as the `.kc-tcol` colour swatches), still
    living in the LEFT margin lane, on any line. (7) **App now boots directly on the Project Startup document** — `init()`
    ends by `switchWS(1)` + `KC.select` on the `[data-doc="project-startup"]` node, so the mockup opens on the rich
    DocPage. **The standalone `Project Startup Document.html` demo file was DELETED** (redundant duplicate — the app is
    now the single source; no more parallel edits). Verify only via `EasyBIM Knowledge Center.html`.
    **Refinement pass 4 (this session), per user:** (1) the two big intro headings (`הקדמה`, `אופן פעולה` = the only
    `.dp-h2`) shrunk to 17px (were fighting the title); the numbered subheadings kept. (2) **TOC pin fixed** — root
    cause was `.dp-blk{overflow:hidden}` clipping the pinned dropdown; `.dp-toc.pinned{overflow:visible}` + reworked
    `DP.togglePin`/`DP.tocToggle` so a pinned TOC still expands/collapses on header-click. The **"Pinned" pill was
    removed** (only the filled navy 45° pin indicates the stuck state). (3) **Footer fully static** — every item now
    renders identical gray (`.dp-colophon a{color:var(--dp-ink2)}` for all states), links only carry `cursor:pointer`
    (real hrefs wired later); no color/opacity shift on hover. (4) **Sticky-notes get a left/right margin choice** —
    record gains `side:'l'|'r'` (defaults to the line's text direction, so Hebrew → right), the popover has an L/R
    segmented toggle (`KC.tabSide`, align-left/align-right icons), and `.kc-tab.side-r` mirrors the arrow into the
    RIGHT gutter; docpage lines now pad both sides. (5) App start now uses `KC.goTo(WS[1][1],'DXXXX - Project Startup')`
    **plus an explicit `KC.select(row)`** (goTo only highlights in the tree; select is what opens the DocPage in c2),
    on an 80ms post-init timeout.
    **Refinement pass 5 (this session), per user:** (1) **TOC pin icon** is now an inline pushpin **SVG with a needle**
    (`.dp-pin-ico`, lucide `pin` path baked in so the needle shows regardless of lucide version) instead of `<i data-lucide=pin>`;
    still rotates 45° when pinned. (2) **Footer icons unified** — LinkedIn/Facebook redrawn as **outline (stroke) SVGs**
    (lucide brand paths, `fill:none;stroke:currentColor`) so their weight matches the thin lucide phone/mail/globe; the
    **middle divider was removed** (all six items now one uniform row); confirmed no white-on-hover (`.dp-fc:hover{color:#fff}`
    deleted) so nothing disappears. (3) **Sticky-notes reworked to two-sided/symmetric:** the L/R popover toggle
    (`KC.tabSide`/`.kc-tside`) was **removed**; instead **`side` is now part of the bookmark key** (`bkEq`/`findBk`/
    `isBookmarked`/`toggleBookmark` all take a `side` arg for line-level `pIdx!=null`), so a line can hold an independent
    sticker in BOTH margins. `bkInjectInto` injects **two** hover add-arrows per line (`.kc-bm-l` left / `.kc-bm-r` right,
    each `data-side`); `ensureTab`/`applyLineBk` build/remove one `.kc-tab.side-l` + one `.kc-tab.side-r` per line and
    toggle `.bk-l`/`.bk-r` (which hide that side's add-arrow). Stickers made **more compact** (tab 22×15, arrow 15×11) and
    the **paragraph highlight was removed** (the old `.bk-set` row tint / inset bar is gone — just the flag). Popover keeps
    only color swatches + Remove. `.doc-p` padding made symmetric (`0 34px`). Download/save clones strip `bk-l`/`bk-r` too.
    (4) **In-body heading numbers now always on the RIGHT** even for English headings — `blocksHTML` emits `dir="rtl"` on
    every `<h>` (only the inner `.dp-htx` keeps its language dir), so numbers align to one side. (5) **Single bullet** in
    unordered lists — `.dp-list{list-style:none}` killed the native disc that doubled with the custom `.dp-ul>li::before`.
    (6) **Versions box now `collapsed` by default** on open (`class="dp-blk dp-versions collapsed"`); expand via header.
    **Refinement pass 6 (this session), per user:** (1) **TOC pin redrawn** as an explicit 3-path thumbtack SVG
    (`.dp-pin-ico`: top cap bar + body collar + a long straight **needle** `M12 12v8`) — the old lucide-`pin` path read as
    incomplete. (2) **Footer icons now use the brand navy→cyan gradient** ("перелив"): `DP.colophonHTML` prepends a hidden
    `<linearGradient id="dpGrad">` def and `.dp-colophon .dp-fc .lucide,.dp-colophon .dp-fc-svg{stroke:url(#dpGrad)}` paints
    every footer glyph (lucide + the LinkedIn/Facebook outline SVGs) with the gradient, matching the app's icon tiles.
    (3) **Right-side stickers now pin to the field, not the line start.** Root cause: RTL sub-paragraphs (`.dp-p.dp-sub`,
    `dir=auto`→rtl) turned `margin-inline-start:16px` into margin-**right**, pulling the box's right edge (and its sticker)
    inward while the left edge stayed put. Fix (docpage-scoped, higher specificity): `.kc-docpage .dp-body>.dp-p.dp-sub{
    margin-inline-start:0;padding-inline-start:50px}` (+`.dp-list.dp-sub` 54px) — indent now via padding so the border-box
    edge stays at the column margin; all right tabs align on one vertical (verified: normal + sub both land at the same x).
    **Refinement pass 2 (this session), per user feedback:** (1) **bilingual in-body headings reverted** — Hebrew
    headings render in their **natural RTL** flow (number on the right, `.dp-h[dir=rtl]{flex-direction:row-reverse}`);
    translation lives ONLY in the TOC now. (2) In-text **subheadings shrunk** (h3 17 / h4 14 / h5 12.5) so they don't
    fight the section headers. (3) **Versions** + **TOC** now share ONE collapsible **`.dp-blk`** shell styled like the
    Plan tree's section rows (gradient header bar, icon+label+count, **static** chevron — no rotation; the WHOLE header
    bar toggles via `DP.versToggle`/`DP.tocToggle`). Versions **"Go to change" button removed** — the whole row is
    clickable (`.dp-vrow[onclick]`, hover reveals a `.dp-vgo` arrow) and still flashes the target. (4) **TOC** is
    single-column, **left-aligned regardless of language**, and **dual-language** (English `.dp-toc-en` over Hebrew
    `.dp-toc-he`, both left-aligned — helps future search). The **pin** now actually works: `.dp-toc.pinned` is
    `position:sticky;top:56px` so it rides at the top of the scroll area while you read; pinned it collapses to its bar
    and a header-click drops the list as an overlay; unpin returns it inline. (5) **Document header is sticky**
    (`.dp-tbhead`, `position:sticky;top:0`): the **title** (17px) + the **clickable path** stay in view while scrolling;
    the series·code **classbar** sits just below and scrolls away. (6) blocks made denser again. (7) **Footer reverted to
    light** (`.dp-colophon` transparent, top hairline, centered), logo `easybim_logo-w.png`, name **"EasyBIM · Innovative
    Engineering"**; order L→R: phone · address · mail (all **non-clickable**) — divider — site · LinkedIn · Facebook
    (**clickable**, brand icons are inline SVG since lucide dropped `linkedin`/`facebook`). (8) Author name corrected to
    **Reut Hefetz** in the versions table. (9) **Sticky-note flags restyled to a LEFT margin lane** (`.kc-docpage`-scoped):
    a bookmark-ribbon flag sits in a padding-left gutter, never over the (RTL) text, and can be planted on **any line —
    paragraphs, headings, and list items** (`bkLines` extended to `.dp-p, .dp-h, .dp-list>li`); set lines get a soft
    cyan row tint + inset accent bar.
11. **Intern tree = assigned material only + catalog browse** — the intern's Plan tree should show ONLY
    material the team lead assigned. Add a toggle to switch the Plan column to the **full KC catalog** (browse
    the whole structure read-only, just to see what exists) with a **"Request access"** button per topic — so
    an intern can proactively ask for adjacent/extra material (self-driven or on the AI mentor's suggestion
    while studying related topics). Design TBD — discuss the flow.
12. **User-selectable languages in the cabinet** — let the user add/choose their languages in the personal
    cabinet; the chosen language then appears everywhere a language option exists — **Translation column,
    Dictionary**, etc. (Drive the RU/EN/HE switchers + any future languages off a per-user language list
    instead of hard-coded sets.)
13. **Consultant / partner (смежник) profile** — a new role like the intern: consultants/subcontractors we
    work with get their own profile with **assigned materials + visible progress**, so we can give them access
    to learning content. For them it should read as a **course on how to work on a project in a BIM
    environment**, with materials **adapted to their perspective** (not the internal-hire onboarding). Fits the
    existing role model (add to `ROLES` + `body.role-*` CSS + per-role material scoping); reuse the intern's
    assignment/progress machinery. Design + adapted-content scope TBD.
14. **Send a KC document to a consultant (projects + email + ACC)** — **BUILT** (`kc-send.js`). The Textbook
    ⋯ menu’s two Download rows were merged into one **Download** (Web page / Editable document sub-menu) and a
    **Send to…** item added in the freed space. `KC.Send.open()` runs a wizard overlay: search the REAL
    platform project base (`window.KC_PROJECTS` — 5-digit codes + Hebrew names) by name/code → choose **Email a
    consultant** or **Attach in ACC** (disabled for projects with `acc:false`) → email path: pick recipients
    (filter by discipline/company/search, multi-select, name locked into the subject) → compose → done; ACC
    path = **hand-off (option C)**: show recent open issues for context + open the issue/project in Autodesk
    (new tab), comment written natively in ACC. Every send logs to `kc_send_log`, shown in the **Log** tab.
    All roles may send. NOT yet: real mail/ACC API posting, per-document sent-byline (ties #9).

## Snapshots
- **`snapshots/v1/`** — frozen, self-contained stable version (HTML + kc-app.js + kc-data.js) as of the
  handoff. Do NOT edit it; it's the rollback point. Keep building on the root files.

## Working notes
- Keep all 3 workspaces in sync when changing a column's structure/markup (edits usually ×3).
- The agent preview iframe was flaky in past sessions; verify via `ready_for_verification`.
