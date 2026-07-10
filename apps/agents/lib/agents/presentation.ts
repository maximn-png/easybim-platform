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

/** Hebrew About-tab content: short intro + what runs automatically vs. what chat can do. */
export interface AgentAbout {
  intro: string
  autoTitle: string
  autoItems: string[]
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
    howItWorks: {
      title: 'איך טווס עובד',
      rtl: true,
      steps: [
        { icon: 'PenLine', label: 'כותב טיוטה', sub: '2 פוסטים בשבוע', who: 'agent' },
        { icon: 'Bell', label: 'ממתין לאישור', sub: 'מתייג אתכם במאנדיי', who: 'agent' },
        { icon: 'Hand', label: 'אתם מחליטים', sub: 'לאשר או לבקש שינוי', who: 'you' },
        { icon: 'ImageIcon', label: 'תמונה ממותגת', sub: 'אחרי האישור', who: 'agent' },
        { icon: 'CheckCircle2', label: 'מוכן לפרסום', sub: 'חבילה מלאה', who: 'agent' },
      ],
    },
    about: {
      intro:
        'טווס הוא סוכן השיווק של EasyBIM — כותב טיוטות פוסטים ללינקדאין, מעביר אותן לאישורכם במאנדיי, ומכין תמונה ממותגת לכל פוסט שאושר.',
      autoTitle: 'מה טווס עושה אוטומטית',
      autoItems: [
        'כותב שתי טיוטות פוסטים בשבוע ומעלה אותן ללוח התוכן במאנדיי בסטטוס Pending Approval.',
        'מתייג אתכם על כל טיוטה חדשה כדי שתאשרו או תבקשו שינוי.',
        'כשמאשרים טיוטה — מייצר לה תמונה ממותגת ומעביר את הפוסט ל-Ready to Publish.',
        'כשמסמנים Revise עם הערות — כותב את הטיוטה מחדש לפי הפידבק.',
      ],
      chatTitle: 'מה אפשר לעשות בצ׳אט',
      chatItems: [
        'לבקש ממנו לכתוב עכשיו טיוטה לרעיון שהוספתם ללוח.',
        'לשאול מה הוא עשה בריצות האחרונות.',
        'לתת לו העדפות קבועות (למשל "פוסטים קצרים יותר") — הוא זוכר אותן לפוסטים הבאים, ואפשר לראות אותן בלשונית Improvements.',
      ],
    },
    chat: {
      title: 'Chat with Peacock',
      subtitle: 'Ask questions · give feedback it remembers · ask it to draft an item now (→ Pending Approval)',
      placeholder: 'Message Peacock…',
      emptyTitle: 'Ask Peacock anything',
      emptyHint: 'or give it a preference to remember',
      thinking: 'Peacock is thinking…',
      suggestions: ['מה עשית בריצה האחרונה?', 'תקצר את הפוסטים לעתיד', 'פתח עכשיו את הרעיון שהוספתי ללוח'],
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
        { icon: 'FolderPlus', label: 'מקים תיקיות בדרייב', sub: 'לקוח ← הצעה', who: 'agent' },
        { icon: 'FileSpreadsheet', label: 'מעתיק את התבנית', sub: 'גיליון הצעה מוכן', who: 'agent' },
        { icon: 'Download', label: 'אוסף חומרים', sub: 'מהעדכונים במאנדיי', who: 'agent' },
        { icon: 'ListChecks', label: 'מציע היקף עבודה', sub: 'לבדיקה שלכם', who: 'agent' },
        { icon: 'Hand', label: 'אתם מסיימים ושולחים', sub: 'תפריטי 📄 / 📧 במסמך', who: 'you' },
      ],
    },
    about: {
      intro:
        'סנאי הוא הסוכן של הצעות המחיר — ברגע שנפתחת בקשה חדשה במאנדיי הוא מכין לבד את כל התשתית לעבודה, ועוקב אחרי כל ההצעות במקום אחד.',
      autoTitle: 'מה סנאי עושה אוטומטית',
      autoItems: [
        'מזהה כל פריט חדש מסוג C (עם מספר הצעה) בלוח הצעות המחיר במאנדיי.',
        'מקים בדרייב את תיקיית הלקוח ותיקיית ההצעה, ומעתיק לתוכה את תבנית ההצעה.',
        'אוסף את החומרים שהתקבלו מהלקוח ומרכז אותם בתיקיית הפרויקט.',
        'כותב את כל הקישורים חזרה לפריט במאנדיי ומציע היקף עבודה ראשוני.',
        'מתחזק אינדקס מעודכן של כל ההצעות — לקוח, מחיר, שטח, סטטוס ותאריכים — לשאלות והשוואות.',
      ],
      chatTitle: 'מה אפשר לעשות בצ׳אט',
      chatItems: [
        'לשאול איפה עומדת הצעה: "מה קורה עם ההצעה של…?"',
        'להשוות ולנתח הצעות — מחירים, שטחים, מחיר למ"ר — לפי לקוח, סוג שימוש או תקופה.',
        'לבקש הקמת פרויקט ידנית לפריט מסוים.',
        'ללמד אותו הנחיות קבועות (למשל "לקוח X יושב בתיקייה Y") — הוא זוכר אותן, והן מופיעות בלשונית Improvements.',
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
