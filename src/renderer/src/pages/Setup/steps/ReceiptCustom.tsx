import { useState } from 'react'
export default function ReceiptCustom({ onNext }: { onNext: () => void }) {
  const [d, setD] = useState({ header:'', footer:'Thank you for your patronage!' })
  async function save() {
    await window.api.settings.set('receipt_header', d.header)
    await window.api.settings.set('receipt_footer', d.footer)
    onNext()
  }
  return (
    <div className="space-y-4">
      <div><label className="label">Receipt Header Text</label><textarea className="input h-20" value={d.header} onChange={e=>setD(p=>({...p,header:e.target.value}))} placeholder="e.g. Thank you for shopping with us! All sales final."/></div>
      <div><label className="label">Receipt Footer Text</label><textarea className="input h-20" value={d.footer} onChange={e=>setD(p=>({...p,footer:e.target.value}))}/></div>
      <button onClick={save} className="w-full btn-primary">Save & Continue</button>
    </div>
  )
}
