import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
export default function CreateAdmin({ onNext }: { onNext: () => void }) {
  const [d, setD] = useState({ full_name:'', username:'', password:'', confirm:'' })
  const [show, setShow] = useState(false)
  const [err, setErr]   = useState('')
  async function save() {
    if (!d.full_name || !d.username || !d.password) { setErr('All fields required'); return }
    if (d.password !== d.confirm) { setErr('Passwords do not match'); return }
    if (d.password.length < 6) { setErr('Password must be at least 6 characters'); return }
    const r = await window.api.staff.create({ full_name:d.full_name, username:d.username, password:d.password, role:'admin' })
    if (r.success) onNext()
    else setErr(r.error || 'Failed to create account')
  }
  return (
    <div className="space-y-4">
      <div><label className="label">Full Name *</label><input className="input" value={d.full_name} onChange={e=>setD(p=>({...p,full_name:e.target.value}))} placeholder="John Doe"/></div>
      <div><label className="label">Username *</label><input className="input" value={d.username} onChange={e=>setD(p=>({...p,username:e.target.value.toLowerCase().replace(/\s/g,'')}))} placeholder="admin"/></div>
      <div><label className="label">Password *</label>
        <div className="relative"><input className="input pr-10" type={show?'text':'password'} value={d.password} onChange={e=>setD(p=>({...p,password:e.target.value}))}/>
          <button type="button" onClick={()=>setShow(s=>!s)} className="absolute right-3 top-2.5 text-slate-400">{show?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button>
        </div>
      </div>
      <div><label className="label">Confirm Password *</label><input className="input" type="password" value={d.confirm} onChange={e=>setD(p=>({...p,confirm:e.target.value}))}/></div>
      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</p>}
      <button onClick={save} className="w-full btn-primary">Create Admin & Continue</button>
    </div>
  )
}
