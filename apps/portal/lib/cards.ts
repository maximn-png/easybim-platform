import { Newspaper, Database, BookOpen, Crown, type LucideIcon } from 'lucide-react'

// Single source of truth for the platform's app cards.
// `id` doubles as the access grant key stored in Clerk publicMetadata.apps
// and checked by each app's proxy.ts — keep ids stable once granted.
export interface AppCard {
  id: string
  title: string
  description: string
  icon: LucideIcon
  href: string
  status: 'live' | 'coming-soon'
  color: string
}

export const CARDS: AppCard[] = [
  {
    id: 'newsletter',
    title: 'Newsletter Generator',
    description:
      'Generate AI-powered BIM industry newsletters from 21 RSS sources using Google Gemini. Ready to send in under a minute.',
    icon: Newspaper,
    href: process.env.NEXT_PUBLIC_NEWSLETTER_URL || '#',
    status: 'live',
    color: '#1e248c',
  },
  {
    id: 'epm',
    title: 'EasyBIM Projects',
    description:
      'Track, manage, and collaborate on BIM projects in one place. Built around the EasyBIM team\'s workflow.',
    icon: Database,
    href: process.env.NEXT_PUBLIC_EPM_URL || '#',
    status: 'live',
    color: '#44b8d3',
  },
  {
    id: 'knowledge',
    title: 'EasyBIM Knowledge Center',
    description:
      'Your central hub for EasyBIM standards, BIM guides, templates, and best practices — find the right workflow and answer in seconds.',
    icon: BookOpen,
    href: '#',
    status: 'coming-soon',
    color: '#818cf8',
  },
  {
    id: 'agents',
    title: 'EasyBIM Agents Kingdom',
    description:
      'Autonomous agents that run your workflows. Peacock drafts and routes weekly LinkedIn posts through Monday — you just approve.',
    icon: Crown,
    href: process.env.NEXT_PUBLIC_AGENTS_URL || '#',
    // Only advertise as Live when the agents URL is actually configured for this
    // environment — otherwise show "coming soon" instead of a dead `#` link.
    status: process.env.NEXT_PUBLIC_AGENTS_URL ? 'live' : 'coming-soon',
    color: '#7c3aed',
  },
]
