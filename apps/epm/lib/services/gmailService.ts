// Gmail draft creation via the user's Google token, which Clerk stores + refreshes
// (Google enabled as a Clerk social connection with the gmail.compose scope).
import { clerkClient } from '@clerk/nextjs/server'

// Returns the user's Google OAuth access token from Clerk, or null if the user
// hasn't connected Google (or the connection lacks a token).
export async function getUserGoogleToken(userId: string): Promise<string | null> {
  try {
    const client = await clerkClient()
    // v7: provider id without the legacy `oauth_` prefix.
    const res = await client.users.getUserOauthAccessToken(userId, 'google')
    const token = res.data?.[0]?.token
    return token || null
  } catch (e) {
    console.warn('[gmail] getUserGoogleToken failed:', e)
    return null
  }
}

// Creates a Gmail draft from a base64url-encoded RFC 2822 message.
export async function gmailCreateDraft(accessToken: string, rawBase64Url: string): Promise<{ id: string }> {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { raw: rawBase64Url } }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gmail drafts.create ${res.status}: ${body.slice(0, 300)}`)
  }
  const json = await res.json() as { id: string; message?: { id: string } }
  return { id: json.id }
}
