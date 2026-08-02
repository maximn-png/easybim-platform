import 'server-only'
import type { AccIssue } from '@/lib/services/apsService'
import { type GroupKey, groupValue, statusColor, statusLabel, dropDraft } from '@/lib/reportGrouping'
import { ASSISTANT_FONT_B64 } from './reportAssets'
import { launchBrowser } from './chromium'

// Server-side twin of components/AnalyticsBars — the emailed "Issues by …" chart
// for runs with no browser (scheduled reports). The interactive Export flow
// rasterizes the React component with html-to-image; here Chromium screenshots
// the same markup, so both paths produce a visually identical image.
//
// Keep the two in sync: same row height, colours, label placement, and legend.

const esc = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const CHART_WIDTH = 600   // matches the hidden snapshot node in the Export panel
const MAX_ROWS = 8

export interface ChartOptions {
  issues: AccIssue[]
  groupBy: GroupKey
  title: string
  renderName?: (n: string) => string
}

function chartBody(opts: ChartOptions): string {
  const { issues, groupBy, renderName } = opts
  const kept = dropDraft(issues)

  const map = new Map<string, AccIssue[]>()
  for (const i of kept) {
    const key = groupValue(i, groupBy)
    map.set(key, [...(map.get(key) ?? []), i])
  }
  const groups = [...map.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, MAX_ROWS)
  const statuses = [...new Set(kept.map(i => i.status))].filter(Boolean)
  const maxTotal = groups.length ? groups[0][1].length : 0

  if (groups.length === 0) {
    return '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:12px 0">אין נושאים להצגה</div>'
  }

  const name = (n: string) => (renderName ? renderName(n) : n)

  const rows = groups.map(([gname, iss]) => {
    const total = iss.length
    const fill = maxTotal > 0 ? (total / maxTotal) * 100 : 0
    const parts = statuses
      .map(s => ({ s, c: iss.filter(i => i.status === s).length }))
      .filter(p => p.c > 0)
      .map(p => ({ ...p, w: (p.c / total) * 100 }))

    const colours = parts.map(p =>
      `<div style="width:${p.w}%;height:100%;background:${statusColor(p.s)}"></div>`).join('')
    const labels = parts.map(p =>
      `<div style="width:${p.w}%;height:100%;display:flex;align-items:center;justify-content:center;overflow:visible">` +
      `<span style="font-size:9px;font-weight:700;color:#fff;text-shadow:0 0 2px rgba(0,0,0,0.9);line-height:1;white-space:nowrap">${p.c}</span>` +
      `</div>`).join('')

    return `<div style="display:flex;align-items:center;gap:8px">
  <span style="font-size:11px;color:#4b5563;width:96px;flex-shrink:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name(gname))}</span>
  <div style="position:relative;flex:1;height:16px;border-radius:8px;background:#f3f4f6;direction:ltr">
    <div style="display:flex;height:100%;width:${fill}%;border-radius:8px;overflow:hidden">${colours}</div>
    <div style="position:absolute;top:0;left:0;height:100%;width:${fill}%;display:flex">${labels}</div>
  </div>
  <span style="font-size:11px;color:#6b7280;width:24px;text-align:left;flex-shrink:0;font-weight:500">${total}</span>
</div>`
  }).join('')

  const legend = statuses.map(s =>
    `<span style="display:inline-flex;align-items:center;gap:4px;font-size:9px;color:#6b7280">` +
    `<span style="width:8px;height:8px;border-radius:2px;background:${statusColor(s)};display:inline-block"></span>` +
    `${esc(statusLabel(s))}</span>`).join('')

  return `<div style="display:flex;flex-direction:column;gap:8px">${rows}</div>
<div style="display:flex;flex-wrap:wrap;gap:8px;padding-top:8px;margin-top:8px;border-top:1px solid #f3f4f6">${legend}</div>`
}

// PNG bytes of the chart, at 2× for crisp rendering in mail clients.
export async function renderChartPng(opts: ChartOptions): Promise<Buffer> {
  const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Assistant';
    src: url(data:font/ttf;base64,${ASSISTANT_FONT_B64}) format('truetype');
    font-weight: 200 800; font-style: normal; font-display: block;
  }
  html, body { margin: 0; padding: 0; background: #fff; }
  #chart { width: ${CHART_WIDTH}px; box-sizing: border-box; background: #fff; padding: 12px;
           font-family: 'Assistant', Arial, sans-serif; direction: rtl; }
</style></head>
<body><div id="chart">
  <div style="font-size:13px;font-weight:700;color:#1e248c;margin-bottom:8px;text-align:right">${esc(opts.title)}</div>
  <div style="width:${CHART_WIDTH - 24}px;box-sizing:border-box">${chartBody(opts)}</div>
</div></body></html>`

  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: CHART_WIDTH, height: 400, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    try { await page.evaluate(() => (document as Document).fonts.ready) } catch { /* best-effort */ }
    const el = await page.$('#chart')
    const shot = await (el ?? page).screenshot({ type: 'png' })
    return Buffer.from(shot)
  } finally {
    await browser.close()
  }
}
