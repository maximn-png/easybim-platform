import Link from 'next/link'
import { Info } from 'lucide-react'
import type { TeamMemberPayload, IssueCreatorStat } from '@/lib/types'

interface TeamMemberCellProps {
  member?: TeamMemberPayload
  /** ACC issue stats for this member (matched by name): shows "completed/active" next to the avatar. */
  stat?: IssueCreatorStat
  /** Where the stat badge links to — the project's Forma Issues page filtered by this creator. */
  statHref?: string
  /** Reserve a fixed-width badge slot in every cell so avatars align down a
   *  column (Projects table). Off by default — other views stay centered. */
  reserveStatSlot?: boolean
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

export default function TeamMemberCell({ member, stat, statHref, reserveStatSlot }: TeamMemberCellProps) {
  if (!member) {
    return (
      <div className="flex items-center justify-center">
        {reserveStatSlot && <span className="w-9 shrink-0" />}
        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
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

  // "8/12" — completed vs everything-except-closed among issues this member
  // created in ACC. Links to the Forma Issues page filtered to that creator.
  const statBadge = stat && statHref ? (
    <Link
      href={statHref}
      onClick={e => e.stopPropagation()}
      title={`${stat.completed} completed of ${stat.active} issues created by ${member.name} (all statuses except closed) — click to open the issues page filtered by ${member.name}`}
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-green-50 border border-green-200 text-green-700 text-[10px] font-semibold leading-none whitespace-nowrap tabular-nums hover:bg-green-100 transition-colors"
    >
      {stat.completed}/{stat.active}
      <Info size={9} className="text-green-600/70 shrink-0" />
    </Link>
  ) : null

  // The stat badge is its own link, so it lives NEXT TO the profile anchor —
  // never inside it (nested <a> is invalid HTML and breaks hydration).
  const avatarNode = member.profileUrl ? (
    <a href={member.profileUrl} target="_blank" rel="noopener noreferrer">
      {avatar}
    </a>
  ) : avatar

  // Fixed-width badge slot: with reserveStatSlot it's present in EVERY cell
  // (empty when there's no stat) so the avatars line up down the column. A wide
  // badge (e.g. "40/52") grows leftward out of the slot without nudging the avatar.
  return (
    <div className="flex items-center justify-center" title={member.name}>
      {(reserveStatSlot || statBadge) && (
        <span className={`shrink-0 flex justify-end pr-1 ${reserveStatSlot ? 'w-9' : ''}`}>{statBadge}</span>
      )}
      <span className="shrink-0">{avatarNode}</span>
    </div>
  )
}
