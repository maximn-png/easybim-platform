/* ═══════════════════════════════════════════════════════════════════════════
   kc-states.js — UI STATES (step 7 of the backend handoff plan)

   Every screen the app must show when content is NOT simply there. Built as one
   small set of builders so a state looks the same wherever it appears.

     KC.States.loading(label)              skeleton while a request is in flight
     KC.States.importing(progress, srcId)  the document is being digested
     KC.States.notImported(srcId, url)     not in the Knowledge Center yet
     KC.States.error(message, url)         request or content failure
     KC.States.empty(title, sub, icon)     nothing to show (queue, list, search)
     KC.States.noAccess(what)              signed in, but not permitted
     KC.States.conflict(onReload)          someone else changed it first (409)

   All markup is inert: the only interactive bits call KC.* helpers that live
   here, so a state can be dropped into any column.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const KC = (window.KC = window.KC || {});
  const S = (KC.States = KC.States || {});
  const esc = s => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };

  const CSS = `
.kcs{padding:26px 22px;font-family:var(--font-body,Inter,sans-serif)}
.kcs-mid{display:flex;flex-direction:column;align-items:center;text-align:center;gap:9px;padding:44px 22px}
.kcs-ico{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:#eef2ff;flex:none}
.kcs-ico .lucide{width:21px;height:21px;stroke:#1e248c}
.kcs-ico.warn{background:#fff6e6}.kcs-ico.warn .lucide{stroke:#c98a1e}
.kcs-ico.bad{background:#feecec}.kcs-ico.bad .lucide{stroke:#c2453f}
.kcs-t{font-family:var(--font-display,'Hanken Grotesk',sans-serif);font-size:15px;font-weight:700;color:#1e248c}
.kcs-s{font-size:12.5px;line-height:1.6;color:#6b7280;max-width:46ch}
.kcs-acts{display:flex;gap:8px;margin-top:5px;flex-wrap:wrap;justify-content:center}
.kcs-btn{display:inline-flex;align-items:center;gap:7px;font:600 12px/1 var(--font-body,Inter,sans-serif);padding:9px 14px;border-radius:10px;border:1px solid #e8eaff;background:#fff;color:#1e248c;cursor:pointer;transition:all .16s cubic-bezier(.4,0,.2,1)}
.kcs-btn .lucide{width:14px;height:14px}
.kcs-btn:hover{border-color:transparent;background:linear-gradient(135deg,#1e248c,#44b8d3);color:#fff;box-shadow:0 4px 14px rgba(30,36,140,.18)}
.kcs-btn:hover .lucide{stroke:#fff}
.kcs-btn.ghost:hover{background:#f2f5ff;color:#1e248c;border-color:#e8eaff;box-shadow:none}
.kcs-btn.ghost:hover .lucide{stroke:#1e248c}
/* progress */
.kcs-bar{width:210px;height:5px;border-radius:99px;background:#e8eaff;overflow:hidden;margin-top:4px}
.kcs-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#1e248c,#44b8d3);transition:width .4s cubic-bezier(.4,0,.2,1)}
.kcs-fill.idle{width:35%;animation:kcsSlide 1.4s ease-in-out infinite}
@keyframes kcsSlide{0%{margin-left:-35%}100%{margin-left:100%}}
/* skeleton */
.kcs-sk{display:flex;flex-direction:column;gap:11px}
.kcs-ln{height:12px;border-radius:6px;background:linear-gradient(90deg,#eef1fb 25%,#f7f9ff 37%,#eef1fb 63%);background-size:400% 100%;animation:kcsShim 1.3s ease infinite}
.kcs-ln.h{height:20px;width:52%;margin-bottom:6px}
.kcs-ln.w80{width:80%}.kcs-ln.w64{width:64%}.kcs-ln.w92{width:92%}
.kcs-blk{height:150px;border-radius:14px;margin:6px 0}
@keyframes kcsShim{0%{background-position:100% 0}100%{background-position:0 0}}
.kcs-lab{display:flex;align-items:center;gap:8px;font-size:11.5px;color:#6b7280;margin-bottom:16px}
.kcs-spin{width:13px;height:13px;border-radius:50%;border:2px solid #dfe3ef;border-top-color:#44b8d3;animation:kcsSpin .7s linear infinite}
@keyframes kcsSpin{to{transform:rotate(360deg)}}
/* conflict banner (in-flow, above the document) */
.kcs-conflict{display:flex;align-items:flex-start;gap:10px;margin:0 0 14px;padding:11px 13px;border:1px solid #f5d9a8;background:#fffaf0;border-radius:12px}
.kcs-conflict .lucide{width:16px;height:16px;stroke:#c98a1e;flex:none;margin-top:1px}
.kcs-cmain{flex:1;min-width:0}
.kcs-ct{font-size:12.5px;font-weight:700;color:#8a5a12}
.kcs-cs{font-size:12px;color:#8a5a12;opacity:.85;line-height:1.5;margin-top:2px}`;

  let injected = false;
  S.injectCSS = function (doc) {
    doc = doc || document;
    if (injected && doc === document) return;
    if (doc.getElementById('kc-states-css')) return;
    const st = doc.createElement('style'); st.id = 'kc-states-css'; st.textContent = CSS;
    doc.head.appendChild(st); if (doc === document) injected = true;
  };
  const icons = () => { try { window.lucide && lucide.createIcons(); } catch (e) {} };
  S.paint = function (el, html) { S.injectCSS(el.ownerDocument); el.innerHTML = html; icons(); return el; };

  const mid = (icoClass, ico, title, sub, acts, extra) =>
    '<div class="kcs kcs-mid">' +
      '<div class="kcs-ico ' + icoClass + '"><i data-lucide="' + ico + '"></i></div>' +
      '<div class="kcs-t">' + esc(title) + '</div>' +
      (sub ? '<div class="kcs-s">' + esc(sub) + '</div>' : '') +
      (extra || '') +
      (acts ? '<div class="kcs-acts">' + acts + '</div>' : '') +
    '</div>';

  const btn = (label, ico, onclick, ghost) =>
    '<button class="kcs-btn' + (ghost ? ' ghost' : '') + '" onclick="' + onclick + '">' +
    (ico ? '<i data-lucide="' + ico + '"></i>' : '') + esc(label) + '</button>';

  /* ── loading: a shape-of-the-page skeleton, not a spinner in the void ── */
  S.loading = function (label) {
    return '<div class="kcs">' +
      '<div class="kcs-lab"><span class="kcs-spin"></span><span>' + esc(label || 'Loading…') + '</span></div>' +
      '<div class="kcs-sk">' +
        '<div class="kcs-ln h"></div>' +
        '<div class="kcs-ln w92"></div><div class="kcs-ln w80"></div><div class="kcs-ln w64"></div>' +
        '<div class="kcs-ln kcs-blk"></div>' +
        '<div class="kcs-ln w80"></div><div class="kcs-ln w92"></div>' +
      '</div></div>';
  };

  /* ── importing: the backend is digesting the Google Doc ── */
  S.importing = function (progress, sourceId) {
    const pct = typeof progress === 'number' && progress > 0 ? Math.round(progress * 100) : null;
    const bar = '<div class="kcs-bar"><div class="kcs-fill' + (pct == null ? ' idle' : '') + '"' +
      (pct == null ? '' : ' style="width:' + pct + '%"') + '></div></div>';
    return mid('', 'loader', 'Preparing the document',
      'We are converting it into the Knowledge Center format. This happens once — next time it opens instantly.',
      btn('Check again', 'refresh-cw', "KC.States.retry('" + esc(sourceId || '') + "')", true), bar);
  };

  /* ── not imported yet: offer the import, and the original meanwhile ── */
  S.notImported = function (sourceId, sourceUrl) {
    const acts = btn('Import into Knowledge Center', 'download', "KC.States.doImport('" + esc(sourceId || '') + "')") +
      (sourceUrl ? btn('Open the original', 'external-link', "window.open('" + esc(sourceUrl) + "','_blank','noopener')", true) : '');
    return mid('', 'file-plus-2', 'This document is not in the Knowledge Center yet',
      'It still lives in the old Google Drive centre. Importing brings it in with our formatting, edit proposals, versions and translation.',
      acts);
  };

  /* ── error: something failed; never a blank column ── */
  S.error = function (message, sourceUrl) {
    const acts = btn('Try again', 'refresh-cw', 'location.reload()', true) +
      (sourceUrl ? btn('Open the original', 'external-link', "window.open('" + esc(sourceUrl) + "','_blank','noopener')", true) : '');
    return mid('bad', 'triangle-alert', 'This document could not be opened',
      message || 'The content arrived in an unexpected shape. Please tell the Knowledge Center owner.', acts);
  };

  /* ── empty: a list with nothing in it (review queue, search, journal) ── */
  S.empty = function (title, sub, ico) {
    return mid('', ico || 'inbox', title || 'Nothing here yet', sub || '', '');
  };

  /* ── no access: signed in, but this is not yours ── */
  S.noAccess = function (what) {
    return mid('warn', 'lock', 'You do not have access',
      (what ? what + ' is ' : 'This is ') + 'available to its owner only. Ask a team lead if you think you should see it.', '');
  };

  /* ── conflict: a 409 from an edit made against a stale version ── */
  S.conflictHTML = function (who) {
    return '<div class="kcs-conflict"><i data-lucide="git-compare-arrows"></i><div class="kcs-cmain">' +
      '<div class="kcs-ct">This document changed while you were editing</div>' +
      '<div class="kcs-cs">' + esc(who ? who + ' saved a newer version.' : 'A newer version was saved.') +
      ' Reload to see it, then re-apply your change so nothing is overwritten.</div></div>' +
      '<button class="kcs-btn ghost" onclick="location.reload()"><i data-lucide="refresh-cw"></i>Reload</button></div>';
  };
  S.conflict = function (container, who) {
    if (!container) return;
    S.injectCSS(container.ownerDocument);
    const el = document.createElement('div');
    el.innerHTML = S.conflictHTML(who);
    container.insertBefore(el.firstChild, container.firstChild);
    icons();
  };

  /* ── actions used by the states above ── */
  S.retry = function (sourceId) {
    const node = document.querySelector('.node.active[data-doc="' + sourceId + '"]') ||
                 document.querySelector('.node[data-doc="' + sourceId + '"]');
    if (node && KC.select) KC.select(node); else location.reload();
  };
  S.doImport = function (sourceId) {
    const host = document.querySelector('.workspace.active .c2 .kc-docpage');
    if (host) S.paint(host, S.importing(0, sourceId));
    KC.API.importDocument(sourceId).then(() => {
      if (KC.toast) KC.toast('Import started — this can take a minute');
    }).catch(() => {
      if (host) S.paint(host, S.error('The import could not be started.'));
    });
  };

  /* Preview any state during design review: KC.States.demo('importing') */
  S.demo = function (name, arg) {
    const host = document.querySelector('.workspace.active .c2 .kc-docpage') ||
                 document.querySelector('.workspace.active .c2 .cb');
    if (!host) return 'no textbook column';
    const map = {
      loading: () => S.loading('Opening the document…'),
      importing: () => S.importing(arg == null ? 0.35 : arg, 'project-startup'),
      notImported: () => S.notImported('project-startup', 'https://docs.google.com/'),
      error: () => S.error(arg || ''),
      empty: () => S.empty('Nothing to review', 'New proposals will appear here.'),
      noAccess: () => S.noAccess('This notebook')
    };
    if (name === 'conflict') { S.conflict(host, arg || 'Gal Shem Tov'); return 'ok'; }
    if (!map[name]) return 'states: ' + Object.keys(map).join(', ') + ', conflict';
    S.paint(host, map[name]());
    return 'ok';
  };
})();
