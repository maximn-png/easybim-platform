// One-time consent flow (user-approved 2026-07-05): mint a FULL-drive-scope
// refresh token for Maxim's identity, reusing EPM's OAuth client. The token is
// written straight into apps/agents/.env.local (never printed). Delete after use.
import { readFileSync, appendFileSync } from 'node:fs'
import http from 'node:http'

const epm = readFileSync('C:/easybim-platform/apps/epm/.env.local', 'utf-8')
const get = (k) => { const l = epm.split(/\r?\n/).find((l) => l.startsWith(k + '=')); if (!l) return ''; let v = l.slice(k.length + 1).trim().replace(/\r$/, ''); if (v[0] === '"' && v.endsWith('"')) v = v.slice(1, -1); return v }
const ID = get('GOOGLE_CLIENT_ID'), SECRET = get('GOOGLE_CLIENT_SECRET')
const PORT = 8765
const REDIRECT = `http://localhost:${PORT}`

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/drive',
  access_type: 'offline',
  prompt: 'consent',
})
console.log('OPEN THIS URL IN YOUR BROWSER:\n' + authUrl + '\n')

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT)
  const code = u.searchParams.get('code')
  const err = u.searchParams.get('error')
  if (err) { res.end('Error: ' + err); console.log('CONSENT ERROR:', err); server.close(); return }
  if (!code) { res.end('waiting…'); return }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: ID, client_secret: SECRET, redirect_uri: REDIRECT, grant_type: 'authorization_code' }),
    })
    const tok = await r.json()
    if (!tok.refresh_token) { res.end('No refresh token: ' + JSON.stringify(tok).slice(0, 200)); console.log('EXCHANGE FAILED:', JSON.stringify(tok).slice(0, 200)); server.close(); return }
    appendFileSync('C:/easybim-platform/apps/agents/.env.local',
      `\nGOOGLE_OAUTH_CLIENT_ID=${ID}\nGOOGLE_OAUTH_CLIENT_SECRET=${SECRET}\nGOOGLE_OAUTH_REFRESH_TOKEN=${tok.refresh_token}\n`)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end('<div style="font-family:sans-serif;padding:30px">✅ Token saved — you can close this tab. חזור לצ\'אט.</div>')
    console.log('TOKEN SAVED to apps/agents/.env.local')
  } catch (e) { console.log('ERROR:', e.message); res.end('error') } finally { server.close() }
})
server.listen(PORT)
setTimeout(() => { console.log('TIMEOUT — no consent within 10 minutes'); server.close() }, 600000)
