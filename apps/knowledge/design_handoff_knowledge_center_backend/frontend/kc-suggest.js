/* ============================================================
   kc-suggest.js  —  Inline change proposals on OFFICIAL documents
   Namespace: KC (extends kc-app.js). Loaded AFTER kc-teamlead.js.

   Two kinds of proposal, both submitted to the Team Lead's Content
   review queue (same kc_suggestions store used by "Suggest to KC"):

     • EDIT ('edit')  — propose a change to a selected fragment. The
       fragment stays in place wrapped in a dashed "было/есть" outline
       (.kc-edit-orig); a card is pinned right below the paragraph with
       the proposed replacement + a comment for the lead.
     • ADD  ('add')   — a whole new block attached to a spot in the doc
       (tag "NEW"). No outline — the card body IS the new content.

   Roles:
     • intern / employee  → submit → card turns "На утверждении" (pending,
       cancellable) and the record goes to the lead's queue.
     • teamlead           → same compose card, but the primary button is
       "Согласовать" and it applies immediately (no queue round-trip).
       Pending cards authored by others render in a "review" state with
       Согласовать / Отклонить right on the card.

   Persistence: records live in kc_suggestions (KC.load/saveSuggestions,
   from kc-app.js) so pending cards + outlines are re-injected on reload
   by renderPending() — for every role.
   ============================================================ */
(function(){
  const KC = window.KC = window.KC || {};
  const esc = s => { const d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; };
  const icons = () => { if(window.lucide&&lucide.createIcons) lucide.createIcons(); };
  const toast = (m)=> { if(KC.toast) KC.toast(m); };
  const isLead = ()=> KC.role==='teamlead';
  const nid = ()=> Date.now()*1000 + Math.floor(Math.random()*1000);
  function who(){ const id=KC.identity||{name:'You',initials:'YOU'}; return {author:id.name, initials:id.initials}; }

  /* ── locate the official Textbook page + its paragraphs ── */
  function officialCB(wsIdx){ const ws=document.getElementById('ws'+wsIdx); return ws?ws.querySelector('.c2 .cb'):null; }
  // paragraphs of the open official doc — static pages use direct .doc-p children;
  // the DocPage (Project Startup) uses .dp-p inside .kc-docpage .dp-body
  function docBody(cb){ return cb ? cb.querySelector('.kc-docpage .dp-body') : null; }
  function paras(cb){ if(!cb) return []; const db=docBody(cb); return db ? [...db.querySelectorAll(':scope > .dp-p')] : [...cb.querySelectorAll(':scope > .doc-p')]; }
  function pIndexOf(cb, para){ return paras(cb).indexOf(para); }
  // every editable text block of an official doc, in document order (paragraph, callout, list item, heading)
  const BLK_SEL = '.dp-p, .dp-callout, .dp-list > li, .dp-h';
  function editBlocks(cb){ if(!cb) return []; const db=docBody(cb); return db ? [...db.querySelectorAll(BLK_SEL)] : [...cb.querySelectorAll(':scope > .doc-p')]; }
  function bIndexOf(cb, blk){ return blk ? editBlocks(cb).indexOf(blk) : -1; }
  // top-level flow children (a card / new block attaches AFTER one of these, never inside a list)
  function topBlocks(cb){ const db=docBody(cb); return db ? [...db.children] : [...cb.querySelectorAll(':scope > .doc-p')]; }
  function topOf(el){ return (el && el.closest('.dp-body > *')) || el; }
  function topIndexOf(cb, el){ return topBlocks(cb).indexOf(topOf(el)); }
  function pathOf(cb){
    const bc=cb.querySelector('.bcrumb, .dp-bc');
    if(!bc) return {path:['Knowledge Center'], title:'Topic'};
    const spans=[...bc.querySelectorAll('span, a')].map(s=>s.textContent.trim()).filter(Boolean);
    const title=spans.length?spans[spans.length-1]:'Topic';
    return { path: spans.slice(0,-1).length?spans.slice(0,-1):[title], title };
  }
  function wsIdxOf(el){ const ws=el.closest('.workspace'); return ws?[...document.querySelectorAll('.workspace')].indexOf(ws):-1; }

  /* ── wrap a Range / a first-match substring in the dashed outline ── */
  function wrapRange(range, sid){
    try{ const span=document.createElement('span'); span.className='kc-edit-orig'; if(sid!=null) span.dataset.sid=sid; range.surroundContents(span); return span; }
    catch(e){ return null; }
  }
  function wrapFirstMatch(el, needle, sid){
    if(!el||!needle) return null;
    const walker=document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const nodes=[]; let n; while(n=walker.nextNode()) nodes.push(n);
    const full=nodes.map(x=>x.nodeValue).join('');
    const at=full.indexOf(needle); if(at<0) return null;
    const end=at+needle.length;
    let pos=0, sN, sO, eN, eO;
    for(const node of nodes){ const len=node.nodeValue.length;
      if(sN==null && at < pos+len){ sN=node; sO=at-pos; }
      if(eN==null && end <= pos+len){ eN=node; eO=end-pos; break; }
      pos+=len;
    }
    if(!sN||!eN) return null;
    const r=document.createRange(); r.setStart(sN,sO); r.setEnd(eN,eO);
    return wrapRange(r, sid);
  }
  function unwrap(span){ if(span&&span.parentNode){ const t=document.createTextNode(span.textContent); span.replaceWith(t); t.parentNode&&t.parentNode.normalize&&t.parentNode.normalize(); } }
  // block-level fallback: outline the whole paragraph when a fragment can't be cleanly wrapped
  function markPara(para, sid){ para.classList.add('kc-edit-orig','kc-edit-line'); para.dataset.sid=sid; return para; }
  // a block-marked paragraph carries kc-edit-line (works for both .doc-p and .dp-p); a wrapped fragment does not
  function clearMark(el){ if(!el) return; if(el.classList&&el.classList.contains('kc-edit-line')){ el.classList.remove('kc-edit-orig','kc-edit-live','kc-edit-line'); el.removeAttribute('data-sid'); } else unwrap(el); }
  function findOrig(sid){ return document.querySelector('.kc-edit-orig[data-sid="'+sid+'"]'); }
  function findCard(sid){ return document.querySelector('.kc-sugcard[data-sid="'+sid+'"]'); }
  function clearCompose(){ document.querySelectorAll('.kc-sugcard.compose').forEach(c=>{ clearMark(findOrig(c.dataset.sid)); c.remove(); }); }

  /* ================= card markup ================= */
  const TAG = {
    edit:'<span class="kc-sugtag edit"><i data-lucide="file-pen-line"></i>Edit</span>',
    add :'<span class="kc-sugtag add"><i data-lucide="sparkles"></i>NEW · addition</span>'
  };
  function noteRO(note){ return note ? '<div class="kc-sug-comment ro"><i data-lucide="message-square"></i><span>'+esc(note)+'</span></div>' : ''; }

  function composeHTML(rec){
    const go = isLead() ? '<i data-lucide="check"></i>Approve' : '<i data-lucide="send"></i>Submit for review';
    return '<div class="kc-sugcard edit compose mode-edit" data-sid="'+rec.id+'">'+
      '<div class="kc-sugcard-h">'+
        '<span class="kc-tag-edit">'+TAG.edit+'</span><span class="kc-tag-add">'+TAG.add+'</span>'+
        '<div class="kc-sugmodes">'+
          '<button type="button" class="kc-sugmode m-edit active" onclick="KC.composeMode('+rec.id+',\'edit\')"><i data-lucide="pencil"></i>Change text</button>'+
          '<button type="button" class="kc-sugmode m-add" onclick="KC.composeMode('+rec.id+',\'add\')"><i data-lucide="plus"></i>Add after</button>'+
        '</div>'+
      '</div>'+
      '<div class="kc-sug-editwrap">'+
        '<div class="kc-sugcard-sec"><div class="kc-sugcard-lbl">Before</div><div class="kc-sug-orig">'+esc(rec.original)+'</div></div>'+
        '<div class="kc-sugcard-sec"><div class="kc-sugcard-lbl">Proposed</div><div class="kc-sug-proposed" contenteditable="true">'+esc(rec.proposed)+'</div></div>'+
      '</div>'+
      '<div class="kc-sug-addwrap">'+
        '<div class="kc-sugcard-sec"><div class="kc-sugcard-lbl">New paragraph after this</div><div class="kc-sug-add" contenteditable="true" data-ph="New content…"></div></div>'+
      '</div>'+
      '<textarea class="kc-sug-textarea" placeholder="Note for the team lead (optional)…"></textarea>'+
      '<div class="kc-sugcard-acts">'+
        '<button class="kc-sug-x" onclick="KC.cancelCompose('+rec.id+')"><i data-lucide="x"></i>Cancel</button>'+
        '<button class="kc-sug-go" onclick="KC.submitProposal('+rec.id+')">'+go+'</button>'+
      '</div></div>';
  }
  function pendingHTML(rec){
    const isEdit = rec.type==='edit';
    const body = isEdit
      ? '<div class="kc-sugcard-sec"><div class="kc-sugcard-lbl">Proposed</div><div class="kc-sug-proposed ro">'+esc(rec.proposed)+'</div></div>'
      : '<div class="kc-sugcard-sec"><div class="kc-sugcard-lbl">Content</div><div class="kc-sug-proposed ro">'+esc(rec.content)+'</div></div>';
    return '<div class="kc-sugcard '+rec.type+' pending" data-sid="'+rec.id+'">'+
      '<div class="kc-sugcard-h">'+TAG[rec.type]+'<span class="kc-sugcard-badge"><i data-lucide="clock"></i>Pending review</span></div>'+
      body+ noteRO(rec.note)+
      '<div class="kc-sugcard-acts"><button class="kc-sug-x" onclick="KC.cancelProposal('+rec.id+')"><i data-lucide="undo-2"></i>Withdraw</button></div>'+
    '</div>';
  }
  function reviewHTML(rec){
    const isEdit = rec.type==='edit';
    const body = isEdit
      ? '<div class="kc-sugcard-sec"><div class="kc-sugcard-lbl">Before</div><div class="kc-sug-orig">'+esc(rec.original)+'</div></div>'+
        '<div class="kc-sugcard-sec"><div class="kc-sugcard-lbl">Proposed</div><div class="kc-sug-proposed ro">'+esc(rec.proposed)+'</div></div>'
      : '<div class="kc-sugcard-sec"><div class="kc-sugcard-lbl">Content</div><div class="kc-sug-proposed ro">'+esc(rec.content)+'</div></div>';
    return '<div class="kc-sugcard '+rec.type+' review" data-sid="'+rec.id+'">'+
      '<div class="kc-sugcard-h">'+TAG[rec.type]+
        '<span class="kc-sugcard-who"><span class="kc-sugcard-av">'+esc(rec.initials||'?')+'</span>'+esc(rec.author||'')+'</span></div>'+
      body+ noteRO(rec.note)+
      '<div class="kc-sugcard-acts">'+
        '<button class="kc-sug-x" onclick="KC.TL.act('+rec.id+',\'reject\')"><i data-lucide="x"></i>Reject</button>'+
        '<button class="kc-sug-go" onclick="KC.TL.act('+rec.id+',\'approve\')"><i data-lucide="check"></i>Approve</button>'+
      '</div></div>';
  }
  function cardEl(html){ const d=document.createElement('div'); d.innerHTML=html; return d.firstChild; }

  /* ================= compose entry points ================= */
  // ONE entry from the selection popup — the card opens in "Change text" mode; the user can flip
  // to "Add after" inside the card (KC.composeMode). Works on any official text block.
  KC.proposeEdit = function(){
    const para=KC._selPara, range=KC._selRange && KC._selRange.cloneRange();
    const sel=window.getSelection && window.getSelection();
    if(sel && sel.removeAllRanges) sel.removeAllRanges();
    if(!para || !range){ return; }
    const cb=para.closest('.c2 .cb'); if(!cb) return;
    const original=(KC._selText||'').trim(); if(!original) return;
    clearCompose();
    const id=nid();
    // try a tight fragment wrap; if the selection crosses an inner element, fall back to the whole block
    let span=wrapRange(range, id), orig=original, block=false;
    if(!span){ span=markPara(para, id); orig=para.textContent.trim(); block=true; }
    const rec={ id, type:'edit', ws:wsIdxOf(cb), bIdx:bIndexOf(cb,para), tIdx:topIndexOf(cb,para), original:orig, proposed:orig, block, note:'' };
    const card=cardEl(composeHTML(rec)); card.dataset.tidx=rec.tIdx; topOf(para).after(card); icons();
    const pr=card.querySelector('.kc-sug-proposed'); if(pr){ pr.focus(); document.execCommand&&document.execCommand('selectAll',false,null); }
    setTimeout(()=>{ const r=card.getBoundingClientRect(), b=cb.getBoundingClientRect(); cb.scrollTop += (r.top-b.top)-120; },30);
  };
  // legacy alias — open the card and flip straight to add mode
  KC.proposeAdd = function(){ KC.proposeEdit(); const c=document.querySelector('.kc-sugcard.compose'); if(c) KC.composeMode(+c.dataset.sid,'add'); };

  // flip the compose card between "Change text" and "Add after"
  KC.composeMode = function(id, mode){
    const card=findCard(id); if(!card) return;
    const add = mode==='add';
    card.classList.toggle('mode-add', add);
    card.classList.toggle('mode-edit', !add);
    card.querySelectorAll('.kc-sugmode').forEach(b=>b.classList.remove('active'));
    const btn=card.querySelector(add?'.m-add':'.m-edit'); if(btn) btn.classList.add('active');
    const f=card.querySelector(add?'.kc-sug-add':'.kc-sug-proposed'); if(f) f.focus();
  };

  KC.cancelCompose = function(id){ clearMark(findOrig(id)); const c=findCard(id); if(c) c.remove(); };

  /* ================= submit ================= */
  KC.submitProposal = function(id){
    const card=findCard(id); if(!card) return;
    const type=card.classList.contains('mode-add')?'add':'edit';
    const proposedEl = type==='add' ? card.querySelector('.kc-sug-add') : card.querySelector('.kc-sug-proposed');
    const proposed=(proposedEl?proposedEl.textContent:'').trim();
    const note=(card.querySelector('.kc-sug-textarea')||{}).value; const noteV=(note||'').trim();
    if(!proposed){ toast(type==='add'?'Write the addition text':'Enter the proposed text'); if(proposedEl) proposedEl.focus(); return; }
    const cb=card.closest('.c2 .cb'); const meta=pathOf(cb); const w=who();
    const rec={ id, submitted:true, type, ws:wsIdxOf(cb),
      author:w.author, initials:w.initials, when:'just now',
      path:meta.path, title:meta.title, note:noteV };
    if(type==='edit'){ const o=findOrig(id); rec.original=(o?o.textContent:proposed); rec.proposed=proposed; rec.block=!!(o&&o.classList.contains('kc-edit-line')); rec.bIdx=bIndexOf(cb, o?o.closest(BLK_SEL+', .doc-p'):null); }
    else { rec.content=proposed; rec.tIdx=(+card.dataset.tidx); if(isNaN(rec.tIdx)) rec.tIdx=-1; clearMark(findOrig(id)); }

    if(isLead()){
      // team lead: apply immediately, do not queue
      KC.applyProposalDOM(rec, 'approve');
      if(KC.DocPage && KC.DocPage.logVersion && /project startup/i.test(meta.title||'')){
        KC.DocPage.logVersion({ who: w.author||'Unknown', change: noteV || (type==='add'?'Added a new paragraph':'Edited existing text'), anchor: rec.anchor||'' });
      }
      toast(type==='add' ? 'Addition added to the document' : 'Edit applied to the document');
      return;
    }
    const all=KC.loadSuggestions(); all.push(rec); KC.saveSuggestions(all);
    // swap compose → pending in place
    const pend=cardEl(pendingHTML(rec)); card.replaceWith(pend);
    const s=findOrig(id); if(s) s.classList.add('kc-edit-live');
    icons();
    toast('Sent to the team lead for review');
  };

  // author withdraws a still-pending proposal
  KC.cancelProposal = function(id){
    if(KC.removeSuggestion) KC.removeSuggestion(id);
    clearMark(findOrig(id)); const c=findCard(id); if(c) c.remove();
    toast('Proposal withdrawn');
  };

  /* ── nearest section anchor (sec-*) preceding a changed node, inside the DocPage ── */
  function sectionAnchorOf(node){
    if(!node || !node.closest) return '';
    const dp=node.closest('.kc-docpage'); if(!dp) return '';
    const heads=[...dp.querySelectorAll('.dp-h[id]')]; if(!heads.length) return '';
    let anchor='';
    for(const h of heads){
      if(h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) anchor=h.id; else break;
    }
    return anchor;
  }

  /* ================= apply (approve) / dismiss (reject) in the doc =====
     Called by the team lead's KC.TL.act via doApprove/doReject (kc-teamlead.js). */
  KC.applyProposalDOM = function(rec, action){
    const card=findCard(rec.id), span=findOrig(rec.id);
    if(action==='approve'){
      if(rec.type==='edit'){
        if(span){ if(!rec.anchor) rec.anchor=sectionAnchorOf(span); span.textContent=rec.proposed; span.classList.remove('kc-edit-orig','kc-edit-live','kc-edit-line'); span.removeAttribute('data-sid'); }
      } else if(rec.type==='add'){
        const cb=officialCB(rec.ws);
        const inDP = card ? !!card.closest('.kc-docpage') : !!docBody(cb);
        const p=document.createElement('div'); p.className=inDP?'dp-p':'doc-p'; p.setAttribute('dir','auto'); p.textContent=rec.content;
        if(card){ card.replaceWith(p); if(!rec.anchor) rec.anchor=sectionAnchorOf(p); return; }
        if(cb){ const tb=topBlocks(cb); const at=tb[rec.tIdx]; if(at) at.after(p); else (docBody(cb)||cb).appendChild(p); if(!rec.anchor) rec.anchor=sectionAnchorOf(p); }
        return;
      }
    } else { // reject
      if(rec.type==='edit') clearMark(span);
    }
    if(card) card.remove();
  };

  /* ================= re-inject pending proposals on load (all roles) ==== */
  function renderPending(){
    document.querySelectorAll('.kc-sugcard.pending,.kc-sugcard.review').forEach(c=>c.remove());
    document.querySelectorAll('.kc-edit-orig').forEach(s=>{ if(!s.closest('.compose')) clearMark(s); });
    const list = (KC.loadSuggestions?KC.loadSuggestions():[]).filter(r=>r.type==='edit'||r.type==='add');
    const lead=isLead();
    list.forEach(rec=>{
      const cb=officialCB(rec.ws); if(!cb) return;
      const html = lead ? reviewHTML(rec) : pendingHTML(rec);
      const card=cardEl(html);
      if(rec.type==='edit'){
        const bs=editBlocks(cb); const para=bs[rec.bIdx!=null?rec.bIdx:rec.pIdx]; if(!para){ return; }
        let span = rec.block ? null : wrapFirstMatch(para, rec.original, rec.id);
        if(!span) span=markPara(para, rec.id);
        span.classList.add('kc-edit-live');
        topOf(para).after(card);
      } else {
        const tb=topBlocks(cb); const at=tb[rec.tIdx!=null?rec.tIdx:rec.pIdx];
        if(at){ at.after(card); }
        else { const bc=cb.querySelector('.bcrumb'); if(bc) bc.after(card); else cb.appendChild(card); }
      }
    });
    icons();
  }
  KC.renderPending = renderPending;

  /* ================= boot ================= */
  function boot(){ renderPending(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', ()=>setTimeout(boot,60));
  else setTimeout(boot,60);
})();
