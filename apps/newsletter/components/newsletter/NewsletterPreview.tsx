'use client'

interface NewsletterPreviewProps {
  htmlOutput: string
}

export default function NewsletterPreview({ htmlOutput }: NewsletterPreviewProps) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Mac window chrome */}
      <div className="bg-[#2d2d2d] rounded-t-2xl px-4 py-3 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
        <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
        <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        <div className="flex-1 mx-4 bg-[#3d3d3d] rounded-lg py-1 px-3 text-center">
          <span className="text-[#888] text-xs">From: Maxim Naftaliyv | EasyBIM &lt;office@easybim.co.il&gt;</span>
        </div>
      </div>

      {/* Email content — rendered in an iframe to sandbox the full HTML document */}
      <iframe
        srcDoc={htmlOutput}
        className="border-x border-b border-[#e8eaff] rounded-b-2xl bg-white shadow-lg w-full"
        style={{ height: '70vh', display: 'block' }}
        sandbox="allow-same-origin"
        title="Newsletter preview"
      />
    </div>
  )
}
