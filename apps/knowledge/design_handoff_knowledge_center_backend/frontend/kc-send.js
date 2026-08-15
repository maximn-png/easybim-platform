/* ═══════════════════════════════════════════════════════════════════════════
   kc-send.js — "Send this document" flow (backlog #14)
   A KC Textbook page can be emailed to a consultant tied to a PROJECT, or
   attached to a comment on an ACC (Autodesk Construction Cloud) issue.

   Flow (wizard inside one overlay):
     project  → pick a project (search by name OR code, from the platform base)
     route    → Email a consultant  |  Attach in ACC (issue → comment)  [beta]
     recip    → consultants on that project, filtered by discipline/role/company/
                name/email; multi-select (checkboxes). One project per send.
     compose  → subject (auto, project name locked in) + editable cover text +
                standard signature; Send → toast + a record in the Send log.
     acc-iss  → open issues on the project → pick one
     acc-cmt  → comment box → Post to ACC (mocked; opens the project's cloud folder)
     done     → confirmation summary
   A "Log" tab shows the send history (localStorage kc_send_log) — the journal.

   All roles may send. Depends conceptually on backlog #10 (read-only web form)
   which the "Web page" download already approximates; #13 (consultant profiles).
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  const KC = window.KC = window.KC || {};
  const Send = KC.Send = KC.Send || {};
  const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const attr = s => String(s==null?'':s).replace(/'/g,'&#39;').replace(/"/g,'&quot;');
  const toast = (m)=>{ try{ (window.toast||KC.toast||function(){})(m); }catch(e){} };
  const icons = ()=>{ try{ if(window.lucide&&lucide.createIcons) lucide.createIcons(); }catch(e){} };

  /* ── Demo platform data — real EasyBIM projects (from the platform base),
     with consultants (external partners / смежники) and ACC issues per project.
     Codes + Hebrew names mirror the live Projects page; the ACC flag matches the
     cloud-folder column (some projects have no ACC folder linked yet). ── */
  const PROJECTS = window.KC_PROJECTS = [
    { code:'22125', name:'ארנה הרצליה', acc:true,
      consultants:[
        {name:'Amir Cohen',    company:'Cohen Structures',    disc:'Structural',   role:'Lead engineer',    mail:'amir@cohen-eng.co.il'},
        {name:'Dana Levi',     company:'ClimaTech MEP',       disc:'MEP',          role:'HVAC coordinator', mail:'dana.levi@climatech.co.il'},
        {name:'Rina Shapira',  company:'Shapira Architects',  disc:'Architecture', role:'Project architect',mail:'rina@shapira-arc.co.il'},
        {name:'Tomer Adler',   company:'VoltLine',            disc:'Electrical',   role:'Electrical eng.',  mail:'tomer.adler@voltline.co.il'}
      ],
      issues:[
        {id:'#317', title:'Coordination', type:'COR', status:'Open',        assigned:'Architect',           placement:'HAR_EB_Arena_M3'},
        {id:'#311', title:'Coordination', type:'COR', status:'Pending',     assigned:'Electrical Engineer', placement:'HAR_EB_Arena_M3'},
        {id:'#309', title:'Coordination', type:'COR', status:'In progress', assigned:'Architect',           placement:'HAR_EB_Arena_M3'},
        {id:'#307', title:'Coordination', type:'COR', status:'Open',        assigned:'Plumbing Engineer',   placement:'HAR_EB_Arena_M3'}
      ] },
    { code:'22131', name:'נתצים בית שמש', acc:true, accAlert:true,
      consultants:[
        {name:'Noa Friedman',  company:'InfraCore',      disc:'Civil',        role:'Discipline lead',  mail:'noa@infracore.co.il'},
        {name:'Eitan Mizrahi', company:'GeoSolve',       disc:'Geotechnical', role:'Geotech eng.',     mail:'eitan@geosolve.co.il'},
        {name:'Sara Katz',     company:'ClimaTech MEP',  disc:'MEP',          role:'Ventilation',      mail:'sara.katz@climatech.co.il'}
      ],
      issues:[
        {id:'#204', title:'Coordination', type:'COR', status:'Open',        assigned:'Structural Engineer', placement:'BSH_EB_M3'},
        {id:'#198', title:'Coordination', type:'COR', status:'Pending',     assigned:'Civil Engineer',      placement:'BSH_EB_M3'},
        {id:'#191', title:'Coordination', type:'COR', status:'In progress', assigned:'MEP Engineer',         placement:'BSH_EB_M3'}
      ] },
    { code:'22138', name:'פארק קיסריה - מלון גולף ריזורט', acc:true,
      consultants:[
        {name:'Michal Ben-David', company:'MediPlan',         disc:'Architecture', role:'Project architect', mail:'michal@mediplan.co.il'},
        {name:'Gil Reuveni',      company:'ClimaTech MEP',    disc:'MEP',          role:'Plumbing',          mail:'gil@climatech.co.il'},
        {name:'Avner Stern',      company:'Cohen Structures', disc:'Structural',   role:'Structural eng.',   mail:'avner@cohen-eng.co.il'},
        {name:'Boris Petrov',     company:'VoltLine',         disc:'Electrical',   role:'Low-voltage',       mail:'boris@voltline.co.il'}
      ],
      issues:[
        {id:'#142', title:'Coordination', type:'COR', status:'Open',    assigned:'MEP Engineer',        placement:'KSR_EB_M3'},
        {id:'#138', title:'Coordination', type:'COR', status:'Pending', assigned:'Structural Engineer', placement:'KSR_EB_M3'}
      ] },
    { code:'22141', name:'הרחבת שבעה כוכבים - דיור מוגן הרצליה', acc:true, accAlert:true,
      consultants:[
        {name:'Yael Cohen',    company:'ClimaTech MEP',      disc:'MEP',          role:'Medical gas',       mail:'yael@climatech.co.il'},
        {name:'Roi Shani',     company:'Shapira Architects', disc:'Architecture', role:'Healthcare arch.',  mail:'roi@shapira-arc.co.il'},
        {name:'Dana Levi',     company:'ClimaTech MEP',      disc:'MEP',          role:'HVAC coordinator',  mail:'dana.levi@climatech.co.il'}
      ],
      issues:[
        {id:'#088', title:'Coordination', type:'COR', status:'Open',        assigned:'MEP Engineer', placement:'SVK_EB_M3'},
        {id:'#081', title:'Coordination', type:'COR', status:'In progress', assigned:'Architect',     placement:'SVK_EB_M3'}
      ] },
    { code:'22145', name:'חבצלת השרון, מגרש 207', acc:true, accAlert:true,
      consultants:[
        {name:'Amir Cohen',   company:'Cohen Structures', disc:'Structural', role:'Lead engineer',    mail:'amir@cohen-eng.co.il'},
        {name:'Sara Katz',    company:'ClimaTech MEP',    disc:'MEP',        role:'Ventilation',      mail:'sara.katz@climatech.co.il'},
        {name:'Tomer Adler',  company:'VoltLine',         disc:'Electrical', role:'Electrical eng.',  mail:'tomer.adler@voltline.co.il'}
      ],
      issues:[
        {id:'#063', title:'Coordination', type:'COR', status:'Open',    assigned:'Structural Engineer', placement:'HSH_EB_207'},
        {id:'#059', title:'Coordination', type:'COR', status:'Pending', assigned:'MEP Engineer',        placement:'HSH_EB_207'}
      ] },
    { code:'22156', name:'לייף סנטר - הר חומה', acc:true,
      consultants:[
        {name:'Rina Shapira', company:'Shapira Architects', disc:'Architecture', role:'Project architect', mail:'rina@shapira-arc.co.il'},
        {name:'Gil Reuveni',  company:'ClimaTech MEP',      disc:'MEP',          role:'Plumbing',          mail:'gil@climatech.co.il'}
      ],
      issues:[
        {id:'#037', title:'Coordination', type:'COR', status:'Open', assigned:'MEP Engineer', placement:'LFC_EB_M3'}
      ] },
    { code:'22101', name:'בר עקיבא - ליווי BIM משרדי', acc:false,
      consultants:[
        {name:'Avner Stern',  company:'Cohen Structures', disc:'Structural', role:'Structural eng.', mail:'avner@cohen-eng.co.il'},
        {name:'Dana Levi',    company:'ClimaTech MEP',    disc:'MEP',        role:'HVAC coordinator', mail:'dana.levi@climatech.co.il'}
      ],
      issues:[] },
    { code:'22120', name:'לודן צפון - ליווי BIM משרדי', acc:false,
      consultants:[
        {name:'Noa Friedman', company:'InfraCore',       disc:'Civil',      role:'Discipline lead', mail:'noa@infracore.co.il'},
        {name:'Tomer Adler',  company:'VoltLine',        disc:'Electrical', role:'Electrical eng.', mail:'tomer.adler@voltline.co.il'}
      ],
      issues:[] }
  ];

  const DISC_COLORS = { 'Structural':'#1e248c','MEP':'#44b8d3','Architecture':'#818cf8','Civil':'#0891b2','Geotechnical':'#7c3aed','Electrical':'#2563eb','Systems':'#0d9488' };
  const discColor = d => DISC_COLORS[d] || '#7b829c';
  const STATUS_COLORS = { 'Open':'#f59e0b','Pending':'#2563eb','In progress':'#0891b2','In review':'#0891b2','Completed':'#1f8a5b','Draft':'#7b829c' };
  const statusColor = s => STATUS_COLORS[s] || '#7b829c';
  const initials = n => n.split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();

  /* ── Send log (the journal) ── */
  Send.loadLog = function(){ return KC.API.getSendLog(); };
  Send.saveLog = function(a){ KC.API.saveSendLog(a); };
  function logAdd(rec){ const a=Send.loadLog(); rec.when=Date.now(); a.unshift(rec); Send.saveLog(a); }
  function fmtWhen(ts){ const d=new Date(ts); return d.toLocaleDateString(undefined,{day:'numeric',month:'short'})+' · '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); }

  /* ── wizard state ── */
  const S = Send._s = { doc:null, project:null, recips:{}, issue:null, subject:'', body:'' };

  function ensureDOM(){
    let bg = document.getElementById('sndBg');
    if(bg) return bg;
    bg = document.createElement('div');
    bg.className='snd-bg'; bg.id='sndBg';
    bg.innerHTML='<div class="snd-modal" id="sndModal"></div>';
    document.body.appendChild(bg);
    bg.addEventListener('click', e=>{ if(e.target===bg) Send.close(); });
    return bg;
  }
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ const bg=document.getElementById('sndBg'); if(bg&&bg.classList.contains('show')) Send.close(); } });

  Send.close = function(){ const bg=document.getElementById('sndBg'); if(bg) bg.classList.remove('show'); };

  /* Read the doc being sent from the current Textbook context (set by bookMenu) */
  function readDoc(kind){
    const ctx = KC._dlCtx;
    let title='This document', path=[];
    const ci = ctx && ctx.ci;
    if(ci){
      const cur = ci.querySelector('.bcrumb .bc-cur') || ci.querySelector('.kc-doc-title');
      title = (cur ? (cur.value||cur.textContent) : title).trim() || title;
      const crumbs = [...ci.querySelectorAll('.bcrumb span')].map(s=>s.textContent.trim()).filter(Boolean);
      if(crumbs.length) path = crumbs;
    }
    const wsEl = ci ? ci.closest('.workspace') : document.querySelector('.workspace.active');
    const wsName = wsEl ? (wsEl.querySelector('.ws-title')?.textContent.trim()||'') : '';
    return { title, path, wsName };
  }

  Send.open = function(kind){
    S.doc = readDoc(kind||'textbook');
    S.project=null; S.recips={}; S.issue=null;
    S.subject=''; S.body='';
    KC.closeMenu && KC.closeMenu();
    ensureDOM().classList.add('show');
    Send.step('project');
  };

  /* ── header + chrome ── */
  const PARENT = { route:'project', recip:'route', compose:'recip', 'acc-iss':'route' };
  Send.back = function(){ const par=PARENT[Send._cur]; if(par) Send.step(par); };
  function shell(inner, opts){
    opts=opts||{};
    const d=S.doc||{};
    const crumb = d.path && d.path.length ? d.path.join(' › ') : (d.wsName||'Knowledge Center');
    const canBack = !opts.log && PARENT[Send._cur];
    return ''+
      '<div class="snd-head">'+
        '<div class="snd-head-l">'+
          (canBack?'<button class="snd-back" onclick="KC.Send.back()" title="Back one step"><i data-lucide="arrow-left"></i></button>':'')+
          '<div class="snd-ic"><i data-lucide="send"></i></div>'+
          '<div><div class="snd-title">Send document</div>'+
            '<div class="snd-doc" title="'+attr(d.title||'')+'"><i data-lucide="file-text"></i>'+esc(d.title||'This document')+'</div>'+
          '</div>'+
        '</div>'+
        '<div class="snd-head-r">'+
          '<button class="snd-tab'+(opts.log?' active':'')+'" onclick="KC.Send.step(\''+(opts.log?'project':'log')+'\')" title="Send history">'+
            '<i data-lucide="'+(opts.log?'arrow-left':'history')+'"></i>'+(opts.log?'Back':'Log')+'</button>'+
          '<button class="snd-x" onclick="KC.Send.close()"><i data-lucide="x"></i></button>'+
        '</div>'+
      '</div>'+
      (opts.log?'':'<div class="snd-bread"><i data-lucide="folder"></i>'+esc(crumb)+'</div>')+
      (opts.steps?stepsBar(opts.steps):'')+
      '<div class="snd-body">'+inner+'</div>';
  }
  function stepsBar(cur){
    const isAcc = cur.indexOf('acc')===0;
    const steps=[['project','Project'],['route','Channel'],[isAcc?'acc':'recip', isAcc?'Issue':'Recipients']];
    if(!isAcc) steps.push(['compose','Compose']);
    const ci = isAcc ? 2 : steps.findIndex(s=>s[0]===cur);
    return '<div class="snd-steps">'+steps.map((s,i)=>{
      const state = i<ci?'done':(i===ci?'now':'');
      return '<div class="snd-step '+state+'">'+(state==='done'?'<i data-lucide="check"></i>':'<span>'+(i+1)+'</span>')+esc(s[1])+'</div>';
    }).join('<i data-lucide="chevron-right" class="snd-step-sep"></i>')+'</div>';
  }
  function render(html){ const m=document.getElementById('sndModal'); if(!m) return; m.innerHTML=html; icons(); }
  function pickedBar(backStep, backLabel){ const p=S.project; return '<div class="snd-picked"><span class="snd-proj-code">'+esc(p.code)+'</span><span class="snd-picked-name" dir="auto">'+esc(p.name)+'</span><button class="snd-change" onclick="KC.Send.step(\''+backStep+'\')">'+(backLabel||'Change')+'</button></div>'; }

  /* ── router ── */
  Send.step = function(name){
    if(name==='project') return stepProject();
    if(name==='route')   return stepRoute();
    if(name==='recip')   return stepRecip();
    if(name==='compose') return stepCompose();
    if(name==='acc-iss') return stepAccIssue();
    if(name==='done')    return stepDone();
    if(name==='log')     return stepLog();
  };

  /* 1 — project search */
  function stepProject(){
    Send._cur='project';
    const q=(Send._pq||'').toLowerCase();
    const list = PROJECTS.filter(p=> !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    const rows = list.length ? list.map(p=>{
      const sel = S.project && S.project.code===p.code;
      return '<button class="snd-proj'+(sel?' sel':'')+'" onclick="KC.Send.pickProject(\''+attr(p.code)+'\')">'+
        '<span class="snd-proj-code">'+esc(p.code)+'</span>'+
        '<span class="snd-proj-name" dir="auto">'+esc(p.name)+'</span>'+
        '<span class="snd-proj-meta">'+p.consultants.length+' consultants'+(p.acc?' · <span class="snd-acc-dot'+(p.accAlert?' alert':'')+'">ACC</span>':'')+'</span>'+
        (sel?'<i data-lucide="check" class="snd-proj-chk"></i>':'<i data-lucide="chevron-right" class="snd-proj-chev"></i>')+
      '</button>';
    }).join('') : '<div class="snd-empty"><i data-lucide="search-x"></i>No project matches "'+esc(Send._pq||'')+'"</div>';
    render(shell(
      '<div class="snd-lead">Which project is this for? Search the platform\u2019s project base by name or code.</div>'+
      '<div class="snd-search"><i data-lucide="search"></i>'+
        '<input id="sndPQ" placeholder="Search projects — name or code…" value="'+attr(Send._pq||'')+'" oninput="KC.Send.searchProject(this.value)" autocomplete="off">'+
      '</div>'+
      '<div class="snd-list">'+rows+'</div>',
      {steps:'project'}
    ));
    const inp=document.getElementById('sndPQ'); if(inp){ inp.focus(); inp.setSelectionRange(inp.value.length,inp.value.length); }
  }
  Send.searchProject = function(v){ Send._pq=v; stepProject(); };
  Send.pickProject = function(code){ S.project = PROJECTS.find(p=>p.code===code)||null; S.recips={}; Send.step('route'); };

  /* 2 — route (email vs ACC) */
  function stepRoute(){
    Send._cur='route';
    const p=S.project; if(!p) return stepProject();
    const accOn = p.acc;
    render(shell(
      pickedBar('project','Change')+
      '<div class="snd-lead">How do you want to deliver this document?</div>'+
      '<div class="snd-routes">'+
        '<button class="snd-route" onclick="KC.Send.step(\'recip\')">'+
          '<div class="snd-route-ic mail"><i data-lucide="mail"></i></div>'+
          '<div class="snd-route-t">Email a consultant</div>'+
          '<div class="snd-route-d">Send the file to one or more consultants assigned to this project. Project name is locked into the subject.</div>'+
          '<div class="snd-route-go">Choose recipients <i data-lucide="arrow-right"></i></div>'+
        '</button>'+
        '<button class="snd-route'+(accOn?'':' off')+'" '+(accOn?'onclick="KC.Send.step(\'acc-iss\')"':'disabled')+'>'+
          '<div class="snd-route-ic acc"><i data-lucide="cloud"></i></div>'+
          '<div class="snd-route-t">Attach in ACC <span class="snd-beta">Beta</span></div>'+
          '<div class="snd-route-d">'+(accOn
              ? 'Jump to this project\u2019s open issues in Autodesk Forma and attach the document to a comment there.'
              : 'This project has no ACC cloud folder linked on the platform yet.')+'</div>'+
          '<div class="snd-route-go">'+(accOn?'View open issues <i data-lucide="arrow-right"></i>':'Not available')+'</div>'+
        '</button>'+
      '</div>',
      {steps:'route'}
    ));
  }

  /* 3a — recipients (filter + multi-select) */
  function stepRecip(){
    Send._cur='recip';
    const p=S.project; if(!p) return stepProject();
    const q=(Send._cq||'').toLowerCase();
    const fd=Send._fDisc||'', fc=Send._fComp||'';
    const discs=[...new Set(p.consultants.map(c=>c.disc))];
    const comps=[...new Set(p.consultants.map(c=>c.company))];
    const list=p.consultants.filter(c=>
      (!fd||c.disc===fd)&&(!fc||c.company===fc)&&
      (!q||(c.name+' '+c.role+' '+c.mail+' '+c.company).toLowerCase().includes(q)));
    const chosen=Object.keys(S.recips).filter(k=>S.recips[k]).length;
    const rows=list.length?list.map(c=>{
      const on=!!S.recips[c.mail];
      return '<label class="snd-c'+(on?' on':'')+'">'+
        '<input type="checkbox" '+(on?'checked':'')+' onchange="KC.Send.toggleRecip(\''+attr(c.mail)+'\')">'+
        '<span class="snd-c-av" style="background:'+discColor(c.disc)+'">'+esc(initials(c.name))+'</span>'+
        '<span class="snd-c-main"><span class="snd-c-name">'+esc(c.name)+'</span>'+
          '<span class="snd-c-sub">'+esc(c.role)+' · '+esc(c.company)+'</span>'+
          '<span class="snd-c-mail">'+esc(c.mail)+'</span></span>'+
        '<span class="snd-c-disc" style="color:'+discColor(c.disc)+';border-color:'+discColor(c.disc)+'33">'+esc(c.disc)+'</span>'+
      '</label>';
    }).join(''):'<div class="snd-empty"><i data-lucide="user-x"></i>No consultants match these filters.</div>';
    const opt=(v,cur)=>'<option value="'+attr(v)+'"'+(v===cur?' selected':'')+'>'+esc(v||'')+'</option>';
    render(shell(
      pickedBar('route','Back')+
      '<div class="snd-lead">Pick who receives it — filter by discipline, company, or search.</div>'+
      '<div class="snd-filters">'+
        '<div class="snd-search sm"><i data-lucide="search"></i><input placeholder="Name or email…" value="'+attr(Send._cq||'')+'" oninput="KC.Send.searchRecip(this.value)"></div>'+
        '<select class="snd-sel" onchange="KC.Send.filterDisc(this.value)"><option value="">All disciplines</option>'+discs.map(d=>opt(d,fd)).join('')+'</select>'+
        '<select class="snd-sel" onchange="KC.Send.filterComp(this.value)"><option value="">All companies</option>'+comps.map(c=>opt(c,fc)).join('')+'</select>'+
      '</div>'+
      '<div class="snd-list">'+rows+'</div>'+
      '<div class="snd-foot">'+
        '<div class="snd-count">'+(chosen?('<b>'+chosen+'</b> selected'):'No one selected yet')+'</div>'+
        '<button class="snd-btn pri" '+(chosen?'':'disabled')+' onclick="KC.Send.step(\'compose\')">Compose email <i data-lucide="arrow-right"></i></button>'+
      '</div>',
      {steps:'recip'}
    ));
  }
  Send.searchRecip=function(v){ Send._cq=v; stepRecip(); };
  Send.filterDisc=function(v){ Send._fDisc=v; stepRecip(); };
  Send.filterComp=function(v){ Send._fComp=v; stepRecip(); };
  Send.toggleRecip=function(mail){ S.recips[mail]=!S.recips[mail]; stepRecip(); };

  /* 3b — compose email */
  function chosenList(){ const p=S.project; return p?p.consultants.filter(c=>S.recips[c.mail]):[]; }
  function stepCompose(){
    Send._cur='compose';
    const p=S.project, d=S.doc||{}; if(!p) return stepProject();
    const recips=chosenList();
    if(!recips.length) return stepRecip();
    if(!S.subject) S.subject='['+p.code+'] '+(d.title||'Knowledge Center document');
    if(!S.body) S.body='Hi,\n\nPlease find attached the "'+(d.title||'document')+'" from our BIM Knowledge Center, relevant to '+p.name+'.\n\nLet me know if you have any questions.';
    const chips=recips.map(c=>'<span class="snd-chip"><span class="snd-chip-av" style="background:'+discColor(c.disc)+'">'+esc(initials(c.name))+'</span>'+esc(c.name)+'<button onclick="KC.Send.toggleRecip(\''+attr(c.mail)+'\');KC.Send.step(\'compose\')" title="Remove"><i data-lucide="x"></i></button></span>').join('');
    const id=(KC.identity||{});
    render(shell(
      '<div class="snd-compose">'+
        '<div class="snd-field"><label>To · '+recips.length+' on '+esc(p.code)+'</label><div class="snd-chips">'+chips+'</div></div>'+
        '<div class="snd-field"><label>Subject <span class="snd-lock" title="Project name is kept in the subject"><i data-lucide="lock"></i>project</span></label>'+
          '<input class="snd-in" id="sndSubj" value="'+attr(S.subject)+'" oninput="KC.Send._s.subject=this.value"></div>'+
        '<div class="snd-field"><label>Message</label>'+
          '<textarea class="snd-ta" id="sndBody" oninput="KC.Send._s.body=this.value">'+esc(S.body)+'</textarea></div>'+
        '<div class="snd-att"><i data-lucide="paperclip"></i><span class="snd-att-n">'+esc(d.title||'document')+'.pdf</span><span class="snd-att-tag">Web page</span></div>'+
        '<div class="snd-sig">'+esc(id.name||'Polina Reznik')+' · EasyBIM<br><span>'+esc(id.mail||'polina@easybim.co.il')+' · Sent from the Knowledge Center</span></div>'+
      '</div>'+
      '<div class="snd-foot">'+
        '<button class="snd-btn" onclick="KC.Send.step(\'recip\')"><i data-lucide="arrow-left"></i>Recipients</button>'+
        '<button class="snd-btn pri" onclick="KC.Send.sendEmail()"><i data-lucide="send"></i>Send email</button>'+
      '</div>',
      {steps:'compose'}
    ));
  }
  Send.sendEmail=function(){
    const p=S.project, d=S.doc||{}, recips=chosenList();
    logAdd({channel:'email', project:p.code, projectName:p.name, docTitle:d.title,
      subject:S.subject, recips:recips.map(c=>({name:c.name,mail:c.mail}))});
    S._result={type:'email', recips, project:p};
    toast('Sent to '+recips.length+' consultant'+(recips.length>1?'s':'')+' on '+p.code);
    Send.step('done');
  };

  /* 4 — ACC: hand off to Autodesk (option C — context list + open in ACC).
     We don't rebuild the Autodesk UI; we show the project's recent open issues
     for context and hand control to ACC on the right issue, where the comment
     is written natively. Mock: opens a new tab + records the hand-off. */
  function accUrl(p, is){
    const base='https://acc.autodesk.com/projects/'+encodeURIComponent(p.code)+'/issues';
    return is ? base+'/'+encodeURIComponent(is.id.replace('#','')) : base;
  }
  function stepAccIssue(){
    Send._cur='acc-iss';
    const p=S.project, d=S.doc||{}; if(!p) return stepProject();
    const open=p.issues.filter(is=>is.status!=='Completed'&&is.status!=='Draft');
    const rows=open.length?open.map(is=>
      '<button class="snd-iss" onclick="KC.Send.openAcc(\''+attr(is.id)+'\')">'+
        '<span class="snd-iss-top">'+
          '<span class="snd-iss-id">'+esc(is.id)+'</span>'+
          '<span class="snd-iss-cor">'+esc(is.type||'COR')+'</span>'+
          '<span class="snd-iss-status"><span class="snd-iss-dot" style="background:'+statusColor(is.status)+'"></span>'+esc(is.status)+'</span>'+
          '<span class="snd-iss-open">Open <i data-lucide="external-link"></i></span>'+
        '</span>'+
        '<span class="snd-iss-sub">'+esc(is.title)+' · Assigned to '+esc(is.assigned||'Unspecified')+' · '+esc(is.placement||'')+'</span>'+
      '</button>'
    ).join(''):'<div class="snd-empty"><i data-lucide="check-circle"></i>No open issues cached for this project.</div>';
    render(shell(
      pickedBar('route','Back')+
      '<div class="snd-lead"><i data-lucide="cloud"></i>These are the project\u2019s recent open issues. Open one in Autodesk Forma and attach \u201C'+esc(d.title||'this document')+'\u201D to your comment there.</div>'+
      '<button class="snd-btn pri snd-acc-all" onclick="KC.Send.openAcc()"><i data-lucide="external-link"></i>Open project issues in Autodesk Forma</button>'+
      (open.length?'<div class="snd-list-lbl">Recent open issues · '+esc(p.name)+'</div>':'')+
      '<div class="snd-list">'+rows+'</div>'+
      '<div class="snd-note"><i data-lucide="info"></i>Beta \u2014 for now this opens Forma in a new tab with the document ready to attach. Direct posting via the Autodesk API comes later.</div>',
      {steps:'acc-iss'}
    ));
  }
  Send.openAcc=function(id){
    const p=S.project, d=S.doc||{};
    const is = id ? (p.issues.find(i=>i.id===id)||null) : null;
    logAdd({channel:'acc', project:p.code, projectName:p.name, docTitle:d.title, issue:is?{id:is.id,title:is.title}:null});
    S._result={type:'acc', issue:is, project:p};
    try{ window.open(accUrl(p,is),'_blank','noopener'); }catch(e){}
    toast(is?('Opening '+is.id+' in Autodesk Forma'):('Opening '+p.code+' issues in Autodesk Forma'));
    Send.step('done');
  };

  /* 5 — done */
  function stepDone(){
    Send._cur='done';
    const r=S._result||{}, d=S.doc||{};
    let detail;
    if(r.type==='acc'){
      detail='<div class="snd-done-line"><i data-lucide="cloud"></i>'+(r.issue?('Opened <b>'+esc(r.issue.id)+'</b> in Autodesk Forma'):('Opened <b>'+esc(r.project.code)+'</b> issues in Autodesk Forma'))+'</div>'+
        '<div class="snd-done-line"><i data-lucide="paperclip"></i>Attach “'+esc(d.title||'document')+'” to your comment in the Forma tab</div>';
    } else {
      const names=(r.recips||[]).map(c=>esc(c.name)).join(', ');
      detail='<div class="snd-done-line"><i data-lucide="mail"></i>Emailed to <b>'+(r.recips||[]).length+'</b>: '+names+'</div>'+
        '<div class="snd-done-line"><i data-lucide="briefcase"></i>'+esc(r.project.name)+' ('+esc(r.project.code)+')</div>';
    }
    render(shell(
      '<div class="snd-done">'+
        '<div class="snd-done-ic"><i data-lucide="check"></i></div>'+
        '<div class="snd-done-h">'+(r.type==='acc'?'Handed off to ACC':'Email sent')+'</div>'+
        '<div class="snd-done-sub">\u201C'+esc(d.title||'Document')+'\u201D delivered.</div>'+
        '<div class="snd-done-card">'+detail+'</div>'+
        '<div class="snd-done-acts">'+
          '<button class="snd-btn" onclick="KC.Send.step(\'log\')"><i data-lucide="history"></i>View log</button>'+
          '<button class="snd-btn pri" onclick="KC.Send.close()"><i data-lucide="check"></i>Done</button>'+
        '</div>'+
      '</div>'
    ));
  }

  /* Log tab */
  function stepLog(){
    Send._cur='log';
    const log=Send.loadLog();
    const rows=log.length?log.map(r=>{
      const who = r.channel==='acc'
        ? '<i data-lucide="cloud"></i>ACC · '+esc(r.issue?r.issue.id:'')
        : '<i data-lucide="mail"></i>'+(r.recips||[]).map(c=>esc(c.name)).join(', ');
      return '<div class="snd-log-row">'+
        '<div class="snd-log-top"><span class="snd-log-doc">'+esc(r.docTitle||'Document')+'</span><span class="snd-log-when">'+fmtWhen(r.when)+'</span></div>'+
        '<div class="snd-log-meta"><span class="snd-proj-code sm">'+esc(r.project)+'</span><span class="snd-log-who">'+who+'</span></div>'+
      '</div>';
    }).join(''):'<div class="snd-empty"><i data-lucide="inbox"></i>Nothing sent yet. Every email and ACC attachment is recorded here.</div>';
    render(shell(
      '<div class="snd-lead">Send history — every document you\u2019ve emailed or attached in ACC. When mail is connected, these live in your Sent folder too.</div>'+
      '<div class="snd-list">'+rows+'</div>',
      {log:true}
    ));
  }
})();
