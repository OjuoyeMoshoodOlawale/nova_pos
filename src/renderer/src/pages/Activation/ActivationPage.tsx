// src/renderer/src/pages/Activation/ActivationPage.tsx
import { useState, useEffect } from 'react'
import { useNavigate }   from 'react-router-dom'
import { useAppStore }   from '../../store/appStore'
import { ShieldCheck, Monitor, Copy, CheckCircle, AlertCircle } from 'lucide-react'

export default function ActivationPage() {
  const navigate = useNavigate()
  const { setActivated, addToast } = useAppStore()

  const [machineId, setMachineId]     = useState('')
  const [key, setKey]                 = useState('')
  const [bizName, setBizName]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [copied, setCopied]           = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    window.api.activation.getMachineId().then((r: any) => {
      if (r.success) setMachineId(r.data)
    })
  }, [])

  async function handleActivate() {
    if (!key.trim() || !bizName.trim()) {
      setError('Please enter your business name and activation key.')
      return
    }
    setLoading(true)
    setError('')
    const result = await window.api.activation.activate(key.trim(), bizName.trim())
    setLoading(false)
    if (result.success) {
      setActivated(true)
      addToast('success', 'Software activated successfully!')
      navigate('/setup')
    } else {
      setError(result.error || 'Invalid activation key. Please contact your vendor.')
    }
  }

  function copyMachineId() {
    navigator.clipboard.writeText(machineId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function formatKey(v: string) {
    // Strip ALL non-alphanumeric characters first
    let clean = v.toUpperCase().replace(/[^A-Z0-9]/g, '')
    // Remove leading NOVA prefix if present — we always re-add it below
    // This prevents "NOVA-NOVA-..." doubling when pasting the full key
    if (clean.startsWith('NOVA')) clean = clean.slice(4)
    const parts = clean.match(/.{1,4}/g) ?? []
    const formatted = ['NOVA', ...parts.slice(0, 4)].join('-')
    setKey(formatted.slice(0, 24))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-violet-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">NovaPOS</h1>
          <p className="text-blue-300 mt-1">Software Activation</p>
        </div>

        <div className="bg-white/10 backdrop-blur rounded-2xl p-6 shadow-2xl border border-white/20">
          {/* Machine ID */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Monitor className="w-4 h-4 text-blue-300" />
              <span className="text-sm font-medium text-blue-200">Your Machine ID</span>
              <span className="text-xs text-slate-400">(send this to your vendor)</span>
            </div>
            <div
              onClick={copyMachineId}
              className="flex items-center gap-2 bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-900/80 transition group"
            >
              <code className="text-xs text-green-300 flex-1 font-mono break-all">{machineId || 'Loading...'}</code>
              {copied
                ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                : <Copy className="w-4 h-4 text-slate-400 flex-shrink-0 group-hover:text-white" />}
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Business Name</label>
              <input
                type="text"
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                placeholder="e.g. Al-Minhaaj Stores"
                className="w-full bg-slate-900/60 border border-white/20 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Activation Key</label>
              <input
                type="text"
                value={key}
                onChange={(e) => formatKey(e.target.value)}
                placeholder="NOVA-XXXX-XXXX-XXXX-XXXX"
                className="w-full bg-slate-900/60 border border-white/20 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 font-mono tracking-widest focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/20 border border-red-500/40 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <button
              onClick={handleActivate}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {loading ? 'Activating...' : 'Activate Software'}
            </button>
          </div>

          <p className="text-center text-xs text-slate-500 mt-4">
            Contact your vendor with the Machine ID above to receive your key.
          </p>
        </div>
      </div>
    </div>
  )
}
