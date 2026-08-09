# PRD — EasyBIM Knowledge Center

Status: approved for build · Owner: Polina · Target for Release 1: 1 month
Frontend: complete (see `design_handoff_knowledge_center_backend/frontend/`)
Backend: to be built

---

## 1. Summary

The EasyBIM Knowledge Center is an internal platform where the team reads, works with, and
improves the company's own engineering documentation, with an AI mentor alongside every page.

Today that documentation lives as Google Docs in Drive, indexed by hand in Monday.com. It is
hard to search, impossible to keep consistent, and unusable as onboarding material. The
Knowledge Center replaces reading with working: the document opens in a structured reading
column, the user's notes sit next to it, a translation panel handles the Russian / English /
Hebrew reality of the team, and an AI mentor answers questions from EasyBIM's own material
rather than the open web.

The product ships as an app inside the existing `easybim-platform` Turborepo, behind the
Portal sign-in.

---

## 2. Goals

- **Make company knowledge findable and usable.** One place, structured, searchable, with an
  assistant that answers from it.
- **Make documentation self-improving.** The people who use a document are the ones who spot
  its errors; they must be able to propose a fix without leaving the page.
- **Remove the language barrier.** RU / EN / HE side by side, on the same document.
- **Prepare for onboarding.** New hires eventually get an assigned path through this material
  — but that is Release 2, and it must not delay Release 1.

## 3. Non-goals

- Not a replacement for Monday.com. Monday remains the source of truth for *structure*; we
  sync one-way and never write back.
- Not a Google Docs editor. Documents are digested once into our own format; the originals in
  Drive are left untouched. **Two-way sync is explicitly out of scope.**
- Not a public or client-facing product. Internal only.
- Not a full LMS. No certificates, no grading, no course authoring.

---

## 4. Users

| Role | Who | Release |
|---|---|---|
| **Employee** | The BIM team — engineers who need a reference while working | **R1** |
| **Onboarding** (key `intern`) | New hires following an assigned learning path | R2 |
| **Team Lead** | Owns content quality and the onboarding of others | R2 |

Release 1 test group: **5–10 people, the whole BIM team.** Everyone signs in as Employee.

---

## 5. Release 1 — Employee mode, real connections

The point of Release 1 is to prove the hard parts: that real Monday structure, real digested
Google Docs, real AI, and real sending work together and are worth using daily. The role
system, progress tracking and review console are deliberately deferred — they add product
surface, not risk reduction.

### In scope

**Access**
- Sign-in through the existing Portal identity. Every authenticated user gets the Employee
  role. No role switcher in the UI.

**Reading**
- Three workspaces: Logistics & Administration, BIM Methodology & Tools, EasyBIM Teams.
- Plan column: the content tree, synced one-way from the Monday "Knowledge Center" workspace.
- Textbook column: digested documents rendered from our own stored records, with table of
  contents, numbered sections, callouts, figures with zoom, version log, and byline.
- Document statuses handled honestly: `ready`, `importing`, `not_imported`, `error`. A topic
  that has not been digested yet shows a link out to the original — the old Drive center keeps
  working alongside.
- Search across the tree.
- Export: Web page and Editable document.

**Personal work**
- Notebook: one free-writing document per workspace, autosaved.
- Personal documents: the user's own topics and folders in the tree, editable in place.
- Sticky-note bookmarks on any line, with a written note and a color.
- Dictionary of saved terms.
- Resume position: "Continue where you left off" per workspace.

**Translation**
- Real AI translation, RU / EN / HE, side by side with the document, heading-anchored
  scrolling. Language choice persists per user.

**AI Mentor**
- Two modes: topic mentor (bound to the open document) and free assistant.
- **Answers from EasyBIM's own knowledge base first**, across all digested documents, with
  clickable links to the source topic. The open web is a fallback, and must be labeled as such
  in the answer.
- Employee tools only: summary, checklist, find resources. Quiz and flashcards are Onboarding
  features and stay hidden.
- Chat history per topic.

**Sending**
- Send a document to a project: pick project → route → recipients → compose → send.
- Email route: real send, with the document attached.
- ACC route: hand-off to Autodesk Forma — we show the project's open issues for context and
  open Forma in a new tab; the comment is written natively there. We do not rebuild Autodesk's UI.
- Every send is logged and visible in the Log tab.

**Suggestions (submit-only)**
- An employee can select text on an official document and propose a change or an addition.
- Proposals are stored and the author sees their own as "pending".
- **There is no review console in R1.** The product owner sees all incoming proposals as a
  simple read-only list (a single page, not the Team Lead console). They accumulate for
  Release 2, when approving them becomes a real flow.
- Rationale: the test group *will* find errors in the content, and losing that feedback is
  worse than not being able to act on it immediately.

### Out of scope for Release 1

Onboarding role and its learning path · progress tracking, rings, bars and percentages ·
assignments and "New for you" notifications · quiz and flashcards · the Team Lead console ·
the review queue, approvals and tree markers · version rows generated by approvals ·
threaded comments on a proposal · suggestions on personal documents.

The frontend already hides all of this under the Employee role, so removing it from R1 is a
matter of not enabling it — not of building anything.

### Release 1 is done when

1. A BIM engineer signs in through the Portal and reads a real digested document.
2. The tree matches Monday, and a change in Monday appears after a sync run.
3. 10–15 real documents are digested, checked by hand, and render correctly — figures,
   sections and tables included.
4. The mentor answers a real question about EasyBIM's own methodology and links to the topic
   it came from.
5. Translation of a real document into Hebrew is good enough to work from.
6. A document is emailed to a real consultant on a real project, and one ACC hand-off is made.
7. All personal state survives a different browser and a different machine.
8. Five to ten people have used it for two weeks and their proposals are sitting in the list.

---

## 6. Release 2 — Onboarding and content governance

Scope, in the order it should be built:

- **Team Lead role and console** — content review queue, approving and rejecting proposals,
  the version log fed by approvals, tree markers showing where proposals sit.
- **Onboarding role** — the learning path, progress as a percentage *of assigned material*
  (not of the whole bank), block progress bars, status dots, mark-as-done.
- **Assignments** — a lead assigns topics to a new hire; the hire gets a "New for you" section
  and tree attention marks, and accepts them.
- **Onboarding mentor tools** — quiz and flashcards.
- **Team view** — per-person progress mirroring their own cabinet.

Nothing in Release 2 requires reopening Release 1 decisions. It is additive.

---

## 7. Integrations

| System | Direction | Release | Notes |
|---|---|---|---|
| Monday.com | Read only | R1 | Boards/groups → tree nodes. Scheduled + manual sync. Never written to. |
| Google Docs | Read once | R1 | Structured read via the Docs API, mapped to our block model, stored as our record. |
| Email (Workspace / Graph) | Send | R1 | Document attached, standard signature, logged. |
| Autodesk ACC / Forma | Read + open | R1 | Show open issues for context, open Forma in a new tab, log the hand-off. |
| AI — mentor | Both | R1 | Retrieval over digested documents first, web fallback, always cites the source. |
| AI — translation | Both | R1 | RU / EN / HE, per document, cached. |

---

## 8. Content operations

Digesting is a per-document, semi-manual quality gate, not a bulk import:

1. Pick the document in Monday, confirm it links to a Google Doc.
2. Run the digest. It produces block JSON validated against the block contract.
3. **A human opens the result and compares it to the original.** Figures, tables, numbered
   sections and Hebrew RTL text are where conversion breaks.
4. Only then is the topic marked ready in the tree.

Budget roughly half a day per complex document for the first few, dropping sharply once the
converter has been corrected against real material. 10–15 documents for the R1 launch.

---

## 9. Permissions

Enforced **server-side**, always. The client's role is never trusted.

Ownership overrides role: a person's notebook, personal documents, bookmarks and mentor chats
are theirs alone. Even a Team Lead in Release 2 sees progress but never that content. Requests
for someone else's personal data return `403`.

---

## 10. Risks

- **One month with five live integrations is tight.** The realistic critical path is Monday →
  Google Docs digest → mentor. If something has to slip, it should be the ACC/Forma hand-off
  and then email — both are valuable but neither blocks daily reading.
- **External access is the long pole, and it is not engineering.** Monday token, a Google Cloud
  project with Docs and Drive APIs and a service account with access to the KC folder, a mail
  sender, Autodesk credentials, an AI key. Start these on day one.
- **Digest quality on Hebrew RTL documents with many figures** is the most likely technical
  surprise. Validate against the hardest real document early, not the easiest.
- **Content volume decides whether the product feels useful.** Ten good documents beat fifty
  bad conversions; but below roughly ten, the mentor has too little to answer from.
- **Organizational agreement** that the Drive-based center becomes an archive must be secured
  before people start relying on the digested copies, or the two will drift.

---

## 11. Open questions

- Which Monday workspace and boards exactly constitute the tree, and who confirms the mapping?
- Which 10–15 documents are the R1 set, and who signs off each conversion?
- Which mail identity sends documents — a personal account or a shared `office@` sender?
- Retention of mentor chat history: kept indefinitely, or trimmed?
- UI language: Russian only for R1, or is an English interface needed for part of the team?
