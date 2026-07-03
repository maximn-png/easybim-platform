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
}

const MAP: Record<string, AgentPresentation> = {
  peacock: {
    emoji: '🦚',
    accent: '#7c3aed',
    tagline: 'LinkedIn & content',
    why: "Core trait: presence & shine. A peacock knows how to show up, stand out, and draw the eye — exactly the marketing brief: make EasyBIM impossible to scroll past, and turn every post into an event.",
    hasChat: true,
    howItWorks: {
      title: 'How Peacock works',
      steps: [
        { icon: 'PenLine', label: 'Peacock drafts', sub: '2 posts / week', who: 'agent' },
        { icon: 'Bell', label: 'Pending Approval', sub: 'tagged to you', who: 'agent' },
        { icon: 'Hand', label: 'You decide', sub: 'approve or revise', who: 'you' },
        { icon: 'ImageIcon', label: 'Branded image', sub: 'on approval', who: 'agent' },
        { icon: 'CheckCircle2', label: 'Ready to Publish', sub: 'finished package', who: 'agent' },
      ],
      roleNote:
        'Your role: approve a draft you like, or reply on its Monday update with feedback and set it to Revise — Peacock rewrites it.',
      teachNote:
        'Teach it: tell Peacock your preferences in the chat below (e.g. “keep posts shorter”) and it remembers them for future posts.',
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
      title: 'How Squirrel works',
      steps: [
        { icon: 'Search', label: 'New Type-C item', sub: 'סוג פרויקט C + מספר הצעה', who: 'agent' },
        { icon: 'FolderPlus', label: 'Builds folders', sub: 'client / quote-project', who: 'agent' },
        { icon: 'FileSpreadsheet', label: 'Copies template', sub: '📄 menu ready', who: 'agent' },
        { icon: 'Download', label: 'Collects materials', sub: 'from Monday', who: 'agent' },
        { icon: 'ListChecks', label: 'Proposes scope', sub: 'for your review', who: 'agent' },
        { icon: 'Hand', label: 'You finish & send', sub: '📄 / 📧 menus', who: 'you' },
      ],
      roleNote:
        'Your role: review the proposed scope, fill/adjust the ToQuote sheet, then build the quote doc and send it with the in-document 📄 / 📧 menus.',
      teachNote:
        'Teach it: tell Squirrel preferences in the chat below (e.g. which folder a client lives under) and it remembers them.',
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
