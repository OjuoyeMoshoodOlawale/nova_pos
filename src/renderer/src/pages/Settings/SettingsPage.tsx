import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { Building2, Receipt, Mail, Printer, Network, HardDrive, UserCog, ChevronRight, Save, TestTube } from 'lucide-react'
const TABS=[{id:'business',l:'Business',icon:Building2},{id:'receipt',l:'Receipt',icon:Receipt},{id:'email',l:'Email',icon:Mail},{id:'printer',l:'Printer',icon:Printer},{id:'network',l:'Network',icon:Network},{id:'backup',l:'Backup',icon:HardDrive},{id:'dev',l:'Developer',icon:UserCog}] as const
type Tab=typeof TABS[number]['id']
export default function SettingsPage(){
  const {addToast,setProfile}=useAppStore()
  const [tab,setTab]=useState<Tab>('business')
  const [settings,setSettings]=useState<any>({})
  const [profile,setLocalProfile]=useState<any>({})
  const [printers,setPrinters]=useState<string[]>([])
  const [testing,setTesting]=useState(false)
  const [saving,setSaving]=useState(false)

  useEffect(()=>{
    Promise.all([window.api.settings.getAll(),window.api.profile.get(),window.api.hardware.listPrinters()]).then(([s,p,pr])=>{
      if(s.success)setSettings(s.data||{})
      if(p.success)setLocalProfile(p.data||{})
      if(pr.success)setPrinters(pr.data||[])
    })
  },[])

  async function saveProfile(){
    setSaving(true)
    const r=await window.api.profile.save(profile)
    if(r.success){setProfile(r.data);addToast('success','Business profile saved')}else addToast('error',r.error||'Failed')
    setSaving(false)
  }
  async function saveSetting(key:string,value:string){await window.api.settings.set(key,value);setSettings((p:any)=>({...p,[key]:value}))}
  async function testEmail(){
    setTesting(true)
    const r=await window.api.settings.testEmail({host:settings.smtp_host,port:parseInt(settings.smtp_port||'587'),user:settings.smtp_user,pass:settings.smtp_pass,fromName:settings.smtp_from_name,fromEmail:settings.smtp_from_email,toEmail:settings.manager_email||settings.smtp_user})
    setTesting(false)
    if(r.success)addToast('success','Test email sent!'); else addToast('error',r.error||'Failed')
  }

  const S=(k:string)=>settings[k]||''
  const P=(k:string)=>profile[k]??''

  return(
    <div className="flex h-full overflow-hidden">
      <aside className="w-52 bg-white border-r border-slate-100 p-3 space-y-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 py-2">Settings</p>
        {TABS.map(t=>{const Icon=t.icon;return(
          <button key={t.id} onClick={()=>setTab(t.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${tab===t.id?'bg-blue-50 text-blue-700 font-medium':'text-slate-600 hover:bg-slate-50'}`}>
            <Icon className="w-4 h-4 flex-shrink-0"/>{t.l}
          </button>
        )})}
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-xl space-y-6">

          {tab==='business'&&(<>
            <h2 className="text-lg font-bold text-slate-800">Business Profile</h2>
            <div className="card space-y-4">
              {[['name','Business Name','text'],['type','Type','select'],['address','Address','text'],['phone','Phone','text'],['email','Email','email'],['currency_symbol','Currency Symbol','text'],['currency_code','Currency Code','text'],['tax_name','Tax Name','text'],['tax_rate','Tax Rate %','number']].map(([k,l,t])=>(
                <div key={k}><label className="label">{l}</label>
                  {t==='select'?<select className="input" value={P(k)} onChange={e=>setLocalProfile((p:any)=>({...p,[k]:e.target.value}))}>{['retail','restaurant','pharmacy','salon','electronics','supermarket','other'].map(o=><option key={o} value={o}>{o.charAt(0).toUpperCase()+o.slice(1)}</option>)}</select>
                  :<input className="input" type={t} value={P(k)} onChange={e=>setLocalProfile((p:any)=>({...p,[k]:t==='number'?parseFloat(e.target.value)||0:e.target.value}))}/>}
                </div>
              ))}
              <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={!!profile.tax_inclusive} onChange={e=>setLocalProfile((p:any)=>({...p,tax_inclusive:e.target.checked}))}/><span className="text-sm text-slate-700">Tax-inclusive pricing</span></label>
              <button onClick={saveProfile} disabled={saving} className="btn-primary">{saving?'Saving...':'Save Profile'}</button>
            </div>
          </>)}

          {tab==='receipt'&&(<>
            <h2 className="text-lg font-bold text-slate-800">Receipt Customization</h2>
            <div className="card space-y-4">
              <div><label className="label">Receipt Header</label><textarea className="input h-20" value={S('receipt_header')} onChange={e=>saveSetting('receipt_header',e.target.value)}/></div>
              <div><label className="label">Receipt Footer</label><textarea className="input h-20" value={S('receipt_footer')} onChange={e=>saveSetting('receipt_footer',e.target.value)}/></div>
              <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={S('show_logo')==='1'} onChange={e=>saveSetting('show_logo',e.target.checked?'1':'0')}/><span className="text-sm text-slate-700">Show logo on receipt</span></label>
              <button onClick={()=>addToast('success','Receipt settings auto-saved')} className="btn-primary">Save Receipt Settings</button>
            </div>
          </>)}

          {tab==='email'&&(<>
            <h2 className="text-lg font-bold text-slate-800">Email Configuration</h2>
            <div className="card space-y-4">
              {[['smtp_host','SMTP Host','text','smtp.gmail.com'],['smtp_port','Port','number','587'],['smtp_user','Username','email',''],['smtp_pass','Password / App Password','password',''],['smtp_from_name','From Name','text',''],['smtp_from_email','From Email','email',''],['manager_email','Manager Email (reports)','email','']].map(([k,l,t,ph])=>(
                <div key={k}><label className="label">{l}</label><input className="input" type={t} placeholder={ph} value={S(k)} onChange={e=>setSettings((p:any)=>({...p,[k]:e.target.value}))}/></div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Auto-email daily report</label><select className="input" value={S('auto_email_enabled')} onChange={e=>saveSetting('auto_email_enabled',e.target.value)}><option value="false">Disabled</option><option value="true">Enabled</option></select></div>
                <div><label className="label">Send at time</label><input type="time" className="input" value={S('auto_email_time')||'22:00'} onChange={e=>saveSetting('auto_email_time',e.target.value)}/></div>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>{['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from_name','smtp_from_email','manager_email','auto_email_enabled','auto_email_time'].forEach(k=>saveSetting(k,S(k)));addToast('success','Email settings saved')}} className="btn-primary flex-1">Save</button>
                <button onClick={testEmail} disabled={testing} className="btn-secondary flex-1 flex items-center justify-center gap-2"><TestTube className="w-4 h-4"/>{testing?'Sending...':'Test Email'}</button>
              </div>
            </div>
          </>)}

          {tab==='printer'&&(<>
            <h2 className="text-lg font-bold text-slate-800">Printer Settings</h2>
            <div className="card space-y-4">
              <div><label className="label">Receipt Printer</label><select className="input" value={S('printer_name')} onChange={e=>saveSetting('printer_name',e.target.value)}><option value="">Select printer...</option>{printers.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
              <div><label className="label">Paper Width</label><select className="input" value={S('paper_width')||'80mm'} onChange={e=>saveSetting('paper_width',e.target.value)}><option value="80mm">80mm (Standard)</option><option value="58mm">58mm (Narrow)</option></select></div>
              <button onClick={()=>window.api.hardware.testPrint().then(r=>{if(r.success)addToast('success','Test print sent!')})} className="btn-secondary">Test Print</button>
            </div>
          </>)}

          {tab==='network'&&(<>
            <h2 className="text-lg font-bold text-slate-800">Network / LAN</h2>
            <div className="card space-y-4">
              <div><label className="label">Mode</label><select className="input" value={S('network_mode')||'standalone'} onChange={e=>saveSetting('network_mode',e.target.value)}><option value="standalone">Standalone</option><option value="server">Server (share DB)</option><option value="client">Client (connect to server)</option></select></div>
              {S('network_mode')==='client'&&<><div><label className="label">Server IP</label><input className="input" value={S('lan_server_ip')} onChange={e=>saveSetting('lan_server_ip',e.target.value)} placeholder="192.168.1.100"/></div><div><label className="label">Port</label><input className="input" value={S('lan_server_port')||'3977'} onChange={e=>saveSetting('lan_server_port',e.target.value)}/></div></>}
              {S('network_mode')==='server'&&<div><label className="label">Port</label><input className="input" value={S('lan_server_port')||'3977'} onChange={e=>saveSetting('lan_server_port',e.target.value)}/></div>}
              <div><label className="label">Shared Secret</label><input className="input" type="password" value={S('lan_secret')} onChange={e=>saveSetting('lan_secret',e.target.value)} placeholder="Same on all computers"/></div>
            </div>
          </>)}

          {tab==='backup'&&(<>
            <h2 className="text-lg font-bold text-slate-800">Backup & Restore</h2>
            <div className="card space-y-4">
              <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={S('backup_enabled')==='true'} onChange={e=>saveSetting('backup_enabled',e.target.checked?'true':'false')}/><span className="font-medium text-sm">Enable automatic backups</span></label>
              {S('backup_enabled')==='true'&&<>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Schedule</label><select className="input" value={S('backup_schedule')||'daily'} onChange={e=>saveSetting('backup_schedule',e.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
                  <div><label className="label">Time</label><input type="time" className="input" value={S('backup_time')||'23:00'} onChange={e=>saveSetting('backup_time',e.target.value)}/></div>
                </div>
                <div><label className="label">Destination</label><select className="input" value={S('backup_destination')||'local'} onChange={e=>saveSetting('backup_destination',e.target.value)}><option value="local">Local Folder</option><option value="email">Email (Gmail/SMTP)</option><option value="both">Both</option></select></div>
                {(S('backup_destination')==='email'||S('backup_destination')==='both')&&<div><label className="label">Backup Email Address</label><input type="email" className="input" value={S('backup_email')} onChange={e=>saveSetting('backup_email',e.target.value)} placeholder="backup@gmail.com"/></div>}
              </>}
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button onClick={()=>window.api.settings.backupNow().then(r=>{if(r.success)addToast('success','Backup saved: '+r.data)})} className="btn-secondary flex-1">Backup Now</button>
                <button onClick={()=>window.api.settings.restore()} className="btn-secondary flex-1">Restore Backup</button>
              </div>
            </div>
          </>)}

          {tab==='dev'&&(<>
            <h2 className="text-lg font-bold text-slate-800">Developer Access</h2>
            <div className="card space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                <p className="font-semibold mb-1">⚠️ Vendor Support Access</p>
                <p>Developer maintenance login (username: <code className="font-mono bg-amber-100 px-1 rounded">nova.support</code>) can be disabled here for enhanced security.</p>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={S('dev_login_enabled')!=='false'} onChange={e=>saveSetting('dev_login_enabled',e.target.checked?'true':'false')}/>
                <div><p className="font-medium text-sm text-slate-800">Allow developer maintenance login</p><p className="text-xs text-slate-500">Required for remote vendor support</p></div>
              </label>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-500 font-medium mb-2">App Information</p>
                <div className="space-y-1 text-xs text-slate-600">
                  <p>Version: 1.0.0</p>
                  <p>Database: SQLite (WAL mode)</p>
                  <p>Network mode: <span className="font-medium capitalize">{S('network_mode')||'standalone'}</span></p>
                </div>
              </div>
            </div>
          </>)}

        </div>
      </main>
    </div>
  )
}
