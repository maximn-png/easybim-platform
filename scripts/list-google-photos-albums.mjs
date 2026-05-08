#!/usr/bin/env node
/**
 * Lists all Google Photos albums so you can find the correct album ID.
 * Usage (PowerShell):
 *   $env:GOOGLE_CLIENT_ID="..."; $env:GOOGLE_CLIENT_SECRET="..."; $env:GOOGLE_REFRESH_TOKEN="..."; node scripts/list-google-photos-albums.mjs
 */

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error('Missing env vars. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN')
  process.exit(1)
}

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  }),
})
const { access_token } = await tokenRes.json()
if (!access_token) { console.error('Failed to get access token'); process.exit(1) }

console.log('\n── Your Google Photos Albums ──────────────────────\n')

let pageToken
do {
  const params = new URLSearchParams({ pageSize: '50' })
  if (pageToken) params.set('pageToken', pageToken)
  const res = await fetch(`https://photoslibrary.googleapis.com/v1/albums?${params}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const data = await res.json()
  for (const album of data.albums ?? []) {
    console.log(`Title : ${album.title}`)
    console.log(`ID    : ${album.id}`)
    console.log(`Items : ${album.mediaItemsCount ?? '?'}`)
    console.log('──────────────────────────────────────────────────')
  }
  pageToken = data.nextPageToken
} while (pageToken)

console.log('\nCopy the ID of the EasyBIM Photos album and paste it back.\n')
