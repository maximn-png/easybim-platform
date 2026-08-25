# Knowledge Center — API Endpoints (step 4)

Every UI action that needs the server, the call behind it, and who may perform it. Entity shapes
live in `Data Model.md`; block format in `Block Contract.md`; the front-end seam is `kc-api.js`
(`KC.API.*` — the method named in the last column is the only place a call is made).

Conventions: base path `/api/v1`. JSON in and out. Auth by session cookie. Roles: **I** intern,
**E** employee, **L** team lead. `—` means the role has no access.
Standard errors: `400` validation, `401` not signed in, `403` no permission, `404` not found,
`409` conflict (stale `version`), `422` contract violation, `5xx` server. Every error body:
`{ "error": { "code": "…", "message": "…", "details": {…} } }`.

---

## 1. Session & user

| UI action | Method + path | Response | I | E | L | KC.API |
|---|---|---|---|---|---|---|
| App start | `GET /me` | user + role + preferences | ✓ | ✓ | ✓ | `getRole`, `getPref` |
| Switch role (design-time only) | `PUT /me/role` `{role}` | user | — | — | ✓* | `setRole` |
| Change a preference | `PATCH /me/preferences` `{…}` | preferences | ✓ | ✓ | ✓ | `setPref` |

\* Free switching exists only in the mockup. In production the role comes from the directory and
`PUT /me/role` should not ship — gate it in `KC.switchRole` (one place).

## 2. Tree (structure)

| UI action | Method + path | Response | I | E | L | KC.API |
|---|---|---|---|---|---|---|
| Render a workspace tree | `GET /workspaces` · `GET /tree?workspaceId=` | nodes (flat, with `parentId`, `order`) | ✓ | ✓ | ✓ | `getTree` |
| Add a personal folder / file | `POST /tree/nodes` `{workspaceId,parentId,kind,title}` | node (`origin:"personal"`) | ✓ | ✓ | ✓ | *new* `createNode` |
| Rename / move / delete a personal node | `PATCH`/`DELETE /tree/nodes/:id` | node / `204` | ✓† | ✓† | ✓† | *new* `updateNode` |
| Mark a topic done | `PUT /progress/:nodeId` `{state}` | progress | ✓ | — | — | *new* `setProgress` |
| Publish an approved new topic | `POST /tree/nodes` `{origin:"official", documentId}` | node | — | — | ✓ | `publishToTree` |
| Structure sync from Monday | `POST /admin/sync/monday` | job summary | — | — | ✓ | — (scheduled job) |

† Only the owner of a personal node. Official (Monday-origin) nodes are never editable through the
API — Monday is the source of truth for structure.

## 3. Documents

| UI action | Method + path | Response | I | E | L | KC.API |
|---|---|---|---|---|---|---|
| Open a topic | `GET /documents/:sourceDocId` | `{status, doc?, progress?, sourceUrl?, message?}` | ✓ | ✓ | ✓ | `getDocument` |
| "Import into Knowledge Center" | `POST /documents/:sourceDocId/import` | `{status:"importing", progress}` | — | ✓ | ✓ | `importDocument` |
| Poll an import | `GET /documents/:sourceDocId` (same call) | as above | ✓ | ✓ | ✓ | `getDocument` |
| Apply an approved change | `POST /documents/:id/changes` `{type,target,text,baseVersion}` | `{version, versionEntry}` | — | — | ✓ | `applyDocumentChange` |
| Version log | `GET /documents/:id/versions` | version entries | ✓ | ✓ | ✓ | `getVersionLog` |
| Download (web page / editable) | client-side render of the document record | — | ✓ | ✓ | ✓ | — |

`GET /documents/:sourceDocId` is the digest cache: it returns the stored copy when there is one and
`not_imported` when there is not — the front end never decides. `409` when `baseVersion` is stale.
`422` when the digested blocks violate the contract (the response carries the issue list).

## 4. Personal documents & notebook

| UI action | Method + path | Response | I | E | L | KC.API |
|---|---|---|---|---|---|---|
| Open a personal file | `GET /documents/custom/:nodeId` | personal document | ✓‡ | ✓‡ | ✓‡ | `getCustomDocs` |
| Save it | `PUT /documents/custom/:nodeId` `{title,html}` | personal document | ✓‡ | ✓‡ | ✓‡ | `saveCustomDocs` |
| Load the notebook | `GET /notebooks/:workspaceId` | notebook | ✓ | ✓ | ✓ | `getNote` |
| Autosave the notebook | `PUT /notebooks/:workspaceId` `{html}` | `{updatedAt}` | ✓ | ✓ | ✓ | `saveNote` |

‡ Owner only. Autosave fires ~650 ms after typing stops — accept frequent whole-body writes, or
add `PATCH` if payload size becomes a problem.

## 5. Change proposals (review pipeline)

| UI action | Method + path | Response | I | E | L | KC.API |
|---|---|---|---|---|---|---|
| Suggest an edit / addition | `POST /suggestions` `{type,documentId,target,proposed,note,baseVersion}` | proposal (`pending`) | ✓ | ✓ | ✓ | `addSuggestion` |
| Suggest a whole new document | `POST /suggestions` `{type:"new",workspaceId,path,title,document}` | proposal | ✓ | ✓ | ✓ | `addSuggestion` |
| My pending proposals (re-render cards) | `GET /suggestions?mine=true` | proposals | ✓ | ✓ | ✓ | `listSuggestions` |
| Cancel my proposal | `DELETE /suggestions/:id` | `204` | ✓§ | ✓§ | ✓ | `removeSuggestion` |
| Review queue | `GET /suggestions?status=pending` | proposals + author + path | — | — | ✓ | `listSuggestions` |
| Approve | `POST /suggestions/:id/approve` | `{proposal, document?, versionEntry?, node?}` | — | — | ✓ | *new* `approveSuggestion` |
| Reject | `POST /suggestions/:id/reject` `{reason?}` | proposal | — | — | ✓ | *new* `rejectSuggestion` |

§ Only while `status = pending` and only the author's own. Approve of an `edit`/`add` must be
**atomic**: apply the change, bump `document.version`, append the version entry, set the proposal to
`approved` — one transaction. Approve of a `new` creates the document and the tree node.
A team lead's own edit applies immediately (no queue) but still writes both the proposal record
(status `approved`) and the version entry, so the audit trail is complete.

## 6. Assignments & progress

| UI action | Method + path | Response | I | E | L | KC.API |
|---|---|---|---|---|---|---|
| Assign a topic to an intern | `POST /assignments` `{internId,nodeId}` | assignment | — | — | ✓ | `saveAssignments` |
| Unassign | `DELETE /assignments/:id` | `204` | — | — | ✓ | `saveAssignments` |
| "New for you" list | `GET /assignments?mine=true&accepted=false` | assignments | ✓ | — | — | `listAssignments` |
| "Got it" (accept) | `POST /assignments/:id/accept` | assignment | ✓¶ | — | — | *new* `acceptAssignment` |
| Team roster + progress | `GET /team/interns` | users + progress summary | — | — | ✓ | *new* `listInterns` |
| One intern's progress detail | `GET /team/interns/:id/progress` | per-workspace + per-block % | — | — | ✓ | *new* `getInternProgress` |

¶ Assignee only. All percentages are **% of assigned material** — the server computes them so the
cabinet and the team-lead card can never disagree.

## 7. Bookmarks

| UI action | Method + path | Response | I | E | L | KC.API |
|---|---|---|---|---|---|---|
| List mine | `GET /bookmarks` | bookmarks | ✓ | ✓ | ✓ | `listBookmarks` |
| Add / edit note or colour | `POST /bookmarks` · `PATCH /bookmarks/:id` | bookmark | ✓ | ✓ | ✓ | `saveBookmarks` |
| Remove | `DELETE /bookmarks/:id` | `204` | ✓ | ✓ | ✓ | `saveBookmarks` |

Personal and owner-scoped; never included in exports or sends.

## 8. Send / hand-off

| UI action | Method + path | Response | I | E | L | KC.API |
|---|---|---|---|---|---|---|
| Project search | `GET /projects?q=` | projects (code, name, `acc`) | ✓ | ✓ | ✓ | *new* `searchProjects` |
| Consultants on a project | `GET /projects/:code/consultants` | consultants | ✓ | ✓ | ✓ | *new* `listConsultants` |
| Open Forma issues (context) | `GET /projects/:code/issues` | issues | ✓ | ✓ | ✓ | *new* `listIssues` |
| Email a consultant | `POST /sends` `{channel:"email",documentId,projectCode,recipients,subject,body}` | send record | ✓ | ✓ | ✓ | `sendDocument` |
| Log an ACC/Forma hand-off | `POST /sends` `{channel:"acc",documentId,projectCode,issueId}` | send record | ✓ | ✓ | ✓ | `sendDocument` |
| Send journal | `GET /sends` | send records | ✓ | ✓ | ✓ | `getSendLog` |

Projects, consultants and issues are **read-only reference data** from the EasyBIM platform base —
this app never writes them. The comment itself is written natively in Autodesk Forma; we only record
the hand-off.

## 9. Mentor, translation, dictionary

| UI action | Method + path | Response | I | E | L | KC.API |
|---|---|---|---|---|---|---|
| Load a thread | `GET /mentor/threads?workspaceId=&mode=&nodeId=` | thread | ✓ | ✓ | ✓ | `getMentorThreads` |
| Ask | `POST /mentor/ask` `{mode,nodeId,question}` | `{answer, citations[]}` | ✓ | ✓ | ✓ | `askMentor` |
| Persist a thread | `PUT /mentor/threads/:id` `{messages}` | thread | ✓ | ✓ | ✓ | `saveMentorThreads` |
| Translate a document / fragment | `POST /translate` `{documentId?,text?,lang}` | `{blocks?}` / `{text}` | ✓ | ✓ | ✓ | `translate` |
| Dictionary | `GET /dictionary` | terms (global + mine) | ✓ | ✓ | ✓ | *new* `listTerms` |
| Add a term | `POST /dictionary` `{word,definition}` | term (`scope:"personal"`) | ✓ | ✓ | ✓ | *new* `addTerm` |

Mentor answers must prefer EasyBIM's own knowledge base over the web, and `citations` should carry
`nodeId`s so the UI can render them as clickable topic links. Translations are cached per document
and language — do not re-translate on every open.

## 10. Admin / operations

| Action | Method + path | Notes |
|---|---|---|
| Monday structure sync | `POST /admin/sync/monday` | scheduled; one-way, never writes back |
| Re-digest a document | `POST /documents/:id/redigest` | explicit only (overwrites the stored copy — warn: local edits are lost) |
| Contract issue report | `GET /admin/documents/issues` | feeds the team lead's "digested with issues" view |

---

## Cross-cutting rules

1. **One seam.** Every call above is made from `kc-api.js` only. Methods marked *new* are the ones to
   add there when the endpoints exist; the UI keeps calling the same `KC.*` helpers.
2. **Permissions are enforced server-side.** The role table above is the contract; the UI hides what
   a role may not do, but hiding is not security.
3. **Optimistic concurrency.** Anything that changes a document carries `baseVersion`; `409` triggers
   the conflict state (step 7) rather than a silent overwrite.
4. **Timestamps and ids, not display strings.** The API returns ISO timestamps and user ids
   (+ denormalised `name`/`initials`); the UI formats.
5. **Pagination** on `GET /suggestions`, `GET /sends`, `GET /dictionary` (`?limit=&cursor=`) —
   these grow without bound.
6. **Idempotency** on `POST /sends` and `POST /documents/:id/import` (`Idempotency-Key` header), so a
   retried click cannot double-send or start two imports.
