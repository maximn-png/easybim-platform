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
  // When set, embed images as self-contained data: URLs (for the saved history
  // preview) instead of cid: references (which only resolve inside the email).
  inline?: { chartBase64?: string; screenshotBase64?: string }
}): string {
  const { bodyText, links, highlightPhrases, hasChart, hasScreenshot, inline } = opts
  const chartSrc = inline?.chartBase64 ? `data:image/png;base64,${inline.chartBase64}` : 'cid:chart@easybim'
  const screenshotSrc = inline?.screenshotBase64 ? `data:image/png;base64,${inline.screenshotBase64}` : 'cid:screenshot@easybim'

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
      return `<p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#374151">${inner}</p>`
    })
    .join('')

  const chart = hasChart
    ? `<div style="margin:18px 0"><img src="${chartSrc}" alt="Issues analytics" style="display:block;max-width:100%;border:1px solid #e5e7eb;border-radius:8px" /></div>`
    : ''

  const screenshot = hasScreenshot
    ? `<div style="margin:18px 0"><img src="${screenshotSrc}" alt="" style="display:block;max-width:100%;border:1px solid #e5e7eb;border-radius:8px" /></div>`
    : ''

  return `<div dir="rtl" style="font-family:Arial,Assistant,sans-serif;text-align:right;color:#374151;max-width:680px">
${paragraphs}${chart}${screenshot}
</div>`
}
