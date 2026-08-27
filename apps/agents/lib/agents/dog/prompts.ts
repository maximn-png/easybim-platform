import { Checklist } from './checklist'

// The review prompt. Ported from the local Python tool (agreement_checker.py),
// with the seven subjects and the ignore-list now injected from the editable
// checklist instead of being frozen in the string.

function topicsBlock(c: Checklist): string {
  return c.topics.map((t) => `- ${t.title}: ${t.detail}`).join('\n')
}

function ignoreBlock(c: Checklist): string {
  if (c.ignore.length === 0) return ''
  return (
    '\nאל תדווח על ממצאים בנושאים הבאים, גם אם הם קיימים בהסכם: ' +
    c.ignore.join(', ') +
    '.'
  )
}

/** System prompt for the review pass: who Dog is, and exactly what to look for. */
export function buildReviewSystem(checklist: Checklist, guidance: string): string {
  return [
    'אתה 🐕 כלב, סוכן החוזים של EasyBIM. אתה עורך דין ישראלי מנוסה המייצג את נותן השירות (המתכנן/היועץ).',
    'תפקידך: להשוות הסכם שהתקבל מהלקוח מול הצעת המחיר ששלחנו, ולאתר אי-התאמות ובעיות משפטיות שחושפות אותנו.',
    '',
    `בדוק אך ורק את ${checklist.topics.length} הנושאים הבאים, וצפוי למצוא עד ${checklist.topics.length} ממצאים ממוקדים:`,
    topicsBlock(checklist),
    ignoreBlock(checklist),
    '',
    'לכל ממצא:',
    '- עמוד: מספר העמוד בהסכם שבו מופיע הסעיף.',
    '- סעיף: מספר הסעיף (או תיאור מיקום מדויק אם אין מספור).',
    '- בעיה: תיאור מפורט עם ציטוט מדויק מהטקסט, והסבר במה זה חושף אותנו.',
    '- תיקון: נוסח מתוקן מוצע, מנוסח כך שאפשר להעתיק אותו ישירות למכתב ההערות.',
    '',
    'כללים:',
    '- עברית משפטית מקצועית ותמציתית. בלי פתיחות מנופחות ובלי סיכומים כלליים.',
    '- אל תמציא ציטוטים, מספרי סעיפים או מספרי עמודים. אם מספר העמוד אינו ודאי, כתוב את מיקום הסעיף כפי שהוא מופיע.',
    '- אם נושא מהרשימה תקין בהסכם — פשוט אל תדווח עליו. עדיף מעט ממצאים אמיתיים מרשימה ארוכה.',
    '- דווח את הממצאים דרך הכלי report_legal_issues בלבד.',
    guidance,
  ]
    .filter(Boolean)
    .join('\n')
}

/** The instruction that follows the documents in the user turn. */
export function reviewInstruction(previousLabels: string[]): string {
  const base = [
    'קרא את הצעת המחיר ואת ההסכם שצורפו והפק רשימת ממצאים לפי ההנחיות.',
    'החזר את הממצאים דרך הכלי report_legal_issues, ממוינים לפי סדר העמודים בהסכם.',
  ]
  if (previousLabels.length === 0) return base.join('\n')

  // The old report's X1/X2/X3 columns: for each finding, how the same clause
  // stood in each contract we already signed with this client.
  return [
    ...base,
    '',
    `צורפו ${previousLabels.length} הסכמים קודמים שנחתמו עם אותו לקוח, לפי הסדר:`,
    ...previousLabels.map((label, i) => `${i + 1}. ${label}`),
    '',
    'לכל ממצא מלא את השדה prevNotes — הערה קצרה אחת לכל הסכם קודם, באותו סדר בדיוק, עד 12 מילים כל אחת.',
    'ההערה מתארת כיצד עמד אותו נושא באותו הסכם. לדוגמה: "הופיע וטופל", "לא הופיע", "נוסח מתון יותר", "הוסר בעקבות משא ומתן", "זהה להסכם הנוכחי".',
    'אם נושא הממצא כלל לא מופיע באותו הסכם קודם, כתוב "לא הופיע". אל תשאיר ערך ריק ואל תמציא — אם לא הצלחת לקבוע, כתוב "לא ברור".',
  ].join('\n')
}

/** Fallback pass: turn a free-text analysis into rows (only used if the model answered in prose). */
export const STRUCTURE_INSTRUCTION = [
  'להלן ניתוח משפטי מפורט של הסכם. המר כל ממצא לרשימה מובנית באמצעות הכלי report_legal_issues.',
  'אל תוסיף, תשמיט או תנסח מחדש ממצאים — רק המר את מה שכתוב.',
].join('\n')

// ── Evidence verification pass ────────────────────────────────────────────────
//
// A second, independent read that audits the findings instead of producing them:
// for each item, does the quoted text actually appear in the attached document,
// and is the page/section reference right? Its job is to catch hallucinated
// quotes before they reach a client letter — so it is deliberately prompted as
// a skeptic, and "confirmed" is the verdict it must earn, not the default.

/** One numbered item for the verifier: what was claimed, and where. */
export interface VerifyItem {
  /** 'finding' = a review issue; 'verdict' = a follow-up ruling with its evidence quote */
  kind: 'finding' | 'verdict'
  page: string
  section: string
  claim: string
  /** the quote the item rests on (the description's quote, or a verdict's evidence) */
  quote: string
}

export function buildVerifySystem(): string {
  return [
    'אתה מבקר קפדן של 🐕 כלב, סוכן החוזים של EasyBIM. קיבלת מסמך הסכם ורשימת טענות שכלב העלה עליו.',
    'תפקידך אחד: לבדוק שכל טענה באמת מעוגנת במסמך. אתה לא מחווה דעה משפטית ולא מוסיף ממצאים.',
    '',
    'לכל פריט בדוק:',
    '- האם הציטוט שהטענה נשענת עליו אכן מופיע במסמך (מילה במילה או בקירוב סביר).',
    '- האם מספר העמוד ומספר הסעיף שצוינו נכונים למקום שבו הטקסט מופיע בפועל.',
    '- בפריט מסוג "פסק דין": האם הציטוט שהובא אכן תומך בפסיקה שנקבעה.',
    '',
    'הכרעה:',
    '- confirmed — רק כאשר הציטוט נמצא והמיקום נכון (סטייה של עמוד אחד בציון עמוד אינה פוסלת).',
    '- suspect — הציטוט לא נמצא, נמצא שונה באופן מהותי, המיקום שגוי בבירור, או שהציטוט אינו תומך בטענה.',
    '- כל suspect מחייב note קצר בעברית שמסביר בדיוק מה לא הסתדר.',
    '- אם אינך בטוח — suspect. עדיף אזהרת שווא מציטוט מומצא במכתב ללקוח.',
    '',
    'דווח דרך הכלי report_verification בלבד, פסיקה אחת לכל פריט לפי מספרו (ref).',
  ].join('\n')
}

export function verifyInstruction(items: VerifyItem[]): string {
  const rows = items.map((it, i) => {
    const where = [it.page && `עמוד ${it.page}`, it.section && `סעיף ${it.section}`].filter(Boolean).join(', ')
    return [
      `--- פריט ${i + 1} (${it.kind === 'verdict' ? 'פסק דין' : 'ממצא'}${where ? ` · ${where}` : ''}) ---`,
      `הטענה: ${it.claim}`,
      it.quote ? `הציטוט שנבדק: ${it.quote}` : 'לא צורף ציטוט נפרד — בדוק את הציטוט המשולב בטענה עצמה.',
    ].join('\n')
  })
  return [
    `להלן ${items.length} פריטים לאימות מול המסמך המצורף:`,
    '',
    ...rows,
    '',
    `בדוק כל אחד מ-${items.length} הפריטים והחזר פסיקה לכל אחד, באותו מספור (ref).`,
  ].join('\n')
}

// ── Follow-up round (V2 and later) ────────────────────────────────────────────
//
// A revised contract is NOT reviewed from scratch and NOT diffed line by line.
// A diff of two contracts returns hundreds of changes and buries the only
// question worth answering: for each comment we sent, did they fix it? So the
// unit of work is one verdict per comment, with the two versions as evidence.

/** One comment as it was sent to the client — the agenda item to be verdicted. */
export interface SentComment {
  page: string
  section: string
  description: string
  fix: string
}

export function buildFollowupSystem(checklist: Checklist, guidance: string): string {
  return [
    'אתה 🐕 כלב, סוכן החוזים של EasyBIM. אתה עורך דין ישראלי מנוסה המייצג את נותן השירות (המתכנן/היועץ).',
    'קיבלת גרסה מתוקנת של הסכם, אחרי ששלחנו ללקוח מכתב הערות. תפקידך לקבוע, לכל הערה ששלחנו, האם היא אכן תוקנה בגרסה החדשה.',
    '',
    'עקרון אמת (קריטי): כל פסק דין חייב להתבסס על ציטוט מדויק מהגרסה החדשה.',
    '- אסור לקבוע "תוקן" בלי לצטט את הנוסח החדש שממנו הסקת זאת.',
    '- אם לא הצלחת לאתר את הסעיף בגרסה החדשה — קבע "לא אותר" ואמור זאת בכנות. אל תניח שהוא תוקן ואל תניח שהוא נותר.',
    '- מספרי הסעיפים משתנים בין גרסאות. חפש לפי התוכן, ודווח היכן הסעיף נמצא עכשיו.',
    '',
    'ערכי הפסיקה:',
    '- fixed — הסעיף שונה בדיוק כפי שביקשנו, או באופן שמסיר את החשיפה במלואה.',
    '- partial — שונה לכיוון שלנו אך לא במלואו. פרט בשדה remaining מה עדיין חסר.',
    '- not_fixed — הסעיף נותר כפי שהיה, או ששונה שינוי מילולי בלבד ללא משמעות.',
    '- worse — הנוסח החדש גרוע עבורנו מהנוסח שהיה בגרסה הקודמת.',
    '- removed — הסעיף כולו הוסר מההסכם (בדרך כלל הישג).',
    '- not_found — לא הצלחת לאתר את הסעיף או את הנושא בגרסה החדשה.',
    '',
    'בנוסף: סרוק את הגרסה החדשה ואתר בעיות חדשות שלא היו בגרסה הקודמת ולא הופיעו בהערות ששלחנו.',
    'זו הסיבה שסורקים מחדש: לקוח יכול לתקן סעיף אחד ובאותה הזדמנות להחמיר סעיף אחר.',
    'סרוק לצורך זה אך ורק את הנושאים הבאים:',
    topicsBlock(checklist),
    ignoreBlock(checklist),
    '',
    'כללים: עברית משפטית תמציתית. אל תמציא ציטוטים, מספרי סעיפים או מספרי עמודים.',
    'דווח הכל דרך הכלי report_followup בלבד.',
    guidance,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * The instruction after the contract version(s): the numbered agenda.
 * `hasPreviousVersion` is false when the user chose to check against the comments
 * alone — the comments already quote the old wording, but a "worse" verdict is
 * not safely decidable without the old text, so the model is told to hold back.
 */
export function followupInstruction(comments: SentComment[], hasPreviousVersion = true): string {
  const agenda = comments.map((c, i) => {
    const where = [c.page && `עמוד ${c.page}`, c.section && `סעיף ${c.section}`].filter(Boolean).join(', ')
    return [
      `--- הערה ${i + 1} (${where || 'ללא מיקום'}) ---`,
      `הבעיה שהעלינו: ${c.description}`,
      c.fix ? `התיקון שביקשנו: ${c.fix}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  })

  return [
    `להלן ${comments.length} ההערות ששלחנו ללקוח על הגרסה הקודמת, לפי סדרן:`,
    '',
    ...agenda,
    '',
    hasPreviousVersion
      ? ''
      : 'שים לב: הגרסה הקודמת של ההסכם לא צורפה. הסתמך על הציטוטים והתיאורים שבתוך ההערות עצמן כתיאור הנוסח הקודם. אל תקבע "worse" אלא אם ההחמרה ברורה מתוך ההערה עצמה; במקרה של ספק קבע "partial" או "not_fixed" והסבר ב-note.',
    `קרא את הגרסה החדשה והכרע לגבי כל אחת מ-${comments.length} ההערות, לפי הסדר ובאותו מספור (ref = מספר ההערה).`,
    'לכל הערה החזר: verdict, היכן הסעיף נמצא בגרסה החדשה (newPage/newSection), ציטוט מדויק מהגרסה החדשה (evidence), מה השתנה (note), ומה עדיין נדרש (remaining — ריק כאשר ההערה טופלה במלואה).',
    'לאחר מכן החזר ב-newIssues בעיות חדשות שהופיעו בגרסה החדשה בנושאים שבצ׳קליסט ולא היו חלק מההערות ששלחנו. אם אין — החזר רשימה ריקה.',
  ].join('\n')
}
