// Builds the RTL HTML body for the Gmail draft. Email clients ignore <style>/classes,
// so everything is inline-styled. The chart + screenshot are referenced as CID
// inline images (the actual image bytes are attached as related parts by the API route).
import { segmentBodyText, type BodyLink } from './reportTemplates'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const LINK_STYLE = 'color:#1e248c;text-decoration:underline'
// Amber pill — flags a link the recipient/sender should notice / edit.
const HIGHLIGHT_STYLE = 'background-color:#fde68a;color:#92400e;text-decoration:underline;padding:0 3px;border-radius:3px'

export function buildEmailHtml(opts: {
  bodyText: string
  links: BodyLink[]
  highlightPhrases?: string[]
  hasChart: boolean
  hasScreenshot: boolean
  // Image source, in priority order:
  //   inline → self-contained data: URLs (saved history preview)
  //   urls   → hosted https URLs (the SENT email — reliable across clients)
  //   else   → cid: references (legacy inline-attachment fallback)
  inline?: { chartBase64?: string; screenshotBase64?: string }
  urls?: { chart?: string; screenshot?: string }
}): string {
  const { bodyText, links, highlightPhrases, hasChart, hasScreenshot, inline, urls } = opts
  const chartSrc = inline?.chartBase64
    ? `data:image/png;base64,${inline.chartBase64}`
    : (urls?.chart ?? 'cid:chart@easybim')
  const screenshotSrc = inline?.screenshotBase64
    ? `data:image/png;base64,${inline.screenshotBase64}`
    : (urls?.screenshot ?? 'cid:screenshot@easybim')

  const paragraphs = segmentBodyText(bodyText, links, highlightPhrases)
    .map(segs => {
      const inner = segs.map(s => {
        const t = esc(s.text)
        if (!s.link) return t
        const style = s.link.highlight ? HIGHLIGHT_STYLE : LINK_STYLE
        // Highlighted-but-empty link (user hasn't pasted a URL yet) → styled span.
        if (!s.link.href) return s.link.highlight ? `<span style="${style}">${t}</span>` : t
        return `<a href="${esc(s.link.href)}" style="${style}">${t}</a>`
      }).join('')
      // Gmail/Outlook often drop a single root dir="rtl", so set direction +
      // alignment on EVERY block, not just the wrapper.
      return `<p dir="rtl" style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#374151;direction:rtl;text-align:right">${inner}</p>`
    })
    .join('')

  const chart = hasChart
    ? `<div dir="rtl" style="margin:18px 0;direction:rtl;text-align:right"><img src="${chartSrc}" alt="Issues analytics" style="display:block;max-width:100%;border:1px solid #e5e7eb;border-radius:8px" /></div>`
    : ''

  const screenshot = hasScreenshot
    ? `<div dir="rtl" style="margin:18px 0;direction:rtl;text-align:right"><img src="${screenshotSrc}" alt="" style="display:block;max-width:100%;border:1px solid #e5e7eb;border-radius:8px" /></div>`
    : ''

  // Wrap in an RTL table — email clients respect table alignment far more
  // reliably than a bare div's dir attribute.
  return `<div dir="rtl" style="direction:rtl;text-align:right;color:#374151">
<table dir="rtl" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;direction:rtl">
<tr><td align="right" style="text-align:right;direction:rtl;font-family:Arial,Assistant,sans-serif;color:#374151;max-width:680px">
${paragraphs}${chart}${screenshot}
</td></tr>
</table>
</div>`
}
