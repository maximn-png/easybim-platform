'use client'

import { useState } from 'react'
import { Copy, Download, Check } from 'lucide-react'
import { format } from 'date-fns'

interface NewsletterExportProps {
  htmlOutput: string
  date: string
}

export default function NewsletterExport({ htmlOutput, date }: NewsletterExportProps) {
  const [copied, setCopied] = useState(false)

  async function copyHtml() {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([htmlOutput], { type: 'text/html' }),
          'text/plain': new Blob([htmlOutput], { type: 'text/plain' }),
        }),
      ])
    } catch {
      await navigator.clipboard.writeText(htmlOutput)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function downloadHtml() {
    const filename = `newsletter-${format(new Date(date), 'yyyy-MM-dd')}.html`
    const blob = new Blob([htmlOutput], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <button
        onClick={copyHtml}
        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
          copied
            ? 'bg-emerald-500 text-white'
            : 'bg-[#1e248c] text-white hover:bg-[#1e248c]/90 shadow-md shadow-[#1e248c]/20'
        }`}
      >
        {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy HTML</>}
      </button>

      <button
        onClick={downloadHtml}
        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#1e248c] text-[#1e248c] font-bold text-sm hover:bg-[#1e248c] hover:text-white transition-all"
      >
        <Download size={15} /> Download HTML
      </button>
    </div>
  )
}
