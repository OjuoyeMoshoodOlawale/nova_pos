import { useState, useEffect, useRef } from 'react'
import { useAppStore }  from '../../store/appStore'
import { useAuthStore } from '../../store/authStore'
import { Building2, Receipt, Mail, Printer, Network, HardDrive, UserCog, Tag, Percent, TestTube, Plus, Edit2, Trash2, X, Cloud } from 'lucide-react'
import SyncSettings from './SyncSettings'

const ALL_TABS = [
  {id:'business',  l:'Business',   icon:Building2},
  {id:'tax',       l:'Tax & VAT',  icon:Percent},
  {id:'categories',l:'Categories', icon:Tag},
  {id:'receipt',   l:'Receipt',    icon:Receipt},
  {id:'email',     l:'Email',      icon:Mail},
  {id:'printer',   l:'Printer',    icon:Printer},
  {id:'network',   l:'Network',    icon:Network},
  {id:'backup',    l:'Backup',     icon:HardDrive},
  {id:'cloud',     l:'Cloud Sync', icon:Cloud},
  {id:'dev',       l:'Developer',  icon:UserCog},
] as const
type Tab = typeof ALL_TABS[number]['id']

const PRESET_CATEGORIES: Record<string,{name:string;color:string}[]> = {
  retail:    [{name:'General',color:'#6366f1'},{name:'Food',color:'#f59e0b'},{name:'Beverages',color:'#06b6d4'},{name:'Electronics',color:'#10b981'},{name:'Clothing',color:'#ec4899'},{name:'Household',color:'#8b5cf6'},{name:'Toiletries',color:'#3b82f6'}],
  restaurant:[{name:'Starters',color:'#f59e0b'},{name:'Main Course',color:'#ef4444'},{name:'Sides',color:'#10b981'},{name:'Drinks',color:'#06b6d4'},{name:'Desserts',color:'#ec4899'},{name:'Specials',color:'#8b5cf6'}],
  pharmacy:  [{name:'Prescription',color:'#ef4444'},{name:'OTC Drugs',color:'#f59e0b'},{name:'Supplements',color:'#10b981'},{name:'Baby Care',color:'#ec4899'},{name:'Cosmetics',color:'#8b5cf6'},{name:'Medical Devices',color:'#6366f1'}],
  supermarket:[{name:'Fresh Produce',color:'#10b981'},{name:'Dairy',color:'#06b6d4'},{name:'Bakery',color:'#f59e0b'},{name:'Frozen',color:'#3b82f6'},{name:'Snacks',color:'#f97316'},{name:'Household',color:'#8b5cf6'},{name:'Beverages',color:'#06b6d4'}],
  electronics:[{name:'Phones',color:'#3b82f6'},{name:'Laptops',color:'#6366f1'},{name:'Accessories',color:'#8b5cf6'},{name:'Cables',color:'#64748b'},{name:'Audio',color:'#f59e0b'},{name:'Cameras',color:'#ef4444'}],
}

const COLORS = ['#3b82f6','#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#f59e0b','#10b981','#06b6d4','#64748b']

export default function SettingsPage() {
  const {addToast, setProfile, profile: appProfile} = useAppStore()
  const { user } = useAuthStore()
  // Backup tab is restricted to admin/manager — hidden from cashiers
  const TABS = ALL_TABS.filter(t => {
    if (t.id === 'backup') return ['admin', 'manager', 'owner'].includes(user?.role || '')
    return true
  })
  const [tab, setTab] = useState<Tab>('business')
  const [settings, setSettings] = useState<any>({})
  const [profile, setLocalProfile] = useState<any>({})
  const [categories, setCategories] = useState<any[]>([])
  const [printers, setPrinters] = useState<string[]>([])
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [appPaths, setAppPaths] = useState<any>(null)
  // Scanner test: USB scanners type ultra-fast (<100ms between keys) then Enter.
  const [scanTest,    setScanTest]    = useState('')
  const [scanResult,  setScanResult]  = useState<'idle'|'scanner'|'keyboard'>('idle')
  const scanT0 = useRef(0)
  const scanT1 = useRef(0)
  // Category edit state
  const [catForm, setCatForm] = useState<{id?:number;name:string;color:string}|null>(null)

  useEffect(() => {
    Promise.all([
      window.api.settings.getAll(),
      window.api.profile.get(),
      window.api.hardware.listPrinters(),
      window.api.categories.getAll(),
    ]).then(([s,p,pr,cats]) => {
      if (s.success)    setSettings(s.data || {})
      if (p.success)    setLocalProfile(p.data || {})
      if (pr.success)   setPrinters(pr.data || [])
      if (cats.success) setCategories(cats.data || [])
    })
    window.api.settings.getAppPaths().then((r:any) => { if (r.success) setAppPaths(r.data) })
  }, [])

  async function saveProfile() {
    setSaving(true)
    const r = await window.api.profile.save(profile)
    if (r.success) { setProfile(r.data); addToast('success','Profile saved') }
    else addToast('error', r.error||'Failed')
    setSaving(false)
  }

  async function saveTax() {
    setSaving(true)
    const r = await window.api.profile.save({
      ...profile,
      tax_name:      profile.tax_name      || 'VAT',
      tax_rate:      profile.tax_rate      ?? 7.5,
      tax_inclusive: profile.tax_inclusive ?? false,
    })
    if (r.success) { setProfile(r.data); addToast('success','Tax settings saved') }
    else addToast('error', r.error||'Failed')
    setSaving(false)
  }

  async function saveSetting(key: string, value: string) {
    await window.api.settings.set(key, value)
    setSettings((p:any) => ({...p, [key]: value}))
  }

  async function testEmail() {
    setTesting(true)
    const r = await window.api.settings.testEmail({
      host: S('smtp_host'), port: parseInt(S('smtp_port')||'587'),
      user: S('smtp_user'), pass: S('smtp_pass'),
      fromName: S('smtp_from_name'), fromEmail: S('smtp_from_email'),
      toEmail: S('manager_email')||S('smtp_user'),
    })
    setTesting(false)
    if (r.success) addToast('success','Test email sent!')
    else addToast('error', r.error||'Email failed')
  }

  async function saveCategory() {
    if (!catForm?.name.trim()) return
    const r = catForm.id
      ? await window.api.categories.update(catForm.id, {name:catForm.name, color:catForm.color, icon:null})
      : await window.api.categories.create({name:catForm.name, color:catForm.color, icon:null})
    if (r.success) {
      const cats = await window.api.categories.getAll()
      if (cats.success) setCategories(cats.data)
      setCatForm(null)
      addToast('success', catForm.id ? 'Category updated' : 'Category added')
    } else addToast('error', r.error||'Failed')
  }

  async function deleteCategory(id: number) {
    if (!confirm('Delete this category? Products will be uncategorized.')) return
    await window.api.categories.delete(id)
    setCategories(p => p.filter(c => c.id !== id))
    addToast('success','Category deleted')
  }

  async function loadPresetCategories(type: string) {
    const presets = PRESET_CATEGORIES[type]
    if (!presets) return
    if (!confirm(`Load ${type} preset categories? Existing categories will remain.`)) return
    for (const cat of presets) {
      await window.api.categories.create({name:cat.name, color:cat.color, icon:null})
    }
    const cats = await window.api.categories.getAll()
    if (cats.success) setCategories(cats.data)
    addToast('success',`Loaded ${presets.length} ${type} categories`)
  }

  const S = (k: string) => settings[k] || ''
  const P = (k: string) => profile[k] ?? ''

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 bg-white border-r border-slate-100 p-3 space-y-0.5 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 py-2">Settings</p>
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition
                ${tab===t.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon className="w-4 h-4 flex-shrink-0"/>{t.l}
            </button>
          )
        })}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-xl space-y-6">

          {/* ── BUSINESS ── */}
          {tab==='business' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800">Business Profile</h2>
              <div className="card space-y-4">
                <div><label className="label">Business Name</label><input className="input" value={P('name')} onChange={e=>setLocalProfile((p:any)=>({...p,name:e.target.value}))}/></div>
                <div><label className="label">Business Type</label>
                  <select className="input" value={P('type')} onChange={e=>setLocalProfile((p:any)=>({...p,type:e.target.value}))}>
                    {['retail','restaurant','pharmacy','salon','electronics','supermarket','hospital','school','other'].map(o=><option key={o} value={o}>{o.charAt(0).toUpperCase()+o.slice(1)}</option>)}
                  </select></div>
                <div><label className="label">Address</label><input className="input" value={P('address')} onChange={e=>setLocalProfile((p:any)=>({...p,address:e.target.value}))}/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Phone</label><input className="input" value={P('phone')} onChange={e=>setLocalProfile((p:any)=>({...p,phone:e.target.value}))}/></div>
                  <div><label className="label">Email</label><input className="input" type="email" value={P('email')} onChange={e=>setLocalProfile((p:any)=>({...p,email:e.target.value}))}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Currency Symbol</label><input className="input" value={P('currency_symbol')} onChange={e=>setLocalProfile((p:any)=>({...p,currency_symbol:e.target.value})) } placeholder="₦"/></div>
                  <div><label className="label">Currency Code</label><input className="input" value={P('currency_code')} onChange={e=>setLocalProfile((p:any)=>({...p,currency_code:e.target.value}))} placeholder="NGN"/></div>
                </div>
                <button onClick={saveProfile} disabled={saving} className="btn-primary">{saving?'Saving...':'Save Profile'}</button>
              </div>
            </div>
          )}

          {/* ── TAX ── */}
          {tab==='tax' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800">Tax & VAT Settings</h2>
              <div className="card space-y-5">
                <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                  Configure how tax is calculated and displayed on receipts.
                </div>
                <div><label className="label">Tax Name (shown on receipt)</label>
                  <input className="input" value={P('tax_name')||'VAT'} onChange={e=>setLocalProfile((p:any)=>({...p,tax_name:e.target.value}))} placeholder="e.g. VAT, GST, Tax"/></div>
                <div><label className="label">Tax Rate (%)</label>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <input type="number" step="0.01" min="0" max="100" className="input pr-8"
                        value={P('tax_rate')??7.5} onChange={e=>setLocalProfile((p:any)=>({...p,tax_rate:parseFloat(e.target.value)||0}))}/>
                      <span className="absolute right-3 top-2.5 text-slate-400 text-sm">%</span>
                    </div>
                    <span className="text-sm text-slate-500">Current rate: <strong>{P('tax_rate')||7.5}%</strong></span>
                  </div>
                </div>
                <div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={!!profile.tax_inclusive}
                      onChange={e=>setLocalProfile((p:any)=>({...p,tax_inclusive:e.target.checked}))}/>
                    <div>
                      <p className="text-sm font-medium text-slate-800">Tax-inclusive pricing</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Prices already include tax (tax is extracted from total).<br/>
                        <strong>Tax-exclusive</strong>: tax is added on top of listed prices.
                      </p>
                    </div>
                  </label>
                </div>
                {/* Preview */}
                <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                  <p className="font-medium text-slate-700">Preview (₦1,000 item):</p>
                  {profile.tax_inclusive
                    ? <>
                        <p className="text-slate-600">Item price: ₦1,000.00 (tax included)</p>
                        <p className="text-slate-600">{P('tax_name')||'VAT'} ({P('tax_rate')||7.5}%): ₦{(1000*(P('tax_rate')||7.5)/(100+(P('tax_rate')||7.5))).toFixed(2)}</p>
                        <p className="font-bold text-slate-800">Total: ₦1,000.00</p>
                      </>
                    : <>
                        <p className="text-slate-600">Item price: ₦1,000.00</p>
                        <p className="text-slate-600">{P('tax_name')||'VAT'} ({P('tax_rate')||7.5}%): ₦{(1000*(P('tax_rate')||7.5)/100).toFixed(2)}</p>
                        <p className="font-bold text-slate-800">Total: ₦{(1000*(1+(P('tax_rate')||7.5)/100)).toFixed(2)}</p>
                      </>}
                </div>
                <button onClick={saveTax} disabled={saving} className="btn-primary w-full">{saving?'Saving...':'Save Tax Settings'}</button>
              </div>
            </div>
          )}

          {/* ── CATEGORIES ── */}
          {tab==='categories' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800">Product Categories</h2>
                <button onClick={()=>setCatForm({name:'',color:'#6366f1'})} className="btn-primary flex items-center gap-2 text-sm">
                  <Plus className="w-4 h-4"/> Add Category
                </button>
              </div>

              {/* Preset loaders */}
              <div className="card">
                <p className="text-sm font-medium text-slate-700 mb-3">Quick Load Presets</p>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(PRESET_CATEGORIES).map(type => (
                    <button key={type} onClick={()=>loadPresetCategories(type)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 capitalize transition">
                      {type}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2">Loads preset categories for your business type.</p>
              </div>

              {/* Category list */}
              <div className="card divide-y divide-slate-50">
                {categories.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">No categories yet. Add one above.</p>
                )}
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center gap-3 py-2.5">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{backgroundColor:cat.color}}/>
                    <span className="flex-1 text-sm font-medium text-slate-800">{cat.name}</span>
                    <button onClick={()=>setCatForm({id:cat.id,name:cat.name,color:cat.color})}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 className="w-3.5 h-3.5"/></button>
                    <button onClick={()=>deleteCategory(cat.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── RECEIPT ── */}
          {tab==='receipt' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800">Receipt Customization</h2>
              <div className="card space-y-4">
                <div><label className="label">Receipt Header</label>
                  <textarea className="input h-20" value={S('receipt_header')} onChange={e=>saveSetting('receipt_header',e.target.value)} placeholder="Shown at top of receipt..."/></div>
                <div><label className="label">Receipt Footer</label>
                  <textarea className="input h-20" value={S('receipt_footer')||'Thank you for your patronage!'} onChange={e=>saveSetting('receipt_footer',e.target.value)}/></div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={S('show_logo')==='1'} onChange={e=>saveSetting('show_logo',e.target.checked?'1':'0')}/>
                  <span className="text-sm text-slate-700">Show logo on receipt</span>
                </label>
                <button onClick={()=>addToast('success','Receipt settings auto-saved on change')} className="btn-secondary">Confirm</button>
              </div>
            </div>
          )}

          {/* ── EMAIL ── */}
          {tab==='email' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800">Email / SMTP</h2>
              <div className="card space-y-4">
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                  Gmail: use an <strong>App Password</strong> (Google Account → Security → App Passwords). Port: 587.
                </div>
                {[['smtp_host','SMTP Host','text','smtp.gmail.com'],['smtp_port','Port','number','587'],
                  ['smtp_user','Username/Email','email',''],['smtp_pass','Password / App Password','password',''],
                  ['smtp_from_name','From Name','text',''],['smtp_from_email','From Email','email',''],
                  ['manager_email','Reports Recipient Email','email','']].map(([k,l,t,ph]) => (
                  <div key={k}><label className="label">{l}</label>
                    <input className="input" type={t} placeholder={ph}
                      value={S(k)} onChange={e=>setSettings((p:any)=>({...p,[k]:e.target.value}))}/></div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Auto email daily report</label>
                    <select className="input" value={S('auto_email_enabled')} onChange={e=>saveSetting('auto_email_enabled',e.target.value)}>
                      <option value="false">Disabled</option><option value="true">Enabled</option>
                    </select></div>
                  <div><label className="label">Send at</label>
                    <input type="time" className="input" value={S('auto_email_time')||'22:00'} onChange={e=>saveSetting('auto_email_time',e.target.value)}/></div>
                </div>
                <div className="flex gap-3">
                  <button onClick={()=>{
                    ['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from_name','smtp_from_email','manager_email'].forEach(k=>saveSetting(k,S(k)))
                    addToast('success','Email settings saved')
                  }} className="btn-primary flex-1">Save</button>
                  <button onClick={testEmail} disabled={testing} className="btn-secondary flex-1 flex items-center justify-center gap-2">
                    <TestTube className="w-4 h-4"/>{testing?'Sending...':'Test Email'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── PRINTER ── */}
          {tab==='printer' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800">Receipt Printer</h2>
              <div className="card space-y-4">
                <div><label className="label">Thermal Printer</label>
                  <select className="input" value={S('printer_name')} onChange={e=>saveSetting('printer_name',e.target.value)}>
                    <option value="">Select printer...</option>
                    {printers.map(p=><option key={p} value={p}>{p}</option>)}
                  </select></div>
                <div><label className="label">Paper Width</label>
                  <select className="input" value={S('paper_width')||'80mm'} onChange={e=>saveSetting('paper_width',e.target.value)}>
                    <option value="80mm">80mm (Standard)</option>
                    <option value="58mm">58mm (Narrow)</option>
                  </select></div>
                <button onClick={()=>window.api.hardware.testPrint().then(r=>{if(r.success)addToast('success','Test print sent!')})} className="btn-secondary">Test Print</button>

                {/* Auto-print receipt after each sale */}
                <label className="flex items-center gap-3 cursor-pointer pt-2 border-t border-slate-100">
                  <input type="checkbox" checked={S('auto_print_receipt')!=='false'}
                    onChange={e=>saveSetting('auto_print_receipt',e.target.checked?'true':'false')}/>
                  <div>
                    <p className="font-medium text-sm">Auto-print receipt after every sale</p>
                    <p className="text-xs text-slate-500">Prints immediately on payment. Reprint anytime from the Sales page.</p>
                  </div>
                </label>
              </div>

              {/* ── Barcode Scanner Check ── */}
              {/* USB scanners are keyboards that "type" the whole code in under */}
              {/* ~100ms then press Enter. We time the input to verify the device. */}
              <div className="card space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Barcode Scanner Check</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Plug in your USB scanner, click the box below, then scan any barcode.
                    No drivers needed — scanners work as keyboards.
                  </p>
                </div>
                <input
                  className="input font-mono"
                  placeholder="Click here, then scan a barcode…"
                  value={scanTest}
                  onChange={e=>{
                    if (scanTest==='' ) scanT0.current = Date.now()
                    scanT1.current = Date.now()
                    setScanTest(e.target.value)
                    setScanResult('idle')
                  }}
                  onKeyDown={e=>{
                    if (e.key!=='Enter' || scanTest.length<3) return
                    const elapsed = scanT1.current - scanT0.current
                    const perChar = elapsed / Math.max(1, scanTest.length-1)
                    // Scanner: whole code typed at <50ms/char. Human: >120ms/char.
                    setScanResult(perChar < 50 ? 'scanner' : 'keyboard')
                  }}
                />
                {scanResult==='scanner' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800">
                    ✅ <strong>Scanner detected and working.</strong> Code read: <code className="font-mono">{scanTest}</code>.
                    It will work automatically on the POS screen — no setup needed.
                  </div>
                )}
                {scanResult==='keyboard' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                    ⌨️ That looked like manual typing, not a scanner. If your scanner is plugged in,
                    make sure this box is focused and scan again. Check the USB cable and try another port.
                  </div>
                )}
                {(scanResult!=='idle'||scanTest) && (
                  <button onClick={()=>{setScanTest('');setScanResult('idle')}}
                    className="text-xs text-slate-400 hover:text-slate-600">↺ Clear and test again</button>
                )}
              </div>
            </div>
          )}

          {/* ── NETWORK ── */}
          {tab==='network' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800">Network / LAN</h2>
              <div className="card space-y-4">
                <div><label className="label">Mode</label>
                  <select className="input" value={S('network_mode')||'standalone'} onChange={e=>saveSetting('network_mode',e.target.value)}>
                    <option value="standalone">Standalone</option>
                    <option value="server">Server (share DB)</option>
                    <option value="client">Client (connect to server)</option>
                  </select></div>
                {S('network_mode')==='client' && <>
                  <div><label className="label">Server IP</label><input className="input" value={S('lan_server_ip')} onChange={e=>saveSetting('lan_server_ip',e.target.value)} placeholder="192.168.1.100"/></div>
                  <div><label className="label">Port</label><input className="input" value={S('lan_server_port')||'3977'} onChange={e=>saveSetting('lan_server_port',e.target.value)}/></div>
                </>}
                {S('network_mode')==='server' && <>
                  <div><label className="label">Port</label><input className="input" value={S('lan_server_port')||'3977'} onChange={e=>saveSetting('lan_server_port',e.target.value)}/></div>
                </>}
                <div><label className="label">Shared Secret</label>
                  <input className="input" type="password" value={S('lan_secret')} onChange={e=>saveSetting('lan_secret',e.target.value)} placeholder="Same on all computers"/></div>
              </div>
            </div>
          )}

          {/* ── BACKUP ── */}
          {tab==='backup' && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-slate-800">Backup &amp; Restore</h2>

              {/* ── Encryption notice ── */}
              <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <span className="text-xl flex-shrink-0">🔒</span>
                <div>
                  <p className="text-sm font-semibold text-green-800">AES-256 Encrypted Backups</p>
                  <p className="text-xs text-green-700 mt-0.5">
                    Every backup is encrypted with your licence key. Only a NovaPOS installation
                    activated with the same key can restore it — the file is safe even if someone
                    else gets a copy.
                  </p>
                </div>
              </div>

              {/* ── DB file (read-only display) ── */}
              <div className="card bg-slate-50 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Database File</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-white border border-slate-200 rounded px-3 py-2 text-slate-700 truncate">
                    {appPaths?.dbPath || 'Loading…'}
                  </code>
                  <button
                    onClick={()=>{
                      const d = appPaths?.dbPath?.replace(/[\\/\\\\][^\\/\\\\]+$/, '')
                      if (d) window.api.settings.openFolder(d)
                    }}
                    className="btn-secondary text-xs py-1.5 flex-shrink-0">Open</button>
                </div>
              </div>

              {/* ── Backup folder ── */}
              {/* The user picks this folder via Browse only — no hand-typing. */}
              {/* Default = %APPDATA%\nova-pos\backups\                        */}
              {/* Set it to your Google Drive sync folder for cloud backup.    */}
              <div className="card space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Backup Folder</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Encrypted backups are saved here. Last 30 files are kept automatically.
                    <br/>
                    💡 Point this to your <strong>Google Drive Desktop sync folder</strong> for automatic cloud backup.
                  </p>
                </div>
                <div className="flex gap-2">
                  {/* Read-only display — change only via Browse */}
                  <input
                    readOnly
                    className="input flex-1 font-mono text-xs bg-slate-50 cursor-default select-all"
                    value={S('backup_path') || (appPaths?.backupDir || appPaths?.defaultDir || '')}
                    placeholder="Loading backup path…"
                  />
                  <button
                    onClick={async () => {
                      const r = await window.api.settings.chooseFolder()
                      if (r.success && r.data) {
                        await saveSetting('backup_path', r.data)
                        // Refresh appPaths so the display updates
                        const p = await window.api.settings.getAppPaths()
                        if (p.success) setAppPaths(p.data)
                        addToast('success', 'Backup folder updated')
                      }
                    }}
                    className="btn-primary text-xs py-2 flex-shrink-0">Browse</button>
                </div>
                <div className="flex items-center gap-3">
                  {(S('backup_path') || appPaths?.backupDir) && (
                    <button
                      onClick={() => window.api.settings.openFolder(S('backup_path') || appPaths?.backupDir)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      📁 Open folder
                    </button>
                  )}
                  {S('backup_path') && (
                    <button
                      onClick={async () => {
                        await saveSetting('backup_path', '')
                        const p = await window.api.settings.getAppPaths()
                        if (p.success) setAppPaths(p.data)
                        addToast('success', 'Reset to default location')
                      }}
                      className="text-xs text-slate-400 hover:text-slate-600">
                      ↺ Reset to default
                    </button>
                  )}
                </div>
              </div>

              {/* ── Auto-backup schedule ── */}
              <div className="card space-y-4">
                <p className="text-sm font-semibold text-slate-800">Auto Backup</p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={S('backup_enabled') === 'true'}
                    onChange={e => saveSetting('backup_enabled', e.target.checked ? 'true' : 'false')} />
                  <span className="text-sm text-slate-700">Run backup automatically</span>
                </label>
                {S('backup_enabled') === 'true' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Frequency</label>
                      <select className="input" value={S('backup_schedule') || 'daily'}
                        onChange={e => saveSetting('backup_schedule', e.target.value)}>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">At time</label>
                      <input type="time" className="input" value={S('backup_time') || '23:00'}
                        onChange={e => saveSetting('backup_time', e.target.value)} />
                    </div>
                  </div>
                )}
                {/* How many backup files to keep */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-700 font-medium">Keep last</p>
                    <p className="text-xs text-slate-400">Oldest files beyond this limit are deleted automatically</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="1" max="365" step="1"
                      className="input w-20 text-center font-mono"
                      value={S('backup_keep_count') || '30'}
                      onChange={e => {
                        const n = Math.max(1, Math.min(365, parseInt(e.target.value) || 30))
                        saveSetting('backup_keep_count', String(n))
                      }}
                    />
                    <span className="text-sm text-slate-500 font-medium">backups</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  ⚡ If the PC was off or offline at backup time, NovaPOS retries on next startup.
                </p>
              </div>

              {/* ── Actions ── */}
              <div className="card space-y-3">
                {S('last_backup_at') && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="text-green-500">🔒 ✓</span>
                    Last backup: <strong>{new Date(S('last_backup_at')).toLocaleString()}</strong>
                    {S('last_backup_file') && (
                      <code className="text-[10px] text-slate-400 ml-1">
                        {S('last_backup_file').split(/[/\\]/).pop()}
                      </code>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {/* Backup Now — saves to the configured folder */}
                  <button
                    onClick={async () => {
                      const r = await window.api.settings.backupLocal({})
                      if (r.success) {
                        addToast('success', `🔒 Backup saved: ${r.data?.filename}`)
                        setSettings((p: any) => ({
                          ...p,
                          last_backup_at:   new Date().toISOString(),
                          last_backup_file: r.data?.filePath,
                        }))
                      } else {
                        addToast('error', r.error || 'Backup failed')
                      }
                    }}
                    className="btn-primary text-xs py-2.5">🔒 Backup Now</button>

                  {/* Download — save-as dialog, user picks any location */}
                  <button
                    onClick={async () => {
                      const r = await window.api.settings.backup()
                      if (r.success && r.data)
                        addToast('success', `Downloaded: ${r.data.split(/[/\\]/).pop()}`)
                      else if (r.data !== null && !r.success)
                        addToast('error', r.error || 'Failed')
                    }}
                    className="btn-secondary text-xs py-2.5">⬇ Download</button>

                  {/* Restore — accepts .novaenc (encrypted) or .db (legacy) */}
                  <button
                    onClick={() => window.api.settings.restore()}
                    className="btn-secondary text-xs py-2.5">↩ Restore</button>
                </div>
                <p className="text-xs text-slate-400">
                  Restore accepts encrypted <code>.novaenc</code> or legacy <code>.db</code> files.
                  To restore on a new machine, activate with the same licence key first.
                </p>
              </div>
            </div>
          )}

          {/* ── CLOUD SYNC ── */}
          {tab==='cloud' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800">Cloud Sync</h2>
              <SyncSettings />
            </div>
          )}

          {/* ── DEVELOPER ── */}
          {tab==='dev' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800">Developer Access</h2>
              <div className="card space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                  <p className="font-semibold">⚠️ Vendor Support Access</p>
                  <p className="mt-1">Login: <code className="font-mono bg-amber-100 px-1 rounded">nova.support</code> / rotating password (run <code className="font-mono text-xs">node scripts/get-dev-password.js</code>)</p>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={S('dev_login_enabled')!=='false'} onChange={e=>saveSetting('dev_login_enabled',e.target.checked?'true':'false')}/>
                  <div><p className="font-medium text-sm">Allow developer maintenance login</p>
                    <p className="text-xs text-slate-500">Disable for maximum security</p></div>
                </label>
              </div>

              {/* ── Database Reset (admin only) ── */}
              {['admin','owner'].includes(user?.role||'') && (
                <div className="card border-red-200 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-red-700">⚠️ Delete Database (Fresh Start)</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Permanently deletes ALL data — sales, products, customers, staff, settings.
                      The app restarts with an empty database. Use when setting up a new installation
                      from scratch or wiping a demo/test database.
                    </p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 space-y-1">
                    <p><strong>Before deleting:</strong></p>
                    <p>① Go to Backup tab → Backup Now (save an encrypted copy)</p>
                    <p>② Export any reports you need to keep</p>
                    <p>③ Then return here and click Delete</p>
                  </div>
                  <button
                    onClick={async()=>{
                      const typed = window.prompt(
                        'Type DELETE to confirm you want to erase all data:\n\n' +
                        'This will delete every sale, product, customer, and setting.\n' +
                        'The app restarts fresh. This cannot be undone.'
                      )
                      if (typed !== 'DELETE') {
                        if (typed !== null) addToast('error','You must type DELETE exactly to confirm')
                        return
                      }
                      const r = await window.api.settings.resetDatabase('RESET')
                      if (!r.success) addToast('error', r.error || 'Reset failed')
                      // On success the app restarts — this code never runs
                    }}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl text-sm transition">
                    🗑️ Delete All Data &amp; Start Fresh
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Category edit modal */}
      {catForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800">{catForm.id ? 'Edit' : 'Add'} Category</h3>
              <button onClick={()=>setCatForm(null)}><X className="w-5 h-5 text-slate-400"/></button>
            </div>
            <div><label className="label">Category Name</label>
              <input className="input" value={catForm.name} onChange={e=>setCatForm(p=>p?({...p,name:e.target.value}):null)} placeholder="e.g. Beverages" autoFocus/></div>
            <div><label className="label">Color</label>
              <div className="flex gap-2 flex-wrap mt-1">
                {COLORS.map(c=>(
                  <button key={c} onClick={()=>setCatForm(p=>p?({...p,color:c}):null)}
                    className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${catForm.color===c?'ring-2 ring-offset-2 ring-blue-500 scale-110':''}`}
                    style={{backgroundColor:c}}/>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setCatForm(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={saveCategory} className="btn-primary flex-1">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
