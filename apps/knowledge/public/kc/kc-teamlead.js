/* ============================================================
   EasyBIM Knowledge Center — Team Lead console
   Namespace: KC.TL   (loaded after kc-app.js)
   A management surface for the team lead: review the suggestion
   queue, track the team's progress, assign topics to interns.
   Demo data only — no backend.
   ============================================================ */
(function(){
  const KC = window.KC = window.KC || {};
  const TL = KC.TL = {};

  const WS_NAMES = ['Logistics & Administration','BIM Methodology & Tools','EasyBIM Teams'];
  const WS_DOTS  = ['var(--acc)','var(--acc2)','var(--acc2)'];

  /* ── demo roster (Gal Shem Tov leads the team) ── */
  const TEAM = [
    { name:'Polina Eisenshtadt', initials:'PE', role:'intern',   meta:'Onboarding · joined 3 weeks ago', prog:[62,18,40], assigned:['IFC export settings'] },
    { name:'Noa Levi',           initials:'NL', role:'intern',   meta:'Onboarding · joined 6 weeks ago', prog:[88,55,72], assigned:[] },
    { name:'Itai Bar-On',        initials:'IB', role:'intern',   meta:'Onboarding · joined 1 week ago',  prog:[24,4,10],  assigned:['Company onboarding'] },
    { name:'Yael Cohen',         initials:'YC', role:'employee', meta:'MEP Coordinator · 2 yrs',     prog:null, assigned:[] },
    { name:'Amir Katz',          initials:'AK', role:'employee', meta:'BIM Specialist · 4 yrs',      prog:null, assigned:[] },
  ];

  /* suggestion queue — every suggestion is a whole NEW document (edits are made on a copy
     and submitted as a new file), so there is one type, one preview, one approval path */
  let QUEUE = [
    { id:1, author:'Amir Katz', initials:'AK', type:'new', ws:1,
      path:['BIM Methodology & Tools','Revit'],
      title:'Worksharing troubleshooting',
      content:'How to resolve central-file sync conflicts, recover from “detached” models, and clean up unsynced local copies. Includes the three checks to run before escalating to the BIM manager.',
      when:'2h ago' },

    { id:2, author:'Yael Cohen', initials:'YC', type:'new', ws:1,
      path:['BIM Methodology & Tools','Navisworks','General'],
      title:'Clash grouping presets',
      content:'Our standard clash-detection grouping presets (Structure vs MEP, MEP vs MEP, Arch vs MEP) and how to apply them before exporting the coordination report.',
      when:'yesterday' },

    { id:3, author:'Polina Eisenshtadt', initials:'PE', type:'new', ws:1,
      path:['BIM Methodology & Tools','General','Documentation'],
      title:'IFC export — Reference View 1.2',
      content:'For IFC coordination we now export using the Reference View 1.2 MVD (previously Coordination View 2.0). Settings, checklist, and what changed.',
      when:'2 days ago' },

    { id:4, author:'Noa Levi', initials:'NL', type:'new', ws:0,
      path:['Logistics & Administration','General Info'],
      title:'VPN + remote desktop setup',
      content:'Step-by-step for first-day remote access: install the VPN client, request credentials from IT, connect to the office remote desktop, and troubleshoot the two most common connection errors.',
      when:'3 days ago' },
  ];

  /* merge in real user-submitted suggestions (persisted across the role reload) */
  if(KC.loadSuggestions){ try{ QUEUE = QUEUE.concat(KC.loadSuggestions()); }catch(e){} }

  /* topics the lead can assign, per workspace (demo) */
  const ASSIGNABLE = [
    ['Company onboarding','H&S basics','Time reporting','Drawing register'],
    ['Revit fundamentals','IFC export settings','Clash detection','Navisworks basics','MEP coordination'],
    ['Team structure','Project roles','Communication tools'],
  ];

  const TYPE_LABEL = { new:'New topic', edit:'Edit', add:'Addition', correction:'Correction' };
  const esc = s => { const d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; };
  const icons = () => { if(window.lucide&&lucide.createIcons) lucide.createIcons(); };
  const toast = m => { if(KC.toast) KC.toast(m); };
  const overall = p => p ? Math.round(p.reduce((a,b)=>a+b,0)/p.length) : 0;

  let curTab = 'review';
  let detailId = null;

  /* ── open / close (docked column) ── */
  function activeWsIdx(){ return [...document.querySelectorAll('.workspace')].findIndex(w=>w.classList.contains('active')); }
  let _collapsed = [];
  /* Mentor (c4) and Manage are mutually exclusive: opening one folds the other to its spine.
     collapseNeighbors folds ONLY the Mentor column; Notebook (c3) is left alone. */
  function collapseNeighbors(on){
    const idx=activeWsIdx(); if(idx<0) return;
    const ids=['w'+idx+'c4'];
    if(on){
      _collapsed=[];
      ids.forEach(id=>{ const c=document.getElementById(id); if(c && !c.classList.contains('slim')){ c.classList.add('slim'); _collapsed.push(id); } });
    } else {
      _collapsed.forEach(id=>{ const c=document.getElementById(id); if(c) c.classList.remove('slim'); });
      _collapsed=[];
    }
    if(window.rebalance) window.rebalance(document.querySelector('.workspace.active'));
  }
  function relayout(){ if(KC.layoutSplits) KC.layoutSplits(document.querySelector('.workspace.active')); }
  /* flag the active workspace so its Plan/Textbook mins shrink to fit beside Manage */
  function markWsTlcOpen(on){
    document.querySelectorAll('.workspace').forEach(w=>w.classList.remove('tlc-open'));
    if(on){ const ws=document.querySelector('.workspace.active'); if(ws) ws.classList.add('tlc-open'); }
  }
  function syncMaxIcon(){
    const el=document.getElementById('tlc'), b=document.getElementById('tlcMaxBtn'); if(!el||!b) return;
    const on=el.classList.contains('max');
    b.innerHTML='<i data-lucide="'+(on?'minimize-2':'maximize-2')+'"></i>'; b.title=on?'Restore':'Expand'; icons();
  }

  TL.open = function(){
    const el=document.getElementById('tlc'); if(!el) return;
    if(!el.classList.contains('open')){ el.classList.add('open'); el.style.flex=''; el.style.minWidth=''; collapseNeighbors(true); }
    markWsTlcOpen(true);
    TL.markTree();
    TL.tab(curTab||'review');
    updateBadges(); syncMaxIcon(); relayout();
    requestAnimationFrame(()=>TL.fitCheck());
  };
  TL.close = function(){
    const el=document.getElementById('tlc'); if(!el) return;
    el.classList.remove('open','max'); el.style.flex=''; el.style.flexBasis=''; el.style.minWidth='';
    markWsTlcOpen(false);
    collapseNeighbors(false);
    closeModal();
    clearTextbookPreview(); clearReviewing();
    relayout();
  };
  TL.toggle = function(){
    const el=document.getElementById('tlc'); if(!el) return;
    if(el.classList.contains('open')) TL.close(); else TL.open();
  };
  TL.toggleMax = function(){
    const el=document.getElementById('tlc'); if(!el) return;
    el.classList.toggle('max'); el.style.flexBasis=''; syncMaxIcon(); relayout();
  };
  TL.startResize = function(e){
    e.preventDefault();
    const el=document.getElementById('tlc'); if(!el) return;
    el.classList.remove('max');
    const grip=el.querySelector('.tlc-resize'); if(grip) grip.classList.add('dragging');
    const startX=e.clientX, startW=el.getBoundingClientRect().width;
    el.style.minWidth='0';
    const maxW=window.innerWidth*0.82;
    function mv(ev){ let w=startW+(startX-ev.clientX); w=Math.max(260, Math.min(w, maxW)); el.style.flex='0 0 '+w+'px'; }
    function up(){ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); document.body.style.cursor=''; document.body.style.userSelect=''; if(grip) grip.classList.remove('dragging'); }
    document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); document.body.style.cursor='col-resize'; document.body.style.userSelect='none';
  };
  /* keep neighbours folded when the workspace changes while Manage is open */
  TL.syncCollapse = function(){ const el=document.getElementById('tlc'); if(el && el.classList.contains('open')){ collapseNeighbors(true); markWsTlcOpen(true); requestAnimationFrame(()=>TL.fitCheck()); } };

  /* fold Manage back to its spine WITHOUT restoring neighbours (used when the
     user expands another column and there's no longer room for all of them) */
  function foldToSpine(){
    const el=document.getElementById('tlc'); if(!el || !el.classList.contains('open')) return;
    el.classList.remove('open','max'); el.style.flex=''; el.style.flexBasis=''; el.style.minWidth='';
    markWsTlcOpen(false);
    clearTextbookPreview(); clearReviewing(); closeModal();
    syncMaxIcon(); relayout();
    toast('Manage folded to make room — click the spine to reopen');
  }
  /* fold Manage only when the app is too narrow to show even Plan + Textbook beside it */
  TL.fitCheck = function(){
    const el=document.getElementById('tlc'); if(!el || !el.classList.contains('open') || el.classList.contains('max')) return;
    const app=document.querySelector('.app'); if(!app) return;
    const MIN_CORE = 200 + 180 + 28 + 24;   // Plan + Textbook-min + workspace padding + gaps
    const TLC_W = 386, TLC_MARGIN = 14;      // Manage's natural (content) minimum width + its margin
    if(MIN_CORE + TLC_W + TLC_MARGIN > app.getBoundingClientRect().width + 1) foldToSpine();
  };

  /* ══════════════════════════════════════════════════════════
     Suggestion markers in the Plan tree + parallel review flow
     ══════════════════════════════════════════════════════════ */

  /* find the row in a tree by name, preferring the one under the right parent */
  function findTreeRow(tree, name, parentNames){
    const rows=[...tree.querySelectorAll('.row')].filter(r=>{
      const nm=r.querySelector('.row-name'); return nm && nm.textContent.trim()===name;
    });
    if(rows.length<=1) return rows[0]||null;
    const lastParent = (parentNames&&parentNames.length)?parentNames[parentNames.length-1]:null;
    if(lastParent){
      const better = rows.find(r=>{
        let p=r.parentElement;
        while(p && p!==tree){
          if(p.classList&&p.classList.contains('node')){
            const pn=p.querySelector(':scope > .row .row-name');
            if(pn && pn.textContent.trim()===lastParent) return true;
          }
          p=p.parentElement;
        }
        return false;
      });
      if(better) return better;
    }
    return rows.sort((a,b)=>(+((a.closest('.node')||{}).dataset||{}).depth||0)-(+((b.closest('.node')||{}).dataset||{}).depth||0))[0];
  }

  /* bump a '+N' badge on every ancestor branch of a node */
  function markAncestors(fromNode, tree){
    let cur=fromNode;
    while(cur && cur!==tree){
      if(cur.classList && cur.classList.contains('node')){
        const brow=cur.querySelector(':scope > .row.branch');
        if(brow){
          let b=brow.querySelector('.tl-branch-badge');
          if(!b){
            b=document.createElement('span'); b.className='tl-branch-badge'; b.dataset.c='0';
            const ring=brow.querySelector('.ring');
            if(ring) brow.insertBefore(b, ring);
            else { const menu=brow.querySelector('.row-menu'); if(menu) brow.insertBefore(b,menu); else brow.appendChild(b); }
          }
          const c=(+b.dataset.c||0)+1; b.dataset.c=c; b.textContent='+'+c;
        }
      }
      cur=cur.parentElement;
    }
  }

  /* (re)decorate all three trees with the current QUEUE */
  TL.markTree = function(){
    document.querySelectorAll('.tl-ghost').forEach(g=>g.remove());
    document.querySelectorAll('.row.tl-sug').forEach(r=>{ r.classList.remove('tl-sug','tl-sug-edit','tl-sug-new'); r.removeAttribute('data-sugid'); });
    document.querySelectorAll('.tl-sugmark,.tl-branch-badge').forEach(e=>e.remove());
    if(KC.role!=='teamlead') return;
    QUEUE.forEach(s=>{
      const tree=document.getElementById('w'+s.ws+'ptree'); if(!tree) return;
      const parent=s.path.slice(1);
      if(s.type==='new'){
        const lastParent=parent[parent.length-1];
        const brow=findTreeRow(tree, lastParent, parent.slice(0,-1));
        if(!brow) return;
        const node=brow.parentElement;
        const kids=node.querySelector(':scope > .kids');
        if(kids){
          const g=document.createElement('div');
          g.className='node tl-ghost';
          g.innerHTML='<div class="row leaf tl-sug tl-sug-new" data-sugid="'+s.id+'" onclick="KC.TL.reviewFromTree('+s.id+',event)">'+
            '<span class="lead"><span class="tl-ghost-dot"><i data-lucide="plus"></i></span></span>'+
            '<span class="row-name" dir="auto">'+esc(s.title)+'</span>'+
            '<span class="tl-sugmark new" title="New topic proposed"><i data-lucide="git-pull-request-arrow"></i></span></div>';
          const addr=kids.querySelector(':scope > .add-row');
          if(addr) kids.insertBefore(g, addr); else kids.appendChild(g);
        }
        markAncestors(node, tree);
      } else {
        const row=findTreeRow(tree, s.title, parent);
        if(!row) return;
        row.classList.add('tl-sug','tl-sug-edit');
        row.setAttribute('data-sugid', s.id);
        const mk=document.createElement('span');
        mk.className='tl-sugmark edit'; mk.title='Edit suggested — click to review';
        mk.innerHTML='<i data-lucide="file-pen-line"></i>';
        mk.setAttribute('onclick','KC.TL.reviewFromTree('+s.id+',event)');
        const menu=row.querySelector('.row-menu');
        if(menu) row.insertBefore(mk, menu); else row.appendChild(mk);
        markAncestors(row.parentElement, tree);
      }
    });
    icons();
  };

  function clearReviewing(){ document.querySelectorAll('.row.tl-reviewing').forEach(r=>r.classList.remove('tl-reviewing')); }

  /* reveal + highlight the suggestion's node in the live tree (no close) */
  function highlightInTree(s){
    clearReviewing();
    const tree=document.getElementById('w'+s.ws+'ptree'); if(!tree) return;
    const row = tree.querySelector('.row[data-sugid="'+s.id+'"]');
    if(!row) return;
    let p=row.parentElement;
    while(p && p!==tree){
      if(p.classList.contains('kids')){ p.classList.remove('collapsed'); const tw=p.parentElement.querySelector(':scope > .row .tw'); if(tw) tw.classList.remove('c'); }
      p=p.parentElement;
    }
    row.classList.add('tl-reviewing');
    const cb=tree.closest('.cb'); if(cb){ const rb=row.getBoundingClientRect(), cbb=cb.getBoundingClientRect(); cb.scrollTop += (rb.top-cbb.top)-100; }
  }

  /* show the proposed NEW document as an ordinary Textbook page (breadcrumb + title + body),
     with a slim Approve/Reject strip pinned on top. The real page is hidden while reviewing
     and restored on clear — no duplicated banner, no stacking over unrelated content. */
  function clearTextbookPreview(){
    document.querySelectorAll('.tl-rvw').forEach(b=>b.remove());
    document.querySelectorAll('.tl-orig-hidden').forEach(el=>el.classList.remove('tl-orig-hidden'));
  }
  function previewInTextbook(s){
    clearTextbookPreview();
    // edit / add proposals live as inline cards in the doc — reveal the card AND flash the
    // actual changed fragment/block with a dashed frame, like the DocPage's own jump-to-change
    if(s.type!=='new'){
      const card=document.querySelector('.kc-sugcard[data-sid="'+s.id+'"]');
      if(!card) return; // doc for this suggestion isn't open — caller (TL.review) opens it first
      card.classList.add('kc-flash'); setTimeout(()=>card.classList.remove('kc-flash'),1500);
      const target=document.querySelector('.kc-edit-orig[data-sid="'+s.id+'"]') || card;
      target.classList.add('kc-jump-flash'); setTimeout(()=>target.classList.remove('kc-jump-flash'),2200);
      const cb=card.closest('.cb'); if(cb){ const r=target.getBoundingClientRect(), b=cb.getBoundingClientRect(); cb.scrollTop += (r.top-b.top)-90; }
      return;
    }
    const ws=document.querySelector('.workspace.active'); if(!ws) return;
    const cb=ws.querySelector('.c2 .cb'); if(!cb) return;
    [...cb.children].forEach(el=>el.classList.add('tl-orig-hidden'));
    const bc=s.path.map((p,i)=>(i?'<i data-lucide="chevron-right"></i>':'')+'<span'+(i===s.path.length-1?' class="bc-cur"':'')+'>'+esc(p)+'</span>').join('');
    const page=document.createElement('div'); page.className='tl-rvw';
    page.innerHTML=
      '<div class="tl-rvwbar"><span class="tl-rvwbar-l"><i data-lucide="git-pull-request-arrow"></i>Draft · proposed by '+esc(s.author)+'</span>'+
      '<span class="tl-rvwbar-acts">'+
        '<button class="tl-ib ok" title="Approve &amp; publish" onclick="KC.TL.act('+s.id+',&#39;approve&#39;)"><i data-lucide="check"></i></button>'+
        '<button class="tl-ib no" title="Reject" onclick="KC.TL.act('+s.id+',&#39;reject&#39;)"><i data-lucide="x"></i></button>'+
        '<button class="tl-ib" title="Done reviewing" onclick="KC.TL.clearReview()"><i data-lucide="corner-up-left"></i></button>'+
      '</span></div>'+
      '<div class="bcrumb">'+bc+'</div>'+
      '<div class="tl-rvw-title">'+esc(s.title)+'</div>'+
      '<div class="doc-p">'+esc(s.content)+'</div>';
    cb.insertBefore(page, cb.firstChild);
    cb.scrollTop=0; icons();
  }
  TL.clearReview = function(){ clearTextbookPreview(); clearReviewing(); detailId=null; TL.tab(curTab||'review'); };

  /* open Manage (if needed), switch to the right workspace, show the detail,
     highlight the tree, and preview the content — all in parallel */
  TL.reviewFromTree = function(id, ev){
    if(ev && ev.stopPropagation) ev.stopPropagation();
    TL.review(id);
  };

  TL.tab = function(name){
    curTab = name; detailId = null;
    document.querySelectorAll('.tlc-navitem').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
    const main=document.getElementById('tlcMain'); if(!main) return;
    if(name==='review') main.innerHTML = renderReview();
    else if(name==='team') main.innerHTML = renderTeam();
    main.scrollTop=0;
    icons();
  };

  /* ── Content review ── */
  function renderReview(){
    let html = '<div class="tlc-sec-h">Content review</div><div class="tlc-sec-d">Suggestions from people onboarding and employees. Approve to publish into the Knowledge Center.</div>';
    if(!QUEUE.length) return html + emptyHTML('check-check','Queue is empty','Every suggestion has been handled. Nice.');
    html += '<div class="tl-cards" id="tlQueue">'+QUEUE.map(cardHTML).join('')+'</div>';
    return html;
  }

  function cardHTML(s){
    return '<div class="tl-card" data-id="'+s.id+'">'+
      '<div class="tl-card-top">'+
        '<span class="tl-av">'+s.initials+'</span>'+
        '<div class="tl-who"><div class="tl-who-n">'+esc(s.author)+'</div>'+
        '<div class="tl-when">'+esc(s.when)+'</div></div>'+
      '</div>'+
      '<div class="tl-path"><i data-lucide="folder-tree"></i>'+s.path.map((p,i)=> (i? ' <span>›</span> ':'')+'<b>'+esc(p)+'</b>').join('')+'</div>'+
      '<div class="tl-card-title"><span class="tl-tchip '+s.type+'">'+(TYPE_LABEL[s.type]||'New')+'</span>'+esc(s.title)+'</div>'+
      '<div class="tl-acts">'+
        '<button class="tl-ib" title="View at its place in the tree" onclick="KC.TL.review('+s.id+')"><i data-lucide="eye"></i></button>'+
        '<button class="tl-ib ok" title="Approve" onclick="KC.TL.act('+s.id+',\'approve\')"><i data-lucide="check"></i></button>'+
        '<button class="tl-ib no" title="Reject" onclick="KC.TL.act('+s.id+',\'reject\')"><i data-lucide="x"></i></button>'+
      '</div>'+
    '</div>';
  }

  /* “View” = navigation only: no detail page inside Manage. Switch to the workspace,
     reveal the node in the tree, and open the proposed file on the Textbook page. */
  TL.review = function(id){
    const s = QUEUE.find(q=>q.id===id); if(!s) return;
    const go=()=>{
      const c2=document.getElementById('w'+s.ws+'c2');
      if(c2 && c2.classList.contains('slim') && window.xp) xp('w'+s.ws+'c2');
      // fold the Notebook while reviewing so the proposal has room (reopen it manually if needed)
      const c3=document.getElementById('w'+s.ws+'c3');
      if(c3 && !c3.classList.contains('slim') && window.tog) tog('w'+s.ws+'c3','l');
      highlightInTree(s);
      // make sure the SUGGESTION'S OWN document is the one open in the Textbook before previewing it
      if(s.type!=='new'){
        const cur=document.querySelector('#w'+s.ws+'c2 .bcrumb .bc-cur, #w'+s.ws+'c2 .dp-bc-cur');
        if(!cur || cur.textContent.trim()!==s.title){
          const row=document.getElementById('w'+s.ws+'ptree').querySelector('.row[data-sugid="'+s.id+'"]');
          if(row && window.KC && KC.select){ KC.select(row); setTimeout(()=>previewInTextbook(s), 90); return; }
        }
      }
      previewInTextbook(s);
    };
    if(activeWsIdx()!==s.ws && window.switchWS){ window.switchWS(s.ws); setTimeout(go, 120); }
    else go();
  };
  TL.backToQueue = function(){ TL.tab('review'); };

  function renderDetail(s){
    let h = '<button class="tl-back" onclick="KC.TL.backToQueue()"><i data-lucide="arrow-left"></i>Back to queue</button>';
    h += '<div class="tl-detail-head"><span class="tl-av">'+s.initials+'</span>'+
      '<div class="tl-who"><div class="tl-who-n">'+esc(s.author)+'<span class="tl-rolechip">'+(s.role==='intern'?'Onboarding':'Employee')+'</span></div>'+
      '<div class="tl-when">suggested '+esc(s.when)+'</div></div>'+
      '<span class="tl-tag '+s.type+'">'+TYPE_LABEL[s.type]+'</span></div>';
    h += '<div class="tl-detail-grid">'+
      '<div class="tl-panel"><div class="tl-panel-h"><i data-lucide="folder-tree"></i>Placement in catalog</div>'+placementHTML(s)+'</div>'+
      '<div class="tl-panel"><div class="tl-panel-h"><i data-lucide="'+(s.type==='new'?'file-plus':'file-diff')+'"></i>'+(s.type==='new'?'Proposed content':'What changes')+'</div>'+contentHTML(s)+'</div>'+
      '</div>';
    h += '<div class="tl-note-box"><i data-lucide="message-square"></i><div><div class="tl-note-lbl">Note from '+esc(s.author)+'</div>'+esc(s.note)+'</div></div>';
    h += '<div class="tl-detail-acts">'+
      '<button class="tl-btn pri" onclick="KC.TL.act('+s.id+',\'approve\')"><i data-lucide="check"></i>Approve &amp; publish</button>'+
      '<button class="tl-btn danger" onclick="KC.TL.act('+s.id+',\'reject\')"><i data-lucide="x"></i>Reject</button>'+
      '</div>';
    return h;
  }

  function placementHTML(s){
    const parent = s.path.slice(1);
    const bc = s.path.map((p,i)=> (i?'<span class="tl-bc-sep">›</span>':'')+'<span'+(i===s.path.length-1?' class="tl-bc-cur"':'')+'>'+esc(p)+'</span>').join('');
    let h = '<div class="tl-bc">'+bc+'</div>';
    const kids = (KC.treeChildren?KC.treeChildren(s.ws, parent):[]) || [];
    const isNew = s.type==='new';
    let rows='';
    kids.forEach(k=>{
      const hit = !isNew && k===s.title;
      rows += '<div class="tl-tnode'+(hit?' hit':'')+'"><i data-lucide="'+(hit?'file-pen-line':'file')+'"></i><span>'+esc(k)+'</span>'+(hit?'<span class="tl-tnode-tag hit">edits here</span>':'')+'</div>';
    });
    if(isNew) rows += '<div class="tl-tnode add"><i data-lucide="file-plus"></i><span>'+esc(s.title)+'</span><span class="tl-tnode-tag new">new</span></div>';
    if(!rows) rows = '<div class="tl-tnode-empty">Target location is not in the current tree.</div>';
    h += '<div class="tl-tnodes">'+rows+'</div>';
    const pName = parent[parent.length-1] || 'the workspace';
    h += '<div class="tl-place-cap">'+(isNew? 'Approving adds this topic under <b>'+esc(pName)+'</b>.' : 'Approving updates the highlighted topic in place.')+'</div>';
    h += '<button class="tl-btn tl-tree-btn" onclick="KC.TL.openInTree('+s.id+')"><i data-lucide="crosshair"></i>Reveal in the tree</button>';
    return h;
  }

  /* reveal this suggestion in the live tree WITHOUT closing Manage (parallel work) */
  TL.openInTree = function(id){
    const s = QUEUE.find(q=>q.id===id); if(!s) return;
    const go=()=>{
      highlightInTree(s);
      if(s.type!=='new'){
        const cur=document.querySelector('#w'+s.ws+'c2 .bcrumb .bc-cur, #w'+s.ws+'c2 .dp-bc-cur');
        if(!cur || cur.textContent.trim()!==s.title){
          const row=document.getElementById('w'+s.ws+'ptree').querySelector('.row[data-sugid="'+s.id+'"]');
          if(row && window.KC && KC.select){ KC.select(row); setTimeout(()=>previewInTextbook(s), 90); return; }
        }
      }
      previewInTextbook(s);
    };
    if(activeWsIdx()!==s.ws && window.switchWS){ window.switchWS(s.ws); setTimeout(go, 100); }
    else go();
    toast(s.type==='new' ? 'Showing where “'+s.title+'” will go' : 'Highlighted “'+s.title+'” in the tree');
  };

  function contentHTML(s){
    if(s.type==='new'){
      return '<label class="tl-ed-l">Title</label><input class="tl-input" id="tlEditTitle" value="'+esc(s.title)+'">'+
        '<label class="tl-ed-l">Content</label><textarea class="tl-textarea" id="tlEditBody">'+esc(s.content)+'</textarea>'+
        '<div class="tl-ed-hint">Tweak anything before it goes live.</div>';
    }
    const d = wordDiff(s.current, s.proposed);
    return '<div class="tl-diff">'+
      '<div class="tl-diff-row"><span class="tl-diff-lbl del">Current</span><div class="tl-diff-txt">'+d.before+'</div></div>'+
      '<div class="tl-diff-row"><span class="tl-diff-lbl add">Proposed</span><div class="tl-diff-txt">'+d.after+'</div></div>'+
      '</div>'+
      '<label class="tl-ed-l">Edit before publishing</label><textarea class="tl-textarea" id="tlEditBody">'+esc(s.proposed)+'</textarea>';
  }

  /* word-level diff (LCS) */
  function wordDiff(a,b){
    const A=(a||'').split(/\s+/).filter(Boolean), B=(b||'').split(/\s+/).filter(Boolean);
    const n=A.length, m=B.length;
    const dp=Array.from({length:n+1},()=>new Array(m+1).fill(0));
    for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--) dp[i][j]=A[i]===B[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
    let i=0,j=0,before='',after='';
    while(i<n&&j<m){
      if(A[i]===B[j]){ before+=esc(A[i])+' '; after+=esc(B[j])+' '; i++; j++; }
      else if(dp[i+1][j]>=dp[i][j+1]){ before+='<span class="d-del">'+esc(A[i])+'</span> '; i++; }
      else { after+='<span class="d-add">'+esc(B[j])+'</span> '; j++; }
    }
    while(i<n){ before+='<span class="d-del">'+esc(A[i])+'</span> '; i++; }
    while(j<m){ after+='<span class="d-add">'+esc(B[j])+'</span> '; j++; }
    return {before,after};
  }

  TL.act = function(id, action){
    const s = QUEUE.find(q=>q.id===id); if(!s) return;
    if(action==='approve') doApprove(s); else doReject(s);
    const card = document.querySelector('.tl-card[data-id="'+id+'"]');
    const finish = ()=>{ clearTextbookPreview(); clearReviewing(); TL.markTree(); if(detailId===id){ detailId=null; TL.tab('review'); } else { TL.tab(curTab); } updateBadges(); };
    if(card && detailId!==id){ card.classList.add('out'); setTimeout(finish, 300); } else finish();
  };

  function doApprove(s){
    let title=s.title, body = (s.type==='new'? s.content : s.proposed);
    const tIn=document.getElementById('tlEditTitle'); if(tIn && tIn.value.trim()) title=tIn.value.trim();
    const bIn=document.getElementById('tlEditBody'); if(bIn) body=bIn.value;
    if(s.type==='new'){
      if(KC.publishToTree) KC.publishToTree(s.ws, s.path.slice(1), title);
      toast('“'+title+'” published to the Knowledge Center');
    } else {
      if(KC.applyProposalDOM) KC.applyProposalDOM(s,'approve');
      toast(s.type==='add' ? 'Addition published to “'+title+'”' : '“'+title+'” updated in the Knowledge Center');
      // log the approved change into the Project Startup document's version book
      if(KC.DocPage && KC.DocPage.logVersion && /project startup/i.test(s.title||'')){
        const chg = (s.note && s.note.trim()) ? s.note.trim()
          : (s.type==='add' ? 'Added a new paragraph' : 'Edited existing text');
        KC.DocPage.logVersion({ who: s.author || 'Unknown', change: chg, anchor: s.anchor || '' });
      }
    }
    if(s.submitted && KC.removeSuggestion) KC.removeSuggestion(s.id);
    QUEUE = QUEUE.filter(q=>q.id!==s.id);
  }
  function doReject(s){
    if(s.type!=='new' && KC.applyProposalDOM) KC.applyProposalDOM(s,'reject');
    if(s.submitted && KC.removeSuggestion) KC.removeSuggestion(s.id);
    QUEUE = QUEUE.filter(q=>q.id!==s.id);
    toast('“'+s.title+'” rejected — '+s.author+' notified');
  }

  /* ── Team ── */
  function renderTeam(){
    let html = '<div class="tlc-sec-h">Onboarding</div><div class="tlc-sec-d">People you’re onboarding. Track progress and assign material — from here or from any node’s ⋯ menu in the Plan.</div>';
    const interns = TEAM.filter(p=>p.role==='intern');
    html += interns.map(personHTML).join('');
    return html;
  }

  function personHTML(p){
    const idx = TEAM.indexOf(p);
    const isRef = p.name === (KC.internIdentityName ? KC.internIdentityName() : 'Polina Eisenshtadt');
    // per-workspace % — the reference intern reads live from the trees (mirrors their
    // own cabinet exactly); demo interns use their demo prog[] numbers.
    const wsPct = i => isRef ? (KC.progressData? KC.progressData(i).pct : 0) : (p.prog?p.prog[i]:0);
    const overallPct = isRef ? (KC.overallPct?KC.overallPct():0) : overall(p.prog||[0,0,0]);
    // unaccepted assignments for this person (progress counts accepted material only)
    const pending = (KC.loadAssign?KC.loadAssign():[]).filter(a=>a.intern===p.name && !a.accepted).length;

    let h = '<div class="tl-person" data-p="'+idx+'"><div class="tl-person-top">'+
      '<span class="tl-av">'+p.initials+'</span>'+
      '<div class="tl-who"><div class="tl-person-n">'+esc(p.name)+'</div><div class="tl-person-meta">'+esc(p.meta)+'</div></div>'+
      '<div class="tl-person-ov"><div class="tl-person-ov-v">'+overallPct+'%</div><div class="tl-person-ov-l">overall</div></div>'+
      '</div>';
    if(pending) h += '<div class="tl-pending"><i data-lucide="sparkles"></i>'+pending+' new '+(pending===1?'topic':'topics')+' · not yet accepted</div>';
    // accordion — identical structure to the intern cabinet
    h += '<div class="tlp-prog">'+[0,1,2].map(i=>{
      const v=wsPct(i);
      return '<div class="tlp-g" id="tlpg'+idx+'_'+i+'">'+
        '<div class="tlp-r" role="button" tabindex="0" onclick="KC.TL.togPg('+idx+','+i+')">'+
          '<span class="tlp-dot" style="background:'+WS_DOTS[i]+'"></span>'+
          '<span class="tlp-name">'+esc(WS_NAMES[i])+'</span>'+
          '<span class="tlp-pct">'+v+'%</span>'+
          '<i data-lucide="chevron-down" class="tlp-chev"></i>'+
          '<span class="tlp-track"><span class="tlp-fill" style="width:'+v+'%"></span></span>'+
        '</div><div class="tlp-sub" id="tlpsub'+idx+'_'+i+'"></div></div>';
    }).join('')+'</div>';
    h += '</div>';
    return h;
  }

  /* sub-topic breakdown for a person's workspace group (blocks + %) */
  function buildPersonSub(pIdx, wsIdx){
    const sub=document.getElementById('tlpsub'+pIdx+'_'+wsIdx); if(!sub) return;
    const p=TEAM[pIdx]; if(!p) return;
    const isRef = p.name === (KC.internIdentityName ? KC.internIdentityName() : 'Polina Eisenshtadt');
    let subs=[];
    if(isRef && KC.progressData){ subs=KC.progressData(wsIdx).subs; }
    else {
      const names=(KC.progressData?KC.progressData(wsIdx).subs.map(s=>s.name):[]);
      const base=p.prog?p.prog[wsIdx]:0;
      subs=names.map((n,bi)=>({ name:n, pct: Math.max(0,Math.min(100, base + ((bi*37)%50 - 25))) }));
    }
    sub.innerHTML = subs.length ? subs.map(s=>
      '<div class="tlp-s"><span class="tlp-s-name">'+esc(s.name)+'</span><span class="tlp-s-pct">'+s.pct+'%</span>'+
      '<span class="tlp-s-track"><span class="tlp-s-fill" style="width:'+s.pct+'%"></span></span></div>'
    ).join('') : '<div class="tlp-s-empty">No sections yet</div>';
    icons();
  }
  TL.togPg = function(pIdx, wsIdx){
    const g=document.getElementById('tlpg'+pIdx+'_'+wsIdx); if(!g) return;
    const open=!g.classList.contains('open'); g.classList.toggle('open',open);
    if(open) buildPersonSub(pIdx, wsIdx);
  };
  /* ── View details: assigned material + per-topic status & progress (overlay) ── */
  function tldHash(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))>>>0; } return h; }
  function tldGuessWs(title){ for(let i=0;i<ASSIGNABLE.length;i++){ if(ASSIGNABLE[i].includes(title)) return i; } return 1; }
  function tldItems(p){
    const real=(KC.loadAssign?KC.loadAssign():[]).filter(a=>a.intern===p.name)
      .map(a=>({key:'id:'+a.id, title:a.title, ws:a.ws, path:a.path||[], accepted:!!a.accepted}));
    const seen=new Set(real.map(r=>r.title));
    const demo=(p.assigned||[]).filter(t=>!seen.has(t))
      .map(t=>{ const ws=tldGuessWs(t); return {key:'demo:'+t, title:t, ws:ws, path:[WS_NAMES[ws]], accepted:true}; });
    return real.concat(demo);
  }
  function tldStatus(p, it){
    if(!it.accepted) return {label:'Pending', cls:'pend', pct:0};
    const pct = tldHash(p.name+'|'+it.title) % 101;
    if(pct>=100) return {label:'Done', cls:'done', pct:100};
    if(pct>0)    return {label:'In progress', cls:'prog', pct:pct};
    return {label:'Not started', cls:'ns', pct:0};
  }
  TL.details = function(idx){
    const p=TEAM[idx]; if(!p) return;
    const isRef = p.name === (KC.internIdentityName?KC.internIdentityName():'Polina Eisenshtadt');
    const overallPct = isRef ? (KC.overallPct?KC.overallPct():0) : overall(p.prog||[0,0,0]);
    const items=tldItems(p);
    const rows = items.length ? items.map(it=>{
      const st=tldStatus(p,it);
      const crumb=(it.path&&it.path.length?it.path:[WS_NAMES[it.ws]]).join(' \u203a ');
      return '<div class="tld-row">'+
        '<div class="tld-row-top">'+
          '<div class="tld-main"><div class="tld-title">'+esc(it.title)+'</div><div class="tld-path">'+esc(crumb)+'</div></div>'+
          '<span class="tld-chip '+st.cls+'">'+st.label+'</span>'+
          '<button class="tld-rm" title="Unassign" onclick="KC.TL.unassign('+idx+',\''+it.key.replace(/'/g,"\\'")+'\')"><i data-lucide="x"></i></button>'+
        '</div>'+
        '<div class="tld-bar"><span class="tld-fill" style="width:'+st.pct+'%"></span></div>'+
        '<div class="tld-meta">'+st.pct+'% complete</div>'+
      '</div>';
    }).join('') : '<div class="tld-empty"><i data-lucide="clipboard-list"></i>Nothing assigned yet. Use \u201cAssign more\u201d, or the \u22ef menu on any node in the Plan.</div>';
    const bg=document.getElementById('tlModalBg'), m=document.getElementById('tlModal');
    m.className='tl-modal tl-modal-wide';
    m.innerHTML=
      '<div class="tld-head"><span class="tl-av">'+p.initials+'</span>'+
        '<div class="tld-head-who"><div class="tl-modal-h">'+esc(p.name)+'</div><div class="tl-modal-sub" style="margin-bottom:0">'+esc(p.meta)+'</div></div>'+
        '<div class="tld-ov"><div class="tld-ov-v">'+overallPct+'%</div><div class="tld-ov-l">overall</div></div>'+
      '</div>'+
      '<div class="tld-sec-h">Assigned material \u00b7 '+items.length+'</div>'+
      '<div class="tld-list">'+rows+'</div>'+
      '<div class="tl-modal-acts">'+
        '<button class="tl-btn" onclick="KC.TL._closeModal()">Close</button>'+
        '<button class="tl-btn pri" onclick="KC.TL.assign('+idx+')"><i data-lucide="plus"></i>Assign more</button>'+
      '</div>';
    bg.classList.add('show'); icons();
  };
  TL.unassign = function(idx, key){
    const p=TEAM[idx]; if(!p) return;
    if(key.indexOf('id:')===0){
      const id=key.slice(3); KC.saveAssign(KC.loadAssign().filter(x=>x.id!==id)); if(KC.markAssignedTree) KC.markAssignedTree();
    } else if(key.indexOf('demo:')===0){
      const t=key.slice(5); p.assigned=(p.assigned||[]).filter(x=>x!==t);
    }
    toast('Unassigned');
    TL.details(idx);
    if(curTab==='team') TL.tab('team');
  };

  /* interns the lead can assign to (for the Plan ⋯ menu submenu) */
  TL.interns = function(){ return TEAM.filter(p=>p.role==='intern').map(p=>({name:p.name, initials:p.initials})); };

  /* ── assign modal ── */
  TL.assign = function(idx){
    const p = TEAM[idx]; if(!p) return;
    const wsOpts = WS_NAMES.map((n,i)=>'<option value="'+i+'">'+esc(n)+'</option>').join('');
    const topicOpts = i => ASSIGNABLE[i].map(t=>'<option>'+esc(t)+'</option>').join('');
    const bg=document.getElementById('tlModalBg'), m=document.getElementById('tlModal');
    m.className='tl-modal';
    m.innerHTML =
      '<div class="tl-modal-h">Assign a topic</div>'+
      '<div class="tl-modal-sub">To '+esc(p.name)+'</div>'+
      '<div class="tl-field"><label class="tl-field-l">Workspace</label>'+
        '<select class="tl-select" id="tlAsWs" onchange="KC.TL._syncTopics()">'+wsOpts+'</select></div>'+
      '<div class="tl-field"><label class="tl-field-l">Topic</label>'+
        '<select class="tl-select" id="tlAsTopic">'+topicOpts(0)+'</select></div>'+
      '<div class="tl-field"><label class="tl-field-l">Due (optional)</label>'+
        '<input class="tl-input" id="tlAsDue" type="date"></div>'+
      '<div class="tl-modal-acts">'+
        '<button class="tl-btn" onclick="KC.TL._closeModal()">Cancel</button>'+
        '<button class="tl-btn pri" onclick="KC.TL._doAssign('+idx+')"><i data-lucide="check"></i>Assign</button>'+
      '</div>';
    bg.classList.add('show');
    icons();
  };
  TL._syncTopics = function(){
    const i = +document.getElementById('tlAsWs').value;
    document.getElementById('tlAsTopic').innerHTML = ASSIGNABLE[i].map(t=>'<option>'+esc(t)+'</option>').join('');
  };
  TL._doAssign = function(idx){
    const p=TEAM[idx]; const topic=document.getElementById('tlAsTopic').value;
    const due=document.getElementById('tlAsDue').value;
    if(p && !p.assigned.includes(topic)) p.assigned.push(topic);
    closeModal();
    if(curTab==='team') TL.tab('team');
    toast('Assigned “'+topic+'” to '+p.name+(due?' · due '+due:''));
  };
  TL._closeModal = closeModal;
  function closeModal(){ const bg=document.getElementById('tlModalBg'); if(bg) bg.classList.remove('show'); }

  /* ── badges (top-bar + nav) ── */
  function updateBadges(){
    const n=QUEUE.length;
    const rc=document.getElementById('tlcReviewCount'); if(rc){ rc.textContent=n; rc.classList.toggle('zero', n===0); }
    const ob=document.getElementById('tlOpenBadge'); if(ob){ ob.textContent=n; ob.classList.toggle('on', n>0); }
    const sb=document.getElementById('tlcSpineBadge'); if(sb){ sb.textContent=n; sb.classList.toggle('on', n>0); }
  }

  /* close on Esc / backdrop */
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ const bg=document.getElementById('tlModalBg'); if(bg&&bg.classList.contains('show')) closeModal(); else if(document.getElementById('tlc')&&document.getElementById('tlc').classList.contains('open')) TL.close(); } });
  document.addEventListener('click', e=>{ if(e.target && e.target.id==='tlModalBg') closeModal(); });

  // seed the badge + tree markers once the app is up
  function boot(){
    updateBadges(); if(KC.role==='teamlead') TL.markTree();
    if(KC.markAssignedTree) KC.markAssignedTree();
    // Mentor (c4) and Manage are mutually exclusive: expanding Mentor from its spine folds Manage.
    if(window.xp && !window.xp.__tlWrapped){
      const _xp=window.xp;
      window.xp=function(id){
        const idx=activeWsIdx();
        if(typeof id==='string' && id==='w'+idx+'c4'){
          const tlc=document.getElementById('tlc');
          if(tlc && tlc.classList.contains('open')) TL.close();
        }
        const r=_xp.apply(this,arguments); requestAnimationFrame(()=>TL.fitCheck()); return r;
      };
      window.xp.__tlWrapped=true;
    }
    window.addEventListener('resize', ()=>TL.fitCheck());
  }
  if(document.readyState!=='loading') setTimeout(boot, 80);
  else document.addEventListener('DOMContentLoaded', ()=>setTimeout(boot, 80));
})();
