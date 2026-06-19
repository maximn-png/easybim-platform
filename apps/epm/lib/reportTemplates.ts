// Export-Report templates. Each template seeds the email subject, body text,
// preselected issue-type(s) / discipline(s), recipient roles, and PDF name.
//
// ── EDIT TEMPLATE COPY HERE ──────────────────────────────────────────────────
// `bodyLines` is placeholder Hebrew copy. Replace each template's lines with the
// real text when ready. `{project}` is substituted with the project name.
//
// `issueTypeHints` / `disciplineHints` / `roleHints` are matched (case-insensitive
// substring) against the project's REAL ACC values, so they preselect whatever
// actually exists; unmatched hints are simply ignored. Users can still adjust
// every selection manually in the modal.

export type LinkKind = 'issues' | 'model'

// A selectable sub-variant of a template (chosen via dropdown in the modal).
// Overrides the template's title / body / link & highlight config.
export interface ReportVariant {
  id: string
  title: string
  bodyLines: string[]
  linkKinds?: LinkKind[]
  highlightPhrases?: string[]
}

export interface ReportTemplate {
  id: string
  icon: string            // single glyph shown on the template card
  title: string
  desc: string
  bodyLines: string[]     // email body (one <p> per line). Tokens: {project}, {{accLink}}, {{modelLink}}
  bodyImage?: string      // optional instructional image embedded after the chart
  // Ordered link targets for the body's link phrases: 'issues' = auto deep link
  // to the ACC Issues tab; 'model' = manually-edited link (highlighted amber).
  linkKinds?: LinkKind[]
  highlightPhrases?: string[] // literal phrases highlighted amber (e.g. fill-in placeholders)
  variants?: ReportVariant[]  // if present, the modal shows a dropdown to pick one
  issueTypeHints: string[]
  disciplineHints: string[]
  roleHints: string[]     // matched against ACC member roles to preselect recipients
  pdfBaseName: string     // PDF file base name (project number appended at runtime)
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'qa',
    icon: '◴',
    title: 'דוח בקרת איכות מודלים',
    desc: 'בדיקות איכות, clash detection ושלמות המודל.',
    bodyLines: [
      'שלום לכולם,',
      'במסגרת ניהול ה-BIM בפרויקט {project}, אנו מבצעים בקרת איכות למודלים באופן תקופתי.',
      'בדיקות אלו נוגעות לאיכות המודלים, ומסייעות להבטיח עבודה מותאמת ומסונכרנת בין היועצים בפרויקט.',
      'לנוחיותכם, מצורף דוח בקרת מודלים וסטטוס משימות (Issues) ב-Forma, הדו"ח זמין לצפיה גם {{accLink}}.',
      'אודה לטיפולכם בכלל ההערות בענן.',
      'בסיום הטיפול נא לעדכן את סטטוס המשימה ל-"Completed" כפי שמתואר מטה.',
    ],
    bodyImage: '/report-instructions.png',
    linkKinds: ['issues'],
    issueTypeHints: ['בקרת איכות', 'clash', 'איכות', 'quality'],
    disciplineHints: [],
    roleHints: ['BIM Manager', 'BIM', 'Quality'],
    pdfBaseName: 'QA_Models',
  },
  {
    id: 'arch-struct',
    icon: '◫',
    title: 'דוח תאום אדריכלות־קונסטרוקציה',
    desc: 'התנגשויות וממשקים בין אדריכלות לקונסטרוקציה.',
    bodyLines: [
      'שלום רב,',
      'אבקש לעדכן כי ביצענו תיאום אדריכלות קונסטרוקציה עבור פרויקט {project}.',
      'מצ"ב גליונות ודו"ח סטטוס הערות (Issues), זמין להורדה גם {{accLink}}.',
      'ניתן ורצוי לצפות בגליונות ב-Forma שם מתאפשר לבחור אלמנטים ולקבל מידע נוסף שאינו זמין ב-PDF. זמין לנוחיותכם {{modelLink}}.',
      'במקרים של אי התאמות חוזרות - נפתחה הערה אחת כדי להקל על תהליך התיאום, לדוגמא עמוד חסר לאורך מס\' קומות. אנא ודאו כי אתם מבצעים את התיקונים בכל המקומות/מפלסים הנדרשים.',
      'בסיום הטיפול נא לעדכן את סטטוס המשימה ל-"Completed" כפי שמתואר מטה.',
    ],
    bodyImage: '/report-instructions.png',
    linkKinds: ['issues', 'model'],
    issueTypeHints: ['תאום', 'ממשק', 'coordination'],
    disciplineHints: ['אדריכלות', 'קונסטרוקציה'],
    roleHints: ['Architect', 'Structural'],
    pdfBaseName: 'Coord_Arch_Struct',
  },
  {
    id: 'mep',
    icon: '⌗',
    title: 'דוח תאום מערכות ראשוני',
    desc: 'תאום מערכות MEP ראשוני — מיזוג, חשמל ואינסטלציה.',
    bodyLines: [
      'שלום לכולם,',
      'מצ"ב תכניות ודוח תאום מערכות ראשוני לקומות [למלא סוג קומות] עבור פרויקט {project}. ראו סטטוס הערות לפי דיסציפלינה.',
      'כל החומר נמצא בענן Forma לעיונכם. {{modelLink}}.',
      'אודה לטיפולכם בכלל ההערות בענן. בסיום הטיפול נא לעדכן את סטטוס המשימה ל-"Completed" כפי שמתואר מטה.',
    ],
    bodyImage: '/report-instructions.png',
    linkKinds: ['model'],
    highlightPhrases: ['[למלא סוג קומות]'],
    variants: [
      {
        id: 'initial',
        title: 'דוח תאום מערכות ראשוני',
        bodyLines: [
          'שלום לכולם,',
          'מצ"ב תכניות ודוח תאום מערכות ראשוני לקומות [למלא סוג קומות] עבור פרויקט {project}. ראו סטטוס הערות לפי דיסציפלינה.',
          'כל החומר נמצא בענן Forma לעיונכם. {{modelLink}}.',
          'אודה לטיפולכם בכלל ההערות בענן. בסיום הטיפול נא לעדכן את סטטוס המשימה ל-"Completed" כפי שמתואר מטה.',
        ],
        linkKinds: ['model'],
        highlightPhrases: ['[למלא סוג קומות]'],
      },
      {
        id: 'weekly',
        title: 'דוח תאום מערכות שבועי',
        bodyLines: [
          'שלום לכולם,',
          'ראו סטטוס הערות תאום מערכות לפי דיסציפלינה עבור פרויקט {project}.',
          'אודה לטיפולכם בכלל ההערות בענן. בסיום הטיפול נא לעדכן את סטטוס המשימה ל-"Completed" כפי שמתואר מטה.',
        ],
        linkKinds: [],
        highlightPhrases: [],
      },
      {
        id: 'final',
        title: 'דוח תאום מערכות סופי',
        bodyLines: [
          'שלום לכולם,',
          'מצ"ב תכניות ודוח תאום מערכות סופי לקומות [למלא סוג קומות] עבור פרויקט {project}. ראו סטטוס הערות לפי דיסציפלינה.',
          'כל החומר נמצא בענן Forma לעיונכם. {{modelLink}}.',
          'אודה לטיפולכם בכלל ההערות בענן. בסיום הטיפול נא לעדכן את סטטוס המשימה ל-"Completed" כפי שמתואר מטה.',
        ],
        linkKinds: ['model'],
        highlightPhrases: ['[למלא סוג קומות]'],
      },
    ],
    issueTypeHints: ['תאום', 'מערכות', 'mep'],
    disciplineHints: ['מיזוג', 'חשמל', 'אינסטלציה'],
    roleHints: ['Mechanical', 'Electrical', 'Plumbing', 'MEP'],
    pdfBaseName: 'Coord_MEP_Systems',
  },
]

// Subject line for a template + project.
export function subjectFor(t: ReportTemplate, projectName: string): string {
  return `${t.title} — ${projectName}`
}

// PDF file name for a template + project (number preferred, falls back to name).
export function pdfNameFor(t: ReportTemplate, projectName: string, projectNumber?: string): string {
  const suffix = (projectNumber || projectName).replace(/[^\p{L}\p{N}_-]+/gu, '_')
  return `${t.pdfBaseName}_${suffix}.pdf`
}

// The literal phrase that becomes a hyperlink to the ACC project in the email.
export const ACC_LINK_PHRASE = 'בקישור הבא'

// Deep link to the Issues tab of an ACC project, sorted by issue # and filtered
// to active statuses. `accProjectId` is the bare GUID (no "b." prefix).
// Mirrors the ACC web URL shape; issue-type filters are project-specific and
// intentionally omitted so the link works for any project.
export function accIssuesUrl(accProjectId: string): string {
  const sortBy = JSON.stringify({ attribute: 'displayId', direction: 'asc' })
  const filterBy = JSON.stringify({ status: ['open', 'pending', 'in_progress', 'completed'] })
  return `https://acc.autodesk.com/docs/issues/projects/${accProjectId}/issues`
    + `?sortBy=${encodeURIComponent(sortBy)}&filterBy=${encodeURIComponent(filterBy)}`
}

// Seeds the editable body textarea: substitutes {project} and turns the
// {{accLink}} token into the plain phrase (linkified later by preview/email).
export function seedBodyLines(bodyLines: string[], projectName: string): string {
  return bodyLines
    .map(l => l
      .replace(/\{project\}/g, projectName)
      .replace(/\{\{accLink\}\}/g, ACC_LINK_PHRASE)
      .replace(/\{\{modelLink\}\}/g, ACC_LINK_PHRASE))
    .join('\n')
}

export function seedBodyText(t: ReportTemplate, projectName: string): string {
  return seedBodyLines(t.bodyLines, projectName)
}

// Resolves the effective title / body / link config for a template + selected
// variant. Falls back to the first variant, then to the template's own fields.
export function resolveVariant(t: ReportTemplate, variantId: string | null): {
  id: string | null
  title: string
  bodyLines: string[]
  linkKinds: LinkKind[]
  highlightPhrases: string[]
} {
  const v = t.variants?.find(x => x.id === variantId) ?? t.variants?.[0]
  return {
    id: v?.id ?? null,
    title: v?.title ?? t.title,
    bodyLines: v?.bodyLines ?? t.bodyLines,
    linkKinds: v?.linkKinds ?? t.linkKinds ?? ['issues'],
    highlightPhrases: v?.highlightPhrases ?? t.highlightPhrases ?? [],
  }
}

// A target for an in-body link occurrence. `highlight` renders it amber to flag
// a link the user must edit manually (e.g. the model link).
export interface BodyLink { href?: string; highlight?: boolean }
export interface BodySegment { text: string; link?: BodyLink }

// Splits editable body text into renderable lines, tagging two kinds of markers:
//  • Each occurrence of the link phrase is mapped, in order, to the matching
//    `links` entry (1st phrase → links[0], 2nd → links[1], …; extras reuse the last).
//  • Each `highlightPhrase` becomes an amber, non-link span (fill-in placeholders).
// At each position the earliest-matching marker wins.
export function segmentBodyText(
  bodyText: string,
  links: BodyLink[],
  highlightPhrases: string[] = [],
): BodySegment[][] {
  let linkIdx = 0
  return bodyText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const segs: BodySegment[] = []
      let rest = line
      while (rest.length) {
        const candidates: { pos: number; phrase: string; kind: 'link' | 'highlight' }[] = []
        const linkPos = rest.indexOf(ACC_LINK_PHRASE)
        if (linkPos !== -1) candidates.push({ pos: linkPos, phrase: ACC_LINK_PHRASE, kind: 'link' })
        for (const hp of highlightPhrases) {
          if (!hp) continue
          const pos = rest.indexOf(hp)
          if (pos !== -1) candidates.push({ pos, phrase: hp, kind: 'highlight' })
        }
        if (candidates.length === 0) { segs.push({ text: rest }); break }
        const { pos, phrase, kind } = candidates.reduce((a, b) => (b.pos < a.pos ? b : a))
        if (pos > 0) segs.push({ text: rest.slice(0, pos) })
        if (kind === 'link') {
          segs.push({ text: phrase, link: links.length ? links[Math.min(linkIdx, links.length - 1)] : undefined })
          linkIdx++
        } else {
          segs.push({ text: phrase, link: { highlight: true } })
        }
        rest = rest.slice(pos + phrase.length)
      }
      return segs
    })
}

// Match a template's hints against a list of real values (case-insensitive substring).
export function matchHints(hints: string[], values: string[]): string[] {
  const lowered = hints.map(h => h.toLowerCase())
  return values.filter(v => {
    const lv = v.toLowerCase()
    return lowered.some(h => lv.includes(h) || h.includes(lv))
  })
}
