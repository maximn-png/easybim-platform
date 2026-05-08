#!/usr/bin/env node
/**
 * One-time script to obtain a Google Photos refresh token.
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-google-photos-token.mjs
 *
 * On Windows PowerShell:
 *   $env:GOOGLE_CLIENT_ID="xxx"; $env:GOOGLE_CLIENT_SECRET="yyy"; node scripts/get-google-photos-token.mjs
 */

import http from 'node:http'
import { exec } from 'node:child_process'

const PORT = 3456
const REDIRECT_URI = `http://localhost:${PORT}/callback`
const SCOPE = 'https://www.googleapis.com/auth/photoslibrary.readonly https://www.googleapis.com/auth/photoslibrary.sharing'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n❌  Missing credentials.\n')
  console.error('Run with:')
  console.error('  PowerShell:')
  console.error('    $env:GOOGLE_CLIENT_ID="your-id"; $env:GOOGLE_CLIENT_SECRET="your-secret"; node scripts/get-google-photos-token.mjs')
  console.error('  bash:')
  console.error('    GOOGLE_CLIENT_ID=your-id GOOGLE_CLIENT_SECRET=your-secret node scripts/get-google-photos-token.mjs\n')
  process.exit(1)
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', CLIENT_ID)
authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', SCOPE)
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent') // forces refresh_token to be returned

console.log('\n──────────────────────────────────────────────────────')
console.log('  EasyBIM — Google Photos Token Setup')
console.log('──────────────────────────────────────────────────────')
console.log('\nOpening your browser. Sign in with the Google account')
console.log('that OWNS the EasyBIM Photos album.\n')
console.log('If the browser does not open, paste this URL manually:\n')
console.log(authUrl.toString())
console.log('\nWaiting for authorization...\n')

// Try to open browser automatically (Windows / Mac / Linux)
const openCmd = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open'
exec(`${openCmd} "${authUrl.toString()}"`)

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname !== '/callback') {
    res.writeHead(404); res.end(); return
  }

  const code  = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error || !code) {
    const msg = error ?? 'No authorization code received'
    res.writeHead(400, { 'Content-Type': 'text/html' })
    res.end(`<h2 style="color:red">❌ ${msg}</h2><p>Close this tab and try again.</p>`)
    console.error(`\n❌  Authorization failed: ${msg}\n`)
    server.close()
    return
  }

  // Exchange code → tokens
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    })

    const tokens = await tokenRes.json()

    if (tokens.error) throw new Error(tokens.error_description ?? tokens.error)
    if (!tokens.refresh_token) throw new Error(
      'No refresh_token in response. Make sure prompt=consent was sent and the account has not authorized this app before. Revoke access at myaccount.google.com/permissions and try again.'
    )

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<h2 style="color:green">✅ Authorized! You can close this tab.</h2>')

    console.log('\n✅  Success! Add these three lines to your apps/portal/.env.local:\n')
    console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`)
    console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`)
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`)
    console.log('\n──────────────────────────────────────────────────────\n')

    server.close()
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html' })
    res.end(`<h2 style="color:red">❌ ${err.message}</h2>`)
    console.error(`\n❌  Token exchange failed: ${err.message}\n`)
    server.close()
  }
})

server.on('error', err => {
  console.error(`\n❌  Could not start server on port ${PORT}: ${err.message}`)
  console.error('Make sure nothing else is using port 3456 and try again.\n')
  process.exit(1)
})

server.listen(PORT)
