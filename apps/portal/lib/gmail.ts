// Minimal Gmail sender that reuses the platform's existing Google OAuth
// credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN).
// No googleapis dependency — a token refresh + one REST call.
//
// The refresh token MUST carry the `https://www.googleapis.com/auth/gmail.send`
// scope; regenerate it (Google OAuth Playground or the app's consent flow) if
// mail silently fails to send. Mail is sent from the token owner's mailbox.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** RFC 2047 encoded-word so non-ASCII (Hebrew) survives in the Subject header. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`
}

async function getAccessToken(): Promise<string | null> {
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? '').trim()
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? '').trim()
  const refreshToken = (process.env.GOOGLE_REFRESH_TOKEN ?? '').trim()
  if (!clientId || !clientSecret || !refreshToken) {
    console.error('[gmail] missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN')
    return null
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    console.error('[gmail] token refresh failed:', res.status, await res.text().catch(() => ''))
    return null
  }
  const data = (await res.json()) as { access_token?: string }
  return data.access_token ?? null
}

/**
 * Send an HTML email. Returns true on success — never throws, so callers
 * (webhooks, best-effort notifications) can ignore mail failures safely.
 */
export async function sendGmail(opts: {
  to: string
  subject: string
  html: string
  from?: string
}): Promise<boolean> {
  try {
    const token = await getAccessToken()
    if (!token) return false

    const from = opts.from ?? process.env.NOTIFY_FROM_EMAIL ?? undefined
    const headers = [
      `To: ${opts.to}`,
      from ? `From: ${from}` : null,
      `Subject: ${encodeHeader(opts.subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
    ].filter(Boolean)

    const body = Buffer.from(opts.html, 'utf-8').toString('base64')
    const raw = base64url(`${headers.join('\r\n')}\r\n\r\n${body}`)

    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    })
    if (!res.ok) {
      console.error('[gmail] send failed:', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    console.error('[gmail] send error:', err)
    return false
  }
}
