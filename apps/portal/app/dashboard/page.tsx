import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Newspaper, Database, Cpu, ArrowRight, Clock } from 'lucide-react'
import AppHeader from '@/components/AppHeader'

const TOOLS = [
  {
    id: 'newsletter',
    title: 'Newsletter Generator',
    description:
      'Generate AI-powered BIM industry newsletters from RSS feeds using Google Gemini.',
    icon: Newspaper,
    href: process.env.NEXT_PUBLIC_NEWSLETTER_URL || '#',
    status: 'live' as const,
    color: '#1e248c',
  },
  {
    id: 'drive-monday',
    title: 'Drive → Monday.com',
    description:
      'Sync Google Drive files and folders to Monday.com boards. Connect Google Sheets and Docs to project workflows.',
    icon: Database,
    href: '#',
    status: 'coming-soon' as const,
    color: '#44b8d3',
  },
  {
    id: 'revit-sync',
    title: 'Revit MCP Sync',
    description:
      'Connect Revit models to Google Sheets, Docs, and Monday.com. Automate quantity take-offs and drawing registers.',
    icon: Cpu,
    href: '#',
    status: 'coming-soon' as const,
    color: '#6b7280',
  },
]

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <div className="min-h-full flex flex-col bg-[#f8f9ff]">
      <AppHeader />

      <main className="flex-1 px-6 py-12 max-w-6xl mx-auto w-full">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-[#1e248c] mb-2">Internal Tools</h1>
          <p className="text-[#6b7280]">All EasyBIM workflow tools in one place.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TOOLS.map((tool) => {
            const Icon = tool.icon
            return (
              <div
                key={tool.id}
                className="bg-white rounded-2xl shadow-sm border border-[#e8eaff] p-6 flex flex-col gap-4 hover:shadow-md transition-shadow"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: tool.color + '18' }}
                >
                  <Icon size={24} style={{ color: tool.color }} />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="font-bold text-[#171717]">{tool.title}</h2>
                    {tool.status === 'live' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">
                        Live
                      </span>
                    )}
                    {tool.status === 'coming-soon' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#f0f2ff] text-[#6b7280] font-medium">
                        Soon
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#6b7280] leading-relaxed">{tool.description}</p>
                </div>

                {tool.status === 'live' ? (
                  <a
                    href={tool.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm font-semibold text-[#1e248c] hover:text-[#44b8d3] transition-colors"
                  >
                    Open tool <ArrowRight size={14} />
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-[#9ca3af]">
                    <Clock size={14} /> Coming soon
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
