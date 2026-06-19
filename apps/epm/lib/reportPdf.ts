// Client-side PDF generation. We render a hidden, fully-styled HTML report node
// in the browser (so Hebrew/RTL shaping is correct), snapshot it to a PNG via
// html-to-image, then place that PNG into a jsPDF A4 document — slicing tall
// content across multiple pages. Returns both a base64 string (for the Gmail
// attachment) and a blob URL (to open in a new tab for review).
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'

export interface GeneratedPdf {
  base64: string   // raw base64 (no data: prefix) — for the email attachment
  blobUrl: string  // object URL — for window.open review
}

export async function generateReportPdf(node: HTMLElement, _name: string): Promise<GeneratedPdf> {
  // Wait for fonts so Hebrew renders before snapshot
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* ignore */ } }
  await new Promise(r => requestAnimationFrame(() => r(null)))

  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    width: node.offsetWidth,
    height: node.offsetHeight,
  })

  const img = new Image()
  img.src = dataUrl
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej })

  const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()

  // Scale image to page width; slice vertically across pages.
  const imgW = pageW
  const imgH = (img.height / img.width) * imgW
  let remaining = imgH
  let position = 0
  while (remaining > 0) {
    pdf.addImage(dataUrl, 'PNG', 0, position, imgW, imgH, undefined, 'FAST')
    remaining -= pageH
    if (remaining > 0) {
      pdf.addPage()
      position -= pageH
    }
  }

  const blob = pdf.output('blob')
  const blobUrl = URL.createObjectURL(blob)
  // jsPDF datauristring → strip the "data:application/pdf;...;base64," prefix
  const dataUri = pdf.output('datauristring')
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1)

  return { base64, blobUrl }
}
