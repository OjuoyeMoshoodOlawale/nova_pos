import { useState } from 'react'
import { Plus, Trash2, Package } from 'lucide-react'
interface StockItem { name:string; sku:string; cost_price:string; selling_price:string; qty:string }
export default function OpeningStock({ onNext }: { onNext: () => void }) {
  const [items, setItems] = useState<StockItem[]>([{ name:'', sku:'', cost_price:'', selling_price:'', qty:'' }])
  const [saving, setSaving] = useState(false)
  const add = () => setItems(p=>[...p,{ name:'', sku:'', cost_price:'', selling_price:'', qty:'' }])
  const remove = (i:number) => setItems(p=>p.filter((_,idx)=>idx!==i))
  const update = (i:number, k:string, v:string) => setItems(p=>p.map((r,idx)=>idx===i?{...r,[k]:v}:r))
  async function save() {
    const valid = items.filter(i=>i.name.trim() && parseFloat(i.qty)>0)
    if (valid.length > 0) {
      setSaving(true)
      const payload = valid.map(i=>({ name:i.name.trim(), sku:i.sku||undefined, cost_price:parseFloat(i.cost_price)||0, selling_price:parseFloat(i.selling_price)||0, qty:parseFloat(i.qty) }))
      // Use admin user id=1 (first user created)
      await window.api.inventory.setOpening(payload, 1)
      setSaving(false)
    }
    onNext()
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Add your current stock. You can skip this and add products later in Inventory.</p>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input placeholder="Product Name *" value={item.name} onChange={e=>update(i,'name',e.target.value)} className="input col-span-4 text-sm"/>
            <input placeholder="SKU" value={item.sku} onChange={e=>update(i,'sku',e.target.value)} className="input col-span-2 text-sm"/>
            <input placeholder="Cost" type="number" value={item.cost_price} onChange={e=>update(i,'cost_price',e.target.value)} className="input col-span-2 text-sm"/>
            <input placeholder="Price" type="number" value={item.selling_price} onChange={e=>update(i,'selling_price',e.target.value)} className="input col-span-2 text-sm"/>
            <input placeholder="Qty" type="number" value={item.qty} onChange={e=>update(i,'qty',e.target.value)} className="input col-span-1 text-sm"/>
            <button onClick={()=>remove(i)} className="col-span-1 text-red-400 hover:text-red-600 flex justify-center"><Trash2 className="w-4 h-4"/></button>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={add} className="btn-secondary flex items-center gap-2"><Plus className="w-4 h-4"/> Add Row</button>
        <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving?'Saving...':'Save Stock & Continue'}</button>
        <button onClick={onNext} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Skip →</button>
      </div>
    </div>
  )
}
