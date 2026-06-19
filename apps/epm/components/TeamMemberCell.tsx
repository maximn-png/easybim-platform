import type { TeamMemberPayload } from '@/lib/types'

interface TeamMemberCellProps {
  member?: TeamMemberPayload
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

export default function TeamMemberCell({ member }: TeamMemberCellProps) {
  if (!member) {
    return (
      <div className="flex justify-center">
        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
          <span className="text-[9px] text-gray-400">—</span>
        </div>
      </div>
    )
  }

  const avatar = member.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={member.avatarUrl}
      alt={member.name}
      className="w-7 h-7 rounded-full object-cover"
    />
  ) : (
    <div className="w-7 h-7 rounded-full bg-[#e8eaff] border border-[#c5caff] flex items-center justify-center">
      <span className="text-[9px] font-semibold text-[#1e248c]">{getInitials(member.name)}</span>
    </div>
  )

  const inner = (
    <div className="flex justify-center" title={member.name}>
      {avatar}
    </div>
  )

  if (member.profileUrl) {
    return (
      <a href={member.profileUrl} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    )
  }

  return inner
}
