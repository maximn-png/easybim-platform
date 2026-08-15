# Knowledge Center — Development Plan

Status snapshot as of this writing: the "Docs" group of the Monday "Revit" board (42/47 items) is
digested into MongoDB and rendered through the real frontend (locked vanilla-JS design bundle at
`public/kc/*`, wired via the `kc-api.js` seam only). Notebook, line-level bookmarks, and a real
Gemini-powered Translation panel are built and working. This plan covers what's left, split into
three phases.

## Phase A — Employee experience, Revit workspace only

Scope: the single "Revit" workspace/board (all 6 Monday groups: Docs, Videos, MEP, Families,
Dynamo, Reference — 97 items total), for the regular employee role. Team Lead, other workspaces,
and an in-app authoring editor are explicitly out of scope here (see Phase B/C).

| # | Item | Notes | Estimate |
|---|------|-------|----------|
| 1 | General digest-provider abstraction: Google Docs (existing) + new `.docx` provider (mammoth.js) | Closes out the 5 problem "Docs" items — 4 are real uploaded `.docx` files (confirmed via Drive API: BOQ, Design Collaboration, Kinship Plugin, Define ARC Background, all `application/vnd.openxmlformats-officedocument.wordprocessingml.document`); 1 ("Export Revit to dwg") is a genuinely broken/unshared file link — not fixable in code, needs the Monday board owner to reattach the file. Built as a pluggable provider (same Block Contract output, same Mongo `Document` model) so future formats are cheap to add — not a one-off hack. | 4–6h |
| 2 | MEP group: 4 real Google Docs | Same existing pipeline, no new code. | 0.5h |
| 3 | Videos group: 29 Google Drive-hosted videos | Reuse the already-built `KC.renderLinkCard`/`KC.linkCardEl` component (`kc-app.js:1995-2094`) — hover-preview link card, opens in new tab, no in-page player needed. `cardMeta()` only auto-detects YouTube/PDF today, so Drive-video detection is added via the `kc-api.js` seam (same monkey-patch pattern used elsewhere). | 1.5–2.5h |
| 4 | Families group: 8 YouTube videos | Already fully handled by the existing link-card component (auto thumbnail + oEmbed title). | 0.5–1h |
| 5 | External reference links (3: Autodesk help doc, a blog post, LinkedIn Learning) | Already fully handled by the existing link-card component's generic `link` type. | 0.5h |
| 6 | Remaining Drive files of unknown type (5 records across Families/Dynamo/Reference) | Check real mimetype via Drive API first, then render as an image (`fig` block) or a link/PDF card as appropriate. | 1–1.5h |
| 7 | Notebook: verify per-document behavior holds for the new (video/link/file) content types | Notebook keys off `KC.DocPage.data.sourceId`; needs a quick check it still resolves correctly for non-text documents. | 1h |
| 8 | "Save as topic" — real, private persistence | Currently 100% in-memory (`kc-app.js:1203`, no persistence at all — lost on refresh). Build a private, per-user (`ownerId`-scoped) Mongo collection; matches the spec's "Personal document" model (Data Model.md). | 2–3h |
| 9 | Wire Claude into apps/knowledge + a shared `askAI()` abstraction | Lets any feature pick Gemini or Claude per call/preference (cost vs. quality). Claude key already used in apps/agents — same shared-drive credential-retrieval pattern. | 2h |
| 10 | EasyBIM Assistant — "Topic Mentor" mode (scoped to the open document) | Real AI call replacing the current canned responses in `KC.mentorSend`/`mAnswer` (`kc-app.js:1099-1109`); same scoping pattern as Translation. Both models selectable via #9. | 3–4h |
| 11 | EasyBIM Assistant — general "Assistant" mode | Real RAG across all digested Revit documents (chunking + embeddings + vector search — likely MongoDB Atlas Vector Search, same cluster already in use) + a simplified web fallback (the model's own general knowledge, clearly labeled "not from our knowledge base" — matches PRD.md's actual spec language; NOT a live web-search tool integration, which was never spec'd and is deferred to Phase B for a "properly polished" pass). Biggest and least certain item in Phase A. | 6–10h |
| 12 | Assistant helper-tool buttons: Summary, Checklist, Quiz, Flashcards, Resources | Currently canned (`M_TOOLS`, `kc-app.js:1110-1121`). Real AI calls, can ship incrementally after #10/#11 land — not a blocker. | 4–5h |
| 13 | Reveal in Plan (`KC.goTo`) — verify against real content | Pure tree-navigation, no backend call per spec (Integration Points.md/API Endpoints.md) — likely already works, needs confirmation against real (not mock) documents. | 0.5–1h |
| 14 | Send / Downloads (`kc-send.js`) — verify against real content | Confirm document export/download is generated from real block content, not just the original mock example. | 2–3h |
| 15 | Live tree/board sync (replacing the manual `digestRevitDocs.ts` re-run) | The tree (`kc-data.js`) is currently a static, script-regenerated snapshot. Move it to a Mongo-backed "Tree" collection served dynamically (writing to `public/` at request time won't work on serverless/Vercel, so this needs a real route, not a file-write). This is the previously-deferred "live Monday sync" work, revived because Phase A now depends on self-service imports actually being self-service. | 3–5h |
| 16 | "Refresh this document" button for already-`ready` documents | The frontend already has a built, spec'd self-service **"Import into Knowledge Center"** button for not-yet-imported documents (`kc-states.js:107-114`, `KC.States.notImported`/`doImport` — real, not something to build). No equivalent exists yet for re-digesting an already-imported document after its source changes; the import API already supports upsert, just needs a UI trigger via the `kc-api.js` seam. | 1–1.5h |
| 17 | Final QA pass across all of Phase A | All 6 Revit groups, both AI models, all 3 translation languages, both Assistant modes. | 2–3h |

**Phase A total: ~34.5–51 hours** of active development/testing time (not calendar time).

### Key facts this plan is grounded in
- Monday board "Revit" (id `3178661685`), 97 items across 6 groups — confirmed via live Monday API query, not assumed.
- Content-type breakdown per group confirmed by inspecting real `files1` column values (Google Docs links vs. Drive file links vs. YouTube vs. external URLs).
- Cross-checked against the original spec (`design_handoff_knowledge_center_backend/{README,PRD}.md` and `spec/*.md`):
  - Video/non-text content types: **not in the original spec at all** — genuinely new scope, requires an explicit Block Contract version bump per the spec's own stated process (propose a spec addition first).
  - EasyBIM Assistant two-mode design (topic-bound + general, KB-priority-with-labeled-fallback): **fully spec'd and already mocked in the frontend** — safe, matches Release 1.
  - A live web-search tool for the Assistant: **not spec'd** (spec only describes a vague labeled fallback) — descoped from Phase A to keep #11 smaller; can be added properly in Phase B.
  - Save-as-topic (private/per-user), Reveal in Plan, Send/Downloads: **all spec'd for Release 1 and already built as frontend mock** — cheap to wire to real data, moved into Phase A from an earlier draft that had them in Phase B.
  - Team Lead review/approval console and threaded comments: **spec'd but explicitly Release 2** — correctly kept in Phase B.

## Phase B — Scale to the rest of the Knowledge Center

- All workspaces (not just Revit) — repeat the digest pipeline for whichever other Monday boards/groups belong there.
- Team Leader role: review console, approve/reject, tree markers, version history from approvals (Release 2 per the original spec).
- Onboarding role.
- Threaded comments on proposals.
- EasyBIM Assistant, "properly polished" pass: a real live web-search tool (not just a labeled general-knowledge fallback).
- Anything else surfaced once Phase A is in real use.

## Phase C — In-app authoring editor

Goal: end the Google Docs/Monday dependency for *new* content — author documents directly inside
the Knowledge Center, already in the right shape, no digest step needed. Old linked files gradually
become archival as they're superseded by natively-authored documents.

- Matches the original Architecture Brief's recommendation (BlockNote or Tiptap, MongoDB storage,
  Atlas Vector Search, Claude) — largely the same direction Phase A already converges on for
  storage/AI, just adding the missing "write" half.
- **Recommendation: Tiptap over BlockNote.** BlockNote is fundamentally a React component library;
  this app's frontend is intentionally plain vanilla JS/HTML with no build step and no React.
  Tiptap's core (`@tiptap/core` + `@tiptap/pm`) is framework-agnostic and works without React,
  which is the deciding factor here — not "faster to start," which is BlockNote's actual advantage.
- This is a new UI surface that doesn't exist anywhere in the current locked design bundle or spec
  — it needs real UI design work, not just backend wiring through the `kc-api.js` seam like
  everything in Phase A/B. Treated as its own phase for exactly that reason: it's a different kind
  of work, not a bigger version of the same kind of work.
- Editor output should target the same Block Contract shape already used everywhere else, so
  translation, Notebook, Mentor/Assistant, and search work on natively-authored documents with zero
  changes to those systems.
