'use client'

import { useState } from 'react'
import { Key, Rss, User } from 'lucide-react'
import ApiKeyForm from '@/components/settings/ApiKeyForm'
import RssSourceManager from '@/components/settings/RssSourceManager'
import StyleProfileUploader from '@/components/settings/StyleProfileUploader'

const TABS = [
  { id: 'keys',  label: 'API Keys',      icon: Key },
  { id: 'style', label: 'Style Profile', icon: User },
  { id: 'rss',   label: 'RSS Sources',   icon: Rss },
] as const

type Tab = typeof TABS[number]['id']

interface SettingsClientProps {
  savedKeys: { cohere: boolean; gemini: boolean }
}

export default function SettingsClient({ savedKeys }: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('keys')

  return (
    <>
      <div className="flex gap-2 mb-8 bg-white/70 backdrop-blur rounded-2xl p-1.5 border border-white shadow-sm w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === id
                ? 'bg-[#1e248c] text-white shadow-sm'
                : 'text-[#6b7280] hover:text-[#1e248c] hover:bg-[#f0f2ff]'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div key={activeTab}>
        {activeTab === 'keys' && (
          <div className="grid gap-6 md:grid-cols-2">
            <ApiKeyForm label="Cohere Command A" provider="cohere" hasSavedKey={savedKeys.cohere} />
            <ApiKeyForm label="Google Gemini"     provider="gemini" hasSavedKey={savedKeys.gemini} />
          </div>
        )}
        {activeTab === 'style' && <StyleProfileUploader />}
        {activeTab === 'rss'   && <RssSourceManager />}
      </div>
    </>
  )
}
