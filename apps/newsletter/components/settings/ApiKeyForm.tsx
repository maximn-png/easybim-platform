'use client'

import { useState } from 'react'
import { Eye, EyeOff, Loader2, CheckCircle, XCircle, Terminal, Database, Cpu } from 'lucide-react'

interface ApiKeyFormProps {
  label: string
  provider: 'cohere' | 'gemini'
  hasSavedKey?: boolean
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type TestStatus = 'idle' | 'loading' | 'ok' | 'error'

export default function ApiKeyForm({ label, provider, hasSavedKey = false }: ApiKeyFormProps) {
  const [key, setKey]               = useState('')
  const [visible, setVisible]       = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [savedInDb, setSavedInDb]   = useState(hasSavedKey)
  const [testLogs, setTestLogs]     = useState<string[]>([])
  const [saveLogs, setSaveLogs]     = useState<string[]>([])
  const [models, setModels]         = useState<string[]>([])

  function resetOnChange(val: string) {
    setKey(val)
    setTestStatus('idle')
    setSaveStatus('idle')
    setTestLogs([])
    setSaveLogs([])
    setModels([])
  }

  async function saveKey() {
    if (!key.trim()) return
    setSaveStatus('saving')
    setSaveLogs([])

    const logLine = (msg: string) => setSaveLogs(prev => [...prev, msg])

    logLine(`[save] POST /api/settings/api-keys`)
    logLine(`  provider: ${provider}`)
    logLine(`  key: ${key.slice(0, 8)}${'*'.repeat(12)}`)

    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: key }),
      })
      const data = await res.json()

      if (res.ok) {
        logLine(`← 200 OK — ${data.message}`)
        logLine(`  Stored encrypted in MongoDB → collection: styleprofiles`)
        setSaveStatus('saved')
        setSavedInDb(true)
        setTimeout(() => setSaveStatus('idle'), 4000)
      } else {
        logLine(`← ${res.status} ERROR — ${data.error}`)
        setSaveStatus('error')
      }
    } catch (err) {
      logLine(`← Network error: ${(err as Error).message}`)
      setSaveStatus('error')
    }
  }

  async function testKey() {
    if (!key.trim()) return
    setTestStatus('loading')
    setTestLogs([])
    setModels([])

    try {
      const res = await fetch('/api/settings/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: key }),
      })
      const data = await res.json()
      setTestLogs(data.logs ?? [])
      setModels(data.models ?? [])
      setTestStatus(res.ok ? 'ok' : 'error')
    } catch (err) {
      setTestLogs([`Network error: ${(err as Error).message}`])
      setTestStatus('error')
    }
  }

  return (
    <div className="bg-white/70 backdrop-blur border border-white rounded-2xl p-6 shadow-sm space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold text-[#1e248c] text-base">{label}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {savedInDb && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
              <Database size={11} /> Saved in MongoDB
            </span>
          )}
          {testStatus === 'ok' && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
              <CheckCircle size={11} /> Connected
            </span>
          )}
          {testStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-500 border border-red-200">
              <XCircle size={11} /> Failed
            </span>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={key}
          onChange={e => resetOnChange(e.target.value)}
          placeholder={savedInDb ? `Enter new ${label} API key to update...` : `Enter ${label} API key...`}
          className="w-full px-4 py-3 pr-11 rounded-xl border border-[#e8eaff] bg-[#f8f9ff] text-sm font-mono focus:outline-none focus:border-[#44b8d3] focus:ring-2 focus:ring-[#44b8d3]/20 transition-all"
          dir="ltr"
        />
        <button
          onClick={() => setVisible(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-[#1e248c] transition-colors"
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={testKey}
          disabled={!key.trim() || testStatus === 'loading'}
          className="flex-1 py-2.5 rounded-xl border-2 border-[#1e248c] text-[#1e248c] font-semibold text-sm hover:bg-[#1e248c] hover:text-white transition-all disabled:opacity-40"
        >
          {testStatus === 'loading'
            ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Testing...</span>
            : 'Test Connection'}
        </button>

        <button
          onClick={saveKey}
          disabled={!key.trim() || saveStatus === 'saving'}
          className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md disabled:opacity-40 ${
            saveStatus === 'saved'
              ? 'bg-emerald-500 text-white shadow-emerald-500/20'
              : saveStatus === 'error'
              ? 'bg-red-500 text-white shadow-red-500/20'
              : 'bg-[#1e248c] text-white hover:bg-[#1e248c]/90 shadow-[#1e248c]/20'
          }`}
        >
          {saveStatus === 'saving' && <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Saving...</span>}
          {saveStatus === 'saved'  && <span className="flex items-center justify-center gap-2"><CheckCircle size={14} /> Saved!</span>}
          {saveStatus === 'error'  && <span className="flex items-center justify-center gap-2"><XCircle size={14} /> Save Failed</span>}
          {saveStatus === 'idle'   && (savedInDb ? 'Update Key' : 'Save Key')}
        </button>
      </div>

      {/* Save log panel */}
      {saveLogs.length > 0 && (
        <LogPanel title="Save Log" status={saveStatus === 'saved' ? 'ok' : saveStatus === 'error' ? 'error' : 'idle'} logs={saveLogs} />
      )}

      {/* Test log panel */}
      {testLogs.length > 0 && (
        <LogPanel title="API Request Log" status={testStatus === 'ok' ? 'ok' : testStatus === 'error' ? 'error' : 'idle'} logs={testLogs} />
      )}

      {/* Available models */}
      {models.length > 0 && (
        <div className="rounded-xl border border-[#e8eaff] bg-[#f8f9ff] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8eaff] bg-white">
            <Cpu size={13} className="text-[#44b8d3]" />
            <span className="text-xs font-semibold text-[#1e248c] uppercase tracking-wider">Available Models ({models.length})</span>
          </div>
          <div className="px-4 py-3 flex flex-wrap gap-2">
            {models.map(m => (
              <span key={m} className="text-xs font-mono px-2.5 py-1 rounded-lg bg-white border border-[#e8eaff] text-[#1e248c]">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LogPanel({ title, status, logs }: { title: string; status: 'ok' | 'error' | 'idle'; logs: string[] }) {
  return (
    <div className="rounded-xl bg-[#0a0a1a] border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-white/5">
        <Terminal size={12} className="text-[#44b8d3]" />
        <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider">{title}</span>
        {status !== 'idle' && (
          <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
            status === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {status === 'ok' ? 'SUCCESS' : 'FAILED'}
          </span>
        )}
      </div>
      <div className="px-4 py-3 space-y-0.5 font-mono text-xs leading-relaxed">
        {logs.map((line, i) => (
          <div key={i} className={
            line.includes('← 200') || line.includes('OK —')          ? 'text-emerald-400' :
            line.includes('ERROR') || line.includes('failed')         ? 'text-red-400' :
            line.startsWith('  →') || line.startsWith('[1/') || line.startsWith('[2/') ? 'text-[#44b8d3]' :
            line.startsWith('  Response') || line.startsWith('  key') ? 'text-[#9ca3af]' :
            line.startsWith('    •')                                   ? 'text-[#6b7280]' :
                                                                         'text-[#9ca3af]'
          }>
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}
