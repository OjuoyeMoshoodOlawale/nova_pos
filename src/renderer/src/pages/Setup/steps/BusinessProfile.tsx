import { useState } from 'react'
const TYPES = ['retail','restaurant','pharmacy','salon','electronics','supermarket','other']
export default function BusinessProfile({ onNext }: { onNext: () => void }) {
  const [d, setD] = useState({ name:'', type:'retail', address:'', phone:'', email:'', currency_code:'NGN', currency_symbol:'₦', tax_name:'VAT', tax_rate:7.5, tax_inclusive:false, receipt_header:'', receipt_footer:'Thank you for your patronage!', show_logo:true, logo_path:null })
  const set = (k: string, v: any) => setD((p) => ({...p,[k]:v}))
  async function save() {
    if (!d.name.trim()) { alert('Business name is required'); return }
    await window.api.profile.save(d)
    onNext()
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><label className="label">Business Name *</label><input className="input" value={d.name} onChange={e=>set('name',e.target.value)} placeholder="My Store Ltd"/></div>
        <div><label className="label">Business Type</label><select className="input" value={d.type} onChange={e=>set('type',e.target.value)}>{TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</select></div>
        <div><label className="label">Phone</label><input className="input" value={d.phone} onChange={e=>set('phone',e.target.value)} placeholder="+234..."/></div>
        <div className="col-span-2"><label className="label">Address</label><input className="input" value={d.address} onChange={e=>set('address',e.target.value)} placeholder="Street, City"/></div>
        <div><label className="label">Currency Code</label><input className="input" value={d.currency_code} onChange={e=>set('currency_code',e.target.value)}/></div>
        <div><label className="label">Currency Symbol</label><input className="input" value={d.currency_symbol} onChange={e=>set('currency_symbol',e.target.value)}/></div>
      </div>
      <button onClick={save} className="w-full btn-primary">Save & Continue</button>
    </div>
  )
}
