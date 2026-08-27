'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  ChevronRight, Boxes, GitMerge, HeartPulse, SpellCheck2, Library, Network,
  CalendarClock, Users, Grid3x3, TrendingDown, MessagesSquare, Stamp,
  CircleDot, ListChecks,
} from 'lucide-react'

export type ConsoleKey = 'bim' | 'mep'

interface ConsoleProject {
  _id: string
  projectName: string
  projectNumber: string
}

interface DemoCard {
  icon: LucideIcon
  title: string
  description: string
}

interface ConsoleConfig {
  title: string
  icon: LucideIcon
  tagline: string
  cards: DemoCard[]
}

// Demo modules — placeholders for what the team will develop next. Each card
// is intentionally non-interactive until its module ships.
const CONSOLES: Record<ConsoleKey, ConsoleConfig> = {
  bim: {
    title: 'BIM Management Console',
    icon: Boxes,
    tagline: 'Model governance and standards for the project, in one place.',
    cards: [
      {
        icon: HeartPulse,
        title: 'Model Health',
        description: 'Revit warnings, file size and sync-time trends per model.',
      },
      {
        icon: SpellCheck2,
        title: 'Naming & Standards Audit',
        description: 'Automated checks against the EasyBIM naming convention.',
      },
      {
        icon: Library,
        title: 'Family Library',
        description: 'Approved families and content catalog with version tracking.',
      },
      {
        icon: Network,
        title: 'Worksets & Links Map',
        description: 'Worksets, linked models and their load states across the project.',
      },
      {
        icon: CalendarClock,
        title: 'Publish Schedule',
        description: 'Model publish / sync cadence and last-published status.',
      },
      {
        icon: Users,
        title: 'BEP & Responsibility Matrix',
        description: 'BIM Execution Plan tasks and per-discipline ownership.',
      },
    ],
  },
  mep: {
    title: 'MEP Coordination Console',
    icon: GitMerge,
    tagline: 'Clash resolution and coordination progress across disciplines.',
    cards: [
      {
        icon: Grid3x3,
        title: 'Clash Matrix',
        description: 'Discipline-vs-discipline clash counts from Navisworks / ACC.',
      },
      {
        icon: TrendingDown,
        title: 'Clash Trends',
        description: 'Open / closed clash burndown over time.',
      },
      {
        icon: MessagesSquare,
        title: 'Coordination Meetings',
        description: 'Meeting log, decisions and action items.',
      },
      {
        icon: Stamp,
        title: 'Zone Sign-off Tracker',
        description: 'Per-level / zone coordination approval status.',
      },
      {
        icon: CircleDot,
        title: 'Openings & Sleeves',
        description: 'Opening requests between MEP and structure.',
      },
      {
        icon: ListChecks,
        title: 'Systems Checklist',
        description: 'Completeness of MEP systems modeling per discipline.',
      },
    ],
  },
}

export default function ProjectConsoleClient({
  project,
  console: consoleKey,
}: {
  project: ConsoleProject
  console: ConsoleKey
}) {
  const config = CONSOLES[consoleKey]
  const TitleIcon = config.icon

  return (
    <div
      className="min-h-[calc(100vh-4rem)]"
      style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}
    >
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-5 flex flex-col gap-4">
        <nav className="flex items-center gap-1 text-xs text-gray-500">
          <Link href="/dashboard" className="hover:text-[#1e248c]">Dashboard</Link>
          <ChevronRight size={12} />
          <Link href="/dashboard" className="hover:text-[#1e248c]">EPM</Link>
          <ChevronRight size={12} />
          <Link href={`/dashboard/${project._id}`} className="hover:text-[#1e248c]" dir="rtl">
            {project.projectName}
          </Link>
          <ChevronRight size={12} />
          <span className="text-[#1e248c] font-medium">{config.title}</span>
        </nav>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-[#1e248c] text-white grid place-items-center shrink-0">
            <TitleIcon size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-[#1e248c] leading-tight">{config.title}</h1>
              <span className="text-xs font-mono text-[#44b8d3] uppercase tracking-widest">
                {project.projectNumber}
              </span>
              <span className="text-sm font-semibold text-[#1e248c]/70" dir="rtl">
                {project.projectName}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{config.tagline}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {config.cards.map(card => {
            const CardIcon = card.icon
            return (
              <div
                key={card.title}
                className="glass-card rounded-2xl p-5 border border-[#1e248c]/10 flex flex-col gap-3 transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="w-9 h-9 rounded-full bg-[#e7eefe] grid place-items-center shrink-0">
                    <CardIcon size={16} className="text-[#1e248c]" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[#44b8d3] bg-[#44b8d3]/10 px-2 py-0.5 rounded-full">
                    In development
                  </span>
                </div>
                <div>
                  <p className="text-sm font-bold text-[#1e248c]">{card.title}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{card.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
