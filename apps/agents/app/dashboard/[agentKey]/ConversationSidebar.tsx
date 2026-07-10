'use client'

import { useState } from 'react'
import { Plus, Trash2, Users, MessageSquare } from 'lucide-react'

export interface ConversationItem {
  id: string
  title: string
  shared: boolean
  lastMessageAt: string | null
}

// Bucket conversations by recency for Claude-style date groups.
function groupLabel(dateStr: string | null): string {
  if (!dateStr) return 'Older'
  const d = new Date(dateStr)
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.floor((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return 'Previous 7 days'
  return 'Older'
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Older']

export default function ConversationSidebar({
  conversations,
  activeId,
  accent,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: ConversationItem[]
  activeId: string | null
  accent: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const shared = conversations.filter((c) => c.shared)
  const own = conversations.filter((c) => !c.shared)
  const groups = GROUP_ORDER.map((label) => ({
    label,
    items: own.filter((c) => groupLabel(c.lastMessageAt) === label),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="h-full flex flex-col">
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold rounded-xl px-3 py-2.5 text-white transition-opacity hover:opacity-90 shadow-sm"
          style={{ background: accent }}
        >
          <Plus size={15} /> New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 flex flex-col gap-0.5">
        {shared.map((c) => (
          <SidebarRow
            key={c.id}
            item={c}
            active={activeId === c.id}
            accent={accent}
            onSelect={onSelect}
            confirmId={confirmId}
            setConfirmId={setConfirmId}
            onDelete={onDelete}
          />
        ))}

        {groups.map((g) => (
          <div key={g.label}>
            <p className="text-[10px] font-bold uppercase tracking-wide px-2 pt-3 pb-1" style={{ color: '#9ca3af' }}>
              {g.label}
            </p>
            {g.items.map((c) => (
              <SidebarRow
                key={c.id}
                item={c}
                active={activeId === c.id}
                accent={accent}
                onSelect={onSelect}
                confirmId={confirmId}
                setConfirmId={setConfirmId}
                onDelete={onDelete}
              />
            ))}
          </div>
        ))}

        {conversations.length === 0 && (
          <p className="text-xs text-center px-3 py-6" style={{ color: '#9ca3af' }}>
            No chats yet — start one!
          </p>
        )}
      </div>
    </div>
  )
}

function SidebarRow({
  item,
  active,
  accent,
  onSelect,
  confirmId,
  setConfirmId,
  onDelete,
}: {
  item: ConversationItem
  active: boolean
  accent: string
  onSelect: (id: string) => void
  confirmId: string | null
  setConfirmId: (id: string | null) => void
  onDelete: (id: string) => void
}) {
  const confirming = confirmId === item.id
  return (
    <div
      className="group relative rounded-lg transition-colors cursor-pointer"
      style={{ background: active ? `${accent}14` : undefined }}
      onClick={() => onSelect(item.id)}
      onMouseLeave={() => confirming && setConfirmId(null)}
    >
      <div className="flex items-center gap-2 px-2 py-2 pr-8 hover:bg-black/[0.03] rounded-lg">
        {item.shared ? (
          <Users size={13} className="shrink-0" style={{ color: '#9ca3af' }} />
        ) : (
          <MessageSquare size={13} className="shrink-0" style={{ color: active ? accent : '#c2c8d0' }} />
        )}
        <span
          className="text-[13px] truncate leading-snug"
          style={{ color: active ? '#111827' : '#4b5563', fontWeight: active ? 600 : 400 }}
          dir="auto"
          title={item.title}
        >
          {item.title}
        </span>
      </div>

      {!item.shared && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirming) {
              setConfirmId(null)
              onDelete(item.id)
            } else {
              setConfirmId(item.id)
            }
          }}
          title={confirming ? 'לחצו שוב לאישור מחיקה' : 'מחק שיחה'}
          aria-label="Delete conversation"
          className={`absolute top-1/2 -translate-y-1/2 right-1.5 rounded-md p-1 transition-all ${
            confirming ? 'opacity-100 bg-red-50' : 'opacity-0 group-hover:opacity-100 hover:bg-black/5'
          }`}
        >
          <Trash2 size={13} style={{ color: confirming ? '#dc2626' : '#9ca3af' }} />
        </button>
      )}
    </div>
  )
}
