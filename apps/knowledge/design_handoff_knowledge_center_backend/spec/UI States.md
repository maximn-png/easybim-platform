# Knowledge Center — UI States (step 7)

Every screen the app shows when content is **not simply there**. Without these, a front end and a
backend invent different behaviour for the same situation — the most common source of "it works on my
machine".

Implementation: `kc-states.js` (`KC.States.*`) — one set of builders, so a state looks the same in any
column. Preview any of them during review: `KC.States.demo('importing')` in the console
(`loading`, `importing`, `notImported`, `error`, `empty`, `noAccess`, `conflict`).

---

## 1. Document states (wired, real)

`KC.API.getDocument(sourceId)` returns one of four statuses; `openDocPage` renders each. This is the
whole "digest" contract made visible.

| Status | What the user sees | Actions | Notes |
|---|---|---|---|
| `ready` | the document | — | normal path |
| `importing` | "Preparing the document" + progress bar | Check again | bar is indeterminate until the server reports progress |
| `not_imported` | "This document is not in the Knowledge Center yet" | **Import into Knowledge Center**, Open the original | import is employee/team-lead only (see role matrix) |
| `error` | "This document could not be opened" + reason | Try again, Open the original | never a blank column |

`KC.States.loading()` shows while the request is in flight — a **skeleton in the shape of the page**
(heading, lines, figure block), not a spinner in the void, so the layout does not jump.

## 2. Content-level failure (wired, real)

Handled by the block contract (`kc-blocks.js`), not by these builders:

- individual bad block → degrades or disappears, the document stays readable;
- nothing renderable at all → `DP.errorHTML()` "could not be displayed" screen;
- issues present → yellow **"Document digested with issues: N"** strip, team lead only.

## 3. Empty states (builder ready, to be wired per list)

| Where | Title | Sub |
|---|---|---|
| Review queue | Nothing to review | New proposals will appear here. |
| "New for you" | You are all caught up | New assigned topics will show up here. |
| Search in the tree | No topics match | Try a shorter query or check another workspace. |
| Bookmarks | No sticky notes yet | Select a line in a document and plant a note. |
| Send journal | Nothing sent yet | Documents you email or hand off to Forma are logged here. |
| Dictionary period filter | No terms in this period | Switch to Month or All. |
| Mentor thread | (keep the greeting) | — |

Rule: an empty state names **what would appear here and how to make it appear** — never just "empty".

## 4. Permission state (builder ready)

`KC.States.noAccess(what)` — signed in but not permitted. Shown instead of an empty result so the
user is not left guessing: "available to its owner only. Ask a team lead if you think you should see
it." The server must return `403` for these (see `Roles and Permissions.md` §4) — the UI never decides
access by itself.

## 5. Edit conflict (builder ready)

Triggered by `409` from `POST /documents/:id/changes` or `POST /suggestions` when `baseVersion` is
stale. `KC.States.conflict(container, whoChangedIt)` puts an amber banner above the document:
"This document changed while you were editing — reload to see it, then re-apply your change so
nothing is overwritten," with a Reload button.

Deliberately **not** an auto-merge and **not** a silent overwrite: content correctness beats
convenience here.

## 6. Offline / request failure

Any failed request falls back to the `error` state of its own surface (document column, list, wizard
step) with a retry. Nothing is reported as successful until the server confirms it — in particular
sends and approvals.

The Notebook is the one exception worth calling out: its autosave is optimistic (the "Saving… /
Saved" status). With a real backend, a failed autosave must flip that status to a visible
**"Not saved — retrying"**, never stay on "Saved".

## 7. Long-running work

| Case | Pattern |
|---|---|
| Document import | `importing` state + poll `getDocument` |
| Monday sync | invisible to users; last good tree stays served |
| Translation of a whole document | inline spinner in the translation panel; falls back to the cached version |
| Mentor answer | typing indicator in the thread |
| Folder download (many documents) | progress in the download dialog, cancellable |

---

## Checklist for whoever wires the backend

1. Every list endpoint can legitimately return zero rows — wire the empty state, do not leave a blank
   panel.
2. Every mutation can return `403` and `409` — wire `noAccess` and `conflict`.
3. Every document open goes through the four statuses — no other path may render the Textbook.
4. Never show a spinner where a skeleton is possible; never show a blank column where an error is
   possible.
