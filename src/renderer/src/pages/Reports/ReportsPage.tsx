import { useState } from 'react'
import { format } from 'date-fns'
import { useAppStore } from '../../store/appStore'
import { BarChart,Bar,LineChart,Line,PieChart,Pie,Cell,Tooltip,ResponsiveContainer,XAxis,YAxis,CartesianGrid,Legend } from 'recharts'
import { BarChart3, Package, TrendingUp, RefreshCw, Download, Mail } from 'lucide-react'
const COLORS=['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4']
const TABS=[{id:'daily',l:'Daily',icon:BarChart3},{id:'monthly',l:'Monthly',icon:TrendingUp},{id:'yearly',l:'Yearly',icon:TrendingUp},{id:'inventory',l:'Inventory',icon:Package},{id:'pl',l:'P&L',icon:BarChart3}] as const
type Tab = typeof TABS[number]['id']

export default function ReportsPage(){
  const {profile,addToast}=useAppStore()
  const sym=profile?.currency_symbol??'₦'
  const [tab,setTab]=useState<Tab>('daily')
  const [data,setData]=useState<any>(null)
  const [loading,setLoading]=useState(false)
  const [date,setDate]=useState(format(new Date(),'yyyy-MM-dd'))
  const [year,setYear]=useState(new Date().getFullYear())
  const [month,setMonth]=useState(new Date().getMonth()+1)
  const [plFrom,setPlFrom]=useState(format(new Date(new Date().getFullYear(),0,1),'yyyy-MM-dd'))
  const [plTo,setPlTo]=useState(format(new Date(),'yyyy-MM-dd'))

  async function load(){
    setLoading(true); setData(null)
    let r:any
    if(tab==='daily') r=await window.api.reports.daily(date); else if(tab==='monthly') r=await window.api.reports.monthly(year,month); else if(tab==='yearly') r=await window.api.reports.yearly(year); else if(tab==='inventory') r=await window.api.reports.inventory(); else if(tab==='pl') r=await window.api.reports.profitLoss(plFrom,plTo)
    if(r?.success) setData(r.data); else addToast('error',r?.error||'Failed')
    setLoading(false)
  }

  async function emailReport(){
    const r=await window.api.reports.emailSend(tab==='daily'?date:undefined)
    if(r.success) addToast('success','Report emailed!'); else addToast('error',r.error||'Email failed')
  }

  function fmt(n:number){return `${sym}${n.toLocaleString('en',{minimumFractionDigits:2})}`}

  return(
    <div className="p-6 space-y-5 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-800">Reports</h1><p className="text-sm text-slate-500">Sales and inventory analytics</p></div>
        <div className="flex gap-2">
          {data&&<button onClick={emailReport} className="btn-secondary flex items-center gap-2 text-sm"><Mail className="w-4 h-4"/> Email Report</button>}
          <button onClick={load} disabled={loading} className="btn-primary flex items-center gap-2 text-sm"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/>{loading?'Loading...':'Generate'}</button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {TABS.map(t=>{const Icon=t.icon;return(
          <button key={t.id} onClick={()=>{setTab(t.id);setData(null)}} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition flex-1 justify-center ${tab===t.id?'bg-white shadow-sm text-blue-600':'text-slate-600 hover:text-slate-800'}`}>
            <Icon className="w-4 h-4"/>{t.l}
          </button>
        )})}
      </div>

      {/* Controls */}
      <div className="card flex flex-wrap gap-3 items-end">
        {tab==='daily'&&<div><label className="label">Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="input"/></div>}
        {(tab==='monthly'||tab==='yearly')&&<><div><label className="label">Year</label><input type="number" value={year} onChange={e=>setYear(parseInt(e.target.value))} className="input w-28"/></div>
          {tab==='monthly'&&<div><label className="label">Month</label><select value={month} onChange={e=>setMonth(parseInt(e.target.value))} className="input">{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select></div>}
        </>}
        {tab==='pl'&&<><div><label className="label">From</label><input type="date" value={plFrom} onChange={e=>setPlFrom(e.target.value)} className="input"/></div><div><label className="label">To</label><input type="date" value={plTo} onChange={e=>setPlTo(e.target.value)} className="input"/></div></>}
        <button onClick={load} disabled={loading} className="btn-primary">{loading?'...':'Generate Report'}</button>
      </div>

      {/* Report content */}
      {data&&(
        <div className="space-y-4">
          {/* Summary metrics */}
          {(tab==='daily'||tab==='monthly'||tab==='yearly')&&data.totalRevenue!=null&&(
            <div className="grid grid-cols-4 gap-4">
              {[{l:'Revenue',v:fmt(data.totalRevenue),c:'text-blue-600'},{l:'Gross Profit',v:fmt(data.grossProfit||0),c:'text-green-600'},{l:'Margin',v:`${(data.profitMarginPct||0).toFixed(1)}%`,c:'text-purple-600'},{l:'Transactions',v:String(data.totalTransactions||data.transactionCount||0),c:'text-slate-700'}].map(m=>(
                <div key={m.l} className="card text-center"><p className="text-xs text-slate-500">{m.l}</p><p className={`text-xl font-bold ${m.c} mt-1`}>{m.v}</p></div>
              ))}
            </div>
          )}

          {/* Daily hourly chart */}
          {tab==='daily'&&data.hourlySales?.length>0&&(
            <div className="card"><h3 className="text-sm font-semibold text-slate-700 mb-4">Revenue by Hour</h3>
              <ResponsiveContainer width="100%" height={220}><BarChart data={data.hourlySales.map((h:any)=>({hour:`${String(h.hour).padStart(2,'0')}h`,revenue:h.revenue||0}))} barSize={24}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="hour" tick={{fontSize:11}} tickLine={false}/><YAxis tick={{fontSize:11}} tickLine={false} tickFormatter={v=>`${sym}${v}`}/><Tooltip formatter={(v:any)=>[`${sym}${Number(v).toFixed(2)}`,'Revenue']}/><Bar dataKey="revenue" fill="#3b82f6" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer>
            </div>
          )}

          {/* Monthly daily chart */}
          {tab==='monthly'&&data.dailyBreakdown?.length>0&&(
            <div className="card"><h3 className="text-sm font-semibold text-slate-700 mb-4">Daily Revenue</h3>
              <ResponsiveContainer width="100%" height={220}><LineChart data={data.dailyBreakdown}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="date" tick={{fontSize:10}} tickLine={false} tickFormatter={v=>v.slice(8)}/><YAxis tick={{fontSize:11}} tickLine={false} tickFormatter={v=>`${sym}${v}`}/><Tooltip formatter={(v:any)=>[`${sym}${Number(v).toFixed(2)}`,'Revenue']}/><Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer>
            </div>
          )}

          {/* Yearly monthly chart */}
          {tab==='yearly'&&data.monthlyBreakdown&&(
            <div className="card"><h3 className="text-sm font-semibold text-slate-700 mb-4">Monthly Revenue — {data.year}</h3>
              <ResponsiveContainer width="100%" height={220}><BarChart data={data.monthlyBreakdown} barSize={28}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="month" tick={{fontSize:11}} tickLine={false}/><YAxis tick={{fontSize:11}} tickLine={false} tickFormatter={v=>`${sym}${v}`}/><Tooltip formatter={(v:any)=>[`${sym}${Number(v).toFixed(2)}`,'Revenue']}/><Bar dataKey="revenue" fill="#3b82f6" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer>
            </div>
          )}

          {/* Top products table */}
          {data.topProducts?.length>0&&(
            <div className="card"><h3 className="text-sm font-semibold text-slate-700 mb-3">Top Products</h3>
              <table className="w-full text-sm"><thead><tr className="border-b border-slate-100">{['Product','Qty Sold','Revenue'].map(h=><th key={h} className="pb-2 text-left text-xs text-slate-500 font-medium">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-50">{data.topProducts.map((p:any,i:number)=><tr key={i}><td className="py-2 font-medium text-slate-800">{p.name}</td><td className="py-2 text-slate-600">{p.qty}</td><td className="py-2 font-bold text-blue-600">{fmt(p.revenue)}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          {/* Inventory report */}
          {tab==='inventory'&&(
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[{l:'Total Products',v:data.totalProducts},{l:`Stock Cost Value`,v:fmt(data.totalStockValue)},{l:'Retail Value',v:fmt(data.totalRetailValue)}].map(m=>(
                  <div key={m.l} className="card text-center"><p className="text-xs text-slate-500">{m.l}</p><p className="text-xl font-bold text-slate-800 mt-1">{m.v}</p></div>
                ))}
              </div>
              {data.lowStockItems?.length>0&&<div className="card"><h3 className="font-semibold text-sm text-amber-600 mb-3">Low Stock ({data.lowStockItems.length})</h3><div className="space-y-1.5">{data.lowStockItems.map((p:any)=><div key={p.id} className="flex justify-between text-sm bg-amber-50 rounded-lg px-3 py-2"><span className="font-medium">{p.name}</span><span className="text-amber-600">{p.stock_qty} {p.unit} remaining</span></div>)}</div></div>}
              {data.outOfStockItems?.length>0&&<div className="card"><h3 className="font-semibold text-sm text-red-600 mb-3">Out of Stock ({data.outOfStockItems.length})</h3><div className="space-y-1.5">{data.outOfStockItems.map((p:any)=><div key={p.id} className="text-sm bg-red-50 rounded-lg px-3 py-2 text-red-700 font-medium">{p.name}</div>)}</div></div>}
              {data.categoryBreakdown?.length>0&&<div className="card"><h3 className="font-semibold text-sm text-slate-700 mb-3">By Category</h3><table className="w-full text-sm"><thead><tr className="border-b"><th className="pb-2 text-left text-xs text-slate-500">Category</th><th className="pb-2 text-left text-xs text-slate-500">Products</th><th className="pb-2 text-left text-xs text-slate-500">Stock Value</th></tr></thead><tbody className="divide-y divide-slate-50">{data.categoryBreakdown.map((c:any)=><tr key={c.category}><td className="py-2 font-medium">{c.category}</td><td className="py-2">{c.count}</td><td className="py-2 text-blue-600 font-medium">{fmt(c.value)}</td></tr>)}</tbody></table></div>}
            </div>
          )}

          {/* P&L report */}
          {tab==='pl'&&data.revenue!=null&&(
            <div className="card space-y-3">
              <h3 className="font-semibold text-slate-700">Profit & Loss — {data.period}</h3>
              <div className="space-y-2">
                {[{l:'Revenue',v:data.revenue,c:'text-blue-600'},{l:'Cost of Goods Sold',v:-data.cogs,c:'text-red-600'},{l:'Gross Profit',v:data.grossProfit,c:'text-green-600',bold:true},{l:'Gross Margin',v:`${data.grossMargin.toFixed(1)}%`,c:'text-green-600'},{l:'Total Discounts',v:-data.totalDiscounts,c:'text-amber-600'},{l:'Tax Collected',v:data.taxCollected,c:'text-slate-600'}].map(m=>(
                  <div key={m.l} className={`flex justify-between py-2 border-b border-slate-50 ${m.bold?'font-bold text-base':''}`}>
                    <span className="text-slate-700">{m.l}</span>
                    <span className={m.c}>{typeof m.v==='string'?m.v:fmt(typeof m.v==='number'?Math.abs(m.v):0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {!data&&!loading&&<div className="card text-center py-16 text-slate-400"><BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30"/><p>Select your parameters and click <strong>Generate Report</strong></p></div>}
    </div>
  )
}
