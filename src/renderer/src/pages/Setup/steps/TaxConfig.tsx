import { useState } from 'react'
export default function TaxConfig({ onNext }: { onNext: () => void }) {
  const [d, setD] = useState({ tax_name:'VAT', tax_rate:'7.5', tax_inclusive:false })
  async function save() {
    await window.api.settings.set('tax_name', d.tax_name)
    await window.api.settings.set('tax_rate', d.tax_rate)
    await window.api.settings.set('tax_inclusive', d.tax_inclusive ? 'true':'false')
    onNext()
  }
  return (
    <div className="space-y-4">
      <div><label className="label">Tax Name (e.g. VAT, GST)</label><input className="input" value={d.tax_name} onChange={e=>setD(p=>({...p,tax_name:e.target.value}))}/></div>
      <div><label className="label">Tax Rate (%)</label><input className="input" type="number" step="0.1" value={d.tax_rate} onChange={e=>setD(p=>({...p,tax_rate:e.target.value}))}/></div>
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={d.tax_inclusive} onChange={e=>setD(p=>({...p,tax_inclusive:e.target.checked}))} className="w-4 h-4"/>
        <span className="text-sm text-slate-700">Prices are tax-inclusive (tax already included in selling price)</span>
      </label>
      <button onClick={save} className="w-full btn-primary">Save & Continue</button>
    </div>
  )
}
