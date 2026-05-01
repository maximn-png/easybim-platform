import { FileText, Rss, Clock } from 'lucide-react'

interface StatsBarProps {
  totalNewsletters: number
  lastGenDate?: string
}

export default function StatsBar({ totalNewsletters, lastGenDate }: StatsBarProps) {
  const lastGen = lastGenDate
    ? new Date(lastGenDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Never'

  const stats = [
    {
      icon: FileText,
      label: 'Newsletters Generated',
      value: totalNewsletters.toString(),
      sub: 'total all time',
    },
    {
      icon: Rss,
      label: 'RSS Sources',
      value: '21',
      sub: 'BIM & AEC feeds',
    },
    {
      icon: Clock,
      label: 'Last Generated',
      value: lastGen,
      sub: 'most recent run',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {stats.map(({ icon: Icon, label, value, sub }) => (
        <div
          key={label}
          className="bg-white rounded-2xl border border-[#e8eaff] p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1e248c] to-[#44b8d3] flex items-center justify-center shadow-md shadow-[#1e248c]/20">
              <Icon size={18} className="text-white" />
            </div>
            <span className="text-xs font-semibold text-[#44b8d3] bg-[#44b8d3]/10 px-2.5 py-1 rounded-full">
              {sub}
            </span>
          </div>
          <div className="text-3xl font-black text-[#1e248c] mb-1">{value}</div>
          <div className="text-sm text-[#6b7280] font-medium">{label}</div>
        </div>
      ))}
    </div>
  )
}
