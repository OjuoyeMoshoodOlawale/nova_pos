import { useState, useEffect } from 'react'
import { Sale } from '@shared/types'
import { useAppStore } from '../../store/appStore'
import DataTable, { Column } from '../../components/DataTable/DataTable'
import { format } from 'date-fns'
import { Eye, RefreshCw, Send, XCircle } from 'lucide-react'

export default function SalesHistory() {
  const {addToast, profile} = useAppStore()
  const sym = profile?.currency_symbol??'₦'
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(format(new Date(),'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(),'yyyy-MM-dd'))
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<Sale|null>(null)
  const [detail, setDetail] = useState<any>(null)

  async function load(){setLoading(true);const r=await window.api.sales.getAll({dateFrom:dateFrom+' 00:00:00',dateTo:dateTo+' 23:59:59',status:status||undefined});if(r.success)setSales(r.data);setLoading(false)}
  useEffect(()=>{load()},[])

  async function viewDetail(sale:Sale){
    setSelected(sale)
    const r=await window.api.sales.getById(sale.id)
    if(r.success) setDetail(r.data)
  }

  const totalRev=sales.filter(s=>s.status==='completed').reduce((s,sale)=>s+sale.total_amount,0)

  const cols: Column<Sale>[]=[
    {key:'receipt_no',label:'Receipt',render:s=><span className="font-mono text-xs font-bold text-blue-600">{s.receipt_no}</span>},
    {key:'sale_date',label:'Date',render:s=><span className="text-xs text-slate-600">{format(new Date(s.sale_date),'dd/MM/yy HH:mm')}</span>},
    {key:'cashier_name',label:'Cashier',render:s=><span className="text-sm">{s.cashier_name}</span>},
    {key:'customer_name',label:'Customer',render:s=><span className="text-sm">{s.customer_name||'—'}</span>},
    {key:'total_amount',label:'Total',render:s=><span className="font-bold text-slate-800">{sym}{s.total_amount.toFixed(2)}</span>},
    {key:'status',label:'Status',render:s=>(
      <span className={`badge ${s.status==='completed'?'bg-green-100 text-green-700':s.status==='voided'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}`}>{s.status}</span>
    )},
  ]

  return(
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-800">Sales History</h1><p className="text-sm text-slate-500">{sales.length} records · {sym}{totalRev.toLocaleString('en',{minimumFractionDigits:2})} total</p></div>
      </div>
      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className="label">From</label><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="input"/></div>
          <div><label className="label">To</label><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="input"/></div>
          <div><label className="label">Status</label><select value={status} onChange={e=>setStatus(e.target.value)} className="input"><option value="">All</option><option value="completed">Completed</option><option value="voided">Voided</option></select></div>
          <button onClick={load} className="btn-primary flex items-center gap-2"><RefreshCw className="w-4 h-4"/> Search</button>
        </div>
      </div>
      <DataTable columns={cols} data={sales} isLoading={loading} searchKeys={['receipt_no','cashier_name','customer_name']} searchPlaceholder="Search sales..." emptyText="No sales found."
        actions={s=>(
          <div className="flex gap-1">
            <button onClick={()=>viewDetail(s)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg"><Eye className="w-4 h-4"/></button>
          </div>
        )}
      />
      {selected&&detail&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <div><h2 className="font-bold text-slate-800">Sale Detail</h2><p className="text-xs text-slate-500 font-mono">{selected.receipt_no}</p></div>
              <button onClick={()=>{setSelected(null);setDetail(null)}} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[['Date',format(new Date(selected.sale_date),'dd/MM/yyyy HH:mm')],['Cashier',selected.cashier_name],['Customer',selected.customer_name||'Walk-in'],['Status',selected.status]].map(([k,v])=><div key={k}><p className="text-xs text-slate-500">{k}</p><p className="font-medium">{v}</p></div>)}
              </div>
              <table className="w-full text-sm"><thead><tr className="border-b border-slate-100">{['Product','Qty','Price','Total'].map(h=><th key={h} className="pb-2 text-left text-xs text-slate-500">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {detail.items?.map((i:any)=><tr key={i.id}><td className="py-2">{i.product_name}</td><td>{i.quantity}</td><td>{sym}{i.unit_price.toFixed(2)}</td><td className="font-medium">{sym}{i.line_total.toFixed(2)}</td></tr>)}
                </tbody>
              </table>
              <div className="bg-slate-50 rounded-xl p-3 space-y-1 text-sm">
                {[['Subtotal',sym+selected.subtotal.toFixed(2)],['Discount',`-${sym}${selected.discount_amt.toFixed(2)}`],['Tax',sym+selected.tax_amount.toFixed(2)],['TOTAL',sym+selected.total_amount.toFixed(2)]].map(([k,v])=><div key={k} className={`flex justify-between ${k==='TOTAL'?'font-bold text-base border-t border-slate-200 pt-1 mt-1':''}`}><span>{k}</span><span>{v}</span></div>)}
              </div>
              <div className="flex gap-3">
                <button onClick={()=>window.api.hardware.print({saleId:selected.id})} className="btn-secondary flex-1">Reprint Receipt</button>
                {selected.status==='completed'&&<button onClick={async()=>{const r=window.prompt('Void reason?');if(r){await window.api.sales.void(selected.id,r,1);addToast('success','Sale voided');setSelected(null);setDetail(null);load()}}} className="btn-danger flex-1">Void Sale</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
