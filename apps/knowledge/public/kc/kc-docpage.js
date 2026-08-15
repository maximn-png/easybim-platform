/* ============================================================
   KC.DocPage — EasyBIM Knowledge Center "official document" renderer.
   One content model → two views:
     mode:'textbook'  reading surface inside the app (column c2)
     mode:'web'       polished read-only page for sharing / download
   All content is Hebrew RTL. Latin technical terms auto-wrap in a mono chip.
   ============================================================ */
(function () {
  const KC = window.KC = window.KC || {};
  const DP = KC.DocPage = KC.DocPage || {};

  /* ---- company colophon (corrected contacts) ---- */
  DP.company = {
    name: 'איזיבים הנדסה טכנולוגית בע"מ',
    phone: '050-331-8763',
    site: 'www.easybim.co.il',
    mail: 'office@easybim.co.il',
    addr: 'רחוב תובל 22, רמת גן'
  };

  /* ---- English translations for Hebrew headings (bilingual heading display) ---- */
  DP.EN = {
    'הקדמה': 'Introduction',
    'אופן פעולה': 'Procedure',
    'מידע ראשוני נדרש': 'Required preliminary information',
    'מי אחראי על ניהול המודלים בענן? (מנהל BIM / אדריכלות).': 'Who manages the cloud models? (BIM manager / architecture)',
    'האם קיבלנו גישה לפרויקט בענן ACC/BIM360?': 'Do we have access to the cloud project (ACC/BIM360)?',
    'האם האחראי פרסם הנחיות לשימוש במודלים? (BEP – BIM Execution Plan).': 'Has the lead published model-use guidelines? (BEP)',
    'פתיחת הפרויקט': 'Opening the project',
    'פתיחת פרויקט חדש': 'Open a new project',
    'העלאת מודל לענן (ACC/BIM360 Collaborate)': 'Upload model to the cloud (ACC/BIM360 Collaborate)',
    'שמירת המודל': 'Save the model',
    'העלאה לענן': 'Upload to the cloud',
    'הוספת מודל URS / אדריכלות (Revit Link)': 'Add URS / architecture model (Revit Link)',
    'טעינת לינקים נוספים': 'Load additional links',
    'יצירת Worksets': 'Create Worksets',
    'בחירת הלינק שבוצע לו Copy Monitor:': 'Select the Copy-Monitored link',
    'עדכון האלמנטים שב-Copy Monitor:': 'Update the Copy Monitor elements',
    'מבטי עבודה (Views)': 'Working views (Views)',
    'הכנת מבטים (Views)': 'Prepare views (Views)',
    'הגדרת מבטים (Views)': 'Configure views (Views)'
  };

  /* ---- fonts + CSS (single source of truth for both the app and downloads) ---- */
  DP.FONTS = 'https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&family=Assistant:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
  DP.CSS = `
.dp-tb,.dp-web,.dp-lightbox{
  --dp-navy:#1e248c;--dp-cyan:#44b8d3;--dp-cyan-deep:#00687a;--dp-ind:#818cf8;
  --dp-ink0:#111827;--dp-ink1:#4b5563;--dp-ink2:#7b829c;--dp-line:#e6e8f5;--dp-line2:#d2d7ee;
  --dp-fh:'Heebo','Hanken Grotesk',system-ui,sans-serif;
  --dp-fb:'Assistant','Inter',system-ui,sans-serif;
  --dp-fm:'JetBrains Mono',ui-monospace,monospace;
  --dp-ease:cubic-bezier(.4,0,.2,1);
}
.dp-tb,.dp-web{font-family:var(--dp-fb);line-height:1.62;color:var(--dp-ink0)}
.dp-p .dp-tech,.dp-list .dp-tech,.dp-vchg .dp-tech,.dp-callout .dp-tech,.dp-related-t .dp-tech,.dp-runhead-series .dp-tech,.dp-series-lbl .dp-tech{
  font-family:var(--dp-fm);font-size:.88em;color:var(--dp-navy);font-weight:500;letter-spacing:-.01em}
.dp-masthead{padding-bottom:14px;border-bottom:1px solid var(--dp-line);margin-bottom:16px}
.dp-classbar{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-family:var(--dp-fm);font-size:10.5px;font-weight:600;letter-spacing:.02em;color:var(--dp-ink2)}
.dp-classbar>.lucide{width:13px;height:13px;color:var(--dp-cyan-deep)}
.dp-class-sep{color:var(--dp-line2)}
.dp-classbar .dp-series-lbl{color:var(--dp-cyan-deep)}
.dp-classbar .dp-code{color:var(--dp-navy);letter-spacing:.06em}
.dp-series-lbl{white-space:nowrap}
.dp-title{font-family:var(--dp-fh);font-weight:800;font-size:22px;line-height:1.12;letter-spacing:-.02em;color:var(--dp-navy)}
.dp-byline{display:flex;flex-wrap:wrap;gap:10px 26px;margin-top:16px}
.dp-person{display:inline-flex;align-items:center;gap:9px}
.dp-ava{width:32px;height:32px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;font-family:var(--dp-fh);font-weight:700;font-size:12px;color:#fff;letter-spacing:.02em;background:linear-gradient(135deg,#1e248c,#44b8d3);box-shadow:0 2px 6px rgba(30,36,140,.2)}
.dp-person-t{display:flex;flex-direction:column;line-height:1.25}
.dp-person-l{font-size:10.5px;font-weight:600;color:var(--dp-ink2)}
.dp-person-n{font-size:12.5px;font-weight:600;color:var(--dp-ink0)}
/* ---- unified collapsible block (versions + TOC), styled like the tree's section rows ---- */
.dp-blk{margin:0 0 12px;border:1px solid var(--dp-line);border-radius:11px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(30,36,140,.04);container-type:inline-size}
.dp-blk-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px 7px 12px;background:linear-gradient(90deg,#eef1ff,#f7f9ff);border-bottom:1px solid var(--dp-line);cursor:pointer;user-select:none;transition:background .13s var(--dp-ease)}
.dp-blk-head:hover{background:linear-gradient(90deg,#e7ebff,#f2f5ff)}
.dp-blk-h{display:flex;align-items:center;gap:7px;font-family:var(--dp-fh);font-weight:700;font-size:11.5px;color:var(--dp-navy)}
.dp-blk-h .lucide{width:13px;height:13px;color:var(--dp-cyan-deep)}
.dp-blk-count{font-family:var(--dp-fm);font-size:9.5px;font-weight:600;color:var(--dp-ink2);background:#e0e7ff;border-radius:999px;padding:1px 6px}
.dp-blk-ctrl{display:flex;align-items:center;gap:2px}
.dp-blk-caret{width:15px;height:15px;color:var(--dp-ink2);flex-shrink:0}
.dp-blk-body{overflow:hidden}
.dp-blk.collapsed .dp-blk-body{display:none}
.dp-blk.collapsed .dp-blk-head{border-bottom:none}
.dp-toc-pin{appearance:none;border:none;background:transparent;cursor:pointer;width:23px;height:23px;border-radius:6px;display:grid;place-items:center;color:var(--dp-ink2);transition:all .13s var(--dp-ease)}
.dp-toc-pin .lucide{width:13px;height:13px}
.dp-toc-pin:hover{background:#dbe3ff;color:var(--dp-navy)}
.dp-vlog{display:flex;flex-direction:column;gap:8px;padding:10px}
.dp-vitem{display:flex;gap:11px;align-items:flex-start;padding:10px 13px;border:1px solid var(--dp-line);border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(30,36,140,.04)}
.dp-vitem.clickable{cursor:pointer;transition:border-color .14s var(--dp-ease),box-shadow .14s var(--dp-ease),background .14s var(--dp-ease)}
.dp-vitem.clickable:hover{border-color:#bfe9f2;background:#f7fdfe;box-shadow:0 2px 8px rgba(30,36,140,.06)}
.dp-vitem.dp-vcreate{background:linear-gradient(120deg,#eef2ff,#fbfcff);border-color:var(--dp-line2)}
.dp-vmeta{display:flex;align-items:center;gap:7px;flex:0 0 auto;margin-inline-start:auto}
.dp-vmain{flex:1;min-width:0}
.dp-vhead{display:flex;align-items:center;gap:4px 8px;flex-wrap:wrap;margin-bottom:3px}
.dp-vchip{font-family:var(--dp-fm);font-size:9px;font-weight:700;letter-spacing:.05em;color:var(--dp-navy);background:#e7eefe;padding:2px 8px;border-radius:999px}
.dp-vbadge{font-family:var(--dp-fm);font-size:8.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#fff;background:linear-gradient(135deg,#1e248c,#44b8d3);padding:2px 9px;border-radius:999px;line-height:1.6}
.dp-vwho2{flex:1 1 auto;min-width:min(100%,max-content);max-width:100%;font-family:var(--dp-fh);font-size:12px;font-weight:700;color:var(--dp-ink0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dp-vdate2{font-family:var(--dp-fm);font-size:10px;color:var(--dp-ink2);white-space:nowrap}
.dp-vchg2{display:flex;align-items:center;gap:6px;font-size:12.5px;line-height:1.5;color:var(--dp-ink1)}
.dp-vgo{width:14px;height:14px;color:var(--dp-line2);opacity:0;transition:all .14s var(--dp-ease);flex-shrink:0;margin-inline-start:auto}
.dp-vitem.clickable:hover .dp-vgo{opacity:1;color:var(--dp-cyan-deep)}
/* block contract: issue strip (team lead) and unreadable-document screen */
.dp-issues{margin:0 0 14px;border:1px solid #f5d9a8;background:#fffaf0;border-radius:12px;padding:9px 12px;font-size:12px;color:#8a5a12}
.dp-issues-h{display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer}
.dp-issues-h .lucide{width:15px;height:15px;stroke:#c98a1e}
.dp-issues-n{margin-inline-start:auto;font-family:var(--dp-fm);font-size:10px}
.dp-issues ul{margin:8px 0 0;padding-inline-start:18px;display:none;line-height:1.6}
.dp-issues.open ul{display:block}
.dp-docerr{border:1px solid var(--dp-line);border-radius:14px;padding:26px 22px;text-align:center;color:var(--dp-ink1)}
.dp-docerr .lucide{width:26px;height:26px;stroke:var(--dp-ink2);margin-bottom:8px}
.dp-docerr-t{font-family:var(--dp-fh);font-size:15px;font-weight:700;color:var(--dp-navy);margin-bottom:5px}
.dp-docerr-s{font-size:12.5px;margin-bottom:12px}
.dp-h{font-family:var(--dp-fh);color:var(--dp-navy);scroll-margin-top:90px}
.dp-h2{font-size:17px;font-weight:800;letter-spacing:-.01em;margin:26px 0 11px;padding-bottom:7px;border-bottom:2px solid #e3e7fb;display:flex;align-items:center;gap:10px}
.dp-h2::before{content:"";width:4px;height:15px;border-radius:3px;background:linear-gradient(180deg,#1e248c,#44b8d3);flex-shrink:0}
.dp-h3{font-size:15px;font-weight:700;letter-spacing:-.01em;margin:22px 0 9px;display:flex;align-items:baseline;gap:9px}
.dp-h4{font-size:13px;font-weight:700;margin:16px 0 6px;display:flex;align-items:baseline;gap:7px;color:#2b3187}
.dp-h5{font-size:12px;font-weight:600;margin:13px 0 5px;display:flex;align-items:baseline;gap:6px;color:#3a409a}
.dp-hnum{font-family:var(--dp-fm);font-weight:600;color:var(--dp-cyan-deep);flex-shrink:0}
.dp-h3 .dp-hnum{font-size:13px;background:#e7eefe;color:var(--dp-navy);padding:2px 8px;border-radius:6px}
.dp-h4 .dp-hnum,.dp-h5 .dp-hnum{font-size:.85em}
/* Hebrew headings: dir=rtl on the element puts the number on the right naturally (no extra flip) */
.dp-h[dir=rtl]{text-align:right}
.dp-p{margin:0 0 13px;color:var(--dp-ink0);font-size:15.5px;line-height:1.72;text-wrap:pretty}
.dp-p.dp-sub{color:var(--dp-ink1)}
.dp-sub{margin-inline-start:16px}
.dp-list{margin:0 0 15px;padding-inline-start:6px;font-size:15.5px;line-height:1.7;list-style:none}
.dp-list.dp-sub{margin-inline-start:20px}
.dp-list li{position:relative;padding-inline-start:22px;margin-bottom:8px;color:var(--dp-ink1)}
.dp-ul>li::before{content:"";position:absolute;inset-inline-start:4px;top:.6em;width:7px;height:7px;border-radius:50%;background:var(--dp-cyan);box-shadow:0 0 0 3px #dcf3f9}
.dp-ul.dp-sq>li::before{background:transparent;border:2px solid var(--dp-ind);width:8px;height:8px;box-shadow:none}
.dp-ol{counter-reset:dpol;list-style:none}
.dp-ol>li{counter-increment:dpol}
.dp-ol>li::before{content:counter(dpol);position:absolute;inset-inline-start:0;top:.05em;font-family:var(--dp-fm);font-size:11px;font-weight:600;color:var(--dp-navy);width:19px;height:19px;border-radius:6px;background:#e7eefe;display:grid;place-items:center}
.dp-callout{display:flex;align-items:flex-start;gap:10px;margin:6px 0 16px;padding:12px 15px;background:#dcf3f9;border:1px solid #bfe9f2;border-radius:12px;color:#08525f;font-size:14.5px;font-weight:600;line-height:1.55}
.dp-callout .lucide{width:18px;height:18px;color:var(--dp-cyan-deep);flex-shrink:0;margin-top:1px}
.dp-link{color:var(--dp-cyan-deep);font-weight:600;text-decoration:none;border-bottom:1.5px solid #9fdcea}
.dp-link:hover{color:var(--dp-navy);border-color:var(--dp-navy)}
.dp-toc{margin:6px 0 18px;border:1px solid var(--dp-line);border-radius:12px;background:linear-gradient(180deg,#fbfcff,#f6f8ff);overflow:hidden}
.dp-toc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px 8px 14px}
.dp-toc-h{display:flex;align-items:center;gap:7px;font-family:var(--dp-fh);font-weight:700;font-size:12px;color:var(--dp-navy)}
.dp-toc-h .lucide{width:14px;height:14px;color:var(--dp-cyan-deep)}
.dp-toc-ctrl{display:flex;align-items:center;gap:2px}
.dp-toc-caret{width:15px;height:15px;color:var(--dp-ink2);transition:transform .16s var(--dp-ease)}
.dp-toc-pin{appearance:none;border:none;background:transparent;cursor:pointer;width:24px;height:24px;border-radius:6px;display:grid;place-items:center;color:var(--dp-ink2);transition:all .13s var(--dp-ease)}
.dp-toc-pin .lucide,.dp-toc-pin .dp-pin-ico{width:14px;height:14px}
.dp-toc-pin .dp-pin-ico{stroke:url(#dpPinGrad)}
.dp-toc-pin:hover{background:#e7eefe;color:var(--dp-navy)}
.dp-toc-list{list-style:none;margin:0;padding:3px 6px 7px;display:block}
.dp-toc-i{display:flex;align-items:center;gap:9px;padding:5px 9px;border-radius:8px;text-decoration:none;color:var(--dp-ink0);transition:background .12s var(--dp-ease)}
.dp-toc-lvl3{margin-inline-start:14px}
.dp-toc-lvl4{margin-inline-start:28px}
.dp-toc-lvl5{margin-inline-start:42px}
.dp-toc-i:hover{background:#f2f5ff}
.dp-toc-n{min-width:18px;height:18px;padding:0 4px;flex-shrink:0;border-radius:5px;background:#e7eefe;color:var(--dp-navy);font-family:var(--dp-fm);font-size:9.5px;font-weight:600;display:grid;place-items:center;white-space:nowrap}
.dp-toc-t{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25;text-align:start}
.dp-toc-en{font-size:11px;font-weight:500;color:var(--dp-ink2);order:2}
.dp-toc-he{font-size:12.5px;font-weight:700;color:var(--dp-ink0);order:1}
.dp-toc-only{font-size:12.5px;font-weight:700;color:var(--dp-ink0)}
.dp-toc-i:hover .dp-toc-only{color:var(--dp-navy)}
.dp-toc-i:hover .dp-toc-he{color:var(--dp-navy)}
.dp-toc-i:hover .dp-toc-n{background:var(--dp-navy);color:#fff}
/* pinned: rides at the top of the scroll area; header-click drops the list even while pinned.
   Works for any pinnable block (TOC, Versions) — only one may be pinned at a time. */
.dp-toc.pinned,.dp-versions.pinned{position:sticky;top:56px;z-index:30;margin:0 0 12px;overflow:visible;box-shadow:0 6px 18px rgba(30,36,140,.14);border-color:var(--dp-cyan)}
.dp-toc.pinned .dp-toc-pin,.dp-versions.pinned .dp-toc-pin{color:#fff;background:var(--dp-navy)}
.dp-versions.pinned .dp-toc-pin .dp-pin-ico{stroke:#fff}
.dp-versions.pinned .dp-toc-pin .lucide,.dp-versions.pinned .dp-toc-pin .dp-pin-ico{transform:rotate(45deg)}
.dp-versions.pinned.open .dp-blk-body{display:block!important;position:absolute;left:0;right:0;top:100%;background:#fff;border:1px solid var(--dp-line);border-top:none;box-shadow:0 12px 26px rgba(30,36,140,.16);border-radius:0 0 12px 12px;max-height:60vh;overflow:auto}
.dp-toc.pinned .dp-toc-pin .dp-pin-ico{stroke:#fff}
.dp-toc.pinned .dp-toc-pin .lucide,.dp-toc.pinned .dp-toc-pin .dp-pin-ico{transform:rotate(45deg)}
.dp-toc.pinned.open .dp-blk-body{display:block!important;position:absolute;left:0;right:0;top:100%;background:#fff;border:1px solid var(--dp-line);border-top:none;box-shadow:0 12px 26px rgba(30,36,140,.16);border-radius:0 0 11px 11px;max-height:56vh;overflow:auto;z-index:5}
.dp-fig{margin:18px 0 22px}
.dp-fig-frame{position:relative;border:1px solid var(--dp-line);border-radius:14px;overflow:hidden;background:repeating-linear-gradient(45deg,#f4f6fd,#f4f6fd 10px,#eef1fb 10px,#eef1fb 20px);height:340px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.6),0 2px 10px rgba(30,36,140,.05)}
.dp-fig-frame image-slot{position:absolute;inset:0}
.dp-fig-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff}
.dp-fig-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--dp-ink2);font-size:13px}
.dp-fig-empty .lucide{width:30px;height:30px;opacity:.5}
.dp-zoom{position:absolute;inset-inline-start:10px;top:10px;z-index:3;appearance:none;cursor:pointer;width:32px;height:32px;border-radius:9px;border:1px solid var(--dp-line);background:rgba(255,255,255,.9);backdrop-filter:blur(6px);color:var(--dp-navy);display:grid;place-items:center;box-shadow:0 2px 8px rgba(30,36,140,.14);transition:all .14s var(--dp-ease)}
.dp-zoom .lucide{width:16px;height:16px}
.dp-zoom:hover{background:var(--dp-navy);color:#fff;border-color:var(--dp-navy)}
.dp-cap{margin-top:9px;font-size:12.5px;color:var(--dp-ink2);text-align:center;font-weight:500;display:flex;align-items:center;justify-content:center;gap:7px}
.dp-cap::before{content:"";width:16px;height:2px;border-radius:2px;background:var(--dp-cyan);opacity:.7}
.dp-links{margin-top:30px;padding-top:22px;border-top:1px solid var(--dp-line)}
.dp-links-h{display:flex;align-items:center;gap:8px;font-family:var(--dp-fh);font-weight:700;font-size:14px;color:var(--dp-navy);margin-bottom:13px}
.dp-links-h .lucide{width:16px;height:16px;color:var(--dp-cyan-deep)}
.dp-links-grid{display:grid;grid-template-columns:1fr;gap:9px}
.dp-related{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--dp-line);border-radius:12px;background:#fff;text-decoration:none;color:var(--dp-ink0);transition:all .16s var(--dp-ease)}
.dp-related:hover{border-color:#8fd6e6;background:#f4fbfd;transform:translateY(-1px);box-shadow:0 4px 12px rgba(30,36,140,.07)}
.dp-related-ic{width:34px;height:34px;border-radius:9px;flex-shrink:0;display:grid;place-items:center;background:#e7eefe;color:var(--dp-navy)}
.dp-related-ic .lucide{width:17px;height:17px}
.dp-related-t{flex:1;font-weight:600;font-size:14px}
.dp-related-go{width:16px;height:16px;color:var(--dp-ink2)}
.dp-related:hover .dp-related-go{color:var(--dp-cyan-deep)}
.dp-colophon{background:transparent;border-top:1px solid var(--dp-line);padding:18px 20px 6px;display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:14px;text-align:center}
.dp-colo-brand{display:flex;align-items:center;gap:10px;justify-content:center}
.dp-colo-logo{height:26px;width:auto}
.dp-colo-name{font-family:var(--dp-fh);font-weight:700;font-size:12.5px;color:var(--dp-navy)}
.dp-colo-links{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 16px}
.dp-fc{display:inline-flex;align-items:center;gap:6px;color:var(--dp-ink2);text-decoration:none;font-size:12px}
.dp-fc>span{white-space:nowrap}
.dp-fc .lucide{width:14px;height:14px;color:var(--dp-cyan-deep)}
.dp-fc-svg{width:14px;height:14px;color:var(--dp-cyan-deep);fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.dp-colophon .dp-fc .lucide,.dp-colophon .dp-fc-svg{stroke:url(#dpGrad)}
.dp-fc-lnk{cursor:pointer}
.dp-colophon a,.dp-colophon a:hover,.dp-colophon a:focus,.dp-colophon a:visited{color:var(--dp-ink2);text-decoration:none}
.dp-colo-div{width:1px;height:14px;background:var(--dp-line2)}
.dp-colo-legal{max-width:640px;margin:8px auto 0;font-size:10.5px;line-height:1.55;color:var(--dp-ink2);opacity:.8;text-align:center;border-top:1px solid var(--dp-line);padding-top:10px}
.dp-changeflash{position:relative}
.dp-changeflash::after{content:"";position:absolute;inset:-10px -14px;border-radius:12px;pointer-events:none;border:2px dashed var(--dp-cyan);background:rgba(68,184,211,.08);animation:dpflashbox 2.6s var(--dp-ease)}
@keyframes dpflashbox{0%{opacity:0}12%{opacity:1}70%{opacity:1}100%{opacity:0}}
.dp-tb{max-width:820px;margin:0 auto;padding:0 6px 60px}
.dp-tbhead{position:sticky;top:0;z-index:35;margin:0 -6px 12px;padding:9px 6px 8px;background:rgba(255,255,255,.94);backdrop-filter:blur(10px);border-bottom:1px solid var(--dp-line)}
.dp-title-sm{font-size:17px;line-height:1.15;margin-bottom:4px}
.dp-tbhead .dp-bc{margin-bottom:0;font-size:10.5px}
.dp-tb>.dp-classbar{margin-top:2px}
.dp-bc{display:flex;align-items:center;gap:7px;margin-bottom:20px;font-family:var(--dp-fm);font-size:11.5px;color:var(--dp-ink2);flex-wrap:wrap}
.dp-toc.pinned{top:56px}
.dp-bc-cur{color:var(--dp-navy);font-weight:600}
.dp-bc-lnk{color:var(--dp-ink2);text-decoration:none;transition:color .12s var(--dp-ease)}
.dp-bc-lnk:hover{color:var(--dp-cyan-deep);text-decoration:underline}
.dp-bc-sep{width:13px;height:13px;color:var(--dp-line2)}
.dp-runhead{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:16px;padding:12px 30px;background:rgba(255,255,255,.82);backdrop-filter:blur(12px);border-bottom:1px solid var(--dp-line);box-shadow:0 1px 3px rgba(30,36,140,.05)}
.dp-logo{height:30px;width:auto}
.dp-runhead-doc{display:flex;flex-direction:column;line-height:1.3;margin-inline-start:auto;text-align:start}
.dp-runhead-series{font-family:var(--dp-fm);font-size:10.5px;font-weight:600;color:var(--dp-cyan-deep)}
.dp-runhead-title{font-family:var(--dp-fh);font-weight:700;font-size:13px;color:var(--dp-navy)}
.dp-sheet{max-width:900px;margin:34px auto;background:#fff;border:1px solid var(--dp-line);border-radius:20px;box-shadow:0 12px 40px rgba(30,36,140,.12);padding:52px 60px}
.dp-webfoot{max-width:900px;margin:0 auto 50px;background:transparent;border:none}
.dp-lightbox{position:fixed;inset:0;z-index:2000;display:none;align-items:center;justify-content:center;flex-direction:column;gap:16px;background:rgba(14,18,38,.86);backdrop-filter:blur(6px);padding:5vh 5vw}
.dp-lightbox.open{display:flex;animation:dplb .18s var(--dp-ease)}
@keyframes dplb{from{opacity:0}to{opacity:1}}
.dp-lb-close{position:absolute;top:22px;inset-inline-end:22px;width:42px;height:42px;border-radius:12px;border:none;background:rgba(255,255,255,.14);color:#fff;cursor:pointer;display:grid;place-items:center}
.dp-lb-close .lucide{width:22px;height:22px}
.dp-lb-close:hover{background:rgba(255,255,255,.26)}
.dp-lb-inner{max-width:100%;max-height:78vh;display:flex;align-items:center;justify-content:center}
.dp-lb-img{max-width:100%;max-height:78vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.5);background:#fff}
.dp-lb-empty{display:none;flex-direction:column;align-items:center;gap:12px;color:rgba(255,255,255,.7);padding:60px 80px;border:2px dashed rgba(255,255,255,.28);border-radius:16px;font-size:14px}
.dp-lb-empty .lucide{width:40px;height:40px;opacity:.6}
.dp-lb-cap{color:#e6eaff;font-size:14px;font-weight:500;text-align:center;max-width:80vw;direction:rtl}
@media (max-width:760px){.dp-sheet{padding:34px 22px}.dp-title{font-size:30px}}
@media print{.dp-web .dp-runhead{position:fixed;top:0;left:0;right:0}.dp-web .dp-webfoot{position:fixed;bottom:0;left:0;right:0;margin:0;border-radius:0;border:none;border-top:1px solid var(--dp-line)}.dp-sheet{box-shadow:none;border:none;margin:70px auto;max-width:100%}.dp-fig{break-inside:avoid}}
`;

  DP.injectFonts = function (doc) {
    doc = doc || document;
    if (doc.getElementById('kc-dp-fonts')) return;
    const l = doc.createElement('link'); l.id = 'kc-dp-fonts'; l.rel = 'stylesheet'; l.href = DP.FONTS;
    doc.head.appendChild(l);
  };
  DP.injectCSS = function (doc) {
    doc = doc || document;
    if (!doc.getElementById('kc-dp-css')) {
      const s = doc.createElement('style'); s.id = 'kc-dp-css'; s.textContent = DP.CSS;
      doc.head.appendChild(s);
    }
    DP.injectFonts(doc);
  };

  /* preload the EasyBIM logo as a data URL so downloaded pages are self-contained */
  DP.loadLogo = function () {
    if (DP._logoP) return DP._logoP;
    DP._logoP = fetch((window.__resources && window.__resources.ebLogo) || 'assets/easybim_logo-w.png')
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(''); fr.readAsDataURL(b); }))
      .then(u => { DP._logo = u; return u; })
      .catch(() => '');
    return DP._logoP;
  };

  /* ---- the Project Startup document ---- */
  DP.data = {
    series: 'Revit Working Guide',
    title: 'Project Startup',
    code: 'DXXXX',
    ws: 'BIM Methodology & Tools',
    path: ['BIM Methodology & Tools', 'Revit', 'Project Startup'],
    created: { name: 'Maxim Naftaliyv', date: '30.09.2021' },
    updated: { name: 'Reut Hefetz', date: '26.03.2024' },
    versions: [
      { v: 1, date: '30.09.2021', who: 'Maxim Naftaliyv', anchor: 'sec-intro', change: 'Initial version of the guide' },
      { v: 2, date: '07.12.2023', who: 'Reut Hefetz', anchor: 'sec-3', change: 'Updated model-to-cloud upload flow (ACC/BIM360)' },
      { v: 3, date: '26.03.2024', who: 'Reut Hefetz', anchor: 'sec-6', change: 'Expanded Copy Monitor & Coordination Review' }
    ],
    toc: [
      { txt: 'מידע ראשוני נדרש', anchor: 'sec-1' },
      { txt: 'פתיחת פרויקט חדש', anchor: 'sec-2' },
      { txt: 'העלאת מודל לענן (ACC/BIM360 Collaborate)', anchor: 'sec-3' },
      { txt: 'Acquire Coordinates & Revit Link', anchor: 'sec-4' },
      { txt: 'Worksets', anchor: 'sec-5' },
      { txt: 'Copy Monitor', anchor: 'sec-6' },
      { txt: 'מבטי עבודה (Views)', anchor: 'sec-7' }
    ],
    /* links surfaced in the shareable view */
    links: [
      { label: 'מסמך BEP – BIM Execution Plan', kind: 'internal', to: 'BEP – BIM Execution Plan' },
      { label: 'מדריך Project Browser', kind: 'internal', to: 'Project Browser' },
      { label: 'קידוד מודלים וגליונות', kind: 'internal', to: 'קידוד מודלים וגליונות' }
    ],
    blocks: [
      /* ---------- הקדמה ---------- */
      { t: 'h', lvl: 2, num: '', anchor: 'sec-intro', txt: 'הקדמה' },
      { t: 'p', txt: 'מטרת מסמך זה היא פירוט התהליכים והפעולות הנדרשות לפתיחת פרויקט חדש ב-Revit.' },
      { t: 'ul', items: [
        'יש להשתמש בקובץ הטמפלייט המשרדי / הטמפלייט הפרויקטלי ע"פ הנחיות הפרויקט.',
        'בתחילת הפרויקט יש לבקש גישה ממנהל ה-BIM / גורם אחראי עבור כל המשתמשים שיעבדו בפרויקט (ב-Revit ובענן ACC/BIM360).'
      ] },

      { t: 'h', lvl: 2, num: '', anchor: 'sec-flow', txt: 'אופן פעולה' },

      /* ---------- 1 ---------- */
      { t: 'h', lvl: 3, num: '1', anchor: 'sec-1', txt: 'מידע ראשוני נדרש' },
      { t: 'p', txt: 'לפני שפותחים את הפרויקט ב-Revit, יש לבדוק מס\' נושאים חשובים:' },
      { t: 'h', lvl: 4, num: '1.1', txt: 'מי אחראי על ניהול המודלים בענן? (מנהל BIM / אדריכלות).' },
      { t: 'h', lvl: 4, num: '1.2', txt: 'האם קיבלנו גישה לפרויקט בענן ACC/BIM360?' },
      { t: 'p', sub: true, txt: 'היוזר/מייל שאותו מצרפים לפרויקט חייב להיות זהה לזה שבו משתמשים ב-Revit ובענן.' },
      { t: 'h', lvl: 4, num: '1.3', txt: 'האם האחראי פרסם הנחיות לשימוש במודלים? (BEP – BIM Execution Plan).' },
      { t: 'p', sub: true, txt: 'במידה וכן, יש לקרוא את ההנחיות ב-BEP (תכנית למימוש BIM). במידה ולא, יש ליצור קשר עם האחראי בנוגע לפרטים הבאים:' },
      { t: 'ul', sub: true, items: [
        'האם עליי לפתוח את הפרויקט החדש בעצמי?',
        'מה גרסת ה-Revit?',
        'האם הפרויקט בענן ACC/BIM360 או בתוכנת שיתוף קבצים?',
        'האם הפרויקט בקורדינאטות? במידה וכן, מאיזה מודל מושכים קורדינאטות?',
        'לאיזה מודל מבצעים Copy Monitor?',
        'במידה ומדובר במס\' מבנים – האם נדרש לפתוח מודל אחד או מס\' מודלים?',
        'האם יש הנחיה להגדרת שם המודל? (קידוד מודלים).',
        'האם יש הנחיה להגדרת שמות הגליונות? (קידוד גליונות).'
      ] },
      { t: 'h', lvl: 4, num: '1.4', txt: 'פתיחת הפרויקט' },
      { t: 'p', sub: true, txt: 'לאחר קבלת מענה על השאלות לעיל – ניתן לפתוח פרויקט חדש בעזרת הטמפלייט המשרדי / טמפלייט פרויקטלי, להעלות את המודל לענן ולבצע את הפעולות הראשוניות לפני תחילת המידול.' },

      /* ---------- 2 ---------- */
      { t: 'h', lvl: 3, num: '2', anchor: 'sec-2', txt: 'פתיחת פרויקט חדש' },
      { t: 'p', txt: 'יש לפתוח פרויקט חדש בגרסת Revit הנדרשת, על בסיס הטמפלייט המשרדי / טמפלייט פרויקטלי:' },
      { t: 'fig', id: 'f-2-1', cap: 'פתיחת פרויקט חדש מטמפלייט משרדי / פרויקטלי.' },

      /* ---------- 3 ---------- */
      { t: 'h', lvl: 3, num: '3', anchor: 'sec-3', txt: 'העלאת מודל לענן (ACC/BIM360 Collaborate)' },
      { t: 'h', lvl: 4, num: '3.1', txt: 'שמירת המודל' },
      { t: 'p', sub: true, txt: 'יש לעבור למבט אקראי במודל, למשל מבט רצפה (לא ניתן לבצע שמירה במסך הפתיחה). לאחר מכן, יש לשמור את המודל במחשב ע"פ הקידוד הנדרש למודלים:' },
      { t: 'fig', id: 'f-3-1', cap: 'שמירת המודל במחשב לפי קידוד המודלים.' },
      { t: 'h', lvl: 4, num: '3.2', txt: 'העלאה לענן' },
      { t: 'p', sub: true, txt: 'בהנחה שהמודל בענן ACC/BIM360 – כעת מעלים את הפרויקט לענן:' },
      { t: 'fig', id: 'f-3-2', cap: 'העלאת הפרויקט לענן ACC/BIM360.' },
      { t: 'p', sub: true, txt: 'כעת יש לאתר את הפרויקט שברשימה (שלב 1) ע"פ שם המשרד שמנהל את הפרויקט בענן. לאחר מכן, יש לאתר את התיקייה המיועדת למודל ה-Revit שלנו:' },
      { t: 'ul', sub: true, items: [
        'במידה ולא ניתן לאתר את התיקיה המיועדת לדיספלינה שלנו, יש לפנות למנהל ה-BIM / גורם אחראי ולבקש לפתוח תיקיה ייעודית (וקבלת ההרשאות הנדרשות).'
      ] },
      { t: 'fig', id: 'f-3-3', cap: 'איתור התיקייה המיועדת בענן.' },
      { t: 'p', sub: true, txt: 'בסיום התהליך, יש לבצע סנכרון:' },
      { t: 'fig', id: 'f-3-4', cap: 'ביצוע סנכרון (Sync to Central).' },

      /* ---------- 4 ---------- */
      { t: 'h', lvl: 3, num: '4', anchor: 'sec-4', txt: 'Acquire Coordinates & Revit Link' },
      { t: 'p', txt: 'בהנחה שהמודל בקורדינאטות – על מנת שהפרויקט יהיה בקורדינאטות עולמיות ושהמודל יהיה תואם במיקום ליתר המודלים, יש לבצע פקודת Acquire Coordinates (רכישת קורדינאטות). מנהל ה-BIM / גורם אחראי יגדיר מאיזה מודל יש לבצע פקודה זו (מודל URS או אדריכלות).' },
      { t: 'h', lvl: 4, num: '4.1', txt: 'הוספת מודל URS / אדריכלות (Revit Link)' },
      { t: 'ul', sub: true, items: [
        'יש להקפיד להכניס את הלינק ב-Internal Origin To Internal Origin.'
      ] },
      { t: 'fig', id: 'f-4-1', cap: 'הכנסת לינק URS / אדריכלות (Internal Origin To Internal Origin).' },
      { t: 'h', lvl: 4, num: '4.2', txt: 'Acquire Coordinates' },
      { t: 'p', sub: true, txt: 'תחילה יש להגדיר מבט עבודה שבו רואים את מודל ה-URS / אדריכלות בלבד. לאחר מכן, יש לבצע פקודת Acquire Coordinates (רכישת קורדינאטות):' },
      { t: 'fig', id: 'f-4-2', cap: 'ביצוע פקודת Acquire Coordinates.' },
      { t: 'callout', txt: 'כעת המודל שלנו בקורדינאטות (ישראל נמצאת ב-100–300 אלף / 400–800 אלף).' },
      { t: 'p', sub: true, txt: 'בסיום, יש לבצע בדיקה שכלל הפרמטרים (Elev, angle וכו\') הנוגעים לקורדינאטות זהים לזה שבלינק URS / אדריכלות. יש לעשות זאת ע"י הדלקת ה-Site ב-Visibility Graphics והשוואה בין המודל והלינק:' },
      { t: 'fig', id: 'f-4-3', cap: 'בדיקת פרמטרים ב-Visibility Graphics.' },
      { t: 'p', sub: true, txt: 'לסיום, יש לבצע בדיקה שה-Project Base Point שבמודל זהה לזה שבלינק.' },
      { t: 'fig', id: 'f-4-4', cap: 'בדיקת Project Base Point.' },
      { t: 'h', lvl: 4, num: '4.2.1', txt: 'טעינת לינקים נוספים' },
      { t: 'p', sub: true, txt: 'בשלב זה יש לטעון את כל יתר הלינקים בפרויקט:' },
      { t: 'ul', sub: true, sq: true, items: [
        'יש להקפיד להכניס את הלינקים ב-By Shared Coordinates.'
      ] },

      /* ---------- 5 ---------- */
      { t: 'h', lvl: 3, num: '5', anchor: 'sec-5', txt: 'Worksets' },
      { t: 'h', lvl: 4, num: '5.1', txt: 'יצירת Worksets' },
      { t: 'p', sub: true, txt: 'יש ליצור Workset עבור כל לינק וכל מערכת. למשל, לחשמל נכין: Power, Grounding, Cable Trays, Lighting & Fire Alarm. שמות וכמות ה-Worksets יוגדרו במסמך ה-BEP ע"י מנהל ה-BIM / גורם אחראי.' },
      { t: 'p', sub: true, txt: 'כעת יש לסנכרן את המודל. לאחר מכן, יש להגדיר את ה-Worksets באופן הבא:' },
      { t: 'fig', id: 'f-5-1', cap: 'הגדרת Worksets בפרויקט.' },

      /* ---------- 6 ---------- */
      { t: 'h', lvl: 3, num: '6', anchor: 'sec-6', txt: 'Copy Monitor' },
      { t: 'p', txt: 'פקודה זו מאפשרת העתקת אלמנטים מלינק וניטור האלמנטים במידה ומתבצעים שינויים. כלומר, במידה והאלמנט בלינק זז / השתנה / נמחק נקבל על כך התראה (Coordination Review). באמצעות כך, ניתן לשנות את האלמנטים שבמודל שלנו בהתאמה.' },
      { t: 'p', txt: 'Levels & Grids הם ה"שלד" של המודל. יש לבצע Copy Monitor ל-Levels (מפלסים) ו-Grids (צירים) שבלינק ה-URS / אדריכלות.' },
      { t: 'ul', items: [
        'אין ליצור מפלסים וצירים באופן עצמאי, יש להיות מתואמים עם לינק ה-URS / אדריכלות לכל אורך חיי הפרויקט.',
        'במסמך ה-BEP יוגדר לאיזה מודל יש לבצע את פקודת ה-Copy Monitor (ע"י מנהל ה-BIM / גורם אחראי).',
        'אין ליצור, למחוק, לשנות שם, מיקום, סוג וכו\' של Levels / Grids.',
        'בסיום פקודת Copy Monitor, יש להסיר את המפלס הקיים במודל כברירת מחדל וכל האלמנטים המשוייכים אליו.'
      ] },
      { t: 'h', lvl: 4, num: '6.1', txt: 'Levels – Copy Monitor' },
      { t: 'p', sub: true, txt: 'יש ליצור מבט ייעודי ב-3D של הלינק שבו יראו את הלינק שאליו נבצע Copy Monitor למפלסים (Levels). לאחר מכן יש לפעול באופן הבא:' },
      { t: 'fig', id: 'f-6-1', cap: 'יצירת מבט 3D וביצוע Copy Monitor למפלסים.' },
      { t: 'p', sub: true, txt: 'בשלב האחרון יש לסמן את כל האלמנטים בלינק ולבודד את המפלסים:' },
      { t: 'fig', id: 'f-6-2', cap: 'בידוד המפלסים לפני ההעתקה.' },
      { t: 'callout', txt: 'כעת המפלסים ב-Copy Monitor הועתקו ומנוטרים.' },
      { t: 'p', sub: true, txt: 'בשלב זה יש להסיר את המפלס המיותר שקיים במודל כברירת מחדל וכל האלמנטים המשוייכים אליו. חשוב לשים לב למחוק את ה-Level (ולא את ה-Floor).' },
      { t: 'h', lvl: 4, num: '6.2', txt: 'Grids – Copy Monitor' },
      { t: 'p', sub: true, txt: 'יש ליצור מבט ייעודי ב-2D של הלינק שבו יראו את הלינק שאליו נבצע Copy Monitor לצירים (Grids). לאחר מכן יש לפעול באופן הבא:' },
      { t: 'fig', id: 'f-6-3', cap: 'יצירת מבט 2D וביצוע Copy Monitor לצירים.' },
      { t: 'p', sub: true, txt: 'בשלב האחרון יש לסמן את כל האלמנטים בלינק ולבודד את הצירים.' },
      { t: 'callout', txt: 'כעת הצירים ב-Copy Monitor הועתקו ומנוטרים.' },
      { t: 'h', lvl: 4, num: '6.3', txt: 'Coordination Review' },
      { t: 'p', sub: true, txt: 'כאשר בוצע שינוי באלמנט שבלינק – נקבל התראה שנדרש להזיז גם את האלמנט שבמודל שלנו. התראה זו נקראת Coordination Review. במידה ומתקבלת התראה, יש להקפיד לבצע פעולה זו כדי להיות מתואמים עם כלל היועצים.' },
      { t: 'h', lvl: 5, num: '6.3.1', txt: 'בחירת הלינק שבוצע לו Copy Monitor:' },
      { t: 'fig', id: 'f-6-4', cap: 'בחירת הלינק לביצוע Coordination Review.' },
      { t: 'h', lvl: 5, num: '6.3.2', txt: 'עדכון האלמנטים שב-Copy Monitor:' },
      { t: 'p', sub: true, txt: 'בשלב זה יופיעו ה-Levels / Grids שבוצע בהם שינוי (אלמנט נמחק / זז / שם האלמנט השתנה). יש לבחור באופציה המחמירה ביותר, במקרה זה Move Level:' },
      { t: 'fig', id: 'f-6-5', cap: 'בחירת האופציה Move Level ב-Coordination Review.' },
      { t: 'p', sub: true, txt: 'יש לבצע שינויים עבור כל אלמנט בנפרד.' },
      { t: 'callout', txt: 'כעת ה-Levels / Grids שבמודל מתואמים עם הלינק וניתן להמשיך לעבוד.' },

      /* ---------- 7 ---------- */
      { t: 'h', lvl: 3, num: '7', anchor: 'sec-7', txt: 'מבטי עבודה (Views)' },
      { t: 'h', lvl: 4, num: '7.1', txt: 'הכנת מבטים (Views)' },
      { t: 'p', sub: true, txt: 'כל אלמנט ב-Revit ממודל ומשוייך ביחס למפלס (Level), לכן חשוב להקפיד למדל אלמנטים ביחס למפלס הרלוונטי. דבר זה תקף גם למבטי עבודה. על מנת להכין מבטי עבודה (רצפה / תקרה וכו\') יש לפעול באופן הבא:' },
      { t: 'fig', id: 'f-7-1', cap: 'הכנת מבטי עבודה (רצפה / תקרה).' },
      { t: 'p', sub: true, txt: 'כעת יש לבחור את המבטים הנדרשים:' },
      { t: 'ul', sub: true, items: [
        'ניתן לסמן את כל המבטים / חלק מהם בעזרת Ctrl+A / Ctrl+Shift.'
      ] },
      { t: 'h', lvl: 4, num: '7.2', txt: 'הגדרת מבטים (Views)' },
      { t: 'p', sub: true, txt: 'יש להקפיד על הסדר והארגון לצורך עבודה יעילה ואפקטיבית. בין היתר – ניתן לעשות זאת בעזרת ה-Project Browser. דבר זה משמש לארגון המבטים (Views), גליונות (Sheets), משפחות (Families), לינקים (Revit Links) וכו\' ע"פ היררכיה שניתן להגדירה.' },
      { t: 'p', sub: true, txt: 'נדרש לסווג כל מבט / גליון / רשימות וכו\' ע"פ הסטנדרט המשרדי ו/או דרישות הפרויקט. כך למשל, ניתן לסווג ע"פ שלביות הפרויקט, סוג המערכת, קנ"מ וכו\':' },
      { t: 'fig', id: 'f-7-2', cap: 'סיווג מבטים וגליונות ב-Project Browser.' },
      { t: 'p', sub: true, link: 'Project Browser', txt: 'להסבר נוסף ראה מסמך הדרכה בנושא Project Browser.' }
    ]
  };

  /* ---- helpers ---- */
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* wrap Latin technical runs in a mono chip so they read cleanly inside RTL.
     Split on raw text first, then escape each piece — so HTML entities are
     never sliced by an inserted tag. */
  const TECH = /[A-Za-z][A-Za-z0-9]*(?:[ &/.+\-][A-Za-z0-9]+)*/g;
  function tech(s) {
    s = String(s); let out = '', last = 0, m; TECH.lastIndex = 0;
    while ((m = TECH.exec(s))) {
      out += esc(s.slice(last, m.index));
      out += '<span class="dp-tech" dir="ltr">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    return out + esc(s.slice(last));
  }

  /* overall document direction, decided once from the TOC (falls back to the
     first few blocks for documents with no TOC) — same Hebrew-detection regex
     used everywhere else in this file, so headings/TOC/paragraphs/root all agree. */
  DP.docDir = function (d) {
    const sample = (d.toc && d.toc.length ? d.toc.map(t => t.txt) : (d.blocks || []).slice(0, 8).map(b => b.txt || '')).join(' ');
    return /[֐-׿]/.test(sample) ? 'rtl' : 'ltr';
  };

  function initials(name) {
    const p = String(name || '').trim().split(/\s+/);
    return ((p[0] || '')[0] || '') + ((p[1] || '')[0] || '');
  }

  DP.person = function (label, p) {
    return '<span class="dp-person">' +
      '<span class="dp-ava">' + esc(initials(p.name)) + '</span>' +
      '<span class="dp-person-t"><span class="dp-person-l">' + esc(label) + '</span>' +
      '<span class="dp-person-n">' + esc(p.name) + ' · ' + esc(p.date) + '</span></span></span>';
  };

  /* ---- clickable breadcrumb path (each crumb reveals its node in the Plan tree) ---- */
  DP.bcHTML = function (d) {
    return '<div class="dp-bc" dir="ltr">' +
      d.path.map((p, i) => {
        const last = i === d.path.length - 1;
        return last
          ? '<span class="dp-bc-i dp-bc-cur">' + esc(p) + '</span>'
          : '<a class="dp-bc-i dp-bc-lnk" href="#" onclick="return KC.DocPage.navPath(' + i + ')">' + esc(p) + '</a>';
      }).join('<i data-lucide="chevron-right" class="dp-bc-sep"></i>') +
      '</div>';
  };
  DP.navPath = function (i) {
    const name = DP.data.path[i];
    if (window.KC && KC.goTo) {
      const tree = document.querySelector('.workspace.active .tree') || document.querySelector('.tree');
      if (tree) KC.goTo(tree.id, name);
    } else if (window.KC && KC.toast) { KC.toast('Open: ' + name); }
    return false;
  };

  /* ---- masthead: slim classification strip under the path + a compact title ---- */
  DP.classbarHTML = function (d) {
    return '<div class="dp-classbar"><i data-lucide="book-marked"></i>' +
      '<span class="dp-series-lbl">' + tech(d.series) + '</span>' +
      '<span class="dp-class-sep">·</span>' +
      '<span class="dp-code" title="Document code">' + esc(d.code) + '</span></div>';
  };
  DP.mastheadHTML = function (d) {
    return '<div class="dp-masthead">' +
      DP.classbarHTML(d) +
      '<h1 class="dp-title" dir="ltr">' + esc(d.title) + '</h1>' +
      '</div>';
  };
  /* sticky document header used in the Textbook column: title always in view + a small clickable path */
  DP.stickyHeadHTML = function (d) {
    return '<div class="dp-tbhead">' +
      '<h1 class="dp-title dp-title-sm" dir="ltr">' + esc(d.title) + '</h1>' +
      DP.bcHTML(d) +
      '</div>';
  };

  /* ---- table of contents (single-column, dual-language, collapsible, pinnable) ---- */
  DP.tocHTML = function (d) {
    if (!d.toc || !d.toc.length) return '';
    const items = d.toc.map((it, i) => {
      const heb = /[\u0590-\u05FF]/.test(it.txt);
      const en = DP.EN[it.txt];
      let label;
      if (heb) {
        // Hebrew (black, top) + English translation (gray, below)
        label = '<span class="dp-toc-he" dir="rtl">' + tech(it.txt) + '</span>' +
          (en ? '<span class="dp-toc-en">' + esc(en) + '</span>' : '');
      } else {
        // English-only entry → gray
        label = '<span class="dp-toc-only" dir="ltr">' + tech(it.txt) + '</span>';
      }
      const lvlClass = it.lvl >= 3 ? ' dp-toc-lvl' + it.lvl : '';
      return '<li><a class="dp-toc-i' + lvlClass + '" dir="' + (heb ? 'rtl' : 'ltr') + '" href="#' + esc(it.anchor) + '" onclick="return KC.DocPage.goToSection(\'' + esc(it.anchor) + '\')">' +
      '<span class="dp-toc-n">' + esc(it.num || String(i + 1)) + '</span>' +
      '<span class="dp-toc-t">' + label + '</span></a></li>';
    }).join('');
    return '<nav class="dp-blk dp-toc" id="dpToc">' +
      '<div class="dp-blk-head" onclick="KC.DocPage.tocToggle(event)">' +
      '<span class="dp-blk-h"><i data-lucide="list-tree"></i><span>Table of contents</span></span>' +
      '<span class="dp-blk-ctrl">' +
      '<button class="dp-toc-pin" title="Pin to top" onclick="KC.DocPage.togglePin(event)"><svg class="dp-pin-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><defs><linearGradient id="dpPinGrad" gradientUnits="userSpaceOnUse" x1="4" y1="4" x2="20" y2="20"><stop offset="0" stop-color="#1e248c"/><stop offset="1" stop-color="#44b8d3"/></linearGradient></defs><path d="M7 4h10"/><path d="M9.5 4v5l-2 3h9l-2-3V4"/><path d="M12 12v8"/></svg></button>' +
      '<i data-lucide="chevron-down" class="dp-blk-caret"></i>' +
      '</span></div>' +
      '<div class="dp-blk-body"><ol class="dp-toc-list">' + items + '</ol></div></nav>';
  };

  /* ---- versions log (seed rows in DP.data + approved-edit rows persisted in localStorage) ---- */
  DP.LOG_KEY = 'kc_docpage_versions';
  DP.loadLog = function () { return KC.API.getVersionLog(); };
  DP.saveLog = function (a) { KC.API.saveVersionLog(a); };
  DP.allVersions = function (d) { return (d.versions || []).concat(DP.loadLog()); };
  DP.fmtToday = function () {
    const t = new Date(), p = n => (n < 10 ? '0' : '') + n;
    return p(t.getDate()) + '.' + p(t.getMonth() + 1) + '.' + t.getFullYear();
  };
  /* Append a change to the log when the team lead approves an edit/add. */
  DP.logVersion = function (o) {
    o = o || {};
    const d = DP.data, all = DP.allVersions(d);
    const maxV = all.reduce((m, v) => Math.max(m, +v.v || 0), 0);
    const log = DP.loadLog();
    log.push({ v: maxV + 1, date: o.date || DP.fmtToday(), who: o.who || 'Unknown', change: o.change || 'Change applied', anchor: o.anchor || '' });
    DP.saveLog(log);
    DP.renderVersions();
  };
  /* Re-render the versions table in place (keeps collapsed/open state). */
  DP.renderVersions = function () {
    const cur = document.getElementById('dpVers'); if (!cur) return;
    const collapsed = cur.classList.contains('collapsed');
    const pinned = cur.classList.contains('pinned'), open = cur.classList.contains('open');
    const wrap = document.createElement('div');
    wrap.innerHTML = DP.versionsHTML(DP.data, true);
    const next = wrap.firstChild;
    if (!collapsed) next.classList.remove('collapsed');
    if (pinned) { next.classList.add('pinned'); next.classList.toggle('open', open); const b = next.querySelector('.dp-toc-pin'); if (b) b.title = 'Unpin'; }    cur.replaceWith(next);
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    DP.relayoutPins();
  };

  /* ---- versions log (card list, echoing the suggestion/review cards) ---- */
  DP.versionsHTML = function (d, interactive) {
    const list = DP.allVersions(d);
    const init = n => (KC.initialsOf ? KC.initialsOf(n) : (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
    let items = list.map((v, i) => {
      const clickable = interactive && v.anchor;
      const chip = i === 0 ? '<span class="dp-vbadge">Created</span>' : '<span class="dp-vchip">v' + esc(v.v) + '</span>';
      return '<div class="dp-vitem' + (i === 0 ? ' dp-vcreate' : '') + (clickable ? ' clickable' : '') + '"' +
        (clickable ? ' data-anchor="' + esc(v.anchor) + '" onclick="KC.DocPage.jumpToChange(\'' + esc(v.anchor) + '\')" title="Jump to this change"' : '') + '>' +
        '<div class="dp-vmain">' +
          '<div class="dp-vhead"><span class="dp-vwho2">' + esc(v.who) + '</span><span class="dp-vmeta">' + chip + '<span class="dp-vdate2">' + esc(v.date) + '</span></span></div>' +
          '<div class="dp-vchg2"><span>' + tech(v.change) + '</span>' + (clickable ? '<i data-lucide="corner-down-right" class="dp-vgo"></i>' : '') + '</div>' +
        '</div></div>';
    }).join('');
    return '<section class="dp-blk dp-versions' + (interactive ? ' collapsed' : '') + '" id="dpVers">' +
      '<div class="dp-blk-head" onclick="KC.DocPage.versToggle(event)">' +
      '<span class="dp-blk-h"><i data-lucide="history"></i><span>Versions</span>' +
      '<span class="dp-blk-count">' + list.length + '</span></span>' +
      '<span class="dp-blk-ctrl">' +
      (interactive ? '<button class="dp-toc-pin" title="Pin to top" onclick="KC.DocPage.togglePin(event)"><svg class="dp-pin-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10"></path><path d="M9.5 4v5l-2 3h9l-2-3V4"></path><path d="M12 12v8"></path></svg></button>' : '') +
      '<i data-lucide="chevron-down" class="dp-blk-caret"></i>' +
      '</span></div>' +
      '<div class="dp-blk-body"><div class="dp-vlog">' + items + '</div></div></section>';
  };

  /* ---- body blocks ----
     Render ONLY normalized blocks (see kc-blocks.js / Block Contract.md): whatever
     fails the contract is either degraded to a paragraph or dropped. */
  DP.check = function (d) {
    const src = (d || DP.data).blocks;
    const chk = (KC.Blocks && KC.Blocks.normalize) ? KC.Blocks.normalize(src) : { blocks: src || [], issues: [], fatal: !src };
    DP.lastCheck = chk;
    return chk;
  };
  DP.blocksHTML = function (d, opts) {
    opts = opts || {};
    let out = '';
    DP.check(d).blocks.forEach(b => {
      if (b.t === 'h') {
        const anc = b.anchor ? ' id="' + esc(b.anchor) + '"' : '';
        const heb = /[\u0590-\u05FF]/.test(b.txt);
        const numHTML = b.num ? '<span class="dp-hnum" dir="ltr">' + esc(b.num) + '.</span> ' : '';
        out += '<h' + b.lvl + anc + ' class="dp-h dp-h' + b.lvl + '" dir="rtl">' +
          numHTML + '<span class="dp-htx" dir="' + (heb ? 'rtl' : 'ltr') + '">' + tech(b.txt) + '</span></h' + b.lvl + '>';
      } else if (b.t === 'p') {
        let inner = tech(b.txt);
        if (b.link) inner = inner.replace(/<span class="dp-tech" dir="ltr">Project Browser<\/span>/,
          '<a class="dp-link" href="#" onclick="return KC.DocPage.openLink(\'' + esc(b.link) + '\')">Project Browser</a>');
        const pDir = /[֐-׿]/.test(b.txt) ? 'rtl' : 'ltr';
        out += '<p dir="' + pDir + '" class="dp-p' + (b.sub ? ' dp-sub' : '') + '">' + inner + '</p>';
      } else if (b.t === 'ul' || b.t === 'ol') {
        const tag = b.t;
        out += '<' + tag + ' class="dp-list dp-' + tag + (b.sub ? ' dp-sub' : '') + (b.sq ? ' dp-sq' : '') + '">' +
          b.items.map(it => '<li dir="' + (/[֐-׿]/.test(it) ? 'rtl' : 'ltr') + '">' + tech(it) + '</li>').join('') + '</' + tag + '>';
      } else if (b.t === 'callout') {
        const cDir = /[֐-׿]/.test(b.txt) ? 'rtl' : 'ltr';
        out += '<div class="dp-callout"><i data-lucide="check-circle-2"></i><span dir="' + cDir + '">' + tech(b.txt) + '</span></div>';
      } else if (b.t === 'fig') {
        out += DP.figureHTML(b, opts);
      }
    });
    return out;
  };

  DP.figSrc = function (id) { return (window.__resources && window.__resources['fig-' + id]) || ('assets/docpage/' + id + '.png'); };
  DP.slotSrc = function (id) {
    try { const s = document.getElementById(id); const im = s && s.shadowRoot && s.shadowRoot.querySelector('.frame img'); return im ? (im.getAttribute('src') || '') : ''; }
    catch (e) { return ''; }
  };

  DP.figureHTML = function (b, opts) {
    opts = opts || {};
    let inner;
    if (opts.static) {
      const src = (DP._fig && DP._fig[b.id]) || DP.slotSrc(b.id) || DP.figSrc(b.id);
      inner = src
        ? '<img class="dp-fig-img" src="' + esc(src) + '" alt="">'
        : '<div class="dp-fig-empty"><i data-lucide="image"></i><span dir="' + (/[֐-׿]/.test(b.cap) ? 'rtl' : 'ltr') + '">' + esc(b.cap) + '</span></div>';
    } else {
      inner = '<image-slot id="' + esc(b.id) + '" shape="rect" fit="contain" src="' + DP.figSrc(b.id) + '" placeholder="Drop a screenshot"></image-slot>' +
        '<button class="dp-zoom" title="Zoom" onclick="KC.DocPage.zoom(\'' + esc(b.id) + '\')"><i data-lucide="maximize-2"></i></button>';
    }
    return '<figure class="dp-fig" data-fig="' + esc(b.id) + '">' +
      '<div class="dp-fig-frame">' + inner + '</div>' +
      '<figcaption class="dp-cap" dir="' + (/[֐-׿]/.test(b.cap) ? 'rtl' : 'ltr') + '">' + tech(b.cap) + '</figcaption>' +
      '</figure>';
  };

  /* preload figure images as data URLs so the downloaded page is self-contained */
  DP.loadFigures = function () {
    if (DP._figP) return DP._figP;
    DP._fig = {};
    const ids = DP.data.blocks.filter(b => b.t === 'fig').map(b => b.id);
    DP._figP = Promise.all(ids.map(id =>
      fetch(DP.figSrc(id)).then(r => r.ok ? r.blob() : Promise.reject())
        .then(bl => new Promise(res => { const fr = new FileReader(); fr.onload = () => { DP._fig[id] = fr.result; res(); }; fr.onerror = () => res(); fr.readAsDataURL(bl); }))
        .catch(() => {})
    ));
    return DP._figP;
  };

  DP.colophonHTML = function () {
    const c = DP.company;
    const addr = String(c.addr).replace(/^רחוב\s*/, '');
    const GRAD = '<svg width="0" height="0" class="dp-grad-def" aria-hidden="true" style="position:absolute"><defs><linearGradient id="dpGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e248c"/><stop offset="1" stop-color="#44b8d3"/></linearGradient></defs></svg>';
    const BRAND = {
      linkedin: '<svg class="dp-fc-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>',
      facebook: '<svg class="dp-fc-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>'
    };
    const item = (icon, txt, href, dir) =>
      (href ? '<a class="dp-fc dp-fc-lnk" href="' + href + '" target="_blank" rel="noopener">' : '<span class="dp-fc">') +
      (BRAND[icon] || '<i data-lucide="' + icon + '"></i>') + '<span' + (dir ? ' dir="' + dir + '"' : '') + '>' + esc(txt) + '</span>' +
      (href ? '</a>' : '</span>');
    return '<div class="dp-colophon">' + GRAD +
      '<div class="dp-colo-brand">' +
      '<span class="dp-colo-name">EasyBIM · Innovative Engineering</span></div>' +
      '<div class="dp-colo-links">' +
      item('phone', c.phone, null, 'ltr') +
      item('map-pin', addr, null, 'rtl') +
      item('mail', c.mail, null, 'ltr') +
      item('globe', c.site, 'https://' + c.site, 'ltr') +
      item('linkedin', 'LinkedIn', 'https://www.linkedin.com/company/easybim') +
      item('facebook', 'Facebook', 'https://www.facebook.com/EasyBIM') +
      '</div>' +
      '<p class="dp-colo-legal">\u00A9 All rights reserved to EasyBIM Technological Engineering Ltd. This file, in whole or in part, may not be copied, distributed, quoted, publicly displayed, or translated in any form (electronic or otherwise) to any party outside the company, nor may its contents be used, without prior written authorization.</p>' +
      '</div>';
  };

  DP.linksHTML = function (d) {
    if (!d.links || !d.links.length) return '';
    const items = d.links.map(l =>
      '<a class="dp-related" href="#" onclick="return KC.DocPage.openLink(\'' + esc(l.to) + '\')">' +
      '<span class="dp-related-ic"><i data-lucide="' + (l.kind === 'internal' ? 'file-text' : 'external-link') + '"></i></span>' +
      '<span class="dp-related-t" dir="' + (/[֐-׿]/.test(l.label) ? 'rtl' : 'ltr') + '">' + tech(l.label) + '</span>' +
      '<i data-lucide="chevron-right" class="dp-related-go"></i></a>'
    ).join('');
    return '<section class="dp-links"><div class="dp-links-h"><i data-lucide="link"></i><span>Related documents</span></div>' +
      '<div class="dp-links-grid">' + items + '</div></section>';
  };

  /* "Digested with issues" strip — team lead only. */
  DP.issuesHTML = function (chk) {
    if (!chk || !chk.issues.length) return '';
    if ((KC.role || '') !== 'teamlead') return '';
    const li = chk.issues.map(x => '<li>' + esc(KC.Blocks.describe(x)) + '</li>').join('');
    return '<div class="dp-issues" onclick="this.classList.toggle(&quot;open&quot;)">' +
      '<div class="dp-issues-h"><i data-lucide="alert-triangle"></i>' +
      '<span>Document digested with issues</span>' +
      '<span class="dp-issues-n">' + chk.issues.length + '</span></div><ul>' + li + '</ul></div>';
  };
  /* Unreadable document — a clear screen instead of a blank page. */
  DP.errorHTML = function (sourceUrl) {
    return '<div class="dp-docerr"><i data-lucide="file-x"></i>' +
      '<div class="dp-docerr-t">This document could not be displayed</div>' +
      '<div class="dp-docerr-s">The content arrived in an unexpected shape. Please tell the Knowledge Center owner.</div>' +
      (sourceUrl ? '<a class="dp-link" href="' + esc(sourceUrl) + '" target="_blank" rel="noopener">Open the original</a>' : '') +
      '</div>';
  };

  /* ---- mount ---- */
  DP.mount = function (root, opts) {
    opts = opts || {};
    DP.injectCSS(root.ownerDocument || document);
    const d = DP.data;
    const docDir = DP.docDir(d);
    const mode = opts.mode || 'textbook';
    const bopts = { static: !!opts.static };
    const chk = DP.check(d);
    const bodyHTML = chk.fatal ? DP.errorHTML(opts.sourceUrl) : DP.issuesHTML(chk) + DP.blocksHTML(d, bopts);
    let html = '';
    if (mode === 'web') {
      html =
        '<div class="dp-web" dir="' + docDir + '">' +
        '<header class="dp-runhead">' +
        '<img class="dp-logo" src="' + (opts.logo || 'assets/easybim_logo-w.png') + '" alt="EasyBIM">' +
        '<div class="dp-runhead-doc"><span class="dp-runhead-series">' + tech(d.series) + '</span>' +
        '<span class="dp-runhead-title" dir="ltr">' + esc(d.title) + ' · ' + esc(d.code) + '</span></div>' +
        '</header>' +
        '<article class="dp-sheet">' +
        DP.bcHTML(d) +
        DP.mastheadHTML(d) +
        DP.versionsHTML(d, !bopts.static) +
        DP.tocHTML(d) +
        '<div class="dp-body">' + bodyHTML + '</div>' +
        DP.linksHTML(d) +
        '</article>' +
        '<footer class="dp-webfoot">' + DP.colophonHTML() + '</footer>' +
        '</div>';
    } else {
      html =
        '<div class="dp-tb" dir="' + docDir + '">' +
        DP.stickyHeadHTML(d) +
        DP.classbarHTML(d) +
        DP.versionsHTML(d, !bopts.static) +
        DP.tocHTML(d) +
        '<div class="dp-body">' + bodyHTML + '</div>' +
        DP.linksHTML(d) +
        DP.colophonHTML() +
        '</div>';
    }
    root.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  };

  /* ---- self-contained shareable page (for the Download → Web page flow) ---- */
  DP.standaloneHTML = function (logoDataUrl) {
    const d = DP.data;
    const docDir = DP.docDir(d);
    const body =
      '<div class="dp-web" dir="' + docDir + '">' +
      '<header class="dp-runhead">' +
      (logoDataUrl ? '<img class="dp-logo" src="' + logoDataUrl + '" alt="EasyBIM">' : '<span class="dp-runhead-series">EasyBIM</span>') +
      '<div class="dp-runhead-doc"><span class="dp-runhead-series">' + tech(d.series) + '</span>' +
      '<span class="dp-runhead-title" dir="ltr">' + esc(d.title) + ' · ' + esc(d.code) + '</span></div>' +
      '</header>' +
      '<article class="dp-sheet">' +
      DP.bcHTML(d) +
      DP.mastheadHTML(d) +
      DP.versionsHTML(d, false) +
      DP.tocHTML(d) +
      '<div class="dp-body">' + DP.blocksHTML(d, { static: true }) + '</div>' +
      DP.linksHTML(d) +
      '</article>' +
      '<footer class="dp-webfoot">' + DP.colophonHTML() + '</footer>' +
      '</div>';
    return '<!DOCTYPE html><html lang="' + (docDir === 'rtl' ? 'he' : 'en') + '" dir="' + docDir + '"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<title>' + esc(d.title) + ' · EasyBIM</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="' + DP.FONTS + '" rel="stylesheet">' +
      '<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"><\/script>' +
      '<style>*{box-sizing:border-box;margin:0;padding:0}html,body{min-height:100%}' +
      'body{font-family:\'Assistant\',system-ui,sans-serif;background:radial-gradient(60vw 55vw at 88% -8%,rgba(68,184,211,.16),transparent 60%),radial-gradient(52vw 52vw at 5% 108%,rgba(30,36,140,.13),transparent 60%),linear-gradient(135deg,#eef6fb 0%,#f8f9ff 45%,#f0f4ff 100%);background-attachment:fixed;-webkit-font-smoothing:antialiased}' +
      DP.CSS + '</style></head><body>' + body +
      '<script>if(window.lucide)lucide.createIcons();<\/script></body></html>';
  };

  /* ---- plain, Google-Docs-friendly EDITABLE export (real .html, not a fake .doc) ----
     Google Drive's "Open with Google Docs" converts genuine HTML far more reliably than
     Word-flavored-HTML-saved-as-.doc, especially for embedded (base64) images. Real semantic
     h1→h2→h3 nesting so Google Docs' auto-generated outline matches our own TOC; styling is
     inlined per-element (Docs import keeps inline styles far better than a <style> block). */
  DP.editableBlocksHTML = function (d) {
    let out = '';
    const heb = t => /[\u0590-\u05FF]/.test(t);
    const dirOf = t => heb(t) ? 'direction:rtl;text-align:right' : 'direction:ltr;text-align:left';
    d.blocks.forEach(b => {
      if (b.t === 'h') {
        const tag = b.lvl <= 3 ? 'h2' : (b.lvl >= 5 ? 'h4' : 'h3');
        const sz = b.lvl <= 3 ? '14.7pt' : (b.lvl >= 5 ? '12pt' : '13pt');
        const num = b.num ? '<span style="color:#00687a;font-weight:700;margin-inline-end:8px">' + esc(b.num) + '. </span>' : '';
        out += '<' + tag + ' dir="auto" style="' + dirOf(b.txt) + ';color:#1e248c;font-family:Calibri,Arial,sans-serif;font-size:' + sz + ';font-weight:700;margin:22px 0 8px;' + (b.lvl <= 3 ? 'border-bottom:2px solid #44b8d3;padding-bottom:5px' : '') + '">' + num + esc(b.txt) + '</' + tag + '>';
      } else if (b.t === 'p') {
        out += '<p dir="auto" style="' + dirOf(b.txt) + ';margin:0 0 10px' + (b.sub ? ' 18px' : '') + ';line-height:1.65;font-size:11.5pt;color:#111827">' + esc(b.txt) + '</p>';
      } else if (b.t === 'ul' || b.t === 'ol') {
        const anyHeb = b.items.some(heb);
        out += '<' + b.t + ' dir="auto" style="' + (anyHeb ? 'direction:rtl' : 'direction:ltr') + ';margin:0 0 12px;padding-inline-start:26px;line-height:1.6;font-size:11.5pt;color:#111827">' +
          b.items.map(it => '<li style="' + dirOf(it) + '">' + esc(it) + '</li>').join('') + '</' + b.t + '>';
      } else if (b.t === 'callout') {
        out += '<div dir="auto" style="' + dirOf(b.txt) + ';margin:0 0 12px;padding:10px 14px;background:#eaf7fa;border:1px solid #bfe9f2;border-radius:6px;color:#00687a;font-size:11pt" bgcolor="#eaf7fa">' + esc(b.txt) + '</div>';
      } else if (b.t === 'fig') {
        const src = (DP._fig && DP._fig[b.id]) || DP.slotSrc(b.id) || DP.figSrc(b.id);
        out += '<div style="margin:0 0 16px;text-align:center">' +
          (src ? '<img src="' + esc(src) + '" width="560" style="width:560px;max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:6px" alt="">' : '') +
          '<div style="margin-top:5px;font-size:9.5pt;color:#6b7280;font-style:italic;' + dirOf(b.cap) + '">' + esc(b.cap) + '</div></div>';
      }
    });
    return out;
  };
  DP.editableHTML = function () {
    const d = DP.data;
    const docDir = DP.docDir(d);
    const c = DP.company;
    const bc = d.path.join(' › ');
    const versions = DP.allVersions(d);
    const versionsTbl = versions.length
      ? '<div style="font-weight:700;color:#1e248c;font-size:12pt;margin:26px 0 8px">Versions</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:20px">' +
        '<tr style="background:#f7f9ff" bgcolor="#f7f9ff">' +
        '<th style="text-align:left;padding:6px 8px;border:1px solid #e3e7fb;color:#6b7280">No.</th>' +
        '<th style="text-align:left;padding:6px 8px;border:1px solid #e3e7fb;color:#6b7280">Date</th>' +
        '<th style="text-align:left;padding:6px 8px;border:1px solid #e3e7fb;color:#6b7280">Author</th>' +
        '<th style="text-align:left;padding:6px 8px;border:1px solid #e3e7fb;color:#6b7280">Change</th></tr>' +
        versions.map((v, i) => '<tr><td style="padding:6px 8px;border:1px solid #e3e7fb">' + (i === 0 ? 'Created' : 'v' + esc(v.v)) + '</td>' +
          '<td style="padding:6px 8px;border:1px solid #e3e7fb">' + esc(v.date) + '</td>' +
          '<td style="padding:6px 8px;border:1px solid #e3e7fb">' + esc(v.who) + '</td>' +
          '<td style="padding:6px 8px;border:1px solid #e3e7fb">' + esc(v.change) + '</td></tr>').join('') +
        '</table>' : '';
    return '<!DOCTYPE html><html lang="' + (docDir === 'rtl' ? 'he' : 'en') + '" dir="' + docDir + '"><head><meta charset="UTF-8"><title>' + esc(d.title) + '</title></head>' +
      '<body style="direction:ltr;font-family:Calibri,Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px">' +
      '<div style="font-size:9pt;letter-spacing:.04em;text-transform:uppercase;color:#44b8d3;font-weight:700;margin-bottom:4px">' + esc(d.series) + ' · ' + esc(d.code) + '</div>' +
      '<div style="font-size:9.5pt;color:#6b7280;margin-bottom:10px">' + esc(bc) + '</div>' +
      '<h1 style="color:#1e248c;font-family:Calibri,Arial,sans-serif;font-size:26px;border-bottom:3px solid #44b8d3;padding-bottom:10px;margin:0 0 16px">' + esc(d.title) + '</h1>' +
      versionsTbl +
      '<div dir="auto">' + DP.editableBlocksHTML(d) + '</div>' +
      '<div style="margin-top:30px;padding-top:14px;border-top:2px solid #44b8d3;text-align:center;font-size:9pt;color:#6b7280;direction:ltr">' +
      '<div style="font-weight:700;color:#1e248c;margin-bottom:4px">EasyBIM · Innovative Engineering</div>' +
      '<div>' + esc(c.phone) + ' · ' + esc(c.mail) + ' · ' + esc(c.site) + '</div>' +
      '<div dir="rtl" style="margin-top:2px">' + esc(c.addr) + '</div>' +
      '<p style="max-width:480px;margin:10px auto 0;font-size:7.5pt;line-height:1.5;color:#9ca3af">© All rights reserved to EasyBIM Technological Engineering Ltd. This file, in whole or in part, may not be copied, distributed, quoted, publicly displayed, or translated in any form (electronic or otherwise) to any party outside the company, nor may its contents be used, without prior written authorization.</p>' +
      '</div>' +
      '</body></html>';
  };

  /* ---- interactions ---- */
  DP._scroller = function (el) {
    let p = el && el.parentElement;
    while (p && p !== document.body) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 4) return p;
      p = p.parentElement;
    }
    return null;
  };
  DP.scrollToAnchor = function (anchor, flash) {
    const el = document.getElementById(anchor); if (!el) return false;
    const sc = DP._scroller(el);
    if (sc) {
      const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 16;
      sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
      window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 84), behavior: 'smooth' });
    }
    if (flash) {
      document.querySelectorAll('.dp-changeflash').forEach(n => n.classList.remove('dp-changeflash'));
      el.classList.add('dp-changeflash');
      setTimeout(() => el.classList.remove('dp-changeflash'), 2600);
    }
    return false;
  };
  DP.goToSection = function (anchor) {
    const t = document.getElementById('dpToc'); if (t && t.classList.contains('pinned')) t.classList.remove('open');
    return DP.scrollToAnchor(anchor, false);
  };
  DP.jumpToChange = function (anchor) {
    const v = document.getElementById('dpVers');
    if (v && v.classList.contains('pinned')) { v.classList.remove('open'); v.classList.add('collapsed'); }
    DP.scrollToAnchor(anchor, true);
  };
  /* Pinned blocks stack: each sticky bar parks under the ones above it. */
  DP.relayoutPins = function () {
    const pins = [...document.querySelectorAll('.dp-blk.pinned')];
    let top = 56;
    pins.forEach((p, i) => {
      p.style.top = top + 'px';
      p.style.zIndex = 40 - i;          // upper bar (and its dropdown) stays above the next one
      top += p.getBoundingClientRect().height + 6;
    });
  };
  DP.togglePin = function (e) {
    if (e) e.stopPropagation();
    const btn = e && e.target && e.target.closest ? e.target.closest('.dp-toc-pin') : null;
    const t = (btn && btn.closest('.dp-blk')) || document.getElementById('dpToc');
    if (!t) return;
    const pin = t.classList.toggle('pinned');
    // pinned starts collapsed (just the bar); unpinned returns inline & open
    t.classList.toggle('collapsed', pin);
    t.classList.remove('open');
    if (!pin) { t.style.top = ''; t.style.zIndex = ''; }
    const b2 = t.querySelector('.dp-toc-pin');
    if (b2) b2.title = pin ? 'Unpin' : 'Pin to top';
    DP.relayoutPins();
  };
  DP.tocToggle = function (e) {
    if (e && e.target && e.target.closest('.dp-toc-pin')) return;
    if (e) e.stopPropagation();
    const t = document.getElementById('dpToc'); if (!t) return;
    if (t.classList.contains('pinned')) {
      // expand/collapse the floating dropdown while pinned
      const open = t.classList.toggle('open');
      t.classList.toggle('collapsed', !open);
    } else {
      t.classList.toggle('collapsed');
    }
  };
  DP.versToggle = function (e) {
    if (e && e.target && e.target.closest && e.target.closest('.dp-toc-pin')) return;
    if (e) e.stopPropagation();
    const v = document.getElementById('dpVers'); if (!v) return;
    if (v.classList.contains('pinned')) {
      const open = v.classList.toggle('open');
      v.classList.toggle('collapsed', !open);
    } else {
      v.classList.toggle('collapsed');
    }
  };

  DP.openLink = function (name) {
    if (window.KC && KC.toast) KC.toast('פתיחת מסמך קשור: ' + name);
    else alert('Open related document: ' + name);
    return false;
  };

  /* ---- lightbox ---- */
  DP.zoom = function (id) {
    const slot = document.getElementById(id);
    let src = '';
    try { const im = slot && slot.shadowRoot && slot.shadowRoot.querySelector('.frame img'); if (im) src = im.getAttribute('src') || ''; } catch (e) {}
    let lb = document.getElementById('dpLightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'dpLightbox';
      lb.className = 'dp-lightbox';
      lb.innerHTML = '<button class="dp-lb-close" aria-label="סגירה"><i data-lucide="x"></i></button>' +
        '<div class="dp-lb-inner"><img class="dp-lb-img" alt=""><div class="dp-lb-empty"></div></div>' +
        '<div class="dp-lb-cap"></div>';
      document.body.appendChild(lb);
      lb.addEventListener('click', e => { if (e.target === lb || e.target.closest('.dp-lb-close')) DP.closeZoom(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') DP.closeZoom(); });
    }
    const img = lb.querySelector('.dp-lb-img');
    const empty = lb.querySelector('.dp-lb-empty');
    const cap = lb.querySelector('.dp-lb-cap');
    const fig = slot ? slot.closest('.dp-fig') : null;
    cap.textContent = fig ? (fig.querySelector('.dp-cap') ? fig.querySelector('.dp-cap').textContent : '') : '';
    if (src) { img.src = src; img.style.display = ''; empty.style.display = 'none'; }
    else { img.removeAttribute('src'); img.style.display = 'none'; empty.style.display = 'flex'; empty.innerHTML = '<i data-lucide="image"></i><span>עדיין לא הועלה צילום מסך</span>'; }
    lb.classList.add('open');
    if (window.lucide) lucide.createIcons();
  };
  DP.closeZoom = function () { const lb = document.getElementById('dpLightbox'); if (lb) lb.classList.remove('open'); };
})();
