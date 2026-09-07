import { connectDB } from '@/lib/db/mongoose'
import PeacockSetting from '@/lib/models/PeacockSetting'
import { POST_TYPES } from '@/lib/models/PeacockPost'

// The content plan: how many posts Peacock authors per week, and which pillars
// it may draw on. Read by the weekly author cron and edited on the dashboard.

const PLAN_KEY = 'contentPlan'

/** Ceiling on the stepper — one post a day is already more than anyone wants. */
export const MAX_POSTS_PER_WEEK = 7

export interface ContentPlan {
  /**
   * Posts the author cron drafts each week. **Zero is a real setting, not an
   * empty value**: it means Peacock stops proposing content of its own, and the
   * plan is filled by hand and from Newsletter Ideas instead. The cron still
   * runs at zero — it just limits itself to posts Maxim bounced back with
   * `revise`, which is work he asked for rather than content Peacock invented.
   */
  postsPerWeek: number
  /** Pillars the cron may choose from. Empty is treated as "no restriction". */
  postTypes: string[]
}

export const DEFAULT_PLAN: ContentPlan = {
  postsPerWeek: 2,
  postTypes: ['1. Professional', '4. Project'],
}

/** Clamp whatever is stored (or posted) into a plan the cron can act on. */
export function normalizePlan(raw: unknown): ContentPlan {
  const v = (raw ?? {}) as Partial<ContentPlan>
  const n = Number(v.postsPerWeek)
  const postsPerWeek = Number.isFinite(n)
    ? Math.min(MAX_POSTS_PER_WEEK, Math.max(0, Math.round(n)))
    : DEFAULT_PLAN.postsPerWeek
  const allowed = new Set<string>(POST_TYPES)
  const postTypes = Array.isArray(v.postTypes)
    ? v.postTypes.filter((t): t is string => typeof t === 'string' && allowed.has(t))
    : DEFAULT_PLAN.postTypes
  return { postsPerWeek, postTypes }
}

export async function getContentPlan(): Promise<ContentPlan> {
  await connectDB()
  const doc = await PeacockSetting.findOne({ key: PLAN_KEY })
  // No row yet means the plan was never edited — fall back to what the cron did
  // before it was configurable, so behaviour does not change on deploy alone.
  return doc ? normalizePlan(doc.value) : DEFAULT_PLAN
}

export async function saveContentPlan(plan: ContentPlan, updatedBy?: string): Promise<ContentPlan> {
  await connectDB()
  const value = normalizePlan(plan)
  await PeacockSetting.findOneAndUpdate(
    { key: PLAN_KEY },
    { key: PLAN_KEY, value, updatedBy: updatedBy ?? null },
    { upsert: true }
  )
  return value
}

/** True when Peacock should not author anything unprompted. */
export function isAutopilotOff(plan: ContentPlan): boolean {
  return plan.postsPerWeek === 0
}
