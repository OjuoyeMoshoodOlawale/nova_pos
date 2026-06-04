import { useState } from 'react'
export default function NetworkSetup({ onNext }: { onNext: () => void }) {
  const [mode, setMode] = useState<'standalone'|'server'|'client'>('standalone')
  const [ip, setIp]     = useState('')
  const [port, setPort] = useState('3977')
  const [secret, setSecret] = useState('')
  async function save() {
    await window.api.settings.set('network_mode', mode)
    if (mode === 'server') await window.api.network.startServer(parseInt(port), secret)
    if (mode === 'client') {
      await window.api.settings.set('lan_server_ip', ip)
      await window.api.settings.set('lan_server_port', port)
      await window.api.settings.set('lan_secret', secret)
    }
    onNext()
  }
  return (
    <div className="space-y-4">
      <div>
        <label className="label">Network Mode</label>
        <div className="space-y-2">
          {(['standalone','server','client'] as const).map(m=>(
            <label key={m} className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer ${mode===m?'border-blue-500 bg-blue-50':'border-slate-200'}`}>
              <input type="radio" name="mode" value={m} checked={mode===m} onChange={()=>setMode(m)} className="mt-0.5"/>
              <div>
                <p className="font-medium text-sm capitalize">{m === 'standalone' ? 'Standalone (Single Computer)' : m === 'server' ? 'Server (This is the main computer)' : 'Client (Connect to another computer)'}</p>
                <p className="text-xs text-slate-500">{m==='standalone'?'Works independently, no network needed':m==='server'?'Other computers will connect to this one':' This computer will use another computer\'s database'}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
      {mode !== 'standalone' && (
        <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
          {mode === 'client' && <div><label className="label">Server IP Address</label><input className="input" value={ip} onChange={e=>setIp(e.target.value)} placeholder="192.168.1.100"/></div>}
          <div><label className="label">Port</label><input className="input" value={port} onChange={e=>setPort(e.target.value)}/></div>
          <div><label className="label">Shared Secret (same on all computers)</label><input className="input" value={secret} onChange={e=>setSecret(e.target.value)} placeholder="Create a strong password"/></div>
        </div>
      )}
      <button onClick={save} className="w-full btn-primary">Save & Continue</button>
    </div>
  )
}
