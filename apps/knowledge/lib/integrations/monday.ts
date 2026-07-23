// Thin monday.com GraphQL client.
//
//   import { mondayQuery } from '@/lib/integrations/monday'
//   const data = await mondayQuery(`query { me { name } }`)
//
// Uses the personal API token in MONDAY_API_TOKEN (WRITE scope). The same
// token is shared across EasyBIM apps — see .env.local.

const MONDAY_API_URL = 'https://api.monday.com/v2'
const API_VERSION = '2024-10'

export function getMondayToken(): string {
  const token = process.env.MONDAY_API_TOKEN
  if (!token) throw new Error('MONDAY_API_TOKEN is not defined in .env.local')
  return token
}

export async function mondayQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getMondayToken(),
      'API-Version': API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  })

  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(
      `monday.com API error: ${JSON.stringify(json.errors ?? json)}`
    )
  }
  return json.data as T
}
