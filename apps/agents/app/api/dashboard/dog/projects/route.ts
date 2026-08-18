import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { contractCandidates, inspectProject, listProjects } from '@/lib/agents/dog/drive'
import { suggestPreviousContracts } from '@/lib/agents/dog/related'
import { parseFolderId } from '@/lib/integrations/google/client'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/dashboard/dog/projects                       → the project folders to choose from
// GET /api/dashboard/dog/projects?folderId=…            → what Dog found inside one (its picks)
// GET /api/dashboard/dog/projects?folderId=…&previous=1 → signed contracts of the same client
// GET /api/dashboard/dog/projects?folderId=…&contracts=1 → that project's חוזה folder, to pick from by hand
// `folderId` also accepts a pasted Drive folder URL, for projects outside the root.
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const raw = sp.get('folderId')?.trim()

  try {
    if (!raw) {
      const projects = await listProjects()
      return NextResponse.json({ projects })
    }
    const folderId = raw.includes('/') ? parseFolderId(raw) : raw
    if (!folderId) return NextResponse.json({ error: 'קישור תיקייה לא תקין' }, { status: 400 })

    if (sp.has('contracts')) {
      const slot = await contractCandidates(folderId)
      return NextResponse.json({ slot })
    }

    if (sp.has('previous')) {
      // The project name is the folder name — it carries the quote number the
      // client lookup starts from.
      const name = sp.get('projectName')?.trim() || (await inspectProject(folderId)).projectName
      const suggestions = await suggestPreviousContracts(name)
      return NextResponse.json({ suggestions })
    }

    const inspection = await inspectProject(folderId)
    return NextResponse.json({ inspection })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Drive lookup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
