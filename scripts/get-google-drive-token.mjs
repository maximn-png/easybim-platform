#!/usr/bin/env node
/**
 * One-time script to obtain a Google Drive (read-only) refresh token, reusing the
 * existing EasyBIM OAuth client. Mirrors get-google-photos-token.mjs but requests
 * the drive.readonly scope so the EPM sync can resolve project Drive folders.
 *
 * Usage (PowerShell):
 *   $env:GOOGLE_CLIENT_ID="xxx"; $env:GOOGLE_CLIENT_SECRET="yyy"; node scripts/get-google-drive-token.mjs
 *
 * On success the refresh token is printed AND written to scripts/.drive-token.txt
 */

import http from 'node:http'
import fs from 'node:fs'
import { exec } from 'node:child_process'

const PORT = 3456
const REDIRECT_URI = `http://localhost:${PORT}/callback`
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars.')
  process.exit(1)
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', CLIENT_ID)
authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', SCOPE)
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent') // force a refresh_token even if previously authorized

console.log('AUTH_URL=' + authUrl.toString())
console.log('Waiting for authorization on ' + REDIRECT_URI + ' ...')

// Best-effort: also pop the default browser (ignored if running headless).
const openCmd = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open'
exec(`${openCmd} "${authUrl.toString()}"`)

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return }

  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html' })
    res.end(`<h2 style="color:red">${error ?? 'No code'}</h2>`)
    console.error('AUTH_ERROR=' + (error ?? 'no_code'))
    server.close()
    return
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenRes.json()
    if (tokens.error) throw new Error(tokens.error_description ?? tokens.error)
    if (!tokens.refresh_token) throw new Error('No refresh_token returned (revoke at myaccount.google.com/permissions and retry).')

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<h2 style="color:green">Authorized! You can close this tab.</h2>')
    fs.writeFileSync(new URL('./.drive-token.txt', import.meta.url), tokens.refresh_token, 'utf8')
    console.log('SCOPE_GRANTED=' + (tokens.scope ?? ''))
    console.log('REFRESH_TOKEN=' + tokens.refresh_token)
    server.close()
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html' })
    res.end(`<h2 style="color:red">${err.message}</h2>`)
    console.error('TOKEN_EXCHANGE_ERROR=' + err.message)
    server.close()
  }
})

server.on('error', err => { console.error('SERVER_ERROR=' + err.message); process.exit(1) })
server.listen(PORT)
