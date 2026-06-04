import { useState } from 'react'
export default function BackupSetup({ onNext }: { onNext: () => void }) {
  const [d, setD] = useState({ enabled:false, schedule:'daily', time:'23:00', day:'1', destination:'local', localPath:'', backupEmail:'' })
  async function save() {
    await window.api.settings.set('backup_enabled', d.enabled?'true':'false')
    await window.api.settings.set('backup_schedule', d.schedule)
    await window.api.settings.set('backup_time', d.time)
    await window.api.settings.set('backup_day', d.day)
    await window.api.settings.set('backup_destination', d.destination)
    await window.api.settings.set('backup_local_path', d.localPath)
    await window.api.settings.set('backup_email', d.backupEmail)
    onNext()
  }
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={d.enabled} onChange={e=>setD(p=>({...p,enabled:e.target.checked}))} className="w-4 h-4"/>
        <span className="font-medium">Enable Automatic Backups</span>
      </label>
      {d.enabled && (
        <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Schedule</label>
              <select className="input" value={d.schedule} onChange={e=>setD(p=>({...p,schedule:e.target.value}))}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div><label className="label">At time</label><input type="time" className="input" value={d.time} onChange={e=>setD(p=>({...p,time:e.target.value}))}/></div>
            <div><label className="label">Backup to</label>
              <select className="input" value={d.destination} onChange={e=>setD(p=>({...p,destination:e.target.value}))}>
                <option value="local">Local Folder</option>
                <option value="email">Email (Gmail/SMTP)</option>
                <option value="both">Both</option>
              </select>
            </div>
            {(d.destination==='email'||d.destination==='both') &&
              <div><label className="label">Backup Email Address</label><input className="input" type="email" value={d.backupEmail} onChange={e=>setD(p=>({...p,backupEmail:e.target.value}))} placeholder="backup@gmail.com"/></div>}
          </div>
          <p className="text-xs text-slate-500">Email backup sends a compressed .db.gz file to your Gmail (uses configured SMTP). Gmail users: enable an App Password in Google Account settings.</p>
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={()=>window.api.settings.backup()} className="btn-secondary">Backup Now</button>
        <button onClick={save} className="btn-primary flex-1">Finish Setup 🎉</button>
      </div>
    </div>
  )
}
