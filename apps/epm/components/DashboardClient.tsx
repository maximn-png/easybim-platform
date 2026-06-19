'use client'

import { useState, useMemo } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import type { ProjectRow } from '@/lib/types'
import FilterTabs from './FilterTabs'
import ProjectsTable from './ProjectsTable'

interface DashboardClientProps {
  projects: ProjectRow[]
  lastSyncedAt?: string | null
}

type StatusFilter = ProjectRow['status'] | null

function sortByProjectNumber(a: ProjectRow, b: ProjectRow): number {
  const numA = parseInt(a.projectNumber.replace(/[^0-9]/g, '')) || 0
  const numB = parseInt(b.projectNumber.replace(/[^0-9]/g, '')) || 0
  if (numA !== numB) return numA - numB
  return a.projectNumber.localeCompare(b.projectNumber)
}

function formatSyncTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function DashboardClient({ projects, lastSyncedAt }: DashboardClientProps) {
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('Working on it')
  const [searchQuery, setSearchQuery] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; durationMs: number } | { error: string } | null>(null)

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync/projects', { method: 'POST' })
      const data = await res.json() as { synced?: number; durationMs?: number; error?: string }
      if (!res.ok) {
        setSyncResult({ error: data.error ?? 'Sync failed' })
      } else {
        setSyncResult({ synced: data.synced ?? 0, durationMs: data.durationMs ?? 0 })
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch {
      setSyncResult({ error: 'Network error' })
    } finally {
      setSyncing(false)
    }
  }

  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const p of projects) {
      if (p.status) result[p.status] = (result[p.status] ?? 0) + 1
    }
    return result
  }, [projects])

  const filtered = useMemo(() => {
    const list = projects.filter(p => {
      if (activeStatus && p.status !== activeStatus) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          p.projectName.toLowerCase().includes(q) ||
          p.projectNumber.includes(q)
        )
      }
      return true
    })
    return [...list].sort(sortByProjectNumber)
  }, [projects, activeStatus, searchQuery])

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <FilterTabs
          activeStatus={activeStatus}
          onChange={status => {
            setActiveStatus(status)
          }}
          counts={counts}
          totalCount={projects.length}
        />

        <div className="flex items-center gap-2">
          {/* Sync button + last sync time */}
          <div className="flex flex-col items-end gap-0.5">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
            {syncResult ? (
              <span className={`text-[10px] ${('error' in syncResult) ? 'text-red-500' : 'text-green-600'}`}>
                {'error' in syncResult
                  ? syncResult.error
                  : `✓ ${syncResult.synced} projects synced in ${(syncResult.durationMs / 1000).toFixed(1)}s`}
              </span>
            ) : lastSyncedAt ? (
              <span className="text-[10px] text-gray-400">
                Last sync: {formatSyncTime(lastSyncedAt)}
              </span>
            ) : null}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-4 py-1.5 text-sm bg-white/80 border border-white/90 rounded-full focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20 placeholder-gray-400"
            />
          </div>
        </div>
      </div>

      {/* Result count */}
      <p className="text-xs text-gray-500 -mt-2">
        Showing {filtered.length} of {projects.length} projects
        {activeStatus && ` · ${activeStatus}`}
      </p>

      {/* Table */}
      <ProjectsTable projects={filtered} />
    </div>
  )
}
