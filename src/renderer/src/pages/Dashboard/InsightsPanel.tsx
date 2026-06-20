// src/renderer/src/pages/Dashboard/InsightsPanel.tsx
// Advanced analytics: sales velocity, days-to-finish, most/least sold,
// dead stock, and live stock levels. Reads reports.insights + products.getAll.
import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import {
  TrendingUp, TrendingDown, Clock, PackageX, Flame, RefreshCw, Search,
} from 'lucide-react'

const WINDOWS = [
  { id: 7,  label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
]

export default function InsightsPanel() {
  const { profile } = useAppStore()
  const sym = profile?.currency_symbol ?? '₦'

  const [windowDays, setWindowDays] = useState(30)
  const [data, setData]       = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stockQuery, setStockQuery] = useState('')

  const load = useCallback(async (w: number) => {
    setLoading(true)
    const [ins, prods] = await Promise.all([
      window.api.reports.insights(w),
      window.api.products.getAll(),
    ])
    if (ins.success)   setData(ins.data)
    if (prods.success) setProducts(prods.data)
    setLoading(false)
  }, [])

  useEffect(() => { load(windowDays) }, [windowDays, load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Crunching insights…
      </div>
    )
  }

  const urgencyColor = (days: number | null) =>
    days == null ? 'text-slate-400'
      : days <= 3 ? 'text-red-600'
      : days <= 7 ? 'text-amber-600'
      : 'text-green-600'

  // Live stock list, filtered + sorted low→high so the scarce items surface
  const liveStock = products
    .filter(p => p.name.toLowerCase().includes(stockQuery.toLowerCase()))
    .sort((a, b) => a.stock_qty - b.stock_qty)

  return (
    <div className="space-y-6">

      {/* Header + window toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Insights</h2>
          <p className="text-sm text-slate-500">Sales patterns over the last {windowDays} days</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1">
            {WINDOWS.map(w => (
              <button key={w.id} onClick={() => setWindowDays(w.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${windowDays === w.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {w.label}
              </button>
            ))}
          </div>
          <button onClick={() => load(windowDays)} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Count tiles */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { l: 'Active products', v: data?.counts.activeProducts ?? 0, c: 'text-slate-700', bg: 'bg-slate-50' },
          { l: 'Low stock',       v: data?.counts.lowStock ?? 0,       c: 'text-amber-600', bg: 'bg-amber-50' },
          { l: 'Out of stock',    v: data?.counts.outOfStock ?? 0,     c: 'text-red-600',   bg: 'bg-red-50' },
          { l: 'No sales yet',    v: data?.counts.noSales ?? 0,        c: 'text-purple-600',bg: 'bg-purple-50' },
        ].map(m => (
          <div key={m.l} className={`card ${m.bg} border-0`}>
            <p className="text-xs text-slate-500">{m.l}</p>
            <p className={`text-2xl font-bold ${m.c}`}>{m.v}</p>
          </div>
        ))}
      </div>

      {/* Running out soon — the headline insight */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-slate-800">Running Out Soon</h3>
          <span className="text-xs text-slate-400">— estimated days until stock finishes</span>
        </div>
        {!data?.runningOut?.length ? (
          <p className="text-sm text-slate-400 py-4 text-center">Nothing running low — stock levels healthy</p>
        ) : (
          <div className="space-y-2">
            {data.runningOut.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{p.name}</p>
                  <p className="text-xs text-slate-400">
                    {p.stock_qty} {p.unit} left · selling {p.per_day}/day
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold ${urgencyColor(p.days_left)}`}>
                    {p.days_left === 0 ? 'Today' : `~${p.days_left} days`}
                  </p>
                  <p className="text-[10px] text-slate-400">to finish</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Most / Least sold side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-slate-800">Most Purchased</h3>
          </div>
          {!data?.mostSold?.length ? (
            <p className="text-sm text-slate-400 py-4 text-center">No sales in this period</p>
          ) : (
            <div className="space-y-2">
              {data.mostSold.map((p: any, i: number) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="w-5 text-xs text-slate-400">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-sm truncate text-slate-700">{p.name}</span>
                      <span className="text-xs text-slate-500">{p.units_sold} {p.unit}</span>
                    </div>
                    <div className="bg-slate-100 rounded-full h-1.5">
                      <div className="h-full bg-orange-500 rounded-full"
                        style={{ width: `${(p.units_sold / (data.mostSold[0].units_sold || 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-5 h-5 text-slate-400" />
            <h3 className="font-semibold text-slate-800">Least Purchased</h3>
          </div>
          {!data?.leastSold?.length ? (
            <p className="text-sm text-slate-400 py-4 text-center">No sales in this period</p>
          ) : (
            <div className="space-y-2">
              {data.leastSold.map((p: any, i: number) => (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="text-sm truncate text-slate-700 flex-1">{p.name}</span>
                  <span className="text-xs text-slate-500">{p.units_sold} {p.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top profit + Dead stock */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-500" />
            <h3 className="font-semibold text-slate-800">Top Profit Makers</h3>
          </div>
          {!data?.topProfit?.length ? (
            <p className="text-sm text-slate-400 py-4 text-center">No sales in this period</p>
          ) : (
            <div className="space-y-2">
              {data.topProfit.map((p: any, i: number) => (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="text-sm truncate text-slate-700 flex-1">{p.name}</span>
                  <span className="text-xs font-semibold text-green-600">{sym}{p.profit.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <PackageX className="w-5 h-5 text-red-400" />
            <h3 className="font-semibold text-slate-800">Dead Stock</h3>
            <span className="text-xs text-slate-400">— no sales, tying up money</span>
          </div>
          {!data?.deadStock?.length ? (
            <p className="text-sm text-slate-400 py-4 text-center">No dead stock — everything's moving ✓</p>
          ) : (
            <div className="space-y-2">
              {data.deadStock.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="text-sm truncate text-slate-700 flex-1">{p.name}</span>
                  <span className="text-xs text-red-500">{p.stock_qty} {p.unit} idle</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Live stock — real-time levels for ALL products */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">Live Stock Levels</h3>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              value={stockQuery}
              onChange={e => setStockQuery(e.target.value)}
              placeholder="Search product…"
              className="input pl-8 py-1.5 text-sm w-48"
            />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 uppercase sticky top-0 bg-white">
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 font-medium">Product</th>
                <th className="text-right py-2 font-medium">In stock</th>
                <th className="text-right py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {liveStock.map(p => {
                const out = p.stock_qty <= 0
                const low = !out && p.stock_qty <= p.reorder_level
                return (
                  <tr key={p.id} className="border-b border-slate-50">
                    <td className="py-2 text-slate-700 truncate max-w-[200px]">{p.name}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{p.stock_qty} {p.unit}</td>
                    <td className="py-2 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        out ? 'bg-red-100 text-red-600'
                          : low ? 'bg-amber-100 text-amber-600'
                          : 'bg-green-100 text-green-600'}`}>
                        {out ? 'Out' : low ? 'Low' : 'OK'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
