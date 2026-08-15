/* ═══════════════════════════════════════════════════════════════════════════
   kc-blocks.js — BLOCK CONTRACT and resilient rendering (step 2 of the handoff plan)

   This file states what the front end agrees to accept from the backend, and
   what it does when something else arrives. The human-readable version is
   `Block Contract.md`; this is its executable copy. Change one, change the other.

   Usage:
     const { blocks, issues, fatal } = KC.Blocks.normalize(rawBlocks);
   Render ONLY normalized blocks — they are guaranteed valid. `issues` is the
   list of notes for the team lead, `fatal` means the document cannot be shown.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const KC = (window.KC = window.KC || {});
  const B = (KC.Blocks = KC.Blocks || {});

  /* Heading levels: h1 is reserved for the document title, so 2…5
     (real documents use three numbering levels, e.g. 6.3.1). */
  const H_MIN = 2, H_MAX = 5;
  const MAX_LIST_ITEMS = 200;      // guard against a degenerate import
  const MAX_TEXT = 20000;          // characters in a single text block

  B.CONTRACT = {
    version: 1,
    types: {
      h:       { required: ['lvl', 'txt'], optional: ['num', 'anchor'] },   // lvl 2–5
      p:       { required: ['txt'],        optional: ['sub', 'link'] },
      ul:      { required: ['items'],      optional: ['sub', 'sq'] },
      ol:      { required: ['items'],      optional: ['sub'] },
      callout: { required: ['txt'],        optional: [] },
      fig:     { required: ['id'],         optional: ['cap'] }
    }
  };

  const isStr = v => typeof v === 'string';
  const clean = v => (isStr(v) ? v : v == null ? '' : String(v)).trim().slice(0, MAX_TEXT);
  const slug = v => clean(v).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

  /* Normalize: returns only valid blocks plus a list of issues.
     Degradation rules (see Block Contract.md):
       • unknown type            → render as a paragraph, issue `unknown-type`
       • empty required text     → block dropped, issue `empty`
       • heading level outside 2–5 → clamped, issue `level-clamped`
       • list with no items      → block dropped
       • figure without an id    → block dropped (nothing to show)
       • not an array / empty    → fatal, show the error screen              */
  B.normalize = function (raw) {
    const issues = [];
    const note = (code, at, detail) => issues.push({ code, at, detail: detail || '' });

    if (!Array.isArray(raw)) return { blocks: [], issues: [{ code: 'not-a-list', at: -1, detail: typeof raw }], fatal: true };

    const out = [];
    raw.forEach((b, i) => {
      if (!b || typeof b !== 'object') { note('bad-block', i, typeof b); return; }
      let t = clean(b.t);

      if (!B.CONTRACT.types[t]) {
        const txt = clean(b.txt || b.text);
        note('unknown-type', i, t || '(no type)');
        if (txt) out.push({ t: 'p', txt: txt, _degraded: true });
        return;
      }

      if (t === 'h') {
        const txt = clean(b.txt);
        if (!txt) { note('empty', i, 'h'); return; }
        let lvl = parseInt(b.lvl, 10);
        if (!Number.isFinite(lvl)) lvl = H_MIN;
        if (lvl < H_MIN || lvl > H_MAX) { note('level-clamped', i, 'lvl=' + b.lvl); lvl = Math.min(H_MAX, Math.max(H_MIN, lvl)); }
        const o = { t: 'h', lvl: lvl, txt: txt, num: clean(b.num) };
        const anc = slug(b.anchor);
        if (anc) o.anchor = anc; else if (b.anchor) note('bad-anchor', i, String(b.anchor));
        out.push(o);
        return;
      }

      if (t === 'p') {
        const txt = clean(b.txt);
        if (!txt) { note('empty', i, 'p'); return; }
        out.push({ t: 'p', txt: txt, sub: !!b.sub, link: isStr(b.link) ? b.link : undefined });
        return;
      }

      if (t === 'ul' || t === 'ol') {
        let items = Array.isArray(b.items) ? b.items.map(clean).filter(Boolean) : [];
        if (!items.length) { note('empty', i, t); return; }
        if (items.length > MAX_LIST_ITEMS) { note('list-truncated', i, items.length + ' → ' + MAX_LIST_ITEMS); items = items.slice(0, MAX_LIST_ITEMS); }
        out.push({ t: t, items: items, sub: !!b.sub, sq: !!b.sq });
        return;
      }

      if (t === 'callout') {
        const txt = clean(b.txt);
        if (!txt) { note('empty', i, 'callout'); return; }
        out.push({ t: 'callout', txt: txt });
        return;
      }

      if (t === 'fig') {
        const id = clean(b.id);
        if (!id) { note('empty', i, 'fig without id'); return; }
        out.push({ t: 'fig', id: id, cap: clean(b.cap) });
      }
    });

    return { blocks: out, issues: issues, fatal: out.length === 0 };
  };

  /* Human-readable issue text — for the team lead's notice strip. */
  B.describe = function (issue) {
    const at = issue.at >= 0 ? 'block #' + (issue.at + 1) + ': ' : '';
    switch (issue.code) {
      case 'unknown-type':    return at + 'unknown type "' + issue.detail + '" — rendered as a paragraph';
      case 'empty':           return at + 'empty required field (' + issue.detail + ') — block skipped';
      case 'bad-block':       return at + 'not an object (' + issue.detail + ') — block skipped';
      case 'level-clamped':   return at + 'heading level outside 2–5 (' + issue.detail + ') — clamped';
      case 'bad-anchor':      return at + 'invalid anchor "' + issue.detail + '" — no section link created';
      case 'list-truncated':  return at + 'list too long (' + issue.detail + ')';
      case 'not-a-list':      return 'document did not arrive as a list of blocks (' + issue.detail + ')';
      default:                return at + issue.code;
    }
  };
})();
