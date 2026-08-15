# Knowledge Center Block Contract (v1)

What the front end **guarantees to render** and what the backend **guarantees to send** after a
document has been digested. The executable copy of these rules is `kc-blocks.js`
(`KC.Blocks.normalize`). Change one, change the other.

A document arrives as a **flat list of blocks** (not a tree):

```json
{
  "id": "doc_412",
  "sourceId": "1AbC…",            // id of the source Google Doc
  "title": "Project Startup",
  "version": 7,
  "blocks": [ { "t": "h", "lvl": 3, "num": "1", "anchor": "sec-1", "txt": "מידע ראשוני נדרש" },
              { "t": "p", "txt": "…" },
              { "t": "ul", "items": ["…", "…"] },
              { "t": "fig", "id": "f-2-1", "cap": "…" } ]
}
```

## Block types

| Type | What it is | Required | Optional |
|---|---|---|---|
| `h` | section heading | `lvl` (2–5), `txt` | `num` ("3.1"), `anchor` (`sec-3`) |
| `p` | paragraph | `txt` | `sub` (indented), `link` |
| `ul` | bulleted list | `items` — non-empty array of strings | `sub`, `sq` (hollow bullet) |
| `ol` | numbered list | `items` | `sub` |
| `callout` | note / callout | `txt` | — |
| `fig` | figure with a caption | `id` (file id in storage) | `cap` (caption) |

Field rules:
- `lvl` — **2, 3, 4, 5 only**. Level 1 is reserved for the document title (required so the
  auto-outline matches ours when exported to Google Docs). Level 5 covers a third numbering
  tier such as 6.3.1.
- `anchor` — latin letters, digits, hyphen (`sec-4`). Drives the table of contents and the
  jump-to-change links in the version log.
- `txt` and `items` entries — plain text. The front end wraps latin technical terms in a mono
  chip by itself; do not mark them up.
- `fig.id` — the file id in **our** storage. Never embed base64 in the document.

## What the front end does when the contract is broken

| Situation | Behaviour | Issue code |
|---|---|---|
| unknown block type | rendered as a plain paragraph | `unknown-type` |
| entry is not an object | skipped | `bad-block` |
| empty required text | block not rendered | `empty` |
| `lvl` outside 2–5 | clamped to the nearest valid level | `level-clamped` |
| invalid `anchor` | block renders, no section link is created | `bad-anchor` |
| list with no items | block not rendered | `empty` |
| list longer than 200 items | truncated | `list-truncated` |
| `fig` without `id` | block not rendered | `empty` |
| image fails to load | placeholder frame with the caption, the page stays readable | — |
| `blocks` not an array / empty | "document could not be displayed" screen + link to the original | `not-a-list` |

The app **never crashes** because of content: an invalid block either degrades or disappears,
and the rest of the document stays readable.

## Validation mode

Issues are collected while rendering. The team lead sees a yellow strip above the document —
**"Document digested with issues: N"** — which expands into the list with block numbers.
Regular users never see it. Import problems surface immediately instead of when an employee
stumbles into them.

Programmatically: `KC.Blocks.normalize(blocks)` → `{ blocks, issues, fatal }`;
`KC.DocPage.lastCheck` holds the result of the last render.

## What this means for the backend

1. The Google Doc → blocks converter must emit **only** the types in the table above.
2. Anything that does not fit (tables, lists nested deeper than one level, arbitrary styling)
   must either be reduced to an existing type, or the contract must be extended and its version
   bumped by agreement.
3. Images are uploaded to our storage; the block carries only the `id`.
4. The document `version` field is mandatory — it is how we detect concurrent-edit conflicts.
