// src/renderer/src/pages/POS/PaymentModal.tsx
import { useState } from 'react'
import { useCartStore } from '../../store/cartStore'
import { useAuthStore } from '../../store/authStore'
import { useAppStore }  from '../../store/appStore'
import { PaymentMethod } from '@shared/types'
import { X, CreditCard, Banknotes, ArrowsRightLeft, CheckCircle, Printer } from 'lucide-react'

interface Totals { subtotal:number; orderDiscountAmt:number; taxAmount:number; total:number }
interface Props { totals: Totals; onClose:()=>void; onSuccess:(saleId:number,receiptNo:string)=>void }

const METHODS: {method:PaymentMethod; label:string; icon:string}[] = [
  {method:'cash',label:'Cash',icon:'💵'},
  {method:'card',label:'Card',icon:'💳'},
  {method:'transfer',label:'Transfer',icon:'🏦'},
  {method:'credit',label:'Credit',icon:'📋'},
]

export default function PaymentModal({totals, onClose, onSuccess}: Props) {
  const cart = useCartStore()
  const {user} = useAuthStore()
  const {addToast, profile} = useAppStore()
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [tendered, setTendered] = useState(totals.total.toFixed(2))
  const [reference, setReference] = useState('')
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState<{saleId:number; receiptNo:string; change:number}|null>(null)

  const change = method==='cash' ? Math.max(0, parseFloat(tendered||'0') - totals.total) : 0
  const sym = cart.currencySymbol

  async function handlePay() {
    if (!user) return
    // Guard: cash tendered must cover the total. Prevents recording a sale as
    // paid when the customer hasn't given enough (use a proper credit flow for
    // part-payments instead).
    if (method === 'cash') {
      const paid = parseFloat(tendered || '0')
      if (paid < totals.total) {
        addToast('error', `Amount paid (${sym}${paid.toFixed(2)}) is less than the total (${sym}${totals.total.toFixed(2)})`)
        return
      }
    }
    setProcessing(true)
    const input = {
      items: cart.items,
      customer_id: cart.customerId,
      served_by: user.id,
      discount_pct: cart.orderDiscountPct,
      discount_amt: totals.orderDiscountAmt,
      tax_amount: totals.taxAmount,
      total_amount: totals.total,
      payments: [{method, amount: method==='cash' ? parseFloat(tendered||'0') : totals.total, reference: reference||undefined}],
    }
    const r = await window.api.sales.complete(input)
    setProcessing(false)
    if (r.success && r.data) {
      setDone({saleId:r.data.saleId, receiptNo:r.data.receiptNo, change:r.data.change})
    } else {
      addToast('error', r.error||'Sale failed')
    }
  }

  async function handlePrint() {
    if (!done) return
    await window.api.hardware.print({saleId: done.saleId})
  }

  if (done) return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600"/>
        </div>
        <h2 className="text-xl font-bold text-slate-800">Sale Complete!</h2>
        <p className="text-slate-500 mt-1">Receipt: <span className="font-mono font-bold">{done.receiptNo}</span></p>
        {done.change > 0 && <div className="mt-4 bg-green-50 rounded-xl p-4"><p className="text-sm text-green-700">Change due</p><p className="text-3xl font-bold text-green-600">{sym}{done.change.toFixed(2)}</p></div>}
        <div className="mt-6 space-y-2">
          <button onClick={handlePrint} className="w-full btn-secondary flex items-center justify-center gap-2"><Printer className="w-4 h-4"/> Print Receipt</button>
          <button onClick={()=>onSuccess(done.saleId, done.receiptNo)} className="w-full btn-primary">New Sale</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Payment</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-sm text-slate-500">Total Due</p>
            <p className="text-4xl font-bold text-blue-600">{sym}{totals.total.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Payment Method</p>
            <div className="grid grid-cols-4 gap-2">
              {METHODS.map(m=>(
                <button key={m.method} onClick={()=>setMethod(m.method)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-medium transition
                    ${method===m.method?'border-blue-500 bg-blue-50 text-blue-700':'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  <span className="text-xl">{m.icon}</span>{m.label}
                </button>
              ))}
            </div>
          </div>
          {method==='cash' && (
            <div>
              <label className="label">Amount Tendered</label>
              <input type="number" value={tendered} onChange={e=>setTendered(e.target.value)} className="input text-xl font-bold text-right" step="50"/>
              {change>0 && <div className="mt-2 flex justify-between text-green-600 font-bold text-lg"><span>Change:</span><span>{sym}{change.toFixed(2)}</span></div>}
            </div>
          )}
          {(method==='card'||method==='transfer') && (
            <div><label className="label">Reference (optional)</label><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Transaction reference..." className="input"/></div>
          )}
          <button onClick={handlePay} disabled={processing||(method==='cash'&&parseFloat(tendered||'0')<totals.total)}
            className="w-full btn-primary py-4 text-lg font-bold">
            {processing?'Processing...':`Confirm ${sym}${totals.total.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
