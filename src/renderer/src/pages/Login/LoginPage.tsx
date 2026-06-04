// src/renderer/src/pages/Login/LoginPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore }  from '../../store/authStore'
import { useAppStore }   from '../../store/appStore'
import { Eye, EyeOff, LogIn, ShieldAlert } from 'lucide-react'

export default function LoginPage() {
  const navigate  = useNavigate()
  const { setSession }          = useAuthStore()
  const { profile, addToast }   = useAppStore()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [isDev, setIsDev]       = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!username || !password) { setError('Enter your username and password'); return }
    setLoading(true); setError('')

    const result = await window.api.auth.login(username.trim(), password)
    setLoading(false)

    if (result.success && result.data) {
      const session = result.data
      setSession(session, session.token)
      addToast('success', `Welcome, ${session.full_name}!`)

      if (session.username === 'nova.support') {
        setIsDev(true) // Show dev banner
      }
      navigate('/')
    } else {
      setError(result.error || 'Invalid credentials')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-xl">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">{profile?.name ?? 'NovaPOS'}</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to continue</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="your.username"
                autoFocus
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 text-base"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          {profile?.name ?? 'NovaPOS'} · Point of Sale System
        </p>
      </div>
    </div>
  )
}
