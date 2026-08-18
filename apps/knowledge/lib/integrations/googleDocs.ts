// Google Docs client (service account — read-only structural access to Doc content).
//
//   import { getDocs } from '@/lib/integrations/googleDocs'
//   const res = await getDocs().documents.get({ documentId })
//
// Separate from gdrive.ts (which uses a user OAuth refresh token, drive scope
// only) because reading a Doc's structured body requires the Docs API, which
// that token was never consented for. Reuses the same service-account
// credential apps/agents already has working (GOOGLE_SERVICE_ACCOUNT_JSON) —
// see apps/agents/lib/integrations/google/client.ts for the identical pattern.

import { google } from 'googleapis'
import type { docs_v1 } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/documents.readonly']

function credentials(): Record<string, unknown> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured')
  const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8')
  return JSON.parse(json)
}

export function getDocs(): docs_v1.Docs {
  const auth = new google.auth.GoogleAuth({ credentials: credentials(), scopes: SCOPES })
  return google.docs({ version: 'v1', auth })
}
