// Verify the new user OAuth token: scope, identity, and a real template copy.
import { readFileSync } from 'node:fs'
const env = readFileSync('C:/easybim-platform/apps/agents/.env.local', 'utf-8')
const get = (k) => { const l = env.split(/\r?\n/).find((l) => l.startsWith(k + '=')); if (!l) return ''; let v = l.slice(k.length + 1).trim().replace(/\r$/, ''); if (v[0] === '"' && v.endsWith('"')) v = v.slice(1, -1); return v }
const [id, secret, refresh] = [get('GOOGLE_OAUTH_CLIENT_ID'), get('GOOGLE_OAUTH_CLIENT_SECRET'), get('GOOGLE_OAUTH_REFRESH_TOKEN')]

const r = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
})
const tok = await r.json()
if (!tok.access_token) { console.log('refresh FAILED:', JSON.stringify(tok).slice(0, 150)); process.exit(1) }
const info = await (await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${tok.access_token}`)).json()
console.log('scope:', info.scope)

const c = await (await fetch('https://www.googleapis.com/drive/v3/files/1aKTp7HN1Y5plb6LBPdXEm16WV0Xt0-WNW7HWYPrlXXM/copy?supportsAllDrives=true&fields=id,lastModifyingUser(emailAddress)', {
  method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '_user-copy-test-DELETE-ME', parents: ['10Mf8vlNrOdBvi1WN9SpSpL5Wx_0-YpQy'] }),
})).json()
if (c.id) {
  console.log('USER COPY OK — made by:', c.lastModifyingUser?.emailAddress)
  await fetch(`https://www.googleapis.com/drive/v3/files/${c.id}?supportsAllDrives=true`, { method: 'PATCH', headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) })
  console.log('(test copy trashed)')
} else console.log('copy failed:', JSON.stringify(c).slice(0, 250))
