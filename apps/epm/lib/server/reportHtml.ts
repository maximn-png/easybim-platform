// Server-side HTML builder for the BIM report PDF. Produces a standalone,
// print-ready HTML document that headless Chromium renders to a crisp, paginated
// PDF (real text + true page breaks — `tr { break-inside: avoid }`, repeating
// header). RTL throughout. NOT a React component — plain string so it runs in a
// route handler without a DOM.
import type { AccIssue } from '@/lib/services/apsService'
import {
  type GroupKey, GROUP_OPTIONS, groupValue, statusColor, statusLabel, segmentTextColor,
} from '@/lib/reportGrouping'

export interface ReportMeta {
  projectName:    string
  projectNumber?: string
  templateTitle:  string
  groupBy:        GroupKey
  // Display label for the grouping (resolved client-side, incl. Hebrew + dynamic
  // custom-attribute names). Falls back to the static option label / raw key.
  groupLabel?:    string
  filtersSummary: string
}

const esc = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// "Issues by <groupBy>" status-stacked bars, as static HTML (top 12 groups).
function buildAnalytics(issues: AccIssue[], groupBy: GroupKey): string {
  const map = new Map<string, AccIssue[]>()
  for (const i of issues) {
    const key = groupValue(i, groupBy)
    map.set(key, [...(map.get(key) ?? []), i])
  }
  const groups = [...map.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12)
  const statuses = [...new Set(issues.map(i => i.status))].filter(Boolean)
  const maxTotal = groups.length ? groups[0][1].length : 0
  if (groups.length === 0) {
    return `<div style="font-size:12px;color:#9ca3af;text-align:center;padding:12px 0">אין נושאים להצגה</div>`
  }

  const rows = groups.map(([gname, iss]) => {
    const total = iss.length
    const fill = maxTotal > 0 ? (total / maxTotal) * 100 : 0
    const segs = statuses.map(s => {
      const c = iss.filter(i => i.status === s).length
      if (c === 0) return ''
      const seg = (c / total) * 100
      return `<div style="width:${seg}%;background:${statusColor(s)};display:flex;align-items:center;justify-content:center;overflow:hidden">${
        seg >= 9 ? `<span style="font-size:9px;font-weight:700;color:#fff;text-shadow:0 0 2px rgba(0,0,0,0.75);line-height:1">${c}</span>` : ''
      }</div>`
    }).join('')
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="font-size:11px;color:#4b5563;width:110px;flex-shrink:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(gname)}</span>
      <div style="flex:1;height:16px;border-radius:8px;background:#f3f4f6;overflow:hidden">
        <div style="display:flex;height:100%;width:${fill}%;border-radius:8px;overflow:hidden">${segs}</div>
      </div>
      <span style="font-size:11px;color:#6b7280;width:24px;text-align:left;flex-shrink:0;font-weight:500">${total}</span>
    </div>`
  }).join('')

  const legend = statuses.map(s =>
    `<span style="display:inline-flex;align-items:center;gap:4px;font-size:9px;color:#6b7280;margin-left:8px">
      <span style="width:8px;height:8px;border-radius:2px;background:${statusColor(s)};display:inline-block"></span>${esc(statusLabel(s))}
    </span>`
  ).join('')

  return `${rows}<div style="display:flex;flex-wrap:wrap;gap:4px;padding-top:8px;margin-top:8px;border-top:1px solid #f3f4f6">${legend}</div>`
}

function issueRows(issues: AccIssue[]): string {
  if (issues.length === 0) {
    return `<tr><td colspan="7" style="text-align:center;color:#9ca3af">אין נושאים</td></tr>`
  }
  // Sort by the real ACC issue number (numeric), matching the reports page.
  const sorted = [...issues].sort(
    (a, b) => (parseInt(a.displayId ?? '', 10) || 0) - (parseInt(b.displayId ?? '', 10) || 0)
  )
  return sorted.map((i) => {
    const pill = `<span style="display:inline-block;padding:1px 6px;border-radius:999px;font-size:9px;font-weight:600;background:${statusColor(i.status)};color:${segmentTextColor(i.status)}">${esc(statusLabel(i.status))}</span>`
    // Real ACC number, linked to the exact issue in ACC (Chromium keeps <a> clickable in the PDF).
    const numText = i.displayId ? `#${esc(i.displayId)}` : '—'
    const numCell = i.url
      ? `<a href="${esc(i.url)}" style="color:#1e248c;font-weight:600;text-decoration:underline">${numText}</a>`
      : `<span style="color:#6b7280">${numText}</span>`
    return `<tr>
      <td style="white-space:nowrap">${numCell}</td>
      <td>${esc(i.title)}</td>
      <td dir="rtl" style="white-space:pre-wrap">${esc(i.description?.trim() || '—')}</td>
      <td>${esc(i.assignedTo ?? '—')}</td>
      <td>${esc(i.discipline || '—')}</td>
      <td style="text-align:center">${pill}</td>
      <td>${esc(i.issueType)}</td>
    </tr>`
  }).join('')
}

export function buildReportHtml(
  meta: ReportMeta,
  issues: AccIssue[],
  opts: { fontCss: string; logoSrc: string },
): string {
  const today = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' })
  const groupLabel = meta.groupLabel
    || GROUP_OPTIONS.find(o => o.value === meta.groupBy)?.label
    || (meta.groupBy.startsWith('attr:') ? meta.groupBy.slice(5) : meta.groupBy)
  const sub = `${esc(meta.projectName)}${meta.projectNumber ? ` · ${esc(meta.projectNumber)}` : ''}`

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
${opts.fontCss}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Assistant', Arial, sans-serif; color: #374151; direction: rtl;
  text-align: right; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.header { display: flex; justify-content: space-between; align-items: flex-start;
  border-bottom: 2px solid #1e248c; padding-bottom: 12px; margin-bottom: 16px; }
.title { font-size: 20px; font-weight: 700; color: #1e248c; }
.sub { font-size: 13px; color: #374151; margin-top: 4px; }
.meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
.logo { height: 44px; width: auto; flex-shrink: 0; margin-right: 16px; }
.h2 { font-size: 13px; font-weight: 700; color: #1e248c; margin: 0 0 8px; }
.section-table { margin-top: 18px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead { display: table-header-group; }   /* repeat header on every page */
tr { break-inside: avoid; page-break-inside: avoid; }
th, td { border: 1px solid #e5e7eb; padding: 5px 7px; font-size: 10px;
  text-align: right; vertical-align: top; word-break: break-word; }
th { background: #f1f3f8; color: #1e248c; font-weight: 700; font-size: 9px; }
.footer { border-top: 1px solid #d1d5db; margin-top: 28px; padding-top: 10px;
  text-align: center; font-size: 10px; color: #374151; line-height: 1.6; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">${esc(meta.templateTitle)}</div>
      <div class="sub">${sub}</div>
      <div class="meta">הופק בתאריך ${today} · ${issues.length} נושאים · ${esc(meta.filtersSummary)}</div>
    </div>
    <img class="logo" src="${opts.logoSrc}" alt="EasyBIM" />
  </div>

  <div class="h2">נושאים לפי ${esc(groupLabel)}</div>
  ${buildAnalytics(issues, meta.groupBy)}

  <div class="section-table">
    <div class="h2">פירוט נושאים</div>
    <table>
      <thead>
        <tr>
          <th style="width:24px">#</th>
          <th style="width:150px">כותרת</th>
          <th>תיאור</th>
          <th style="width:80px">משויך</th>
          <th style="width:75px">דיסציפלינה</th>
          <th style="width:64px">סטטוס</th>
          <th style="width:64px">סוג</th>
        </tr>
      </thead>
      <tbody>
        ${issueRows(issues)}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <span style="font-weight:700">איזיבים הנדסה טכנולוגית בע"מ</span>
    | טלפון: 03-6888477 | אתר: <span style="color:#1e248c">www.easybim.co.il</span>
    | דוא"ל: <span style="color:#1e248c">office@easybim.co.il</span>
    | כתובת: תובל 22, רמת גן
  </div>
</body>
</html>`
}
