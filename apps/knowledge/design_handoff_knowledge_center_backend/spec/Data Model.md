# Knowledge Center — Data Model (step 3)

Every entity the front end reads or writes, in the shape the backend should store it. Each section
gives the **target record** (what the API returns / accepts) and the **current mock shape** (what
`KC.API` reads from localStorage today), so the mapping is unambiguous.

Conventions: `id` — server-generated string; timestamps ISO 8601 UTC (`2026-07-26T09:14:00Z`);
`user` references are user ids, with a denormalised `name` + `initials` in responses so the UI does
not need a second call. All ids are opaque strings — the front end never parses them.

---

## 1. User

The mock has no auth; identity is hardcoded (Polina = reference intern, Gal Shem Tov = team lead).

```json
{
  "id": "u_12",
  "name": "Polina Nikolsky",
  "initials": "PN",
  "email": "polina@easybim.co.il",
  "role": "intern",                  // intern | employee | teamlead
  "discipline": "MEP",               // optional, used in Send recipient filters
  "joinedAt": "2026-02-01T00:00:00Z"
}
```

- `role` drives everything in the UI (see step 6, roles matrix). The internal key stays `intern`
  even though the user-facing label is "Onboarding" — do not rename the key.
- Mock: `localStorage.kc_role` holds just the role string; the rest is hardcoded in `kc-app.js`
  (`DEFAULT_IDENTITY`, `ROLES.teamlead.identity`).

## 2. Workspace

Three fixed workspaces today; keep them data-driven so more can be added.

```json
{ "id": "ws1", "name": "BIM Methodology & Tools", "order": 1 }
```

## 3. Tree node (structure)

Mirrors the Monday "Knowledge Center" workspace **one-way**, plus the user's personal nodes.

```json
{
  "id": "n_884",
  "workspaceId": "ws1",
  "parentId": "n_310",               // null for a top-level block
  "order": 3,
  "kind": "leaf",                    // block | topic | leaf
  "title": "DXXXX - Project Startup",
  "sourceDocId": "1AbC…",            // Google Doc id, if the item links to one
  "documentId": "doc_412",           // our digested copy, once it exists
  "origin": "monday",                // monday | personal
  "ownerId": null,                   // set for origin=personal
  "mondayItemId": "7712345678"       // provenance, for the sync job
}
```

- `origin: "personal"` nodes live only in our DB and never sync back to Monday.
- Progress is computed from official nodes only — personal nodes are excluded (as in the mock).
- Mock: `window.KC_TREE` in `kc-data.js`; the `doc:"project-startup"` field is `sourceDocId`.

## 4. Document (the digested copy)

The single most important table. Created once per source doc, then it is the only thing the app
reads and writes. See `Block Contract.md` for the block format.

```json
{
  "id": "doc_412",
  "sourceDocId": "1AbC…",
  "workspaceId": "ws1",
  "title": "Project Startup",
  "code": "DXXXX",                   // document code chip
  "series": "EasyBIM Standards",
  "status": "ready",                 // ready | importing | not_imported | error
  "version": 7,                      // bumped on every applied change
  "blocks": [ /* Block Contract v1 */ ],
  "toc": [ { "txt": "…", "anchor": "sec-1" } ],
  "links": [ { "title": "…", "kind": "internal|external", "href": "…" } ],
  "createdBy": "u_3", "createdAt": "2021-09-30T00:00:00Z",
  "editedBy": "u_7",  "editedAt": "2026-07-23T00:00:00Z",
  "importedAt": "2026-07-01T10:22:00Z",
  "contractVersion": 1
}
```

- `status` is what `KC.API.getDocument` surfaces; `importing` also returns `progress` (0–1),
  `not_imported` returns `sourceUrl`, `error` returns `message`.
- `version` is required for conflict detection: a change request carries the version it was based
  on; a mismatch returns `409` and the UI shows the conflict state (step 7).
- Mock: `KC.DocPage.data` in `kc-docpage.js` stands in for one such row.

## 5. Figure (document image)

```json
{ "id": "f-2-1", "documentId": "doc_412", "url": "https://…/f-2-1.png",
  "width": 1600, "height": 900, "caption": "…" }
```

- Blocks reference figures by `id` only. Never embed base64 in a document record.
- Mock: files under `assets/docpage/<id>.png`, resolved by `DP.figSrc`.

## 6. Personal document (custom node body)

```json
{
  "id": "cdoc_55", "nodeId": "n_902", "ownerId": "u_12",
  "title": "Monday Agents — my research",
  "html": "<p>…</p>",               // rich text, editor-owned
  "createdBy": "u_12", "createdAt": "…", "editedBy": "u_12", "editedAt": "…"
}
```

- Mock: `localStorage.kc_docs`, keyed `"<wsId>::<node › path>"`, value
  `{title, html, createdBy, createdAt, editedBy, editedAt}`. The composite key becomes `nodeId`.

## 7. Notebook

```json
{ "id": "nb_9", "userId": "u_12", "workspaceId": "ws1",
  "html": "<p>…</p>", "updatedAt": "…" }
```

- One row per user × workspace. Autosave is debounced ~650 ms in the UI; the backend should accept
  frequent small writes (or a PATCH with the whole body, as today).
- Mock: `localStorage.kc_note_<wsId>` (a raw HTML string).

## 8. Change proposal (suggestion)

Three types flow into the team lead's review queue.

```json
{
  "id": "sug_31",
  "type": "edit",                    // new | edit | add
  "status": "pending",               // pending | approved | rejected | cancelled
  "documentId": "doc_412",           // null for type=new
  "workspaceId": "ws1",
  "path": ["BIM Methodology & Tools", "Revit", "Docs"],
  "title": "Project Startup",
  "authorId": "u_12",
  "note": "author's comment",
  "baseVersion": 7,                  // document version the proposal was made against

  "target": {                        // where in the document (type=edit | add)
    "blockIndex": 41,                // index in the normalized block list
    "topLevelIndex": 18,             // anchor for an insertion (add)
    "wholeBlock": false,             // true when the whole block is marked, not a fragment
    "anchor": "sec-6"                // nearest section anchor, for jump-to-change
  },
  "original": "text as it is now",   // type=edit
  "proposed": "text as proposed",    // type=edit
  "content": "new paragraph text",   // type=add
  "document": { "title": "…", "blocks": [ … ] },   // type=new: the whole proposed document

  "createdAt": "…", "decidedAt": null, "decidedBy": null
}
```

- Approving an `edit`/`add` applies the change to the document record, bumps `version`, and appends
  a **version log** row (below). Approving a `new` inserts a tree node and creates a document.
- Mock: `localStorage.kc_suggestions`; fields `bIdx`/`tIdx`/`block` map onto `target.*`, `ws` is a
  workspace index, `when` is a display string ("just now") — the backend must return a real
  timestamp and let the UI format it.

## 9. Version log entry

The document change registry shown in the Versions block.

```json
{ "id": "ver_88", "documentId": "doc_412", "v": 5,
  "authorId": "u_7", "date": "2026-07-23T00:00:00Z",
  "change": "Edited existing text", "anchor": "sec-6",
  "suggestionId": "sug_31" }
```

- `v` is sequential per document; `v = 1` is the "Created" row.
- `anchor` makes the row clickable (jump to the changed section).
- Mock: seed rows in `DP.data.versions` + appended rows in `localStorage.kc_docpage_versions`
  (`{v, date, who, change, anchor}`), merged by `DP.allVersions`.

## 10. Assignment (team lead → intern)

```json
{ "id": "asg_14", "internId": "u_12", "assignedById": "u_7",
  "nodeId": "n_884", "workspaceId": "ws1",
  "title": "Project Startup", "path": ["…"],
  "accepted": false, "assignedAt": "…", "acceptedAt": null }
```

- Unaccepted assignments drive the intern's "New for you" section, the avatar dot and the tree
  attention marker; accepting clears them.
- Progress is expressed as **% of assigned material**, not of the whole Knowledge Center.
- Mock: `localStorage.kc_assign` — `{id, ws, treeId, title, path, intern, accepted, when}`
  (`intern` is a name string today; becomes `internId`).

## 11. Bookmark (sticky note)

```json
{ "id": "bm_7", "userId": "u_12", "workspaceId": "ws1", "nodeId": "n_884",
  "documentId": "doc_412", "blockIndex": 12,
  "snippet": "first words of the line", "note": "user's note",
  "color": "yellow",                 // yellow | blue | green | orange | pink
  "side": "l", "createdAt": "…" }
```

- `blockIndex: null` means a topic-level bookmark (no note).
- Bookmarks are personal and never part of the document: they are stripped from downloads and sends.
- Mock: `localStorage.kc_bookmarks` — `{treeId, name, pIdx, snippet, note, color, side}`;
  `name` + `pIdx` become `nodeId`/`documentId` + `blockIndex`.

## 12. Progress / completion

Derived, but needs storage for the manual part.

```json
{ "userId": "u_12", "nodeId": "n_884",
  "state": "done",                   // todo | active | done
  "openedAt": "…", "doneAt": "…" }
```

- Opening a topic makes it `active`; "Mark as done" (intern only) makes it `done`.
- Block-level bars and workspace percentages are computed from these rows over **assigned official
  nodes only**.
- Mock: derived from CSS classes in the tree, not persisted.

## 13. Send record (journal)

```json
{
  "id": "snd_20", "userId": "u_12", "documentId": "doc_412", "docTitle": "Project Startup",
  "channel": "email",                // email | acc
  "projectCode": "22101", "projectName": "…",
  "subject": "[22101] Project Startup",
  "recipients": [ { "name": "…", "email": "…", "company": "…", "discipline": "…" } ],
  "issue": { "id": "#317", "title": "…" },   // channel=acc: the Forma issue handed off to
  "sentAt": "…", "status": "sent"     // sent | failed
}
```

- Mock: `localStorage.kc_send_log` via `KC.Send.loadLog/saveLog`.

## 14. Project & consultant (platform reference data)

Read-only for this app — it comes from the EasyBIM platform base, used by the Send wizard.

```json
{ "code": "22101", "name": "…", "acc": true, "accAlert": false, "accUrl": "https://…",
  "consultants": [ { "name": "…", "email": "…", "company": "…", "discipline": "…" } ],
  "issues": [ { "id": "#317", "type": "COR", "status": "Open", "discipline": "…", "placement": "…" } ] }
```

- Mock: `PROJECTS` at the top of `kc-send.js`.

## 15. Mentor thread

```json
{ "id": "th_4", "userId": "u_12", "workspaceId": "ws1",
  "mode": "topic",                   // topic | assistant
  "nodeId": "n_884",                 // topic threads are bound to a node
  "messages": [ { "role": "user|assistant", "text": "…", "at": "…" } ] }
```

- Mock: `localStorage.kc_mentor` — `{ "<wsId>": { topic: [...], assistant: [...] } }`.

## 16. Dictionary term

```json
{ "id": "t_9", "word": "Work OS", "source": "Monday",
  "translations": { "he": "…", "ru": "…" },
  "definitions": { "en": "…", "ru": "…", "he": "…" },
  "scope": "global",                 // global | personal
  "ownerId": null, "addedAt": "2026-07-04T00:00:00Z" }
```

- Terms added from the selection menu are `scope: personal`.
- Mock: `DICT[]` in `kc-app.js`; per-user display preferences in `localStorage.kc_dict_prefs`.

## 17. User preferences

```json
{ "userId": "u_12",
  "translationEnabled": true, "translationLang": "RU",
  "dictionary": { "defLang": "en", "showHE": true, "showRU": true, "showDef": true, "period": "all" },
  "lastTopicByWorkspace": { "ws1": "n_884" } }
```

- Mock: `kc_tr_off`, `kc_tr_lang`, `kc_dict_prefs`, plus the per-workspace resume chip.

---

## Relationships (summary)

```
workspace 1─┬─* tree_node ──0/1─ document ──1─* figure
            │        │                │
            │        ├──0/1─ personal_document (origin=personal)
            │        ├──*── assignment           │
            │        ├──*── progress             ├──*── version_log
            │        └──*── bookmark ────────────┤
            │                                    └──*── change_proposal
            ├─* notebook (per user)
            └─* mentor_thread (per user)

user 1─* change_proposal, assignment, bookmark, send_record, notebook,
        mentor_thread, preferences
```

## Notes for implementation

1. **Documents are the source of truth**, not the Google Doc. Approved changes update the document
   row and bump `version`; nothing rebuilds content from Drive.
2. **Soft-delete** proposals and assignments rather than hard-deleting — the review history is
   valuable and the mock currently drops records on decision.
3. **Index** on `document.sourceDocId` (the digest cache lookup), `tree_node.workspaceId+parentId`
   (tree render), `change_proposal.status` (review queue), `assignment.internId+accepted`.
4. **The mock stores display strings** in a few places (`when: "just now"`, `date: "23.07.2026"`,
   author names instead of ids). The API must return machine values and let the UI format them.
