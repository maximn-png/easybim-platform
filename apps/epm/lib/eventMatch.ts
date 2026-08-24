// Heuristic matching of calendar-event titles to projects.
//
// A title like "ARENA+Ashkelon" should recognize BOTH "Arena Herzelia" and
// "ANA Ashkelon": each significant title token is matched against each
// project's name tokens (and its 5-digit number), and every matching token
// contributes at most one project — so distinct tokens can hit distinct
// projects and the meeting's hours get split between them.

export interface MatchableProject {
  _id: string
  projectName: string
  projectNumber: string
  /** status is not "done" */
  active: boolean
  /** the signed-in user is on the project team */
  mine: boolean
}

export interface EventProjectMatch {
  projectId: string
  projectName: string
  projectNumber: string
}

// Generic words that appear in meeting titles and project names but identify
// nothing on their own.
const STOP = new Set([
  // en
  'the', 'and', 'with', 'for', 'meeting', 'sync', 'call', 'zoom', 'teams', 'weekly',
  'daily', 'status', 'review', 'project', 'bim', 'easybim', 'acc', 'coordination',
  'model', 'site', 'tour', 'design', 'office', 'st', 'street',
  // he
  'פגישה', 'פגישת', 'ישיבה', 'ישיבת', 'סטטוס', 'עם', 'של', 'פרויקט', 'פרוייקט',
  'תיאום', 'מודל', 'שיחת', 'שיחה', 'סיור', 'רחוב', 'מגרש', 'בניין', 'מבנה',
])

const HEBREW = /[֐-׿]/

// Stable key for "the same meeting" across recurrences: lowercase title with
// punctuation stripped and whitespace collapsed.
export function normalizeTitleKey(title: string): string {
  return tokenize(title).join(' ')
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[+\-_./\\,()|:;"'’`&#!?<>[\]{}]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function significant(t: string): boolean {
  if (STOP.has(t)) return false
  if (/^\d+$/.test(t)) return /^\d{5}$/.test(t) // digits only count as project numbers
  return HEBREW.test(t) ? t.length >= 3 : t.length >= 4
}

// Prefix-tolerant equality so spelling variants still match
// ("herzelia" vs "hertzeliya" share no full token but a 4+ char prefix check
// on either side still catches most transliteration drift).
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return false
  if (a.length < 4 || b.length < 4) return false
  return a.startsWith(b) || b.startsWith(a)
}

export function matchProjectsToTitle(title: string, projects: MatchableProject[]): EventProjectMatch[] {
  const titleTokens = tokenize(title).filter(significant)
  if (titleTokens.length === 0) return []

  const nameTokens = projects.map((p) => tokenize(p.projectName).filter(significant))
  const score = (p: MatchableProject) => (p.mine ? 2 : 0) + (p.active ? 1 : 0)

  const picked = new Map<string, EventProjectMatch>()
  for (const t of titleTokens) {
    const candidates = projects.filter(
      (p, i) => p.projectNumber === t || nameTokens[i].some((pt) => tokensMatch(t, pt))
    )
    if (candidates.length === 0) continue
    // Ambiguous token (e.g. "arena" hits two Arena projects): prefer the
    // user's own active projects.
    candidates.sort((a, b) => score(b) - score(a))
    const best = candidates[0]
    if (!picked.has(best._id)) {
      picked.set(best._id, { projectId: best._id, projectName: best.projectName, projectNumber: best.projectNumber })
    }
  }
  return [...picked.values()]
}
