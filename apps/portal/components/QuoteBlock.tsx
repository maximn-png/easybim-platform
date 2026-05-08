'use client'

import { useEffect, useState } from 'react'

interface Quote {
  content: string
  author: string
}

export default function QuoteBlock() {
  const [quote, setQuote] = useState<Quote | null>(null)

  useEffect(() => {
    fetch(
      'https://api.quotable.io/random?tags=technology|business|success|inspirational&maxLength=160'
    )
      .then(r => r.json())
      .then(d => {
        if (d.content && d.author) setQuote({ content: d.content, author: d.author })
      })
      .catch(() => {})
  }, [])

  if (!quote) return <div className="h-14" />

  return (
    <div className="max-w-lg mx-auto text-center mt-4 animate-fade-up">
      <p className="text-[#4b5563] italic text-sm leading-relaxed">
        <span className="text-[#44b8d3] text-xl font-black not-italic mr-0.5">&ldquo;</span>
        {quote.content}
        <span className="text-[#44b8d3] text-xl font-black not-italic ml-0.5">&rdquo;</span>
      </p>
      <p className="text-[#1e248c]/70 text-xs font-semibold mt-2 tracking-wide">
        — {quote.author}
      </p>
    </div>
  )
}
