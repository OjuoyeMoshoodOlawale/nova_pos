import { useState } from 'react'
export default function EmailConfig({ onNext }: { onNext: () => void }) {
  const [d, setD] = useState({ host:'smtp.gmail.com', port:'587', user:'', pass:'', fromName:'', fromEmail:'', managerEmail:'' })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState('')
  async function save() {
    await window.api.settings.set('smtp_host', d.host)
    await window.api.settings.set('smtp_port', d.port)
    await window.api.settings.set('smtp_user', d.user)
    await window.api.settings.set('smtp_pass', d.pass)
    await window.api.settings.set('smtp_from_name', d.fromName)
    await window.api.settings.set('smtp_from_email', d.fromEmail)
    await window.api.settings.set('manager_email', d.managerEmail)
    onNext()
  }
  async function testEmail() {
    setTesting(true); setTestResult('')
    const r = await window.api.settings.testEmail({ host:d.host, port:parseInt(d.port), user:d.user, pass:d.pass, fromName:d.fromName, fromEmail:d.fromEmail, toEmail:d.managerEmail || d.user })
    setTesting(false)
    setTestResult(r.success ? '✅ Test email sent!' : `❌ ${r.error}`)
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Optional — skip if you don't want email reports. You can configure this later in Settings.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label">SMTP Host</label><input className="input" value={d.host} onChange={e=>setD(p=>({...p,host:e.target.value}))}/></div>
        <div><label className="label">Port</label><input className="input" value={d.port} onChange={e=>setD(p=>({...p,port:e.target.value}))}/></div>
        <div><label className="label">Username</label><input className="input" value={d.user} onChange={e=>setD(p=>({...p,user:e.target.value}))}/></div>
        <div className="col-span-2"><label className="label">Password / App Password</label><input className="input" type="password" value={d.pass} onChange={e=>setD(p=>({...p,pass:e.target.value}))}/></div>
        <div><label className="label">From Name</label><input className="input" value={d.fromName} onChange={e=>setD(p=>({...p,fromName:e.target.value}))}/></div>
        <div><label className="label">Manager Email (reports go here)</label><input className="input" value={d.managerEmail} onChange={e=>setD(p=>({...p,managerEmail:e.target.value}))}/></div>
      </div>
      <div className="flex gap-3">
        <button onClick={testEmail} disabled={testing||!d.user} className="btn-secondary flex-1">{testing?'Sending...':'Send Test Email'}</button>
        <button onClick={save} className="btn-primary flex-1">Save & Continue</button>
      </div>
      {testResult && <p className="text-sm">{testResult}</p>}
    </div>
  )
}
