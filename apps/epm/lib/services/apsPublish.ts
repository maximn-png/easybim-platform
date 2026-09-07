// "Publish Latest" for a cloud-workshared Revit model, server-side — no Revit,
// no workstation. This is step 3 of the Syncguard pipeline (docs/SYNCGUARD_PLAN.md)
// and it stands alone: publishing is what makes ACC / Forma / the model viewer
// serve the model's newest committed state.
//
// AUTH: unlike the rest of the coordination code, these calls CANNOT use the
// hub's 2-legged credentials. The Data Management commands endpoint answers
//   401 USER_UNAUTHORIZED — "This endpoint only supports two-legged with
//   impersonation and three-legged calls."
// so every function here takes a 3-legged user token. Callers get one from
// getApsUserToken() (interactive, cookies) or getApsAccessTokenForUser()
// (background, stored refresh token). A welcome side effect: ACC attributes the
// publish to the real person who asked for it rather than to the app.

const DM_BASE = 'https://developer.api.autodesk.com/data/v1'

const PUBLISH_CMD = 'commands:autodesk.bim360:C4RModelPublish'
const GET_JOB_CMD = 'commands:autodesk.bim360:C4RModelGetPublishJob'

export type PublishState =
  | 'published'      // command accepted; ACC is now processing
  | 'in-progress'    // a publish job was already running
  | 'up-to-date'     // nothing to publish — central has no newer state
  | 'unauthorized'   // token can't publish this project (or expired)
  | 'failed'

export interface PublishResult {
  state: PublishState
  detail?: string
}

type CommandResponse = {
  data?: {
    id?: string
    attributes?: { extension?: { data?: { status?: string; commandStatus?: string } } }
  }
  errors?: { status?: string; code?: string; detail?: string; title?: string }[]
}

// One POST /commands call. `resources` is the DM item (lineage) urn of the model.
// Returns the parsed body plus the HTTP status so callers can distinguish
// "ACC said no" from "ACC said not-yet".
async function runCommand(
  accProjectId: string, itemId: string, commandType: string, userToken: string,
): Promise<{ status: number; body: CommandResponse }> {
  const projId = accProjectId.startsWith('b.') ? accProjectId : `b.${accProjectId}`
  const res = await fetch(`${DM_BASE}/projects/${projId}/commands`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/vnd.api+json',
    },
    body: JSON.stringify({
      jsonapi: { version: '1.0' },
      data: {
        type: 'commands',
        attributes: { extension: { type: commandType, version: '1.0.0' } },
        relationships: { resources: { data: [{ type: 'items', id: itemId }] } },
      },
    }),
  })

  let body: CommandResponse = {}
  try { body = await res.json() as CommandResponse } catch { /* empty body on some errors */ }
  return { status: res.status, body }
}

const commandStatus = (body: CommandResponse): string =>
  (body.data?.attributes?.extension?.data?.commandStatus
    ?? body.data?.attributes?.extension?.data?.status
    ?? '').toLowerCase()

/**
 * Is a publish job already running for this model?
 *
 * Read-only — safe to poll. Autodesk reports an *absent* job the same way it
 * reports a finished one, so a null return means "nothing running", which is
 * also the answer while a just-finished publish is still translating (the
 * viewer's own `processingVersion` covers that window).
 */
export async function getPublishJob(
  accProjectId: string, itemId: string, userToken: string,
): Promise<{ running: boolean; status: string } | null> {
  const { status, body } = await runCommand(accProjectId, itemId, GET_JOB_CMD, userToken)
  if (status === 401 || status === 403) return null
  if (status >= 400) return null

  const s = commandStatus(body)
  // ACC's vocabulary here is not stable across regions; treat anything that
  // isn't an explicit terminal state as still running.
  const running = s !== '' && !/complete|success|failed|notfound|none/.test(s)
  return { running, status: s || 'unknown' }
}

/**
 * Publish the model's latest committed state to ACC (and thereby to Forma and
 * the model viewer). Requires a 3-legged token whose user has publish rights on
 * the project.
 *
 * Idempotent in practice: asking ACC to publish a model with nothing new to
 * publish is not an error, it just doesn't create a version — reported as
 * 'up-to-date' so the UI can say so instead of implying work happened.
 */
export async function publishModel(
  accProjectId: string, itemId: string, userToken: string,
): Promise<PublishResult> {
  // Don't stack publishes: a second command while one is running is either
  // rejected or silently coalesced depending on region.
  const existing = await getPublishJob(accProjectId, itemId, userToken)
  if (existing?.running) {
    return { state: 'in-progress', detail: `ACC is already publishing (${existing.status})` }
  }

  const { status, body } = await runCommand(accProjectId, itemId, PUBLISH_CMD, userToken)

  if (status === 401 || status === 403) {
    return { state: 'unauthorized', detail: body.errors?.[0]?.detail ?? `ACC ${status}` }
  }
  if (status >= 400) {
    const err = body.errors?.[0]
    return { state: 'failed', detail: err?.detail ?? err?.title ?? `ACC ${status}` }
  }

  const s = commandStatus(body)
  if (/uptodate|up-to-date|nothingtopublish/.test(s.replace(/\s/g, ''))) {
    return { state: 'up-to-date' }
  }
  return { state: 'published', detail: s || undefined }
}
