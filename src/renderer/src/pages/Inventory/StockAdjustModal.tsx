import { useState } from 'react'
import { Product } from '@shared/types'
import { useAuthStore } from '../../store/authStore'
import { useAppStore } from '../../store/appStore'
import { X, TrendingUp, TrendingDown } from 'lucide-react'

const REASONS = ['restock','damage','theft','correction','return'] as const

interface Props { product:Product; onClose:()=>void; onSaved:()=>void }
export default function StockAdjustModal({product, onClose, onSaved}: Props) {
  const {user} = useAuthStore()
  const {addToast, profile} = useAppStore()
  const [qty, setQty] = useState('')
  const [type, setType] = useState<'add'|'remove'>('add')
  const [reason, setReason] = useState('restock')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const sym = profile?.currency_symbol ?? '₦'
  const change = type==='add' ? Math.abs(parseFloat(qty)||0) : -Math.abs(parseFloat(qty)||0)
  const newQty = product.stock_qty + change

  async function save() {
    if (!qty || !user) return
    setSaving(true)
    const r = await window.api.inventory.adjust({ product_id:product.id, adjusted_by:user.id, qty_change:change, reason, notes:notes||undefined })
    setSaving(false)
    if (r.success) { addToast('success','Stock updated'); onSaved() }
    else addToast('error', r.error||'Failed')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div><h2 className="text-lg font-bold">Adjust Stock</h2><p className="text-sm text-slate-500">{product.name}</p></div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-sm text-slate-500">Current Stock</p>
            <p className="text-3xl font-bold text-slate-800">{product.stock_qty} <span className="text-sm font-normal text-slate-400">{product.unit}</span></p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['add','remove'] as const).map(t=>(
              <button key={t} onClick={()=>setType(t)} className={`py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition border-2
                ${type===t?(t==='add'?'border-green-500 bg-green-50 text-green-700':'border-red-500 bg-red-50 text-red-700'):'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                {t==='add'?<TrendingUp className="w-4 h-4"/>:<TrendingDown className="w-4 h-4"/>}
                {t==='add'?'Add Stock':'Remove Stock'}
              </button>
            ))}
          </div>
          <div><label className="label">Quantity</label><input type="number" step="0.01" value={qty} onChange={e=>setQty(e.target.value)} className="input text-lg text-center font-bold" placeholder="0"/></div>
          <div><label className="label">Reason</label>
            <select className="input" value={reason} onChange={e=>setReason(e.target.value)}>
              {REASONS.map(r=><option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
            </select>
          </div>
          <div><label className="label">Notes (optional)</label><input className="input" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Reason details..."/></div>
          {qty&&(
            <div className={`rounded-lg p-3 text-sm flex justify-between ${newQty<0?'bg-red-50 text-red-700':'bg-slate-50 text-slate-700'}`}>
              <span>New quantity:</span>
              <span className="font-bold">{newQty.toFixed(2)} {product.unit}</span>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving||!qty||newQty<0} className="btn-primary flex-1">{saving?'Saving...':'Save Adjustment'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
