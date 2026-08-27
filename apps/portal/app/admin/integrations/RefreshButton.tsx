'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'

export default function RefreshButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors hover:bg-white disabled:opacity-60"
      style={{ background: 'rgba(30,36,140,0.06)', borderColor: 'rgba(30,36,140,0.20)', color: '#1e248c' }}
    >
      {pending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} style={{ color: '#44b8d3' }} />}
      {pending ? 'Probing…' : 'Refresh'}
    </button>
  )
}
