/* ============================================================
   EasyBIM Knowledge Center — tree renderer + interactions
   Depends on: window.KC_TREE (kc-data.js), lucide
   ============================================================ */
(function(){
  const TREE = window.KC_TREE || {};
  const WS = [['ws0','w0ptree'],['ws1','w1ptree'],['ws2','w2ptree']];

  /* ── Roles: single codebase, free switching during design ──
     Common UI lives in one file; per-role differences are described here
     (and in body.role-* CSS), never by forking the file. */
  const DEFAULT_IDENTITY = { name:'Polina Eisenshtadt', mail:'polina@easybim.co.il', initials:'PE' };
  const ROLES = {
    intern:   { label:'Onboarding', icon:'sprout',        progress:true,  markDone:true,  mentorStart:'topic'     },
    employee: { label:'Employee',  icon:'briefcase',      progress:false, markDone:false, mentorStart:'assistant' },
    teamlead: { label:'Team Lead', icon:'user-cog',       progress:false, markDone:false, mentorStart:'assistant',
                identity:{ name:'Gal Shem Tov', mail:'gal@easybim.co.il', initials:'GS' } },
  };
  let ROLE = 'intern';
  try{ const r=window.KC.API.getRole(); if(r&&ROLES[r]) ROLE=r; }catch(e){}

  function esc(s){ const d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  function icons(){ if(window.lucide&&lucide.createIcons) lucide.createIcons(); }

  /* normalize a raw node into {name, children, status, custom, muted} */
  function norm(n){
    if(typeof n==='string') return {name:n};
    if(Array.isArray(n)) return {name:n[0], children:n[1]};
    return {name:n.n, children:n.c, status:n.s, custom:!!n.custom, muted:!!n.muted, doc:n.doc, video:n.video, descEn:n.descEn, descHe:n.descHe};
  }

  const menuBtn = '<button class="row-menu" onclick="KC.menu(event,this)" title="Manage"><i data-lucide="more-vertical"></i></button>';

  /* build DOM for a single node */
  function buildNode(raw, depth, inheritCustom){
    const n = norm(raw);
    const node = document.createElement('div');
    const isCustom = n.custom || !!inheritCustom;
    node.className = 'node' + (isCustom?' custom':'');
    node.dataset.depth = depth;
    if(n.doc) node.dataset.doc = n.doc;
    if(n.video){ node.dataset.video = n.video; if(n.descEn) node.dataset.descEn = n.descEn; if(n.descHe) node.dataset.descHe = n.descHe; }
    const hasKids = Array.isArray(n.children);
    const realCount = hasKids ? n.children.filter(c=>!(c && typeof c==='object' && !Array.isArray(c) && c.muted)).length : 0;

    const row = document.createElement('div');
    row.className = 'row ' + (hasKids?'branch':'leaf') + ' depth'+depth + (n.muted?' row-muted':'') + (!hasKids && n.status==='done'?' done':'');

    const mineMark = isCustom?'<span class="cbadge" title="My own — added by me"><i data-lucide="folder-heart"></i></span>':'';
    if(hasKids){
      row.setAttribute('onclick','KC.toggle(this)');
      row.innerHTML =
        '<span class="tw"><i data-lucide="chevron-down"></i></span>'+
        mineMark+
        '<span class="row-name" dir="auto">'+esc(n.name)+'</span>'+
        menuBtn;
    } else {
      if(!n.muted) row.setAttribute('onclick','KC.select(this)');
      const lead = n.muted
        ? '<span class="lead"><span class="dot-plus">+</span></span>'
        : '<span class="lead"><span class="dot '+(n.status||'todo')+'"></span></span>';
      row.innerHTML =
        lead+
        mineMark+
        '<span class="row-name" dir="auto">'+esc(n.name)+'</span>'+
        (n.muted?'':menuBtn);
    }
    node.appendChild(row);

    // top-level blocks carry a thin progress bar (intern only, hidden by CSS for other roles)
    if(hasKids && depth===0){
      const bar=document.createElement('div');
      bar.className='blk-bar';
      bar.innerHTML='<span class="blk-fill" style="width:0%"></span>';
      node.appendChild(bar);
    }
    if(hasKids){
      const kids = document.createElement('div');
      kids.className = 'kids' + (depth>=1?' collapsed':'');
      n.children.forEach(c=>kids.appendChild(buildNode(c, depth+1, isCustom)));
      if(n.custom || n.children.length===0){
        const add = document.createElement('button');
        add.className='add-row';
        add.setAttribute('onclick','KC.addChild(this)');
        add.innerHTML='<i data-lucide="plus"></i>Add my sub-topic';
        kids.appendChild(add);
      }
      node.appendChild(kids);
      if(depth>=1) row.querySelector('.tw').classList.add('c');
    }
    return node;
  }

  /* render a whole workspace tree */
  function renderTree(wsKey, treeId){
    const tree = document.getElementById(treeId);
    if(!tree) return;
    tree.innerHTML='';
    (TREE[wsKey]||[]).forEach(raw=>tree.appendChild(buildNode(raw,0)));
  }

  /* progress = done leaves / total real leaves */
  function updateProgress(idx){
    const treeId = WS[idx][1];
    const tree = document.getElementById(treeId);
    if(!tree) return;
    const dots = [...tree.querySelectorAll('.row.leaf:not(.row-muted) .dot')].filter(d=>!d.closest('.node.custom'));
    const total = dots.length;
    let done=0; dots.forEach(d=>{ if(d.classList.contains('done')) done++; });
    const pct = total? Math.round(done/total*100) : 0;
    const set=(id,v)=>{const e=document.getElementById(id); if(e)e.textContent=v;};
    set('w'+idx+'pct', pct+'%');
    set('w'+idx+'cnt', done+' / '+total);
    const pf=document.getElementById('w'+idx+'pf'); if(pf)pf.style.width=pct+'%';
    computeBlockBars(tree);
    // workspace switcher percentages (every ws-nav shows all three)
    document.querySelectorAll('.ws-nav').forEach(nav=>{
      const items=nav.querySelectorAll('.ws-item');
      if(items[idx]){ const p=items[idx].querySelector('.ws-ipct'); if(p)p.textContent=pct+'%'; }
    });
  }
  function updateAll(){ WS.forEach((_,i)=>updateProgress(i)); }


  /* block-level progress bars — % of descendant leaves done, only on top-level blocks */
  function computeBlockBars(tree){
    tree.querySelectorAll(':scope > .node').forEach(node=>{
      const row=node.querySelector(':scope > .row'); if(!row || !row.classList.contains('branch')) return;
      const bar=node.querySelector(':scope > .blk-bar'); if(!bar) return;
      const fill=bar.querySelector('.blk-fill'); if(!fill) return;
      if(node.classList.contains('custom')){ bar.style.display='none'; return; } // custom folders aren't tracked
      const dots=[...node.querySelectorAll('.kids .dot')].filter(d=>!d.closest('.node.custom'));
      let total=0,done=0;
      dots.forEach(dt=>{ total++; if(dt.classList.contains('done'))done++; });
      const p= total? Math.round(done/total*100):0;
      fill.style.width=p+'%';
      bar.title = total? (done+' / '+total+' done') : 'No topics yet';
    });
  }

  /* ── interactions ── */
  /* share the ONE global namespace with kc-api.js (loaded first) — never shadow it */
  const KC = window.KC = window.KC || {};
  KC.role = ROLE; KC.ROLES = ROLES;

  /* pure progress data for a workspace (done leaves/total + per top-level block),
     read from the live tree DOM — used by the cabinet accordion, the big overall
     plaque, and the Team Lead's per-intern cards (which mirror the intern's view). */
  KC.progressData = function(wsIdx){
    const tree=document.getElementById(WS[wsIdx][1]);
    if(!tree) return {pct:0,done:0,total:0,subs:[]};
    const dots=[...tree.querySelectorAll('.row.leaf:not(.row-muted) .dot')].filter(d=>!d.closest('.node.custom'));
    let total=0,done=0; dots.forEach(d=>{ total++; if(d.classList.contains('done'))done++; });
    const subs=[];
    tree.querySelectorAll(':scope > .node').forEach(node=>{
      if(node.classList.contains('custom')) return; // custom (user) folders aren't assigned material
      const nameEl=node.querySelector(':scope > .row .row-name'); if(!nameEl) return;
      const sd=[...node.querySelectorAll('.dot')].filter(d=>!d.closest('.node.custom')); let t=0,dn=0;
      sd.forEach(d=>{ t++; if(d.classList.contains('done'))dn++; });
      subs.push({ name:nameEl.textContent.trim(), pct: t?Math.round(dn/t*100):0 });
    });
    return { pct: total?Math.round(done/total*100):0, done, total, subs };
  };
  /* overall % across all workspaces (leaves done / leaves total) */
  KC.overallPct = function(){
    let total=0,done=0;
    WS.forEach((_,i)=>{ const d=KC.progressData(i); total+=d.total; done+=d.done; });
    return total?Math.round(done/total*100):0;
  };
  KC.switchRole = function(role){ if(!ROLES[role]) return; KC.API.setRole(role); location.reload(); };
  /* reflect the active role in the cabinet header dropdown */
  KC.applyRoleUI = function(){
    const cfg = ROLES[ROLE]; if(!cfg) return;
    const lbl=document.getElementById('roleDDLabel'); if(lbl) lbl.textContent=cfg.label;
    const ic=document.getElementById('roleDDIcon'); if(ic){ ic.innerHTML='<i data-lucide="'+cfg.icon+'"></i>'; }
    document.querySelectorAll('.role-dd-opt').forEach(b=>b.classList.toggle('on', b.dataset.role===ROLE));
    // identity swap (Team Lead is Gal Shem Tov; others default to Polina)
    const id = cfg.identity || DEFAULT_IDENTITY;
    const nm=document.querySelector('#userPop .up-name'); if(nm) nm.textContent=id.name;
    const ml=document.querySelector('#userPop .up-mail'); if(ml) ml.textContent=id.mail;
    const av1=document.getElementById('upAv'); if(av1 && !av1.classList.contains('has-photo')) av1.textContent=id.initials;
    const av2=document.getElementById('navUser'); if(av2 && !av2.classList.contains('has-photo')) av2.textContent=id.initials;
    KC.identity = id;
    if(window.lucide&&lucide.createIcons) lucide.createIcons();
  };

  /* ── catalog helpers used by the Team Lead console ── */
  KC.treeChildren = function(wsIdx, names){
    try{
      const key = WS[wsIdx] && WS[wsIdx][0];
      let list = window.KC_TREE && window.KC_TREE[key];
      if(!Array.isArray(list)) return [];
      const nameOf = n => Array.isArray(n)?n[0]:(typeof n==='string'?n:(n&&n.n));
      const kidsOf = n => Array.isArray(n)?(n[1]||[]):((n&&n.c)||[]);
      for(const pn of (names||[])){
        const found = list.find(n=>nameOf(n)===pn);
        if(!found) return [];
        list = kidsOf(found);
      }
      return list.map(nameOf).filter(Boolean);
    }catch(e){ return []; }
  };
  KC.publishToTree = function(wsIdx, parentNames, nodeName){
    try{
      const key = WS[wsIdx] && WS[wsIdx][0];
      const treeId = WS[wsIdx] && WS[wsIdx][1];
      let list = window.KC_TREE && window.KC_TREE[key];
      if(!key || !Array.isArray(list)) return false;
      const nameOf = n => Array.isArray(n)?n[0]:(typeof n==='string'?n:(n&&n.n));
      const kidsRef = n => {
        if(Array.isArray(n)){ if(!Array.isArray(n[1])) n[1]=[]; return n[1]; }
        if(n && typeof n==='object'){ if(!Array.isArray(n.c)) n.c=[]; return n.c; }
        return null;
      };
      for(const pn of (parentNames||[])){
        const found = list.find(n=>nameOf(n)===pn);
        const kids = found && kidsRef(found);
        if(!kids) return false;
        list = kids;
      }
      if(!list.some(n=>nameOf(n)===nodeName)) list.push({n:nodeName, s:'todo'});
      renderTree(key, treeId); updateAll();
      return true;
    }catch(e){ return false; }
  };

  KC.toggle = function(rowEl){
    if(window.event){ const t=window.event.target; if(t.closest('.row-menu')) return; }
    const kids = rowEl.parentElement.querySelector(':scope > .kids');
    const tw = rowEl.querySelector('.tw');
    if(!kids) return;
    const collapsed = kids.classList.toggle('collapsed');
    if(tw) tw.classList.toggle('c', collapsed);
  };

  KC.select = function(rowEl){
    if(window.event){ const t=window.event.target; if(t.closest('.row-menu')) return; }
    const tree = rowEl.closest('.tree');
    tree.querySelectorAll('.row.sel').forEach(r=>r.classList.remove('sel'));
    rowEl.classList.add('sel');
    const nm=rowEl.querySelector('.row-name'); if(nm) KC.setResume(tree.id, nm.textContent.trim());
    // custom (user) documents open in an editable Textbook page; official topics keep their static page
    const node=rowEl.closest('.node');
    const ws=rowEl.closest('.workspace');
    if(node && node.classList.contains('custom')) openCustomDoc(ws, node);
    else if(node && node.dataset.doc) openDocPage(ws, node);
    else if(node && node.dataset.video) openVideoPage(ws, node);
    else closeCustomDoc(ws);
  };

  /* official video page — a leaf whose kc-data.js node carries a `video`
     Google Drive file id (scripts/digestRevitVideos.ts fills these in from
     the Monday "Revit" > "Videos" group). Unlike openDocPage there's no
     digested content to fetch — just embed Drive's own preview player and
     show the bilingual description the board already carries alongside
     the file, so this renders synchronously with no KC.API round-trip. */
  function openVideoPage(ws, node){
    const cb=ws.querySelector('.c2 .cb'); if(!cb) return;
    const c2=ws.querySelector('.c2'); if(c2 && c2.classList.contains('slim') && window.xp) xp(c2.id);
    cb.querySelectorAll('.kc-doc').forEach(e=>e.remove());
    [...cb.children].forEach(el=>{ if(!el.classList.contains('kc-doc')) el.classList.add('kc-doc-hidden'); });
    const driveId=node.dataset.video;
    const title=(node.querySelector(':scope > .row .row-name')||{}).textContent.trim()||'Video';
    const path=nodePath(node);
    const bc=path.map((p,i)=>(i?'<i data-lucide="chevron-right"></i>':'')+'<span'+(i===path.length-1?' class="bc-cur"':'')+'>'+esc(p)+'</span>').join('');
    const descEn=node.dataset.descEn||'', descHe=node.dataset.descHe||'';
    const wrap=document.createElement('div'); wrap.className='kc-doc kc-video-page';
    wrap.innerHTML=
      '<div class="bcrumb">'+bc+'</div>'+
      '<h1 class="kc-video-title">'+esc(title)+'</h1>'+
      '<div class="kc-video-frame"><iframe src="https://drive.google.com/file/d/'+attr(driveId)+'/preview" allow="autoplay" allowfullscreen loading="lazy"></iframe></div>'+
      '<a class="kc-video-openin" href="https://drive.google.com/file/d/'+attr(driveId)+'/view" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>Open in Google Drive</a>'+
      (descEn?'<p class="kc-video-desc" dir="ltr">'+esc(descEn)+'</p>':'')+
      (descHe?'<p class="kc-video-desc" dir="rtl">'+esc(descHe)+'</p>':'');
    cb.insertBefore(wrap, cb.firstChild);
    cb.scrollTop=0;
    icons();
  }

  /* official rich document page (KC.DocPage) rendered in the Textbook.
     Goes through KC.API.getDocument, so the four document states
     (ready / importing / not_imported / error) are real, not hypothetical. */
  function openDocPage(ws, node){
    if(!ws || !window.KC || !KC.DocPage) return;
    const cb=ws.querySelector('.c2 .cb'); if(!cb) return;
    const c2=ws.querySelector('.c2'); if(c2 && c2.classList.contains('slim') && window.xp) xp(c2.id);
    cb.querySelectorAll('.kc-doc').forEach(e=>e.remove());
    [...cb.children].forEach(el=>{ if(!el.classList.contains('kc-doc')) el.classList.add('kc-doc-hidden'); });
    const wrap=document.createElement('div'); wrap.className='kc-doc kc-docpage'; wrap.dataset.doc=node.dataset.doc;
    cb.insertBefore(wrap, cb.firstChild);
    cb.scrollTop=0;
    const srcId=node.dataset.doc, S=KC.States;
    if(S) S.paint(wrap, S.loading('Opening the document\u2026'));
    const render=res=>{
      if(!wrap.isConnected) return;                 // the user already moved on
      const st=(res&&res.status)||'error';
      if(st==='ready' || !S){ mountDocPage(wrap, cb); return; }
      if(st==='importing') S.paint(wrap, S.importing(res.progress, srcId));
      else if(st==='not_imported') S.paint(wrap, S.notImported(srcId, res.sourceUrl));
      else S.paint(wrap, S.error(res&&res.message, res&&res.sourceUrl));
    };
    if(KC.API&&KC.API.getDocument) KC.API.getDocument(srcId).then(render).catch(()=>render(null));
    else mountDocPage(wrap, cb);
  }
  function mountDocPage(wrap, cb){
    KC.DocPage.mount(wrap, {mode:'textbook'});
    KC.DocPage.loadLogo && KC.DocPage.loadLogo();
    KC.DocPage.loadFigures && KC.DocPage.loadFigures();
    icons();
    if(KC.setupDocBookmarks) KC.setupDocBookmarks(cb);
  }

  /* ── Editable custom documents in the Textbook ─────────────────────────
     Only user (custom) nodes are editable; official topics keep their page.
     Body + title persist per node in localStorage (kc_docs), saved via Save. */
  const DOC_KEY='kc_docs';
  KC.loadDocs=function(){ return KC.API.getCustomDocs(); };
  KC.saveDocs=function(d){ KC.API.saveCustomDocs(d); };
  function docIdFor(ws, node){ return (ws?ws.id:'ws')+'::'+nodePath(node).join('›'); }
  /* ── authorship plaque (backlog #9) ── */
  KC.initialsOf=function(name){ if(!name) return '?'; const p=(''+name).trim().split(/\s+/); return ((p[0]?p[0][0]:'')+(p[1]?p[1][0]:'')).toUpperCase()||'?'; };
  KC.fmtDate=function(ts){ try{ const d=ts?new Date(ts):new Date(); if(isNaN(d)) return String(ts); return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); }catch(e){ return ''; } };
  KC.bylineHTML=function(m){
    m=m||{};
    const item=(lbl,name,dateTxt)=>'<span class="kc-by-item"><span class="kc-by-av">'+esc(KC.initialsOf(name))+'</span>'
      +'<span class="kc-by-txt"><span class="kc-by-lbl">'+esc(lbl)+'</span>'
      +'<span class="kc-by-name">'+esc(name||'—')+' · <time>'+esc(dateTxt)+'</time></span></span></span>';
    let h='<div class="kc-byline">';
    h+=item('Created', m.createdBy, m.createdAt?KC.fmtDate(m.createdAt):'Draft');
    if(m.editedBy && (m.editedAt!==m.createdAt || m.editedBy!==m.createdBy)) h+='<span class="kc-by-sep"></span>'+item('Last updated', m.editedBy, KC.fmtDate(m.editedAt));
    h+='</div>';
    return h;
  };
  const DOC_TOOLBAR=
    '<button onmousedown="return KC.dfmt(event,\'bold\')" title="Bold"><b>B</b></button>'+
    '<button onmousedown="return KC.dfmt(event,\'italic\')" title="Italic"><i>I</i></button>'+
    '<button onmousedown="return KC.dfmt(event,\'underline\')" title="Underline"><u>U</u></button>'+
    '<span class="nfmt-sep"></span>'+
    '<button onmousedown="return KC.dfmt(event,\'insertUnorderedList\')" title="Bullet list"><i data-lucide="list"></i></button>'+
    '<button onmousedown="return KC.dfmt(event,\'insertOrderedList\')" title="Numbered list"><i data-lucide="list-ordered"></i></button>'+
    '<button onmousedown="return KC.dcheck(event,this)" title="Checklist item"><i data-lucide="list-checks"></i></button>'+
    '<button onclick="KC.dimg(this)" title="Insert image"><i data-lucide="image-plus"></i></button>'+
    '<button onclick="KC.dInsertCard(this)" title="Insert link card"><i data-lucide="link-2"></i></button>';
  function closeCustomDoc(ws){
    if(!ws) return; const cb=ws.querySelector('.c2 .cb'); if(!cb) return;
    cb.querySelectorAll('.kc-doc').forEach(e=>e.remove());
    cb.querySelectorAll('.kc-doc-hidden').forEach(e=>e.classList.remove('kc-doc-hidden'));
    if(KC.applyLineBk) KC.applyLineBk();
  }
  function openCustomDoc(ws, node){
    if(!ws||!node) return; const cb=ws.querySelector('.c2 .cb'); if(!cb) return;
    const c2=ws.querySelector('.c2'); if(c2 && c2.classList.contains('slim') && window.xp) xp(c2.id);
    cb.querySelectorAll('.kc-doc').forEach(e=>e.remove());
    [...cb.children].forEach(el=>{ if(!el.classList.contains('kc-doc')) el.classList.add('kc-doc-hidden'); });
    const id=docIdFor(ws, node);
    const docs=KC.loadDocs(); const saved=docs[id];
    const title=saved?saved.title:(node.querySelector(':scope > .row .row-name')?.textContent.trim()||'Untitled');
    const bodyHtml=saved?saved.html:(node._noteSnapshot || '<p></p>');
    const path=nodePath(node);
    const bc=path.map((p,i)=>(i?'<i data-lucide="chevron-right"></i>':'')+'<span'+(i===path.length-1?' class="bc-cur"':'')+'>'+esc(p)+'</span>').join('');
    const meta = saved ? {createdBy:saved.createdBy, createdAt:saved.createdAt, editedBy:saved.editedBy, editedAt:saved.editedAt} : {};
    if(!meta.createdBy){ const idn=KC.identity||DEFAULT_IDENTITY; meta.createdBy=idn.name; }
    const wrap=document.createElement('div'); wrap.className='kc-doc'; wrap.dataset.docid=id;
    wrap.innerHTML=
      '<div class="note-bar kc-doc-bar">'+DOC_TOOLBAR+'<button class="note-save" onclick="KC.saveDoc(this)"><i data-lucide="check"></i>Save</button></div>'+
      '<div class="bcrumb">'+bc+'</div>'+
      KC.bylineHTML(meta)+
      '<input class="kc-doc-title" value="'+attr(title)+'" placeholder="Document title">'+
      '<div class="note-doc kc-doc-body" contenteditable="true" data-ph="Write the document…">'+bodyHtml+'</div>';
    cb.insertBefore(wrap, cb.firstChild);
    cb.scrollTop=0; icons();
    KC.setupDocBookmarks(cb);
  }
  KC.saveDoc=function(btn){
    const wrap=btn.closest('.kc-doc'); if(!wrap) return;
    const id=wrap.dataset.docid;
    const title=(wrap.querySelector('.kc-doc-title')?.value||'').trim()||'Untitled';
    const bodyEl=wrap.querySelector('.kc-doc-body');
    let html='';
    if(bodyEl){ const clone=bodyEl.cloneNode(true);
      clone.querySelectorAll('.kc-bm,.kc-tab').forEach(b=>b.remove());
      clone.querySelectorAll('[data-pidx]').forEach(e=>{ e.removeAttribute('data-pidx'); e.classList.remove('bk-set','bk-l','bk-r'); e.style.position=''; if(!e.getAttribute('style')) e.removeAttribute('style'); });
      html=clone.innerHTML;
    }
    const docs=KC.loadDocs(); const prev=docs[id]||{}; const idn=KC.identity||DEFAULT_IDENTITY; const now=Date.now();
    docs[id]={title, html, createdBy:prev.createdBy||idn.name, createdAt:prev.createdAt||now, editedBy:idn.name, editedAt:now};
    KC.saveDocs(docs);
    const by=wrap.querySelector('.kc-byline'); if(by){ const tmp=document.createElement('div'); tmp.innerHTML=KC.bylineHTML(docs[id]); by.replaceWith(tmp.firstChild); }
    toast('Saved');
  };
  /* plain Save for a Notebook doc (persists the free-writing draft per workspace) */
  KC.saveNote=function(btn){
    const ws=btn.closest('.workspace'); const ci=btn.closest('.ci'); if(!ci) return;
    const doc=ci.querySelector('.note-doc'); if(!doc) return;
    KC.API.saveNote(ws?ws.id:'x', doc.innerHTML);
    toast('Notes saved');
  };
  /* silent autosave for the Notebook draft (debounced, with a subtle header status) */
  KC._nbTimers={};
  KC.autoSaveNote=function(doc){
    const ws=doc.closest('.workspace'); if(!ws) return;
    const st=ws.querySelector('.c3 .nb-status'), t=st&&st.querySelector('.nb-t');
    if(st){ st.classList.add('saving'); if(t) t.textContent='Saving…'; }
    clearTimeout(KC._nbTimers[ws.id]);
    KC._nbTimers[ws.id]=setTimeout(function(){
      KC.API.saveNote(ws.id, doc.innerHTML);
      if(st){ st.classList.remove('saving'); if(t) t.textContent='Saved'; }
    }, 650);
  };

  /* jump from a breadcrumb to the matching node in column 1 */
  KC.goTo = function(treeId, name){
    const tree=document.getElementById(treeId); if(!tree) return;
    // make sure the Plan column is expanded
    const planCol = tree.closest('.col'); if(planCol && planCol.classList.contains('slim')){ const id=planCol.id; if(id&&window.xp) xp(id); }
    const target=[...tree.querySelectorAll('.row-name')].find(r=>r.textContent.trim()===name);
    if(!target) return;
    const row=target.closest('.row');
    // expand all ancestor branches
    let p=row.parentElement;
    while(p && p!==tree){
      if(p.classList.contains('kids')){ p.classList.remove('collapsed'); const tw=p.parentElement.querySelector(':scope > .row .tw'); if(tw) tw.classList.remove('c'); }
      p=p.parentElement;
    }
    // select + reveal
    tree.querySelectorAll('.row.sel').forEach(s=>s.classList.remove('sel'));
    row.classList.add('sel');
    const cb=tree.closest('.cb');
    if(cb){ const rb=row.getBoundingClientRect(), cbb=cb.getBoundingClientRect(); cb.scrollTop += (rb.top - cbb.top) - 90; }
    row.classList.add('flash-row'); setTimeout(()=>row.classList.remove('flash-row'), 1100);
    KC.setResume(treeId, name);
  };

  /* context menu */
  let curNode=null;
  KC.menu = function(ev, btn){
    ev.stopPropagation();
    curNode = btn.closest('.node');
    const isCustom = curNode.classList.contains('custom');
    const isLeaf = curNode.querySelector(':scope > .row').classList.contains('leaf');
    const name = curNode.querySelector(':scope > .row .row-name').textContent;
    const done = isLeaf && curNode.querySelector(':scope > .row .dot.done');
    const treeId = (curNode.closest('.tree')||{}).id || '';
    KC._bk = {treeId, name};
    const bk = KC.isBookmarked(treeId, name);
    const m = document.getElementById('ctxmenu');
    let html = '<div class="ctx-h">'+esc(name)+'</div>';
    if(isLeaf && ROLES[ROLE].markDone) html += '<button onclick="KC.toggleDone()"><i data-lucide="'+(done?'circle':'check-circle-2')+'"></i>'+(done?'Mark as not done':'Mark as done')+'</button>';
    html += '<button onclick="KC.addChild()"><i data-lucide="plus"></i>Add my sub-topic</button>';
    if(!isCustom) html += '<button onclick="KC.duplicate()"><i data-lucide="copy"></i>Duplicate to edit</button>';
    html += '<button onclick="KC.bkToggle()"><i data-lucide="'+(bk?'bookmark-check':'bookmark-plus')+'"></i>'+(bk?'Remove bookmark':'Add to bookmarks')+'</button>';
    html += '<button onclick="KC.dlNode()"><i data-lucide="download"></i>Download'+(isLeaf?'':' (.zip)')+'</button>';
    if(isCustom){
      html += '<button onclick="KC.rename()"><i data-lucide="pencil"></i>Rename</button>';
      html += '<button class="ctx-suggest" onclick="KC.suggest()"><i data-lucide="sparkles"></i>Suggest to Knowledge Center</button>';
      html += '<hr><button class="danger" onclick="KC.del()"><i data-lucide="trash-2"></i>Delete</button>';
    }
    if(ROLE==='teamlead'){
      const rowEl=curNode.querySelector(':scope > .row');
      const sid=rowEl && rowEl.getAttribute('data-sugid');
      const wsIdx=WS.findIndex(w=>w[1]===treeId);
      KC._menuCtx={ treeId, title:name, ws:wsIdx, path:nodePath(curNode) };
      html += '<hr>';
      if(sid){
        html += '<button onclick="KC.closeMenu();KC.TL.reviewFromTree('+sid+')"><i data-lucide="eye"></i>Review in context</button>';
        html += '<button onclick="KC.closeMenu();KC.TL.act('+sid+',&#39;approve&#39;)"><i data-lucide="check"></i>Approve suggestion</button>';
        html += '<button class="danger" onclick="KC.closeMenu();KC.TL.act('+sid+',&#39;reject&#39;)"><i data-lucide="x"></i>Reject suggestion</button>';
        html += '<hr>';
      }
      const interns=(KC.TL&&KC.TL.interns)?KC.TL.interns():[];
      html += '<button class="ctx-assign-tog" onclick="KC.toggleAssignSub(this)"><i data-lucide="user-plus"></i>Add to onboarding plan<i data-lucide="chevron-right" class="ctx-more"></i></button>';
      html += '<div class="ctx-sub">';
      if(!interns.length) html += '<div class="ctx-empty">No one onboarding yet</div>';
      else html += interns.map(p=>'<button onclick="KC.assignPick(&#39;'+attr(p.name)+'&#39;)"><span class="ctx-av">'+esc(p.initials)+'</span>'+esc(p.name)+'</button>').join('');
      html += '</div>';
    }
    m.innerHTML = html;
    m.classList.add('show');
    icons();
    // position near the button, keep on screen
    const r = btn.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let x = r.right - mw; if(x<8) x=8; if(x+mw>innerWidth-8) x=innerWidth-mw-8;
    let y = r.bottom + 6; if(y+mh>innerHeight-8) y = r.top - mh - 6;
    m.style.left = x+'px'; m.style.top = y+'px';
  };
  KC.closeMenu = function(){ const m=document.getElementById('ctxmenu'); if(m)m.classList.remove('show'); KC._menuBtn=null; };

  /* full ancestor name-path of a tree node (root → self) */
  function nodePath(node){
    const names=[]; let n=node;
    while(n && n.classList && n.classList.contains('node')){
      const rn=n.querySelector(':scope > .row .row-name'); if(rn) names.unshift(rn.textContent.trim());
      n=n.parentElement && n.parentElement.closest('.node');
    }
    return names;
  }

  KC.toggleDone = function(){
    const dot = curNode.querySelector(':scope > .row .dot');
    if(dot){
      if(dot.classList.contains('done')) dot.classList.remove('done','active');
      else { dot.classList.remove('active'); dot.classList.add('done'); }
      curNode.querySelector(':scope > .row').classList.toggle('done', dot.classList.contains('done'));
    }
    KC.closeMenu(); refreshProgressFor(curNode);
  };

  function ensureKids(node){
    let kids = node.querySelector(':scope > .kids');
    const row = node.querySelector(':scope > .row');
    if(!kids){
      // convert a leaf into a branch
      kids = document.createElement('div');
      kids.className='kids';
      node.appendChild(kids);
      // swap the leading dot for a twisty
      if(row.classList.contains('leaf')){
        row.classList.remove('leaf','done'); row.classList.add('branch');
        const lead=row.querySelector('.lead'); if(lead) lead.outerHTML='<span class="tw"><i data-lucide="chevron-down"></i></span>';
        row.setAttribute('onclick','KC.toggle(this)');
      }
    }
    return kids;
  }

  function addCustomLeaf(kids, name){
    const node = buildNode({n:name, custom:true}, 1);
    // place before any add-row
    const add = kids.querySelector(':scope > .add-row');
    if(add) kids.insertBefore(node, add); else kids.appendChild(node);
    return node;
  }

  KC.addChild = function(addBtn){
    const node = addBtn ? addBtn.closest('.node') : curNode;
    KC.closeMenu();
    const name = prompt('New sub-topic name:'); if(!name) return;
    const kids = ensureKids(node);
    kids.classList.remove('collapsed');
    const tw = node.querySelector(':scope > .row .tw'); if(tw) tw.classList.remove('c');
    addCustomLeaf(kids, name.trim());
    // bump count
    const meta = node.querySelector(':scope > .row .ring-n');
    if(meta) meta.textContent = kids.querySelectorAll(':scope > .node').length;
    icons(); refreshProgressFor(node);
    toast('Added “'+name.trim()+'” to your topics');
  };

  KC.addBlock = function(wsKey, treeId){
    KC.closeMenu();
    const name = prompt('Name your new section:'); if(!name) return;
    const tree = document.getElementById(treeId);
    const node = buildNode({n:name.trim(), custom:true, c:[]}, 0);
    const add = tree.querySelector(':scope > .add-row');
    if(add) tree.insertBefore(node, add); else tree.appendChild(node);
    icons();
    toast('Created your section “'+name.trim()+'”');
  };

  KC.rename = function(){
    const nameEl = curNode.querySelector(':scope > .row .row-name');
    const v = prompt('Rename:', nameEl.textContent); if(!v) { KC.closeMenu(); return; }
    nameEl.textContent = v.trim(); KC.closeMenu();
  };

  KC.del = function(){
    const parent = curNode.parentElement;
    const branchNode = parent.closest('.node');
    curNode.remove(); KC.closeMenu();
    if(branchNode){ const meta=branchNode.querySelector(':scope > .row .ring-n'); const kids=branchNode.querySelector(':scope > .kids'); if(meta&&kids) meta.textContent=kids.querySelectorAll(':scope > .node').length; refreshProgressFor(branchNode); }
    else refreshAllProgress();
    toast('Deleted');
  };

  /* ── User suggestions → Team Lead's Content review queue ───────────────
     "Suggest to Knowledge Center" on a custom node submits it as a whole
     NEW document. Persisted in localStorage so it survives the role reload
     and appears in the team lead's queue. Numeric id (embedded unquoted in
     the review onclicks). Content is the node's saved doc body (must exist). */
  const SUGG_KEY='kc_suggestions';
  KC.loadSuggestions=function(){ return KC.API.listSuggestions(); };
  KC.saveSuggestions=function(a){ KC.API.saveSuggestions(a); };
  KC.removeSuggestion=function(id){ KC.API.removeSuggestion(id); };

  KC.suggest = function(){
    const node=curNode; KC.closeMenu();
    if(!node) return;
    const ws=node.closest('.workspace'); const tree=node.closest('.tree');
    const wsIdx=WS.findIndex(w=>w[1]===(tree?tree.id:''));
    const full=nodePath(node);
    const title=full[full.length-1]||'Untitled';
    const parentChain=full.slice(0,-1);
    if(!parentChain.length){ toast('Add this inside a section first, then suggest it'); return; }
    // pull the saved body for this custom doc (the editable Textbook page)
    const docs=KC.loadDocs(); const docId=(ws?ws.id:'ws')+'::'+full.join('\u203a');
    let content='';
    if(docs[docId] && docs[docId].html){ const d=document.createElement('div'); d.innerHTML=docs[docId].html; content=(d.textContent||'').trim(); }
    if(!content){ toast('Add and Save some content in the Textbook first, then suggest it'); return; }
    const idn=KC.identity||DEFAULT_IDENTITY;
    const rec={ id: Date.now()*1000 + Math.floor(Math.random()*1000), submitted:true,
      author:idn.name, initials:idn.initials, type:'new', ws:wsIdx,
      path:[ (WS_NAMES[wsIdx]||''), ...parentChain ], title:title,
      content:content, when:'just now' };
    const all=KC.loadSuggestions(); all.push(rec); KC.saveSuggestions(all);
    toast('Sent to the Knowledge Center team for review');
  };

  /* ── Assignments (team lead → intern) + intern notifications ───────────
     One localStorage store shared across roles (switching reloads the page).
     Team lead assigns a node to an intern; the intern sees a cabinet
     notification + an attention marker in the tree until they accept it. */
  const ASSIGN_KEY='kc_assign';
  KC.loadAssign=function(){ return KC.API.listAssignments(); };
  KC.saveAssign=function(a){ KC.API.saveAssignments(a); };
  KC.internIdentityName=function(){ return DEFAULT_IDENTITY.name; }; // single reference intern
  KC.myAssignments=function(){ const nm=KC.internIdentityName(); return KC.loadAssign().filter(x=>x.intern===nm); };

  KC.toggleAssignSub=function(btn){
    const sub=btn.nextElementSibling; if(!sub||!sub.classList.contains('ctx-sub')) return;
    const open=sub.classList.toggle('open'); btn.classList.toggle('open',open);
    if(open){ const m=document.getElementById('ctxmenu'); const r=m.getBoundingClientRect();
      if(r.bottom>innerHeight-8){ let top=innerHeight-8-m.offsetHeight; if(top<8) top=8; m.style.top=top+'px'; } }
  };
  KC.assignMenu=function(){ /* legacy no-op — the intern picker is now an inline submenu built in KC.menu */ };
  KC.assignPick=function(name){ const ctx=KC._menuCtx; KC.closeMenu(); if(ctx) KC.assignNode(ctx, name); };
  KC.assignNode=function(ctx, intern){
    const a=KC.loadAssign();
    if(a.some(x=>x.intern===intern && x.title===ctx.title && x.ws===ctx.ws)){ toast('“'+ctx.title+'” is already in '+intern+'’s plan'); return; }
    a.push({ id:'as'+Date.now()+Math.floor(Math.random()*1000), ws:ctx.ws, treeId:ctx.treeId, title:ctx.title, path:ctx.path||[], intern:intern, accepted:false, when:Date.now() });
    KC.saveAssign(a);
    toast('Added “'+ctx.title+'” to '+intern+'’s plan');
    KC.markAssignedTree();
  };
  KC.acceptAssignment=function(id){
    const a=KC.loadAssign(); const it=a.find(x=>x.id===id); if(it){ it.accepted=true; KC.saveAssign(a); }
    KC.renderAssignments(); KC.markAssignedTree(); toast('Added to your plan — good luck!');
  };
  KC.gotoAssignment=function(id){
    const it=KC.loadAssign().find(x=>x.id===id); if(!it) return;
    if(window.switchWS) window.switchWS(it.ws);
    KC.goTo(it.treeId, it.title);
    const up=document.getElementById('userPop'); if(up) up.classList.remove('show');
  };
  KC.renderAssignments=function(){
    const box=document.getElementById('upAssignList'), sec=document.getElementById('upAssignSec');
    const dot=document.getElementById('navUserDot');
    if(!sec) return;
    if(ROLE!=='intern'){ sec.style.display='none'; if(dot) dot.style.display='none'; return; }
    const items=KC.myAssignments().filter(x=>!x.accepted);
    if(dot) dot.style.display=items.length?'block':'none';
    if(!items.length){ sec.style.display='none'; return; }
    sec.style.display='';
    if(box) box.innerHTML=items.map(it=>
      '<div class="asg-item"><span class="asg-ic"><i data-lucide="sparkles"></i></span>'+
      '<div class="asg-body"><div class="asg-t">'+esc(it.title)+'</div><div class="asg-ws">'+esc(WS_NAMES[it.ws]||'')+'</div></div>'+
      '<button class="asg-btn" title="Go to it" onclick="KC.gotoAssignment(&#39;'+it.id+'&#39;)"><i data-lucide="arrow-right"></i></button>'+
      '<button class="asg-btn ok" title="Got it — add to my plan" onclick="KC.acceptAssignment(&#39;'+it.id+'&#39;)"><i data-lucide="check"></i></button></div>'
    ).join('');
    icons();
  };
  KC.markAssignedTree=function(){
    document.querySelectorAll('.row.kc-assigned').forEach(r=>{ r.classList.remove('kc-assigned'); const m=r.querySelector('.kc-amark'); if(m)m.remove(); });
    document.querySelectorAll('.row.kc-attn').forEach(r=>{ r.classList.remove('kc-attn'); const m=r.querySelector('.kc-attn-mark'); if(m)m.remove(); });
    const all=KC.loadAssign(); if(!all.length) return;
    const myName=KC.internIdentityName();
    all.forEach(it=>{
      const tree=document.getElementById(it.treeId); if(!tree) return;
      const rows=[...tree.querySelectorAll('.row')].filter(r=>{ const n=r.querySelector('.row-name'); return n && n.textContent.trim()===it.title; });
      rows.forEach(r=>{
        if(ROLE==='intern' && it.intern===myName && !it.accepted){
          if(!r.querySelector('.kc-attn-mark')){
            r.classList.add('kc-attn');
            const mk=document.createElement('span'); mk.className='kc-attn-mark'; mk.title='New — assigned to you'; mk.innerHTML='<i data-lucide="sparkles"></i>';
            const menu=r.querySelector('.row-menu'); if(menu) r.insertBefore(mk,menu); else r.appendChild(mk);
          }
        }
      });
    });
    icons();
  };

  /* ── Bookmarks + "Continue learning" (personal cabinet) ── */
  const WS_NAMES = ['Logistics & Administration','BIM Methodology & Tools','EasyBIM Teams'];
  const WS_DOTS  = ['var(--acc)','var(--acc2)','var(--acc2)'];
  function attr(s){ return esc(s).replace(/"/g,'&quot;'); }
  function wsIdxOfTree(treeId){ return WS.findIndex(w=>w[1]===treeId); }
  KC.bookmarks = [];
  KC._resume = {};
  KC._bk = null;
  const BK_KEY='kc_bookmarks';
  KC.loadBk=function(){ KC.bookmarks=KC.API.listBookmarks(); };
  KC.saveBk=function(){ KC.API.saveBookmarks(KC.bookmarks); };

  const bkEq=(b,treeId,name,pIdx,side)=> b.treeId===treeId && b.name===name && (
    (b.pIdx==null&&pIdx==null) ||
    (b.pIdx!=null && pIdx!=null && b.pIdx===pIdx && (side==null || (b.side==='r'?'r':'l')===side))
  );
  KC.isBookmarked = function(treeId,name,pIdx,side){ pIdx=(pIdx==null?null:pIdx); return KC.bookmarks.some(b=>bkEq(b,treeId,name,pIdx,side)); };
  KC.findBk = function(treeId,name,pIdx,side){ pIdx=(pIdx==null?null:pIdx); return KC.bookmarks.find(b=>bkEq(b,treeId,name,pIdx,side))||null; };
  KC.toggleBookmark = function(treeId,name,pIdx,snippet,side){
    pIdx=(pIdx==null?null:pIdx);
    const useSide = pIdx==null?null:(side==='r'?'r':'l');
    const i=KC.bookmarks.findIndex(b=>bkEq(b,treeId,name,pIdx,useSide));
    let added; if(i>=0){ KC.bookmarks.splice(i,1); added=false; } else { KC.bookmarks.push({treeId,name,pIdx,snippet:snippet||'',note:'',color:'yellow',side:useSide||'l'}); added=true; }
    KC.saveBk(); KC.renderBookmarks(); KC.applyLineBk();
    toast(added?'Sticky note added':'Sticky note removed');
    return added;
  };
  KC.bkToggle = function(){ if(!KC._bk) return; const {treeId,name}=KC._bk; KC.closeMenu(); KC.toggleBookmark(treeId,name,null); };

  /* Translation panel on/off — a personal preference, off hides the page-edge tab + drawer */
  KC.trEnabled = function(){ return KC.API.getPref('translationEnabled', true); };
  KC.toggleTrPanel = function(){
    const on = !KC.trEnabled();
    KC.API.setPref('translationEnabled', on);
    document.body.classList.toggle('tr-off', !on);
    if(!on) document.querySelectorAll('.ctr.open').forEach(el=>{ window.togTr && window.togTr(el.id); });
    KC.closeMenu();
    requestAnimationFrame(()=>KC.layoutSplits(document.querySelector('.workspace.active')));
    toast(on?'Translation panel enabled':'Translation panel hidden');
  };

  /* Textbook column ⋯ dropdown (reuses the shared context menu) */
  KC.bookMenu = function(ev, btn){
    ev.stopPropagation();
    const m0=document.getElementById('ctxmenu');
    if(m0 && m0.classList.contains('show') && KC._menuBtn===btn){ KC.closeMenu(); return; }
    KC._menuBtn=btn;
    const ci = btn.closest('.ci');
    const cur = ci ? ci.querySelector('.bcrumb .bc-cur') : null;
    const name = cur ? cur.textContent.trim() : 'This topic';
    const ws = btn.closest('.workspace');
    const idx = ['ws0','ws1','ws2'].indexOf(ws?ws.id:'');
    const treeId = idx>=0 ? WS[idx][1] : '';
    KC._bk = {treeId, name};
    const bk = KC.isBookmarked(treeId, name);
    KC._dlCtx = {kind:'textbook', ci};
    const m = document.getElementById('ctxmenu'); if(!m) return;
    m.innerHTML = '<div class="ctx-h">'+esc(name)+'</div>'+
      '<button onclick="KC.bkToggle()"><i data-lucide="'+(bk?'bookmark-check':'bookmark-plus')+'"></i>'+(bk?'Remove bookmark':'Add to bookmarks')+'</button>'+
      '<button onclick="KC.closeMenu();KC.goTo(&#39;'+treeId+'&#39;,&#39;'+attr(name)+'&#39;)"><i data-lucide="crosshair"></i>Reveal in Plan</button>'+
      '<hr>'+
      '<button onclick="KC.toggleTrPanel()"><i data-lucide="languages"></i>Translation panel<span class="ctx-sw'+(KC.trEnabled()?' on':'')+'"><span class="ctx-swk"></span></span></button>'+
      '<hr>'+
      '<button class="ctx-assign-tog" onclick="KC.toggleAssignSub(this)"><i data-lucide="download"></i>Download<i data-lucide="chevron-right" class="ctx-more"></i></button>'+
      '<div class="ctx-sub">'+
        '<button onclick="KC.doDownload(&#39;web&#39;)"><i data-lucide="globe"></i>Web page</button>'+
        '<button onclick="KC.doDownload(&#39;doc&#39;)"><i data-lucide="file-text"></i>Editable document</button>'+
      '</div>'+
      '<button onclick="KC.Send.open(&#39;textbook&#39;)"><i data-lucide="send"></i>Send to\u2026</button>';
    m.classList.add('show'); icons();
    const r=btn.getBoundingClientRect(), mw=m.offsetWidth, mh=m.offsetHeight;
    let x=r.right-mw; if(x<8)x=8; if(x+mw>innerWidth-8)x=innerWidth-mw-8;
    let y=r.bottom+6; if(y+mh>innerHeight-8) y=r.top-mh-6;
    m.style.left=x+'px'; m.style.top=y+'px';
  };

  /* Notebook column ⋯ dropdown — Save as topic + Download variants */
  KC.noteMenu = function(ev, btn){
    ev.stopPropagation();
    const m0=document.getElementById('ctxmenu');
    if(m0 && m0.classList.contains('show') && KC._menuBtn===btn){ KC.closeMenu(); return; }
    KC._menuBtn=btn;
    const ci = btn.closest('.ci');
    const head = ci ? ci.querySelector('.ch .ct') : null;
    const name = head ? head.textContent.trim() : 'Notebook';
    KC._dlCtx = {kind:'notebook', ci};
    KC._noteBtn = btn;
    const m = document.getElementById('ctxmenu'); if(!m) return;
    m.innerHTML = '<div class="ctx-h">'+esc(name)+'</div>'+
      '<button onclick="KC.saveFromMenu()"><i data-lucide="folder-plus"></i>Save as topic</button>'+
      '<hr>'+
      '<button class="ctx-assign-tog" onclick="KC.toggleAssignSub(this)"><i data-lucide="download"></i>Download<i data-lucide="chevron-right" class="ctx-more"></i></button>'+
      '<div class="ctx-sub">'+
        '<button onclick="KC.doDownload(&#39;web&#39;)"><i data-lucide="globe"></i>Web page</button>'+
        '<button onclick="KC.doDownload(&#39;doc&#39;)"><i data-lucide="file-text"></i>Editable document</button>'+
      '</div>';
    m.classList.add('show'); icons();
    const r=btn.getBoundingClientRect(), mw=m.offsetWidth, mh=m.offsetHeight;
    let x=r.right-mw; if(x<8)x=8; if(x+mw>innerWidth-8)x=innerWidth-mw-8;
    let y=r.bottom+6; if(y+mh>innerHeight-8) y=r.top-mh-6;
    m.style.left=x+'px'; m.style.top=y+'px';
  };
  KC.saveFromMenu = function(){ const b=KC._noteBtn; KC.closeMenu(); if(b) KC.saveAsTopic(b); };

  KC.renderBookmarks = function(){
    const itemHTML=(b,i)=>{
      const idx=wsIdxOfTree(b.treeId);
      const note=(b.note||'').trim();
      return '<div class="bk-item" data-i="'+i+'" onclick="KC.openBookmark(this)" title="'+attr((WS_NAMES[idx]||'')+(note?' — '+note:(b.snippet?' — '+b.snippet:'')))+'">'+
        '<span class="bk-dot c-'+(b.color||'yellow')+'"></span>'+
        '<span class="bk-txt"><span class="bk-name">'+esc(b.name)+'</span>'+(note?'<span class="bk-note">'+esc(note)+'</span>':'')+'</span>'+
        '<button class="bk-x" title="Remove" onclick="event.stopPropagation();KC.removeBk(this)"><i data-lucide="x"></i></button>'+
      '</div>';
    };
    const marks=document.getElementById('upBmarks');
    if(marks){
      const rows=KC.bookmarks.map((b,i)=>[b,i]).filter(x=>x[0].pIdx==null);
      marks.innerHTML = rows.length
        ? rows.map(x=>itemHTML(x[0],x[1])).join('')
        : '<div class="bk-empty">No bookmarks yet — bookmark a topic from its ⋯ menu.</div>';
    }
    const box=document.getElementById('upBookmarks');
    if(box){
      const rows=KC.bookmarks.map((b,i)=>[b,i]).filter(x=>x[0].pIdx!=null);
      box.innerHTML = rows.length
        ? rows.map(x=>itemHTML(x[0],x[1])).join('')
        : '<div class="bk-empty">No sticky notes yet — add one on any line in the Textbook.</div>';
    }
    icons();
  };
  KC.removeBk = function(btn){ const el=btn.closest('.bk-item'); if(!el) return; const b=KC.bookmarks[+el.dataset.i]; if(b) KC.toggleBookmark(b.treeId, b.name, b.pIdx, '', b.side); };
  KC.openBookmark = function(el){
    const b=KC.bookmarks[+el.dataset.i]; if(!b) return;
    const idx=wsIdxOfTree(b.treeId);
    if(window.cpopUser) window.cpopUser();
    if(idx>=0 && window.switchWS) window.switchWS(idx);
    setTimeout(()=>{ KC.goTo(b.treeId,b.name); if(b.pIdx!=null) setTimeout(()=>KC.scrollToLine(idx,b.pIdx), 200); }, 90);
  };

  /* ── line-level bookmark flags on the Textbook page (option C: rotated tab) ──
     Works on BOTH the static official pages (.doc-p) and open custom editable
     docs (.kc-doc-body block children). Flag buttons are contenteditable="false"
     islands so the editor never swallows them; they're stripped before save. */
  function bkTopicOf(cb){ const c=cb.querySelector('.bcrumb .bc-cur')||cb.querySelector('.dp-bc-cur'); return c?c.textContent.trim():''; }
  function bkLines(cb){
    const dp=cb.querySelector('.kc-docpage .dp-body');
    if(dp) return [...dp.querySelectorAll(':scope > .dp-p, :scope > .dp-h, :scope > .dp-list > li, :scope > .dp-callout, :scope > .dp-fig')];
    const body=cb.querySelector('.kc-doc .kc-doc-body');
    if(body) return [...body.children].filter(el=>el.nodeType===1 && !el.classList.contains('kc-bm'));
    return [...cb.querySelectorAll(':scope > .doc-p')];
  }
  function bkInjectInto(cb){
    bkLines(cb).forEach((el,i)=>{
      el.dataset.pidx=i;
      if(getComputedStyle(el).position==='static') el.style.position='relative';
      if(!el.querySelector(':scope > .kc-bm')){
        ['l','r'].forEach(sd=>{
          const btn=document.createElement('button');
          btn.className='kc-bm kc-bm-'+sd; btn.dataset.side=sd; btn.title='Add a sticky note'; btn.setAttribute('contenteditable','false');
          btn.setAttribute('onclick','KC.toggleLineBk(this)');
          el.appendChild(btn);
        });
      }
    });
  }
  KC.setupDocBookmarks=function(cb){ if(cb){ bkInjectInto(cb); } KC.applyLineBk(); icons(); };
  KC.setupBookmarks = function(){
    ['ws0','ws1','ws2'].forEach(wsId=>{
      const ws=document.getElementById(wsId); if(!ws) return;
      const cb=ws.querySelector('.c2 .cb'); if(!cb) return;
      bkInjectInto(cb);
    });
    KC.applyLineBk(); icons();
  };
  /* Bookmarks are small margin index-tabs (arrow stickers). Each sits at the
     right edge of its line; clicking opens a little popover to write a short
     note + pick a color. Record: {treeId,name,pIdx,snippet,note,color}. */
  const TAB_COLORS=['yellow','blue','green','orange','pink'];
  function stickyCtx(node){
    const line=node.closest('[data-pidx]'); if(!line) return null;
    const ws=node.closest('.workspace'); const idx=['ws0','ws1','ws2'].indexOf(ws?ws.id:''); if(idx<0) return null;
    const cb=ws.querySelector('.c2 .cb'); if(!cb) return null;
    const side=node.dataset.side || (node.classList&&node.classList.contains('side-r')?'r':'l');
    return { line, treeId:WS[idx][1], topic:bkTopicOf(cb), pIdx:+line.dataset.pidx, side };
  }
  function positionTab(line, t, side){
    // On the DocPage, align every sticker to ONE vertical near the field edge,
    // regardless of list/sub indentation or text direction (RTL/LTR).
    const dp = line.closest('.kc-docpage .dp-body');
    if(!dp){ t.style.left=''; t.style.right=''; return; }
    const br = dp.getBoundingClientRect(), lr = line.getBoundingClientRect();
    if(!br.width){ return; }              // column hidden — keep CSS fallback, recompute when shown
    const INSET = 2;                       // almost flush to the edge
    if(side==='r'){ t.style.left=''; t.style.right = (lr.right - br.right + INSET) + 'px'; }
    else { t.style.right=''; t.style.left = (br.left - lr.left + INSET) + 'px'; }
  }
  function ensureTab(line, rec){
    const color=rec.color||'yellow'; const hasNote=!!(rec.note||'').trim();
    const side=rec.side==='r'?'r':'l';
    let t=line.querySelector(':scope > .kc-tab.side-'+side);
    if(!t){ t=document.createElement('button'); t.setAttribute('contenteditable','false'); t.dataset.side=side; t.setAttribute('onclick','KC.tabOpen(this)'); line.appendChild(t); }
    t.className='kc-tab side-'+side+' c-'+color+(hasNote?' has-note':'');
    t.title=hasNote?rec.note:'Edit note';
    positionTab(line, t, side);
    return t;
  }
  KC.applyLineBk = function(){
    ['ws0','ws1','ws2'].forEach((wsId,idx)=>{
      const ws=document.getElementById(wsId); if(!ws) return;
      const cb=ws.querySelector('.c2 .cb'); if(!cb) return;
      const topic=bkTopicOf(cb), treeId=WS[idx][1];
      bkLines(cb).forEach(el=>{
        ['l','r'].forEach(sd=>{
          const rec=KC.findBk(treeId, topic, +el.dataset.pidx, sd);
          const t=el.querySelector(':scope > .kc-tab.side-'+sd);
          el.classList.toggle('bk-'+sd, !!rec);
          if(rec) ensureTab(el, rec);
          else if(t) t.remove();
        });
      });
    });
  };
  KC.toggleLineBk = function(btn){
    const c=stickyCtx(btn); if(!c) return;
    const clone=c.line.cloneNode(true); clone.querySelectorAll('.kc-bm,.kc-tab').forEach(e=>e.remove());
    const snippet=(clone.textContent||'').replace(/\s+/g,' ').trim().slice(0,70);
    const added=KC.toggleBookmark(c.treeId, c.topic, c.pIdx, snippet, c.side);
    if(added){ setTimeout(()=>{ const t=c.line.querySelector(':scope > .kc-tab.side-'+c.side); if(t) KC.tabOpen(t); }, 40); }
  };
  /* ── the note popover (single floating editor, styled like a mini sticker) ── */
  function tabPop(){
    let p=document.getElementById('kcTabPop');
    if(!p){
      p=document.createElement('div'); p.id='kcTabPop'; p.className='kc-tabpop';
      p.innerHTML='<div class="kc-tabpop-lbl">Sticky note</div>'+
        '<textarea class="kc-tabpop-ta" rows="2" maxlength="160" placeholder="Write a short note\u2026" oninput="KC.tabNote(this)"></textarea>'+
        '<div class="kc-tabpop-row"><div class="kc-tabpop-cols">'+
          TAB_COLORS.map(c=>'<button class="kc-tcol c-'+c+'" data-c="'+c+'" title="'+c+'" onclick="KC.tabColor(this)"></button>').join('')+
        '</div>'+
        '<button class="kc-tabpop-rm" onclick="KC.tabRemove()"><i data-lucide="trash-2"></i>Remove</button></div>';
      document.body.appendChild(p);
    }
    return p;
  }
  KC._tabCtx=null;
  KC.tabOpen = function(anchor){
    const c=stickyCtx(anchor); if(!c) return; const rec=KC.findBk(c.treeId,c.topic,c.pIdx,c.side); if(!rec) return;
    KC._tabCtx=c;
    const p=tabPop();
    p.querySelector('.kc-tabpop-ta').value=rec.note||'';
    p.querySelectorAll('.kc-tcol').forEach(b=>b.classList.toggle('on', b.dataset.c===(rec.color||'yellow')));
    p.classList.add('show'); icons();
    const r=anchor.getBoundingClientRect(), pw=p.offsetWidth||236, ph=p.offsetHeight||120;
    let x=r.left-pw-10; if(x<8) x=Math.min(r.right+10, innerWidth-pw-8); if(x<8) x=8;
    let y=r.top-4; if(y+ph>innerHeight-8) y=innerHeight-ph-8; if(y<8) y=8;
    p.style.left=x+'px'; p.style.top=y+'px';
    setTimeout(()=>{ const ta=p.querySelector('.kc-tabpop-ta'); if(ta){ ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length); } }, 30);
    setTimeout(()=>document.addEventListener('mousedown', KC._tabOutside, true), 0);
  };
  KC._tabOutside = function(ev){
    const p=document.getElementById('kcTabPop'); if(!p) return;
    if(p.contains(ev.target) || (ev.target.closest && ev.target.closest('.kc-tab'))) return;
    KC.tabClose();
  };
  KC.tabClose = function(){ const p=document.getElementById('kcTabPop'); if(p) p.classList.remove('show'); document.removeEventListener('mousedown', KC._tabOutside, true); KC._tabCtx=null; };
  KC.tabNote = function(ta){ const c=KC._tabCtx; if(!c) return; const r=KC.findBk(c.treeId,c.topic,c.pIdx,c.side); if(!r) return; r.note=(ta.value||'').slice(0,160); KC.saveBk(); ensureTab(c.line,r); KC.renderBookmarks(); };
  KC.tabColor = function(btn){ const c=KC._tabCtx; if(!c) return; const r=KC.findBk(c.treeId,c.topic,c.pIdx,c.side); if(!r) return; r.color=btn.dataset.c; KC.saveBk();
    btn.parentElement.querySelectorAll('.kc-tcol').forEach(b=>b.classList.toggle('on',b.dataset.c===r.color)); ensureTab(c.line,r); KC.renderBookmarks(); };
  KC.tabRemove = function(){ const c=KC._tabCtx; if(!c) return; KC.tabClose(); KC.toggleBookmark(c.treeId, c.topic, c.pIdx, '', c.side); };
  KC.scrollToLine = function(idx, pIdx){
    const ws=document.getElementById('ws'+idx); if(!ws) return;
    const cb=ws.querySelector('.c2 .cb'); if(!cb) return;
    const c2=ws.querySelector('.c2'); if(c2 && c2.classList.contains('slim') && window.xp) xp(c2.id);
    const line=bkLines(cb).find(el=>+el.dataset.pidx===pIdx); if(!line) return;
    const rb=line.getBoundingClientRect(), cbb=cb.getBoundingClientRect();
    cb.scrollTop += (rb.top - cbb.top) - 100;
    line.classList.add('bk-flash'); setTimeout(()=>line.classList.remove('bk-flash'), 1300);
  };

  KC.activeIdx = function(){ const a=document.querySelector('.workspace.active'); return a?['ws0','ws1','ws2'].indexOf(a.id):0; };
  KC.setResume = function(treeId,name){ const idx=wsIdxOfTree(treeId); if(idx<0) return; KC._resume[idx]={treeId,name}; };
  KC.renderResume = function(){
    const idx=KC.activeIdx(), r=KC._resume[idx];
    const nameEl=document.getElementById('upResumeName'), wsEl=document.getElementById('upResumeWs');
    if(nameEl) nameEl.textContent = r ? r.name : 'Start your first topic';
    if(wsEl) wsEl.textContent = WS_NAMES[idx]||'';
  };
  KC.resume = function(){
    const idx=KC.activeIdx(), r=KC._resume[idx];
    if(window.cpopUser) window.cpopUser();
    if(r) KC.goTo(r.treeId, r.name);
  };

  /* rebuild a raw node ({n,c,s,custom}) from a rendered DOM node — used to
     clone a system node into an editable custom copy (whole sub-tree). */
  function domToRaw(node){
    const row = node.querySelector(':scope > .row');
    const name = (row.querySelector('.row-name')?.textContent||'').trim();
    const kids = node.querySelector(':scope > .kids');
    if(kids){
      const children = [...kids.querySelectorAll(':scope > .node')]
        .filter(c=>!c.querySelector(':scope > .row').classList.contains('row-muted'))
        .map(domToRaw);
      return {n:name, c:children, custom:true};
    }
    const dot = row.querySelector('.dot');
    let s; if(dot){ if(dot.classList.contains('done')) s='done'; else if(dot.classList.contains('active')) s='active'; }
    return {n:name, s:s, custom:true};
  }

  /* Duplicate a system (non-custom) node into an editable custom copy placed
     right after the original. Carries the whole sub-tree ("Textbook") plus a
     snapshot of the current Notebook doc so the copy isn't empty. The copy is
     a normal custom node → Rename / Suggest / Delete are available on it. */
  KC.duplicate = function(){
    const node = curNode; KC.closeMenu();
    if(!node) return;
    const raw = domToRaw(node);
    raw.custom = true;
    raw.n = raw.n + ' _copy';
    const depth = +node.dataset.depth || 0;
    const copy = buildNode(raw, depth, true);
    // clone the current Notebook doc of this workspace onto the copy
    const ws = node.closest('.workspace');
    const doc = ws ? ws.querySelector('.note-doc') : null;
    if(doc){ copy._noteSnapshot = doc.innerHTML; copy.dataset.hasNotes = '1'; }
    node.parentNode.insertBefore(copy, node.nextSibling);
    icons();
    // keep the parent branch's sub-topic count in sync
    const parentNode = node.parentElement.closest('.node');
    if(parentNode){ const meta=parentNode.querySelector(':scope > .row .ring-n'); const kids=parentNode.querySelector(':scope > .kids'); if(meta&&kids) meta.textContent=kids.querySelectorAll(':scope > .node').length; }
    refreshProgressFor(copy);
    toast('Duplicated “'+raw.n+'” — yours to edit');
  };

  function refreshProgressFor(node){
    const tree = node.closest('.tree'); if(!tree) return;
    const idx = WS.findIndex(w=>w[1]===tree.id); if(idx>=0) updateProgress(idx);
  }
  function refreshAllProgress(){ updateAll(); }

  /* search */
  window.filterT = function(input, treeId){
    const q = (input.value||'').toLowerCase().trim();
    const tree = document.getElementById(treeId); if(!tree) return;
    if(!q){
      tree.querySelectorAll('.node').forEach(n=>n.style.display='');
      tree.querySelectorAll('.kids').forEach(k=>{
        const pd = +k.parentElement.dataset.depth;
        const collapse = pd>=1;
        k.classList.toggle('collapsed', collapse);
        const tw = k.parentElement.querySelector(':scope > .row .tw'); if(tw) tw.classList.toggle('c', collapse);
      });
      return;
    }
    function walk(node){
      const nm = (node.querySelector(':scope > .row .row-name')?.textContent||'').toLowerCase();
      const kids = node.querySelector(':scope > .kids');
      let childHit=false;
      if(kids) kids.querySelectorAll(':scope > .node').forEach(c=>{ if(walk(c)) childHit=true; });
      const hit = nm.includes(q) || childHit;
      node.style.display = hit?'':'none';
      if(kids){
        kids.classList.toggle('collapsed', !childHit);
        const tw=node.querySelector(':scope > .row .tw'); if(tw) tw.classList.toggle('c', !childHit);
      }
      return hit;
    }
    tree.querySelectorAll(':scope > .node').forEach(walk);
  };

  /* toast */
  let toastT;
  function toast(msg){
    const t=document.getElementById('toast'); if(!t) return;
    t.innerHTML='<i data-lucide="check"></i>'+esc(msg); icons();
    t.classList.add('show'); clearTimeout(toastT);
    toastT=setTimeout(()=>t.classList.remove('show'),2600);
  }
  KC.toast = toast;

  /* dismiss menu on outside click / scroll / esc */
  document.addEventListener('click', e=>{ if(!e.target.closest('#ctxmenu') && !e.target.closest('.row-menu')) KC.closeMenu(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') KC.closeMenu(); });
  window.addEventListener('resize', KC.closeMenu);
  document.querySelectorAll('.cb').forEach(cb=>cb.addEventListener('scroll', KC.closeMenu, {passive:true}));

  /* ── Mentor: topic-bound chat + free "assistant" mode (mockup logic) ──
     Two persistent threads per workspace. "Topic" is grounded in the open
     Textbook topic; "Assistant" is a free EasyBIM helper. Answers carry a
     Knowledge-Base badge and clickable topic links that jump to the topic. */
  const MENTOR = {
    ws0:{p:'w0', tree:'w0ptree', topic:'Get Started With the Basics', parent:'Monday'},
    ws1:{p:'w1', tree:'w1ptree', topic:'Docs', parent:'Revit'},
    ws2:{p:'w2', tree:'w2ptree', topic:'Coordinates', parent:'BIM Mgmt & SP'},
  };
  Object.values(MENTOR).forEach(m=>{ m.mode='topic'; m.threads={topic:null,assistant:null}; });

  /* Persist mentor chat history (both topic + assistant threads, per workspace) */
  const MENTOR_LS='kc_mentor';
  KC.loadMentorThreads=function(){ return KC.API.getMentorThreads(); };
  KC.saveMentorThreads=function(){ const out={}; Object.keys(MENTOR).forEach(id=>{ out[id]={topic:MENTOR[id].threads.topic, assistant:MENTOR[id].threads.assistant}; }); KC.API.saveMentorThreads(out); };
  (function(){ const s=KC.loadMentorThreads(); Object.keys(MENTOR).forEach(id=>{ const t=s[id]; if(t){ if(Array.isArray(t.topic)) MENTOR[id].threads.topic=t.topic; if(Array.isArray(t.assistant)) MENTOR[id].threads.assistant=t.assistant; } }); })();

  function mLink(wsId,name){ const m=MENTOR[wsId]; return '<span class="kblink" onclick="KC.goTo(&#39;'+m.tree+'&#39;,&#39;'+esc(name)+'&#39;);event.stopPropagation()">'+esc(name)+'</span>'; }
  function mKB(html){ return '<span class="kb-badge"><i data-lucide="sparkles"></i>Knowledge Base</span>'+html; }
  function mGreet(wsId){
    const m=MENTOR[wsId];
    return m.mode==='topic'
      ? 'You are studying '+mLink(wsId,m.topic)+'. Ask me anything about it — I answer from EasyBIM knowledge base first and link you to the right topics.'
      : 'I am your EasyBIM Assistant — ask across all workspaces, anytime. I draw from our internal knowledge base before the web, and link you to the source topics.';
  }
  function mActive(m){ return m.threads[m.mode] || (m.threads[m.mode]=[{who:'ai', html:mGreet(m.id)}]); }

  KC.mentorRender = function(wsId){
    const m=MENTOR[wsId]; if(!m) return; m.id=wsId;
    const chat=document.getElementById(m.p+'chat'); if(!chat) return;
    const who = m.mode==='topic'?'Topic Mentor':'EasyBIM Assistant';
    chat.innerHTML = mActive(m).map(x=>
      x.who==='ai'
        ? '<div><div class="ts">'+who+'</div><div class="mr"><div class="av ai">AI</div><div class="bub ai">'+x.html+'</div></div></div>'
        : '<div><div class="ts r">You</div><div class="mr me"><div class="av me">Me</div><div class="bub me">'+x.html+'</div></div></div>'
    ).join('');
    icons(); chat.scrollTop=chat.scrollHeight;
  };
  function mPush(wsId, who, html){ const m=MENTOR[wsId]; m.id=wsId; mActive(m).push({who,html}); KC.mentorRender(wsId); KC.saveMentorThreads&&KC.saveMentorThreads(); }

  KC.mentorMode = function(wsId, mode){
    const m=MENTOR[wsId]; if(!m||m.mode===mode) return; m.id=wsId; m.mode=mode;
    const title=document.getElementById(m.p+'mtitle'), scope=document.getElementById(m.p+'mscope');
    const head=title.closest('.mentor-head');
    head.querySelectorAll('.mm-tab').forEach(t=>t.classList.toggle('active', t.dataset.mode===mode));
    title.textContent = mode==='topic'?'Topic Mentor':'EasyBIM Assistant';
    scope.innerHTML = mode==='topic'
      ? '<i data-lucide="book-open"></i><span class="ms-txt ms-link" onclick="KC.goTo(&#39;'+m.tree+'&#39;,&#39;'+esc(m.topic)+'&#39;)">'+esc(m.topic)+'</span>'
      : '<i data-lucide="sparkles"></i><span class="ms-txt">All workspaces · answers from Knowledge Base</span>';
    const av=head.querySelector('.mentor-av'); if(av) av.innerHTML='<i data-lucide="'+(mode==='topic'?'graduation-cap':'sparkles')+'"></i>';
    const col=document.getElementById(m.p+'c4'); if(col) col.classList.toggle('asst-mode', mode==='assistant');
    icons(); KC.mentorRender(wsId);
  };

  KC.mentorNew = function(wsId){ const m=MENTOR[wsId]; m.id=wsId; m.threads[m.mode]=[{who:'ai',html:mGreet(wsId)}]; KC.mentorRender(wsId); KC.saveMentorThreads&&KC.saveMentorThreads(); if(KC.toast)KC.toast(m.mode==='topic'?'Started a new topic chat':'Started a new assistant chat'); };

  KC.mentorMore = function(ev, wsId){ ev.stopPropagation(); const menu=document.getElementById(MENTOR[wsId].p+'mmenu'); const open=menu.classList.contains('show'); document.querySelectorAll('.mentor-menu.show').forEach(x=>x.classList.remove('show')); if(!open) menu.classList.add('show'); };
  KC.mentorDict = function(btn){ const ci=btn.closest('.ci'); if(ci) ci.querySelectorAll('.mentor-menu.show').forEach(x=>x.classList.remove('show')); KC.dict(btn); };
  document.addEventListener('click', e=>{ if(!e.target.closest('.mentor-id')) document.querySelectorAll('.mentor-menu.show').forEach(x=>x.classList.remove('show')); });

  function mAnswer(wsId, q){
    const m=MENTOR[wsId];
    if(m.mode==='topic')
      return mKB('Good question. The heart of '+mLink(wsId,m.topic)+' is what most of your day-to-day builds on. For the wider context, see '+mLink(wsId,m.parent)+'.');
    return mKB('From the knowledge base: this maps to '+mLink(wsId,m.parent)+' → '+mLink(wsId,m.topic)+'. Want me to open that topic for you?');
  }
  KC.mentorSend = function(inp, wsId){
    const val=(inp.value||'').trim(); if(!val) return;
    mPush(wsId,'me', esc(val)); inp.value='';
    setTimeout(()=>mPush(wsId,'ai', mAnswer(wsId,val)), 650);
  };
  const M_TOOLS = {
    quiz:   {q:'Quiz me on this topic', a:wsId=>mKB('Sure — 5 quick questions on '+mLink(wsId,MENTOR[wsId].topic)+'. Q1: what is it mainly used for?')},
    cards:  {q:'Make flashcards',       a:wsId=>'Done — 8 flashcards from '+mLink(wsId,MENTOR[wsId].topic)+' were added to your deck.'},
    summary:{q:'Summarise this topic',  a:wsId=>mKB('In short, '+mLink(wsId,MENTOR[wsId].topic)+' comes down to three things: what it is, when you reach for it, and the one rule not to break. Full detail sits under '+mLink(wsId,MENTOR[wsId].parent)+'.')},
    checklist:{q:'Make a checklist',    a:wsId=>mKB('Working checklist for '+mLink(wsId,MENTOR[wsId].topic)+':<br>&#9744; Confirm your inputs are ready<br>&#9744; Follow the standard steps in order<br>&#9744; Check the result against '+mLink(wsId,MENTOR[wsId].parent)+'<br>&#9744; Log what you did')},
    res:    {q:'Find extra resources',  a:wsId=>mKB('From the knowledge base: '+mLink(wsId,MENTOR[wsId].parent)+', our internal SOP, and a 6-min walkthrough.')},
  };
  KC.mentorTool = function(wsId, kind){
    const t=M_TOOLS[kind]; if(!t) return;
    mPush(wsId,'me', esc(t.q));
    setTimeout(()=>mPush(wsId,'ai', t.a(wsId)), 600);
  };

  /* ── Dictionary overlay (inside Mentor) ── */
  KC.dict = function(btn){ const ci=btn.closest('.ci'); if(ci) ci.classList.add('dict-open'); };
  KC.dictClose = function(btn){ const ci=btn.closest('.ci'); if(ci) ci.classList.remove('dict-open'); };
  KC.dictFilter = function(input){
    const q=(input.value||'').toLowerCase().trim();
    input.closest('.dict-page').querySelectorAll('.dterm').forEach(t=>{
      t.classList.toggle('dt-nf', !(!q || t.textContent.toLowerCase().includes(q)));
    });
  };

  /* ── Dictionary data + rendering (RU/EN/HE translations, definition language, time filter) ── */
  const DICT_PREFS_LS='kc_dict_prefs';
  KC.dictState = Object.assign({defLang:'en', showHE:true, showRU:true, showDef:true, period:'all'},
    KC.API.getPref('dict', {}));
  const DICT=[
    {w:'Work OS', src:'Monday', added:'2026-07-04', he:'מערכת הפעלה לעבודה', ru:'Рабочая ОС',
      def:{en:'A single platform where teams plan, run and track all their work.', ru:'Единая платформа, где команды планируют, ведут и отслеживают всю работу.', he:'פלטפורמה אחת שבה צוותים מתכננים, מנהלים ועוקבים אחר כל העבודה.'}},
    {w:'Board', src:'Monday', added:'2026-07-01', he:'לוח', ru:'Доска',
      def:{en:'A customizable table of items used to manage a workflow.', ru:'Настраиваемая таблица элементов для управления рабочим процессом.', he:'טבלה מותאמת אישית של פריטים לניהול תהליך עבודה.'}},
    {w:'Coordinates', src:'BIM', added:'2026-07-03', he:'קואורדינטות', ru:'Координаты',
      def:{en:'Shared reference point and orientation that align all project models.', ru:'Общая точка отсчёта и ориентация, выравнивающие все модели проекта.', he:'נקודת ייחוס וכיוון משותפים המיישרים את כל מודלי הפרויקט.'}},
    {w:'CDE', src:'BIM', added:'2026-06-20', he:'סביבת נתונים משותפת', ru:'Общая среда данных',
      def:{en:'Common Data Environment — the shared single source of truth for project data.', ru:'Common Data Environment — единый источник достоверных данных проекта.', he:'סביבת הנתונים המשותפת — מקור אמת יחיד לנתוני הפרויקט.'}},
    {w:'Clash detection', src:'Navisworks', added:'2026-06-15', he:'זיהוי התנגשויות', ru:'Обнаружение коллизий',
      def:{en:'Automated check for geometric conflicts between coordinated models.', ru:'Автоматическая проверка геометрических конфликтов между моделями.', he:'בדיקה אוטומטית של התנגשויות גאומטריות בין מודלים מתואמים.'}},
    {w:'IFC', src:'BIM', added:'2026-05-10', he:'IFC — פורמט חליפין פתוח', ru:'IFC — открытый формат обмена',
      def:{en:'Industry Foundation Classes — the open, vendor-neutral model exchange format.', ru:'Industry Foundation Classes — открытый нейтральный формат обмена моделями.', he:'Industry Foundation Classes — פורמט פתוח וניטרלי להחלפת מודלים.'}},
    {w:'LOD', src:'BIM', added:'2026-05-28', he:'רמת פירוט', ru:'Уровень детализации',
      def:{en:'Level of Development — how much detail and reliability an element carries.', ru:'Level of Development — степень детализации и достоверности элемента.', he:'Level of Development — מידת הפירוט והאמינות של אלמנט.'}},
    {w:'BEP', src:'BIM', added:'2026-04-22', he:'תוכנית ביצוע BIM', ru:'План реализации BIM',
      def:{en:'BIM Execution Plan — defines how BIM is delivered on a project.', ru:'BIM Execution Plan — определяет, как BIM реализуется на проекте.', he:'BIM Execution Plan — מגדיר כיצד BIM מיושם בפרויקט.'}}
  ];
  function dictFmtDate(s){ const d=new Date(s+'T00:00:00'); return isNaN(d)?'':d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
  KC.renderDict=function(){
    const cards=DICT.map(t=>
      '<div class="dterm" data-lang="'+attr(KC.dictState.defLang)+'" data-added="'+attr(t.added)+'">'+
        '<div class="dterm-w">'+esc(t.w)+'<span class="dterm-date">'+esc(dictFmtDate(t.added))+'</span></div>'+
        '<div class="dterm-tr dterm-he" dir="rtl"><span class="dterm-lbl">HE</span><span>'+esc(t.he||'—')+'</span></div>'+
        '<div class="dterm-tr dterm-ru"><span class="dterm-lbl">RU</span><span>'+esc(t.ru||'—')+'</span></div>'+
        '<div class="dterm-d"><div class="dd-lang"><button data-l="ru" onclick="KC.dtermLang(this,\'ru\')">RU</button><button data-l="en" onclick="KC.dtermLang(this,\'en\')">EN</button><button data-l="he" onclick="KC.dtermLang(this,\'he\')">HE</button></div><span class="dd dd-ru">'+esc((t.def&&t.def.ru)||'')+'</span><span class="dd dd-en">'+esc((t.def&&t.def.en)||'')+'</span><span class="dd dd-he" dir="rtl">'+esc((t.def&&t.def.he)||'')+'</span></div>'+
      '</div>').join('');
    document.querySelectorAll('.dict-list').forEach(l=>l.innerHTML=cards);
    KC.applyDictPrefs();
    icons();
  };
  function dictSavePrefs(){ KC.API.setPref('dict', KC.dictState); }
  function dictCutoff(period){ if(period==='all') return null; const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-(period==='week'?7:30)); return d; }
  KC.dictApplyPeriod=function(){
    const cut=dictCutoff(KC.dictState.period);
    document.querySelectorAll('.dict-list .dterm').forEach(el=>{
      const d=new Date((el.dataset.added||'')+'T00:00:00');
      el.classList.toggle('dt-np', !(!cut || (!isNaN(d) && d>=cut)));
    });
    const first=document.querySelector('.dict-list');
    const n=first?[...first.querySelectorAll('.dterm')].filter(el=>!el.classList.contains('dt-np')).length:0;
    const label=(KC.dictState.period==='all')?(n+' terms'):(n+' added');
    document.querySelectorAll('.dict-count').forEach(c=>c.textContent=label);
  };
  KC.applyDictPrefs=function(){
    const st=KC.dictState;
    document.querySelectorAll('.dict-page').forEach(p=>{
      p.classList.toggle('pref-he', !!st.showHE);
      p.classList.toggle('pref-ru', !!st.showRU);
      p.classList.toggle('pref-def', !!st.showDef);
      p.querySelectorAll('.dict-deflang button').forEach(b=>b.classList.toggle('active', b.dataset.lang===st.defLang));
      p.querySelectorAll('.dict-period button').forEach(b=>b.classList.toggle('active', b.dataset.period===st.period));
      p.querySelectorAll('.dict-opt input').forEach(i=>{ i.checked=!!st[i.dataset.pref]; });
    });
    document.querySelectorAll('.dterm').forEach(d=>d.querySelectorAll('.dd-lang button').forEach(b=>b.classList.toggle('active', b.dataset.l===(d.dataset.lang||st.defLang))));
    KC.dictApplyPeriod();
  };
  KC.dictLang=function(l){ KC.dictState.defLang=l; dictSavePrefs(); document.querySelectorAll('.dterm').forEach(d=>d.dataset.lang=l); KC.applyDictPrefs(); };
  KC.dtermLang=function(btn,l){ const d=btn.closest('.dterm'); if(!d) return; d.dataset.lang=l; d.querySelectorAll('.dd-lang button').forEach(b=>b.classList.toggle('active', b.dataset.l===l)); };
  KC.dictPeriod=function(p){ KC.dictState.period=p; dictSavePrefs(); KC.applyDictPrefs(); };
  KC.dictPref=function(inp){ KC.dictState[inp.dataset.pref]=inp.checked; dictSavePrefs(); KC.applyDictPrefs(); };
  KC.dictGear=function(btn){ const m=btn.parentElement.querySelector('.dict-menu'); const open=m&&m.classList.contains('show'); document.querySelectorAll('.dict-menu.show').forEach(x=>x.classList.remove('show')); if(m&&!open) m.classList.add('show'); };
  KC.dictAddTerm=function(word, defEn){ const today=new Date().toISOString().slice(0,10); DICT.unshift({w:word, src:'My term', added:today, he:'', ru:'', def:{en:defEn||'', ru:'', he:''}}); KC.renderDict(); };
  document.addEventListener('click', e=>{ if(!e.target.closest('.dict-head')) document.querySelectorAll('.dict-menu.show').forEach(x=>x.classList.remove('show')); });

  /* ── Save notebook content as a custom topic in column 1 ── */
  KC.saveAsTopic = function(btn){
    const ws = btn.closest('.workspace'); if(!ws) return;
    const idx = [...document.querySelectorAll('.workspace')].indexOf(ws);
    if(idx<0) return;
    const treeId = WS[idx][1];
    const name = prompt('Save these notes as a new topic named:'); if(!name) return;
    const tree=document.getElementById(treeId);
    const node=buildNode({n:name.trim(), custom:true, c:['From my notebook']},0);
    const add=tree.querySelector(':scope > .add-row');
    if(add) tree.insertBefore(node,add); else tree.appendChild(node);
    icons();
    toast('Saved “'+name.trim()+'” as your topic — manage it via ⋯');
  };

  /* ── Sync-scroll: Textbook ↔ Translation ── */
  function syncPair(btn){
    const ws=btn.closest('.workspace'); if(!ws) return null;
    const book=ws.querySelector('.c2 .cb'), tr=ws.querySelector('.ctr .cb');
    return (book&&tr)?{book,tr}:null;
  }
  function frac(el){ const m=el.scrollHeight-el.clientHeight; return m>0?el.scrollTop/m:0; }
  function setFrac(el,f){ const m=el.scrollHeight-el.clientHeight; el.scrollTop=f*m; }
  KC.sync = function(btn){
    const p=syncPair(btn); if(!p){ toast('Open the Translation panel first'); return; }
    KC._trAlign(p.book, p.tr, true);
    btn.classList.add('flash'); setTimeout(()=>btn.classList.remove('flash'),500);
    if(!btn.classList.contains('locked')) toast('Translation aligned to Textbook');
  };
  KC.syncLock = function(btn){
    const p=syncPair(btn);
    if(!p){ toast('Open the Translation panel first'); return; }
    const locked=btn.classList.toggle('locked');
    btn.title = locked ? 'Synced scrolling on — click to unlink' : 'Sync scrolling with the Textbook — click to link';
    if(locked){ KC._trAlign(p.book, p.tr, true); }
    btn.classList.add('flash'); setTimeout(()=>btn.classList.remove('flash'),500);
    toast(locked?'Linked — Textbook & Translation scroll by heading':'Scroll unlinked');
  };
  /* heading-anchored alignment: match Translation headings to the Textbook's
     section headings (by anchor id, or by section number for sub-headings) and
     keep the same heading at the top of both panels, interpolating in between. */
  function offTop(el, sc){ return el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop; }
  KC._trPairs = function(book, tr){
    const pairs=[];
    tr.querySelectorAll('.tr-h').forEach(th=>{
      let be=null;
      const anc=th.getAttribute('data-anc');
      if(anc){ try{ be=book.querySelector('#'+(window.CSS&&CSS.escape?CSS.escape(anc):anc)); }catch(e){ be=book.querySelector('[id="'+anc+'"]'); } }
      if(!be){ const num=th.getAttribute('data-num'); if(num){ be=Array.prototype.find.call(book.querySelectorAll('.dp-h'), h=>{ const n=h.querySelector('.dp-hnum'); return n && n.textContent.trim()===num; }); } }
      if(be) pairs.push({b:be, t:th});
    });
    return pairs;
  };
  KC._trAlign = function(book, tr, fromIsBook){
    const pairs=KC._trPairs(book, tr);
    if(pairs.length<1){ if(fromIsBook) setFrac(tr, frac(book)); else setFrac(book, frac(tr)); return; }
    const from = fromIsBook?book:tr, to = fromIsBook?tr:book;
    const src = pairs.map(p=> fromIsBook?p.b:p.t), dst = pairs.map(p=> fromIsBook?p.t:p.b);
    const sT=src.map(el=>offTop(el, from)), dT=dst.map(el=>offTop(el, to));
    const S=from.scrollTop, n=pairs.length;
    const sMax=from.scrollHeight-from.clientHeight, dMax=to.scrollHeight-to.clientHeight;
    let target;
    if(S < sT[0]){ const f=sT[0]>0?S/sT[0]:0; target=dT[0]*f; }
    else {
      let i=0; while(i<n-1 && sT[i+1]<=S) i++;
      const sSpan=(i<n-1)?(sT[i+1]-sT[i]):(sMax - sT[i]);
      const dSpan=(i<n-1)?(dT[i+1]-dT[i]):(dMax - dT[i]);
      const f=sSpan>0?(S-sT[i])/sSpan:0;
      target=dT[i] + Math.max(0,Math.min(1,f))*dSpan;
    }
    to.scrollTop=Math.max(0, Math.min(dMax, target));
  };
  let syncing=false;
  function wireSync(){
    document.querySelectorAll('.workspace').forEach(ws=>{
      const book=ws.querySelector('.c2 .cb'), tr=ws.querySelector('.ctr .cb');
      if(!book||!tr) return;
      const link=(src,fromIsBook)=>src.addEventListener('scroll',()=>{
        const btn=ws.querySelector('.sync-btn');
        if(!btn||!btn.classList.contains('locked')||syncing) return;
        syncing=true; KC._trAlign(book, tr, fromIsBook); requestAnimationFrame(()=>{syncing=false;});
      },{passive:true});
      link(book,true); link(tr,false);
    });
  }

  /* ── Test translation of the open document (Project Startup) ── RU / EN / HE ── */
  KC.TR_LANGS = {
    RU:{ dir:'ltr', from:'Переведено с иврита · машинный перевод, проверено' },
    EN:{ dir:'ltr', from:'Translated from Hebrew · machine-assisted, reviewed' },
    HE:{ dir:'rtl', from:'מקור · עברית' }
  };
  KC.TR_DOC = {
    title:  { he:'פתיחת פרויקט',              ru:'Запуск проекта',                    en:'Project Startup' },
    series: { he:'מדריך עבודה ב-Revit',        ru:'Руководство по работе в Revit',      en:'Revit Working Guide' },
    blocks: [
      { k:'h', lvl:2, anchor:'sec-intro',
        he:'הקדמה', ru:'Введение', en:'Introduction' },
      { k:'p',
        he:'מטרת מסמך זה היא פירוט התהליכים והפעולות הנדרשות לפתיחת פרויקט חדש ב-Revit.',
        ru:'Цель настоящего документа — описать процессы и действия, необходимые для запуска нового проекта в Revit.',
        en:'The purpose of this document is to detail the processes and actions required to start a new project in Revit.' },
      { k:'ul', items:[
        { he:'יש להשתמש בקובץ הטמפלייט המשרדי / הטמפלייט הפרויקטלי ע"פ הנחיות הפרויקט.',
          ru:'Используйте файл офисного шаблона / проектного шаблона в соответствии с указаниями по проекту.',
          en:'Use the office template / project template file according to the project guidelines.' },
        { he:'בתחילת הפרויקט יש לבקש גישה ממנהל ה-BIM / גורם אחראי עבור כל המשתמשים שיעבדו בפרויקט (ב-Revit ובענן ACC/BIM360).',
          ru:'В начале проекта запросите у BIM-менеджера / ответственного лица доступ для всех пользователей, которые будут работать над проектом (в Revit и в облаке ACC/BIM360).',
          en:'At the start of the project, request access from the BIM manager / responsible party for every user who will work on the project (in Revit and in the ACC/BIM360 cloud).' }
      ] },
      { k:'h', lvl:2, anchor:'sec-flow',
        he:'אופן פעולה', ru:'Порядок действий', en:'Procedure' },
      { k:'h', lvl:3, num:'1', anchor:'sec-1',
        he:'מידע ראשוני נדרש', ru:'Необходимая исходная информация', en:'Required preliminary information' },
      { k:'p',
        he:'לפני שפותחים את הפרויקט ב-Revit, יש לבדוק מס\' נושאים חשובים:',
        ru:'Прежде чем открывать проект в Revit, необходимо проверить несколько важных вопросов:',
        en:'Before opening the project in Revit, check a number of important points:' },
      { k:'h', lvl:4, num:'1.1',
        he:'מי אחראי על ניהול המודלים בענן? (מנהל BIM / אדריכלות).',
        ru:'Кто отвечает за управление моделями в облаке? (BIM-менеджер / архитектура).',
        en:'Who manages the cloud models? (BIM manager / architecture).' },
      { k:'h', lvl:4, num:'1.2',
        he:'האם קיבלנו גישה לפרויקט בענן ACC/BIM360?',
        ru:'Получили ли мы доступ к проекту в облаке ACC/BIM360?',
        en:'Do we have access to the cloud project (ACC/BIM360)?' },
      { k:'p', sub:true,
        he:'היוזר/מייל שאותו מצרפים לפרויקט חייב להיות זהה לזה שבו משתמשים ב-Revit ובענן.',
        ru:'Пользователь/почта, добавляемые в проект, должны совпадать с теми, что используются в Revit и в облаке.',
        en:'The user/email added to the project must be identical to the one used in Revit and in the cloud.' },
      { k:'h', lvl:4, num:'1.3',
        he:'האם האחראי פרסם הנחיות לשימוש במודלים? (BEP – BIM Execution Plan).',
        ru:'Опубликовал ли ответственный руководство по использованию моделей? (BEP — BIM Execution Plan).',
        en:'Has the lead published model-use guidelines? (BEP – BIM Execution Plan).' },
      { k:'p', sub:true,
        he:'במידה וכן, יש לקרוא את ההנחיות ב-BEP (תכנית למימוש BIM). במידה ולא, יש ליצור קשר עם האחראי בנוגע לפרטים הבאים:',
        ru:'Если да — ознакомьтесь с указаниями в BEP (плане реализации BIM). Если нет — свяжитесь с ответственным по следующим вопросам:',
        en:'If yes, read the guidelines in the BEP (BIM Execution Plan). If not, contact the lead regarding the following details:' },
      { k:'ul', items:[
        { he:'האם עליי לפתוח את הפרויקט החדש בעצמי?',
          ru:'Должен ли я сам открывать новый проект?',
          en:'Should I open the new project myself?' },
        { he:'מה גרסת ה-Revit?',
          ru:'Какая версия Revit?',
          en:'Which Revit version?' },
        { he:'האם הפרויקט בענן ACC/BIM360 או בתוכנת שיתוף קבצים?',
          ru:'Проект в облаке ACC/BIM360 или в программе для обмена файлами?',
          en:'Is the project in the ACC/BIM360 cloud or in a file-sharing tool?' },
        { he:'האם הפרויקט בקורדינאטות? במידה וכן, מאיזה מודל מושכים קורדינאטות?',
          ru:'Проект привязан к координатам? Если да, из какой модели берутся координаты?',
          en:'Is the project georeferenced? If so, which model are coordinates acquired from?' },
        { he:'לאיזה מודל מבצעים Copy Monitor?',
          ru:'Для какой модели выполняется Copy Monitor?',
          en:'Which model is Copy Monitor performed against?' },
        { he:'במידה ומדובר במס\' מבנים – האם נדרש לפתוח מודל אחד או מס\' מודלים?',
          ru:'Если речь о нескольких зданиях — открывать одну модель или несколько?',
          en:'For multiple buildings — should we open one model or several?' },
        { he:'האם יש הנחיה להגדרת שם המודל? (קידוד מודלים).',
          ru:'Есть ли указания по именованию модели? (кодировка моделей).',
          en:'Are there naming guidelines for the model? (model coding).' },
        { he:'האם יש הנחיה להגדרת שמות הגליונות? (קידוד גליונות).',
          ru:'Есть ли указания по именованию листов? (кодировка листов).',
          en:'Are there naming guidelines for the sheets? (sheet coding).' }
      ] },
      { k:'h', lvl:4, num:'1.4',
        he:'פתיחת הפרויקט', ru:'Открытие проекта', en:'Opening the project' },
      { k:'p', sub:true,
        he:'לאחר קבלת מענה על השאלות לעיל – ניתן לפתוח פרויקט חדש בעזרת הטמפלייט המשרדי / טמפלייט פרויקטלי, להעלות את המודל לענן ולבצע את הפעולות הראשוניות לפני תחילת המידול.',
        ru:'После ответов на приведённые выше вопросы можно открыть новый проект с помощью офисного / проектного шаблона, загрузить модель в облако и выполнить первичные действия до начала моделирования.',
        en:'Once the questions above are answered, you can open a new project using the office / project template, upload the model to the cloud, and perform the initial actions before modeling begins.' },

      { k:'h', lvl:3, num:'2', anchor:'sec-2',
        he:'פתיחת פרויקט חדש', ru:'Открытие нового проекта', en:'Opening a new project' },
      { k:'p',
        he:'יש לפתוח פרויקט חדש בגרסת Revit הנדרשת, על בסיס הטמפלייט המשרדי / טמפלייט פרויקטלי:',
        ru:'Откройте новый проект в требуемой версии Revit на основе офисного / проектного шаблона:',
        en:'Open a new project in the required Revit version, based on the office / project template:' },

      { k:'h', lvl:3, num:'3', anchor:'sec-3',
        he:'העלאת מודל לענן (ACC/BIM360 Collaborate)',
        ru:'Загрузка модели в облако (ACC/BIM360 Collaborate)',
        en:'Uploading the model to the cloud (ACC/BIM360 Collaborate)' },
      { k:'h', lvl:4, num:'3.1',
        he:'שמירת המודל', ru:'Сохранение модели', en:'Saving the model' },
      { k:'p', sub:true,
        he:'יש לעבור למבט אקראי במודל, למשל מבט רצפה (לא ניתן לבצע שמירה במסך הפתיחה). לאחר מכן, יש לשמור את המודל במחשב ע"פ הקידוד הנדרש למודלים:',
        ru:'Перейдите к произвольному виду модели, например виду этажа (сохранить на стартовом экране нельзя). Затем сохраните модель на компьютере согласно требуемой кодировке моделей:',
        en:'Switch to any view in the model, e.g. a floor plan (you cannot save from the start screen). Then save the model on your computer according to the required model coding:' },
      { k:'h', lvl:4, num:'3.2',
        he:'העלאה לענן', ru:'Загрузка в облако', en:'Uploading to the cloud' },
      { k:'p', sub:true,
        he:'בהנחה שהמודל בענן ACC/BIM360 – כעת מעלים את הפרויקט לענן:',
        ru:'Если модель размещается в облаке ACC/BIM360 — теперь загрузите проект в облако:',
        en:'Assuming the model lives in the ACC/BIM360 cloud, now upload the project to the cloud:' }
    ]
  };
  KC.trRender = function(lang){
    const host=document.getElementById('w1trdoc'); if(!host) return;
    lang = KC.TR_LANGS[lang] ? lang : 'RU';
    const key = lang.toLowerCase(), L = KC.TR_LANGS[lang], D = KC.TR_DOC;
    let h = '';
    h += '<div class="tr-meta"><i data-lucide="languages"></i>'+esc(L.from)+'</div>';
    h += '<div class="tr-title" dir="'+L.dir+'">'+esc(D.title[key])+'</div>';
    h += '<div class="tr-series" dir="'+L.dir+'">'+esc(D.series[key])+'</div>';
    D.blocks.forEach(b=>{
      if(b.k==='h'){
        const num=b.num?'<span class="tr-hnum">'+esc(b.num)+'</span>':'';
        const at=(b.anchor?' data-anc="'+esc(b.anchor)+'"':'')+(b.num?' data-num="'+esc(b.num)+'"':'');
        h += '<div class="tr-h l'+(b.lvl||3)+'"'+at+' dir="'+L.dir+'">'+num+'<span>'+esc(b[key])+'</span></div>';
      } else if(b.k==='p'){
        h += '<div class="tr-p'+(b.sub?' tr-sub':'')+'" dir="'+L.dir+'">'+esc(b[key])+'</div>';
      } else if(b.k==='ul'){
        h += '<ul class="tr-ul" dir="'+L.dir+'">'+b.items.map(it=>'<li>'+esc(it[key])+'</li>').join('')+'</ul>';
      }
    });
    host.setAttribute('dir', L.dir);
    host.innerHTML = h;
    if(window.lucide&&lucide.createIcons) lucide.createIcons();
  };
  KC.trLang = function(sel){
    const lang = (sel&&sel.value) || KC.API.getPref('trLang','RU') || 'RU';
    KC.API.setPref('trLang', lang);
    document.querySelectorAll('.ctr .ls').forEach(s=>{ if(s.value!==lang) s.value=lang; });
    KC.trRender(lang);
  };

  /* ── Text-selection popup (Textbook + Notebook) ── */
  KC.closeSel=function(){ const m=document.getElementById('selmenu'); if(m)m.classList.remove('show'); };
  KC._sel=function(label){ KC.closeSel(); const s=window.getSelection&&window.getSelection(); if(s)s.removeAllRanges&&s.removeAllRanges(); toast(label); };
  function onSelect(){
    let m=document.getElementById('selmenu');
    if(!m){ m=document.createElement('div'); m.id='selmenu'; m.className='selmenu'; document.body.appendChild(m); }
    const sel=window.getSelection();
    if(!sel||sel.isCollapsed||!sel.toString().trim()){ m.classList.remove('show'); return; }
    const anc=sel.anchorNode; const el=anc&&anc.nodeType===3?anc.parentElement:anc;
    if(!el||!el.closest){ m.classList.remove('show'); return; }
    const inBook=el.closest('.c2 .cb'), inNote=el.closest('.c3 .cb');
    if(!inBook&&!inNote){ m.classList.remove('show'); return; }
    const host=inBook||inNote, wsEl=host.closest('.workspace');
    KC._selText=sel.toString().trim();
    KC._selWsIdx=wsEl?[...document.querySelectorAll('.workspace')].indexOf(wsEl):-1;
    // capture the fragment + its block so a change proposal can wrap it. Official docs only:
    // static .doc-p pages AND every text block of the read-only DocPage (paragraph, callout,
    // list item, heading) — but NOT editable custom docs. One entry point; edit/add is chosen in-card.
    const officialPara = inBook ? el.closest('.doc-p, .kc-docpage .dp-p, .kc-docpage .dp-callout, .kc-docpage .dp-list > li, .kc-docpage .dp-h') : null;
    const inCustom = !!el.closest('.kc-doc') && !el.closest('.kc-docpage');
    const canPropose = !!officialPara && !inCustom && !el.closest('.kc-sugcard');
    KC._selPara = canPropose ? officialPara : null;
    KC._selRange = canPropose && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    let html='';
    if(canPropose) html+='<button class="sel-edit" onclick="KC.proposeEdit()"><i data-lucide="file-pen-line"></i>Suggest an edit</button>';
    if(inBook) html+='<button onclick="KC.selAct(\'notebook\')"><i data-lucide="notebook-pen"></i>Add to notebook</button>';
    html+='<button onclick="KC.selAct(\'translate\')"><i data-lucide="languages"></i>Translate</button>';
    html+='<button onclick="KC.selAct(\'mentor\')"><i data-lucide="message-circle"></i>Ask mentor</button>';
    html+='<button onclick="KC.selAct(\'dict\')"><i data-lucide="book-marked"></i>Add to dictionary</button>';
    m.innerHTML=html; m.classList.add('show'); icons();
    const r=sel.getRangeAt(0).getBoundingClientRect();
    let x=r.left+r.width/2-m.offsetWidth/2; if(x<8)x=8; if(x+m.offsetWidth>innerWidth-8)x=innerWidth-m.offsetWidth-8;
    let y=r.top-m.offsetHeight-8; if(y<8) y=r.bottom+8;
    m.style.left=x+'px'; m.style.top=y+'px';
  }
  document.addEventListener('mouseup', ()=>setTimeout(onSelect,10));
  document.addEventListener('mousedown', e=>{ if(!e.target.closest('#selmenu')) KC.closeSel(); });

  /* Selection popup — real actions on the selected text, scoped to its workspace */
  KC.selAct=function(kind){
    const text=(KC._selText||'').trim(), idx=KC._selWsIdx;
    KC.closeSel();
    const s=window.getSelection&&window.getSelection(); if(s&&s.removeAllRanges) s.removeAllRanges();
    if(!text||idx<0) return;
    const ws=document.querySelectorAll('.workspace')[idx]; if(!ws) return;
    const short=text.length>46?text.slice(0,44)+'…':text;
    if(kind==='notebook'){
      const doc=ws.querySelector('.c3 .note-doc');
      if(doc){ const p=document.createElement('p'); p.innerHTML='<em>“'+esc(text)+'”</em>'; doc.appendChild(p); doc.scrollTop=doc.scrollHeight; }
      toast('Added to your notebook');
    } else if(kind==='translate'){
      const trId='w'+idx+'ctr', el=document.getElementById(trId);
      if(el&&!el.classList.contains('open')&&window.togTr) window.togTr(trId);
      toast('“'+short+'” sent to Translation');
    } else if(kind==='mentor'){
      const col=document.getElementById('w'+idx+'c4');
      if(col&&col.classList.contains('ss')&&window.xp) window.xp('w'+idx+'c4');
      const inp=ws.querySelector('.c4 .ci2');
      if(inp){ inp.value=text; inp.focus(); }
      toast('Ask the mentor about your selection');
    } else if(kind==='dict'){
      if(KC.dictAddTerm) KC.dictAddTerm(short, text);
      const ci=ws.querySelector('.c4 .ci'); if(ci) ci.classList.add('dict-open');
      toast('Added to Dictionary');
    }
  };

  /* ── NOTEBOOK · editable blocks ── */
  const NOTES = {
    w0notes:[
      {type:'text', html:'<em>“Monday.com enables teams to plan, track and manage all work in one platform.”</em>'},
      {type:'text', html:'Our main board: <b>“BIM Projects 2024”</b> — ask Yael for access', checks:[{t:'Set up my Monday profile',done:true},{t:'Join the BIM Projects board',done:false},{t:'Configure my notifications',done:false}]}
    ],
    w1notes:[
      {type:'text', html:'<em>“CDE is a shared digital space where all project information is stored throughout the lifecycle.”</em>'},
      {type:'text', html:'<b>ISO 19650 — states</b>', checks:[{t:'WIP — private to me',done:true},{t:'Shared — team can see',done:false},{t:'Published — official',done:false},{t:'Archived — read-only',done:false}]},
      {type:'image'}
    ],
    w2notes:[
      {type:'text', html:'Clash sessions every <b>Tuesday 10:00</b>. Prepare the updated model by Monday EOD.', checks:[{t:'Export IFC from Revit',done:false},{t:'Upload to ACC',done:false},{t:'Run clash in Navisworks',done:false},{t:'Log issues in Monday',done:false}]}
    ]
  };
  const TXT_COLORS = ['#111827','#1e248c','#2a93ad','#6b72d6'];
  const HILITES = ['transparent','rgba(68,184,211,.32)','rgba(129,140,248,.30)','rgba(30,36,140,.16)'];
  function blkBar(label, icon){
    return '<div class="nblk-bar"><span class="nblk-type"><i data-lucide="'+icon+'"></i>'+label+'</span>'+
      '<div class="nblk-act">'+
        '<button onclick="KC.nbMove(this,-1)" title="Move up"><i data-lucide="chevron-up"></i></button>'+
        '<button onclick="KC.nbMove(this,1)" title="Move down"><i data-lucide="chevron-down"></i></button>'+
        '<button onclick="KC.nbDel(this)" title="Delete"><i data-lucide="trash-2"></i></button>'+
      '</div></div>';
  }
  function ckItem(t,done){
    return '<div class="nci'+(done?' done':'')+'"><span class="nci-box" onclick="KC.nbCheck(this)"><i data-lucide="check"></i></span>'+
      '<div class="nci-txt" contenteditable="true">'+esc(t||'')+'</div>'+
      '<button class="nci-x" onclick="this.closest(\'.nci\').remove()" title="Remove"><i data-lucide="x"></i></button></div>';
  }
  function fmtBar(){
    const sw = (arr,fn,extra)=> arr.map(c=>'<button class="sw'+(extra||'')+'" style="--sw:'+c+'" onmousedown="return KC.'+fn+'(event,\''+c+'\')"></button>').join('');
    return '<div class="nfmt">'+
        '<button onmousedown="return KC.nfmt(event,\'bold\')" title="Bold"><b>B</b></button>'+
        '<button onmousedown="return KC.nfmt(event,\'italic\')" title="Italic"><i>I</i></button>'+
        '<button onmousedown="return KC.nfmt(event,\'underline\')" title="Underline"><u>U</u></button>'+
        '<span class="nfmt-sep"></span>'+
        '<button class="swatch-tog" onmousedown="return KC.swTog(event,this)" title="Text color"><span class="aGlyph">A</span><i data-lucide="chevron-down"></i></button>'+
        '<button class="swatch-tog" onmousedown="return KC.swTog(event,this)" title="Highlight"><i data-lucide="highlighter"></i><i data-lucide="chevron-down"></i></button>'+
        '<span class="nfmt-sep"></span>'+
        '<button onmousedown="return KC.nfmt(event,\'insertUnorderedList\')" title="Bullet list"><i data-lucide="list"></i></button>'+
        '<button onmousedown="return KC.nfmt(event,\'insertOrderedList\')" title="Numbered list"><i data-lucide="list-ordered"></i></button>'+
        '<button onclick="KC.nbAddCheck(this)" title="Add checklist item"><i data-lucide="list-checks"></i></button>'+
        '<div class="sw-tray sw-text">'+sw(TXT_COLORS,'nbColor')+'</div>'+
        '<div class="sw-tray sw-hl">'+sw(HILITES,'nbHilite',' sw-ring')+'</div>'+
      '</div>';
  }
  function makeBlock(b){
    const el=document.createElement('div');
    el.className='nblk'; el.dataset.type=b.type;
    if(b.type==='image'){
      el.innerHTML=blkBar('Screenshot','image')+'<div class="nimg">'+
        '<label class="nimg-drop"><input type="file" accept="image/*" hidden onchange="KC.nbImg(this)">'+
        '<i data-lucide="image-plus"></i><span>Click or drop a screenshot</span></label></div>';
    } else {
      const checks=(b.checks||[]).map(i=>ckItem(i.t,i.done)).join('');
      el.innerHTML=blkBar('Note','align-left')+fmtBar()+
        '<div class="nedit" contenteditable="true" data-ph="Write a note…">'+(b.html||'')+'</div>'+
        '<div class="nchecks">'+checks+'</div>';
    }
    return el;
  }
  function renderNotes(){
    for(const id in NOTES){ const c=document.getElementById(id); if(!c) continue; c.innerHTML=''; NOTES[id].forEach(b=>c.appendChild(makeBlock(b))); }
    icons();
    // image drag-drop
    document.querySelectorAll('.nimg-drop').forEach(wireDrop);
  }
  KC.nbMenu=function(btn){
    const menu=btn.previousElementSibling;
    const open=menu.classList.toggle('show');
    if(open){ const close=e=>{ if(!e.target.closest('.nbadd-wrap')){ menu.classList.remove('show'); document.removeEventListener('click',close);} }; setTimeout(()=>document.addEventListener('click',close),0); }
  };
  KC.nbAdd=function(btn,type){
    const wrap=btn.closest('.nbadd-wrap');
    const list=wrap.previousElementSibling; // .nblocks
    const node=makeBlock({type});
    list.appendChild(node); icons();
    if(type==='image') wireDrop(node.querySelector('.nimg-drop'));
    wrap.querySelector('.nbadd-menu').classList.remove('show');
    const ed=node.querySelector('.nedit,.nci-txt'); if(ed) ed.focus();
  };
  KC.nbDel=function(btn){ btn.closest('.nblk').remove(); };
  KC.nbMove=function(btn,dir){
    const blk=btn.closest('.nblk');
    if(dir<0){ const p=blk.previousElementSibling; if(p&&p.classList.contains('nblk')) blk.parentNode.insertBefore(blk,p); }
    else { const n=blk.nextElementSibling; if(n&&n.classList.contains('nblk')) blk.parentNode.insertBefore(n,blk); }
  };
  KC.nfmt=function(ev,cmd){ ev.preventDefault(); try{ document.execCommand(cmd,false,null); }catch(e){} return false; };
  KC.nbColor=function(ev,c){ ev.preventDefault(); try{ document.execCommand('foreColor',false,c); }catch(e){} return false; };
  KC.nbHilite=function(ev,c){ ev.preventDefault(); try{ document.execCommand('hiliteColor',false,c)||document.execCommand('backColor',false,c); }catch(e){} return false; };
  KC.swTog=function(ev,btn){
    ev.preventDefault();
    const bar=btn.closest('.nfmt');
    const togs=[...bar.querySelectorAll('.swatch-tog')];
    const which=togs.indexOf(btn); // 0=text,1=highlight
    const tray=bar.querySelector(which===0?'.sw-text':'.sw-hl');
    const other=bar.querySelector(which===0?'.sw-hl':'.sw-text');
    if(other) other.classList.remove('show');
    tray.classList.toggle('show');
    return false;
  };
  KC.nbCheck=function(box){ box.closest('.nci').classList.toggle('done'); };
  KC.nbAddCheck=function(btn){
    const blk=btn.closest('.nblk');
    const wrap=blk.querySelector('.nchecks');
    const tmp=document.createElement('div'); tmp.innerHTML=ckItem('',false);
    const item=tmp.firstChild; wrap.appendChild(item); icons();
    item.querySelector('.nci-txt').focus();
  };
  KC.nbImg=function(input){
    const f=input.files&&input.files[0]; if(!f) return; loadImg(input.closest('.nimg'), f);
  };
  function loadImg(box, file){
    const r=new FileReader();
    r.onload=()=>{ box.innerHTML='<img src="'+r.result+'" alt=""><div class="nimg-cap" contenteditable="true" data-ph="Add a caption…"></div>'; };
    r.readAsDataURL(file);
  }
  function wireDrop(drop){
    if(!drop||drop._wired) return; drop._wired=true;
    drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('over');});
    drop.addEventListener('dragleave',()=>drop.classList.remove('over'));
    drop.addEventListener('drop',e=>{ e.preventDefault(); drop.classList.remove('over'); const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f&&f.type.startsWith('image/')) loadImg(drop.closest('.nimg'),f); });
  }

  /* manual resize of columns — auto by default; drag to override, double-click to reset.
     Clamp keeps the dragged column within the visible viewport (others can't be pushed
     below their minimums), so space is divided strictly inside the screen. */
  KC.startResize = function(ev, targetId, dir){
    ev.preventDefault();
    const col = targetId ? document.getElementById(targetId) : ev.target.closest('.col');
    if(!col) return;
    const ws = col.closest('.workspace');
    const startX = ev.clientX, startW = col.getBoundingClientRect().width;
    const sign = dir==='left' ? -1 : 1;
    const floor = col.classList.contains('ctr') ? 296 : 212;
    // available content width and the space the OTHER columns must keep
    const cs = getComputedStyle(ws);
    const padX = parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.gap)||12;
    const cols = [...ws.children].filter(c=>c.classList.contains('col'));
    const avail = ws.clientWidth - padX - gap*(cols.length-1);
    const canShrink = c=>{ const f=getComputedStyle(c); return parseFloat(f.flexGrow)>0 && parseFloat(f.flexShrink)>0; };
    const effMin = c=>{
      if(c.classList.contains('slim')) return c.getBoundingClientRect().width;
      if(canShrink(c)) return parseFloat(getComputedStyle(c).minWidth)||0;
      return c.getBoundingClientRect().width; // fixed columns keep their width
    };
    let othersMin = 0; cols.forEach(c=>{ if(c!==col) othersMin += effMin(c); });
    const maxW = Math.max(floor, avail - othersMin);
    col.style.minWidth='0';
    function mv(e){ let w = startW + sign*(e.clientX - startX); w = Math.max(floor, Math.min(maxW, w)); col.style.flex = '0 0 '+w+'px'; }
    function up(){ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); document.body.style.cursor=''; document.body.style.userSelect=''; }
    document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
    document.body.style.cursor='col-resize'; document.body.style.userSelect='none';
  };
  KC.resetCol = function(id){ const c=document.getElementById(id); if(c){ c.style.flex=''; c.style.minWidth=''; } };

  /* ── Column resizing via gap dividers ──────────────────────────────────
     Two neighbours are resized as a PAIR: drag right → left grows / right
     shrinks by the same amount (and vice-versa). Their combined width stays
     constant, so only the divider moves — never the far edges. Each side is
     clamped to its min-width. */
  function colFloor(c){ const m=parseFloat(getComputedStyle(c).minWidth); return (m&&m>0)?m:(c.classList.contains('c1')?200:212); }

  // Drive a pair resize from an in-progress pointer drag. Returns a mousemove handler.
  function pairDragger(A, B, startX){
    const aw=A.getBoundingClientRect().width, bw=B.getBoundingClientRect().width, total=aw+bw;
    const minA=colFloor(A), minB=colFloor(B), ws=A.closest('.workspace');
    return function(clientX){
      let newA=Math.max(minA, Math.min(total-minB, aw+(clientX-startX)));
      A.style.minWidth='0'; A.style.flex='0 0 '+newA+'px';
      B.style.minWidth='0'; B.style.flex='0 0 '+(total-newA)+'px';
      KC.layoutSplits(ws);
    };
  }

  // Position every divider over the real gap between its two columns; hide it
  // if either neighbour is collapsed to a spine. Special seams around Translation:
  //  • .mid (Textbook|Notebook) anchors to the RIGHT edge of the Translation peek
  //    (Textbook+Translation act as one unit) and hides while the drawer is open;
  //  • .trl (Textbook|Translation) sits on the Textbook's right edge and shows ONLY
  //    while the drawer is open.
  KC.layoutSplits = function(ws){
    if(!ws||!ws.classList.contains('active')) return;
    const wr=ws.getBoundingClientRect();
    const ctr0=ws.querySelector('.ctr');
    // Translation can be switched off entirely (body.tr-off) — then it is not rendered
    // and the Textbook|Notebook seam must sit on the Textbook's own right edge.
    const ctr=(ctr0&&ctr0.getClientRects().length)?ctr0:null;
    const open=ctr&&ctr.classList.contains('open');
    ws.querySelectorAll('.splitbar').forEach(bar=>{
      const A=document.getElementById(bar.dataset.l), B=document.getElementById(bar.dataset.r);
      const mid=bar.classList.contains('mid'), trl=bar.classList.contains('trl');
      let hide = !A||!B||A.classList.contains('slim')||B.classList.contains('slim');
      if(trl && !open) hide=true;
      if(hide){ bar.classList.add('hidden'); return; }
      bar.classList.remove('hidden');
      let center;
      if(trl){
        center = A.getBoundingClientRect().right;                         // seam = Textbook's right edge
      } else {
        const leftEdge = (mid && ctr) ? ctr.getBoundingClientRect().right : A.getBoundingClientRect().right;
        center = (leftEdge + B.getBoundingClientRect().left)/2;
      }
      bar.style.left=(center - wr.left - bar.offsetWidth/2)+'px';
    });
  };

  // Overlay divider (Plan|Textbook, Notebook|Mentor, Textbook|Notebook, Textbook|Translation).
  KC.startSplit = function(ev, bar){
    ev.preventDefault();
    let A=document.getElementById(bar.dataset.l), B=document.getElementById(bar.dataset.r);
    // Textbook|Notebook seam: while the drawer is open the left neighbour IS the Translation page
    if(bar.classList.contains('mid')){
      const ws=bar.closest('.workspace'), ctr=ws&&ws.querySelector('.ctr');
      if(ctr&&ctr.classList.contains('open')) A=ctr;
    }
    if(!A||!B||A.classList.contains('slim')||B.classList.contains('slim')) return;
    const drag=pairDragger(A, B, ev.clientX);
    bar.classList.add('dragging');
    const ta=A.style.transition, tb=B.style.transition;
    A.style.transition='none'; B.style.transition='none';   // drawer animates flex-basis — kill lag while dragging
    function mv(e){ drag(e.clientX); }
    function up(){ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); document.body.style.cursor=''; document.body.style.userSelect=''; bar.classList.remove('dragging'); A.style.transition=ta; B.style.transition=tb; }
    document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
    document.body.style.cursor='col-resize'; document.body.style.userSelect='none';
  };

  /* Translation page tab on the Textbook's right edge: click = open / close. */
  KC.trTab = function(ev, id){ ev.preventDefault(); togTr(id); };

  /* ── NOTEBOOK doc (single free-writing space) ── */
  KC.dfmt = function(ev,cmd){ ev.preventDefault(); try{ document.execCommand(cmd,false,null); }catch(e){} return false; };
  KC.dcolor = function(ev,c){ ev.preventDefault(); try{ document.execCommand('foreColor',false,c); }catch(e){} return false; };
  KC.dhl = function(ev,c){ ev.preventDefault(); try{ document.execCommand('hiliteColor',false,c)||document.execCommand('backColor',false,c); }catch(e){} return false; };
  KC.dsw = function(ev,btn,kind){
    ev.preventDefault();
    const bar=btn.closest('.note-bar');
    const tray=bar.querySelector(kind==='text'?'.sw-text':'.sw-hl');
    const other=bar.querySelector(kind==='text'?'.sw-hl':'.sw-text');
    if(other) other.classList.remove('show');
    tray.classList.toggle('show');
    return false;
  };
  KC.docCheck = function(box){ const on=box.classList.toggle('checked'); const row=box.closest('.docck'); if(row) row.classList.toggle('done',on); };
  function noteDoc(btn){ const ci=btn.closest('.ci'); return ci?ci.querySelector('.note-doc'):null; }
  KC.dcheck = function(ev,btn){
    ev.preventDefault();
    const doc=noteDoc(btn); if(!doc) return false;
    const row=document.createElement('div'); row.className='docck';
    row.innerHTML='<span class="docck-box" contenteditable="false" onclick="KC.docCheck(this)"></span><span>&nbsp;</span>';
    doc.appendChild(row);
    const txt=row.querySelector('span:last-child');
    const r=document.createRange(); r.selectNodeContents(txt); r.collapse(true);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); doc.focus();
    return false;
  };
  KC.dimg = function(btn){
    const doc=noteDoc(btn); if(!doc) return;
    const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
    inp.onchange=()=>{ const f=inp.files&&inp.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ const img=document.createElement('img'); img.src=r.result; doc.appendChild(img); }; r.readAsDataURL(f); };
    inp.click();
  };

  /* ── Download: Textbook / Notebook / tree nodes (files → doc, folders → zip) ── */
  function safeName(s){ return (String(s||'').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim())||'untitled'; }
  function dlBlob(filename, blob){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
  }
  function dlText(filename, str, mime){ dlBlob(filename, new Blob([str], {type:(mime||'text/html')+';charset=utf-8'})); }
  var EB_YEAR = new Date().getFullYear();
  /* Branded WEB PAGE — self-contained, authored/copyright marks baked in */
  function buildDoc(title, bodyHTML){
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' — EasyBIM Knowledge Center</title>'+
      '<style>'+
      ':root{--nv:#1e248c;--cy:#44b8d3}*{box-sizing:border-box}'+
      'body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;color:#111827;line-height:1.72;background:#f4f7fb}'+
      '.doc-wrap{max-width:760px;margin:0 auto;padding:0 22px 64px}'+
      '.doc-head{display:flex;align-items:center;gap:12px;padding:24px 0 18px;border-bottom:1px solid #e2e8f5;margin-bottom:26px}'+
      '.doc-logo{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--nv),var(--cy));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;flex-shrink:0}'+
      '.doc-brand{display:flex;flex-direction:column;line-height:1.25}'+
      '.doc-brand b{color:var(--nv);font-size:14px}'+
      '.doc-brand span{font:600 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.11em;text-transform:uppercase;color:var(--cy)}'+
      'h1{color:var(--nv);font-size:27px;margin:4px 0 20px;line-height:1.2}'+
      'h1:after{content:"";display:block;width:54px;height:3px;border-radius:3px;background:linear-gradient(90deg,var(--nv),var(--cy));margin-top:12px}'+
      'img{max-width:100%;border-radius:9px;margin:8px 0}'+
      'blockquote{border-left:3px solid var(--cy);margin:12px 0;padding-left:14px;color:#4b5563;font-style:italic}'+
      'ul,ol{padding-left:22px}mark{background:#dcf3f9;padding:1px 4px;border-radius:4px}a{color:var(--nv)}'+
      '.doc-foot{margin-top:46px;padding-top:16px;border-top:1px solid #e2e8f5;font-size:11.5px;color:#6b7280;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}'+
      '.doc-foot .cr{font-weight:600;color:#4b5563}'+
      '.wm{position:fixed;bottom:14px;right:16px;font:600 9px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:rgba(30,36,140,.14);pointer-events:none}'+
      '@media print{body{background:#fff}}'+
      '</style></head><body><div class="doc-wrap">'+
      '<div class="doc-head"><div class="doc-logo">EB</div><div class="doc-brand"><b>EasyBIM</b><span>Knowledge Center</span></div></div>'+
      '<h1>'+esc(title)+'</h1>'+(bodyHTML||'')+
      '<div class="doc-foot"><span class="cr">© '+EB_YEAR+' EasyBIM · Innovative Engineering</span><span>Exported from the EasyBIM Knowledge Center · For internal use only</span></div>'+
      '</div><div class="wm">EasyBIM · Confidential</div></body></html>';
  }
  /* EDITABLE DOCUMENT — Word / Google-Docs-friendly HTML saved as .doc */
  function editableDoc(title, bodyHTML){
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>'+esc(title)+'</title>'+
      '<style>'+
      '@page{size:A4;margin:2cm}'+
      'body{font-family:Calibri,Arial,sans-serif;color:#111827;line-height:1.6;font-size:11.5pt}'+
      '.eb-cr{font-family:Consolas,monospace;font-size:8pt;letter-spacing:.08em;text-transform:uppercase;color:#44b8d3;font-weight:bold;margin:0 0 4pt}'+
      'h1{color:#1e248c;font-size:19pt;border-bottom:2px solid #44b8d3;padding-bottom:6pt;margin:0 0 14pt}'+
      'img{max-width:100%}blockquote{border-left:3px solid #44b8d3;padding-left:12pt;color:#4b5563;font-style:italic}'+
      'mark{background:#dcf3f9}a{color:#1e248c}'+
      '.eb-foot{margin-top:22pt;border-top:1px solid #cbd5e1;padding-top:8pt;font-size:8.5pt;color:#6b7280}'+
      '</style></head><body>'+
      '<p class="eb-cr">EasyBIM · Knowledge Center</p>'+
      '<h1>'+esc(title)+'</h1>'+(bodyHTML||'')+
      '<div class="eb-foot">© '+EB_YEAR+' EasyBIM · Innovative Engineering. Exported from the EasyBIM Knowledge Center for internal use.</div>'+
      '</body></html>';
  }
  /* Unified download: reads KC._dlCtx set by bookMenu / noteMenu */
  KC.doDownload = function(fmt){
    const ctx=KC._dlCtx; KC.closeMenu(); if(!ctx||!ctx.ci) return;
    const ci=ctx.ci; let title, body;
    if(ctx.kind==='textbook'){
      // A rich DocPage (official document) downloads as its polished shareable page
      const dp=ci.querySelector('.kc-docpage');
      if(dp && KC.DocPage){
        const nm=(KC.DocPage.data&&KC.DocPage.data.title)||'Document';
        Promise.all([KC.DocPage.loadLogo(), KC.DocPage.loadFigures()]).then(function(r){
          const logo=r[0], brand='EasyBIM Knowledge Center — '+nm;
          if(fmt==='doc'){ dlText(safeName(brand)+'.html', KC.DocPage.editableHTML()); toast('Downloading “'+nm+'” · editable document'); }
          else { dlText(safeName(brand)+'.html', KC.DocPage.standaloneHTML(logo)); toast('Downloading “'+nm+'” · web page'); }
        });
        return;
      }
      const cb=ci.querySelector('.cb'), cur=ci.querySelector('.bcrumb .bc-cur');
      title=cur?cur.textContent.trim():'Textbook';
      const clone=cb?cb.cloneNode(true):document.createElement('div');
      clone.querySelectorAll('.bcrumb,.pm,.hnd,.tr-tab,.selmenu,.kc-bm,.kc-tab').forEach(e=>e.remove());
      clone.querySelectorAll('[data-pidx]').forEach(e=>{ e.removeAttribute('data-pidx'); e.classList.remove('bk-set','bk-l','bk-r'); e.style.position=''; if(!e.getAttribute('style')) e.removeAttribute('style'); });
      body=clone.innerHTML;
    } else {
      const doc=ci.querySelector('.note-doc'), head=ci.querySelector('.ch .ct');
      title=head?head.textContent.trim():'Notebook';
      body=doc?doc.innerHTML:'<p><em>Empty notebook.</em></p>';
    }
    const brand='EasyBIM Knowledge Center — '+title;
    if(fmt==='doc'){ dlText(safeName(brand)+'.doc', editableDoc(title,body), 'application/msword'); toast('Downloading “'+title+'” · editable document'); }
    else { dlText(safeName(brand)+'.html', buildDoc(title,body)); toast('Downloading “'+title+'” · web page'); }
  };

  KC.dlTextbook = function(btn){
    const ci=btn.closest('.ci'); if(!ci) return;
    const cb=ci.querySelector('.cb');
    const cur=ci.querySelector('.bcrumb .bc-cur');
    const title=cur?cur.textContent.trim():'Textbook';
    const clone=cb?cb.cloneNode(true):document.createElement('div');
    clone.querySelectorAll('.bcrumb,.pm,.hnd,.tr-tab,.selmenu,.kc-bm,.kc-tab').forEach(e=>e.remove());
    clone.querySelectorAll('[data-pidx]').forEach(e=>{ e.removeAttribute('data-pidx'); e.classList.remove('bk-set','bk-l','bk-r'); e.style.position=''; if(!e.getAttribute('style')) e.removeAttribute('style'); });
    dlText(safeName('EasyBIM Knowledge Center — '+title)+'.html', buildDoc(title, clone.innerHTML));
    toast('Downloading “'+title+'”');
  };
  KC.dlNotebook = function(btn){
    const ci=btn.closest('.ci'); if(!ci) return;
    const doc=ci.querySelector('.note-doc');
    const head=ci.querySelector('.ch .ct');
    const title=head?head.textContent.trim():'Notebook';
    dlText(safeName('EasyBIM Knowledge Center — '+title)+'.html', buildDoc(title, doc?doc.innerHTML:'<p><em>Empty notebook.</em></p>'));
    toast('Downloading your notes');
  };

  function placeholderBody(name){ return '<p>Study document for <strong>'+esc(name)+'</strong> — export it, edit offline, or share with your team.</p>'; }
  /* resolve ONE leaf node's exportable content in the chosen format. This is the single
     seam real per-document content plugs into (DocPage today; any authored page tomorrow) —
     everything else still falls back to a placeholder, rendered through the same branded
     templates as a real doc so format stays consistent across the whole download. */
  function resolveLeafExport(node, ws, fmt){
    const title=(node.querySelector(':scope > .row .row-name')?.textContent||'Untitled').trim();
    if(node.dataset.doc && KC.DocPage){
      return Promise.all([KC.DocPage.loadLogo(), KC.DocPage.loadFigures()]).then(function(r){
        const logo=r[0];
        return fmt==='doc'
          ? {ext:'.html', mime:'text/html', content:KC.DocPage.editableHTML()}
          : {ext:'.html', mime:'text/html', content:KC.DocPage.standaloneHTML(logo)};
      });
    }
    if(node.classList.contains('custom')){
      const docs=KC.loadDocs(); const saved=docs[docIdFor(ws,node)];
      const body=(saved&&saved.html)?saved.html:'<p><em>Empty document.</em></p>';
      return fmt==='doc'
        ? {ext:'.doc', mime:'application/msword', content:editableDoc(title, body)}
        : {ext:'.html', mime:'text/html', content:buildDoc(title, body)};
    }
    const body=placeholderBody(title);
    return fmt==='doc'
      ? {ext:'.doc', mime:'application/msword', content:editableDoc(title, body)}
      : {ext:'.html', mime:'text/html', content:buildDoc(title, body)};
  }
  /* every leaf under a node, skipping muted rows and (optionally) personal documents.
     Folders with no remaining files are simply never created — no empty-folder markers. */
  function collectLeaves(node, path, ws, includeCustom, out){
    if(!includeCustom && node.classList.contains('custom')) return;
    const row=node.querySelector(':scope > .row');
    const name=safeName(row.querySelector('.row-name')?.textContent||'topic');
    const kids=node.querySelector(':scope > .kids');
    if(kids){
      const childNodes=[...kids.querySelectorAll(':scope > .node')].filter(c=>!c.querySelector(':scope > .row').classList.contains('row-muted'));
      childNodes.forEach(c=>collectLeaves(c, path+name+'/', ws, includeCustom, out));
    } else {
      out.push({node, path, name});
    }
  }

  /* ── folder / document download dialog: pick format (+ scope for folders) ── */
  function ensureDlDOM(){
    let bg=document.getElementById('dlBg'); if(bg) return bg;
    bg=document.createElement('div'); bg.className='snd-bg'; bg.id='dlBg';
    bg.innerHTML='<div class="snd-modal dl-modal" id="dlModal"></div>';
    document.body.appendChild(bg);
    bg.addEventListener('click', e=>{ if(e.target===bg) KC.dlClose(); });
    return bg;
  }
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ const bg=document.getElementById('dlBg'); if(bg&&bg.classList.contains('show')) KC.dlClose(); } });
  KC.dlClose=function(){ const bg=document.getElementById('dlBg'); if(bg) bg.classList.remove('show'); };
  let DL_STATE=null;
  function dlRender(){
    const s=DL_STATE; const m=document.getElementById('dlModal'); if(!m||!s) return;
    m.innerHTML=
      '<div class="snd-head"><div class="snd-head-l"><div class="snd-ic"><i data-lucide="'+(s.isFolder?'folder-down':'download')+'"></i></div>'+
        '<div><div class="snd-title">Download '+(s.isFolder?'folder':'document')+'</div>'+
        '<div class="snd-doc" title="'+esc(s.name)+'"><i data-lucide="'+(s.isFolder?'folder':'file-text')+'"></i>'+esc(s.name)+'</div></div></div>'+
        '<button class="snd-x" onclick="KC.dlClose()"><i data-lucide="x"></i></button></div>'+
      '<div class="snd-body">'+
        '<div class="dl-sec"><div class="dl-sec-lbl">Format</div><div class="dl-fmt-grid">'+
          '<button class="dl-fmt-opt'+(s.fmt==='web'?' sel':'')+'" onclick="KC.dlSetFmt(\'web\')"><i data-lucide="globe"></i><span>Web page</span><small>Polished, read-only</small></button>'+
          '<button class="dl-fmt-opt'+(s.fmt==='doc'?' sel':'')+'" onclick="KC.dlSetFmt(\'doc\')"><i data-lucide="file-text"></i><span>Editable document</span><small>Opens in Word / Docs</small></button>'+
        '</div></div>'+
        (s.isFolder&&s.hasCustom?
          '<div class="dl-sec"><div class="dl-sec-lbl">Personal documents</div><div class="kc-sugmodes dl-toggle">'+
            '<button type="button" class="kc-sugmode'+(s.includeCustom?' active':'')+'" onclick="KC.dlSetIncludeCustom(true)"><i data-lucide="check"></i>Include</button>'+
            '<button type="button" class="kc-sugmode'+(!s.includeCustom?' active':'')+'" onclick="KC.dlSetIncludeCustom(false)"><i data-lucide="x"></i>Official only</button>'+
          '</div></div>' : '')+
        '<button class="dl-go" onclick="KC.dlConfirm()"><i data-lucide="download"></i>Download'+(s.isFolder?' .zip':'')+'</button>'+
      '</div>';
    icons();
  }
  KC.dlSetFmt=function(f){ if(DL_STATE){ DL_STATE.fmt=f; dlRender(); } };
  KC.dlSetIncludeCustom=function(v){ if(DL_STATE){ DL_STATE.includeCustom=v; dlRender(); } };
  KC.dlConfirm=function(){
    const s=DL_STATE; if(!s) return; KC.dlClose();
    const ws=s.node.closest('.workspace');
    const brand='EasyBIM Knowledge Center — '+s.name;
    if(!s.isFolder){
      Promise.resolve(resolveLeafExport(s.node, ws, s.fmt)).then(function(r){
        dlText(safeName(brand)+r.ext, r.content, r.mime);
        toast('Downloading “'+s.name+'” · '+(s.fmt==='doc'?'editable document':'web page'));
      });
      return;
    }
    const leaves=[];
    const kids=s.node.querySelector(':scope > .kids');
    if(kids) [...kids.querySelectorAll(':scope > .node')].filter(c=>!c.querySelector(':scope > .row').classList.contains('row-muted')).forEach(c=>collectLeaves(c,'',ws,s.includeCustom,leaves));
    Promise.all(leaves.map(l=>Promise.resolve(resolveLeafExport(l.node, ws, s.fmt)).then(r=>({name:l.path+l.name+r.ext, str:r.content}))))
      .then(function(files){
        if(!files.length){ toast('Nothing to download in this folder'); return; }
        dlBlob(safeName(brand)+'.zip', makeZip(files));
        toast('Downloading “'+s.name+'” as an archive · '+(s.fmt==='doc'?'editable documents':'web pages'));
      });
  };
  KC.dlNode = function(){
    const node=curNode; KC.closeMenu(); if(!node) return;
    const row=node.querySelector(':scope > .row');
    const name=row.querySelector('.row-name')?.textContent.trim()||'topic';
    const isFolder=!!node.querySelector(':scope > .kids');
    DL_STATE={ node, name, isFolder, hasCustom:isFolder&&!!node.querySelector('.node.custom'), fmt:'web', includeCustom:true };
    ensureDlDOM(); dlRender();
    document.getElementById('dlBg').classList.add('show');
  };

  /* minimal store-only (no compression) ZIP writer — produces a valid .zip */
  function crc32(bytes){ let c=~0; for(let i=0;i<bytes.length;i++){ c^=bytes[i]; for(let k=0;k<8;k++) c=(c>>>1)^(0xEDB88320&-(c&1)); } return (~c)>>>0; }
  function makeZip(files){
    const enc=s=>new TextEncoder().encode(s);
    const u16=n=>[n&0xff,(n>>>8)&0xff];
    const u32=n=>[n&0xff,(n>>>8)&0xff,(n>>>16)&0xff,(n>>>24)&0xff];
    const parts=[], central=[]; let offset=0;
    for(const f of files){
      const nameB=enc(f.name), data=enc(f.str||''); const crc=crc32(data);
      const lh=new Uint8Array([].concat(u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nameB.length),u16(0)));
      parts.push(lh,nameB,data);
      central.push(new Uint8Array([].concat(u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nameB.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset))), nameB);
      offset+=lh.length+nameB.length+data.length;
    }
    let cSize=0; central.forEach(c=>cSize+=c.length);
    const eocd=new Uint8Array([].concat(u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(cSize),u32(offset),u16(0)));
    return new Blob([...parts,...central,eocd], {type:'application/zip'});
  }

  window.KC = KC;

  /* ============================================================
     Reusable LINK CARD — external multi-format content
     (YouTube video / PDF / generic link). One renderer, used by
     both the Textbook (inside topic content) and the Notebook
     (inserted from the note-bar). Hover shows a shared floating
     glass preview (--glass / --glass-bd / --sh-pop).
     ============================================================ */
  function ytId(url){ const m=String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/); return m?m[1]:null; }
  function driveVideoId(url){ const m=String(url).match(/drive\.google\.com\/file\/d\/([\w-]+)/); return m?m[1]:null; }
  function domainOf(url){ try{ return new URL(url).hostname.replace(/^www\./,''); }catch(e){ return String(url).replace(/^https?:\/\//,'').split('/')[0]||'link'; } }
  function cardMeta(url){
    const yt=ytId(url);
    if(yt) return {type:'video', icon:'play-circle', source:'YouTube', title:'YouTube video', yt};
    const drive=driveVideoId(url);
    if(drive) return {type:'video', icon:'play-circle', source:'Google Drive', title:'Google Drive video', drive};
    if(/\.pdf(\?|#|$)/i.test(url)){ const f=decodeURIComponent((url.split(/[?#]/)[0].split('/').pop())||'')||'Document.pdf'; return {type:'pdf', icon:'file-text', source:domainOf(url), title:f}; }
    return {type:'link', icon:'link', source:domainOf(url), title:domainOf(url)};
  }
  // Single source of truth for card markup — returns an HTML string.
  KC.renderLinkCard = function(url, title){
    const m=cardMeta(url); const t=title||m.title;
    return '<a class="lcard" data-type="'+m.type+'" data-url="'+attr(url)+'"'+(m.yt?' data-yt="'+m.yt+'"':'')+(m.drive?' data-drive="'+attr(m.drive)+'"':'')+(title?' data-fixed="1"':'')+
      ' href="'+attr(url)+'" target="_blank" rel="noopener noreferrer" contenteditable="false">'+
      '<span class="lcard-ic"><i data-lucide="'+m.icon+'"></i></span>'+
      '<span class="lcard-body"><span class="lcard-title">'+esc(t)+'</span>'+
        '<span class="lcard-src"><i data-lucide="'+m.icon+'"></i>'+esc(m.source)+'</span></span>'+
      '<span class="lcard-go"><i data-lucide="external-link"></i></span>'+
    '</a>';
  };
  KC.linkCardEl = function(url, title){ const d=document.createElement('div'); d.innerHTML=KC.renderLinkCard(url,title); return d.firstChild; };

  /* shared floating preview */
  let prevCard=null;
  function ensurePrev(){ let p=document.getElementById('lcardPrev'); if(!p){ p=document.createElement('div'); p.id='lcardPrev'; p.className='lcard-preview'; document.body.appendChild(p); } return p; }
  function prevContent(card){
    const type=card.dataset.type, yt=card.dataset.yt, drive=card.dataset.drive;
    const title=(card.querySelector('.lcard-title')||{}).textContent||'';
    const src=(card.querySelector('.lcard-src')||{}).textContent||'';
    let media;
    if(type==='video' && yt) media='<img class="lcard-thumb" src="https://img.youtube.com/vi/'+yt+'/hqdefault.jpg" alt="">';
    else if(type==='video' && drive) media='<img class="lcard-thumb" src="https://drive.google.com/thumbnail?id='+drive+'&sz=w400" alt="">';
    else if(type==='pdf') media='<div class="lcard-ph"><i data-lucide="file-text"></i><span>PDF preview</span></div>'; // TODO: real PDF first-page render
    else media='<div class="lcard-ph"><i data-lucide="link"></i><span>'+esc(src)+'</span></div>';
    return media+'<div class="lcard-ptitle">'+esc(title)+'</div>';
  }
  function positionPrev(card,p){
    const r=card.getBoundingClientRect();
    p.style.visibility='hidden'; p.style.display='block';
    const pw=p.offsetWidth, ph=p.offsetHeight;
    let left=r.left; if(left+pw>innerWidth-10) left=innerWidth-pw-10; if(left<10) left=10;
    let top=r.top-ph-8; if(top<10) top=r.bottom+8;
    p.style.left=left+'px'; p.style.top=top+'px'; p.style.visibility='';
  }
  function showPrev(card){ prevCard=card; const p=ensurePrev(); p.innerHTML=prevContent(card); icons(); positionPrev(card,p); requestAnimationFrame(()=>p.classList.add('show')); enrichCard(card); }
  function hidePrev(){ const p=document.getElementById('lcardPrev'); if(p)p.classList.remove('show'); prevCard=null; }
  function enrichCard(card){
    if(card.dataset.type!=='video' || card.dataset.drive || card.dataset.enriched) return;
    card.dataset.enriched='1';
    fetch('https://www.youtube.com/oembed?url='+encodeURIComponent(card.dataset.url)+'&format=json')
      .then(r=>r.ok?r.json():null).then(d=>{
        if(!d) return;
        if(d.title && !card.dataset.fixed){ const t=card.querySelector('.lcard-title'); if(t)t.textContent=d.title; }
        if(prevCard===card){
          const pt=document.querySelector('#lcardPrev .lcard-ptitle'); if(pt && d.title && !card.dataset.fixed) pt.textContent=d.title;
          const im=document.querySelector('#lcardPrev .lcard-thumb'); if(im && d.thumbnail_url) im.src=d.thumbnail_url;
        }
      }).catch(()=>{});
  }
  // hover + click delegation (works for cards in Textbook and Notebook)
  document.addEventListener('mouseover', e=>{ const c=e.target.closest&&e.target.closest('.lcard'); if(c && c!==prevCard) showPrev(c); });
  document.addEventListener('mouseout', e=>{ const c=e.target.closest&&e.target.closest('.lcard'); if(!c) return; const to=e.relatedTarget; if(!to||!to.closest||(!to.closest('.lcard')&&!to.closest('#lcardPrev'))) hidePrev(); });
  document.addEventListener('click', e=>{ const c=e.target.closest&&e.target.closest('.lcard'); if(c && c.closest('[contenteditable="true"]')){ e.preventDefault(); window.open(c.href,'_blank','noopener'); } });
  document.querySelectorAll('.cb').forEach(cb=>cb.addEventListener('scroll', hidePrev, {passive:true}));

  /* Notebook: insert a link card at the caret from the note-bar */
  KC.dInsertCard = function(btn){
    const doc=noteDoc(btn); if(!doc) return;
    const url=prompt('Paste a link (YouTube, PDF, or any URL):'); if(!url) return;
    const card=KC.linkCardEl(url.trim());
    doc.focus();
    const sel=window.getSelection();
    if(sel && sel.rangeCount && doc.contains(sel.anchorNode)){
      const range=sel.getRangeAt(0); range.deleteContents(); range.insertNode(card);
      const after=document.createElement('p'); after.innerHTML='<br>'; card.after(after);
      const nr=document.createRange(); nr.setStart(after,0); nr.collapse(true); sel.removeAllRanges(); sel.addRange(nr);
    } else { doc.appendChild(card); const after=document.createElement('p'); after.innerHTML='<br>'; card.after(after); }
    icons(); toast('Link card added');
  };

  /* Seed a couple of demo cards into the Textbook content (same renderer) */
  function seedTextbookCards(){
    const demos={
      w0:['https://www.youtube.com/watch?v=M7lc1UVf-VE','Getting started with monday.com'],
      w1:['https://damassets.autodesk.net/content/dam/iso-19650-overview.pdf','ISO 19650 — Information management overview (PDF)'],
      w2:['https://www.youtube.com/watch?v=M7lc1UVf-VE','Clash detection walkthrough in Navisworks']
    };
    ['ws0','ws1','ws2'].forEach((wid,i)=>{
      const ws=document.getElementById(wid); if(!ws) return;
      const cb=ws.querySelector('.c2 .cb'); if(!cb || cb.querySelector('.lcard')) return;
      const d=demos['w'+i]; const card=KC.linkCardEl(d[0], d[1]);
      const ps=cb.querySelectorAll('.doc-p');
      if(ps.length>=1) ps[Math.min(1,ps.length-1)].after(card); else cb.appendChild(card);
    });
    icons();
  }
  KC._seedTextbookCards = seedTextbookCards;


  function init(){
    WS.forEach(([k,id])=>renderTree(k,id));
    renderNotes();
    KC.renderDict&&KC.renderDict();
    icons();
    // restore any saved Notebook drafts + wire silent autosave
    document.querySelectorAll('.workspace').forEach(ws=>{
      const doc=ws.querySelector('.c3 .note-doc'); if(!doc) return;
      const v=KC.API.getNote(ws.id); if(v!=null) doc.innerHTML=v;
      doc.addEventListener('input',function(){ KC.autoSaveNote(doc); });
    });
    updateAll();
    wireSync();
    KC.trLang&&KC.trLang();
    ['ws0','ws1','ws2'].forEach(id=>KC.mentorRender(id));
    // role-driven mentor start mode (intern → Topic tutor, others → Assistant)
    const startMode = (ROLES[ROLE]&&ROLES[ROLE].mentorStart) || 'topic';
    if(startMode!=='topic') ['ws0','ws1','ws2'].forEach(id=>KC.mentorMode(id, startMode));
    KC.applyRoleUI();
    // seed "Continue learning" from each workspace's currently-open Textbook topic
    WS.forEach(([k,tid],idx)=>{ const ws=document.getElementById(k); const cur=ws&&ws.querySelector('.c2 .bcrumb .bc-cur'); if(cur) KC._resume[idx]={treeId:tid, name:cur.textContent.trim()}; });
    KC.loadBk();
    KC.setupBookmarks();
    KC.renderBookmarks();
    KC.renderAssignments();
    KC.markAssignedTree();
    seedTextbookCards();
    // Keep gap dividers parked over the live column seams.
    let raf=0;
    const relay=()=>{ if(raf) return; raf=requestAnimationFrame(()=>{ raf=0; KC.layoutSplits(document.querySelector('.workspace.active')); }); };
    if(window.ResizeObserver){ const ro=new ResizeObserver(relay); document.querySelectorAll('.col').forEach(c=>ro.observe(c)); }
    window.addEventListener('resize', relay);
    KC.layoutSplits(document.querySelector('.workspace.active'));
    // Start the mockup directly on the Project Startup document (ws1 → Revit → Docs)
    setTimeout(function(){
      try{
        if(window.switchWS) window.switchWS(1);
        const treeId = WS[1] && WS[1][1];
        if(treeId && KC.goTo){
          KC.goTo(treeId, 'DXXXX - Project Startup');
          const tree=document.getElementById(treeId);
          const target=tree && [...tree.querySelectorAll('.row-name')].find(r=>r.textContent.trim()==='DXXXX - Project Startup');
          const row=target && target.closest('.row');
          if(row) KC.select(row);
        }
      }catch(e){}
    }, 80);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
