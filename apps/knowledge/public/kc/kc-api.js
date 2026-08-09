/* ═══════════════════════════════════════════════════════════════════════════
   kc-api.js — DATA LAYER (step 1 of the backend handoff plan)

   The ONLY place where the app talks to storage. Every other file
   (kc-app.js, kc-teamlead.js, kc-suggest.js, kc-send.js, kc-docpage.js) must go
   through KC.API.* and must never touch localStorage directly.

   HOW TO PLUG IN A REAL BACKEND
   -----------------------------
   Two transports below:
     • Local — localStorage stub (current mockup mode);
     • Http  — skeleton for real requests; methods are listed and described,
               bodies are marked TODO. Switch with KC.API.use('http', {baseUrl}).
   No calling file changes when the transport is switched.

   SYNC vs ASYNC
   -------------
   Local user state (notes, bookmarks, preferences) is read synchronously — that
   is how the current UI is built. Everything that will really go over the wire
   (documents, review queue, sending) is declared as a Promise, so calling code
   already awaits it today.

   STORAGE KEY → ENDPOINT MAP
   --------------------------
   Real, done — see RemoteKV below (per-user, Clerk-scoped, Mongo-backed):
   kc_role              → resolved server-side, GET /api/kc/state's `role`  (Clerk publicMetadata.knowledgeRole, admin-only to change — not client-writable at all anymore)
   kc_docs              → GET /api/kc/state, PUT /api/kc/state/kc_docs     (personal documents)
   kc_note_*            → GET /api/kc/state, PUT /api/kc/state/<key>       (notebook, one key per open doc)
   kc_custom_tree_<wsId>→ GET /api/kc/state, PUT /api/kc/state/<key>       (personal tree nodes)
   kc_bookmarks         → GET /api/kc/state, PUT /api/kc/state/kc_bookmarks (sticky-note bookmarks)
   kc_mentor            → GET /api/kc/state, PUT /api/kc/state/kc_mentor   (chat history)
   kc_dict_prefs        → GET /api/kc/state, PUT /api/kc/state/kc_dict_prefs (dictionary preferences)
   kc_tr_lang/kc_tr_off → GET /api/kc/state, PUT /api/kc/state/<key>       (translation preferences)

   Still local/mock — shared workflow records, not one person's own data;
   moving these needs real shared-collection design, not per-user siloing:
   kc_suggestions     → GET/POST /suggestions            (change proposals)
   kc_assign          → GET/POST /assignments            (assignments to interns)
   kc_docpage_versions→ GET      /documents/:id/versions (version log)
   kc_send_log        → GET/POST /sends                  (send journal)

   Already real, bypasses Local/Http entirely (see API.getDocument, below):
   (tree structure)   → GET      /tree                   (one-way sync from Monday)
   (document)         → GET      /documents/:sourceId    (digested copy)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const KC = (window.KC = window.KC || {});
  const API = (KC.API = KC.API || {});

  /* ── every storage key in one place ──────────────────────────────────── */
  const K = API.KEYS = {
    docs: 'kc_docs',
    note: wsId => 'kc_note_' + wsId,
    suggestions: 'kc_suggestions',
    assignments: 'kc_assign',
    bookmarks: 'kc_bookmarks',
    mentor: 'kc_mentor',
    dictPrefs: 'kc_dict_prefs',
    trLang: 'kc_tr_lang',
    trOff: 'kc_tr_off',
    versions: 'kc_docpage_versions',
    sendLog: 'kc_send_log',
    customTree: wsId => 'kc_custom_tree_' + wsId,
    uiCols: wsId => 'kc_ui_cols_' + wsId,
    uiActiveWs: 'kc_ui_active_ws',
    uiOpenTopic: wsId => 'kc_ui_opentopic_' + wsId
  };

  /* ── transport: localStorage ─────────────────────────────────────────── */
  const Local = {
    name: 'local',
    getRaw(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    setRaw(key, val) { try { localStorage.setItem(key, val); return true; } catch (e) { return false; } },
    get(key, fallback) {
      const raw = this.getRaw(key);
      if (raw == null) return fallback;
      try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch (e) { return fallback; }
    },
    set(key, val) { return this.setRaw(key, JSON.stringify(val)); },
    remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
  };

  /* ── transport: HTTP (skeleton; enable with KC.API.use('http', {baseUrl})) ─ */
  const Http = {
    name: 'http',
    baseUrl: '',
    /* Last-known state, so the UI's synchronous getters keep working: filled on
       start-up by API.preload and refreshed on every write. */
    cache: {},
    getRaw(key) { const v = this.cache[key]; return v == null ? null : String(v); },
    setRaw(key, val) { this.cache[key] = val; return true; },
    get(key, fallback) { const v = this.cache[key]; return v === undefined ? fallback : v; },
    set(key, val) {
      this.cache[key] = val;
      // TODO(backend): PUT ${baseUrl}/state/${key} with val as body; handle failure + rollback.
      return true;
    },
    remove(key) { delete this.cache[key]; /* TODO(backend): DELETE */ },
    async request(method, path, body) {
      // TODO(backend): single network entry point — auth, error handling, timeouts.
      const res = await fetch(this.baseUrl + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      if (!res.ok) throw new Error(method + ' ' + path + ' → ' + res.status);
      return res.status === 204 ? null : res.json();
    }
  };

  let T = Local;                       // active transport
  API.mode = () => T.name;
  API.use = function (mode, opts) {
    if (mode === 'http') { T = Http; Http.baseUrl = (opts && opts.baseUrl) || ''; }
    else T = Local;
    return T.name;
  };

  /* ── RemoteKV: real per-user backing store for the genuinely personal
     keys only (custom docs/tree, notebook notes, bookmarks, mentor threads,
     dictionary/translation prefs) — kc_suggestions/kc_assign/
     kc_docpage_versions/kc_send_log stay on Local (T) exactly as before,
     since those are shared workflow records, not one person's own data;
     siloing them per Clerk user would silently hide an intern's submission
     from the team lead reviewing it. Parallel to Local/Http/T above, not a
     replacement — Http stays untouched as a future seam for the rest.
     Every read of this data throughout the locked kc-app.js/etc. files is
     synchronous (this file's own header explains why), so the one-time
     fetch of a signed-in user's whole blob below is a *blocking* XHR,
     issued before kc-app.js's own <script> tag ever runs — the only way to
     keep every existing call site unchanged without touching template.html.
     The same response also carries this person's REAL Knowledge Center role
     (`realKnowledgeRole` below) — resolved server-side from Clerk metadata a
     portal admin controls, never from anything the client sends. kc_role
     used to be a plain client-writable localStorage toggle (anyone could
     self-promote to Team Lead); it no longer is. */
  const RemoteKV = {
    cache: {},
    getRaw(key) { const v = this.cache[key]; return v == null ? null : String(v); },
    setRaw(key, val) { this.cache[key] = val; this._push(key, val); return true; },
    get(key, fallback) { const v = this.cache[key]; return v === undefined ? fallback : v; },
    set(key, val) { this.cache[key] = val; this._push(key, val); return true; },
    _push(key, val) {
      fetch('/api/kc/state/' + encodeURIComponent(key), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ value: val })
      }).catch((e) => console.error('kc: failed to save', key, e));
    }
  };
  // The 6 in-scope concerns, exactly as agreed — everything else keeps
  // using Local. Raw keys are read via getRaw/setRaw (plain strings, e.g.
  // notebook HTML); everything else goes through get/set (JSON-shaped).
  const REMOTE_RAW_KEYS = [K.trLang, K.trOff];
  const REMOTE_JSON_KEYS = [K.docs, K.bookmarks, K.mentor, K.dictPrefs];
  function isRemoteNoteKey(key) { return /^kc_note_/.test(key); }
  function isRemoteTreeKey(key) { return /^kc_custom_tree_/.test(key); }
  function isRemoteRawKey(key) { return REMOTE_RAW_KEYS.indexOf(key) !== -1 || isRemoteNoteKey(key); }
  function isRemoteJsonKey(key) { return REMOTE_JSON_KEYS.indexOf(key) !== -1 || isRemoteTreeKey(key); }
  const VALID_ROLES = ['intern', 'employee', 'teamlead'];
  let realKnowledgeRole = 'intern';
  // Real signed-in identity, replacing kc-app.js's hardcoded
  // DEFAULT_IDENTITY/"Gal Shem Tov" stub — see wrapApplyRoleUI below.
  let realIdentity = null;
  function bootstrapRemoteKV() {
    try {
      const getXhr = new XMLHttpRequest();
      getXhr.open('GET', '/api/kc/state', false);
      getXhr.setRequestHeader('Accept', 'application/json');
      getXhr.send(null);
      const parsed = (getXhr.status >= 200 && getXhr.status < 300)
        ? JSON.parse(getXhr.responseText || '{}')
        : {};
      const serverKv = parsed.kv || {};
      if (VALID_ROLES.indexOf(parsed.role) !== -1) realKnowledgeRole = parsed.role;
      if (parsed.identity && parsed.identity.name) realIdentity = parsed.identity;
      const missing = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || Object.prototype.hasOwnProperty.call(serverKv, key)) continue;
        if (!isRemoteRawKey(key) && !isRemoteJsonKey(key)) continue;
        const raw = localStorage.getItem(key);
        if (raw == null) continue;
        if (isRemoteRawKey(key)) { missing[key] = raw; continue; }
        try { missing[key] = JSON.parse(raw); } catch (e) { /* skip unparsable legacy value */ }
      }
      let finalKv = serverKv;
      if (Object.keys(missing).length) {
        const postXhr = new XMLHttpRequest();
        postXhr.open('POST', '/api/kc/migrate', false);
        postXhr.setRequestHeader('Content-Type', 'application/json');
        postXhr.send(JSON.stringify({ kv: missing }));
        if (postXhr.status >= 200 && postXhr.status < 300) {
          finalKv = JSON.parse(postXhr.responseText || '{}').kv || serverKv;
        }
        Object.keys(missing).forEach((key) => { try { localStorage.removeItem(key); } catch (e) {} });
      }
      Object.assign(RemoteKV.cache, finalKv);
    } catch (e) { console.error('kc: RemoteKV bootstrap failed', e); }
  }
  bootstrapRemoteKV();

  /* ── Live tree overlay: keeps window.KC_TREE (the static, build-time
     kc-data.js snapshot) honest at runtime, grafted the instant kc-data.js
     sets it (its own <script> tag runs right after this one — see
     template.html's script order), before kc-app.js's <script> tag (next
     after that) ever reads it to render. Two kinds, from the same endpoint:
       - nodes: topics a team lead approved from a 'new'-type suggestion —
         additive (pushed on if not already present at their path).
       - replaceSections: sections mirrored live from Monday (see
         lib/kc/mondaySync.ts's daily cron) — a full snapshot per section,
         applied as a wholesale replace so adds/renames/removals in Monday
         are just "whatever's there now", not a diff kc-api.js has to compute.
     kc-app.js itself is never touched; from its point of view the tree was
     just always like this. */
  let treeOverlayNodes = [];
  let treeOverlayReplaceSections = [];
  function bootstrapTreeOverlay() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/kc/tree-overlay', false);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText || '{}');
        if (Array.isArray(data.nodes)) treeOverlayNodes = data.nodes;
        if (Array.isArray(data.replaceSections)) treeOverlayReplaceSections = data.replaceSections;
      }
    } catch (e) { console.error('kc: tree overlay bootstrap failed', e); }
  }
  bootstrapTreeOverlay();
  function treeNameOf(n) { return Array.isArray(n) ? n[0] : (typeof n === 'string' ? n : (n && n.n)); }
  function treeKidsRef(n) {
    if (Array.isArray(n)) { if (!Array.isArray(n[1])) n[1] = []; return n[1]; }
    if (n && typeof n === 'object') { if (!Array.isArray(n.c)) n.c = []; return n.c; }
    return null;
  }
  function treeListAtPath(tree, wsKey, parentPath) {
    let list = tree[wsKey];
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < parentPath.length; i++) {
      const found = list.find((n) => treeNameOf(n) === parentPath[i]);
      const kids = found && treeKidsRef(found);
      if (!kids) return null;
      list = kids;
    }
    return list;
  }
  function graftTreeOverlay(tree) {
    if (!tree) return tree;
    treeOverlayReplaceSections.forEach((section) => {
      const list = treeListAtPath(tree, section.wsKey, section.parentPath);
      if (!list) return;
      list.length = 0;
      (section.children || []).forEach((c) => list.push(c));
    });
    treeOverlayNodes.forEach((node) => {
      const list = treeListAtPath(tree, node.wsKey, node.parentPath);
      if (!list) return;
      if (!list.some((n) => treeNameOf(n) === node.name)) {
        list.push({ n: node.name, s: node.status || 'done', doc: node.sourceId });
      }
    });
    return tree;
  }
  let realKcTree;
  Object.defineProperty(window, 'KC_TREE', {
    configurable: true,
    get() { return realKcTree; },
    set(v) { realKcTree = graftTreeOverlay(v); }
  });

  /* ── Suggestions: a real, shared queue (kc_suggestions used to be one
     browser's own localStorage array — see RemoteKV's header comment for
     why this one couldn't just move there like the personal-data keys did:
     an intern's submission has to be visible to whichever team lead reviews
     it, a different real person entirely). Same sync-cache-at-boot shape as
     everything else here, for the same reason: kc-app.js/kc-suggest.js/
     kc-teamlead.js all read KC.API.listSuggestions() synchronously. */
  let suggestionsCache = [];
  // Set by wrapPublishToTree/wrapApplyProposalDOM (below, inside
  // initSeamFixes) right after a team lead's approve/reject actually runs;
  // consumed once by API.removeSuggestion, which every path calls next.
  let _pendingResolve = null;
  function bootstrapSuggestions() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/kc/suggestions', false);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        const items = JSON.parse(xhr.responseText || '{}').items;
        if (Array.isArray(items)) suggestionsCache = items.map(fromServerSuggestion);
      }
    } catch (e) { console.error('kc: suggestions bootstrap failed', e); }
  }
  // Server shape -> the flat shape kc-app.js/kc-suggest.js/kc-teamlead.js
  // already expect (their own record shape, unchanged) plus a real id.
  function fromServerSuggestion(s) {
    return Object.assign({}, s, { id: s._id || s.id, submitted: true, when: 'pending' });
  }
  bootstrapSuggestions();

  /* ═══════════════ ROLE AND PERSONAL PREFERENCES ═══════════════
     Role used to be a client-side toggle (kc_role in localStorage) that
     anyone could set to 'teamlead' with one click, with no server check at
     all. It is now resolved server-side from Clerk metadata a portal admin
     controls (see resolveKnowledgeRole in @easybim/auth, folded into the
     same /api/kc/state boot fetch above) and is read-only from here on —
     setRole is kept only so kc-app.js's KC.switchRole (locked, still calls
     it before reloading) doesn't throw; it can no longer change anything. */
  // PHASE SCOPE (2026-08): only the employee experience is being built
  // right now — onboarding (intern) and team lead come in later phases.
  // Forcing the role kc-app.js's own UI logic sees to 'employee' hides
  // everything already gated behind it (progress bar, mark-as-done, the
  // "Continue learning"/assignments sections in the account cabinet, the
  // Mentor's "This topic"/studying framing, etc.) regardless of whatever
  // role is actually assigned server-side for testing. realKnowledgeRole
  // itself is untouched — this only changes what THIS function reports,
  // so it has no effect on any real server-side access check (those
  // re-resolve the role independently). Remove NB_FORCE_ROLE (or set it to
  // null) when onboarding/team-lead work starts.
  const NB_FORCE_ROLE = 'employee';
  API.getRole = function () { return NB_FORCE_ROLE || realKnowledgeRole; };
  API.setRole = function () { /* no-op: role is server-assigned only */ };

  // kc_tr_off stores the INVERSE flag ('0' = translation on, '1' = off) —
  // kc-app.js's own convention. Its own KC.trEnabled() falls back to
  // enabled (true) when nothing is stored yet; overridden here so a fresh
  // user starts with translation off until they turn it on themselves, per
  // Polina's explicit request — the tab shouldn't even show ("не торчит")
  // until enabled via the Textbook "⋯" menu's "Translation panel" switch.
  API.getPref = function (name, fallback) {
    if (name === 'trLang') return RemoteKV.getRaw(K.trLang) || fallback || 'RU';
    if (name === 'translationEnabled') return RemoteKV.getRaw(K.trOff) === '0';
    if (name === 'dict') return RemoteKV.get(K.dictPrefs, fallback || {});
    return fallback;
  };
  API.setPref = function (name, value) {
    if (name === 'trLang') return RemoteKV.setRaw(K.trLang, value);
    if (name === 'translationEnabled') return RemoteKV.setRaw(K.trOff, value ? '0' : '1');
    if (name === 'dict') return RemoteKV.set(K.dictPrefs, value);
  };
  // template.html's own inline bootstrap script (running before this file)
  // decides the SAME thing from a raw localStorage read, to avoid a flash
  // of the wrong state before any JS runs — but that key now lives in
  // RemoteKV, not localStorage, so its check is stale. Correct it here,
  // from the real source, the moment RemoteKV is warm (still before
  // kc-app.js's own <script> tag runs — see template.html's script order).
  if (document.body) document.body.classList.toggle('tr-off', !API.getPref('translationEnabled'));

  // A clean start page: every column collapsed to its spine, in every
  // workspace, from the very first paint — no flash of the old fully-open
  // layout (with its now-removed mock content) before a later fix collapses
  // it. Done here, synchronously, the moment this script runs — the static
  // .col elements already exist in the DOM (this <script> tag sits after
  // them in template.html), so this doesn't need to wait for kc-app.js or
  // for the tryWrap retry loop at all. .col.slim .ci{display:none} (already
  // in template.html's own CSS) hides each column's content the same way,
  // so nothing stale is ever visible even for a frame. kc-app.js's own
  // init() would otherwise auto-re-expand Content (c1) and Textbook (c2) via
  // an 80ms-delayed KC.goTo/KC.select for its hardcoded demo document — see
  // wrapGoToSuppressBootDemo/wrapSelectSuppressBootDemo below, which stop
  // that at the source so this collapse sticks.
  // A returning user's last-seen layout (which columns they'd opened, in
  // which workspace) takes over from here — a brand-new user (nothing
  // saved yet) still gets the clean, all-collapsed start above.
  document.querySelectorAll('.workspace').forEach((ws) => {
    // template.html hardcodes fake "demo" content directly into every
    // workspace's .c2 .cb (a placeholder breadcrumb/byline/paragraphs,
    // never wrapped in .kc-doc) — normally hidden behind renderNotYetAvailable
    // (below, further down this file), but that only runs once window.KC
    // exists and tryWrap() has finished, ~150ms after this point. If this
    // workspace's Textbook column was left open in a previously-saved
    // layout, `xp(col.id)` a few lines down reveals it RIGHT NOW —
    // synchronously, on script load — which is well before that 150ms
    // mitigation has had any chance to run, so the raw fake content would
    // flash into view for real. Hide it here too, synchronously, before
    // any column can expand — pure DOM, no KC.* needed yet. The later
    // renderNotYetAvailable/fixInitialMockViews pass still runs on top of
    // this and paints the real "Not in the Knowledge Center yet" message;
    // this only closes the timing gap before that's ready.
    const c2cb = ws.querySelector('.c2 .cb');
    if (c2cb && !c2cb.querySelector('.kc-doc')) {
      Array.prototype.forEach.call(c2cb.children, (el) => el.classList.add('kc-doc-hidden'));
    }
    const savedCols = RemoteKV.get(K.uiCols(ws.id), null);
    ['c1', 'c2', 'c3', 'c4'].forEach((cls) => {
      const col = ws.querySelector('.' + cls);
      if (!col) return;
      if (savedCols && savedCols[cls]) { if (window.xp) window.xp(col.id); }
      else col.classList.add('slim');
    });
  });
  const savedActiveWs = RemoteKV.get(K.uiActiveWs, null);
  if (savedActiveWs != null && window.switchWS) window.switchWS(savedActiveWs);
  // "Plan" (the c1 spine) is really the topic/document tree — renamed to
  // match what it actually holds. Selecting by column id, not text match,
  // per kc-app.js's own '.c1'-by-class convention (see its rebalance()).
  ['w0c1', 'w1c1', 'w2c1'].forEach((id) => {
    const lbl = document.querySelector('#' + id + ' .ss-lbl');
    if (lbl && lbl.textContent.trim() === 'Plan') lbl.textContent = 'Content';
  });
  // Hands off from template.html's own boot-only CSS default (same effect,
  // applied unconditionally before this runs, to survive the browser's own
  // progressive rendering of everything above this <script> tag) to the
  // .slim classes just added above — a no-op visually, since both render
  // identically; this just stops the temporary CSS rule from applying.
  if (document.body) document.body.classList.add('kc-boot-ready');

  /* ═══════════════ PERSONAL DOCUMENTS (custom nodes) ═══════════════ */
  API.getCustomDocs = function () { return RemoteKV.get(K.docs, {}); };
  API.saveCustomDocs = function (map) { return RemoteKV.set(K.docs, map); };

  /* ═══════════════ NOTEBOOK — per open document, not per workspace ═══════════════
     The Notebook is a private editable page tied to whichever real document is
     open in the Textbook (not one shared space for the whole workspace). When no
     document is open it auto-collapses to its spine. kc-app.js/kc-docpage.js
     can't be edited, so this is built entirely from this seam: kc-docpage.js's
     KC.DocPage.mount() always reads KC.DocPage.data (already the hook getDocument
     uses above) and renders into a `.kc-docpage` element inside `.c2 .cb` — its
     presence/absence in the DOM is what tells us whether a document is open, and
     KC.DocPage.data carries which one. Column collapse/expand reuses the app's
     own already-global tog()/xp() (the same functions kc-teamlead.js calls into
     for exactly this kind of cross-cutting UI sync), and "a document was
     opened/closed" is observed by wrapping KC.select once it exists — the same
     monkey-patch pattern kc-teamlead.js already uses on window.xp. */
  function noteKeyForWs(wsId) {
    const ws = document.getElementById(wsId);
    if (!ws) return null;
    const dp = ws.querySelector('.c2 .kc-docpage');
    const sourceId = dp && KC.DocPage && KC.DocPage.data && KC.DocPage.data.sourceId;
    if (sourceId) return 'kc_note_doc_' + sourceId;
    // A user's own custom topic/folder (kc-app.js's openCustomDoc) is a
    // completely separate path from a real document (KC.DocPage) — it never
    // touches KC.DocPage.data at all, so the check above alone treats every
    // custom doc as "nothing open", and every one of them ends up sharing
    // whichever note last loaded. openCustomDoc's own wrapper already
    // carries a real per-topic id (dataset.docid, from docIdFor — unique
    // per node's full path) — use that the same way. (kc-doc-empty is the
    // "not in the Knowledge Center yet" placeholder, no docid of its own —
    // correctly falls through to no key, same as nothing open.)
    const custom = ws.querySelector('.c2 .kc-doc:not(.kc-docpage)');
    const docId = custom && custom.dataset.docid;
    return docId ? 'kc_note_custom_' + docId : null;
  }
  API.getNote = function (wsId) { return RemoteKV.getRaw(noteKeyForWs(wsId) || K.note(wsId)); };
  API.saveNote = function (wsId, html) { return RemoteKV.setRaw(noteKeyForWs(wsId) || K.note(wsId), html); };
  // Custom documents' "Created by X / Last updated by Y" byline didn't earn
  // its space — not wanted here at all, same call as dropping it from the
  // Notebook. KC.bylineHTML is still called from several locked/patched
  // spots (openCustomDoc, KC.saveDoc, replaceSaveDocForEditor) that all
  // insert its return value or replaceWith() an existing `.kc-byline`, so
  // it stays a real (if invisible) node — an empty string would make
  // replaceWith() insert a literal text node reading "null" instead.
  function replaceBylineHTML() {
    if (typeof KC.bylineHTML !== 'function') return false;
    if (KC.bylineHTML.__nbCardStyle) return true;
    KC.bylineHTML = function () { return '<div class="kc-byline" style="display:none"></div>'; };
    KC.bylineHTML.__nbCardStyle = true;
    return true;
  }
  // openCustomDoc (locked, kc-app.js:319-339) builds, in source order:
  // toolbar → breadcrumb → byline → title input → body. The title is now
  // mirrored into c2's static header instead (syncTextbookHeaderTitle,
  // below) and hidden in place here, and the byline is hidden outright
  // (replaceBylineHTML) — so this only needs to reorder what's still
  // visible into breadcrumb → toolbar → body, matching the official
  // document's own title+breadcrumb → body convention and the same order
  // the Notebook now uses.
  function reorderCustomDocHeader(wrap) {
    if (!wrap) return;
    const bcrumb = wrap.querySelector(':scope > .bcrumb');
    const bar = wrap.querySelector(':scope > .kc-doc-bar');
    const body = wrap.querySelector(':scope > .kc-doc-body');
    if (!bcrumb || !bar || !body) return;
    [bcrumb, bar, body].forEach((el) => { wrap.appendChild(el); });
  }
  // Reused across the custom-document Versions/TOC blocks below — a real
  // document's own .dp-blk-head onclick handlers (KC.DocPage.versToggle/
  // togglePin/tocToggle, kc-docpage.js) all resolve their target via a
  // hardcoded document.getElementById('dpVers'/'dpToc') — fine for a
  // single real document, but this app keeps all 3 workspaces' DOM alive
  // at once (only one .active), so a second matching id anywhere (another
  // workspace's real document, or a custom document's own block) would
  // silently steal every click, regardless of which workspace is actually
  // visible. Wiring each block's own toggle/pin straight off the specific
  // element that was clicked (closures, not id lookups) sidesteps that
  // entirely — this is why the custom-doc blocks below never reuse
  // KC.DocPage's own render functions or ids.
  function installBlockToggle(blockEl, container) {
    const head = blockEl.querySelector(':scope > .dp-blk-head');
    if (head) {
      head.addEventListener('click', (ev) => {
        if (ev.target.closest('.dp-toc-pin')) return;
        if (blockEl.classList.contains('pinned')) blockEl.classList.toggle('open');
        else blockEl.classList.toggle('collapsed');
      });
    }
    const pinBtn = blockEl.querySelector(':scope > .dp-blk-head .dp-toc-pin');
    if (pinBtn) {
      pinBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const pinned = blockEl.classList.toggle('pinned');
        pinBtn.title = pinned ? 'Unpin' : 'Pin to top';
        blockEl.classList.toggle('open', pinned);
        blockEl.classList.toggle('collapsed', !pinned);
        relayoutCustomPins(container);
      });
    }
  }
  // At most 2 blocks (Versions, TOC) ever coexist here, so a full
  // multi-block stacking algorithm (kc-docpage.js's DP.relayoutPins, which
  // also scans the whole document rather than one container) isn't needed
  // — just stack whichever of the two are pinned under the sticky
  // breadcrumb head, in DOM order.
  function relayoutCustomPins(container) {
    const tbhead = container.querySelector(':scope > .dp-tbhead');
    let offset = tbhead ? tbhead.getBoundingClientRect().height : 0;
    [...container.querySelectorAll(':scope > .dp-blk.pinned')].forEach((el) => {
      el.style.top = offset + 'px';
      offset += el.getBoundingClientRect().height;
    });
  }
  // A custom document's own "Versions" is just the {createdBy,createdAt,
  // editedBy,editedAt} kc_docs already tracks (KC.saveDoc, locked) — not a
  // growing audit trail; kc-docpage's own DP.allVersions would also mix in
  // a single GLOBAL, cross-document log (RemoteKV kc_docpage_versions) on
  // top of whatever's passed in, which is real documents' own log, not
  // something a custom document's "Versions" should ever show.
  function buildCustomVersionEntries(meta) {
    if (!meta || !meta.createdBy) return null;
    const entries = [{ v: 1, who: meta.createdBy, date: meta.createdAt ? KC.fmtDate(meta.createdAt) : 'Draft' }];
    if (meta.editedBy && (meta.editedAt !== meta.createdAt || meta.editedBy !== meta.createdBy)) {
      entries.push({ v: 2, who: meta.editedBy, date: KC.fmtDate(meta.editedAt) });
    }
    return entries;
  }
  // Same markup DP.versionsHTML (kc-docpage.js) renders — .dp-blk/.dp-vitem/
  // .dp-vbadge/etc — minus the onclick attributes (installBlockToggle wires
  // those instead) and the id (own unique-enough one, never "dpVers").
  function renderCustomVersionsBlock(docId, entries) {
    const items = entries.map((v, i) => {
      const chip = i === 0 ? '<span class="dp-vbadge">Created</span>' : '<span class="dp-vchip">v' + esc(String(v.v)) + '</span>';
      return '<div class="dp-vitem' + (i === 0 ? ' dp-vcreate' : '') + '">'
        + '<div class="dp-vmain"><div class="dp-vhead"><span class="dp-vwho2">' + esc(v.who) + '</span>'
        + '<span class="dp-vmeta">' + chip + '<span class="dp-vdate2">' + esc(v.date) + '</span></span></div></div></div>';
    }).join('');
    const host = document.createElement('div');
    host.innerHTML = '<section class="dp-blk dp-versions collapsed" id="' + esc('dpVers-' + docId) + '">'
      + '<div class="dp-blk-head"><span class="dp-blk-h"><i data-lucide="history"></i><span>Versions</span>'
      + '<span class="dp-blk-count">' + entries.length + '</span></span>'
      + '<span class="dp-blk-ctrl"><button class="dp-toc-pin" title="Pin to top"><svg class="dp-pin-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10"></path><path d="M9.5 4v5l-2 3h9l-2-3V4"></path><path d="M12 12v8"></path></svg></button>'
      + '<i data-lucide="chevron-down" class="dp-blk-caret"></i></span></div>'
      + '<div class="dp-blk-body"><div class="dp-vlog">' + items + '</div></div></section>';
    return host.firstElementChild;
  }
  // Scans the doc body for headings — both a plain new document's own
  // (h1-h6, TipTap's default schema) and a "Duplicate to edit" copy's
  // .dp-h2-.dp-h5-classed ones. Always mints a fresh, doc-scoped anchor id
  // for every heading rather than trusting one a duplicated heading might
  // already carry (a "sec-N" id copied from its source real document) —
  // digest anchors are only unique *within* one document, so a duplicate
  // could otherwise collide with its own still-open source, or with
  // another workspace's real document using the same "sec-N".
  function buildCustomToc(bodyEl, docId) {
    if (!bodyEl) return [];
    const heads = [...bodyEl.querySelectorAll('h1,h2,h3,h4,h5,h6,.dp-h2,.dp-h3,.dp-h4,.dp-h5')];
    const base = 'kc-toc-' + docId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return heads.map((el, i) => {
      el.id = base + '-' + i;
      const tagLvl = /^H[1-6]$/.test(el.tagName) ? +el.tagName[1] : 0;
      const classMatch = el.className.match(/dp-h([2-5])/);
      // A "Duplicate to edit" copy's heading (kc-docpage.js's DP.blocksHTML)
      // renders its real section number as a separate .dp-hnum span BEFORE
      // the actual heading text (.dp-htx) — using the whole element's
      // textContent glues that number onto the text instead of keeping it
      // as its own number badge, which is what actually made this look
      // "off" compared to the real document's own TOC.
      const txtEl = el.querySelector(':scope > .dp-htx');
      const numEl = el.querySelector(':scope > .dp-hnum');
      const txt = (txtEl ? txtEl.textContent : el.textContent || '').trim();
      const num = numEl ? numEl.textContent.replace(/\.\s*$/, '').trim() : '';
      return { txt, num, anchor: el.id, lvl: tagLvl || (classMatch ? +classMatch[1] : 2) };
    }).filter((e) => e.txt);
  }
  // Same markup DP.tocHTML (kc-docpage.js) renders — .dp-blk/.dp-toc-i/
  // .dp-toc-n/etc — minus the onclick (installBlockToggle + a plain scoped
  // scrollIntoView instead of KC.DocPage.goToSection's own
  // document.getElementById('dpToc')-based pinned-state lookup) and the id.
  function renderCustomTocBlock(entries) {
    const items = entries.map((it, i) => {
      const heb = /[\u0590-\u05FF]/.test(it.txt);
      // Same branch DP.tocHTML itself takes -- Hebrew entries get .dp-toc-he
      // (+ a gray English translation line straight from kc-docpage's own
      // DP.EN dictionary, when this exact phrase happens to be in it) and
      // ONLY English-only entries get .dp-toc-only; using .dp-toc-only for
      // everything (an earlier pass here) meant every Hebrew heading -- the
      // vast majority of them -- rendered with the wrong styling.
      const en = window.KC && KC.DocPage && KC.DocPage.EN && KC.DocPage.EN[it.txt];
      const label = heb
        ? '<span class="dp-toc-he" dir="rtl">' + esc(it.txt) + '</span>' + (en ? '<span class="dp-toc-en">' + esc(en) + '</span>' : '')
        : '<span class="dp-toc-only" dir="ltr">' + esc(it.txt) + '</span>';
      const lvlClass = it.lvl >= 3 ? ' dp-toc-lvl' + it.lvl : '';
      return '<li><a class="dp-toc-i' + lvlClass + '" dir="' + (heb ? 'rtl' : 'ltr') + '" href="#' + esc(it.anchor) + '" data-anchor="' + esc(it.anchor) + '">'
        + '<span class="dp-toc-n">' + esc(it.num || String(i + 1)) + '</span>'
        + '<span class="dp-toc-t">' + label + '</span></a></li>';
    }).join('');
    const host = document.createElement('div');
    host.innerHTML = '<nav class="dp-blk dp-toc">'
      + '<div class="dp-blk-head"><span class="dp-blk-h"><i data-lucide="list-tree"></i><span>Table of contents</span></span>'
      + '<span class="dp-blk-ctrl"><button class="dp-toc-pin" title="Pin to top"><svg class="dp-pin-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10"></path><path d="M9.5 4v5l-2 3h9l-2-3V4"></path><path d="M12 12v8"></path></svg></button>'
      + '<i data-lucide="chevron-down" class="dp-blk-caret"></i></span></div>'
      + '<div class="dp-blk-body"><ol class="dp-toc-list">' + items + '</ol></div></nav>';
    const nav = host.firstElementChild;
    nav.querySelectorAll('a[data-anchor]').forEach((a) => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const target = document.getElementById(a.dataset.anchor);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    return nav;
  }
  // The whole point of this pass: a custom document's header should be
  // built from the exact same pieces a real document's is (sticky
  // title+breadcrumb head → Versions → TOC), not a hand-tuned lookalike —
  // wraps breadcrumb+Versions+TOC in one real .dp-tb (their shared --dp-*
  // scope; deliberately NOT the whole .kc-doc, so the toolbar keeps the
  // app's own fonts and a plain body's own separately-decided styling is
  // undisturbed) and keeps both blocks in sync with the doc's current
  // metadata/headings on every call — cheap enough to just rebuild both
  // each time (doc open, and on the same debounce autosave already uses).
  function buildRealDocStructureForCustomDoc(wrap) {
    // Plain descendant, not :scope > — after the first call this doc's
    // .bcrumb is nested inside .dp-tbhead/.dp-tb (below), not a direct
    // child of wrap any more, and this runs again on every autosave
    // debounce to keep the TOC current while typing.
    const bcrumb = wrap.querySelector('.bcrumb');
    if (!bcrumb) return;
    let dpTb = wrap.querySelector(':scope > .dp-tb');
    if (!dpTb) {
      dpTb = document.createElement('div');
      dpTb.className = 'dp-tb';
      bcrumb.parentElement.insertBefore(dpTb, bcrumb);
    }
    let tbhead = dpTb.querySelector(':scope > .dp-tbhead');
    if (!tbhead) {
      tbhead = document.createElement('div');
      tbhead.className = 'dp-tbhead';
      dpTb.appendChild(tbhead);
    }
    if (bcrumb.parentElement !== tbhead) tbhead.appendChild(bcrumb);
    if (!bcrumb.classList.contains('dp-bc')) {
      bcrumb.classList.add('dp-bc');
      [...bcrumb.children].forEach((el) => {
        if (el.tagName === 'SPAN') el.classList.add('dp-bc-i', el.classList.contains('bc-cur') ? 'dp-bc-cur' : 'dp-bc-lnk');
        else el.classList.add('dp-bc-sep');
      });
    }
    // This rebuilds both blocks from scratch every time it runs (doc open,
    // and again on every autosave debounce so headings stay current while
    // typing) — carry over whichever collapsed/pinned/open state the old
    // block already had (same as kc-docpage's own DP.renderVersions does
    // across its in-place re-renders) so an actively-editing user doesn't
    // see their open/pinned Versions or TOC panel snap shut every 650ms.
    const carryBlockState = (oldEl, newEl) => {
      if (!oldEl) return;
      ['collapsed', 'pinned', 'open'].forEach((c) => newEl.classList.toggle(c, oldEl.classList.contains(c)));
      const pinBtn = newEl.querySelector(':scope > .dp-blk-head .dp-toc-pin');
      if (pinBtn && newEl.classList.contains('pinned')) pinBtn.title = 'Unpin';
    };
    const docId = wrap.dataset.docid;
    const meta = docId ? API.getCustomDocs()[docId] : null;
    let versionsBlock = dpTb.querySelector(':scope > .dp-versions');
    const versionEntries = docId ? buildCustomVersionEntries(meta) : null;
    if (versionEntries) {
      const fresh = renderCustomVersionsBlock(docId, versionEntries);
      carryBlockState(versionsBlock, fresh);
      if (versionsBlock) versionsBlock.replaceWith(fresh); else dpTb.appendChild(fresh);
      installBlockToggle(fresh, dpTb);
    } else if (versionsBlock) versionsBlock.remove();
    const bodyEl = wrap.querySelector(':scope > .kc-doc-body');
    let tocBlock = dpTb.querySelector(':scope > .dp-toc');
    const tocEntries = (bodyEl && docId) ? buildCustomToc(bodyEl, docId) : [];
    if (tocEntries.length) {
      const fresh = renderCustomTocBlock(tocEntries);
      carryBlockState(tocBlock, fresh);
      if (tocBlock) tocBlock.replaceWith(fresh); else dpTb.appendChild(fresh);
      installBlockToggle(fresh, dpTb);
    } else if (tocBlock) tocBlock.remove();
    relayoutCustomPins(dpTb);
    if (KC.DocPage && KC.DocPage.injectCSS) KC.DocPage.injectCSS();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }
  // A custom document's own title (.kc-doc-title, persisted per-node in
  // kc_docs[docId].title) and its tree row's displayed name (.row-name,
  // which nodePathFor/docIdFor build the storage key from) were always two
  // fully independent fields with no sync in either direction, even before
  // any of this — KC.saveDoc only ever touched the former, KC.rename only
  // ever touched the latter (kc-app.js, both locked). That gap barely
  // showed before; a title now editable right in the header reads as "the
  // name of this thing" and is expected to rename it everywhere. Commits on
  // blur (not per-keystroke — this touches storage, and renaming is really
  // "move to a new path where only the last segment differs", so it goes
  // through moveCustomNode's own re-keying helper, migratePathDependentStorage,
  // to carry kc_docs + Notebook note storage over to the new key, exactly as
  // a real move already does — including for any descendants).
  function commitCustomTitleRename(node, ws, wrap, newTitle) {
    const nameEl = node && node.querySelector(':scope > .row .row-name');
    if (!nameEl) return;
    const oldName = nameEl.textContent.trim();
    if (!newTitle || newTitle === oldName) return;
    const wsId = ws.id;
    const oldPath = nodePathFor(node);
    nameEl.textContent = newTitle;
    const newPath = nodePathFor(node);
    migratePathDependentStorage(wsId, oldPath, newPath);
    saveAllCustomTrees();
    wrap.dataset.docid = wsId + '::' + newPath.join('›');
    const bcCur = wrap.querySelector(':scope > .bcrumb > .bc-cur');
    if (bcCur) bcCur.textContent = newTitle;
    syncNotebookColumn(ws);
  }
  // Textbook's column header (.ch) is static chrome, shared across whatever
  // document is open — it never showed the actual document's title before.
  // For a real document (read-only), mirrored the exact same way the
  // Notebook mirrors its own bound topic — straight into .ct's own text —
  // so it inherits the SAME navy color (--hd) automatically, instead of
  // living as a separately-colored sibling; also hides kc-docpage's own
  // in-body title to avoid showing it twice, gated behind a class so a
  // failed mirror leaves the original visible rather than disappearing
  // outright. A custom document needs an actual editable INPUT, which .ct's
  // own text can't hold — that one gets a sibling element instead (colored
  // to match), with the real .kc-doc-title input hidden in place
  // (everything that already reads it — KC.saveDoc/replaceSaveDocForEditor/
  // the global autosave 'input' delegate — keeps finding it exactly where
  // locked code put it) and a linked proxy forwarding both its value and a
  // synthetic 'input' event back onto the real one so autosave still fires.
  function syncTextbookHeaderTitle(ws, node) {
    const hl = ws.querySelector('.c2 .ch .hl');
    if (!hl) return;
    const ct = hl.querySelector(':scope > .ct');
    if (ct && !ct.dataset.baseLabel) ct.dataset.baseLabel = ct.textContent;
    const oldSlot = hl.querySelector(':scope > .ch-doctitle');
    if (oldSlot) oldSlot.remove();
    const cb = ws.querySelector('.c2 .cb');
    const origTitle = cb && cb.querySelector(':scope > .kc-doc:not(.kc-docpage) > .kc-doc-title');
    const realTitleEl = cb && cb.querySelector('.kc-docpage .dp-title');
    const dpWrap = cb && cb.querySelector('.kc-docpage');
    if (dpWrap) dpWrap.classList.remove('kc-hdr-title-on');
    if (!origTitle && !realTitleEl) { if (ct) ct.textContent = ct.dataset.baseLabel; return; }
    if (realTitleEl) {
      if (ct) ct.textContent = ct.dataset.baseLabel + ' · ' + (realTitleEl.textContent || '').trim();
      if (dpWrap) dpWrap.classList.add('kc-hdr-title-on');
      return;
    }
    if (ct) ct.textContent = ct.dataset.baseLabel;
    const slot = document.createElement('span');
    slot.className = 'ch-doctitle';
    hl.appendChild(slot);
    origTitle.style.display = 'none';
    const wrap = origTitle.closest('.kc-doc');
    const proxy = document.createElement('input');
    proxy.className = 'ch-doctitle-input';
    proxy.value = origTitle.value;
    proxy.placeholder = origTitle.placeholder || 'Document title';
    proxy.addEventListener('input', () => {
      origTitle.value = proxy.value;
      origTitle.dispatchEvent(new Event('input', { bubbles: true }));
    });
    if (node) {
      proxy.addEventListener('blur', () => { commitCustomTitleRename(node, ws, wrap, proxy.value.trim()); });
      proxy.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') proxy.blur(); });
    }
    slot.appendChild(proxy);
  }
  // Same mirroring for the Notebook's own header label ("Notebook · Monday")
  // — while a topic is bound, swap the workspace-name suffix for the
  // topic's own title instead (dataset.nbBaseLabel remembers the original
  // "Notebook · <workspace>" text the first time this ever runs, since
  // .ch/.ct here is static template.html chrome, never rebuilt, so nothing
  // else will re-seed it later).
  function syncNotebookHeaderTitle(ws, segs) {
    const ct = ws.querySelector('.c3 .ch .ct');
    if (!ct) return;
    if (!ct.dataset.nbBaseLabel) ct.dataset.nbBaseLabel = ct.textContent;
    const base = ct.dataset.nbBaseLabel;
    if (segs && segs.length) ct.textContent = base.split(' · ')[0] + ' · ' + segs[segs.length - 1];
    else ct.textContent = base;
  }
  // Reads whatever breadcrumb c2 already rendered for the open document —
  // real (.dp-bc, kc-docpage.js) or custom (.bcrumb, kc-app.js's
  // openCustomDoc) — rather than re-deriving the path independently, same
  // as bkTopicOf already does for sticky notes.
  function boundTopicSegments(ws) {
    const cb = ws.querySelector('.c2 .cb');
    if (!cb) return null;
    const dpBc = cb.querySelector('.kc-docpage .dp-bc');
    if (dpBc) {
      const segs = [...dpBc.querySelectorAll(':scope > .dp-bc-i')].map((s) => (s.textContent || '').trim()).filter(Boolean);
      if (segs.length) return segs;
    }
    const bcrumb = cb.querySelector(':scope > .kc-doc:not(.kc-docpage) .bcrumb');
    if (bcrumb) {
      const segs = [...bcrumb.querySelectorAll(':scope > span')].map((s) => (s.textContent || '').trim()).filter(Boolean);
      if (segs.length) return segs;
    }
    return null;
  }
  function syncNotebookColumn(wsEl) {
    const c3 = wsEl.querySelector('.c3'); if (!c3) return;
    const key = noteKeyForWs(wsEl.id);
    if (key) {
      // A document is open — just keep its notes loaded and ready; opening
      // the Notebook itself stays a manual choice (its own spine handle),
      // not something that pops open on its own whenever a document opens.
      const doc = c3.querySelector('.note-doc');
      if (doc && doc.dataset.noteKey !== key) {
        const v = RemoteKV.getRaw(key);
        const html = v != null ? v : '';
        // Once TipTap mounts on .note-doc (kc-api.js's own mountEditor,
        // further down), it overrides this element's innerHTML SETTER to a
        // no-op — c3's .note-doc is a single static node from template.html
        // that's never recreated (unlike c2's .kc-doc-body, which
        // openCustomDoc/openDocPage rebuild from scratch on every open), so
        // TipTap mounts exactly once per workspace and this plain-innerHTML
        // write silently stopped doing anything the moment that happened.
        // Write through the editor's own command when one's registered —
        // same registry check already used the same way in
        // wrapSelActForEditor above.
        const editor = window.__nbEditorRegistry && window.__nbEditorRegistry.get(doc);
        if (editor) editor.commands.setContent(html, false);
        else doc.innerHTML = html;
        doc.dataset.noteKey = key;
      }
      // Just the header title (syncNotebookHeaderTitle) identifies which
      // topic the Notebook is bound to — a full breadcrumb here would just
      // repeat what the adjacent Textbook already shows in full, and a
      // who/when card doesn't carry its weight for a single-author personal
      // scratchpad the way it does for a document other people might read.
      syncNotebookHeaderTitle(wsEl, boundTopicSegments(wsEl));
    } else {
      // Nothing open — opening the Notebook itself stays a manual choice
      // (its own spine handle), not something that pops open on its own;
      // it collapses to the spine instead, same as before.
      if (!c3.classList.contains('slim') && window.tog) window.tog(c3.id, 'l');
      syncNotebookHeaderTitle(wsEl, null);
    }
  }
  function syncAllNotebooks() {
    document.querySelectorAll('.workspace').forEach(syncNotebookColumn);
    // syncNotebookColumn used to only change the Notebook's slim/open class
    // when a document opened (auto-expanding it) — kc-app.js's own tog()/xp()
    // recompute the column split-bars (KC.layoutSplits) as a side effect of
    // THAT class change. Now that opening a document no longer touches the
    // Notebook's class, nothing was left to trigger that recompute, so the
    // split-bars between every OTHER column pair stayed frozen at whatever
    // they were at boot. Do it explicitly instead of depending on that
    // incidental side effect.
    const ws = document.querySelector('.workspace.active');
    if (ws && window.KC && KC.layoutSplits) KC.layoutSplits(ws);
  }

  /* Line-level sticky notes (kc-app.js's KC.toggleBookmark/findBk/isBookmarked)
     identify "which document" via bkTopicOf(cb), which reads
     `.bcrumb .bc-cur` *before* falling back to `.dp-bc-cur` (the real
     DocPage's own breadcrumb). Once any static (non-digested) topic has ever
     been viewed in a workspace, kc-app.js only ever hides its markup
     (`.kc-doc-hidden`) — it never removes it (see closeCustomDoc) — so that
     stale `.bcrumb .bc-cur` element matches first forever, and every
     line-level sticky note on every real document gets saved under that one
     wrong, fixed title. Can't fix bkTopicOf itself (kc-app.js), so this
     corrects the `name` argument at the door on the three functions that
     receive it, whenever a real document is actually open for that tree. */
  function realDocTitleForTree(treeId) {
    const tree = document.getElementById(treeId); if (!tree) return null;
    const ws = tree.closest('.workspace'); if (!ws) return null;
    const hasDoc = ws.querySelector('.c2 .kc-docpage');
    return (hasDoc && KC.DocPage && KC.DocPage.data && KC.DocPage.data.title) || null;
  }

  // template.html's account popover "Sign out" button is a static design
  // mockup — its onclick only ever shows a "Signed out (demo)" toast, since
  // this whole page is served by app/route.ts as raw HTML outside the
  // ClerkProvider tree (no Clerk client SDK on this page at all). Real
  // sign-out needs a page that IS inside that tree — /sign-out (a normal
  // page.tsx) calls Clerk's own signOut() and redirects to the portal's
  // sign-in. Intercept the click here (capture phase, before the button's
  // own inline handler runs) instead of editing template.html.
  function installRealSignOut() {
    if (document.__nbSignOutInstalled) return;
    document.__nbSignOutInstalled = true;
    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest && ev.target.closest('.up-item.danger');
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      window.location.href = '/sign-out';
    }, true);
  }
  installRealSignOut();

  // The account popover only closes on its own two real triggers: the
  // avatar circle (toggle) and a genuine click outside it — template.html's
  // own listener (`if(!e.target.closest('.user-wrap')) cpopUser()`) already
  // gets this right for anything actually inside #userPop. The undo bar
  // (offerBookmarkUndo, below) has to live outside .user-wrap — it needs to
  // outlive the popover being closed while its own 6s timer is still
  // running — so from that listener's point of view a click on Undo looks
  // like a genuine outside click and closes the popover as a side effect.
  // Stop it in capture phase before that (or any future unrelated) bubble
  // listener ever sees it.
  function installUndoBarClickIsolation() {
    if (document.__nbUndoBarIsolated) return;
    document.__nbUndoBarIsolated = true;
    document.addEventListener('click', (ev) => {
      if (ev.target.closest && ev.target.closest('#kcUndoBar')) ev.stopPropagation();
    }, true);
  }
  installUndoBarClickIsolation();

  // The editable custom-doc page in c2 (Textbook) — openCustomDoc's .kc-doc,
  // opened for a duplicated-to-edit or saved-as-topic document — only saves
  // on an explicit click of its Save button. c3's free-writing Notebook
  // already autosaves silently (KC.autoSaveNote, 650ms debounce), with its
  // "Saving…/Saved" badge living in the column HEADER (.ch-tools), not the
  // toolbar. Match that exactly for c2: one .nb-status badge in c2's own
  // .ch-tools (shown only while a custom doc is open, hidden for a real
  // one), and the manual Save button removed — autosave is the only save
  // path now, same as the Notebook. Reuses KC.saveDoc itself (the one real
  // persistence path) rather than re-implementing it; its own toast is left
  // alone (KC.saveDoc always calls it) — the auto-save one is a duplicate
  // we don't want, so it's synchronously suppressed on the #toast element
  // the instant KC.saveDoc paints it (same DOM-patch trick used for the
  // bookmark toast fix elsewhere in this file).
  const DOC_SAVE_TIMERS = {};
  function c2StatusBadge(ws) {
    const tools = ws && ws.querySelector('.c2 .ch-tools');
    if (!tools) return null;
    let status = tools.querySelector('.nb-status');
    if (status) return status;
    status = document.createElement('span');
    status.className = 'nb-status';
    status.title = 'Saves automatically';
    status.innerHTML = '<i data-lucide="check"></i><span class="nb-t">Saved</span>';
    const menuBtn = tools.querySelector('.ib');
    if (menuBtn) tools.insertBefore(status, menuBtn); else tools.appendChild(status);
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    return status;
  }
  function showC2Status(ws) { const s = c2StatusBadge(ws); if (s) s.style.display = ''; }
  function hideC2Status(ws) { const s = c2StatusBadge(ws); if (s) s.style.display = 'none'; }
  // Called whenever a custom doc is (re)opened — openCustomDoc rebuilds
  // .kc-doc-bar from scratch each time, so the manual Save button has to be
  // stripped on every open, not just once.
  function applyC2SaveUX(wrap, ws) {
    const bar = wrap.querySelector('.kc-doc-bar');
    const saveBtn = bar && bar.querySelector('.note-save');
    if (saveBtn) saveBtn.remove();
    showC2Status(ws);
  }
  function autoSaveCustomDocWrap(wrap) {
    const id = wrap.dataset.docid;
    if (!id) return;
    const ws = wrap.closest('.workspace');
    const status = ws && c2StatusBadge(ws);
    const t = status && status.querySelector('.nb-t');
    if (status) { status.style.display = ''; status.classList.add('saving'); if (t) t.textContent = 'Saving…'; }
    clearTimeout(DOC_SAVE_TIMERS[id]);
    DOC_SAVE_TIMERS[id] = setTimeout(() => {
      if (window.KC && KC.saveDoc) KC.saveDoc({ closest: () => wrap });
      const toastEl = document.getElementById('toast');
      if (toastEl) toastEl.classList.remove('show');
      if (status) { status.classList.remove('saving'); if (t) t.textContent = 'Saved'; }
      // Headings can be added/renamed/removed while typing — refresh the
      // Table of contents (and Versions, cheap either way) on the same
      // debounce, so it doesn't go stale until the doc is reopened.
      buildRealDocStructureForCustomDoc(wrap);
    }, 650);
  }
  function installCustomDocAutosave() {
    if (document.__nbDocAutosaveWired) return;
    document.__nbDocAutosaveWired = true;
    document.addEventListener('input', (ev) => {
      const wrap = ev.target && ev.target.closest && ev.target.closest('.kc-doc:not(.kc-docpage)');
      if (wrap && wrap.dataset.docid) autoSaveCustomDocWrap(wrap);
    });
  }
  installCustomDocAutosave();

  // A node that gains a child — via "Add my sub-topic" (KC.addChild, which
  // works on ANY node, not just custom ones), or one that already has both
  // a doc and children in the static tree data — gets its row permanently
  // rewritten by ensureKids/buildNode (locked, kc-app.js): leaf→branch,
  // onclick goes from KC.select(this) to KC.toggle(this). The node's own
  // document (data-doc, or its .custom saved/snapshot content) is
  // untouched by that — KC.select itself never checks .leaf vs .branch —
  // so the document is still there, just unreachable by a normal click:
  // clicking now only expands/collapses, with no way back to what the row
  // used to open. Reported after using "Add my sub-topic" on a document
  // that already had real content.
  //
  // Fix: split the two actions a branch-with-a-document now needs — the
  // twisty keeps toggling expand/collapse; clicking anywhere else on the
  // row opens the document instead (same KC.select any leaf already uses).
  // Only for rows that actually have something to open (data-doc, or
  // .custom) — a plain category folder with neither keeps behaving exactly
  // as before (click anywhere toggles), so this never introduces a new
  // "closes whatever you were reading" side effect on rows that never had
  // a document in the first place.
  // One delegated, capture-phase listener — not a MutationObserver, not
  // per-row rewiring — so it doesn't care how or when a row became a
  // branch, and never touches the DOM itself (nothing to loop on).
  function installBranchOpenOnClick() {
    if (document.__nbBranchOpenWired) return;
    document.__nbBranchOpenWired = true;
    document.addEventListener('click', (ev) => {
      const row = ev.target.closest && ev.target.closest('.row.branch');
      if (!row) return;
      if (ev.target.closest('.row-menu')) return; // let the ⋯ menu's own onclick run normally
      if (ev.target.closest('.tw')) {
        ev.stopPropagation();
        if (window.KC && KC.toggle) KC.toggle(row);
        return;
      }
      const node = row.closest('.node');
      const hasDoc = node && (node.dataset.doc || node.classList.contains('custom'));
      if (!hasDoc) return; // pure category folder — let the row's own toggle-on-click run as before
      ev.stopPropagation();
      if (window.KC && KC.select) KC.select(row);
    }, true);
  }
  installBranchOpenOnClick();

  // The header's role dropdown (Onboarding/Employee/Team Lead) used to let
  // anyone self-promote with one click. Role is now server-assigned only
  // (see realKnowledgeRole above) — the switcher UI is retired: the button
  // becomes an inert label showing your real role, the chevron/menu never
  // open. KC.applyRoleUI (locked, runs at boot) still paints the label/icon
  // from KC.API.getRole(), which now always returns the real role, so the
  // label itself stays correct — only the "click to change it" affordance
  // is disabled.
  function installRoleGate() {
    if (document.__nbRoleGateInstalled) return;
    document.__nbRoleGateInstalled = true;
    const style = document.createElement('style');
    style.id = 'kc-role-gate-style';
    style.textContent = '.role-dd-chev{display:none}.role-dd-btn{cursor:default}';
    document.head.appendChild(style);
    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest && ev.target.closest('.role-dd-btn');
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
    }, true);
  }
  installRoleGate();

  // Real in-app notifications — the honest replacement for toasts that
  // used to claim "author notified" (kc-teamlead.js's doReject) with no
  // notification mechanism behind them at all. Own section inserted into
  // the account popover (#userPop), never touching #upAssignSec/
  // #upAssignList — those are actively repainted by kc-app.js's own
  // KC.renderAssignments on every popover open, and it does a bare
  // innerHTML replace, so sharing that container would just get this
  // wiped out from under it.
  function ensureNotifSection() {
    let sec = document.getElementById('kcNotifSec');
    if (sec) return sec;
    const anchor = document.getElementById('upAssignSec');
    if (!anchor || !anchor.parentElement) return null;
    sec = document.createElement('div');
    sec.className = 'up-sec';
    sec.id = 'kcNotifSec';
    sec.style.display = 'none';
    sec.innerHTML = '<div class="up-lbl">Notifications</div><div id="kcNotifList"></div>';
    anchor.parentElement.insertBefore(sec, anchor);
    return sec;
  }
  function paintNotifBadge(count) {
    const av = document.getElementById('navUser');
    if (!av) return;
    let badge = document.getElementById('kcNotifBadge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'kcNotifBadge';
      badge.className = 'kc-notif-badge';
      av.appendChild(badge);
    }
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
  function refreshNotifBadge() {
    fetch('/api/kc/notifications', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) paintNotifBadge(data.unreadCount || 0); })
      .catch(() => {});
  }
  function renderNotifPanel() {
    const sec = ensureNotifSection();
    if (!sec) return;
    fetch('/api/kc/notifications', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const items = data.items || [];
        const box = document.getElementById('kcNotifList');
        if (!items.length) { sec.style.display = 'none'; return; }
        sec.style.display = '';
        if (box) box.innerHTML = items.map((n) => (
          '<div class="asg-item"><span class="asg-ic"><i data-lucide="bell"></i></span>' +
          '<div class="asg-body"><div class="asg-t">' + esc(n.message) + '</div></div></div>'
        )).join('');
        if (window.lucide && lucide.createIcons) lucide.createIcons();
        if (data.unreadCount > 0) {
          fetch('/api/kc/notifications/read-all', { method: 'POST', credentials: 'include' })
            .then(() => paintNotifBadge(0))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }
  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function installNotifications() {
    if (document.__nbNotifStyleInstalled) return;
    document.__nbNotifStyleInstalled = true;
    const style = document.createElement('style');
    style.id = 'kc-notif-style';
    style.textContent = '.kc-notif-badge{position:absolute;bottom:-2px;right:-2px;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:#dc2626;border:2px solid var(--bg0,#fff);color:#fff;font-size:9px;line-height:14px;text-align:center;font-weight:700;display:none}';
    document.head.appendChild(style);
    refreshNotifBadge();
  }
  installNotifications();

  // ── Profile photo crop (pickAvatar/onAvatarFile/applyAvatar are global
  // functions in template.html, not namespaced under KC — always auto-crop
  // via background-position:center, no way to choose which part of the
  // photo ends up in the circle, and for a lot of photos that's the wrong
  // part). Full replacement of onAvatarFile: same upload entry point, but
  // shows a drag-to-pan + zoom modal first, renders the chosen crop to a
  // fixed square PNG via canvas, and only then hands that to the original
  // applyAvatar — everything downstream (localStorage persistence, the
  // toast) stays exactly as it was.
  function installAvatarCropStyle() {
    if (document.getElementById('kc-avcrop-style')) return;
    const style = document.createElement('style');
    style.id = 'kc-avcrop-style';
    style.textContent =
      '.kc-avcrop-modal{position:fixed;inset:0;background:rgba(15,18,45,.55);display:none;align-items:center;justify-content:center;z-index:900}' +
      '.kc-avcrop-modal.show{display:flex}' +
      '.kc-avcrop-card{background:var(--bg1,#fff);border-radius:16px;padding:20px;width:300px;box-shadow:0 20px 60px rgba(0,0,0,.3)}' +
      '.kc-avcrop-h{font-weight:700;font-size:14px;margin-bottom:12px;color:var(--hd,#1e248c)}' +
      '.kc-avcrop-frame{width:220px;height:220px;margin:0 auto;border-radius:50%;overflow:hidden;position:relative;background:#111;cursor:grab;touch-action:none}' +
      '.kc-avcrop-frame.dragging{cursor:grabbing}' +
      '.kc-avcrop-img{position:absolute;left:0;top:0;user-select:none;-webkit-user-drag:none;pointer-events:none}' +
      '.kc-avcrop-hint{text-align:center;font-size:11px;color:var(--tx2,#8a8fa3);margin-top:8px}' +
      '.kc-avcrop-zoom{width:220px;display:block;margin:6px auto 0}' +
      '.kc-avcrop-actions{display:flex;gap:8px;margin-top:16px;justify-content:flex-end}' +
      '.kc-avcrop-actions button{border:none;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:600;cursor:pointer}' +
      '.kc-avcrop-cancel{background:var(--bg2,#eef1f8);color:var(--tx1,#333)}' +
      '.kc-avcrop-save{background:var(--acc,#1e248c);color:#fff}';
    document.head.appendChild(style);
  }
  function buildAvatarCropModal() {
    let modal = document.getElementById('kcAvatarCrop');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'kcAvatarCrop';
    modal.className = 'kc-avcrop-modal';
    modal.innerHTML =
      '<div class="kc-avcrop-card">' +
      '<div class="kc-avcrop-h">Crop your photo</div>' +
      '<div class="kc-avcrop-frame"><img class="kc-avcrop-img" draggable="false"></div>' +
      '<div class="kc-avcrop-hint">Drag to reposition</div>' +
      '<input type="range" class="kc-avcrop-zoom" min="1" max="3" step="0.01" value="1">' +
      '<div class="kc-avcrop-actions">' +
      '<button class="kc-avcrop-cancel">Cancel</button>' +
      '<button class="kc-avcrop-save">Save</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(modal);
    return modal;
  }
  function openAvatarCropModal(dataUrl, onDone) {
    installAvatarCropStyle();
    const modal = buildAvatarCropModal();
    const img = modal.querySelector('.kc-avcrop-img');
    const frame = modal.querySelector('.kc-avcrop-frame');
    const zoomEl = modal.querySelector('.kc-avcrop-zoom');
    const VIEW = 220, OUT = 256;
    const state = { natW: 0, natH: 0, baseScale: 1, zoom: 1, dx: 0, dy: 0, dragging: false, sx: 0, sy: 0, sdx: 0, sdy: 0 };
    function clampAndPaint() {
      const scale = state.baseScale * state.zoom;
      const dispW = state.natW * scale, dispH = state.natH * scale;
      const maxDx = Math.max(0, (dispW - VIEW) / 2), maxDy = Math.max(0, (dispH - VIEW) / 2);
      state.dx = Math.max(-maxDx, Math.min(maxDx, state.dx));
      state.dy = Math.max(-maxDy, Math.min(maxDy, state.dy));
      const left = (VIEW - dispW) / 2 + state.dx, top = (VIEW - dispH) / 2 + state.dy;
      img.style.width = dispW + 'px';
      img.style.height = dispH + 'px';
      img.style.left = left + 'px';
      img.style.top = top + 'px';
    }
    img.onload = () => {
      state.natW = img.naturalWidth; state.natH = img.naturalHeight;
      if (!state.natW || !state.natH) return;
      state.baseScale = Math.max(VIEW / state.natW, VIEW / state.natH);
      state.zoom = 1; state.dx = 0; state.dy = 0;
      zoomEl.value = '1';
      clampAndPaint();
    };
    img.src = dataUrl;
    zoomEl.oninput = () => { state.zoom = parseFloat(zoomEl.value) || 1; clampAndPaint(); };
    function pointOf(ev) { return ev.touches ? ev.touches[0] : ev; }
    function onDown(ev) {
      state.dragging = true; frame.classList.add('dragging');
      const p = pointOf(ev);
      state.sx = p.clientX; state.sy = p.clientY; state.sdx = state.dx; state.sdy = state.dy;
      ev.preventDefault();
    }
    function onMove(ev) {
      if (!state.dragging) return;
      const p = pointOf(ev);
      state.dx = state.sdx + (p.clientX - state.sx);
      state.dy = state.sdy + (p.clientY - state.sy);
      clampAndPaint();
    }
    function onUp() { state.dragging = false; frame.classList.remove('dragging'); }
    frame.onmousedown = onDown;
    frame.ontouchstart = onDown;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    function cleanup() {
      modal.classList.remove('show');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    }
    modal.querySelector('.kc-avcrop-cancel').onclick = cleanup;
    modal.querySelector('.kc-avcrop-save').onclick = () => {
      const scale = state.baseScale * state.zoom;
      const dispW = state.natW * scale, dispH = state.natH * scale;
      const left = (VIEW - dispW) / 2 + state.dx, top = (VIEW - dispH) / 2 + state.dy;
      const sx = -left / scale, sy = -top / scale, sSize = VIEW / scale;
      const canvas = document.createElement('canvas');
      canvas.width = OUT; canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
      cleanup();
      onDone(canvas.toDataURL('image/png'));
    };
    modal.classList.add('show');
  }
  function installAvatarCropReplacement() {
    if (window.onAvatarFile && window.onAvatarFile.__nbCropReplaced) return;
    const applyOrig = window.applyAvatar;
    window.onAvatarFile = function (input) {
      const f = input.files && input.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        openAvatarCropModal(r.result, (croppedDataUrl) => {
          if (applyOrig) applyOrig(croppedDataUrl);
          try { localStorage.setItem('kc_avatar', croppedDataUrl); } catch (e) { /* best-effort persistence, same as before */ }
          if (window.KC && KC.toast) KC.toast('Photo updated');
        });
      };
      r.readAsDataURL(f);
      input.value = '';
    };
    window.onAvatarFile.__nbCropReplaced = true;
  }
  installAvatarCropReplacement();

  // ── Content tree search + "only mine" filter ────────────────────────────
  // The search box in the Plan/Content column header (.sbox, "Search
  // topics…") already exists in the locked markup and wires to a global
  // filterT(input, treeId) — but filterT was written against an older tree
  // markup (.tr/.tl/.bci classes) that doesn't exist anymore; the current
  // tree uses .node/.row/.row-name/.kids. So it's been silently doing
  // nothing this whole time. Full replacement (same global-function seam as
  // onAvatarFile above), plus a new "only mine" toggle button next to it.
  const TREE_FILTER_STATE = new Map(); // treeId -> {q, onlyMine}
  function treeFilterState(treeId) {
    if (!TREE_FILTER_STATE.has(treeId)) TREE_FILTER_STATE.set(treeId, { q: '', onlyMine: false });
    return TREE_FILTER_STATE.get(treeId);
  }
  function nodeNameMatches(node, q) {
    if (!q) return true;
    const nameEl = node.querySelector(':scope > .row .row-name');
    return !!(nameEl && nameEl.textContent.toLowerCase().indexOf(q) !== -1);
  }
  function applyTreeFilter(treeId) {
    const tree = document.getElementById(treeId);
    if (!tree) return;
    const state = treeFilterState(treeId);
    const q = state.q, onlyMine = state.onlyMine;
    const allNodes = tree.querySelectorAll('.node');
    if (!q && !onlyMine) {
      allNodes.forEach((n) => { n.style.display = ''; });
      return;
    }
    const matches = [];
    allNodes.forEach((n) => {
      const mineOk = !onlyMine || n.classList.contains('custom');
      if (mineOk && nodeNameMatches(n, q)) matches.push(n);
    });
    const toShow = new Set();
    matches.forEach((n) => {
      toShow.add(n);
      let p = n.parentElement && n.parentElement.closest('.node');
      while (p) {
        toShow.add(p);
        // expand ancestors so a match further down is actually visible —
        // NOT the match's own kids if it happens to be a branch itself.
        const kids = p.querySelector(':scope > .kids');
        if (kids) kids.classList.remove('collapsed');
        const tw = p.querySelector(':scope > .row .tw');
        if (tw) tw.classList.remove('c');
        p = p.parentElement && p.parentElement.closest('.node');
      }
    });
    allNodes.forEach((n) => { n.style.display = toShow.has(n) ? '' : 'none'; });
  }
  function installTreeFilter() {
    window.filterT = function (input, treeId) {
      treeFilterState(treeId).q = (input.value || '').toLowerCase().trim();
      applyTreeFilter(treeId);
    };
    document.querySelectorAll('.sbox').forEach((box) => {
      const input = box.querySelector('input');
      const onclickAttr = input && input.getAttribute('oninput') || '';
      const m = onclickAttr.match(/filterT\(this,\s*'([^']+)'\)/);
      const treeId = m && m[1];
      if (!treeId || box.querySelector('.tree-filter-mine')) return;
      const btn = document.createElement('button');
      btn.className = 'tree-filter-mine';
      btn.title = 'Show only my custom items';
      btn.innerHTML = '<i data-lucide="folder-heart"></i>';
      btn.addEventListener('click', () => {
        const state = treeFilterState(treeId);
        state.onlyMine = !state.onlyMine;
        btn.classList.toggle('on', state.onlyMine);
        applyTreeFilter(treeId);
      });
      box.appendChild(btn);
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }
  installTreeFilter();

  // ── Remember layout across visits: active workspace tab + which columns
  // were open in each. Which DOCUMENT was open is saved separately, from
  // KC.select itself (wrapSelectSaveOpenTopic, further down — needs
  // currentTopicKey, defined later in this file) and restored at boot
  // alongside the Mentor/Notebook restores (see restoreAllOpenTopics).
  function saveActiveWs() {
    const list = [...document.querySelectorAll('.workspace')];
    const idx = list.findIndex((w) => w.classList.contains('active'));
    if (idx >= 0) RemoteKV.set(K.uiActiveWs, idx);
  }
  function saveColState(ws) {
    if (!ws) return;
    const state = {};
    ['c1', 'c2', 'c3', 'c4'].forEach((cls) => {
      const col = ws.querySelector('.' + cls);
      state[cls] = !!(col && !col.classList.contains('slim'));
    });
    RemoteKV.set(K.uiCols(ws.id), state);
  }
  function installUiStatePersistence() {
    const origSwitchWS = window.switchWS;
    if (origSwitchWS && !origSwitchWS.__nbUiSaved) {
      window.switchWS = function () {
        const r = origSwitchWS.apply(this, arguments);
        saveActiveWs();
        return r;
      };
      window.switchWS.__nbUiSaved = true;
    }
    const origXp = window.xp;
    if (origXp && !origXp.__nbUiSaved) {
      window.xp = function (id) {
        const r = origXp.apply(this, arguments);
        const el = document.getElementById(id);
        saveColState(el && el.closest('.workspace'));
        return r;
      };
      window.xp.__nbUiSaved = true;
    }
    const origTog = window.tog;
    if (origTog && !origTog.__nbUiSaved) {
      window.tog = function (id) {
        const r = origTog.apply(this, arguments);
        const el = document.getElementById(id);
        saveColState(el && el.closest('.workspace'));
        return r;
      };
      window.tog.__nbUiSaved = true;
    }
  }
  installUiStatePersistence();

  // "Open all" — a global-header button (.nav is the one page-level header
  // shared by all 3 workspaces; the workspace switcher itself lives inside
  // c1's own content, not somewhere page-level) that expands every column
  // of whichever workspace is currently active.
  function installExpandAllButton() {
    const logo = document.querySelector('.logo');
    if (!logo || document.getElementById('kcExpandAllBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'kcExpandAllBtn';
    btn.className = 'nav-expand-all';
    btn.title = 'Open/close all columns';
    btn.innerHTML = '<i data-lucide="chevrons-left-right"></i>';
    // tog() toggles either way but needs to know which handle side a column
    // has (for the chevron direction) — same detection xp() itself uses.
    function collapseColumn(col) {
      const side = col.querySelector('.hnd.r') ? 'r' : 'l';
      if (window.tog) window.tog(col.id, side);
    }
    btn.addEventListener('click', () => {
      const ws = document.querySelector('.workspace.active') || document.querySelector('.workspace');
      if (!ws) return;
      const cols = ['c1', 'c2', 'c3', 'c4'].map((cls) => ws.querySelector('.' + cls)).filter(Boolean);
      const allOpen = cols.every((col) => !col.classList.contains('slim'));
      cols.forEach((col) => {
        if (allOpen) { if (!col.classList.contains('slim')) collapseColumn(col); }
        else if (col.classList.contains('slim') && window.xp) window.xp(col.id);
      });
    });
    logo.appendChild(btn);
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }
  installExpandAllButton();

  (function installBookmarkIconStyle() {
    const style = document.createElement('style');
    style.id = 'kc-bookmark-icon-style';
    style.textContent = '.bk-dot-bookmark{width:14px;height:14px;border-radius:0;clip-path:none;display:inline-flex;align-items:center;justify-content:center;margin-top:2px;color:var(--acc2,#44b8d3);flex-shrink:0}.bk-dot-bookmark .lucide{width:12px;height:12px}'
      // Mirrors .toast's own look (template.html) so it reads as part of the
      // same system, sitting just above it so the two never overlap.
      + '.kc-undo-bar{position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:var(--hd,#1e248c);color:#fff;font-size:13px;font-weight:500;padding:9px 10px 9px 16px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:700;display:flex;align-items:center;gap:12px}'
      + '.kc-undo-bar button{background:rgba(255,255,255,.14);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:700;cursor:pointer}'
      + '.kc-undo-bar button:hover{background:rgba(255,255,255,.24)}'
      // .kc-doc-bar already pushes .note-save to the right via margin-left:
      // auto; giving the injected autosave badge the same margin makes IT
      // the pushed element, with Save immediately following it, matching
      // c3's own nb-status+button grouping.
      + '.kc-doc-bar .nb-status{margin-left:auto}'
      // Custom (user-created) nodes used to be marked by a colored left
      // border + tinted background + accent-colored name — the same accent
      // color .row.sel (the currently-open row) uses, so a custom node that
      // was ALSO the open one was ambiguous: color alone couldn't tell you
      // which fact it was showing. Custom is now marked by a small icon
      // only (added in JS, see ensureCustomBadge); .row.sel's accent stays
      // the single unambiguous "this is what's open" signal. Same
      // specificity as the rules being overridden (template.html's own
      // .node.custom>.row / >.row-name), later in source order so it wins.
      + '.node.custom>.row{border-left-color:transparent;background:none}'
      + '.node.custom>.row:hover{background:var(--bg2)}'
      + '.node.custom>.row>.row-name{color:var(--tx1)}'
      + '.node.custom>.row.branch>.row-name{color:var(--hd)}'
      + '.kc-custom-badge{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;color:var(--acc2,#44b8d3);flex-shrink:0;margin-top:2px}'
      + '.kc-custom-badge .lucide{width:12px;height:12px}'
      // Clickable breadcrumbs (both the custom-doc one and the real
      // document's current segment) reveal + flash the row in the Plan
      // tree via KC.goTo — same affordance the real doc's own ancestor
      // links already have (KC.DocPage.navPath/.dp-bc-lnk).
      + '.bcrumb>span{cursor:pointer}.bcrumb>span:hover{text-decoration:underline}'
      + '.dp-bc-cur{cursor:pointer}.dp-bc-cur:hover{text-decoration:underline}'
      // TipTap's own Placeholder extension convention — .note-doc:empty:
      // before (template.html) no longer fires once TipTap mounts (the
      // container always has ProseMirror's own child div, so it's never
      // :empty even when logically blank).
      + '.note-doc .tiptap{outline:none}'
      + '.note-doc .tiptap p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:var(--tx2);pointer-events:none;float:left;height:0}'
      // #selmenu switched from a row to a column — narrower footprint,
      // matches the app's other menus (#ctxmenu is already a vertical
      // list), and less likely to run into the screen edge near a
      // selection close to it. onSelect's own positioning math (kc-app.js)
      // reads m.offsetWidth/offsetHeight live, so it adapts on its own.
      + '.selmenu.show{flex-direction:column}'
      + '.selmenu button{width:100%}'
      // #selmenu's own drag grip (installSelMenuDrag) — a full-width bar
      // above the buttons now that the menu is a column.
      + '.selmenu-grip{display:flex;align-items:center;justify-content:center;padding:2px 0 4px;cursor:grab;color:var(--tx2,#8a8fa3);flex-shrink:0}'
      + '.selmenu-grip:active{cursor:grabbing}'
      + '.selmenu-grip .lucide{width:13px;height:13px}'
      // Mentor "Chat history" modal.
      + '.kc-mhist-modal{position:fixed;inset:0;background:rgba(15,18,45,.55);display:none;align-items:center;justify-content:center;z-index:900}'
      + '.kc-mhist-modal.show{display:flex}'
      + '.kc-mhist-card{background:var(--bg1,#fff);border-radius:16px;padding:16px;width:340px;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)}'
      + '.kc-mhist-h{font-weight:700;font-size:14px;margin-bottom:10px;color:var(--hd,#1e248c);display:flex;align-items:center;justify-content:space-between}'
      + '.kc-mhist-close{border:none;background:transparent;cursor:pointer;color:var(--tx2,#8a8fa3);display:flex;padding:2px}'
      + '.kc-mhist-list{overflow-y:auto;display:flex;flex-direction:column;gap:4px}'
      + '.kc-mhist-item{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;border:none;background:var(--bg2,#f4f5fb);border-radius:10px;padding:8px 10px;cursor:pointer;width:100%}'
      + '.kc-mhist-item:hover{background:var(--acc-bg)}'
      + '.kc-mhist-when{font-size:10px;color:var(--tx2,#8a8fa3);font-family:var(--font-mono)}'
      + '.kc-mhist-snip{font-size:12.5px;color:var(--tx0,#1a1a2e)}'
      + '.kc-mhist-empty{font-size:12.5px;color:var(--tx2,#8a8fa3);padding:12px 4px}'
      // "Only mine" tree-filter toggle, next to the (now working) search
      // box — a compact press-button: filled solid when on, just an
      // outline when off. A full switch (pill+knob) next to the icon read
      // as cramped in this narrow column; this keeps the same footprint as
      // a plain icon button while still making on/off unambiguous.
      + '.tree-filter-mine{display:flex;align-items:center;justify-content:center;width:22px;height:22px;flex-shrink:0;border:1.5px solid var(--bd2,#d5d9ea);border-radius:7px;background:transparent;color:var(--tx2,#8a8fa3);cursor:pointer}'
      + '.tree-filter-mine:hover{border-color:var(--acc2,#44b8d3);color:var(--tx0,#1a1a2e)}'
      + '.tree-filter-mine.on{border-color:transparent;background:var(--eb-brand-gradient,linear-gradient(135deg,#1e248c,#44b8d3));color:#fff}'
      + '.tree-filter-mine .lucide{width:13px;height:13px}'
      // Explicit stroke override, not just color — lucide icons elsewhere
      // in this codebase (e.g. .mm-tab.active .lucide) need stroke set
      // directly, currentColor inheritance alone isn't reliable here.
      + '.tree-filter-mine.on .lucide{stroke:#fff}'
      // The official document's figures (.dp-fig, kc-docpage.js) have zero
      // horizontal margin — the image frame runs edge-to-edge — so the
      // sticky-note tab (which positions itself 5px from the block's own
      // left/right edge) sits right on top of the image itself, unlike a
      // paragraph or callout (which has real padding). Adding margin alone
      // doesn't move the tab — margin is OUTSIDE the block's own box, and
      // the tab positions relative to that box's own edge, not the margin
      // — so it needs a NEGATIVE offset to actually land in the new gutter,
      // same trick already used for list items (.dp-list>li .kc-tab.side-l
      // {left:-29px} in template.html) for the exact same reason.
      + '.kc-docpage .dp-body>.dp-fig{margin:18px 30px 22px;position:relative}'
      + '.kc-docpage .dp-body>.dp-fig>.kc-tab{top:14px}'
      + '.kc-docpage .dp-body>.dp-fig>.kc-tab.side-l{left:-26px}'
      + '.kc-docpage .dp-body>.dp-fig>.kc-tab.side-r{right:-26px}'
      // The ABOVE only ever fixed the already-placed tab (.kc-tab) — the
      // hover-only "add a sticky note" trigger button (.kc-bm, template.html)
      // is a separate element with its own template.html rule
      // (.kc-bm-l{left:5px}/.kc-bm-r{right:5px}, same 5px-from-own-edge
      // logic), never given the matching offset — so it was still sitting
      // 5px inside the image the whole time, this just never got noticed
      // until a figure was actually hovered. Same negative-offset fix,
      // same gutter.
      + '.kc-docpage .dp-body>.dp-fig>.kc-bm-l{left:-26px}'
      + '.kc-docpage .dp-body>.dp-fig>.kc-bm-r{right:-26px}'
      // Heading sizes (kc-docpage.js) didn't actually grow with hierarchy —
      // h3/h4/h5 (15/13/12px) were all SMALLER than body text (.dp-p,
      // 15.5px), backwards from normal document typography. Body text stays
      // the baseline; every heading level now sizes up from it, in steps,
      // deepest heading first (h2 is the top real content level here — h1
      // is reserved for the document title itself, not used in the body).
      + '.dp-h5{font-size:16px!important}'
      + '.dp-h4{font-size:17.5px!important}'
      + '.dp-h3{font-size:19px!important}'
      + '.dp-h2{font-size:20.5px!important}'
      // "Open all" global-header button — same footprint as .nav-user
      // (30px circle) so it sits comfortably next to the account avatar.
      + '.nav-expand-all{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;border:1px solid var(--bd2,#d5d9ea);background:transparent;color:var(--tx1,#333);cursor:pointer;flex-shrink:0}'
      + '.nav-expand-all:hover{background:var(--bg2,#f4f5fb);color:var(--acc);border-color:var(--acc2,#44b8d3)}'
      + '.nav-expand-all .lucide{width:15px;height:15px}'
      // "Add my sub-topic" (kc-app.js's own KC.menu + the persistent
      // .add-row) uses the "plus" icon — lucide draws it from two plain
      // <line> elements (a horizontal + a vertical stroke), not a <path>
      // like every other icon here. #ebGrad (template.html) is an
      // objectBoundingBox gradient, computed per-element relative to ITS
      // OWN geometry's bounding box — for a perfectly horizontal or
      // vertical line that box is zero-height or zero-width, which
      // degenerates the gradient into nothing (a well-known SVG gotcha).
      // Every other icon here is built from curved/2-D <path> data, so
      // this never came up before. Fix: a second gradient with the SAME
      // colors but userSpaceOnUse coordinates (fixed to the icon's own
      // 24x24 viewBox instead of each sub-shape's own bbox), used only for
      // this one icon so #ebGrad itself (already correct for every path-
      // based icon) doesn't need to change.
      + '.ctxmenu .lucide-plus,.add-row .lucide-plus{stroke:url(#ebGradFix)!important}'
      // Textbook/Notebook header title slot (syncTextbookHeaderTitle) — the
      // "Textbook"/"Notebook · x" label (.hl > .ct) stays put, this sits
      // right after it and takes up the room .ch's own
      // justify-content:space-between already leaves free before .ch-tools.
      + '.c2 .ch .hl,.c3 .ch .hl{flex:1;min-width:0}'
      // .ct itself is already navy (--hd, template.html) — a real document's
      // title is written straight into .ct's own text now (matching the
      // Notebook's own approach) so it just inherits that color for free.
      // Only a custom document's title needs an actual sibling (it holds a
      // real <input>, which .ct's own text can't) — colored to match .ct
      // exactly instead of its own separate shade, so the two read as one
      // continuous label regardless of which kind of document is open.
      + '.ch-doctitle{flex:1 1 auto;min-width:0;overflow:hidden;display:flex;align-items:center}'
      + '.ch-doctitle:not(:empty)::before{content:"·";margin:0 8px;color:var(--tx2,#8a8fa3);flex-shrink:0}'
      + '.ch-doctitle{font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--hd,#1e248c);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.ch-doctitle-input{flex:1;min-width:0;width:100%;border:none;background:transparent;font:inherit;color:inherit;padding:2px 4px;margin:-2px -4px;border-radius:5px}'
      + '.ch-doctitle-input:hover{background:var(--bg2,#f4f5fb)}'
      + '.ch-doctitle-input:focus{background:var(--bg2,#f4f5fb);outline:2px solid var(--acc2,#44b8d3);outline-offset:-1px}'
      // kc-docpage's own in-body title (.dp-title-sm, inside the sticky
      // .dp-tbhead) is now redundant with the mirrored header copy —
      // hidden only once that mirror actually rendered (kc-hdr-title-on),
      // so a failed mirror leaves the original title visible instead of
      // vanishing outright. The breadcrumb inside .dp-tbhead stays — that's
      // the narrow nav strip.
      + '.kc-docpage.kc-hdr-title-on .dp-tbhead .dp-title-sm{display:none}'
      + '.kc-docpage.kc-hdr-title-on .dp-tbhead{padding-top:2px}'
      // A custom document's .dp-tbhead (matchRealBreadcrumbStyle) never
      // has a title inside it at all — its title lives in the header from
      // the start, not hidden-in-place like a real document's — so it
      // should always get this same reduced top padding, not just when
      // some other class happens to be set.
      // Custom documents' .dp-tbhead never holds a title (that lives in the
      // header bar instead, never duplicated in here) — just the
      // breadcrumb, so it should read as a tight, single-line strip.
      // Forced explicitly (!important) rather than relying on the cascade
      // to land on the same computed value the real document's own
      // .dp-tbhead happens to get — this kept coming out visibly taller
      // despite matching every individual rule, so pin it down directly
      // instead of continuing to hunt for whichever inherited property
      // was still adding height.
      + '.kc-doc:not(.kc-docpage) .dp-tbhead{padding:4px 6px!important;margin:0 -6px 8px!important;min-height:0!important;line-height:1!important}'
      + '.kc-doc:not(.kc-docpage) .dp-tbhead .dp-bc{margin:0!important;padding:0!important;line-height:1.3!important;min-height:0!important}'
      // A custom document's breadcrumb now carries the real .dp-bc/
      // .dp-bc-cur/.dp-bc-sep classes directly (matchRealBreadcrumbStyle,
      // above) instead of a hand-copied approximation — .dp-bc's own CSS
      // (kc-docpage.js, loaded via injectCSS) handles it, EXCEPT for the
      // current/last segment: template.html's own .bcrumb .bc-cur{...}
      // (kept on purpose — bkTopicOf and others still read .bc-cur) is a
      // two-class selector (0,2,0), beating kc-docpage's own single-class
      // .dp-bc-cur (0,1,0) regardless of load order, so the last segment
      // alone kept rendering in the wrong font/weight. Out-specifies it.
      + '.bcrumb.dp-bc .bc-cur{font-family:var(--dp-fm);font-weight:600;color:var(--dp-navy)}'
      // .dp-bc's base margin-bottom (20px, for a real document's own
      // non-sticky, larger page context) only gets zeroed out inside
      // .dp-tbhead's own scoped override — a custom document's breadcrumb
      // isn't inside a .dp-tbhead, so it kept that full 20px gap under it
      // instead of the tight spacing the sticky head actually uses.
      + '.bcrumb.dp-bc{margin-bottom:0}';
    document.head.appendChild(style);
    if (!document.getElementById('ebGradFix')) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
      svg.style.position = 'absolute';
      svg.innerHTML = '<defs><linearGradient id="ebGradFix" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24"><stop offset="0" stop-color="#1e248c"/><stop offset="1" stop-color="#44b8d3"/></linearGradient></defs>';
      document.body.appendChild(svg);
    }
  })();
  // Small icon marking a node as custom (user-created), replacing the old
  // color highlight (see the CSS above). Self-healing via MutationObserver
  // rather than hooking every node-creation path individually — covers
  // KC.addChild's addCustomLeaf, this file's buildCustomNodeDOM, moves, etc.
  // uniformly, and any future creation path too.
  function ensureCustomBadge(row) {
    if (row.querySelector(':scope > .kc-custom-badge')) return;
    const badge = document.createElement('span');
    badge.className = 'kc-custom-badge';
    badge.title = 'Custom item — created by you';
    badge.innerHTML = '<i data-lucide="user-round-pen"></i>';
    const nameEl = row.querySelector(':scope > .row-name');
    if (nameEl) row.insertBefore(badge, nameEl.nextSibling); else row.appendChild(badge);
  }
  function scanCustomBadges(root) {
    (root || document).querySelectorAll('.node.custom > .row').forEach(ensureCustomBadge);
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }
  // scanCustomBadges itself mutates the subtree it's watching (inserts
  // badges, and lucide.createIcons() replaces their <i> with an <svg>) — an
  // observer left connected during that would see its own mutations and
  // re-fire on itself. Disconnect before scanning, reconnect after, so it
  // only ever reacts to mutations from elsewhere (add/rename/delete/move).
  function installCustomBadgeObserver() {
    if (document.__nbCustomBadgeWired) return;
    document.__nbCustomBadgeWired = true;
    document.querySelectorAll('.tree').forEach((tree) => {
      const observer = new MutationObserver(() => {
        observer.disconnect();
        scanCustomBadges(tree);
        observer.observe(tree, { childList: true, subtree: true });
      });
      scanCustomBadges(tree);
      observer.observe(tree, { childList: true, subtree: true });
    });
  }
  // DISABLED for diagnosis — page-load hang reported right after this
  // shipped (2026-08). The disconnect/reconnect fix above should have
  // closed the one loop risk I could find by reading the code, but the
  // report persisted, so this is switched fully off (no initial scan, no
  // observer at all) to isolate whether this specific mechanism is really
  // the cause. Custom nodes just won't get the small badge icon while this
  // is off — no other behavior depends on it.
  const NB_CUSTOM_BADGE_ENABLED = false;
  if (NB_CUSTOM_BADGE_ENABLED) installCustomBadgeObserver();

  // KC.selAct('notebook') (the selection popup's "Add to notebook") does a
  // raw doc.appendChild(p) straight into .c3 .note-doc — harmless against
  // plain contenteditable, but the same class of conflict as the
  // sticky-note/ProseMirror issue if a TipTap editor is mounted there:
  // external code inserting DOM nodes ProseMirror doesn't know about. Only
  // this one branch needs redirecting through the editor's own commands
  // when one is registered; every other kind ('translate'/'mentor'/'dict')
  // never touches note-doc's DOM and is left untouched.
  function wrapSelActForEditor() {
    if (typeof KC === 'undefined' || !window.KC || typeof KC.selAct !== 'function') return false;
    const fn = KC.selAct;
    if (fn.__nbEditorAware) return true;
    KC.selAct = function (kind) {
      if (kind === 'notebook') {
        const idx = KC._selWsIdx;
        const ws = idx != null && idx >= 0 && document.querySelectorAll('.workspace')[idx];
        const doc = ws && ws.querySelector('.c3 .note-doc');
        const editor = doc && window.__nbEditorRegistry && window.__nbEditorRegistry.get(doc);
        if (editor) {
          const text = (KC._selText || '').trim();
          KC.closeSel();
          const s = window.getSelection && window.getSelection(); if (s && s.removeAllRanges) s.removeAllRanges();
          if (text) {
            editor.chain().focus('end').insertContent('<p><em>“' + esc(text) + '”</em></p>').run();
            if (window.toast) window.toast('Added to your notebook');
          }
          return;
        }
      }
      return fn.apply(this, arguments);
    };
    KC.selAct.__nbEditorAware = true;
    return true;
  }
  wrapSelActForEditor();

  // ── Text-selection popup (#selmenu) — drag to reposition ────────────────
  // It repositions itself near the selection every time it opens; nothing
  // wrong with that logic, but on a small selection near a menu/toolbar it
  // can land on top of the buttons it's next to. A small grip lets it be
  // moved out of the way for as long as it stays open — resets to the
  // default position (next to the selection) the next time it's opened,
  // same as it always has.
  function installSelMenuDrag() {
    if (document.__nbSelMenuDragWired) return;
    document.__nbSelMenuDragWired = true;
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0, menuEl = null;
    function ensureGrip(m) {
      let grip = m.querySelector(':scope > .selmenu-grip');
      if (grip) return grip;
      grip = document.createElement('span');
      grip.className = 'selmenu-grip';
      grip.title = 'Drag to move';
      grip.innerHTML = '<i data-lucide="grip-vertical"></i>';
      m.insertBefore(grip, m.firstChild);
      if (window.lucide && lucide.createIcons) lucide.createIcons();
      return grip;
    }
    // kc-app.js re-renders #selmenu's innerHTML from scratch on every new
    // selection (its own mouseup→onSelect, 10ms) — add the grip back after
    // that, not once at boot.
    document.addEventListener('mouseup', () => {
      setTimeout(() => {
        const m = document.getElementById('selmenu');
        if (m && m.classList.contains('show')) ensureGrip(m);
      }, 20);
    });
    document.addEventListener('mousedown', (ev) => {
      const grip = ev.target.closest && ev.target.closest('.selmenu-grip');
      if (!grip) return;
      const m = grip.closest('#selmenu');
      if (!m) return;
      dragging = true; menuEl = m;
      sx = ev.clientX; sy = ev.clientY;
      const r = m.getBoundingClientRect();
      ox = r.left; oy = r.top;
      ev.preventDefault();
    });
    document.addEventListener('mousemove', (ev) => {
      if (!dragging || !menuEl) return;
      let x = ox + (ev.clientX - sx), y = oy + (ev.clientY - sy);
      x = Math.max(4, Math.min(innerWidth - menuEl.offsetWidth - 4, x));
      y = Math.max(4, Math.min(innerHeight - menuEl.offsetHeight - 4, y));
      menuEl.style.left = x + 'px';
      menuEl.style.top = y + 'px';
    });
    // Capture phase + stopPropagation ONLY while ending a drag — otherwise
    // kc-app.js's own bubble-phase mouseup→onSelect listener would re-fire
    // right after release and snap the menu straight back to its default
    // position next to the selection.
    document.addEventListener('mouseup', (ev) => {
      if (!dragging) return;
      ev.stopPropagation();
      dragging = false; menuEl = null;
    }, true);
  }
  installSelMenuDrag();

  function wrapToggleUserMenu() {
    const fn = window.toggleUserMenu;
    if (typeof fn !== 'function') return false;
    if (fn.__nbWrapped) return true;
    window.toggleUserMenu = function (ev) {
      const r = fn.apply(this, arguments);
      const pop = document.getElementById('userPop');
      if (pop && pop.classList.contains('show')) renderNotifPanel();
      return r;
    };
    window.toggleUserMenu.__nbWrapped = true;
    return true;
  }

  /* ── Real Mentor chat: vector search + Gemini (see /api/kc/mentor/ask) ──
     MENTOR (kc-app.js's chat state) is a private closure const — no exposed
     getter/setter, unlike almost everything else this file hooks into.
     KC.mentorRender always fully repaints the chat DOM from that private
     state, so a real answer can't be pushed into the existing pipeline.
     Fix: keep the real conversation under its own RemoteKV key (never
     kc_mentor — no risk of KC.saveMentorThreads ever overwriting it with
     stale canned state), fully REPLACE KC.mentorSend/KC.mentorTool (not
     wrap-and-call-original — the original always pushes a fake reply), and
     paint bubbles directly into the same chat container using the exact
     markup KC.mentorRender itself produces (quoted from kc-app.js). Still
     safe to WRAP KC.mentorMode/KC.mentorNew (call the original, then
     restore) since those only ever reset to a greeting. */
  function mentorPrefix(wsId) { return wsId.replace('ws', 'w'); }
  function mentorChatEl(wsId) { return document.getElementById(mentorPrefix(wsId) + 'chat'); }
  function mentorCurrentMode(wsId) {
    const title = document.getElementById(mentorPrefix(wsId) + 'mtitle');
    const head = title && title.closest('.mentor-head');
    const active = head && head.querySelector('.mm-tab.active');
    return (active && active.dataset.mode) || 'topic';
  }
  // "This topic" mode's history is keyed by the actual open topic (a real
  // doc's sourceId, or a custom doc's own docid) — not by workspace.
  // Switching which document is open while staying in "This topic" mode
  // shows THAT document's own conversation, not a shared, workspace-wide
  // one. Assistant mode is unrelated to whatever's open in c2, so it stays
  // one thread per workspace, unchanged.
  function currentTopicKey(ws) {
    if (!ws) return null;
    const dp = ws.querySelector('.c2 .kc-docpage');
    if (dp && dp.dataset.doc) return 'doc:' + dp.dataset.doc;
    const custom = ws.querySelector('.c2 .kc-doc:not(.kc-docpage)');
    if (custom && custom.dataset.docid) return 'custom:' + custom.dataset.docid;
    return null;
  }
  function currentTopicName(ws) {
    if (!ws) return '';
    const cur = ws.querySelector('.c2 .dp-bc-cur') || ws.querySelector('.c2 .bcrumb .bc-cur');
    return cur ? cur.textContent.trim() : '';
  }
  function currentTopicTreeId(ws) {
    const tree = ws && ws.querySelector('.tree');
    return tree ? tree.id : '';
  }
  // KC.DocPage.data is one GLOBAL object, not scoped per workspace — reads
  // straight from it are only reliable for whichever workspace tab is
  // actually active. Scoped to `ws` when given (mentor calls always have
  // one); falls back to the global read otherwise for the one call site
  // (submitSuggestion, below) that already ran this way before and only
  // ever fires from the currently-active workspace anyway.
  function currentOpenSourceId(ws) {
    if (ws) {
      const dp = ws.querySelector('.c2 .kc-docpage');
      return (dp && dp.dataset.doc) || undefined;
    }
    return (window.KC && KC.DocPage && KC.DocPage.data && KC.DocPage.data.sourceId) || undefined;
  }
  function mentorRealKey(wsId, mode, topicKey) {
    if (mode === 'topic') return 'kc_mentor_topic_' + (topicKey || ('ws_' + wsId));
    return 'kc_mentor_assistant_' + wsId;
  }
  function loadMentorRealThread(key) {
    const v = RemoteKV.get(key, null);
    return Array.isArray(v) ? v : [];
  }
  function appendMentorReal(wsId, mode, topicKey, who, html) {
    const key = mentorRealKey(wsId, mode, topicKey);
    const list = loadMentorRealThread(key);
    list.push({ who: who, html: html });
    RemoteKV.set(key, list);
  }
  function mentorTopicLinkHTML(treeId, name) {
    return '<span class="kblink" onclick="KC.goTo(' + JSON.stringify(treeId) + ',' + JSON.stringify(name) + ');event.stopPropagation()">' + esc(name) + '</span>';
  }
  // ── Chat history (the "Chat history" menu item, marked "Soon" in the
  // locked design — wired up for real here) ──────────────────────────────
  // "New chat" used to just delete the current thread; now it's archived
  // first (skipped if empty — nothing worth keeping). One archive per
  // topic (matching mentorRealKey's own per-topic keying) / per workspace
  // for Assistant. Capped at 30 entries so this can't grow unbounded.
  function mentorArchiveKey(wsId, mode, topicKey) {
    if (mode === 'topic') return 'kc_mentor_topic_archive_' + (topicKey || ('ws_' + wsId));
    return 'kc_mentor_assistant_archive_' + wsId;
  }
  function loadMentorArchive(key) {
    const v = RemoteKV.get(key, null);
    return Array.isArray(v) ? v : [];
  }
  function archiveMentorThread(wsId, mode, topicKey) {
    const active = loadMentorRealThread(mentorRealKey(wsId, mode, topicKey));
    if (!active.length) return;
    const key = mentorArchiveKey(wsId, mode, topicKey);
    const archive = loadMentorArchive(key);
    archive.unshift({ ts: Date.now(), messages: active });
    if (archive.length > 30) archive.length = 30;
    RemoteKV.set(key, archive);
  }
  function stripHtmlToText(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || '').trim();
  }
  function mentorHistoryModal() {
    let modal = document.getElementById('kcMentorHistory');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'kcMentorHistory';
    modal.className = 'kc-mhist-modal';
    modal.innerHTML =
      '<div class="kc-mhist-card">' +
      '<div class="kc-mhist-h">Chat history<button class="kc-mhist-close" title="Close"><i data-lucide="x"></i></button></div>' +
      '<div class="kc-mhist-list"></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', (ev) => { if (ev.target === modal || ev.target.closest('.kc-mhist-close')) modal.classList.remove('show'); });
    return modal;
  }
  // Swaps a past chat back in as the active thread — archives whatever's
  // currently active first (same as "New chat" does), so nothing is lost
  // either way. Rebuilds the greeting itself rather than going through
  // kc-app.js's own cached greeting state, matching renderMentorTopicView's
  // approach for the topic case.
  function restoreMentorArchiveEntry(wsId, mode, topicKey, archiveKey, archive, i) {
    const entry = archive[i];
    if (!entry) return;
    archiveMentorThread(wsId, mode, topicKey);
    archive.splice(i, 1);
    RemoteKV.set(archiveKey, archive);
    RemoteKV.set(mentorRealKey(wsId, mode, topicKey), entry.messages);
    if (mode === 'topic') { renderMentorTopicView(wsId); return; }
    const chat = mentorChatEl(wsId);
    if (chat) chat.innerHTML = '';
    paintMentorBubble(wsId, 'ai', 'I am your EasyBIM Assistant — ask across all workspaces, anytime. I draw from our internal knowledge base before the web, and link you to the source topics.');
    entry.messages.forEach((m) => paintMentorBubble(wsId, m.who, m.html));
  }
  function openMentorHistoryModal(wsId) {
    const mode = mentorCurrentMode(wsId);
    const ws = document.getElementById(wsId);
    const topicKey = mode === 'topic' ? currentTopicKey(ws) : null;
    const archiveKey = mentorArchiveKey(wsId, mode, topicKey);
    const archive = loadMentorArchive(archiveKey);
    const modal = mentorHistoryModal();
    const list = modal.querySelector('.kc-mhist-list');
    if (!archive.length) {
      list.innerHTML = '<div class="kc-mhist-empty">No past chats yet for ' + (mode === 'topic' ? 'this topic' : 'the assistant') + ' — click "New chat" and the one before it will show up here.</div>';
    } else {
      list.innerHTML = archive.map((entry, i) => {
        const firstUser = entry.messages.find((m) => m.who === 'me');
        const snippet = firstUser ? stripHtmlToText(firstUser.html).slice(0, 70) : '(empty chat)';
        const when = new Date(entry.ts).toLocaleString();
        return '<button class="kc-mhist-item" data-i="' + i + '"><span class="kc-mhist-when">' + esc(when) + '</span><span class="kc-mhist-snip">' + esc(snippet) + '</span></button>';
      }).join('');
      list.querySelectorAll('.kc-mhist-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          restoreMentorArchiveEntry(wsId, mode, topicKey, archiveKey, archive, +btn.dataset.i);
          modal.classList.remove('show');
        });
      });
    }
    modal.classList.add('show');
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }
  // The button itself is static, locked markup (class="dim", a "Soon"
  // badge, no onclick) — enable it in place rather than touching
  // template.html.
  function installMentorHistoryButton() {
    if (document.__nbMentorHistoryWired) return;
    document.__nbMentorHistoryWired = true;
    ['ws0', 'ws1', 'ws2'].forEach((wsId) => {
      const menu = document.getElementById(mentorPrefix(wsId) + 'mmenu');
      const btn = menu && [...menu.querySelectorAll('button')].find((b) => b.querySelector('.mm-soon'));
      if (!btn) return;
      btn.classList.remove('dim');
      btn.innerHTML = '<i data-lucide="history"></i>Chat history';
      btn.addEventListener('click', () => { menu.classList.remove('show'); openMentorHistoryModal(wsId); });
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }
  installMentorHistoryButton();
  function mentorBubbleHTML(wsId, who, html) {
    if (who === 'ai') {
      const label = mentorCurrentMode(wsId) === 'topic' ? 'Topic Mentor' : 'EasyBIM Assistant';
      return '<div><div class="ts">' + label + '</div><div class="mr"><div class="av ai">AI</div><div class="bub ai">' + html + '</div></div></div>';
    }
    return '<div><div class="ts r">You</div><div class="mr me"><div class="av me">Me</div><div class="bub me">' + html + '</div></div></div>';
  }
  function paintMentorBubble(wsId, who, html) {
    const chat = mentorChatEl(wsId);
    if (!chat) return null;
    const wrap = document.createElement('div');
    wrap.innerHTML = mentorBubbleHTML(wsId, who, html);
    const node = wrap.firstElementChild;
    chat.appendChild(node);
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    chat.scrollTop = chat.scrollHeight;
    return node;
  }
  // Assistant mode only — "This topic" mode goes through renderMentorTopicView
  // instead (needs to also rebuild the greeting/scope/avatar for whichever
  // topic is current, not just append history onto whatever's rendered).
  function restoreMentorReal(wsId) {
    loadMentorRealThread(mentorRealKey(wsId, 'assistant', null)).forEach((m) => paintMentorBubble(wsId, m.who, m.html));
  }
  function clearMentorReal(wsId) {
    RemoteKV.set(mentorRealKey(wsId, 'assistant', null), []);
  }
  // Full per-topic view for "This topic" mode: scope link, greeting (same
  // role-appropriate wording as patchTopicModeCosmetics), avatar icon, and
  // — the actual point of this — that SPECIFIC topic's own real
  // conversation, not a workspace-wide one. A no-op when nothing's open
  // yet (topicKey null) — kc-app.js's own static fallback plus the
  // cosmetics patch stay in charge of that edge case.
  function renderMentorTopicView(wsId) {
    const ws = document.getElementById(wsId);
    const topicKey = ws && currentTopicKey(ws);
    if (!topicKey) return;
    const topicName = currentTopicName(ws) || 'this topic';
    const treeId = currentTopicTreeId(ws);
    const prefix = mentorPrefix(wsId);
    const scope = document.getElementById(prefix + 'mscope');
    if (scope) scope.innerHTML = '<i data-lucide="book-open"></i><span class="ms-txt ms-link" onclick="KC.goTo(' + JSON.stringify(treeId) + ',' + JSON.stringify(topicName) + ')">' + esc(topicName) + '</span>';
    const role = window.KC && KC.role;
    const workMode = role === 'employee' || role === 'teamlead';
    const head = scope && scope.closest('.mentor-head');
    const av = head && head.querySelector('.mentor-av');
    if (av) av.innerHTML = '<i data-lucide="' + (workMode ? 'book-open' : 'graduation-cap') + '"></i>';
    const chat = mentorChatEl(wsId);
    if (chat) chat.innerHTML = '';
    const greetHtml = (workMode ? "You're viewing " : 'You are studying ') + mentorTopicLinkHTML(treeId, topicName) + '. Ask me anything about it — I answer from EasyBIM knowledge base first and link you to the right topics.';
    paintMentorBubble(wsId, 'ai', greetHtml);
    loadMentorRealThread(mentorRealKey(wsId, 'topic', topicKey)).forEach((m) => paintMentorBubble(wsId, m.who, m.html));
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }
  // window.KC.goTo only reveals/highlights a row (see wrapOpenBookmark's own
  // comment above for why) — mirror that same open-after-goTo pattern so a
  // source citation actually opens the document, not just scrolls to it.
  function mentorGoToSource(treeId, title) {
    if (window.KC && KC.goTo) KC.goTo(treeId, title);
    setTimeout(() => {
      const tree = document.getElementById(treeId); if (!tree) return;
      const target = [...tree.querySelectorAll('.row-name')].find((rn) => rn.textContent.trim() === title);
      const row = target && target.closest('.row');
      if (row && KC.select) KC.select(row);
    }, 100);
  }
  window.__kcMentorGoTo = mentorGoToSource;
  function mentorSourceLinkHTML(source) {
    const node = document.querySelector('.node[data-doc="' + source.sourceId + '"]');
    const tree = node && node.closest('.tree');
    if (!tree) return esc(source.title);
    return '<span class="kblink" onclick="window.__kcMentorGoTo(' + JSON.stringify(tree.id) + ',' + JSON.stringify(source.title) + ');event.stopPropagation()">' + esc(source.title) + '</span>';
  }
  function mentorAnswerHTML(data) {
    if (!data || data.error) return esc((data && data.error) || 'Something went wrong — please try again.');
    const seen = {};
    const links = (data.sources || []).filter((s) => { if (seen[s.sourceId]) return false; seen[s.sourceId] = true; return true; }).map(mentorSourceLinkHTML);
    const cite = links.length ? ('<div class="kc-mentor-sources">Sources: ' + links.join(', ') + '</div>') : '';
    return '<span class="kb-badge"><i data-lucide="sparkles"></i>Knowledge Base</span>' + esc(data.answer).replace(/\n/g, '<br>') + cite;
  }
  function mentorAsk(wsId, question) {
    const mode = mentorCurrentMode(wsId);
    const ws = document.getElementById(wsId);
    const topicKey = mode === 'topic' ? currentTopicKey(ws) : null;
    paintMentorBubble(wsId, 'me', esc(question));
    appendMentorReal(wsId, mode, topicKey, 'me', esc(question));
    const thinking = paintMentorBubble(wsId, 'ai', '<span class="kb-badge"><i data-lucide="loader-2"></i>Thinking…</span>');
    fetch('/api/kc/mentor/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ question: question, sourceId: mode === 'topic' ? currentOpenSourceId(ws) : undefined })
    })
      .then((r) => r.json())
      .then((data) => {
        const html = mentorAnswerHTML(data);
        const bub = thinking && thinking.querySelector('.bub');
        if (bub) bub.innerHTML = html;
        if (window.lucide && lucide.createIcons) lucide.createIcons();
        appendMentorReal(wsId, mode, topicKey, 'ai', html);
      })
      .catch((e) => {
        console.error('kc: mentor ask failed', e);
        const html = 'Sorry — I ran into a problem answering that. Please try again.';
        const bub = thinking && thinking.querySelector('.bub');
        if (bub) bub.innerHTML = html;
        appendMentorReal(wsId, mode, topicKey, 'ai', html);
      });
  }
  const REAL_TOOL_QUESTIONS = {
    quiz: 'Quiz me with 5 questions on this topic, based on the Knowledge Center content.',
    cards: 'Generate 5 flashcard-style question/answer pairs about this topic, based on the Knowledge Center content.',
    summary: 'Summarize this topic in a few sentences, based on the Knowledge Center content.',
    checklist: 'Make a short practical checklist for this topic, based on the Knowledge Center content.',
    res: 'What other Knowledge Center topics are related to this one? List each with a one-line reason.'
  };
  function replaceMentorFunctions() {
    if (typeof KC.mentorSend !== 'function' || typeof KC.mentorTool !== 'function') return false;
    if (KC.mentorSend.__nbReal) return true;
    KC.mentorSend = function (inp, wsId) {
      const val = (inp.value || '').trim(); if (!val) return;
      inp.value = '';
      mentorAsk(wsId, val);
    };
    KC.mentorSend.__nbReal = true;
    KC.mentorTool = function (wsId, kind) {
      const q = REAL_TOOL_QUESTIONS[kind]; if (!q) return;
      mentorAsk(wsId, q);
    };
    KC.mentorTool.__nbReal = true;
    return true;
  }
  // KC.mentorMode (switching Topic Mentor <-> Assistant tabs) should show
  // whatever real conversation already exists for the tab switched to;
  // KC.mentorNew ("start a new chat") means the opposite — the user asked
  // for a clean slate, so the real conversation for the current mode is
  // cleared too, not just the fake one kc-app.js resets on its own.
  function wrapMentorMode() {
    const fn = KC.mentorMode;
    if (typeof fn !== 'function') return false;
    if (fn.__nbWrapped) return true;
    KC.mentorMode = function (wsId, mode) {
      const r = fn.apply(this, arguments);
      if (mode === 'topic') renderMentorTopicView(wsId);
      else restoreMentorReal(wsId);
      return r;
    };
    KC.mentorMode.__nbWrapped = true;
    return true;
  }
  function wrapMentorNew() {
    const fn = KC.mentorNew;
    if (typeof fn !== 'function') return false;
    if (fn.__nbWrapped) return true;
    KC.mentorNew = function (wsId) {
      const r = fn.apply(this, arguments);
      if (mentorCurrentMode(wsId) === 'topic') {
        const ws = document.getElementById(wsId);
        const topicKey = ws && currentTopicKey(ws);
        if (topicKey) {
          archiveMentorThread(wsId, 'topic', topicKey);
          RemoteKV.set(mentorRealKey(wsId, 'topic', topicKey), []);
          renderMentorTopicView(wsId);
          return r;
        }
      }
      archiveMentorThread(wsId, 'assistant', null);
      clearMentorReal(wsId);
      return r;
    };
    KC.mentorNew.__nbWrapped = true;
    return true;
  }
  // Same root cause as the audit's "You are studying X is usually wrong"
  // finding — the greeting is baked into kc-app.js's locked mGreet(), so
  // patch the one rendered mention after the fact when a real document is
  // actually open, instead of the workspace's hardcoded stub topic name.
  function patchMentorGreetingTopic(wsId) {
    const realTitle = window.KC && KC.DocPage && KC.DocPage.data && KC.DocPage.data.title;
    if (!realTitle) return;
    const chat = mentorChatEl(wsId);
    const link = chat && chat.querySelector('.bub.ai .kblink');
    if (link && link.textContent.trim() !== realTitle) link.textContent = realTitle;
  }
  function restoreAllMentorReal() {
    // Same reasoning as paintRealIdentity elsewhere in this file: kc-app.js's
    // own init() already called KC.mentorRender/KC.mentorMode for every
    // workspace, synchronously, before this file's wraps had a chance to
    // install — so the very first render needs its own explicit patch pass
    // here too, not just future ones via wrapMentorRenderCosmetics/
    // wrapMentorMode. Topic-mode workspaces go through renderMentorTopicView
    // (which fully rebuilds the chat — the cosmetics patches run first only
    // as a fallback for the case it no-ops, nothing open yet); assistant-mode
    // ones just get their own history appended as before.
    ['ws0', 'ws1', 'ws2'].forEach((wsId) => {
      if (mentorCurrentMode(wsId) === 'topic') {
        patchMentorGreetingTopic(wsId);
        patchTopicModeCosmetics(wsId);
        renderMentorTopicView(wsId);
      } else {
        restoreMentorReal(wsId);
      }
    });
  }

  // "This topic" mode is a real, useful feature for employee/teamlead too
  // (scoped help on whatever document is open, vs. Assistant's global
  // scope) — only its wording is onboarding-specific: kc-app.js's own
  // mGreet() greets with "You are studying …" and a graduation-cap avatar,
  // written for the intern/learning case. Reworded for employee/teamlead
  // only ("You're viewing …" / book-open) — intern keeps the original
  // studying framing unchanged. Hooked on KC.mentorRender itself (not
  // mentorMode/mentorNew separately) since every path that can (re)paint
  // the greeting or the avatar — boot restore, a mode switch, "New chat" —
  // goes through it.
  function patchTopicModeCosmetics(wsId) {
    const role = window.KC && KC.role;
    if (role !== 'employee' && role !== 'teamlead') return;
    const chat = mentorChatEl(wsId);
    if (chat) {
      chat.querySelectorAll('.bub.ai').forEach((b) => {
        if (b.innerHTML.indexOf('You are studying') === 0) b.innerHTML = b.innerHTML.replace('You are studying', "You're viewing");
      });
    }
    // Checking the current MODE (via the active tab) rather than sniffing
    // the icon's current data-lucide attribute — lucide's SVG replacement
    // may or may not keep that attribute post-conversion, the active tab
    // always reliably says which mode is showing.
    if (mentorCurrentMode(wsId) === 'topic') {
      const title = document.getElementById(mentorPrefix(wsId) + 'mtitle');
      const head = title && title.closest('.mentor-head');
      const av = head && head.querySelector('.mentor-av');
      if (av) { av.innerHTML = '<i data-lucide="book-open"></i>'; if (window.lucide && lucide.createIcons) lucide.createIcons(); }
    }
  }
  function wrapMentorRenderCosmetics() {
    const fn = KC.mentorRender;
    if (typeof fn !== 'function') return false;
    if (fn.__nbCosmeticsFixed) return true;
    KC.mentorRender = function (wsId) {
      const r = fn.apply(this, arguments);
      patchTopicModeCosmetics(wsId);
      return r;
    };
    KC.mentorRender.__nbCosmeticsFixed = true;
    return true;
  }
  // "This topic" mode's view is keyed to whatever document is open — if
  // that changes while the mode is already active (no tab click involved,
  // so wrapMentorMode never fires), the mentor still needs to catch up.
  function wrapSelectRefreshMentorTopic() {
    const fn = KC.select;
    if (typeof fn !== 'function') return false;
    if (fn.__nbMentorTopicWired) return true;
    KC.select = function (rowEl) {
      const r = fn.apply(this, arguments);
      const ws = rowEl && rowEl.closest && rowEl.closest('.workspace');
      if (ws && mentorCurrentMode(ws.id) === 'topic') renderMentorTopicView(ws.id);
      return r;
    };
    KC.select.__nbMentorTopicWired = true;
    return true;
  }
  // Remember which document was open in c2, per workspace, so it can be
  // reopened on the next visit (restoreAllOpenTopics, inside
  // initSeamFixes below — needs parseDocKey/findChildNodeByName to turn a
  // custom doc's key back into a tree row, which live in that scope).
  function wrapSelectSaveOpenTopic() {
    const fn = KC.select;
    if (typeof fn !== 'function') return false;
    if (fn.__nbSaveTopicWired) return true;
    KC.select = function (rowEl) {
      const r = fn.apply(this, arguments);
      const ws = rowEl && rowEl.closest && rowEl.closest('.workspace');
      if (ws) {
        const key = currentTopicKey(ws);
        if (key) RemoteKV.set(K.uiOpenTopic(ws.id), key);
      }
      return r;
    };
    KC.select.__nbSaveTopicWired = true;
    return true;
  }

  (function initSeamFixes() {
    function wrapFn(owner, name) {
      const fn = owner[name];
      if (typeof fn !== 'function') return false; // not defined yet — keep waiting
      if (fn.__nbWrapped) return true; // already wrapped in an earlier pass
      owner[name] = function () {
        const r = fn.apply(this, arguments);
        setTimeout(syncAllNotebooks, 0);
        return r;
      };
      owner[name].__nbWrapped = true;
      return true;
    }
    // KC.applyRoleUI paints KC.identity and the account popover's name/mail/
    // avatar from a hardcoded stub (DEFAULT_IDENTITY, or "Gal Shem Tov" for
    // the teamlead role) — now that real people other than Polina use this,
    // that's a real, misleading bug, not a display quirk. It's exposed on
    // KC, but wrapping it is pointless: kc-app.js calls it exactly once,
    // synchronously, from its own init() — by the time any wrap could be
    // installed here, that one call has already happened. So this repaints
    // the same 4 nodes — and KC.identity itself — directly, once, from
    // boot() below (same 150ms slot as the rest of this file's "undo what
    // kc-app.js's own one-shot init() just did" fixes). Matches
    // applyRoleUI's own has-photo guard so an uploaded avatar photo still
    // takes priority.
    function paintRealIdentity() {
      if (!realIdentity) return;
      KC.identity = realIdentity;
      const nm = document.querySelector('#userPop .up-name'); if (nm) nm.textContent = realIdentity.name;
      const ml = document.querySelector('#userPop .up-mail'); if (ml) ml.textContent = realIdentity.mail;
      const av1 = document.getElementById('upAv'); if (av1 && !av1.classList.contains('has-photo')) av1.textContent = realIdentity.initials;
      const av2 = document.getElementById('navUser'); if (av2 && !av2.classList.contains('has-photo')) av2.textContent = realIdentity.initials;
    }
    // KC.internIdentityName reads DEFAULT_IDENTITY directly (bypassing
    // KC.identity entirely) to decide "which team-lead-console roster row
    // is you" and "which assignment notifications are mine" — left as the
    // literal string 'Polina Eisenshtadt', a real signed-in person other
    // than Polina would silently stop matching either check.
    function wrapInternIdentityName() {
      const fn = KC.internIdentityName;
      if (typeof fn !== 'function') return false;
      if (fn.__nbIdentityFixed) return true;
      KC.internIdentityName = function () {
        return (realIdentity && realIdentity.name) || fn.apply(this, arguments);
      };
      KC.internIdentityName.__nbIdentityFixed = true;
      return true;
    }
    // Every mock topic (no real document, not a user's own custom note) that
    // isn't the one specific node the original design bundle authored its
    // static example page for still shows THAT example when clicked —
    // kc-app.js's own KC.select just un-hides whatever .kc-doc-hidden
    // content already sits in the column (closeCustomDoc), and template.html
    // only ever put ONE such block in each workspace, with a hardcoded
    // breadcrumb and byline that has nothing to do with whatever topic was
    // actually clicked. Real documents (node.dataset.doc) and the user's own
    // custom notes (node.classList 'custom') are unaffected — this only
    // replaces the case KC.select's own third branch (plain closeCustomDoc,
    // no real content of any kind) leaves as a stale example.
    function nodePathFor(node) {
      const path = [];
      let n = node;
      while (n && n.classList && n.classList.contains('node')) {
        const nameEl = n.querySelector(':scope > .row .row-name');
        if (nameEl) path.unshift(nameEl.textContent.trim());
        n = n.parentElement && n.parentElement.closest('.node');
      }
      return path;
    }
    function isMockNode(node) {
      return !!node && !node.classList.contains('custom') && !node.dataset.doc && !node.dataset.video;
    }
    function renderNotYetAvailable(ws, node) {
      const cb = ws.querySelector('.c2 .cb'); if (!cb) return;
      cb.querySelectorAll('.kc-doc').forEach((e) => e.remove());
      Array.prototype.forEach.call(cb.children, (el) => { if (!el.classList.contains('kc-doc')) el.classList.add('kc-doc-hidden'); });
      const wrap = document.createElement('div');
      wrap.className = 'kc-doc kc-doc-empty';
      const path = nodePathFor(node);
      const bc = path.map((p, i) => (i ? '<i data-lucide="chevron-right"></i>' : '') + '<span' + (i === path.length - 1 ? ' class="bc-cur"' : '') + '>' + esc(p) + '</span>').join('');
      wrap.innerHTML = bc ? '<div class="bcrumb">' + bc + '</div>' : '';
      const host = document.createElement('div');
      wrap.appendChild(host);
      if (KC.States) {
        KC.States.paint(host, KC.States.empty('Not in the Knowledge Center yet', 'This topic has not been digested yet — check back once it has been added.', 'file-plus-2'));
      }
      cb.insertBefore(wrap, cb.firstChild);
      cb.scrollTop = 0;
      if (window.lucide && lucide.createIcons) lucide.createIcons();
    }
    function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
    function wrapSelectEmptyMock() {
      const fn = KC.select;
      if (typeof fn !== 'function') return false;
      if (fn.__nbEmptyMockFixed) return true;
      KC.select = function (rowEl) {
        const r = fn.apply(this, arguments);
        const node = rowEl && rowEl.closest && rowEl.closest('.node');
        const ws = rowEl && rowEl.closest && rowEl.closest('.workspace');
        if (ws && isMockNode(node)) renderNotYetAvailable(ws, node);
        return r;
      };
      KC.select.__nbEmptyMockFixed = true;
      return true;
    }
    // kc-app.js's own init() ends with a hardcoded, 80ms-delayed
    // "start the mockup directly on the Project Startup document" sequence
    // (KC.goTo then KC.select on that one title) — a fixed legacy demo
    // default, not a real "last opened" or "nothing selected" state. It's
    // what would re-expand the Content (Plan) and Textbook columns a moment
    // after the synchronous collapse-on-load above, undoing the collapsed
    // start page Polina asked for — collapsing again on a delay would just
    // be racing an arbitrary timeout, so suppress this one exact boot call
    // at its source instead. The suppression is one-shot and self-clears via a
    // same-tick setTimeout(...,0) — scheduled once either half of the pair
    // fires, so BOTH still see the flag true (they run synchronously back
    // to back, no gap), but any later, real navigation to this same title
    // (search, clicking the row) is completely unaffected.
    let suppressBootDemoOpen = true;
    function maybeSuppressBootDemoOpen(name) {
      if (!suppressBootDemoOpen || name !== 'DXXXX - Project Startup') return false;
      setTimeout(() => { suppressBootDemoOpen = false; }, 0);
      return true;
    }
    function wrapGoToSuppressBootDemo() {
      const fn = KC.goTo;
      if (typeof fn !== 'function') return false;
      if (fn.__nbBootSuppress) return true;
      KC.goTo = function (treeId, name) {
        if (maybeSuppressBootDemoOpen(name)) return;
        return fn.apply(this, arguments);
      };
      KC.goTo.__nbBootSuppress = true;
      return true;
    }
    function wrapSelectSuppressBootDemo() {
      const fn = KC.select;
      if (typeof fn !== 'function') return false;
      if (fn.__nbBootSuppress) return true;
      KC.select = function (rowEl) {
        const nameEl = rowEl && rowEl.querySelector && rowEl.querySelector('.row-name');
        const name = nameEl && nameEl.textContent.trim();
        if (maybeSuppressBootDemoOpen(name)) return;
        return fn.apply(this, arguments);
      };
      KC.select.__nbBootSuppress = true;
      return true;
    }
    // KC.addChild/KC.addBlock (custom tree nodes — "Add my section" / "Add my
    // sub-topic") only ever build DOM live, in memory, via buildNode — same
    // for KC.rename/KC.del. None of the four ever persisted the tree
    // structure itself, so every custom topic/folder vanished on reload —
    // a pre-existing gap in the original design, not something introduced
    // here. The document CONTENT a user typed into one of these already
    // survives reload for real (KC.saveDoc → kc_docs, real localStorage),
    // keyed by docIdFor(ws,node) = wsId + '::' + path.join('›') — it just
    // became unreachable once the node that led to it disappeared. Fix:
    // snapshot every '.node.custom' (path + whether it's a branch) after
    // each mutation, and on boot rebuild the DOM from that snapshot before
    // anything else runs — plus a one-time recovery pass over kc_docs' own
    // keys for content saved before this fix existed, which never had a
    // snapshot at all.
    const MENU_BTN_HTML = '<button class="row-menu" onclick="KC.menu(event,this)" title="Manage"><i data-lucide="more-vertical"></i></button>';
    function treeElForWs(ws) {
      const id = ws && ws.id;
      if (!id) return null;
      return document.getElementById(id.replace('ws', 'w') + 'ptree');
    }
    // `after` = the name of whatever sibling (official or custom) sits
    // right before this node, or null if it's the first child of its
    // container — without this, reconcileCustomTree had no way to know
    // WHERE among its siblings a node belongs, only which parent it
    // belongs under, so a root-level duplicate (created right next to its
    // source) always ended up wherever ensureCustomPath's own default
    // lands new nodes (right before the container's "Add..." button —
    // typically the very bottom of the list) on the next reload.
    function customNodeSnapshot(treeEl) {
      const out = [];
      treeEl.querySelectorAll('.node.custom').forEach((node) => {
        const prev = node.previousElementSibling;
        const prevNameEl = prev && prev.classList.contains('node') ? prev.querySelector(':scope > .row .row-name') : null;
        out.push({
          path: nodePathFor(node),
          branch: !!node.querySelector(':scope > .kids'),
          after: prevNameEl ? prevNameEl.textContent.trim() : null,
        });
      });
      return out;
    }
    function saveCustomTree(wsId, treeEl) {
      RemoteKV.set(K.customTree(wsId), customNodeSnapshot(treeEl));
    }
    function saveAllCustomTrees() {
      document.querySelectorAll('.workspace').forEach((ws) => {
        const treeEl = treeElForWs(ws);
        if (treeEl) saveCustomTree(ws.id, treeEl);
      });
    }
    function buildCustomNodeDOM(name, isBranch, depth) {
      const node = document.createElement('div');
      node.className = 'node custom';
      node.dataset.depth = depth;
      const row = document.createElement('div');
      row.className = 'row ' + (isBranch ? 'branch' : 'leaf') + ' depth' + depth;
      const mineMark = '<span class="cbadge" title="My own — added by me"><i data-lucide="folder-heart"></i></span>';
      if (isBranch) {
        row.setAttribute('onclick', 'KC.toggle(this)');
        row.innerHTML = '<span class="tw"><i data-lucide="chevron-down"></i></span>' + mineMark +
          '<span class="row-name" dir="auto">' + esc(name) + '</span>' + MENU_BTN_HTML;
      } else {
        row.setAttribute('onclick', 'KC.select(this)');
        row.innerHTML = '<span class="lead"><span class="dot todo"></span></span>' + mineMark +
          '<span class="row-name" dir="auto">' + esc(name) + '</span>' + MENU_BTN_HTML;
      }
      node.appendChild(row);
      if (isBranch) {
        const kids = document.createElement('div');
        kids.className = 'kids' + (depth >= 1 ? ' collapsed' : '');
        const add = document.createElement('button');
        add.className = 'add-row';
        add.setAttribute('onclick', 'KC.addChild(this)');
        add.innerHTML = '<i data-lucide="plus"></i>Add my sub-topic';
        kids.appendChild(add);
        node.appendChild(kids);
        if (depth >= 1) row.querySelector('.tw').classList.add('c');
      }
      return node;
    }
    function findChildNodeByName(container, name) {
      const kids = container.querySelectorAll(':scope > .node');
      for (let i = 0; i < kids.length; i++) {
        const rn = kids[i].querySelector(':scope > .row .row-name');
        if (rn && rn.textContent.trim() === name) return kids[i];
      }
      return null;
    }
    function ensureCustomPath(treeEl, path, isBranch, afterName) {
      let container = treeEl;
      for (let i = 0; i < path.length; i++) {
        const last = i === path.length - 1;
        let node = findChildNodeByName(container, path[i]);
        if (!node) {
          // depth is just how many ancestors deep this segment is (i) —
          // the old "last && !isBranch ? 1 : 0" ignored path length
          // entirely and mis-tagged every root-level leaf as depth 1.
          node = buildCustomNodeDOM(path[i], last ? isBranch : true, i);
          let insertBeforeEl = container.querySelector(':scope > .add-row');
          // Preserve the original position relative to siblings (matters
          // for the actual node the snapshot was taken of — the last path
          // segment; intermediate ancestor branches just land wherever the
          // add-row default puts them, same as before).
          if (last && afterName) {
            const anchor = findChildNodeByName(container, afterName);
            if (anchor) insertBeforeEl = anchor.nextSibling;
          }
          if (insertBeforeEl) container.insertBefore(node, insertBeforeEl); else container.appendChild(node);
        }
        if (!last) {
          let kidsEl = node.querySelector(':scope > .kids');
          if (!kidsEl) { kidsEl = document.createElement('div'); kidsEl.className = 'kids collapsed'; node.appendChild(kidsEl); }
          container = kidsEl;
        }
      }
    }
    function parseDocKey(key) {
      const sep = key.indexOf('::');
      if (sep === -1) return null;
      const wsId = key.slice(0, sep);
      const path = key.slice(sep + 2).split('›').filter(Boolean);
      return path.length ? { wsId, path } : null;
    }
    function reconcileCustomTree(ws) {
      const treeEl = treeElForWs(ws);
      if (!treeEl) return;
      const seen = new Set();
      const entries = [];
      (RemoteKV.get(K.customTree(ws.id), []) || []).forEach((e) => {
        if (e && Array.isArray(e.path) && e.path.length) { entries.push(e); seen.add(e.path.join('›')); }
      });
      // One-time recovery for content saved before this fix existed (no
      // snapshot at all) — infer the missing nodes from kc_docs' own keys.
      // MUST actually run only once, ever, per workspace: it was reading
      // this as "recovery" every single reconcile, which meant deleting a
      // custom doc never really stuck — the very next reload found its
      // still-there kc_docs entry (KC.del only ever removed the DOM node,
      // never its content — see wrapCleanupDocsOnDelete) and resurrected
      // it right back, snapshot or no snapshot.
      const recoveryKey = 'kc_custom_tree_recovered_' + ws.id;
      if (!RemoteKV.get(recoveryKey, false)) {
        const docs = API.getCustomDocs();
        Object.keys(docs).forEach((key) => {
          const parsed = parseDocKey(key);
          if (!parsed || parsed.wsId !== ws.id) return;
          for (let i = 1; i <= parsed.path.length; i++) {
            const anc = parsed.path.slice(0, i);
            const ancKey = anc.join('›');
            if (seen.has(ancKey)) continue;
            seen.add(ancKey);
            entries.push({ path: anc, branch: i < parsed.path.length });
          }
        });
        RemoteKV.set(recoveryKey, true);
      }
      entries.sort((a, b) => a.path.length - b.path.length);
      entries.forEach((e) => ensureCustomPath(treeEl, e.path, e.branch, e.after));
      saveCustomTree(ws.id, treeEl);
      if (window.lucide && lucide.createIcons) lucide.createIcons();
    }
    function reconcileAllCustomTrees() {
      document.querySelectorAll('.workspace').forEach(reconcileCustomTree);
    }
    // Reverse of currentTopicKey (outer scope) — given a saved key, find
    // the tree row it refers to, so it can be reopened. Needs
    // parseDocKey/findChildNodeByName, both local to this scope, which is
    // why this lives here rather than next to currentTopicKey itself.
    function findNodeByTopicKey(ws, key) {
      if (!key) return null;
      if (key.indexOf('doc:') === 0) return ws.querySelector('.node[data-doc="' + key.slice(4) + '"]');
      if (key.indexOf('custom:') === 0) {
        const parsed = parseDocKey(key.slice(7));
        if (!parsed) return null;
        const tree = ws.querySelector('.tree');
        let container = tree, node = null;
        for (let i = 0; i < parsed.path.length; i++) {
          node = findChildNodeByName(container, parsed.path[i]);
          if (!node) return null;
          container = node.querySelector(':scope > .kids') || container;
        }
        // findChildNodeByName matches by row-name text alone — a stale
        // uiOpenTopic key from a since-deleted custom doc can silently
        // resolve to a real (non-custom) node that just happens to share
        // its name/path (e.g. a plain category folder), auto-"restoring"
        // into a folder that was never really a saved topic. Only trust
        // the match if it's genuinely the custom node this key claims to
        // be — same category of bug as the tree-menu icon/rename issues
        // earlier, all rooted in name-based matching with no identity
        // check.
        return node && node.classList.contains('custom') ? node : null;
      }
      return null;
    }
    function restoreOpenTopic(wsId) {
      const ws = document.getElementById(wsId);
      const key = ws && RemoteKV.get(K.uiOpenTopic(wsId), null);
      if (!key) return;
      const node = findNodeByTopicKey(ws, key);
      const row = node && node.querySelector(':scope > .row');
      if (row && KC.select) KC.select(row);
    }
    function restoreAllOpenTopics() {
      ['ws0', 'ws1', 'ws2'].forEach(restoreOpenTopic);
    }
    function wrapCustomTreeMutator(name) {
      const fn = KC[name];
      if (typeof fn !== 'function') return false;
      if (fn.__nbTreeWrapped) return true;
      KC[name] = function () {
        const r = fn.apply(this, arguments);
        setTimeout(saveAllCustomTrees, 0);
        return r;
      };
      KC[name].__nbTreeWrapped = true;
      return true;
    }
    // "Move to..." for custom nodes only — kc-app.js's own KC.menu has no
    // such option. Reuses KC.toggleAssignSub (the generic ctx-sub discloser
    // already built for the "Add to onboarding plan" submenu) for the
    // picker UI, so this needs zero new CSS and zero locked-file edits.
    // Moving changes a node's full ancestor path, which several storage
    // keys are built from (kc_docs' docId, the matching notebook key) —
    // those get migrated; kc_bookmarks is keyed by name only (see bkEq)
    // and needs no migration.
    function ensureKidsFor(destNode) {
      let kids = destNode.querySelector(':scope > .kids');
      if (kids) return kids;
      const row = destNode.querySelector(':scope > .row');
      kids = document.createElement('div');
      kids.className = 'kids';
      destNode.appendChild(kids);
      if (row && row.classList.contains('leaf')) {
        row.classList.remove('leaf', 'done');
        row.classList.add('branch');
        const lead = row.querySelector('.lead');
        if (lead) lead.outerHTML = '<span class="tw"><i data-lucide="chevron-down"></i></span>';
        row.setAttribute('onclick', 'KC.toggle(this)');
      }
      return kids;
    }
    function migratePathDependentStorage(wsId, oldPath, newPath) {
      const oldPrefix = oldPath.join('›');
      const newPrefix = newPath.join('›');
      if (oldPrefix === newPrefix) return;
      const docs = API.getCustomDocs();
      const migrated = {};
      let changed = false;
      Object.keys(docs).forEach((docId) => {
        const sep = docId.indexOf('::');
        const keyWsId = sep === -1 ? null : docId.slice(0, sep);
        const keyPathStr = sep === -1 ? null : docId.slice(sep + 2);
        const underMoved = keyWsId === wsId && (keyPathStr === oldPrefix || keyPathStr.indexOf(oldPrefix + '›') === 0);
        if (!underMoved) { migrated[docId] = docs[docId]; return; }
        const suffix = keyPathStr.slice(oldPrefix.length);
        const newDocId = wsId + '::' + newPrefix + suffix;
        migrated[newDocId] = docs[docId];
        const oldNoteKey = 'kc_note_custom_' + docId;
        const newNoteKey = 'kc_note_custom_' + newDocId;
        const noteHtml = RemoteKV.getRaw(oldNoteKey);
        if (noteHtml != null) RemoteKV.setRaw(newNoteKey, noteHtml);
        changed = true;
      });
      if (changed) API.saveCustomDocs(migrated);
    }
    function moveCustomNode(node, destIsTree, destNode, tree) {
      const oldPath = nodePathFor(node);
      const ws = tree.closest('.workspace');
      const wsId = ws ? ws.id : '';
      let targetKids;
      if (destIsTree) {
        targetKids = tree;
      } else {
        targetKids = ensureKidsFor(destNode);
        targetKids.classList.remove('collapsed');
      }
      const addBtn = targetKids.querySelector(':scope > .add-row');
      if (addBtn) targetKids.insertBefore(node, addBtn); else targetKids.appendChild(node);
      const newPath = nodePathFor(node);
      migratePathDependentStorage(wsId, oldPath, newPath);
      saveAllCustomTrees();
      if (window.lucide && lucide.createIcons) lucide.createIcons();
      const label = node.querySelector(':scope > .row .row-name');
      if (window.toast) window.toast('Moved “' + (label ? label.textContent.trim() : '') + '”');
    }
    // Real folder picker — a small modal with a live, expand/collapse tree,
    // reused by Move-to, "Add my section", and anything else that needs
    // "which folder should this go in" instead of always landing at a fixed
    // spot. Deliberately includes REAL (official) branches as valid
    // destinations, not just custom ones — mixing a personal draft/topic
    // into an official section for easier navigation is an intended use,
    // not an edge case (that's also why custom vs. official nodes already
    // look visually distinct elsewhere in this file).
    function installLocationPickerStyle() {
      if (document.__nbLocPickerStyle) return;
      document.__nbLocPickerStyle = true;
      const style = document.createElement('style');
      style.id = 'kc-loc-picker-style';
      style.textContent =
        '.kc-loc-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:900;display:flex;align-items:center;justify-content:center}' +
        '.kc-loc-modal{background:var(--bg0,#fff);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.28);width:380px;max-height:72vh;display:flex;flex-direction:column;overflow:hidden}' +
        '.kc-loc-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--bd,#e5e7eb);font-weight:700;font-size:14px;color:var(--tx1,#111827)}' +
        '.kc-loc-head button{background:none;border:none;cursor:pointer;color:var(--tx2,#6b7280);padding:4px;display:flex}' +
        '.kc-loc-tree{flex:1;overflow-y:auto;padding:6px;min-height:120px}' +
        '.kc-loc-row{display:flex;align-items:center;gap:7px;width:100%;text-align:left;padding:7px 8px;border:none;background:none;border-radius:8px;cursor:pointer;font-size:13px;color:var(--tx1,#111827)}' +
        '.kc-loc-row:hover{background:var(--acc-bg,#f0f9ff)}' +
        '.kc-loc-row.selected{background:var(--acc2,#44b8d3);color:#fff}' +
        '.kc-loc-row .lucide{width:15px;height:15px;flex-shrink:0}' +
        '.kc-loc-tw{width:16px;height:16px;flex-shrink:0;display:inline-flex;transition:transform .14s}' +
        '.kc-loc-tw.open{transform:rotate(90deg)}' +
        '.kc-loc-tw-spacer{width:16px;height:16px;flex-shrink:0;display:inline-block}' +
        '.kc-loc-children{display:none;margin-left:2px}' +
        '.kc-loc-children.open{display:block}' +
        '.kc-loc-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--bd,#e5e7eb)}' +
        '.kc-loc-foot button{padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none}' +
        '.kc-loc-cancel{background:var(--bg1,#f3f4f6);color:var(--tx1,#111827)}' +
        '.kc-loc-confirm{background:var(--eb-brand-gradient,linear-gradient(135deg,#1e248c,#44b8d3));color:#fff}' +
        '.kc-loc-confirm:disabled{opacity:.5;cursor:not-allowed}';
      document.head.appendChild(style);
    }
    // Only branches (folders — real or custom) are shown/selectable;
    // documents (leaves) are omitted from this picker entirely. Placing
    // something right next to a specific document is a different, already-
    // solved need (KC.duplicate / "Save as topic" both auto-anchor as the
    // next sibling of whatever's open) — this picker answers "which
    // container", not "which exact position among siblings".
    function buildLocationRows(container, depth, ctx) {
      const wrap = document.createElement('div');
      if (depth > 0) wrap.className = 'kc-loc-children';
      const branches = [...container.querySelectorAll(':scope > .node')].filter((n) => n.querySelector(':scope > .kids'));
      branches.forEach((n) => {
        if (ctx.excludeNode && (n === ctx.excludeNode || ctx.excludeNode.contains(n))) return;
        const kidsEl = n.querySelector(':scope > .kids');
        const childWrapEl = buildLocationRows(kidsEl, depth + 1, ctx);
        const hasVisibleChildren = childWrapEl.children.length > 0;

        const nameEl = n.querySelector(':scope > .row .row-name');
        const name = nameEl ? nameEl.textContent.trim() : '';
        const isCustom = n.classList.contains('custom');

        const btn = document.createElement('button');
        btn.className = 'kc-loc-row';
        btn.style.paddingLeft = (8 + depth * 18) + 'px';
        const tw = document.createElement('span');
        tw.className = hasVisibleChildren ? 'kc-loc-tw' : 'kc-loc-tw-spacer';
        if (hasVisibleChildren) tw.innerHTML = '<i data-lucide="chevron-right"></i>';
        btn.appendChild(tw);
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', isCustom ? 'folder-heart' : 'folder');
        btn.appendChild(icon);
        const label = document.createElement('span');
        label.textContent = name;
        btn.appendChild(label);

        if (hasVisibleChildren) {
          tw.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = childWrapEl.classList.toggle('open');
            tw.classList.toggle('open', open);
          });
        }
        btn.addEventListener('click', () => {
          if (ctx.selectEl) ctx.selectEl.classList.remove('selected');
          btn.classList.add('selected');
          ctx.selectEl = btn;
          ctx.selected = n;
          ctx.confirmBtn.disabled = false;
        });

        const row = document.createElement('div');
        row.appendChild(btn);
        if (hasVisibleChildren) row.appendChild(childWrapEl);
        wrap.appendChild(row);
      });
      return wrap;
    }
    // opts: { title, excludeNode, onChoose(dest) } — dest is either
    // {isTop:true, node:null} or {isTop:false, node:<the chosen branch>}.
    function showLocationPicker(ws, opts) {
      const tree = ws && ws.querySelector('.tree');
      if (!tree) return;
      installLocationPickerStyle();

      const overlay = document.createElement('div');
      overlay.className = 'kc-loc-overlay';
      const modal = document.createElement('div');
      modal.className = 'kc-loc-modal';
      overlay.appendChild(modal);

      const head = document.createElement('div');
      head.className = 'kc-loc-head';
      const titleSpan = document.createElement('span');
      titleSpan.textContent = opts.title || 'Choose location';
      head.appendChild(titleSpan);
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '<i data-lucide="x"></i>';
      head.appendChild(closeBtn);
      modal.appendChild(head);

      const treeWrap = document.createElement('div');
      treeWrap.className = 'kc-loc-tree';
      modal.appendChild(treeWrap);

      const foot = document.createElement('div');
      foot.className = 'kc-loc-foot';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'kc-loc-cancel';
      cancelBtn.textContent = 'Cancel';
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'kc-loc-confirm';
      confirmBtn.textContent = 'Choose';
      confirmBtn.disabled = true;
      foot.appendChild(cancelBtn);
      foot.appendChild(confirmBtn);
      modal.appendChild(foot);

      const ctx = { excludeNode: opts.excludeNode || null, selected: null, selectEl: null, confirmBtn };

      const rootBtn = document.createElement('button');
      rootBtn.className = 'kc-loc-row';
      rootBtn.style.paddingLeft = '8px';
      rootBtn.innerHTML = '<span class="kc-loc-tw-spacer"></span><i data-lucide="corner-left-up"></i><span>Top level</span>';
      rootBtn.addEventListener('click', () => {
        if (ctx.selectEl) ctx.selectEl.classList.remove('selected');
        rootBtn.classList.add('selected');
        ctx.selectEl = rootBtn;
        ctx.selected = 'root';
        confirmBtn.disabled = false;
      });
      treeWrap.appendChild(rootBtn);
      treeWrap.appendChild(buildLocationRows(tree, 0, ctx));

      function close() { overlay.remove(); }
      closeBtn.addEventListener('click', close);
      cancelBtn.addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      confirmBtn.addEventListener('click', () => {
        const chosen = ctx.selected;
        close();
        if (chosen != null) opts.onChoose(chosen === 'root' ? { isTop: true, node: null } : { isTop: false, node: chosen });
      });

      document.body.appendChild(overlay);
      if (window.lucide && lucide.createIcons) lucide.createIcons();
    }
    function injectMoveOption(node) {
      const m = document.getElementById('ctxmenu');
      const tree = node.closest('.tree');
      if (!m || !tree) return;
      const ws = tree.closest('.workspace');
      const danger = m.querySelector('.danger');
      const hr = danger && danger.previousElementSibling && danger.previousElementSibling.tagName === 'HR' ? danger.previousElementSibling : null;

      const btn = document.createElement('button');
      btn.innerHTML = '<i data-lucide="folder-input"></i>Move to...';
      btn.addEventListener('click', () => {
        KC.closeMenu();
        const nameEl = node.querySelector(':scope > .row .row-name');
        showLocationPicker(ws, {
          title: 'Move “' + (nameEl ? nameEl.textContent.trim() : '') + '” to...',
          excludeNode: node,
          onChoose: (dest) => moveCustomNode(node, dest.isTop, dest.node, tree)
        });
      });

      if (danger) m.insertBefore(btn, hr || danger);
      else m.appendChild(btn);
      if (window.lucide && lucide.createIcons) lucide.createIcons();
    }
    // KC.menu's own curNode is private — remembered here too (independently,
    // same value) so KC.duplicate's wrapper below can know which node the
    // menu was open for without touching kc-app.js's internals.
    let lastMenuNode = null;
    function wrapMenuMoveOption() {
      const fn = KC.menu;
      if (typeof fn !== 'function') return false;
      if (fn.__nbMoveFixed) return true;
      KC.menu = function (ev, btn) {
        const r = fn.apply(this, arguments);
        const node = btn && btn.closest && btn.closest('.node');
        lastMenuNode = node;
        if (node && node.classList.contains('custom')) injectMoveOption(node);
        return r;
      };
      KC.menu.__nbMoveFixed = true;
      return true;
    }
    // KC.saveDoc's own cleanup, for any HTML lifted out of a live editable/
    // rendered area before it becomes a fresh custom doc's starting body.
    // If a TipTap editor (see the block near the end of this file) is
    // mounted on `source`, its own getHTML() is already clean (no .kc-bm/
    // data-pidx artifacts exist in a TipTap-managed doc in the first place)
    // — and critically, cloneNode(true) would otherwise return ProseMirror's
    // internal wrapper markup instead of the real content, since a mounted
    // editor's DOM no longer looks like plain semantic HTML.
    function cleanCopiedHtml(source) {
      if (window.__nbEditorRegistry && window.__nbEditorRegistry.has(source)) {
        return window.__nbEditorRegistry.get(source).getHTML();
      }
      const clone = source.cloneNode(true);
      clone.querySelectorAll('.kc-bm, .kc-tab').forEach((b) => b.remove());
      clone.querySelectorAll('[data-pidx]').forEach((e) => {
        e.removeAttribute('data-pidx');
        e.classList.remove('bk-set', 'bk-l', 'bk-r');
        e.style.position = '';
        if (!e.getAttribute('style')) e.removeAttribute('style');
      });
      return clone.innerHTML;
    }
    // KC.duplicate ("Duplicate to edit" on an official document) is meant
    // to hand the user an editable copy of that document's real content —
    // it actually seeds the copy from whatever's in the Notebook instead
    // (copy._noteSnapshot = the .note-doc's own innerHTML), which is a
    // completely different, unrelated piece of text.
    // Fixing just that would still be wrong on its own, though: the menu
    // (and so KC.duplicate) can be opened from a tree row that ISN'T the
    // document currently rendered in the Textbook — ⋯ works on any row,
    // not just the open one. In that case the real content to copy isn't
    // on the page at all yet. So: if the row being duplicated already
    // matches what's open, fix the seed immediately, same as before; if
    // not, open it first (KC.select) and defer the actual duplicate call
    // until its real content has actually rendered (polled — a real
    // document's content arrives via a network fetch KC.API.getDocument
    // owns, not a promise this wrapper has a handle on).
    function docPageBodyIfMatches(ws, sourceId) {
      const wrap = ws.querySelector('.c2 .kc-docpage');
      if (!wrap || wrap.dataset.doc !== sourceId) return null;
      return wrap.querySelector('.dp-body');
    }
    function waitForDocPageBody(ws, sourceId, cb, triesLeft) {
      const dp = docPageBodyIfMatches(ws, sourceId);
      if (dp) { cb(dp); return; }
      if (triesLeft <= 0) { cb(null); return; } // give up quietly after ~6s — duplicate still runs, just without the content fix
      setTimeout(() => waitForDocPageBody(ws, sourceId, cb, triesLeft - 1), 150);
    }
    // Duplicate/Save-as-topic only ever seeded a brand-new custom doc's
    // content via node._noteSnapshot — a plain JS property on the live DOM
    // element, never written to kc_docs. openCustomDoc only falls back to
    // it the very FIRST time that doc is opened, before any real save
    // exists — so it works fine within the same session (the node object
    // stays alive), but reconcileCustomTree rebuilds a fresh DOM node with
    // no such property on every reload. If the user never happened to type
    // anything (autosave never fired) or reloaded before it did, the seed
    // was never actually persisted anywhere — the "copy" comes back empty.
    // Persist it for real, immediately, the same way KC.saveDoc does.
    function persistNewCustomDocContent(ws, node, html) {
      if (!node) return;
      const id = ws.id + '::' + nodePathFor(node).join('›');
      const nameEl = node.querySelector(':scope > .row .row-name');
      const title = (nameEl && nameEl.textContent.trim()) || 'Untitled';
      const idn = (window.KC && KC.identity) || { name: 'Someone', mail: '', initials: '?' };
      const now = Date.now();
      const docs = API.getCustomDocs();
      docs[id] = { title: title, html: html, createdBy: idn.name, createdAt: now, editedBy: idn.name, editedAt: now };
      API.saveCustomDocs(docs);
    }
    function finishDuplicate(fn, sourceNode, ws, dp) {
      const r = fn.call(null);
      const copy = sourceNode.nextSibling;
      if (dp && copy && copy.classList && copy.classList.contains('node')) {
        const html = cleanCopiedHtml(dp);
        copy._noteSnapshot = html;
        persistNewCustomDocContent(ws, copy, html);
      }
      if (window.lucide && lucide.createIcons) lucide.createIcons();
      return r;
    }
    function wrapDuplicateContent() {
      const fn = KC.duplicate;
      if (typeof fn !== 'function') return false;
      if (fn.__nbContentFixed) return true;
      KC.duplicate = function () {
        const sourceNode = lastMenuNode;
        const ws = sourceNode && sourceNode.closest('.workspace');
        const rowEl = sourceNode && sourceNode.querySelector(':scope > .row');
        const isLeafDoc = rowEl && rowEl.classList.contains('leaf') && sourceNode.dataset.doc;
        if (!sourceNode || !ws || !isLeafDoc) return fn.apply(this, arguments); // e.g. duplicating a whole real folder — not this fix's concern
        const sourceId = sourceNode.dataset.doc;
        const already = docPageBodyIfMatches(ws, sourceId);
        if (already) return finishDuplicate(fn, sourceNode, ws, already);
        if (rowEl && KC.select) KC.select(rowEl); // not currently open — open it first
        waitForDocPageBody(ws, sourceId, (dp) => finishDuplicate(fn, sourceNode, ws, dp), 40);
        return undefined; // the real work now happens once loading finishes
      };
      KC.duplicate.__nbContentFixed = true;
      return true;
    }
    // Finds the tree row for whatever's currently open in the Textbook (real
    // document, by its data-doc id; custom document, by re-walking its
    // dataset.docid path) — so a new topic/copy can be anchored right next
    // to it, the same "insert as the next sibling" placement KC.duplicate
    // already uses for official documents.
    function currentOpenTreeNode(ws) {
      const sourceId = window.KC && KC.DocPage && KC.DocPage.data && KC.DocPage.data.sourceId;
      if (sourceId) {
        const byDoc = ws.querySelector('.node[data-doc="' + sourceId + '"]');
        if (byDoc) return byDoc;
      }
      const customEl = ws.querySelector('.c2 .kc-doc:not(.kc-docpage)');
      const docId = customEl && customEl.dataset.docid;
      if (docId) {
        const parsed = parseDocKey(docId);
        if (parsed) {
          const tree = ws.querySelector('.tree');
          let container = tree, node = null;
          for (let i = 0; i < parsed.path.length; i++) {
            node = findChildNodeByName(container, parsed.path[i]);
            if (!node) return null;
            container = node.querySelector(':scope > .kids') || container;
          }
          return node;
        }
      }
      return null;
    }
    // ── Menu parity between the tree's "⋯" (KC.menu) and the Textbook
    // column's "..." (KC.bookMenu) ───────────────────────────────────────
    // KC.bookMenu's button is c2's own static header control (see
    // template.html: <button onclick="KC.bookMenu(event,this)"> inside
    // .ch-tools) — it fires for WHATEVER is currently shown in c2, real
    // document or custom (duplicated / saved-as-topic) one alike; it is not
    // itself aware of custom vs. real. KC.noteMenu, by contrast, is c3's own
    // static header control for the free-writing Notebook scratchpad, which
    // isn't tied to any tree node at all — out of scope for this parity
    // pass, left untouched.
    //
    // KC.menu's node-management actions (rename, delete, move, mark done,
    // etc.) all read kc-app.js's private curNode — set only by a real
    // KC.menu(ev, btn) call, with no exposed setter. Rather than reimplement
    // each action against an explicit node (risking drift from the real
    // logic), simulate a real KC.menu click on that node's own row button
    // first: it sets curNode (and, via wrapMenuMoveOption, lastMenuNode and
    // KC._bk) as a side effect, synchronously, so the follow-up real action
    // call operates on the right node. The tree-style menu it also happens
    // to paint is immediately overwritten/closed in the same tick — nothing
    // ever reaches the screen.
    function primeCurNodeAndMenu(node) {
      const btn = node && node.querySelector(':scope > .row .row-menu');
      if (!btn || typeof KC.menu !== 'function') return false;
      KC.menu({ stopPropagation() {} }, btn);
      return true;
    }
    // c2's own "..." button always maps to KC.bookMenu (see above) — simulate
    // a click on it to correctly set KC._dlCtx for whatever's actually open
    // in c2 right now, so KC.Send.open('textbook')/KC.doDownload(...) target
    // the right content even when triggered from elsewhere (e.g. the tree).
    function primeC2DlCtx(ws) {
      const btn = ws && ws.querySelector('.c2 .ch-tools .ib[onclick*="bookMenu"]');
      if (!btn || typeof KC.bookMenu !== 'function') return false;
      KC.bookMenu({ stopPropagation() {} }, btn);
      return true;
    }
    function nodeActionButton(icon, label, danger) {
      const btn = document.createElement('button');
      if (danger) btn.className = 'danger';
      btn.innerHTML = '<i data-lucide="' + icon + '"></i>' + esc(label);
      return btn;
    }
    function nodeMarkDoneButton(node, rowEl) {
      const role = KC.role, ROLES = KC.ROLES || {};
      if (!(rowEl.classList.contains('leaf') && ROLES[role] && ROLES[role].markDone)) return null;
      const done = !!rowEl.querySelector('.dot.done');
      const btn = nodeActionButton(done ? 'circle' : 'check-circle-2', done ? 'Mark as not done' : 'Mark as done');
      btn.addEventListener('click', () => { KC.closeMenu(); if (primeCurNodeAndMenu(node)) KC.toggleDone(); });
      return btn;
    }
    function nodeAddSubtopicButton(node) {
      const btn = nodeActionButton('plus', 'Add my sub-topic');
      btn.addEventListener('click', () => { KC.closeMenu(); if (primeCurNodeAndMenu(node)) KC.addChild(); });
      return btn;
    }
    function nodeMoveButton(node, ws) {
      const btn = nodeActionButton('folder-input', 'Move to...');
      btn.addEventListener('click', () => {
        KC.closeMenu();
        const nameEl = node.querySelector(':scope > .row .row-name');
        const tree = node.closest('.tree');
        showLocationPicker(ws, {
          title: 'Move “' + (nameEl ? nameEl.textContent.trim() : '') + '” to...',
          excludeNode: node,
          onChoose: (dest) => moveCustomNode(node, dest.isTop, dest.node, tree)
        });
      });
      return btn;
    }
    // Whatever's open in c2 (real or custom alike) — the exact set KC.menu
    // shows for the same node, minus Reveal in Plan (superseded by making
    // the breadcrumb itself clickable) and the tree-only Download shortcut
    // (c2 already has its own Download submenu). Suggest + red Delete stay
    // last, matching KC.menu's own convention.
    function injectNodeActionsIntoBookMenu(node, ws) {
      const m = document.getElementById('ctxmenu');
      const rowEl = node && node.querySelector(':scope > .row');
      if (!m || !rowEl) return;
      const isCustom = node.classList.contains('custom');
      const revealBtn = [...m.querySelectorAll('button')].find((b) => /Reveal in Plan/i.test(b.textContent));
      if (revealBtn) revealBtn.remove();

      m.appendChild(document.createElement('hr'));
      const markDone = nodeMarkDoneButton(node, rowEl);
      if (markDone) m.appendChild(markDone);
      m.appendChild(nodeAddSubtopicButton(node));
      if (!isCustom) {
        const dup = nodeActionButton('copy', 'Duplicate to edit');
        dup.addEventListener('click', () => { KC.closeMenu(); if (primeCurNodeAndMenu(node)) KC.duplicate(); });
        m.appendChild(dup);
      }
      if (isCustom) {
        m.appendChild(document.createElement('hr'));
        const ren = nodeActionButton('pencil', 'Rename');
        ren.addEventListener('click', () => { KC.closeMenu(); if (primeCurNodeAndMenu(node)) KC.rename(); });
        m.appendChild(ren);
        const sug = nodeActionButton('sparkles', 'Suggest to Knowledge Center');
        sug.className = 'ctx-suggest';
        sug.addEventListener('click', () => { KC.closeMenu(); if (primeCurNodeAndMenu(node)) KC.suggest(); });
        m.appendChild(sug);
        m.appendChild(nodeMoveButton(node, ws));
        m.appendChild(document.createElement('hr'));
        const del = nodeActionButton('trash-2', 'Delete', true);
        del.addEventListener('click', () => { KC.closeMenu(); if (primeCurNodeAndMenu(node)) KC.del(); });
        m.appendChild(del);
      }
      if (window.lucide && lucide.createIcons) lucide.createIcons();
    }
    function wrapBookMenuNodeActions() {
      const fn = KC.bookMenu;
      if (typeof fn !== 'function') return false;
      if (fn.__nbNodeActionsFixed) return true;
      KC.bookMenu = function (ev, btn) {
        const r = fn.apply(this, arguments);
        if (KC._menuBtn !== btn) return r; // the click just toggled the menu closed
        const ws = btn.closest('.workspace');
        const node = ws && currentOpenTreeNode(ws);
        if (node) injectNodeActionsIntoBookMenu(node, ws);
        return r;
      };
      KC.bookMenu.__nbNodeActionsFixed = true;
      return true;
    }
    // Both KC.menu (tree) and KC.bookMenu (c2's "...") now show largely the
    // same set of actions, built up piecemeal by several separate wraps
    // above plus whatever the locked original itself put in — each in
    // whatever order it happened to get inserted, not a single deliberate
    // order. This is the one place that actually decides the FINAL order,
    // run last (registered after every other menu-content wrap in
    // tryWrap, below) so it sees everything. Matched by text, since that's
    // the one thing every source (locked strings, this file's own
    // nodeActionButton() calls) already renders distinctly and stably.
    const CTX_MENU_GROUPS = {
      lead: ['translation', 'bookmark', 'markdone', 'addsubtopic', 'duplicate'],
      manage: ['move', 'rename', 'suggest'],
      danger: ['delete'],
      output: ['download', 'sendto'],
    };
    function ctxMenuItemKey(el) {
      if (!el || el.tagName === 'HR') return null;
      const t = (el.textContent || '').trim();
      if (/^Translation panel/.test(t)) return 'translation';
      if (/^(Add to bookmarks|Remove bookmark)/.test(t)) return 'bookmark';
      if (/^Mark as (done|not done)/.test(t)) return 'markdone';
      if (/^Add my sub-topic/.test(t)) return 'addsubtopic';
      if (/^Duplicate to edit/.test(t)) return 'duplicate';
      if (/^Move to/.test(t)) return 'move';
      if (/^Rename/.test(t)) return 'rename';
      if (/^Suggest to Knowledge Center/.test(t)) return 'suggest';
      if (/^Delete/.test(t)) return 'delete';
      if (/^Download/.test(t)) return 'download';
      if (/^Send to/.test(t)) return 'sendto';
      return null;
    }
    function reorderCtxMenu(m) {
      const header = m.querySelector(':scope > .ctx-h');
      const rest = [...m.children].filter((c) => c !== header);
      const byKey = {};
      const leftover = [];
      for (let i = 0; i < rest.length; i++) {
        const n = rest[i];
        if (n.tagName === 'HR') continue;
        const unit = [n];
        // Download's own format-choice submenu (.ctx-sub) is a sibling
        // right after its toggle button, not a descendant — has to move
        // as one unit with it.
        if (rest[i + 1] && rest[i + 1].classList && rest[i + 1].classList.contains('ctx-sub')) { unit.push(rest[i + 1]); i++; }
        const key = ctxMenuItemKey(n);
        if (key && !byKey[key]) byKey[key] = unit; else leftover.push(unit);
      }
      const frag = document.createDocumentFragment();
      if (header) frag.appendChild(header);
      function put(key) { if (byKey[key]) byKey[key].forEach((el) => frag.appendChild(el)); }
      CTX_MENU_GROUPS.lead.forEach(put);
      const hasManage = CTX_MENU_GROUPS.manage.some((k) => byKey[k]);
      const hasDanger = CTX_MENU_GROUPS.danger.some((k) => byKey[k]);
      const hasOutput = CTX_MENU_GROUPS.output.some((k) => byKey[k]);
      if (hasManage) { frag.appendChild(document.createElement('hr')); CTX_MENU_GROUPS.manage.forEach(put); }
      if (hasDanger) { frag.appendChild(document.createElement('hr')); CTX_MENU_GROUPS.danger.forEach(put); }
      if (hasOutput) { frag.appendChild(document.createElement('hr')); CTX_MENU_GROUPS.output.forEach(put); }
      // Safety net — anything this couldn't recognize (a future addition
      // this list hasn't been taught about yet) still shows, just tacked
      // on at the end instead of silently vanishing.
      leftover.forEach((unit) => unit.forEach((el) => frag.appendChild(el)));
      m.innerHTML = '';
      m.appendChild(frag);
      if (window.lucide && lucide.createIcons) lucide.createIcons();
    }
    function wrapMenuReorder() {
      const fn = KC.menu;
      if (typeof fn !== 'function') return false;
      if (fn.__nbReordered) return true;
      KC.menu = function (ev, btn) {
        const r = fn.apply(this, arguments);
        const m = document.getElementById('ctxmenu');
        if (m) reorderCtxMenu(m);
        return r;
      };
      KC.menu.__nbReordered = true;
      return true;
    }
    function wrapBookMenuReorder() {
      const fn = KC.bookMenu;
      if (typeof fn !== 'function') return false;
      if (fn.__nbReordered) return true;
      KC.bookMenu = function (ev, btn) {
        const r = fn.apply(this, arguments);
        if (KC._menuBtn === btn) { const m = document.getElementById('ctxmenu'); if (m) reorderCtxMenu(m); }
        return r;
      };
      KC.bookMenu.__nbReordered = true;
      return true;
    }
    // Whether c2 currently shows this exact node's content (real doc or
    // custom doc alike) — generalizes docPageBodyIfMatches to both viewers,
    // for actions (like Send) that need the real target already mounted.
    function c2ShowsNode(ws, node) {
      const cb = ws.querySelector('.c2 .cb');
      if (!cb) return false;
      if (node.classList.contains('custom')) {
        const el = cb.querySelector('.kc-doc:not(.kc-docpage)');
        return !!(el && el.dataset.docid === docIdFor(ws, node));
      }
      const el = cb.querySelector('.kc-docpage');
      return !!(el && el.dataset.doc === node.dataset.doc);
    }
    function ensureC2ShowsNode(ws, node, cb, triesLeft) {
      if (triesLeft == null) triesLeft = 40;
      if (c2ShowsNode(ws, node)) { cb(); return; }
      if (triesLeft <= 0) { cb(); return; } // give up quietly after ~6s
      if (triesLeft === 40) { const rowEl = node.querySelector(':scope > .row'); if (rowEl && KC.select) KC.select(rowEl); }
      setTimeout(() => ensureC2ShowsNode(ws, node, cb, triesLeft - 1), 150);
    }
    // Reveal in Plan (the menu item just removed above) is superseded by
    // making the breadcrumb itself clickable — KC.goTo already does exactly
    // what that button did (expand ancestors, select, scroll, flash), and
    // the real document's own ancestor segments already call it via
    // KC.DocPage.navPath. Only two gaps: the real doc's OWN (current, last)
    // segment isn't a link, and the custom-doc breadcrumb (openCustomDoc's
    // .bcrumb) has no links at all.
    function wireCustomBreadcrumbClicks(ws, node) {
      const cb = ws.querySelector('.c2 .cb');
      const wrap = cb && cb.querySelector(':scope > .kc-doc:not(.kc-docpage)');
      const bcrumb = wrap && wrap.querySelector('.bcrumb');
      if (!bcrumb) return;
      const treeId = (node.closest('.tree') || {}).id || '';
      bcrumb.querySelectorAll(':scope > span').forEach((span) => {
        if (span.dataset.nbWired) return;
        span.dataset.nbWired = '1';
        span.addEventListener('click', () => { if (KC.goTo) KC.goTo(treeId, span.textContent.trim()); });
      });
    }
    function wrapSelectWireCustomBreadcrumb() {
      const fn = KC.select;
      if (typeof fn !== 'function') return false;
      if (fn.__nbBcWired) return true;
      KC.select = function (rowEl) {
        const r = fn.apply(this, arguments);
        const node = rowEl && rowEl.closest && rowEl.closest('.node');
        const ws = rowEl && rowEl.closest && rowEl.closest('.workspace');
        if (node && ws && node.classList.contains('custom')) wireCustomBreadcrumbClicks(ws, node);
        return r;
      };
      KC.select.__nbBcWired = true;
      return true;
    }
    // Strip the manual Save button + show/hide c2's header save-status
    // badge on every select — independent of whether TipTap mounted, so
    // the Notebook-style autosave UX applies even on the plain
    // contenteditable fallback.
    function wrapSelectApplyC2SaveUX() {
      const fn = KC.select;
      if (typeof fn !== 'function') return false;
      if (fn.__nbSaveUxWired) return true;
      KC.select = function (rowEl) {
        const r = fn.apply(this, arguments);
        const node = rowEl && rowEl.closest && rowEl.closest('.node');
        const ws = rowEl && rowEl.closest && rowEl.closest('.workspace');
        if (ws) {
          syncTextbookHeaderTitle(ws, node);
          if (node && node.classList.contains('custom')) {
            const wrap = ws.querySelector('.c2 .kc-doc:not(.kc-docpage)');
            if (wrap) { applyC2SaveUX(wrap, ws); reorderCustomDocHeader(wrap); buildRealDocStructureForCustomDoc(wrap); }
          } else {
            hideC2Status(ws);
          }
        }
        return r;
      };
      KC.select.__nbSaveUxWired = true;
      return true;
    }
    // Real doc: ancestor segments already link via KC.DocPage.navPath — only
    // the current (last, non-link) segment needs wiring, same target logic
    // navPath itself uses.
    function wireRealDocCurrentBreadcrumb(wrap) {
      const cur = wrap && wrap.querySelector('.dp-bc-cur');
      if (!cur || cur.dataset.nbWired) return;
      cur.dataset.nbWired = '1';
      cur.addEventListener('click', () => {
        const tree = document.querySelector('.workspace.active .tree') || document.querySelector('.tree');
        if (tree && KC.goTo) KC.goTo(tree.id, cur.textContent.trim());
      });
    }
    function wrapDocPageMountBreadcrumb() {
      const fn = KC.DocPage && KC.DocPage.mount;
      if (typeof fn !== 'function') return false;
      if (fn.__nbBcWired) return true;
      KC.DocPage.mount = function (wrap) {
        const r = fn.apply(this, arguments);
        wireRealDocCurrentBreadcrumb(wrap);
        // A real document's own content arrives via KC.API.getDocument's
        // fetch (openDocPage, kc-app.js) — by the time that PROMISE resolves
        // and this mount actually runs, the KC.select call that opened it
        // has long since returned, so syncTextbookHeaderTitle's call inside
        // wrapSelectApplyC2SaveUX (which runs synchronously right after
        // KC.select) never found a .dp-title to mirror — it fires here
        // instead, right when the title element genuinely exists.
        const ws = wrap && wrap.closest && wrap.closest('.workspace');
        if (ws) syncTextbookHeaderTitle(ws);
        // .dp-classbar (kc-docpage.js) is meant to show a document's
        // series+code as a small filing reference next to its icon — for a
        // document with neither field set, it renders as just the bare
        // icon, unexplained (and, being the first child of an RTL flex
        // row, lands on the right instead of the left). Not something any
        // of this session's own edits caused — just hide the whole strip
        // when it has nothing to say.
        const classbar = wrap && wrap.querySelector(':scope .dp-classbar');
        const data = window.KC && KC.DocPage && KC.DocPage.data;
        if (classbar && data && !(data.series || '').trim() && !(data.code || '').trim()) {
          classbar.style.display = 'none';
        }
        return r;
      };
      KC.DocPage.mount.__nbBcWired = true;
      return true;
    }
    // "Send to..." exists only on c2's own "..." menu today — add it to the
    // tree menu too, opening the node first (and waiting for it to actually
    // mount) if it isn't already what's showing in c2.
    function nodeSendButton(node, ws) {
      const btn = nodeActionButton('send', 'Send to…');
      btn.addEventListener('click', () => {
        KC.closeMenu();
        ensureC2ShowsNode(ws, node, () => {
          if (primeC2DlCtx(ws) && KC.Send) KC.Send.open('textbook');
        });
      });
      return btn;
    }
    function injectSendOptionIntoTreeMenu(node) {
      const m = document.getElementById('ctxmenu');
      const ws = node.closest('.workspace');
      const rowEl = node.querySelector(':scope > .row');
      // Send composes around one document's content — doesn't make sense
      // for a branch/folder (KC.menu's Download, by contrast, zips those).
      if (!m || !ws || !rowEl || !rowEl.classList.contains('leaf')) return;
      const danger = m.querySelector('.danger');
      const hr = danger && danger.previousElementSibling && danger.previousElementSibling.tagName === 'HR' ? danger.previousElementSibling : null;
      const btn = nodeSendButton(node, ws);
      if (danger) m.insertBefore(btn, hr || danger); else m.appendChild(btn);
      if (window.lucide && lucide.createIcons) lucide.createIcons();
    }
    function wrapMenuSendOption() {
      const fn = KC.menu;
      if (typeof fn !== 'function') return false;
      if (fn.__nbSendFixed) return true;
      KC.menu = function (ev, btn) {
        const r = fn.apply(this, arguments);
        const node = btn && btn.closest && btn.closest('.node');
        if (node) injectSendOptionIntoTreeMenu(node);
        return r;
      };
      KC.menu.__nbSendFixed = true;
      return true;
    }
    // KC.del only ever removes the DOM row — never the kc_docs content
    // entries for that node OR any of its descendants, which just sit
    // there orphaned forever (see reconcileCustomTree's recovery-loop fix
    // above — this is the other half of the same bug: without this,
    // deleting a doc with children never really stuck, since a later
    // reconcile would find the orphaned entries and rebuild them).
    // Registered BEFORE wrapConfirmDelete below, so confirm ends up
    // wrapping AROUND this — cleanup only runs once the user actually
    // confirms, never on a cancelled delete. Reads lastMenuNode (tracked
    // by wrapMenuMoveOption's own KC.menu wrap) for which node is being
    // deleted, same as wrapDuplicateContent already does.
    function wrapCleanupDocsOnDelete() {
      const fn = KC.del;
      if (typeof fn !== 'function') return false;
      if (fn.__nbDocsCleanup) return true;
      KC.del = function () {
        const node = lastMenuNode;
        const ws = node && node.closest && node.closest('.workspace');
        if (node && ws && node.classList.contains('custom')) {
          const prefix = ws.id + '::' + nodePathFor(node).join('›');
          const docs = API.getCustomDocs();
          let changed = false;
          Object.keys(docs).forEach((key) => {
            if (key === prefix || key.indexOf(prefix + '›') === 0) { delete docs[key]; changed = true; }
          });
          if (changed) API.saveCustomDocs(docs);
          // KC.del (kc-app.js) only ever removes the tree row — the live
          // .kc-doc editor in c2 (if this node, or a branch containing it,
          // is what's currently open there) is completely decoupled from
          // the tree and just keeps sitting there afterward: still showing
          // the deleted document's title/body, still editable, still
          // capable of resurrecting a kc_docs entry under the now-deleted
          // id on its next autosave. closeCustomDoc (kc-app.js) already
          // does exactly this cleanup but is a private, unexported
          // function — replicate its one-liner body here, then fold both
          // c2 and c3 back to their empty/collapsed state, same as when
          // nothing's open.
          const openWrap = ws.querySelector('.c2 .cb > .kc-doc:not(.kc-docpage)');
          const openId = openWrap && openWrap.dataset.docid;
          if (openId && (openId === prefix || openId.indexOf(prefix + '›') === 0)) {
            const c2 = ws.querySelector('.c2');
            const cb = ws.querySelector('.c2 .cb');
            if (cb) {
              cb.querySelectorAll('.kc-doc').forEach((e) => e.remove());
              cb.querySelectorAll('.kc-doc-hidden').forEach((e) => e.classList.remove('kc-doc-hidden'));
              if (KC.applyLineBk) KC.applyLineBk();
            }
            syncTextbookHeaderTitle(ws);
            syncNotebookColumn(ws);
            if (c2 && !c2.classList.contains('slim') && window.tog) window.tog(c2.id, 'r');
          }
        }
        return fn.apply(this, arguments);
      };
      KC.del.__nbDocsCleanup = true;
      return true;
    }
    // KC.del removes the node with zero confirmation today, from either
    // menu — fixed once at the source so every caller gets the same "are
    // you sure" gate, instead of duplicating a confirm() in each button.
    function wrapConfirmDelete() {
      const fn = KC.del;
      if (typeof fn !== 'function') return false;
      if (fn.__nbConfirmed) return true;
      KC.del = function () {
        if (!confirm('Delete this item? This can’t be undone.')) { KC.closeMenu(); return; }
        return fn.apply(this, arguments);
      };
      KC.del.__nbConfirmed = true;
      return true;
    }
    // KC.Send.open's own readDoc() only ever looks for .bcrumb/.bc-cur (the
    // custom-doc breadcrumb) — for a real document (.dp-bc/.dp-bc-cur) it
    // finds nothing and silently falls back to the generic title "This
    // document" with an empty path. Real pre-existing bug, unrelated to any
    // change made here — patch KC.Send._s.doc (exposed) right after open()
    // and re-render the step it just painted with the wrong title.
    function realDocTitleAndPath(ci) {
      const cur = ci.querySelector('.dp-bc-cur');
      if (!cur) return null;
      const crumbs = [...ci.querySelectorAll('.dp-bc .dp-bc-i')].map((s) => s.textContent.trim()).filter(Boolean);
      return { title: cur.textContent.trim() || 'This document', path: crumbs };
    }
    function wrapSendRealDocTitle() {
      const fn = KC.Send && KC.Send.open;
      if (typeof fn !== 'function') return false;
      if (fn.__nbTitleFixed) return true;
      KC.Send.open = function (kind) {
        const r = fn.apply(this, arguments);
        const ctx = KC._dlCtx;
        const fix = ctx && ctx.ci && realDocTitleAndPath(ctx.ci);
        if (fix && KC.Send._s && KC.Send._s.doc) {
          KC.Send._s.doc.title = fix.title;
          KC.Send._s.doc.path = fix.path;
          if (KC.Send.step) KC.Send.step('project');
        }
        return r;
      };
      KC.Send.open.__nbTitleFixed = true;
      return true;
    }
    function insertTopicNode(ws, name, anchorNode) {
      const node = buildCustomNodeDOM(name, false, 1);
      if (anchorNode && anchorNode.parentNode) {
        anchorNode.parentNode.insertBefore(node, anchorNode.nextSibling);
      } else {
        const tree = ws.querySelector('.tree');
        const addBtn = tree && tree.querySelector(':scope > .add-row');
        if (tree) { if (addBtn) tree.insertBefore(node, addBtn); else tree.appendChild(node); }
      }
      return node;
    }
    // KC.saveAsTopic ("Save as topic" in the Notebook's own "..." menu) is
    // just as broken as KC.duplicate was: it seeds the new topic with the
    // literal placeholder string 'From my notebook' instead of the actual
    // notebook content, and always drops it at the tree's top level instead
    // of next to whatever document the notes were taken against. Both
    // problems mean full replacement, not a wrap-and-patch — there's no
    // correct partial result from the original worth keeping.
    function replaceSaveAsTopic() {
      const fn = KC.saveAsTopic;
      if (typeof fn !== 'function') return false;
      if (fn.__nbReal) return true;
      KC.saveAsTopic = function (btn) {
        const ws = btn && btn.closest && btn.closest('.workspace');
        if (!ws) return;
        const name = prompt('Save these notes as a new topic named:');
        if (!name) return;
        const noteDoc = ws.querySelector('.c3 .note-doc');
        const html = noteDoc ? cleanCopiedHtml(noteDoc) : '<p></p>';
        const anchor = currentOpenTreeNode(ws);
        const node = insertTopicNode(ws, name.trim(), anchor);
        node._noteSnapshot = html;
        persistNewCustomDocContent(ws, node, html);
        saveAllCustomTrees();
        if (window.lucide && lucide.createIcons) lucide.createIcons();
        if (window.toast) window.toast('Saved “' + name.trim() + '” as your topic — manage it via ⋯');
      };
      KC.saveAsTopic.__nbReal = true;
      return true;
    }
    // KC.addBlock ("Add my section") always dropped the new section at the
    // very bottom of the top-level tree, no choice in the matter. Full
    // replacement: name first (keeps the familiar prompt), then the real
    // folder picker (including "Top level", so nothing is actually lost).
    function replaceAddBlock() {
      const fn = KC.addBlock;
      if (typeof fn !== 'function') return false;
      if (fn.__nbReal) return true;
      KC.addBlock = function (wsKey, treeId) {
        KC.closeMenu();
        const name = prompt('Name your new section:');
        if (!name) return;
        const tree = document.getElementById(treeId);
        const ws = tree && tree.closest('.workspace');
        if (!ws) return;
        showLocationPicker(ws, {
          title: 'Where should “' + name.trim() + '” go?',
          excludeNode: null,
          onChoose: (dest) => {
            const depth = dest.isTop ? 0 : (+dest.node.dataset.depth || 0) + 1;
            const node = buildCustomNodeDOM(name.trim(), true, depth);
            const container = dest.isTop ? tree : ensureKidsFor(dest.node);
            if (!dest.isTop) container.classList.remove('collapsed');
            const addBtn = container.querySelector(':scope > .add-row');
            if (addBtn) container.insertBefore(node, addBtn); else container.appendChild(node);
            saveAllCustomTrees();
            if (window.lucide && lucide.createIcons) lucide.createIcons();
            if (window.toast) window.toast('Created your section “' + name.trim() + '”');
          }
        });
      };
      KC.addBlock.__nbReal = true;
      return true;
    }
    function wrapBookmarkIdentity(name) {
      const fn = KC[name];
      if (typeof fn !== 'function') return false;
      if (fn.__nbFixed) return true;
      KC[name] = function (treeId, topic, pIdx) {
        if (pIdx != null) {
          const real = realDocTitleForTree(treeId);
          if (real) topic = real;
        }
        const args = Array.prototype.slice.call(arguments);
        args[1] = topic;
        return fn.apply(this, args);
      };
      KC[name].__nbFixed = true;
      return true;
    }
    // KC.toggleBookmark is one function serving two genuinely different
    // things — a whole-topic bookmark (pIdx==null) and a line-level sticky
    // note (pIdx!=null) — and it always shows the same toast either way
    // ("Sticky note added/removed"), wrong for the bookmark case. It calls
    // its own closure-private `toast(msg)` (kc-app.js:1025) directly, not
    // KC.toast (KC.toast is just a one-time reference copy, kc-app.js:1031
    // — reassigning it later never changes what that internal call
    // resolves to, so swapping out window.toast/KC.toast around the call
    // does nothing). What IS reachable is the #toast element itself: the
    // internal toast() writes its innerHTML synchronously, so by the time
    // fn.apply() below returns, the (possibly wrong) message is already
    // sitting in the DOM — just correct it in place.
    function wrapToggleBookmarkToast() {
      const fn = KC.toggleBookmark;
      if (typeof fn !== 'function') return false;
      if (fn.__nbToastFixed) return true;
      KC.toggleBookmark = function (treeId, name, pIdx) {
        const isLine = pIdx != null;
        const r = fn.apply(this, arguments);
        if (!isLine) {
          const el = document.getElementById('toast');
          const text = el && el.textContent.trim();
          const fixed = text === 'Sticky note added' ? 'Bookmark added'
            : text === 'Sticky note removed' ? 'Bookmark removed'
            : null;
          if (fixed) {
            el.innerHTML = '<i data-lucide="check"></i>' + esc(fixed);
            if (window.lucide && lucide.createIcons) lucide.createIcons();
          }
        }
        return r;
      };
      KC.toggleBookmark.__nbToastFixed = true;
      return true;
    }
    // The account popover's "Bookmarks" and "My sticky notes" lists are
    // both painted by KC.renderBookmarks from the exact same itemHTML() —
    // same colored, clipped "sticky tab" shape either way. Bookmarks
    // (#upBmarks) should read as bookmarks, not stickies — swap that one
    // list's dot for a plain bookmark icon after every render.
    function wrapRenderBookmarksIcon() {
      const fn = KC.renderBookmarks;
      if (typeof fn !== 'function') return false;
      if (fn.__nbIconFixed) return true;
      KC.renderBookmarks = function () {
        const r = fn.apply(this, arguments);
        const marks = document.getElementById('upBmarks');
        if (marks) {
          marks.querySelectorAll(':scope > .bk-item > .bk-dot').forEach((dot) => {
            const span = document.createElement('span');
            span.className = 'bk-dot bk-dot-bookmark';
            span.innerHTML = '<i data-lucide="bookmark"></i>';
            dot.replaceWith(span);
          });
          if (window.lucide && lucide.createIcons) lucide.createIcons();
        }
        return r;
      };
      KC.renderBookmarks.__nbIconFixed = true;
      return true;
    }
    // KC.removeBk (the ✕ on a bookmark/sticky note in the account popover)
    // deletes with no way back. KC.bookmarks/saveBk/renderBookmarks/
    // applyLineBk are all exposed on KC, so a real record — not just its
    // identifying fields, so a custom note/color survives the round trip —
    // can be captured before the delete and pushed straight back in on Undo.
    // Its own floating bar, not the native #toast: that one auto-hides on a
    // fixed 2.6s timer this file can't touch (see wrapToggleBookmarkToast's
    // comment on why toast() itself is unreachable), too short and too
    // fragile to hang a click target off of. The native toast already fired
    // by the time this runs (same "Bookmark/Sticky note removed" text,
    // wrapToggleBookmarkToast already corrected it) — dismiss it immediately
    // so it doesn't sit alongside this one saying the same thing twice.
    function offerBookmarkUndo(record) {
      const nativeToast = document.getElementById('toast');
      if (nativeToast) nativeToast.classList.remove('show');
      const prior = document.getElementById('kcUndoBar');
      if (prior) prior.remove();
      const isLine = record.pIdx != null;
      const bar = document.createElement('div');
      bar.id = 'kcUndoBar';
      bar.className = 'kc-undo-bar';
      bar.innerHTML = '<span>' + esc(isLine ? 'Sticky note removed' : 'Bookmark removed') + '</span><button type="button">Undo</button>';
      document.body.appendChild(bar);
      const timer = setTimeout(() => { if (bar.parentNode) bar.remove(); }, 6000);
      bar.querySelector('button').addEventListener('click', () => {
        clearTimeout(timer);
        bar.remove();
        KC.bookmarks.push(record);
        KC.saveBk();
        KC.renderBookmarks();
        if (KC.applyLineBk) KC.applyLineBk();
        if (window.toast) window.toast(isLine ? 'Sticky note restored' : 'Bookmark restored');
      });
    }
    function wrapRemoveBk() {
      const fn = KC.removeBk;
      if (typeof fn !== 'function') return false;
      if (fn.__nbUndoFixed) return true;
      KC.removeBk = function (btn) {
        const el = btn && btn.closest && btn.closest('.bk-item');
        const idx = el ? +el.dataset.i : NaN;
        const record = !isNaN(idx) && KC.bookmarks[idx] ? Object.assign({}, KC.bookmarks[idx]) : null;
        const r = fn.apply(this, arguments);
        if (record) offerBookmarkUndo(record);
        return r;
      };
      KC.removeBk.__nbUndoFixed = true;
      return true;
    }
    // KC.openBookmark (clicking a saved bookmark in the personal cabinet) only
    // calls KC.goTo(), which — despite its name — just reveals/highlights the
    // row in the Plan tree; it never actually opens the document. kc-app.js's
    // own boot sequence has to separately call KC.select(row) right after its
    // own goTo() call for exactly this reason. openBookmark never does that,
    // so clicking a line-level bookmark tried to scroll inside whatever
    // document happened to already be open, not the bookmarked one. This
    // mirrors the app's own fix: after its 90ms goTo delay, find the same row
    // and actually open it — the pending-scroll variable above then finishes
    // the job once that real content has actually finished loading.
    function bookmarkRowFor(b) {
      const tree = document.getElementById(b.treeId); if (!tree) return null;
      const target = [...tree.querySelectorAll('.row-name')].find(rn => rn.textContent.trim() === b.name);
      return target && target.closest('.row');
    }
    function wrapOpenBookmark() {
      const fn = KC.openBookmark;
      if (typeof fn !== 'function') return false;
      if (fn.__nbFixed) return true;
      KC.openBookmark = function (el) {
        const b = KC.bookmarks[+(el && el.dataset && el.dataset.i)];
        const r = fn.apply(this, arguments);
        if (b) {
          // _pendingScrollPIdx is only ever consumed inside API.getDocument's
          // real-fetch callback — a custom (user-authored) document opens
          // synchronously via its own path and already scrolls correctly
          // through kc-app.js's own fixed-delay fallback below. Setting it
          // for a custom-doc bookmark would just leak: it'd sit stale and
          // mis-scroll whatever real document gets opened next, anywhere in
          // the same session.
          if (b.pIdx != null) {
            const row = bookmarkRowFor(b);
            const node = row && row.closest('.node');
            if (node && node.dataset.doc) _pendingScrollPIdx = b.pIdx;
          }
          setTimeout(() => {
            const row = bookmarkRowFor(b);
            if (row && KC.select) KC.select(row);
          }, 100);
        }
        return r;
      };
      KC.openBookmark.__nbFixed = true;
      return true;
    }
    // togTr(id) just flips the drawer's 'open' class (see template.html) — it
    // has no idea a real document is open or that translating it means a
    // network call. Wrap it the same way switchWS is wrapped above: run the
    // real fetch right after the drawer's own toggle, only on the transition
    // into 'open' (closing needs nothing).
    function wrapTogTr() {
      const fn = window.togTr;
      if (typeof fn !== 'function') return false;
      if (fn.__nbWrapped) return true;
      window.togTr = function (id) {
        const r = fn.apply(this, arguments);
        const el = document.getElementById(id);
        // Only ws1 ('w1ctr'/'w1trdoc') has real documents today — other
        // workspaces' translation drawers still show their own design
        // examples untouched. Opening the panel just resets it to an idle
        // "click to translate" state (or the cached translation, if this
        // exact document was already translated) — it never fetches on its
        // own, that's what the header button is for.
        if (id === 'w1ctr' && el && el.classList.contains('open') && KC.DocPage && KC.DocPage.data && KC.DocPage.data.sourceId) {
          resetTrPanel(KC.DocPage.data.sourceId);
        }
        return r;
      };
      window.togTr.__nbWrapped = true;
      return true;
    }
    // Split-bars (the drag handles between columns) are meant to be a
    // uniform, always-present piece of chrome, always dead-center in the gap
    // between their two neighbours, and dragging is the ONLY thing that
    // resizes a column — collapsing to a spine is strictly the user's own
    // click on that spine. kc-app.js's own KC.layoutSplits/KC.startSplit hide
    // and refuse a bar whenever either neighbour is slim/closed; both are
    // fully replaced below with one single mechanism that behaves the same
    // regardless of collapse state, instead of the design's own two-column
    // drag for the normal case plus a separate patch for the collapsed one.
    function wrapLayoutSplits() {
      const fn = KC.layoutSplits;
      if (typeof fn !== 'function') return false;
      if (fn.__nbWrapped) return true;
      KC.layoutSplits = function (ws) {
        if (!ws || !ws.classList.contains('active')) return;
        const wr = ws.getBoundingClientRect();
        // Two different questions about Translation, matching template.html's
        // own original distinction: "rendered at all" (true whenever the
        // feature isn't fully turned off — includes the default 37px peek
        // strip that always pokes out from the Textbook's edge, NOT only the
        // fully-expanded 332px drawer) vs. "fully open" (the expanded drawer
        // specifically). The peek strip is real, positioned space (it has its
        // own negative-margin overlap into the Textbook) — it's part of what
        // "the Textbook's edge" means for the seam after it, same as the
        // fully-open drawer, just narrower.
        const ctr0 = ws.querySelector('.ctr');
        const ctrRendered = (ctr0 && ctr0.getClientRects().length) ? ctr0 : null;
        const ctrOpen = ctrRendered && ctrRendered.classList.contains('open') ? ctrRendered : null;
        ws.querySelectorAll('.splitbar').forEach(bar => {
          const A = document.getElementById(bar.dataset.l), B = document.getElementById(bar.dataset.r);
          const mid = bar.classList.contains('mid'), trl = bar.classList.contains('trl');
          if (!A || !B) { bar.classList.add('hidden'); return; } // genuinely absent column (e.g. no Mentor for this role) — nothing to divide
          // The Textbook|Translation bar and the Textbook|Notebook bar sit on
          // the same seam only while Translation is just its default peek —
          // once it's actually open there's real space between the two to
          // divide, so only then does this one stop being redundant.
          if (trl && !ctrOpen) { bar.classList.add('hidden'); return; }
          bar.classList.remove('hidden');
          const leftEdge = (mid && ctrRendered) ? ctrRendered.getBoundingClientRect().right : A.getBoundingClientRect().right;
          const center = trl ? A.getBoundingClientRect().right : (leftEdge + B.getBoundingClientRect().left) / 2;
          bar.style.left = (center - wr.left - bar.offsetWidth / 2) + 'px';
        });
      };
      KC.layoutSplits.__nbWrapped = true;
      return true;
    }
    function isCollapsed(el, isTranslation) {
      return isTranslation ? !el.classList.contains('open') : el.classList.contains('slim');
    }
    // One drag mechanism for every bar, every time: press-and-drag resizes
    // exactly ONE column — its own left neighbour, or its right neighbour if
    // the left one is collapsed (nothing to give there — its size is fixed
    // until the user expands it from its own spine). The OTHER neighbour is
    // never touched, not even to shrink it — these columns default to
    // flex-shrink:0 already, so leaving the other one alone means the
    // workspace's total width is free to grow past the viewport, same as a
    // collapsed-neighbour drag already did, and .app's own horizontal scroll
    // (installHorizontalScroll) picks up the rest. A symmetric two-pane
    // split (one side's gain is the other's loss) was tried here first and
    // rejected — it keeps total width constant, which meant a workspace with
    // every column already open could never need to scroll no matter how far
    // you dragged.
    function installSplitDrag() {
      if (installSplitDrag.__done) return true;
      document.addEventListener('mousedown', ev => {
        const bar = ev.target && ev.target.closest && ev.target.closest('.splitbar');
        if (!bar) return;
        const mid = bar.classList.contains('mid'), trl = bar.classList.contains('trl');
        let leftEl = document.getElementById(bar.dataset.l);
        const rightEl = document.getElementById(bar.dataset.r);
        if (!leftEl || !rightEl) return;
        // Matches KC.layoutSplits above: while Translation is open it
        // visually extends the Textbook outward, so dragging this bar should
        // resize the same thing its position is actually measured against.
        if (mid) {
          const ws0 = bar.closest('.workspace');
          const ctrOpen = ws0 && ws0.querySelector('.ctr.open');
          if (ctrOpen) leftEl = ctrOpen;
        }
        const leftOpen = !isCollapsed(leftEl, false);
        const rightOpen = !isCollapsed(rightEl, trl);
        if (!leftOpen && !rightOpen) return; // nothing open on either side — nothing to stretch

        ev.preventDefault();
        ev.stopPropagation(); // this bar's own onmousedown="KC.startSplit(...)" must never also fire — one mechanism only

        const ws = bar.closest('.workspace');
        const target = leftOpen ? leftEl : rightEl; // prefer the left column; the right one only when left is collapsed
        // The target's edge AWAY from this bar can't move (nothing beyond it
        // is being touched), so that's the fixed reference: width is just
        // the distance from there to wherever the cursor currently is.
        const fixedEdge = leftOpen
          ? target.getBoundingClientRect().left
          : target.getBoundingClientRect().right;
        const minW = 160, maxW = 1400; // .app's horizontal scroll (installHorizontalScroll) covers anything past the viewport — this is a sanity cap on a wild drag, not a "must fit on screen" limit

        function onMove(e) {
          const w = Math.max(minW, Math.min(maxW, leftOpen ? (e.clientX - fixedEdge) : (fixedEdge - e.clientX)));
          target.style.transition = 'none';
          target.style.minWidth = '';
          target.style.flex = '0 0 ' + Math.round(w) + 'px';
          if (ws && window.KC && KC.layoutSplits) KC.layoutSplits(ws);
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          target.style.transition = '';
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      }, true);
      installSplitDrag.__done = true;
      return true;
    }
    // The design's own overflow-x:auto on .app only actually engages for the
    // team-lead role today (template.html's own min-width:auto override is
    // scoped to body.role-teamlead) — everyone else has .workspace.active at
    // min-width:0, which lets it shrink-to-fit and squeeze columns instead of
    // the page scrolling horizontally. One small stylesheet override so a
    // workspace that no longer fits scrolls, same as it already does for
    // team leads, instead of columns getting crushed.
    function installHorizontalScroll() {
      if (document.getElementById('kc-hscroll-style')) return true;
      const style = document.createElement('style');
      style.id = 'kc-hscroll-style';
      // Every collapsible column's own native spine-toggle handle (.hnd, the
      // small round chevron — template.html's tog()/xp()) sits right where a
      // splitbar now always renders (z-index 55 vs the splitbar's own 60),
      // so an always-visible splitbar was painting over it. The splitbar
      // spans almost the whole column height (top:14px to bottom:14px); the
      // handle is just a small circle vertically centered within that same
      // strip — dropping the splitbar below it in stacking order keeps the
      // handle clickable/visible in that one small spot while the rest of
      // the splitbar's height is unaffected.
      style.textContent = '.workspace.active{min-width:auto}.splitbar{z-index:50}';
      document.head.appendChild(style);
      return true;
    }
    // Approve/reject used to be pure client-side theater: KC.publishToTree
    // only ever mutated the in-memory window.KC_TREE (gone on reload),
    // KC.applyProposalDOM only ever mutated the open DOM, and "rejected —
    // author notified" had no notification behind it at all. Both functions
    // ARE exposed on KC (unlike doApprove/doReject/TL.act, which are private
    // to kc-teamlead.js's own closure), so they're the two real hooks: catch
    // them right after they run their (still useful, instant-visual-feedback)
    // local mutation, stash what actually happened in _pendingResolve
    // (declared at the top of the file, alongside suggestionsCache — read
    // by API.removeSuggestion below, the one call every path already makes
    // right after: approve, reject, and the author's own withdrawal alike).
    function wrapPublishToTree() {
      const fn = KC.publishToTree;
      if (typeof fn !== 'function') return false;
      if (fn.__nbWrapped) return true;
      KC.publishToTree = function (wsIdx, parentNames, nodeName) {
        const r = fn.apply(this, arguments);
        _pendingResolve = { action: 'approve', title: nodeName };
        return r;
      };
      KC.publishToTree.__nbWrapped = true;
      return true;
    }
    function wrapApplyProposalDOM() {
      const fn = KC.applyProposalDOM;
      if (typeof fn !== 'function') return false;
      if (fn.__nbWrapped) return true;
      KC.applyProposalDOM = function (rec, action) {
        const r = fn.apply(this, arguments);
        if (action === 'approve' || action === 'reject') {
          _pendingResolve = { action: action, anchor: rec && rec.anchor };
        }
        return r;
      };
      KC.applyProposalDOM.__nbWrapped = true;
      return true;
    }

    // ── Real rich-text editor (TipTap/ProseMirror) for the two editable
    // surfaces — the custom-doc page in c2 (openCustomDoc) and the
    // free-writing Notebook in c3 — replacing the hand-rolled contenteditable
    // + document.execCommand the locked bundle uses today (deprecated API,
    // notoriously inconsistent across browsers — the actual cause of the
    // unreliable editing behavior this replaces).
    //
    // Loaded from a CDN as ES modules (dynamic import works from a plain
    // script) rather than adding a build step for this static-file bundle.
    // Everything here is additive and self-guarding: if the load fails for
    // any reason, none of the wraps below ever install, and the original
    // contenteditable + execCommand toolbar keeps working exactly as before
    // — this file never leaves the user with a broken editor.
    //
    // KNOWN TRADE-OFF (accepted): the per-line sticky-note tab feature
    // (bkInjectInto, called from KC.setupDocBookmarks) inserts DOM nodes
    // directly into block content — safe for the read-only real Textbook
    // page, but ProseMirror actively owns and diffs a mounted container's
    // DOM, so that per-line injection is skipped there (see
    // wrapSetupDocBookmarksSkipTipTap below). Whole-document bookmarking
    // (KC.bkToggle, the account cabinet's Bookmarks list) is unaffected.
    const NB_TIPTAP_CDN = 'https://esm.sh/';
    const NB_TIPTAP_VERSION = '2.11.5';
    window.__nbEditorRegistry = new WeakMap(); // editable container element -> TipTap Editor instance
    const NBEditor = { TT: null, ready: null, registry: window.__nbEditorRegistry };
    function nbTiptapImport(pkg) { return import(NB_TIPTAP_CDN + pkg + '@' + NB_TIPTAP_VERSION + '?bundle'); }
    // A slow/stuck path to the CDN must never leave this pending forever —
    // race it against a timeout so a bad network condition degrades to the
    // same clean fallback as an outright load failure, not an indefinite
    // pending promise.
    function nbTimeout(ms) {
      return new Promise((_, reject) => setTimeout(() => reject(new Error('TipTap CDN load timed out after ' + ms + 'ms')), ms));
    }
    function loadTipTapLibs() {
      if (NBEditor.ready) return NBEditor.ready;
      const libs = Promise.all([
        nbTiptapImport('@tiptap/core'),
        nbTiptapImport('@tiptap/starter-kit'),
        nbTiptapImport('@tiptap/extension-underline'),
        nbTiptapImport('@tiptap/extension-image'),
        nbTiptapImport('@tiptap/extension-text-style'),
        nbTiptapImport('@tiptap/extension-color'),
        nbTiptapImport('@tiptap/extension-highlight'),
        nbTiptapImport('@tiptap/extension-placeholder'),
      ]).then(([core, starter, underline, image, textStyle, color, highlight, placeholder]) => {
        NBEditor.TT = {
          Editor: core.Editor,
          Node: core.Node,
          StarterKit: starter.default,
          Underline: underline.default,
          Image: image.default,
          TextStyle: textStyle.default,
          Color: color.default,
          Highlight: highlight.default,
          Placeholder: placeholder.default,
        };
        return NBEditor.TT;
      });
      NBEditor.ready = Promise.race([libs, nbTimeout(10000)]).catch((err) => {
        console.warn('[KC] TipTap failed to load from the CDN — the original contenteditable editor stays in place.', err);
        NBEditor.TT = null;
        throw err;
      });
      return NBEditor.ready;
    }
    // Checklist item — matches openCustomDoc/KC.dcheck's existing
    // .docck/.docck-box/.checked/.done markup exactly, both ways (parseHTML
    // so previously-saved documents still load correctly; renderHTML so
    // editor.getHTML() keeps producing that same markup for KC.saveDoc/
    // KC.suggest/etc. to persist) — a plain click toggle via its own
    // nodeView, replacing the old inline onclick="KC.docCheck(this)".
    function makeChecklistExtension(NodeCtor) {
      return NodeCtor.create({
        name: 'docck',
        group: 'block',
        content: 'inline*',
        defining: true,
        addAttributes() {
          return { checked: { default: false, parseHTML: (el) => el.classList.contains('done'), renderHTML: () => ({}) } };
        },
        parseHTML() { return [{ tag: 'div.docck' }]; },
        renderHTML({ node }) {
          return ['div', { class: 'docck' + (node.attrs.checked ? ' done' : '') },
            ['span', { class: 'docck-box' + (node.attrs.checked ? ' checked' : ''), contenteditable: 'false' }],
            ['span', 0]];
        },
        addNodeView() {
          return ({ node, getPos, editor }) => {
            const dom = document.createElement('div');
            const box = document.createElement('span');
            box.setAttribute('contenteditable', 'false');
            const content = document.createElement('span');
            function paint(n) {
              dom.className = 'docck' + (n.attrs.checked ? ' done' : '');
              box.className = 'docck-box' + (n.attrs.checked ? ' checked' : '');
            }
            paint(node);
            box.addEventListener('click', () => {
              if (typeof getPos !== 'function') return;
              const checked = !box.classList.contains('checked');
              editor.view.dispatch(editor.view.state.tr.setNodeMarkup(getPos(), undefined, { checked: checked }));
            });
            dom.appendChild(box);
            dom.appendChild(content);
            return {
              dom, contentDOM: content,
              update(updated) { if (updated.type.name !== 'docck') return false; paint(updated); return true; },
            };
          };
        },
      });
    }
    // Link card — an existing, fairly rich embed (hover preview, YouTube
    // oEmbed enrichment; KC.renderLinkCard/the document-level hover
    // delegation in kc-app.js already handle all of that regardless of what
    // renders the markup). Treated as an opaque atom: the exact HTML
    // KC.linkCardEl produced is captured on parse and re-emitted verbatim on
    // render, so none of that existing behavior needs touching or
    // reimplementing here.
    function makeLinkCardExtension(NodeCtor) {
      return NodeCtor.create({
        name: 'lcard',
        group: 'block',
        atom: true,
        selectable: true,
        addAttributes() { return { html: { default: '' } }; },
        parseHTML() { return [{ tag: 'div.lcard', getAttrs: (el) => ({ html: el.outerHTML }) }]; },
        renderHTML({ node }) {
          const tmp = document.createElement('div');
          tmp.innerHTML = (node.attrs.html && node.attrs.html.trim()) || '<div class="lcard"></div>';
          return tmp.firstChild;
        },
      });
    }
    function buildEditorExtensions(placeholderText) {
      const TT = NBEditor.TT;
      return [
        TT.StarterKit,
        TT.Underline,
        TT.Image,
        TT.TextStyle,
        TT.Color,
        TT.Highlight.configure({ multicolor: true }),
        TT.Placeholder.configure({ placeholder: placeholderText || '' }),
        makeChecklistExtension(TT.Node),
        makeLinkCardExtension(TT.Node),
      ];
    }
    // Mounts a TipTap editor into `container`, seeding it from whatever
    // plain HTML is already there (works whether that's a real saved
    // document or the locked bundle's own seed markup). Once mounted,
    // container.innerHTML is overridden to transparently return
    // editor.getHTML() — every existing reader that does a plain
    // `el.innerHTML` (KC.saveNote, KC.autoSaveNote, KC.suggest's persisted-
    // store reads) keeps working unmodified. Readers that clone-then-read
    // (KC.saveDoc, cleanCopiedHtml) don't see through that trick — cloning
    // copies real DOM, not JS property descriptors — so those are handled
    // separately below.
    function mountEditor(container, opts) {
      if (!container || NBEditor.registry.has(container)) return NBEditor.registry.get(container) || null;
      const TT = NBEditor.TT;
      if (!TT) return null;
      const seedHtml = container.innerHTML || '<p></p>';
      // Strip the browser's own contenteditable BEFORE handing the element
      // to TipTap — ProseMirror sets contenteditable on the child view DOM
      // it builds inside `container`; leaving the outer element ALSO
      // contenteditable="true" at construction time risks the browser's
      // native editing behavior fighting ProseMirror's own, which can look
      // exactly like "nothing happens when I type."
      container.removeAttribute('contenteditable');
      // TipTap does NOT reliably clear out whatever's already inside
      // `element` before building its own view there — handing it a
      // container that still has the seeded HTML sitting in it left BOTH
      // visible at once: the original markup (its .dp-p/.dp-h/etc classes
      // still matching kc-docpage.js's own global, unscoped CSS rules, so
      // it rendered "close to the original") AND TipTap's own freshly
      // parsed rendering next to/inside it (plain paragraphs — its schema
      // doesn't know those classes, so no styling survives the parse).
      // Explicit empty before construction, so there's nothing left for it
      // to coexist with.
      container.innerHTML = '';
      let editor;
      try {
        editor = new TT.Editor({
          element: container,
          extensions: buildEditorExtensions(opts && opts.placeholder),
          content: seedHtml,
          onUpdate: () => { if (opts && opts.onUpdate) opts.onUpdate(); },
        });
      } catch (e) {
        console.warn('[KC] TipTap mount failed — leaving the original editor in place.', e);
        container.innerHTML = seedHtml; // restore the seed content we just cleared — the fallback contenteditable path needs it back
        container.setAttribute('contenteditable', 'true'); // restore — the original editor needs this back since we just removed it
        return null;
      }
      NBEditor.registry.set(container, editor);
      try {
        Object.defineProperty(container, 'innerHTML', {
          configurable: true,
          get() { return editor.getHTML(); },
          set() { /* TipTap owns this element's content now — ignore direct writes */ },
        });
      } catch (e) { /* editor still works even if this particular trick doesn't take */ }
      return editor;
    }
    // "Duplicate to edit" seeds the new custom doc from the real document's
    // own rendered body (cleanCopiedHtml), which is still full of kc-docpage's
    // own structural classes (.dp-h2, .dp-p, .dp-list, .dp-fig, .dp-callout,
    // etc.) — that markup already renders correctly today via kc-docpage.js's
    // own global, unscoped CSS, exactly as it does on the real document page.
    // TipTap's schema has no idea what any of those classes mean, so parsing
    // this content through it collapses everything to plain paragraphs —
    // real content and structure lost, not just cosmetic. Building custom
    // Node/Mark extensions to round-trip the full .dp-* vocabulary (a dozen-
    // plus distinct structures) is a large, risky undertaking for what's a
    // one-time starting point the user immediately edits anyway — instead,
    // skip mounting TipTap for any custom doc that still carries this
    // markup and leave the original plain contenteditable in place, which
    // already renders it faithfully. Autosave (installCustomDocAutosave,
    // above) listens for native 'input' events regardless of which editor
    // is mounted, and the toolbar bridge below already falls back to the
    // classic execCommand path when no TipTap editor is registered — so
    // neither is lost by skipping the mount here.
    function hasOriginalDocMarkup(html) {
      if (!html) return false;
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return !!tmp.querySelector('[class*="dp-"]');
    }
    // Keeping the classes intact (by skipping the TipTap mount, above) turns
    // out to be only half the fix: kc-docpage.js's own CSS (DP.CSS) defines
    // --dp-navy/--dp-ink0/--dp-fh/etc as custom properties scoped to
    // .dp-tb/.dp-web/.dp-lightbox — the wrapper kc-docpage.js itself always
    // renders around .dp-body. Every .dp-p/.dp-h2/etc rule reads those
    // properties with no fallback, so copied into .kc-doc-body (which never
    // carries any of those three wrapper classes) they resolve to nothing —
    // right classes, but the colors/fonts/line-heights they depend on are
    // undefined. .dp-tb itself only contributes exactly those custom
    // properties plus a couple of base text rules (no layout/width/
    // background side effects to worry about pulling in), so it's safe to
    // apply directly to .kc-doc-body whenever this is the kind of content
    // that needs it.
    function mountC2Editor(wrap) {
      const body = wrap && wrap.querySelector(':scope > .kc-doc-body');
      if (!body) return;
      const original = hasOriginalDocMarkup(body.innerHTML);
      body.classList.toggle('dp-tb', original);
      if (original) {
        // DP.CSS (the stylesheet .dp-tb and every .dp-* rule needs) is only
        // ever injected lazily, the first time a real document actually
        // mounts (KC.DocPage.mount) — a session that opens straight into a
        // duplicated custom doc without visiting a real one first would
        // otherwise have none of this CSS loaded at all. injectCSS is
        // idempotent (checks for its own <style> id first).
        if (KC.DocPage && KC.DocPage.injectCSS) KC.DocPage.injectCSS();
        return;
      }
      mountEditor(body, {
        placeholder: body.getAttribute('data-ph') || 'Write the document…',
        onUpdate: () => autoSaveCustomDocWrap(wrap),
      });
      if (window.lucide && lucide.createIcons) lucide.createIcons();
    }
    function mountC3Editor(ws) {
      const doc = ws.querySelector('.c3 .note-doc');
      if (!doc) return;
      mountEditor(doc, {
        placeholder: doc.getAttribute('data-ph') || 'Start writing your notes…',
        onUpdate: () => { if (KC.autoSaveNote) KC.autoSaveNote(doc); },
      });
      if (window.lucide && lucide.createIcons) lucide.createIcons();
    }
    function mountAllNoteEditors() {
      document.querySelectorAll('.workspace').forEach((ws) => {
        mountC3Editor(ws);
        const wrap = ws.querySelector('.c2 .kc-doc:not(.kc-docpage)');
        if (wrap) mountC2Editor(wrap);
      });
    }
    // Whichever mounted editor the clicked toolbar button belongs to — c2's
    // .kc-doc-body carries both classes (kc-doc-body AND note-doc), so
    // .note-doc alone is enough to find either surface's container.
    function editorForButton(btn) {
      const scope = (btn.closest && (btn.closest('.kc-doc') || btn.closest('.ci') || btn.closest('.workspace'))) || null;
      const container = scope && scope.querySelector('.note-doc');
      return container && NBEditor.registry.get(container);
    }
    // KC.dfmt/nfmt/dcolor/nbColor/dhl/nbHilite/dcheck/dimg/dInsertCard are
    // the whole toolbar's command surface for BOTH editable pages — full
    // replacement (redirecting to the matching TipTap command), falling
    // back to the original execCommand-based behavior whenever no editor is
    // registered yet for that button's context (still loading, or load
    // failed) so the toolbar is never left doing nothing.
    function installEditorToolbarBridge() {
      if (document.__nbEditorToolbarBridged) return;
      document.__nbEditorToolbarBridged = true;
      const origDfmt = KC.dfmt, origDcolor = KC.dcolor, origDhl = KC.dhl,
        origDcheck = KC.dcheck, origDimg = KC.dimg, origDInsertCard = KC.dInsertCard;
      const CMD_MAP = { bold: 'toggleBold', italic: 'toggleItalic', underline: 'toggleUnderline', insertUnorderedList: 'toggleBulletList', insertOrderedList: 'toggleOrderedList' };
      function targetButton(ev) { return (ev.target.closest && ev.target.closest('button')) || ev.target; }
      KC.dfmt = KC.nfmt = function (ev, cmd) {
        ev.preventDefault();
        const editor = editorForButton(targetButton(ev));
        if (!editor) return origDfmt.call(this, ev, cmd);
        const m = CMD_MAP[cmd];
        if (m && typeof editor.commands[m] === 'function') editor.chain().focus()[m]().run();
        return false;
      };
      KC.dcolor = KC.nbColor = function (ev, c) {
        ev.preventDefault();
        const editor = editorForButton(targetButton(ev));
        if (!editor) return origDcolor.call(this, ev, c);
        editor.chain().focus().setColor(c).run();
        return false;
      };
      KC.dhl = KC.nbHilite = function (ev, c) {
        ev.preventDefault();
        const editor = editorForButton(targetButton(ev));
        if (!editor) return origDhl.call(this, ev, c);
        if (c === 'transparent') editor.chain().focus().unsetHighlight().run();
        else editor.chain().focus().setHighlight({ color: c }).run();
        return false;
      };
      KC.dcheck = function (ev, btn) {
        ev.preventDefault();
        const editor = editorForButton(btn);
        if (!editor) return origDcheck.call(this, ev, btn);
        editor.chain().focus().insertContent({ type: 'docck', attrs: { checked: false } }).run();
        return false;
      };
      KC.dimg = function (btn) {
        const editor = editorForButton(btn);
        if (!editor) return origDimg.call(this, btn);
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = () => {
          const f = inp.files && inp.files[0]; if (!f) return;
          const r = new FileReader();
          r.onload = () => { editor.chain().focus().setImage({ src: r.result }).run(); };
          r.readAsDataURL(f);
        };
        inp.click();
      };
      KC.dInsertCard = function (btn) {
        const editor = editorForButton(btn);
        if (!editor) return origDInsertCard.call(this, btn);
        const url = prompt('Paste a link (YouTube, PDF, or any URL):'); if (!url) return;
        const card = KC.linkCardEl(url.trim());
        editor.chain().focus().insertContent({ type: 'lcard', attrs: { html: card.outerHTML } }).run();
        if (window.toast) window.toast('Link card added');
      };
    }
    // See the KNOWN TRADE-OFF note above this section.
    function wrapSetupDocBookmarksSkipTipTap() {
      const fn = KC.setupDocBookmarks;
      if (typeof fn !== 'function') return false;
      if (fn.__nbSkipTipTap) return true;
      KC.setupDocBookmarks = function (cb) {
        const container = cb && cb.querySelector('.kc-doc:not(.kc-docpage) .note-doc');
        if (container && NBEditor.registry.has(container)) {
          if (KC.applyLineBk) KC.applyLineBk();
          if (window.lucide && lucide.createIcons) lucide.createIcons();
          return;
        }
        return fn.apply(this, arguments);
      };
      KC.setupDocBookmarks.__nbSkipTipTap = true;
      return true;
    }
    // Mount a fresh TipTap instance whenever a custom node is opened after
    // TipTap has finished loading (openCustomDoc rebuilds .kc-doc-body from
    // scratch on every open, so there's always a fresh, unmounted container
    // to catch here).
    function wrapSelectMountEditor() {
      const fn = KC.select;
      if (typeof fn !== 'function') return false;
      if (fn.__nbEditorMount) return true;
      KC.select = function (rowEl) {
        const r = fn.apply(this, arguments);
        if (NBEditor.TT) {
          const node = rowEl && rowEl.closest && rowEl.closest('.node');
          const ws = rowEl && rowEl.closest && rowEl.closest('.workspace');
          const wrap = node && node.classList.contains('custom') && ws && ws.querySelector('.c2 .kc-doc:not(.kc-docpage)');
          if (wrap) mountC2Editor(wrap);
        }
        return r;
      };
      KC.select.__nbEditorMount = true;
      return true;
    }
    // KC.saveDoc reads its content via bodyEl.cloneNode(true) — a clone
    // doesn't carry mountEditor's innerHTML override (defineProperty is a JS
    // descriptor, not DOM state, so it isn't copied), so this one needs a
    // real replacement rather than the transparent-read trick used
    // elsewhere. Same persistence contract as the original (docs store
    // shape, byline, toast) — only the HTML source differs.
    function replaceSaveDocForEditor() {
      const fn = KC.saveDoc;
      if (typeof fn !== 'function') return false;
      if (fn.__nbEditorAware) return true;
      KC.saveDoc = function (btn) {
        const wrap = btn.closest && btn.closest('.kc-doc');
        const bodyEl = wrap && wrap.querySelector('.kc-doc-body');
        const editor = bodyEl && NBEditor.registry.get(bodyEl);
        if (!editor) return fn.apply(this, arguments);
        const id = wrap.dataset.docid;
        const titleEl = wrap.querySelector('.kc-doc-title');
        const title = ((titleEl && titleEl.value) || '').trim() || 'Untitled';
        const html = editor.getHTML();
        const docs = KC.loadDocs(); const prev = docs[id] || {};
        const idn = KC.identity || { name: 'Someone', mail: '', initials: '?' };
        const now = Date.now();
        docs[id] = { title: title, html: html, createdBy: prev.createdBy || idn.name, createdAt: prev.createdAt || now, editedBy: idn.name, editedAt: now };
        KC.saveDocs(docs);
        const by = wrap.querySelector('.kc-byline');
        if (by && KC.bylineHTML) { const tmp = document.createElement('div'); tmp.innerHTML = KC.bylineHTML(docs[id]); by.replaceWith(tmp.firstChild); }
        if (window.toast) window.toast('Saved');
      };
      KC.saveDoc.__nbEditorAware = true;
      return true;
    }
    function startTipTapIntegration() {
      loadTipTapLibs().then(() => {
        installEditorToolbarBridge();
        wrapSetupDocBookmarksSkipTipTap();
        wrapSelectMountEditor();
        replaceSaveDocForEditor();
        mountAllNoteEditors();
      }).catch(() => { /* already warned inside loadTipTapLibs */ });
    }
    // Was disabled after a page-load hang (2026-08) — root cause turned out
    // to be the custom-node badge's MutationObserver (a self-triggering
    // loop, fixed/disabled separately, see installCustomBadgeObserver),
    // not this. Re-enabling now that that's confirmed, with one added
    // safety net: loadTipTapLibs races the CDN load against a 10s timeout,
    // so a slow/blocked network path degrades to the same clean fallback
    // as an outright failure instead of staying pending indefinitely.
    const NB_TIPTAP_ENABLED = true;
    if (NB_TIPTAP_ENABLED) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startTipTapIntegration);
      else startTipTapIntegration();
    }

    function tryWrap() {
      let ok = true;
      if (!window.KC || !wrapFn(KC, 'select')) ok = false;
      if (!wrapFn(window, 'switchWS')) ok = false;
      if (!wrapTogTr()) ok = false;
      if (!wrapToggleUserMenu()) ok = false;
      if (!window.KC) ok = false;
      else {
        if (!wrapInternIdentityName()) ok = false;
        ['toggleBookmark', 'findBk', 'isBookmarked'].forEach(n => { if (!wrapBookmarkIdentity(n)) ok = false; });
        if (!wrapOpenBookmark()) ok = false;
        if (!wrapToggleBookmarkToast()) ok = false;
        if (!wrapRenderBookmarksIcon()) ok = false;
        if (!wrapRemoveBk()) ok = false;
        if (!wrapLayoutSplits()) ok = false;
        if (!installSplitDrag()) ok = false;
        if (!installHorizontalScroll()) ok = false;
        if (!wrapStandaloneHTML()) ok = false;
        if (!wrapSelectEmptyMock()) ok = false;
        if (!wrapSelectSuppressBootDemo()) ok = false;
        if (!wrapGoToSuppressBootDemo()) ok = false;
        ['addChild', 'rename', 'del', 'duplicate'].forEach((n) => { if (!wrapCustomTreeMutator(n)) ok = false; });
        if (!wrapMenuMoveOption()) ok = false;
        if (!wrapMenuSendOption()) ok = false;
        if (!wrapSelectWireCustomBreadcrumb()) ok = false;
        if (!wrapSelectApplyC2SaveUX()) ok = false;
        if (!wrapDocPageMountBreadcrumb()) ok = false;
        if (!wrapBookMenuNodeActions()) ok = false;
        if (!wrapCleanupDocsOnDelete()) ok = false;
        if (!wrapConfirmDelete()) ok = false;
        if (!wrapSendRealDocTitle()) ok = false;
        if (!wrapDuplicateContent()) ok = false;
        if (!replaceSaveAsTopic()) ok = false;
        if (!replaceAddBlock()) ok = false;
        if (!wrapPublishToTree()) ok = false;
        if (!wrapApplyProposalDOM()) ok = false;
        if (!replaceMentorFunctions()) ok = false;
        if (!wrapMentorMode()) ok = false;
        if (!wrapMentorNew()) ok = false;
        if (!wrapMentorRenderCosmetics()) ok = false;
        if (!wrapSelectRefreshMentorTopic()) ok = false;
        if (!wrapSelectSaveOpenTopic()) ok = false;
        if (!replaceBylineHTML()) ok = false;
        // Registered last on purpose — reorderCtxMenu needs every other
        // menu-content wrap above (wrapMenuMoveOption/wrapMenuSendOption/
        // wrapBookMenuNodeActions/etc.) to have already run.
        if (!wrapMenuReorder()) ok = false;
        if (!wrapBookMenuReorder()) ok = false;
      }
      return ok;
    }
    // Each workspace's Textbook starts out already showing the design
    // bundle's own static example for that workspace — it's not tied to any
    // selected tree row at all (nothing starts pre-selected), so it never
    // goes through KC.select and the click-time fix above never sees it.
    // It's also NOT specific to whichever branch happens to share its
    // breadcrumb text (a branch row's own onclick is KC.toggle — expand/
    // collapse only, per kc-app.js's buildNode — never KC.select; clicking
    // "Coordinates" to open it doesn't touch the Textbook at all, so this
    // stale content just sits there regardless of what gets clicked). Same
    // fix, applied once at boot to whatever is (or isn't) actually showing,
    // rather than trying to find a row.sel that was never going to exist.
    function fixInitialMockViews() {
      document.querySelectorAll('.workspace').forEach((ws) => {
        const cb = ws.querySelector('.c2 .cb');
        if (cb && !cb.querySelector('.kc-doc')) renderNotYetAvailable(ws, null);
      });
    }
    function boot() {
      if (!tryWrap()) setTimeout(boot, 50);
      else {
        setTimeout(reconcileAllCustomTrees, 150);
        setTimeout(restoreAllOpenTopics, 150); // after reconcileAllCustomTrees above — a custom doc's row needs to exist first
        setTimeout(syncAllNotebooks, 150);
        setTimeout(fixInitialMockViews, 150);
        setTimeout(restoreAllMentorReal, 150);
        setTimeout(paintRealIdentity, 150);
      }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  })();

  /* ═══════════════ CHANGE PROPOSALS ═══════════════
     Real, shared, per-user-authored records now (see suggestionsCache /
     bootstrapSuggestions near the top of this file) — kc_suggestions used
     to be one browser's own localStorage array. kc-suggest.js never learns
     which real document is open (it only reads breadcrumb text off the
     DOM), so submitSuggestion backfills sourceId from KC.DocPage.data —
     the same trick noteKeyForWs already uses above. All three network
     calls below are deliberate one-off user actions (submit/withdraw/
     resolve), not per-keystroke writes, so — like the rest of this file's
     boot-time reads — they're synchronous XHR: the caller (kc-app.js/
     kc-suggest.js/kc-teamlead.js) isn't written to await a Promise here. */
  // currentOpenSourceId (no-arg call below) is defined in the outer scope,
  // near the other mentor helpers — this used to be a local duplicate of
  // it, kept in sync by hand; removed in favor of the one real definition.
  function submitSuggestion(rec) {
    const payload = Object.assign({}, rec);
    if ((payload.type === 'edit' || payload.type === 'add') && !payload.sourceId) {
      payload.sourceId = currentOpenSourceId();
    }
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/kc/suggestions', false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(payload));
      if (xhr.status >= 200 && xhr.status < 300) {
        const item = JSON.parse(xhr.responseText || '{}').item;
        if (item) { suggestionsCache.push(fromServerSuggestion(item)); return; }
      }
      console.error('kc: failed to submit suggestion', xhr.status, xhr.responseText);
    } catch (e) { console.error('kc: failed to submit suggestion', e); }
    suggestionsCache.push(rec); // keep it visible locally even if the write failed
  }
  function callResolve(id, action, extra) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/kc/suggestions/' + encodeURIComponent(id) + '/resolve', false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(Object.assign({ action: action }, extra || {})));
      if (xhr.status < 200 || xhr.status >= 300) console.error('kc: resolve failed', id, xhr.status, xhr.responseText);
    } catch (e) { console.error('kc: resolve failed', id, e); }
  }
  function callWithdraw(id) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('DELETE', '/api/kc/suggestions/' + encodeURIComponent(id), false);
      xhr.send(null);
    } catch (e) { console.error('kc: withdraw failed', id, e); }
  }
  API.listSuggestions = function () { return suggestionsCache; };
  API.saveSuggestions = function (arr) {
    // Only ever called with an array carrying exactly one more record than
    // we already have — kc-app.js's KC.suggest / kc-suggest.js's
    // KC.submitProposal both push, then save the whole array. No call site
    // ever removes via this path (that's API.removeSuggestion, below).
    const known = {}; suggestionsCache.forEach((s) => { known[s.id] = true; });
    arr.filter((s) => !known[s.id]).forEach(submitSuggestion);
    return true;
  };
  API.addSuggestion = function (rec) { submitSuggestion(rec); return rec; };
  API.removeSuggestion = function (id) {
    const pending = _pendingResolve;
    _pendingResolve = null;
    if (pending) {
      callResolve(id, pending.action, pending.anchor ? { anchor: pending.anchor } : (pending.title ? { title: pending.title } : undefined));
    } else if (realKnowledgeRole === 'teamlead') {
      // The Team Lead console rejecting a 'new'-type suggestion is the one
      // path that calls neither KC.publishToTree nor KC.applyProposalDOM
      // first (kc-teamlead.js's doReject skips both for that type) — the
      // only removeSuggestion call left unaccounted for is a team lead
      // acting on someone else's suggestion, i.e. a reject.
      callResolve(id, 'reject');
    } else {
      callWithdraw(id);
    }
    suggestionsCache = suggestionsCache.filter((s) => s.id !== id);
  };

  /* ═══════════════ ASSIGNMENTS TO INTERNS ═══════════════ */
  API.listAssignments = function () { return T.get(K.assignments, []); };
  API.saveAssignments = function (arr) { return T.set(K.assignments, arr); };

  /* ═══════════════ BOOKMARKS ═══════════════ */
  API.listBookmarks = function () { const v = RemoteKV.get(K.bookmarks, []); return Array.isArray(v) ? v : []; };
  API.saveBookmarks = function (arr) { return RemoteKV.set(K.bookmarks, arr); };

  /* ═══════════════ MENTOR ═══════════════ */
  API.getMentorThreads = function () { return RemoteKV.get(K.mentor, {}); };
  API.saveMentorThreads = function (obj) { return RemoteKV.set(K.mentor, obj); };

  /* ═══════════════ DOCUMENT VERSION LOG ═══════════════ */
  API.getVersionLog = function () { const v = T.get(K.versions, []); return Array.isArray(v) ? v : []; };
  API.saveVersionLog = function (arr) { return T.set(K.versions, arr); };

  /* ═══════════════ SEND JOURNAL ═══════════════ */
  API.getSendLog = function () { const v = T.get(K.sendLog, []); return Array.isArray(v) ? v : []; };
  API.saveSendLog = function (arr) { return T.set(K.sendLog, arr); };

  /* ═══════════════ TREE (Monday) ═══════════════
     Today the structure is hardcoded in kc-data.js. On the backend it is a one-way
     sync from the Monday "Knowledge Center" workspace; personal nodes come from our DB. */
  API.getTree = function () {
    if (T === Local) return Promise.resolve(window.KC_TREE || []);
    return T.request('GET', '/tree');   // TODO(backend)
  };

  /* ═══════════════ DOCUMENT (the digested copy) ═══════════════
     The front end does not care whether the document came from our DB or was
     digested just now. The response always has one shape:
        { status:'ready',        doc:{ id, sourceId, title, version, blocks:[…] } }
        { status:'importing',    progress:0..1 }
        { status:'not_imported', sourceUrl:'…' }
        { status:'error',        message:'…' }
     These states get their screens in step 7 of the plan. */
  /* kc-docpage.js's KC.DocPage.mount() always renders KC.DocPage.data — it has
     no per-call parameter for which document to show (it was only ever built
     to display the one Project Startup example). That object is a plain
     mutable property, though, and mount() reads it fresh on every call — so
     this is the actual seam for real per-document content: getDocument()
     below sets KC.DocPage.data to the document just fetched, right before
     kc-app.js's openDocPage() goes on to call mount(). Without this, every
     document that reaches "ready" renders the same hardcoded example. */
  function mapToDocPageData(doc, sourceId) {
    const versions = (doc.versionHistory || []).map(v => ({ v: v.v, date: v.date, who: v.who, anchor: v.anchor || '', change: v.change || '' }));
    const created = versions.length ? { name: versions[0].who, date: versions[0].date } : { name: '', date: '' };
    const updated = versions.length ? { name: versions[versions.length - 1].who, date: versions[versions.length - 1].date } : created;
    // The breadcrumb (DP.bcHTML) just prints this path verbatim — it used
    // to be a fixed 3-segment template (workspace, "Revit", title), which
    // silently dropped any category folder actually sitting between them
    // in the tree (e.g. "Docs") for every document that has one. The real
    // tree already knows the full path — reuse the exact same walk custom
    // documents' own breadcrumbs are built from (nodePathFor) off this
    // document's own row. Wrapped defensively (try/catch + shape check) —
    // this runs on every single document open, so a bad tree match must
    // never take the whole page down with it; falls back to the original
    // 3-segment template on any failure. Workspace name itself is still
    // fixed — every digested document lives under this one workspace/board
    // today; revisit if that changes.
    let treePath = null;
    try {
      const node = document.querySelector('.node[data-doc="' + sourceId + '"]');
      const walked = node && nodePathFor(node);
      if (Array.isArray(walked) && walked.length) treePath = walked;
    } catch (e) { /* fall through to the safe default below */ }
    if (!treePath) treePath = ['Revit', doc.title || ''];
    return {
      sourceId: sourceId, // read by noteKeyForWs() above, to key the per-document Notebook
      series: doc.series || '',
      title: doc.title || '',
      code: doc.code || '',
      ws: 'BIM Methodology & Tools',
      path: ['BIM Methodology & Tools'].concat(treePath),
      created: created,
      updated: updated,
      versions: versions,
      toc: doc.toc || [],
      links: doc.links || [],
      blocks: doc.blocks || []
    };
  }

  // kc-docpage.js's own TOC renderer (DP.tocHTML) falls back to a plain
  // position index — String(i+1) — whenever a heading's real num is falsy,
  // as a sensible default for a document with no numbering built at all. But
  // our digest deliberately leaves num empty for headings that genuinely
  // have no number in the source document (see the digest providers' own
  // comments on this) while OTHER headings in the very same document do
  // carry a real one — so that fallback ends up inventing a number exactly
  // where the original document doesn't have one. The heading body itself
  // already gets this right (DP.blocksHTML only prints a number when b.num
  // is truthy) — this just brings the TOC's own number badge in line with
  // it, by blanking the ones the renderer filled in from position alone.
  // kc-docpage.js's own TOC renderer always prints a .dp-toc-n badge, empty
  // square and all, when a heading's num is falsy — leaving a visibly
  // "broken" little box next to headings that genuinely have no number in
  // the source document (see the digest providers' own comments on why that
  // happens). Made invisible rather than removed (visibility, not display)
  // so it still reserves its slot — otherwise every unnumbered heading's
  // text would start further over than a numbered one next to it, instead
  // of every heading's text lining up on the same vertical line regardless
  // of whether it happens to carry a number.
  // A heading has no number at all when the source Google Doc didn't format
  // it as part of an actual numbered list (see the digest provider's own
  // comment on why — a real number only ever comes from Docs' own
  // listId/nesting metadata, never synthesized from heading level). Some of
  // those really are unnumbered section labels (correctly left blank) — but
  // some sit in an otherwise-sequential numbered list and are just missing
  // their own number because of how the author happened to format that one
  // heading (e.g. "2", <unnumbered>, "2.2", "2.3" — the middle one is
  // obviously "2.1"). Only fill a gap when it's unambiguous: exactly enough
  // unnumbered headings between two real numbers to account for every
  // integer strictly between them, one level deeper than the one before.
  // Never guns for the genuinely-unnumbered-label case (nothing to fill
  // between real numbers there, so the gap check just doesn't match).
  function inferMissingTocNumbers(toc) {
    const result = toc.map((e) => Object.assign({}, e));
    let i = 0;
    while (i < result.length) {
      if (result[i].num) { i++; continue; }
      let j = i;
      while (j < result.length && !result[j].num) j++;
      const prevNum = i > 0 ? result[i - 1].num : null;
      const nextNum = j < result.length ? result[j].num : null;
      if (prevNum && nextNum) {
        const prevParts = String(prevNum).split('.');
        const nextParts = String(nextNum).split('.');
        const prefix = prevParts.join('.');
        const sharesPrefix = nextParts.slice(0, prevParts.length).join('.') === prefix;
        const nextLast = parseInt(nextParts[nextParts.length - 1], 10);
        const runLen = j - i;
        if (sharesPrefix && nextParts.length === prevParts.length + 1 && !isNaN(nextLast) && nextLast - 1 === runLen) {
          for (let k = 0; k < runLen; k++) result[i + k].num = prefix + '.' + (k + 1);
        }
      }
      i = j;
    }
    return result;
  }
  function applyInferredTocNumbers() {
    const toc = KC.DocPage && KC.DocPage.data && KC.DocPage.data.toc;
    if (!toc || !toc.length) return;
    KC.DocPage.data.toc = inferMissingTocNumbers(toc);
  }
  function patchTocNumberBadges() {
    const toc = KC.DocPage && KC.DocPage.data && KC.DocPage.data.toc;
    if (!toc || !toc.length) return;
    const list = document.querySelector('.workspace.active .c2 #dpToc .dp-toc-list');
    if (!list) return;
    const items = list.querySelectorAll(':scope > li');
    items.forEach((li, i) => {
      const entry = toc[i]; if (!entry) return;
      const badge = li.querySelector('.dp-toc-n');
      if (!badge) return;
      if (entry.num) { badge.textContent = entry.num; badge.style.visibility = ''; }
      else badge.style.visibility = 'hidden';
    });
  }

  // DP.tocHTML (kc-app.js) decides each row's own dir/alignment purely from
  // whether THAT heading's own text happens to contain Hebrew characters —
  // so a heading that's just an English term (e.g. "Worksets", "Copy
  // Monitor") gets flipped to dir="ltr" even inside an otherwise
  // right-to-left Hebrew document, breaking the vertical line every other
  // row lines up on. A document has ONE real direction (DP.docDir already
  // decides this once, for the whole page) — force every row to that same
  // direction instead of letting each one guess from its own text.
  function alignTocDirection() {
    const data = KC.DocPage && KC.DocPage.data;
    if (!data || !KC.DocPage.docDir) return;
    const dir = KC.DocPage.docDir(data);
    const list = document.querySelector('.workspace.active .c2 #dpToc .dp-toc-list');
    if (!list) return;
    list.querySelectorAll(':scope > li > .dp-toc-i').forEach((a) => {
      a.setAttribute('dir', dir);
      const only = a.querySelector('.dp-toc-only');
      if (only) only.setAttribute('dir', dir);
    });
  }

  (function injectTocCollapseStyle() {
    if (document.getElementById('kc-toc-collapse-style')) return;
    const style = document.createElement('style');
    style.id = 'kc-toc-collapse-style';
    // kc-toc-d0..d6: our own indentation, replacing DP.tocHTML's own
    // dp-toc-lvlN classes (see initTocCollapse's comment on why raw Heading
    // level and real number depth disagree for unnumbered wrapper
    // headings). Each step is the same fixed amount, so the tree's rungs
    // are visibly even instead of following whatever indent Google Docs'
    // own heading styles happened to use.
    let indentCss = '';
    for (let d = 0; d <= 6; d++) indentCss += '.dp-toc-i.kc-toc-d' + d + '{margin-inline-start:' + (d * 16) + 'px}';
    style.textContent =
      '.dp-toc-list > li.kc-toc-collapsed{display:none}' +
      '.kc-toc-caret-btn{appearance:none;border:none;background:transparent;flex:none;width:22px;height:22px;margin-inline-end:2px;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:inherit;box-sizing:border-box}' +
      'button.kc-toc-caret-btn{cursor:pointer}' +
      'button.kc-toc-caret-btn:hover{background:rgba(0,0,0,.06)}' +
      '.kc-toc-caret-spacer{visibility:hidden}' +
      '.kc-toc-caret{width:14px;height:14px;transition:transform .14s ease;stroke:currentColor;pointer-events:none}' +
      '.dp-toc-i.kc-toc-parent.kc-toc-open .kc-toc-caret{transform:rotate(90deg)}' +
      indentCss +
      // Fixed width (not just the design's own min-width:18px) so "1" and
      // "4.2.1" reserve the same space — otherwise every heading's text
      // starts at a different point depending on how long its own number
      // happens to be.
      '.dp-toc-n{width:34px!important;box-sizing:border-box}';
    document.head.appendChild(style);
  })();

  // A real document's TOC (dozens of headings 3-4 levels deep, per the digest
  // providers' own real-heading-hierarchy handling) is unusable rendered
  // flat, all at once — DP.tocHTML (kc-app.js, do-not-edit) only ever
  // produces that flat <li> list, no collapse/expand of its own. This turns
  // it into a standard accordion tree after the fact: only the shallowest
  // level shows by default, clicking a heading with children reveals just
  // its own direct children (one level at a time — click again on those to
  // go deeper, same as any tree view), alongside its normal jump-to-section
  // behavior, never replacing it. Collapsing a heading back also folds shut
  // anything that had been opened underneath it, so re-expanding always
  // starts from the same clean state instead of the caret/visibility
  // getting out of sync with what's actually showing.
  function initTocCollapse() {
    const toc = KC.DocPage && KC.DocPage.data && KC.DocPage.data.toc;
    if (!toc || !toc.length) return;
    const list = document.querySelector('.workspace.active .c2 #dpToc .dp-toc-list');
    if (!list) return;
    const items = Array.from(list.querySelectorAll(':scope > li'));
    if (items.length !== toc.length || list.dataset.kcTocReady === String(toc.length)) return;
    list.dataset.kcTocReady = String(toc.length);

    // Depth comes from the NUMBER itself (how many dots in "4.2.1"), not
    // kc-app.js's own it.lvl (Google Docs' own Heading-1..6 style level) —
    // those two diverge exactly where it matters here: "אופן פעולה" (no
    // number, lvl2) sits at the same conceptual rung as "1"/"4"/"7" (real
    // top-level numbers, but lvl3, one deeper than "אופן פעולה" in the
    // renderer's own indentation) since it's just an unnumbered label
    // introducing them, not a numbered ancestor of them. An unnumbered
    // heading is depth 0, same as any bare "N" — only a dotted number is a
    // real sub-level, and its depth is exactly its dot count.
    const depthOf = (i) => {
      const num = toc[i] && toc[i].num;
      return num ? (String(num).match(/\./g) || []).length : 0;
    };
    const directChildren = (i) => {
      const d = depthOf(i), out = [];
      for (let j = i + 1; j < items.length && depthOf(j) > d; j++) {
        if (depthOf(j) === d + 1) out.push(j);
      }
      return out;
    };
    const collapseSubtree = (i) => {
      const d = depthOf(i);
      for (let j = i + 1; j < items.length && depthOf(j) > d; j++) {
        items[j].classList.add('kc-toc-collapsed');
        const ca = items[j].querySelector('.dp-toc-i.kc-toc-parent');
        if (ca) ca.classList.remove('kc-toc-open');
      }
    };

    items.forEach((li, i) => {
      const d = depthOf(i);
      const a = li.querySelector('.dp-toc-i');
      if (!a) return;
      // Indentation also follows number depth instead of the renderer's own
      // dp-toc-lvlN class (same mismatch as above — strip whatever it
      // applied and use ours instead) — that's what actually makes "אופן
      // פעולה" and "1" line up, and each dot in a number step the row over
      // by exactly one more than its parent, forming a real tree.
      a.className = a.className.replace(/\bdp-toc-lvl\d+\b/g, '').replace(/\s+/g, ' ').trim();
      a.classList.add('kc-toc-d' + Math.min(d, 6));
      // Every row reserves the same caret slot whether or not it actually
      // has one, so the number badge that follows always starts at the same
      // offset — a row with no children gets an inert, invisible spacer of
      // identical size instead of nothing.
      const hasChildren = depthOf(i + 1) > d;
      const btn = document.createElement(hasChildren ? 'button' : 'span');
      if (hasChildren) {
        btn.type = 'button';
        btn.title = 'Expand/collapse';
        a.classList.add('kc-toc-parent');
      } else {
        btn.className = 'kc-toc-caret-spacer';
      }
      btn.className = (btn.className ? btn.className + ' ' : '') + 'kc-toc-caret-btn';
      if (hasChildren) btn.innerHTML = '<i data-lucide="chevron-right" class="kc-toc-caret"></i>';
      a.insertBefore(btn, a.firstChild);
      if (d > 0) li.classList.add('kc-toc-collapsed');
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();

    items.forEach((li, i) => {
      const a = li.querySelector('.dp-toc-i.kc-toc-parent');
      const btn = a && a.querySelector('.kc-toc-caret-btn');
      if (!a || !btn) return;
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation(); // never let this reach the <a>'s own onclick — it would also jump to the section
        const opening = !a.classList.contains('kc-toc-open');
        a.classList.toggle('kc-toc-open', opening);
        directChildren(i).forEach((j) => items[j].classList.toggle('kc-toc-collapsed', !opening));
        if (!opening) collapseSubtree(i);
      });
    });
  }

  // The exact same fix, self-contained: DP.tocHTML's flat/badge-fallback
  // problem and its fix (see initTocCollapse/patchTocNumberBadges above)
  // apply equally to the "Web page" download (KC.DocPage.standaloneHTML) —
  // it's the same DP.tocHTML markup, just written out to a standalone file
  // instead of the live page, so my DOM patches never reach it on their
  // own. This is that logic ported to run standalone: no KC/window.KC
  // reference at all, because it has to survive being serialized to a
  // string and re-executed later inside the downloaded file's own <script>,
  // in a browser tab that never ran kc-api.js.
  function kcTocEnhanceStandalone(toc, dir) {
    var list = document.querySelector('#dpToc .dp-toc-list');
    if (!list || !toc || !toc.length) return;
    var items = Array.prototype.slice.call(list.querySelectorAll(':scope > li'));
    if (items.length !== toc.length) return;
    function depthOf(i) {
      var num = toc[i] && toc[i].num;
      return num ? (String(num).match(/\./g) || []).length : 0;
    }
    function directChildren(i) {
      var d = depthOf(i), out = [];
      for (var j = i + 1; j < items.length && depthOf(j) > d; j++) {
        if (depthOf(j) === d + 1) out.push(j);
      }
      return out;
    }
    function collapseSubtree(i) {
      var d = depthOf(i);
      for (var j = i + 1; j < items.length && depthOf(j) > d; j++) {
        items[j].classList.add('kc-toc-collapsed');
        var ca = items[j].querySelector('.dp-toc-i.kc-toc-parent');
        if (ca) ca.classList.remove('kc-toc-open');
      }
    }
    items.forEach(function (li, i) {
      var d = depthOf(i);
      var a = li.querySelector('.dp-toc-i');
      if (!a) return;
      a.setAttribute('dir', dir);
      var only = a.querySelector('.dp-toc-only'); if (only) only.setAttribute('dir', dir);
      var badge = a.querySelector('.dp-toc-n');
      if (badge && !(toc[i] && toc[i].num)) badge.style.visibility = 'hidden';
      a.className = a.className.replace(/\bdp-toc-lvl\d+\b/g, '').replace(/\s+/g, ' ').trim();
      a.classList.add('kc-toc-d' + Math.min(d, 6));
      var hasChildren = depthOf(i + 1) > d;
      var btn = document.createElement(hasChildren ? 'button' : 'span');
      if (hasChildren) {
        btn.type = 'button';
        btn.title = 'Expand/collapse';
        a.classList.add('kc-toc-parent');
      } else {
        btn.className = 'kc-toc-caret-spacer';
      }
      btn.className = (btn.className ? btn.className + ' ' : '') + 'kc-toc-caret-btn';
      if (hasChildren) btn.innerHTML = '<i data-lucide="chevron-right" class="kc-toc-caret"></i>';
      a.insertBefore(btn, a.firstChild);
      if (d > 0) li.classList.add('kc-toc-collapsed');
    });
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    items.forEach(function (li, i) {
      var a = li.querySelector('.dp-toc-i.kc-toc-parent');
      var btn = a && a.querySelector('.kc-toc-caret-btn');
      if (!a || !btn) return;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var opening = !a.classList.contains('kc-toc-open');
        a.classList.toggle('kc-toc-open', opening);
        directChildren(i).forEach(function (j) { items[j].classList.toggle('kc-toc-collapsed', !opening); });
        if (!opening) collapseSubtree(i);
      });
    });
  }
  const KC_TOC_STANDALONE_CSS =
    '.dp-toc-list > li.kc-toc-collapsed{display:none}' +
    '.kc-toc-caret-btn{appearance:none;border:none;background:transparent;flex:none;width:22px;height:22px;margin-inline-end:2px;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:inherit;box-sizing:border-box}' +
    'button.kc-toc-caret-btn{cursor:pointer}button.kc-toc-caret-btn:hover{background:rgba(0,0,0,.06)}' +
    '.kc-toc-caret-spacer{visibility:hidden}' +
    '.kc-toc-caret{width:14px;height:14px;transition:transform .14s ease;stroke:currentColor;pointer-events:none}' +
    '.dp-toc-i.kc-toc-parent.kc-toc-open .kc-toc-caret{transform:rotate(90deg)}' +
    (() => { let s = ''; for (let d = 0; d <= 6; d++) s += '.dp-toc-i.kc-toc-d' + d + '{margin-inline-start:' + (d * 16) + 'px}'; return s; })() +
    '.dp-toc-n{width:34px!important;box-sizing:border-box}';

  // The live app's own nav bar reads "EasyBIM | Knowledge Center · LIVE" —
  // the downloaded page's header (DP.standaloneHTML's dp-runhead) only ever
  // carries the bare EasyBIM logo, with no indication this came from the
  // Knowledge Center specifically. Inserted right after the logo image,
  // styled like the header's own existing title/series text (same CSS
  // custom properties DP.CSS already defines, which the exported file
  // already inlines) rather than inventing a new look.
  function withKcHeaderLabel(html) {
    return html.replace(
      /(<img class="dp-logo"[^>]*>)/,
      '$1<span style="font-family:var(--dp-fh);font-weight:700;font-size:13px;color:var(--dp-navy);white-space:nowrap">Knowledge Center</span>'
    );
  }

  // KC.doDownload('web') (kc-app.js) calls this to build the file it hands
  // off — patch the string it returns before that happens, the same way
  // the live page gets patched after kc-app.js mounts a document, since
  // this one is never mounted into the live page at all.
  function wrapStandaloneHTML() {
    const fn = KC.DocPage && KC.DocPage.standaloneHTML;
    if (typeof fn !== 'function') return false;
    if (fn.__nbWrapped) return true;
    KC.DocPage.standaloneHTML = function (logoDataUrl) {
      const html = withKcHeaderLabel(fn.call(this, logoDataUrl));
      const data = KC.DocPage.data;
      if (!data || !data.toc || !data.toc.length || !KC.DocPage.docDir) return html;
      const dir = KC.DocPage.docDir(data);
      const tocJson = JSON.stringify(data.toc).replace(/</g, '\\u003c');
      // Appended right before </body> — by then DP.tocHTML's markup already
      // exists earlier in the document for kcTocEnhanceStandalone to patch.
      const injected = '<style>' + KC_TOC_STANDALONE_CSS + '</style>' +
        '<script>(' + kcTocEnhanceStandalone.toString() + ')(' + tocJson + ',' + JSON.stringify(dir) + ');<\/script>';
      const bodyClose = html.lastIndexOf('</body>');
      if (bodyClose === -1) return html + injected;
      return html.slice(0, bodyClose) + injected + html.slice(bodyClose);
    };
    KC.DocPage.standaloneHTML.__nbWrapped = true;
    return true;
  }

  // Set just before triggering navigation to a specific line-level bookmark
  // (see KC.openBookmark's wrapper below); consumed the next time a document
  // actually finishes loading, so the scroll-to-line waits for the real
  // content instead of guessing a fixed timeout against a network fetch.
  let _pendingScrollPIdx = null;

  /* ═══════════════ TRANSLATION — real, per-document, not the design example ═══
     kc-app.js's Translation panel (public/kc/kc-app.js, "Test translation of
     the open document (Project Startup)") reads a single hardcoded KC.TR_DOC
     object into a fixed #w1trdoc element — never tied to whichever document
     is actually open, and never re-rendered when it changes. Same class of
     fix as KC.DocPage.data above: fetch this app's own real translation route
     and mutate KC.TR_DOC before calling kc-app.js's own KC.trRender(). Scoped
     to workspace 1 for now (#w1trdoc is the only translation panel in the
     markup — every real document lives there today).
     Translation is a manual, on-demand action (a Gemini call per document,
     not something to fire silently on every drawer open): a button is
     injected into the panel's own header at runtime, next to the existing
     sync/link button (same markup pattern, no template.html edit needed),
     and the panel shows an explicit idle/loading/error state instead of
     going blank while nothing visibly happens. */
  let _trLoading = false;
  let _trCachedFor = null; // sourceId the currently-rendered KC.TR_DOC belongs to

  (function injectTrButtonStyle() {
    if (document.getElementById('kc-tr-style')) return;
    const style = document.createElement('style');
    style.id = 'kc-tr-style';
    // Filled accent style (reusing .sync-btn.locked's own look) so this reads
    // as a distinct action button, not one more outlined icon next to the
    // sync button and the round "close panel" handle at the drawer's edge.
    style.textContent =
      '.kc-tr-btn{background:var(--acc);border-color:var(--acc);color:#fff}' +
      '.kc-tr-btn .lucide{stroke:#fff}' +
      '.kc-tr-btn.kc-tr-spin i{animation:kc-tr-spin .8s linear infinite}' +
      '@keyframes kc-tr-spin{to{transform:rotate(360deg)}}' +
      '.kc-tr-btn[disabled]{opacity:.6;cursor:default}';
    document.head.appendChild(style);
  })();

  function ensureTrButton() {
    const header = document.querySelector('#w1ctr .tr-ch');
    if (!header || header.querySelector('.kc-tr-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sync-btn kc-tr-btn';
    btn.title = 'Translate this document';
    btn.innerHTML = '<i data-lucide="languages"></i>';
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      onTrButtonClick();
    });
    header.insertBefore(btn, header.querySelector('.ls'));
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }
  function setTrButtonState(state) { // 'idle' | 'loading' | 'error'
    const btn = document.querySelector('#w1ctr .kc-tr-btn'); if (!btn) return;
    btn.classList.toggle('kc-tr-spin', state === 'loading');
    btn.disabled = state === 'loading';
    btn.innerHTML = '<i data-lucide="' + (state === 'error' ? 'triangle-alert' : 'languages') + '"></i>';
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }
  function paintTrStatus(html) {
    const host = document.getElementById('w1trdoc'); if (!host) return;
    host.innerHTML = html;
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }
  function renderTrPrompt() {
    paintTrStatus('<div class="tr-meta"><i data-lucide="languages"></i>Click the translate icon above to translate this document</div>');
  }
  function trDrawerOpen() {
    const el = document.getElementById('w1ctr');
    return !!(el && el.classList.contains('open'));
  }
  // Called whenever the panel opens or the open document changes — resets to
  // the idle prompt, unless this exact document's translation is already
  // sitting in KC.TR_DOC from an earlier click (no point re-fetching).
  function resetTrPanel(sourceId) {
    ensureTrButton();
    setTrButtonState('idle');
    if (_trCachedFor === sourceId && KC.TR_DOC) {
      const lang = KC.API.getPref('trLang', 'RU') || 'RU';
      if (KC.trRender) KC.trRender(lang);
    } else {
      renderTrPrompt();
    }
  }
  function onTrButtonClick() {
    if (_trLoading) return;
    const sourceId = KC.DocPage && KC.DocPage.data && KC.DocPage.data.sourceId;
    if (!sourceId) return;
    loadRealTranslation(sourceId);
  }
  function loadRealTranslation(sourceId) {
    const wsEl = document.querySelector('.workspace.active');
    if (!wsEl || wsEl.id !== 'ws1') return; // the panel only exists for ws1 today
    _trLoading = true;
    setTrButtonState('loading');
    paintTrStatus('<div class="tr-meta"><i data-lucide="loader-circle"></i>Translating…</div>');
    fetch('/api/documents/' + encodeURIComponent(sourceId) + '/translate')
      .then(res => res.json())
      .then(data => {
        _trLoading = false;
        if (!data || data.ok === false) {
          setTrButtonState('error');
          paintTrStatus('<div class="tr-meta"><i data-lucide="triangle-alert"></i>Translation unavailable — try again</div>');
          return;
        }
        setTrButtonState('idle');
        _trCachedFor = sourceId;
        KC.TR_DOC = data;
        const lang = KC.API.getPref('trLang', 'RU') || 'RU';
        if (KC.trRender) KC.trRender(lang);
      })
      .catch(() => {
        _trLoading = false;
        setTrButtonState('error');
        paintTrStatus('<div class="tr-meta"><i data-lucide="triangle-alert"></i>Translation unavailable — try again</div>');
      });
  }

  /* Real documents (this app's own /api/documents route, MongoDB-backed) are
     served regardless of the active transport — same-origin, so no need for
     the generic Http/baseUrl machinery. The Local mock below is the fallback
     only for the one legacy demo id, kept for offline/design review. */
  API.getDocument = function (sourceId) {
    return fetch('/api/documents/' + encodeURIComponent(sourceId))
      .then(res => res.json())
      .then(data => {
        if (data && data.status === 'ready' && data.doc && KC.DocPage) {
          KC.DocPage.data = mapToDocPageData(data.doc, sourceId);
          // Timed to run after kc-app.js's own .then(render) has actually
          // mounted the document (a chained .then() runs as a microtask right
          // after this one; setTimeout runs after that, once mount is done).
          setTimeout(syncAllNotebooks, 0);
          setTimeout(applyInferredTocNumbers, 0); // before the two below — both read KC.DocPage.data.toc fresh
          setTimeout(patchTocNumberBadges, 0);
          setTimeout(initTocCollapse, 0);
          setTimeout(alignTocDirection, 0);
          if (_pendingScrollPIdx != null) {
            const pIdx = _pendingScrollPIdx; _pendingScrollPIdx = null;
            setTimeout(() => {
              const wsEl = document.querySelector('.workspace.active');
              const wsIdx = wsEl ? [...document.querySelectorAll('.workspace')].indexOf(wsEl) : -1;
              if (wsIdx >= 0 && window.KC && KC.scrollToLine) KC.scrollToLine(wsIdx, pIdx);
            }, 30);
          }
          // If the Translation drawer is already open (e.g. switching documents
          // while translating), reset it for the newly opened document too —
          // otherwise it would keep showing whichever document was open before.
          if (trDrawerOpen()) resetTrPanel(sourceId);
        }
        return data;
      })
      .catch(err => {
        if (T === Local) {
          const DP = KC.DocPage;
          if (sourceId === 'project-startup' && DP && DP.data) {
            return { status: 'ready', doc: { id: sourceId, sourceId, title: DP.data.title, version: 1, blocks: DP.data.blocks || [] } };
          }
          return { status: 'not_imported', sourceUrl: '' };
        }
        return { status: 'error', message: (err && err.message) || 'request failed' };
      });
  };
  /* Explicit "digest it now" — the "Import into Knowledge Center" button. */
  API.importDocument = function (sourceId) {
    return fetch('/api/documents/' + encodeURIComponent(sourceId) + '/import', { method: 'POST' })
      .then(res => res.json())
      .catch(err => ({ status: 'error', message: (err && err.message) || 'request failed' }));
  };
  /* Apply an approved change to our copy (today the DOM is edited, later this writes). */
  API.applyDocumentChange = function (docId, change) {
    if (T === Local) return Promise.resolve({ ok: true, version: null });
    return T.request('POST', '/documents/' + encodeURIComponent(docId) + '/changes', change);  // TODO(backend)
  };

  /* ═══════════════ EXTERNAL SERVICES (mocked for now) ═══════════════ */
  API.sendDocument = function (payload) {
    if (T === Local) return Promise.resolve({ ok: true, mock: true });
    return T.request('POST', '/sends', payload);            // TODO(backend): SMTP/Graph
  };
  API.askMentor = function (payload) {
    if (T === Local) return Promise.resolve({ ok: true, mock: true, answer: null });
    return T.request('POST', '/mentor/ask', payload);       // TODO(backend): AI
  };
  API.translate = function (payload) {
    if (T === Local) return Promise.resolve({ ok: true, mock: true, text: null });
    return T.request('POST', '/translate', payload);        // TODO(backend): translation
  };

  /* Preload state in http mode so the synchronous getters keep working. */
  API.preload = async function () {
    if (T !== Http) return;
    // TODO(backend): GET /state → fill Http.cache in one response.
  };
})();
