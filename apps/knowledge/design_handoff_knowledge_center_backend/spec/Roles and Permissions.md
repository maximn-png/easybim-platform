# Knowledge Center — Roles & Permissions (step 6)

Three roles, one codebase. This document is the contract for what each role may see and do —
including the places where the mockup currently allows more than production should.

Role keys (never rename — they are stored and used in CSS/JS):

| Key | User-facing label | Icon | Who |
|---|---|---|---|
| `intern` | **Onboarding** | `sprout` | new employee going through the learning path |
| `employee` | Employee | `user` | regular staff using the centre as reference |
| `teamlead` | Team Lead | `layout-dashboard` | owns content quality and interns' plans |

`teamlead` was called `admin` in early versions; `kc_role === 'admin'` is migrated on read.

---

## 1. Capability matrix

✓ allowed · — not available · ✓* allowed but see the note

| Capability | Intern | Employee | Team Lead |
|---|---|---|---|
| **Reading** | | | |
| Browse the tree, read official documents | ✓ | ✓ | ✓ |
| Translation panel, dictionary | ✓ | ✓ | ✓ |
| Download a document / folder | ✓ | ✓ | ✓ |
| Send a document (email / Forma hand-off) | ✓ | ✓ | ✓ |
| **Learning** | | | |
| Learning progress (rings, bars, %) | ✓ | — | — |
| "Mark as done" on a topic | ✓ | — | — |
| "Continue learning" + progress sections in the cabinet | ✓ | — | — |
| Mentor: Quiz and Flashcards tools | ✓ | — | — |
| Mentor: summary / checklist / find resources | ✓ | ✓ | ✓ |
| Mentor opens in | Topic tutor | Assistant | Assistant |
| "New for you" assignments, accept an assignment | ✓ | — | — |
| **Personal workspace** | | | |
| Create personal folders / files, edit and save them | ✓ | ✓ | ✓ |
| Notebook (autosave) | ✓ | ✓ | ✓ |
| Bookmarks / sticky notes | ✓ | ✓ | ✓ |
| **Contributing** | | | |
| Suggest an edit / addition on an official document | ✓ | ✓ | ✓* |
| Suggest a personal document to the Knowledge Center | ✓ | ✓ | ✓* |
| Cancel own pending proposal | ✓ | ✓ | ✓ |
| **Review & management** | | | |
| See the review queue (Manage column) | — | — | ✓ |
| Approve / reject a proposal | — | — | ✓ |
| Tree markers for pending changes, ghost nodes, `+N` badges | — | — | ✓ |
| "Document digested with issues" notice | — | — | ✓ |
| Team tab: roster, per-intern progress | — | — | ✓ |
| Assign a topic to an intern / unassign | — | — | ✓ |
| Publish an approved topic into the tree | — | — | ✓ |
| Import a document into the Knowledge Center | — | ✓ | ✓ |
| Re-digest an existing document | — | — | ✓ |
| **Administration (not in the mockup)** | | | |
| Change someone's role | — | — | — † |
| Trigger the Monday structure sync manually | — | — | ✓ |

\* A team lead's own edit applies immediately instead of queueing — but it still writes a proposal
record (`approved`) and a version-log entry, so the audit trail is identical.

† Role assignment belongs to the company directory, not to this app. No role may change roles here.

---

## 2. Ownership rules (independent of role)

Some things are gated by ownership, not by role. A team lead is **not** a super-user for these:

| Object | Who may read | Who may write |
|---|---|---|
| Personal document (custom node) | owner | owner |
| Notebook | owner | owner |
| Bookmarks / sticky notes | owner | owner |
| Mentor threads | owner | owner |
| Personal dictionary terms | owner | owner |
| Own pending proposal | owner + team lead | owner (cancel), team lead (decide) |
| Assignment | assignee + team lead | team lead (create/remove), assignee (accept) |

A team lead sees an intern's **progress**, never their notebook, notes or chats. This is a deliberate
boundary — the console is for regulating assigned material, not for surveillance.

---

## 3. How the roles are implemented (front end)

One codebase, role as a switch — never a forked file.

1. **Source of truth.** `ROLES = {intern, employee, teamlead}` at the top of `kc-app.js`, with flags
   `{label, icon, progress, markDone, mentorStart}` and, for `teamlead`, an `identity` block.
   The active role comes from `KC.API.getRole()`.
2. **Visual differences → `body.role-*` CSS.** An inline script sets `body.class = role-<role>`
   before first paint (no flash). Reference roles hide progress UI, learning cabinet sections and
   the learning-only mentor tools.
3. **Logic differences → the `ROLES` table.** `markDone` gates the tree menu item; `mentorStart`
   sets the mentor's opening mode; `progress` toggles progress computation.
4. **Team-lead extras** are additive: the Manage column (`kc-teamlead.js`), extra items in the
   tree "⋯" menu, tree markers, and the issues notice.

To change something for **all** roles, edit the shared markup once. To change **one** role, edit its
row in `ROLES` and/or its `body.role-*` CSS. That is the whole model.

---

## 4. What production must add

The mockup is deliberately permissive so the design can be reviewed from any perspective. Before
release:

1. **Role comes from identity, not from storage.** Today `kc_role` in the browser decides. In
   production the role arrives with the session (`GET /me`) and the switcher is removed —
   or kept only for staff with an explicit override flag.
2. **Server-side enforcement.** Every row in the matrix above must be checked on the server
   (`API Endpoints.md` carries the same I/E/L columns). Hiding a button is UX, not security.
3. **One gate in the code.** If a role switcher survives for demos, gate it inside `KC.switchRole` —
   the single place that writes the role.
4. **Ownership checks** on every personal-object endpoint (`403`, not a silent empty result).
5. **Audit trail.** Approvals, rejections, assignments, imports and re-digests are recorded with
   actor and timestamp — the version log already does this for content changes.
6. **Multiple team leads.** The mockup has one reference team lead and one reference intern. Nothing
   in the model assumes singletons, but the Team tab must handle "interns I supervise" rather than
   "all interns" once there is more than one lead.
