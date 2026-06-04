import { useState, useEffect } from 'react'
export default function HardwareSetup({ onNext }: { onNext: () => void }) {
  const [printers, setPrinters] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [width, setWidth] = useState('80mm')
  useEffect(() => { window.api.hardware.listPrinters().then((r:any)=>r.success&&setPrinters(r.data)) }, [])
  async function save() {
    await window.api.settings.set('printer_name', selected)
    await window.api.settings.set('paper_width', width)
    onNext()
  }
  return (
    <div className="space-y-4">
      <div><label className="label">Receipt Printer</label>
        <select className="input" value={selected} onChange={e=>setSelected(e.target.value)}>
          <option value="">Select printer...</option>
          {printers.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div><label className="label">Paper Width</label>
        <select className="input" value={width} onChange={e=>setWidth(e.target.value)}>
          <option value="80mm">80mm (Standard)</option>
          <option value="58mm">58mm (Narrow)</option>
        </select>
      </div>
      <p className="text-xs text-slate-500">Barcode scanners (USB HID) are auto-detected. No configuration needed.</p>
      <div className="flex gap-3">
        <button onClick={()=>window.api.hardware.testPrint()} disabled={!selected} className="btn-secondary flex-1">Test Print</button>
        <button onClick={save} className="btn-primary flex-1">Save & Continue</button>
      </div>
    </div>
  )
}
