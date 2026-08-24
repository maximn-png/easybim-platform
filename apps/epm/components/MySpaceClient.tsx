'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  BookOpen, CalendarCheck2, ChevronRight, Clock3, Cloud, ExternalLink, FolderKanban, FolderOpen, LayoutGrid, ListTodo,
} from 'lucide-react'
import type { MeAgenda, MeOverview, TimeEntryDTO } from '@/lib/meTypes'
import type { ProjectRow } from '@/lib/types'
import ProgressBar from './ProgressBar'
import TeamMemberCell from './TeamMemberCell'

/* My Space hub: one viewport-locked page.
   Left → right: My tasks (all boards, overdue + this month), My milestones
   (MI-001, this month, RTL), My projects (EPM-style table, RTL). */

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'http://localhost:3000'

function toYMD(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const fmtDay = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// Milestone/task status → chip colors (Monday status labels).
function statusChip(status: string | null): string {
  const s = (status ?? '').toLowerCase()
  if (s.includes('submitted') || s === 'done') return 'bg-green-50 border-green-200 text-green-700'
  if (s.includes('rejected') || s.includes('stuck')) return 'bg-red-50 border-red-200 text-red-700'
  if (s.includes('working')) return 'bg-amber-50 border-amber-200 text-amber-700'
  if (s.includes('future')) return 'bg-[#e7eefe] border-[#c5caff] text-[#1e248c]'
  return 'bg-gray-50 border-gray-200 text-gray-500'
}

export default function MySpaceClient({ userName }: { userName: string }) {
  const [overview, setOverview] = useState<MeOverview | null>(null)
  const [allRows, setAllRows] = useState<ProjectRow[] | null>(null)
  const [agenda, setAgenda] = useState<MeAgenda | null>(null)
  const [weekHours, setWeekHours] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The tasks sweep may still be building server-side — poll until it lands.
  const loadAgenda = useCallback(async () => {
    try {
      const res = await fetch('/api/me/agenda')
      const data = await res.json() as { agenda?: MeAgenda; error?: string }
      if (data.error) { setError(data.error); return }
      const a = data.agenda ?? { milestones: [], tasks: [], tasksBuilding: false, mondayIdFound: false }
      setAgenda(a)
      if (a.tasksBuilding) {
        pollTimer.current = setTimeout(loadAgenda, 45_000)
      }
    } catch {
      setAgenda({ milestones: [], tasks: [], tasksBuilding: false, mondayIdFound: false })
    }
  }, [])

  useEffect(() => {
    fetch('/api/me/overview')
      .then((r) => r.json() as Promise<{ overview?: MeOverview; error?: string }>)
      .then((data) => {
        if (data.error) setError(data.error)
        else setOverview(data.overview ?? null)
      })
      .catch((e) => setError(String(e)))

    fetch('/api/projects')
      .then((r) => r.json() as Promise<{ projects?: ProjectRow[] }>)
      .then((data) => setAllRows(data.projects ?? []))
      .catch(() => setAllRows([]))

    loadAgenda()

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
    const end = new Date(start); end.setDate(end.getDate() + 6)
    fetch(`/api/me/time-entries?start=${toYMD(start)}&end=${toYMD(end)}`)
      .then((r) => r.json() as Promise<{ entries?: TimeEntryDTO[] }>)
      .then((data) => setWeekHours((data.entries ?? []).reduce((s, e) => s + e.hours, 0)))
      .catch(() => {})

    return () => { if (pollTimer.current) clearTimeout(pollTimer.current) }
  }, [loadAgenda])

  // The user's projects as full EPM dashboard rows.
  const myRows = useMemo(() => {
    if (!allRows || !overview) return null
    const mine = new Set(overview.myProjects.filter((p) => p.status.toLowerCase() !== 'done').map((p) => p._id))
    return allRows.filter((r) => mine.has(r._id))
  }, [allRows, overview])

  const expected = overview?.kpis.expectedWeeklyHours ?? 40
  const firstName = userName.split(' ')[0] || 'there'
  const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long' })
  const overdueCount = agenda?.tasks.filter((t) => t.overdue).length ?? 0

  return (
    <div className="max-w-[1800px] w-full mx-auto flex-1 min-h-0 flex flex-col">
      {/* breadcrumb — back to the platform portal */}
      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
        <a href={PORTAL_URL} className="hover:text-[#1e248c]">Platform</a>
        <ChevronRight size={12} />
        <span className="text-[#1e248c] font-medium">My Space</span>
      </div>

      {/* greeting + quick links */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h1 className="text-2xl font-bold text-[#1e248c]">Good morning, {firstName}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/me/hours"
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-semibold text-white bg-[#1e248c] hover:bg-[#333a9f] transition-colors"
          >
            <Clock3 size={13} />
            Submit working hours
            <span className="text-[11px] font-bold tabular-nums bg-white/20 rounded-full px-2 py-0.5">
              {weekHours != null ? `${weekHours}/${expected}h` : '…'}
            </span>
          </Link>
          <a
            href="https://knowledge.easybim.co.il"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors"
          >
            <BookOpen size={12} /> Knowledge Center <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>
      )}

      {/* tasks | milestones | projects */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* My tasks — all boards, overdue + this month */}
        <section className="lg:col-span-3 glass-card rounded-2xl p-4 flex flex-col min-h-0 overflow-hidden">
          <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2 mb-2 shrink-0">
            <ListTodo size={14} /> My tasks
            {agenda && overdueCount > 0 && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600">
                {overdueCount} overdue
              </span>
            )}
            {agenda && !agenda.tasksBuilding && (
              <span className="text-[10px] font-normal text-gray-400 tabular-nums ms-auto">{agenda.tasks.length}</span>
            )}
          </h2>
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[#eef0fb]">
            {!agenda ? <Skeleton /> : agenda.tasksBuilding ? (
              <Skeleton note="First scan of all your Monday boards is running in the background — this card fills itself in a few minutes." />
            ) : !agenda.mondayIdFound ? (
              <Empty>Couldn&apos;t find your Monday identity on any project team, so assigned items can&apos;t be matched to you.</Empty>
            ) : agenda.tasks.length === 0 ? (
              <Empty>No open items assigned to you are overdue or due this month. 🎉</Empty>
            ) : agenda.tasks.map((t, i) => (
              <a key={i} href={t.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 py-1.5 px-1 hover:bg-white/60 rounded-lg">
                <span className={`w-11 shrink-0 text-[10px] font-bold tabular-nums ${t.overdue ? 'text-red-500' : 'text-[#1e248c]'}`}>
                  {fmtDay(t.date)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis"><bdi>{t.name}</bdi></div>
                  <div className="text-[9px] text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis"><bdi>{t.boardName}</bdi></div>
                </div>
                {t.status && (
                  <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${statusChip(t.status)}`}>
                    {t.status}
                  </span>
                )}
              </a>
            ))}
          </div>
        </section>

        {/* My milestones — RTL */}
        <section className="lg:col-span-4 glass-card rounded-2xl p-4 flex flex-col min-h-0 overflow-hidden">
          <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2 mb-2 shrink-0">
            <CalendarCheck2 size={14} /> My milestones
            <span className="text-[10px] font-normal text-gray-400">{monthLabel}</span>
            {agenda && <span className="text-[10px] font-normal text-gray-400 tabular-nums ms-auto">{agenda.milestones.length}</span>}
          </h2>
          <div dir="rtl" className="flex-1 min-h-0 overflow-y-auto divide-y divide-[#eef0fb]">
            {!agenda ? <Skeleton /> : agenda.milestones.length === 0 ? (
              <Empty>No milestone bills due on your projects this month. 🎉</Empty>
            ) : agenda.milestones.map((m, i) => (
              <a key={i} href={m.url || undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 py-1.5 px-1 hover:bg-white/60 rounded-lg">
                <span className="w-12 shrink-0 text-[10px] font-bold text-[#1e248c] tabular-nums" dir="ltr">{fmtDay(m.date)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis">
                    {m.milestoneName}
                    {m.billName && <span className="text-gray-400 font-normal"> › {m.billName}</span>}
                  </div>
                  <div className="text-[9px] text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">
                    {m.project}{m.team && <> · {m.team}</>}
                  </div>
                </div>
                <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${statusChip(m.status)}`}>
                  {m.status || '—'}
                </span>
              </a>
            ))}
          </div>
        </section>

        {/* My projects — EPM-style table, RTL */}
        <section className="lg:col-span-5 glass-card rounded-2xl p-3 flex flex-col min-h-0 overflow-hidden">
          <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2 mb-2 shrink-0 px-1">
            <FolderKanban size={14} /> My projects
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
              Working on it
            </span>
            {myRows && <span className="text-[10px] font-normal text-gray-400 tabular-nums ms-auto">{myRows.length}</span>}
          </h2>
          <div dir="rtl" className="flex-1 min-h-0 overflow-auto" style={{ zoom: 0.85 }}>
            {!myRows ? (
              <div dir="ltr"><Skeleton /></div>
            ) : myRows.length === 0 ? (
              <div dir="ltr"><Empty>No projects matched to you — you are matched by the team columns synced from Monday.</Empty></div>
            ) : (
              <MyProjectsTable rows={myRows} />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

/* EPM-dashboard-style table, trimmed to My Space: columns run right→left as
   Project, #, ACC, Drive, Monday, team, hours, milestones (status column
   dropped — everything here is "Working on it"). */
function MyProjectsTable({ rows }: { rows: ProjectRow[] }) {
  const th = 'sticky top-0 z-10 bg-[#f0f3ff] text-[9px] font-semibold text-gray-500 border-b border-[#e8eaff] px-1.5 py-1.5 whitespace-nowrap'
  const iconBtn = 'inline-flex items-center justify-center w-7 h-7 rounded transition-colors'
  const iconOff = `${iconBtn} text-gray-300 bg-gray-50 cursor-not-allowed`
  return (
    <table className="w-full border-collapse min-w-[620px]">
      <thead>
        <tr>
          <th className={`${th} text-start`}>Project</th>
          <th className={th}>#</th>
          <th className={th}>ACC</th>
          <th className={th}>Drive</th>
          <th className={th}>Monday</th>
          <th className={th}>BIM Mgmt</th>
          <th className={th}>MEP</th>
          <th className={th}>Modeller</th>
          <th className={th}>Hours</th>
          <th className={th}>Milestones</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const mondayHref = p.links.dedicatedBoard || p.links.mainBoard || p.links.mondayBoard
          return (
            <tr key={p._id} className="hover:bg-white/60">
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-start">
                <a
                  href={`/dashboard/${p._id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open project page in a new tab"
                  className="text-[11px] font-semibold text-gray-800 hover:text-[#1e248c] hover:underline whitespace-nowrap"
                >
                  <bdi>{p.projectName}</bdi>
                </a>
              </td>
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center font-mono text-[10px] text-[#44b8d3]" dir="ltr">
                {p.projectNumber}
              </td>
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center">
                {p.links.acc ? (
                  <a href={p.links.acc} target="_blank" rel="noopener noreferrer" title="Open in Autodesk ACC"
                    className={`${iconBtn} text-cyan-700 bg-cyan-50 hover:bg-cyan-100`}>
                    <Cloud size={13} />
                  </a>
                ) : (
                  <span title="No ACC project linked" className={iconOff}><Cloud size={13} /></span>
                )}
              </td>
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center">
                {p.links.driveFolder ? (
                  <a href={p.links.driveFolder} target="_blank" rel="noopener noreferrer" title="Open Google Drive folder"
                    className={`${iconBtn} text-[#00687a] bg-teal-50 hover:bg-teal-100`}>
                    <FolderOpen size={13} />
                  </a>
                ) : (
                  <span title="No Drive folder linked" className={iconOff}><FolderOpen size={13} /></span>
                )}
              </td>
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center">
                {mondayHref ? (
                  <a href={mondayHref} target="_blank" rel="noopener noreferrer" title="Open Monday board"
                    className={`${iconBtn} text-[#1e248c] bg-blue-50 hover:bg-blue-100`}>
                    <LayoutGrid size={13} />
                  </a>
                ) : (
                  <span title="No Monday board linked" className={iconOff}><LayoutGrid size={13} /></span>
                )}
              </td>
              <td className="border-b border-[#eef0fb] px-1 py-1"><TeamMemberCell member={p.bimManager} /></td>
              <td className="border-b border-[#eef0fb] px-1 py-1"><TeamMemberCell member={p.mepCoordinator} /></td>
              <td className="border-b border-[#eef0fb] px-1 py-1"><TeamMemberCell member={p.bimModeller} /></td>
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center" dir="ltr"
                title={p.actualHours != null && p.budgetHours != null ? `${Math.round(p.actualHours)} / ${Math.round(p.budgetHours)} hrs` : 'no hours data'}>
                <ProgressBar value={p.hoursProgress} />
              </td>
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center" dir="ltr">
                <ProgressBar value={p.milestoneProgress} neutral />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Skeleton({ note }: { note?: string }) {
  return (
    <div className="pt-1">
      <div className="space-y-2 animate-pulse">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-8 rounded-lg bg-[#eef0fb]" />)}
      </div>
      {note && <p className="text-[10px] text-gray-400 mt-2">{note}</p>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-gray-500 leading-relaxed pt-2">{children}</p>
}
