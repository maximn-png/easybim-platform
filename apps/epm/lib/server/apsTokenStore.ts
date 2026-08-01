import 'server-only'
import type { ApsHub } from '@/lib/services/apsHubs'
import { refreshApsUserToken } from '@/lib/services/apsService'
import { seal, open } from './secretBox'

// Persisted APS refresh tokens — the background counterpart to the cookie-based
// apsUserToken. Scheduled reports have no request cookies, so they mint an
// access token here instead, on behalf of the schedule's owner.

const hubKeyOf = (hub?: ApsHub | null) => hub?.key ?? ''

async function model() {
  if (!process.env.MONGODB_URI) return null
  const { connectDB } = await import('@easybim/db')
  const ApsToken = (await import('@/app/models/ApsToken')).default
  await connectDB()
  return ApsToken
}

// Called after an OAuth exchange/refresh so the newest refresh token is stored.
export async function saveApsRefreshToken(
  userId: string, refreshToken: string, hub?: ApsHub | null,
): Promise<void> {
  try {
    const ApsToken = await model()
    if (!ApsToken) return
    const { value, enc } = seal(refreshToken)
    await ApsToken.updateOne(
      { userId, hubKey: hubKeyOf(hub) },
      { $set: { refreshToken: value, enc } },
      { upsert: true },
    )
  } catch (err) {
    // Never break the interactive OAuth flow over a persistence hiccup — the
    // cookies were already set; only background runs lose out.
    console.warn('[apsTokenStore] save failed:', err)
  }
}

export async function deleteApsRefreshToken(userId: string, hub?: ApsHub | null): Promise<void> {
  try {
    const ApsToken = await model()
    if (!ApsToken) return
    await ApsToken.deleteOne({ userId, hubKey: hubKeyOf(hub) })
  } catch (err) {
    console.warn('[apsTokenStore] delete failed:', err)
  }
}

export async function hasApsRefreshToken(userId: string, hub?: ApsHub | null): Promise<boolean> {
  try {
    const ApsToken = await model()
    if (!ApsToken) return false
    return (await ApsToken.countDocuments({ userId, hubKey: hubKeyOf(hub) })) > 0
  } catch {
    return false
  }
}

// A fresh 3-legged access token for a user, with no request context.
// Null ⇒ they never connected this hub, or the grant was revoked → the caller
// should surface "needs Autodesk reconnect" rather than a generic failure.
export async function getApsAccessTokenForUser(
  userId: string, hub?: ApsHub | null,
): Promise<string | null> {
  const ApsToken = await model()
  if (!ApsToken) return null

  const row = await ApsToken.findOne({ userId, hubKey: hubKeyOf(hub) }).lean() as
    { refreshToken?: string; enc?: boolean } | null
  if (!row?.refreshToken) return null

  const refreshToken = open(row.refreshToken, !!row.enc)
  if (!refreshToken) return null

  try {
    const refreshed = await refreshApsUserToken(refreshToken, hub)
    // Autodesk rotates refresh tokens — persist the new one or the next run fails.
    if (refreshed.newRefreshToken) {
      await saveApsRefreshToken(userId, refreshed.newRefreshToken, hub)
    }
    return refreshed.accessToken
  } catch (err) {
    console.warn(`[apsTokenStore] refresh failed for ${userId}/${hubKeyOf(hub) || 'easybim'}:`, err)
    return null
  }
}
