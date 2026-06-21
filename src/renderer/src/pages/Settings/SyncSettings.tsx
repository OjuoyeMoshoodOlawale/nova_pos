// src/renderer/src/pages/Settings/SyncSettings.tsx
// Supabase cloud sync configuration panel.
// Store owner enters their free-tier Supabase URL + anon key,
// sets the sync interval, and enables/disables sync.
import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { Cloud, CloudOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'

export default function SyncSettings() {
  const { addToast } = useAppStore()
  const [cfg, setCfg] = useState({ supabase_url: '', supabase_key: '', sync_interval: 300, is_enabled: 0 })
  const [status, setStatus] = useState<{ pending: number; last_sync_at: string | null; is_enabled: boolean }>({ pending: 0, last_sync_at: null, is_enabled: false })
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

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
    // Refresh status
    const s = await window.api.sync.status() as any
    setStatus(s?.data ?? s)
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

  return (
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
          <p className="text-[10px] text-slate-400 mt-1">From Supabase → Settings → API → Project URL</p>
        </div>
        <div>
          <label className="label">Anon / Public Key</label>
          <input className="input font-mono text-xs" placeholder="eyJhbGciOiJIUzI1NiIs..."
            value={cfg.supabase_key}
            onChange={e => setCfg(p => ({ ...p, supabase_key: e.target.value.trim() }))} />
          <p className="text-[10px] text-slate-400 mt-1">From Supabase → Settings → API → anon public key</p>
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
      <div className="flex gap-2 pt-2">
        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        <button onClick={syncNow} disabled={syncing || !cfg.is_enabled}
          className="btn-secondary flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
    </div>
  )
}
