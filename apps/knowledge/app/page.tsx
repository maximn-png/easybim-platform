import { BookOpen } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function KnowledgeHome() {
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL || 'http://localhost:3000'

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ backgroundColor: '#818cf822', color: '#6366f1' }}
      >
        <BookOpen size={32} />
      </div>

      <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
        EasyBIM Knowledge Center
      </h1>
      <p className="mt-3 max-w-xl text-base opacity-70">
        Your central hub for EasyBIM standards, BIM guides, templates, and best
        practices. This workspace is scaffolded and ready for development.
      </p>

      <div className="mt-10 w-full max-w-md rounded-xl border border-black/10 bg-black/[.02] p-5 text-left text-sm dark:border-white/10 dark:bg-white/[.03]">
        <p className="font-semibold">Wiring status</p>
        <p className="mt-1 opacity-70">
          Clerk auth, MongoDB, Monday, and Google Drive clients are set up. Hit{' '}
          <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">
            /api/health
          </code>{' '}
          to confirm every integration connects with your{' '}
          <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">
            .env.local
          </code>
          .
        </p>
      </div>

      <a
        href={portalUrl}
        className="mt-8 text-sm font-medium underline underline-offset-4 opacity-70 hover:opacity-100"
      >
        ← Back to the EasyBIM Platform
      </a>
    </main>
  )
}
