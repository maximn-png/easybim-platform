import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { connectDB } from '@/lib/db/mongoose'
import StyleProfile from '@/lib/models/StyleProfile'
import AppHeader from '@/components/AppHeader'
import SettingsClient from '@/components/settings/SettingsClient'

export default async function SettingsPage() {
  const { userId } = await auth()
  if (!userId) redirect(`${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3000'}/sign-in`)

  await connectDB()
  const profile = await StyleProfile.findOne({ userId })
    .select('cohereApiKey geminiApiKey')
    .lean() as { cohereApiKey?: string; geminiApiKey?: string } | null

  const savedKeys = {
    cohere: !!profile?.cohereApiKey,
    gemini: !!profile?.geminiApiKey,
  }

  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-[#44b8d3]/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-[#1e248c]/8 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 pointer-events-none" />

      <AppHeader />

      <main className="relative max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-[#1e248c]">Settings</h1>
          <p className="text-[#6b7280] text-sm mt-1">Manage your API keys, RSS sources, and style profile</p>
        </div>

        <SettingsClient savedKeys={savedKeys} />
      </main>
    </div>
  )
}
