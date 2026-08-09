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

   STORAGE KEY → FUTURE ENDPOINT MAP (draft for step 4)
   ----------------------------------------------------
   kc_role            → GET/PUT  /me/role                (current user's role)
   kc_docs            → GET/PUT  /documents/custom/:id   (personal documents)
   kc_note_<wsId>     → GET/PUT  /notebooks/:workspace   (notebook)
   kc_suggestions     → GET/POST /suggestions            (change proposals)
   kc_assign          → GET/POST /assignments            (assignments to interns)
   kc_bookmarks       → GET/PUT  /bookmarks              (sticky-note bookmarks)
   kc_mentor          → GET/PUT  /mentor/threads         (chat history)
   kc_dict_prefs      → GET/PUT  /me/preferences         (dictionary preferences)
   kc_tr_lang/kc_tr_off → GET/PUT /me/preferences        (translation preferences)
   kc_docpage_versions→ GET      /documents/:id/versions (version log)
   kc_send_log        → GET/POST /sends                  (send journal)
   (tree structure)   → GET      /tree                   (one-way sync from Monday)
   (document)         → GET      /documents/:sourceId    (digested copy)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const KC = (window.KC = window.KC || {});
  const API = (KC.API = KC.API || {});

  /* ── every storage key in one place ──────────────────────────────────── */
  const K = API.KEYS = {
    role: 'kc_role',
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
    sendLog: 'kc_send_log'
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

  /* ═══════════════ ROLE AND PERSONAL PREFERENCES ═══════════════ */
  API.getRole = function () {
    let r = T.getRaw(K.role) || 'intern';
    if (r === 'admin') r = 'teamlead';           // migrate the legacy value
    return r;
  };
  API.setRole = function (role) { T.setRaw(K.role, role); };

  API.getPref = function (name, fallback) {
    if (name === 'trLang') return T.getRaw(K.trLang) || fallback || 'RU';
    if (name === 'translationEnabled') return T.getRaw(K.trOff) !== '1';
    if (name === 'dict') return T.get(K.dictPrefs, fallback || {});
    return fallback;
  };
  API.setPref = function (name, value) {
    if (name === 'trLang') return T.setRaw(K.trLang, value);
    if (name === 'translationEnabled') return T.setRaw(K.trOff, value ? '0' : '1');
    if (name === 'dict') return T.set(K.dictPrefs, value);
  };

  /* ═══════════════ PERSONAL DOCUMENTS (custom nodes) ═══════════════ */
  API.getCustomDocs = function () { return T.get(K.docs, {}); };
  API.saveCustomDocs = function (map) { return T.set(K.docs, map); };

  /* ═══════════════ NOTEBOOK ═══════════════ */
  API.getNote = function (wsId) { return T.getRaw(K.note(wsId)); };
  API.saveNote = function (wsId, html) { return T.setRaw(K.note(wsId), html); };

  /* ═══════════════ CHANGE PROPOSALS ═══════════════ */
  API.listSuggestions = function () { return T.get(K.suggestions, []); };
  API.saveSuggestions = function (arr) { return T.set(K.suggestions, arr); };
  API.addSuggestion = function (rec) { const a = API.listSuggestions(); a.push(rec); API.saveSuggestions(a); return rec; };
  API.removeSuggestion = function (id) { API.saveSuggestions(API.listSuggestions().filter(s => s.id !== id)); };

  /* ═══════════════ ASSIGNMENTS TO INTERNS ═══════════════ */
  API.listAssignments = function () { return T.get(K.assignments, []); };
  API.saveAssignments = function (arr) { return T.set(K.assignments, arr); };

  /* ═══════════════ BOOKMARKS ═══════════════ */
  API.listBookmarks = function () { const v = T.get(K.bookmarks, []); return Array.isArray(v) ? v : []; };
  API.saveBookmarks = function (arr) { return T.set(K.bookmarks, arr); };

  /* ═══════════════ MENTOR ═══════════════ */
  API.getMentorThreads = function () { return T.get(K.mentor, {}); };
  API.saveMentorThreads = function (obj) { return T.set(K.mentor, obj); };

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
  API.getDocument = function (sourceId) {
    if (T === Local) {
      const DP = KC.DocPage;
      if (sourceId === 'project-startup' && DP && DP.data) {
        return Promise.resolve({ status: 'ready', doc: { id: sourceId, sourceId, title: DP.data.title, version: 1, blocks: DP.data.blocks || [] } });
      }
      return Promise.resolve({ status: 'not_imported', sourceUrl: '' });
    }
    return T.request('GET', '/documents/' + encodeURIComponent(sourceId));  // TODO(backend)
  };
  /* Explicit "digest it now" — the "Import into Knowledge Center" button. */
  API.importDocument = function (sourceId) {
    if (T === Local) return Promise.resolve({ status: 'importing', progress: 0 });
    return T.request('POST', '/documents/' + encodeURIComponent(sourceId) + '/import');  // TODO(backend)
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
