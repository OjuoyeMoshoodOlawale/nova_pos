// src/renderer/src/pages/POS/HoldOrderModal.tsx
import { useState, useEffect } from 'react'
import { useCartStore } from '../../store/cartStore'
import { useAuthStore } from '../../store/authStore'
import { useAppStore }  from '../../store/appStore'
import { HeldOrder } from '@shared/types'
import { X, Pause, ArrowDownCircle, Trash2, Clock } from 'lucide-react'

interface Props { onClose:()=>void; onRetrieve:(cartJson:string)=>void }

export default function HoldOrderModal({onClose, onRetrieve}: Props) {
  const cart = useCartStore()
  const {user} = useAuthStore()
  const {addToast} = useAppStore()
  const [held, setHeld] = useState<HeldOrder[]>([])
  const [label, setLabel] = useState('')
  const [tab, setTab] = useState<'hold'|'retrieve'>('hold')
  const totals = cart.getTotals()

  useEffect(() => {
    window.api.sales.getHeld().then(r=>{ if(r.success) setHeld(r.data) })
  }, [])

  async function handleHold() {
    if (!user || cart.items.length===0) { addToast('error','Cart is empty'); return }
    const r = await window.api.sales.hold(JSON.stringify({items:cart.items}), label||null, cart.customerId, user.id)
    if (r.success) { addToast('success','Order held'); cart.clearCart(); onClose() }
    else addToast('error', r.error||'Failed')
  }

  async function handleRetrieve(id:number) {
    const r = await window.api.sales.releaseHeld(id)
    if (r.success) { onRetrieve(r.data); setHeld(p=>p.filter(h=>h.id!==id)) }
    else addToast('error','Failed to retrieve')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold">Hold Orders</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button>
        </div>
        <div className="flex border-b border-slate-100">
          {(['hold','retrieve'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} className={`flex-1 py-3 text-sm font-medium capitalize transition ${tab===t?'border-b-2 border-blue-600 text-blue-600':'text-slate-500 hover:text-slate-700'}`}>{t==='hold'?'Hold Current Order':'Retrieve Held'} {t==='retrieve'&&held.length>0&&`(${held.length})`}</button>
          ))}
        </div>
        <div className="p-6">
          {tab==='hold' ? (
            <div className="space-y-4">
              {cart.items.length===0?<p className="text-slate-500 text-sm text-center py-4">Cart is empty — nothing to hold.</p>:(
                <>
                  <div className="bg-slate-50 rounded-xl p-3 text-sm space-y-1">
                    {cart.items.map(i=><div key={i.product_id} className="flex justify-between"><span>{i.product_name} x{i.quantity}</span><span className="font-medium">{cart.currencySymbol}{i.line_total.toFixed(2)}</span></div>)}
                    <div className="flex justify-between font-bold pt-1 border-t border-slate-200"><span>Total</span><span>{cart.currencySymbol}{totals.total.toFixed(2)}</span></div>
                  </div>
                  <div><label className="label">Order Label (optional)</label><input value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. Table 3, John's order..." className="input"/></div>
                  <button onClick={handleHold} className="w-full btn-primary flex items-center justify-center gap-2"><Pause className="w-4 h-4"/> Hold Order</button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {held.length===0?<p className="text-slate-500 text-sm text-center py-8">No held orders.</p>:held.map(h=>(
                <div key={h.id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-800 truncate">{h.label||'Unnamed order'}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3"/>{new Date(h.held_at).toLocaleTimeString()}</p>
                  </div>
                  <button onClick={()=>handleRetrieve(h.id)} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg"><ArrowDownCircle className="w-5 h-5"/></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
