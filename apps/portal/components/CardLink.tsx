'use client'

// Card link that pings the activity log as it opens. sendBeacon survives the
// navigation (new tab or not) and never blocks or breaks the click.
export default function CardLink({
  appId,
  href,
  className,
  children,
}: {
  appId: string
  href: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => {
        try {
          navigator.sendBeacon(
            '/api/track/card-open',
            new Blob([JSON.stringify({ app: appId })], { type: 'application/json' })
          )
        } catch {}
      }}
    >
      {children}
    </a>
  )
}
