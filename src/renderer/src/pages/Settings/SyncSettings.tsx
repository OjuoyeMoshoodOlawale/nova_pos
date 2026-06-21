// src/renderer/src/pages/Settings/SyncSettings.tsx
// Supabase cloud sync configuration panel.
import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { Cloud, CloudOff, RefreshCw, CheckCircle, AlertCircle, Copy, ExternalLink, Wifi } from 'lucide-react'

export default function SyncSettings() {
  const { addToast } = useAppStore()
  const [cfg, setCfg] = useState({ supabase_url: '', supabase_key: '', sync_interval: 300, is_enabled: 0 })
  const [status, setStatus] = useState<{ pending: number; last_sync_at: string | null; is_enabled: boolean }>({ pending: 0, last_sync_at: null, is_enabled: false })
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'ok' | 'no-tables' | 'auth-fail' | 'error'>('idle')
  const [showSchema, setShowSchema] = useState(false)

  useEffect(() => {
    window.api.sync.getConfig().then((r: any) => { if (r?.success !== false) setCfg(r.data ?? r) })
    window.api.sync.status().then((r: any) => { if (r?.success !== false) setStatus(r.data ?? r) })
  }, [])

  async function save() {
    setSaving(true)
    const r = await window.api.sync.saveConfig(cfg) as any
    setSaving(false)
    if (r?.success) addToast('success', 'Sync settings saved')
    else addToast('error', r?.error || 'Failed to save')
    const s = await window.api.sync.status() as any
    setStatus(s?.data ?? s)
  }

  async function testConnection() {
    if (!cfg.supabase_url || !cfg.supabase_key) {
      addToast('error', 'Enter Supabase URL and key first')
      return
    }
    setTestResult('testing')
    try {
      // Test 1: Can we reach the API at all?
      const r1 = await fetch(`${cfg.supabase_url}/rest/v1/`, {
        headers: { 'apikey': cfg.supabase_key, 'Authorization': `Bearer ${cfg.supabase_key}` },
      })
      if (r1.status === 401 || r1.status === 403) { setTestResult('auth-fail'); return }
      if (!r1.ok) { setTestResult('error'); return }

      // Test 2: Do the tables exist? Try SELECT from products
      const r2 = await fetch(`${cfg.supabase_url}/rest/v1/products?select=id&limit=1`, {
        headers: { 'apikey': cfg.supabase_key, 'Authorization': `Bearer ${cfg.supabase_key}` },
      })
      if (r2.status === 404 || (r2.status >= 400 && r2.status < 500)) {
        setTestResult('no-tables')
        return
      }
      setTestResult('ok')
    } catch {
      setTestResult('error')
    }
  }

  async function syncNow() {
    setSyncing(true)
    const r = await window.api.sync.runNow() as any
    setSyncing(false)
    const data = r?.data ?? r
    if (data?.total > 0) addToast('success', `Synced ${data.total} rows`)
    else if (data?.errors?.length) addToast('error', data.errors[0])
    else addToast('success', 'Everything up to date')
    const s = await window.api.sync.status() as any
    setStatus(s?.data ?? s)
  }

  async function copySchema() {
    try {
      const r = await fetch('./supabase_schema.sql')
      let sql = ''
      if (r.ok) {
        sql = await r.text()
      } else {
        // Fallback: read from the IPC if fetch doesn't work
        sql = 'Could not load schema — copy it from docs/supabase_schema.sql in the project folder'
      }
      await navigator.clipboard.writeText(sql)
      addToast('success', 'Schema SQL copied to clipboard!')
    } catch {
      addToast('error', 'Could not copy — open docs/supabase_schema.sql manually')
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          {cfg.is_enabled ? <Cloud className="w-5 h-5 text-blue-500" /> : <CloudOff className="w-5 h-5 text-slate-400" />}
          <div>
            <h3 className="font-semibold text-slate-800">Cloud Sync (Supabase)</h3>
            <p className="text-xs text-slate-400">Push sales, stock & products to the cloud so the owner can view from their phone</p>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-4 text-xs bg-slate-50 rounded-lg px-3 py-2">
          <span className={`flex items-center gap-1 ${status.is_enabled ? 'text-green-600' : 'text-slate-400'}`}>
            {status.is_enabled ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
            {status.is_enabled ? 'Active' : 'Disabled'}
          </span>
          {status.last_sync_at && <span className="text-slate-500">Last sync: {status.last_sync_at}</span>}
          {status.pending > 0 && <span className="text-amber-600">{status.pending} rows pending</span>}
        </div>

        {/* Credentials */}
        <div className="space-y-3">
          <div>
            <label className="label">Supabase Project URL</label>
            <input className="input" placeholder="https://xxxxx.supabase.co"
              value={cfg.supabase_url}
              onChange={e => setCfg(p => ({ ...p, supabase_url: e.target.value.trim() }))} />
          </div>
          <div>
            <label className="label">Anon / Public Key</label>
            <input className="input font-mono text-xs" placeholder="eyJhbGciOiJIUzI1NiIs..."
              value={cfg.supabase_key}
              onChange={e => setCfg(p => ({ ...p, supabase_key: e.target.value.trim() }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Sync Interval (seconds)</label>
              <input type="number" min="60" step="60" className="input"
                value={cfg.sync_interval}
                onChange={e => setCfg(p => ({ ...p, sync_interval: parseInt(e.target.value) || 300 }))} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-blue-600"
                  checked={!!cfg.is_enabled}
                  onChange={e => setCfg(p => ({ ...p, is_enabled: e.target.checked ? 1 : 0 }))} />
                <span className="text-sm font-medium text-slate-700">Enable sync</span>
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 flex-wrap">
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          <button onClick={testConnection} disabled={testResult === 'testing'}
            className="btn-secondary flex items-center gap-2">
            <Wifi className={`w-4 h-4 ${testResult === 'testing' ? 'animate-pulse' : ''}`} />
            {testResult === 'testing' ? 'Testing…' : 'Test Connection'}
          </button>
          <button onClick={syncNow} disabled={syncing || !cfg.is_enabled}
            className="btn-secondary flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>

        {/* Test result feedback */}
        {testResult === 'ok' && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Connection OK — tables exist and are ready for sync
          </div>
        )}
        {testResult === 'auth-fail' && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            Authentication failed — check your Supabase URL and anon key are correct
          </div>
        )}
        {testResult === 'no-tables' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-2">
            <p className="text-sm text-amber-700 font-medium">Connection works, but tables don't exist yet</p>
            <p className="text-xs text-amber-600">You need to run the setup SQL once in your Supabase project. Follow the steps below.</p>
          </div>
        )}
        {testResult === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            Could not reach Supabase — check your internet connection and URL
          </div>
        )}
      </div>

      {/* Setup guide card */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-slate-800">First-Time Setup Guide</h3>
        <div className="space-y-3 text-sm">
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">1</span>
            <div>
              <p className="font-medium text-slate-700">Create a free Supabase project</p>
              <p className="text-xs text-slate-400">Go to supabase.com → sign up → create new project</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">2</span>
            <div>
              <p className="font-medium text-slate-700">Run the setup SQL to create tables</p>
              <p className="text-xs text-slate-400">In Supabase → SQL Editor → paste the schema SQL → click Run</p>
              <div className="flex gap-2 mt-2">
                <button onClick={copySchema} className="btn-secondary text-xs flex items-center gap-1">
                  <Copy className="w-3 h-3" /> Copy Schema SQL
                </button>
                <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer"
                  className="btn-secondary text-xs flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Open Supabase Dashboard
                </a>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">3</span>
            <div>
              <p className="font-medium text-slate-700">Copy your credentials</p>
              <p className="text-xs text-slate-400">Supabase → Settings → API → copy Project URL and anon key, paste above</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">4</span>
            <div>
              <p className="font-medium text-slate-700">Test & Enable</p>
              <p className="text-xs text-slate-400">Click "Test Connection" → should say "tables exist" → check Enable → Save → Sync Now</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
