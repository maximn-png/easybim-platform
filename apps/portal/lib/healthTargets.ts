// Apps probed by the admin Integrations board. Each is expected to expose a
// public GET /api/health (pattern: apps/finance/app/api/health/route.ts).
// A missing URL renders as "not configured"; a 404 as "no health endpoint".
export const HEALTH_TARGETS: Array<{ app: string; url: string | undefined }> = [
  { app: 'epm',        url: process.env.NEXT_PUBLIC_EPM_URL },
  { app: 'agents',     url: process.env.NEXT_PUBLIC_AGENTS_URL },
  { app: 'finance',    url: process.env.NEXT_PUBLIC_FINANCE_URL },
  { app: 'knowledge',  url: process.env.NEXT_PUBLIC_KNOWLEDGE_URL },
  { app: 'newsletter', url: process.env.NEXT_PUBLIC_NEWSLETTER_URL },
]
