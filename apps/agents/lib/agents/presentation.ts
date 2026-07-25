// UI-only metadata for agents (emoji, accent color, tagline, how-it-works strip,
// chat copy). Keeps the core AgentDefinition logic-only; the Kingdom page and
// dashboards render from here so adding an animal needs no component edits.

/** icon key resolved against the ICONS map in HowItWorks.tsx */
export interface HowItWorksStep {
  icon: string
  label: string
  sub: string
  who: 'agent' | 'you'
}

export interface HowItWorks {
  title: string
  steps: HowItWorksStep[]
  roleNote?: string
  teachNote?: string
  /** render the strip right-to-left (Hebrew) */
  rtl?: boolean
}

/** Hebrew About-tab content: short intro + why-this-animal + auto / user / chat sections. */
export interface AgentAbout {
  intro: string
  /** 1-2 sentences: why this animal was chosen for the job */
  why: string
  autoTitle: string
  autoItems: string[]
  userTitle: string
  userItems: string[]
  chatTitle: string
  chatItems: string[]
}

export interface ChatCopy {
  title: string
  subtitle: string
  placeholder: string
  emptyTitle: string
  emptyHint: string
  thinking: string
  suggestions: string[]
}

export interface AgentPresentation {
  emoji: string
  accent: string
  tagline: string
  /** Short "why this animal" note connecting the agent's job to the animal's trait. */
  why?: string
  hasChat?: boolean
  /** render a full dashboard as the agent's landing (chat/about become overlays) */
  hasDashboard?: boolean
  howItWorks?: HowItWorks
  chat?: ChatCopy
  about?: AgentAbout
}

const MAP: Record<string, AgentPresentation> = {
  peacock: {
    emoji: '🦚',
    accent: '#7c3aed',
    tagline: 'LinkedIn & content',
    why: "Core trait: presence & shine. A peacock knows how to show up, stand out, and draw the eye — exactly the marketing brief: make EasyBIM impossible to scroll past, and turn every post into an event.",
    hasChat: true,
    hasDashboard: true,
    howItWorks: {
      title: 'איך טווס עובד',
      rtl: true,
      steps: [
        { icon: 'PenLine', label: 'כותב טיוטה', sub: '2 פוסטים בשבוע', who: 'agent' },
        { icon: 'Bell', label: 'ממתין לסקירה', sub: 'בדשבורד', who: 'agent' },
        { icon: 'Hand', label: 'אתם מחליטים', sub: 'לאשר או לבקש שינוי', who: 'you' },
        { icon: 'ImageIcon', label: 'תמונה ממותגת', sub: 'לפי בקשה', who: 'agent' },
        { icon: 'CheckCircle2', label: 'מוכן לפרסום', sub: 'אתם מפרסמים בלינקדאין', who: 'you' },
      ],
    },
    about: {
      intro:
        'טווס הוא סוכן השיווק של EasyBIM — כותב טיוטות פוסטים ללינקדאין, מנהל את תוכנית התוכן בדשבורד, ומכין תמונה ממותגת לכל פוסט לפי בקשה.',
      why:
        'הטווס יודע להופיע, לבלוט ולמשוך את העין — בדיוק התפקיד של סוכן השיווק: לגרום ל-EasyBIM לבלוט בפיד ולהפוך כל פוסט לאירוע.',
      autoTitle: 'מה טווס עושה אוטומטית',
      autoItems: [
        'כותב שתי טיוטות פוסטים בשבוע ומוסיף אותן לתוכנית התוכן בסטטוס "ready" (מוכן לסקירה).',
        'מושך חומר אמיתי מהדרייב (תיקיות פרויקטים + נכסים שיווקיים) לפוסטים מסוג Project.',
        'מייצר תמונה ממותגת לפוסט לפי בקשה ושומר אותה בדרייב.',
        'משכתב טיוטות לפי הפידבק שלכם בצ׳אט.',
      ],
      userTitle: 'מה אתם עושים',
      userItems: [
        'סוקרים את תוכנית התוכן בדשבורד — מאשרים, עורכים, או מבקשים שינוי בצ׳אט.',
        'מפרסמים בלינקדאין את הפוסט המוכן (טקסט + תמונה) בעצמכם.',
      ],
      chatTitle: 'מה אפשר לעשות בצ׳אט',
      chatItems: [
        'לבקש ממנו לתכנן או לכתוב עכשיו טיוטה חדשה.',
        'לשאול מה הוא עשה בריצות האחרונות.',
        'לתת לו העדפות קבועות (למשל "פוסטים קצרים יותר") — הוא זוכר אותן לפוסטים הבאים, ואפשר לראות אותן בלשונית Improvements.',
      ],
    },
    chat: {
      title: 'Chat with Peacock',
      subtitle: 'Ask questions · give feedback it remembers · plan and draft posts',
      placeholder: 'Message Peacock…',
      emptyTitle: 'Ask Peacock anything',
      emptyHint: 'or give it a preference to remember',
      thinking: 'Peacock is thinking…',
      suggestions: ['מה עשית בריצה האחרונה?', 'תקצר את הפוסטים לעתיד', 'תכנן לי פוסט חדש לשבוע'],
    },
  },

  squirrel: {
    emoji: '🐿️',
    accent: '#b45309',
    tagline: 'Price quotes',
    why: 'Core trait: finding & collecting. A squirrel is always finding nuts and stashing them in the right spot — Squirrel spots every new price-quote request and collects the whole package (folders, template, client materials, links) in one place, ready to work.',
    hasChat: true,
    howItWorks: {
      title: 'איך סנאי עובד',
      rtl: true,
      steps: [
        { icon: 'Search', label: 'פריט חדש במאנדיי', sub: 'סוג C + מספר הצעה', who: 'agent' },
        { icon: 'FolderPlus', label: 'תיקיית פרויקט בדרייב', sub: '3 תיקיות + תבנית', who: 'agent' },
        { icon: 'Download', label: 'אוסף את הקבצים', sub: 'מהפריט במאנדיי', who: 'agent' },
        { icon: 'FileSpreadsheet', label: 'קישורים למאנדיי', sub: 'גיליון + תיקייה', who: 'agent' },
        { icon: 'ListChecks', label: 'מציע היקף עבודה', sub: 'עדכון עם תיוג', who: 'agent' },
        { icon: 'Hand', label: 'אתם ממלאים ושולחים', sub: 'ToQuote + תפריטי 📄 / 📧', who: 'you' },
      ],
    },
    about: {
      intro:
        'סנאי הוא הסוכן של הצעות המחיר — ברגע שנפתחת בקשה חדשה במאנדיי הוא מכין לבד את כל התשתית לעבודה, ועוקב אחרי כל ההצעות במקום אחד.',
      why:
        'כמו שסנאי אוסף אגוזים ומאחסן אותם מסודרים במקום בטוח — הסוכן אוסף כל בקשת הצעה חדשה על כל החומרים שלה, ומסדר הכל במקום אחד כך ששום דבר לא הולך לאיבוד.',
      autoTitle: 'מה סנאי עושה אוטומטית',
      autoItems: [
        'מתעורר ברגע שנוסף ללוח הצעות המחיר במאנדיי פריט מסוג C עם מספר הצעה.',
        'יוצר בדרייב את תיקיית הפרויקט ("מספר הצעה - שם הפרויקט") עם שלוש תיקיות: הצעות מחיר, חוזה, וחומר שהתקבל מהמזמין.',
        'מעתיק לתיקייה את גיליון התבנית "TYPE C - תכנון עבודה".',
        'מוריד את הקבצים שצורפו לפריט במאנדיי לתיקיית "חומר שהתקבל מהמזמין".',
        'כותב את קישורי הגיליון והתיקייה חזרה לפריט במאנדיי.',
        'קורא את החומר שהתקבל ומציע היקף עבודה ראשוני כעדכון במאנדיי — הוא לא ממלא את הגיליון בעצמו.',
        'מעדכן באופן קבוע אינדקס של כל ההצעות (לקוח, מחיר, שטח, סטטוס) — הבסיס לשאלות ולהשוואות בצ׳אט.',
      ],
      userTitle: 'מה אתם עושים',
      userItems: [
        'עוברים על הצעת ההיקף שסנאי כתב בעדכון במאנדיי.',
        'ממלאים ומתאימים את גיליון התכנון (ToQuote) לפי הצורך.',
        'מפיקים את מסמך ההצעה מתפריט 📄 שבתוך הגיליון, ושולחים ללקוח מתפריט 📧.',
      ],
      chatTitle: 'מה אפשר לעשות בצ׳אט',
      chatItems: [
        'לשאול איפה עומדת הצעה: "מה קורה עם ההצעה של…?"',
        'להשוות ולנתח הצעות — מחירים, שטחים, מחיר למ"ר — לפי לקוח, סוג שימוש או תקופה.',
        'לבקש הקמת פרויקט ידנית לפריט מסוים.',
        'ללמד אותו הנחיות קבועות (למשל "תמיד תתייג גם את X") — הוא זוכר אותן, והן מופיעות בלשונית Improvements.',
      ],
    },
    chat: {
      title: 'Chat with Squirrel',
      subtitle: 'Compare & analyze quotes · ask where one stands · set up a project · give preferences it remembers',
      placeholder: 'Message Squirrel…',
      emptyTitle: 'Ask Squirrel anything',
      emptyHint: 'or ask it to set up a project',
      thinking: 'Squirrel is thinking…',
      suggestions: ['השווה את ההצעות של לקוח מסוים', 'מה המחיר הממוצע למ"ר לפי סוג שימוש?', 'השווה שטחים של פרויקטים', 'רענן את האינדקס'],
    },
  },
}

const FALLBACK: AgentPresentation = { emoji: '🐾', accent: '#44b8d3', tagline: 'Agent' }

export function getPresentation(key: string): AgentPresentation {
  return MAP[key] ?? FALLBACK
}
