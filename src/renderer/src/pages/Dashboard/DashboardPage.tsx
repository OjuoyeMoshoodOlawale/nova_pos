import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { useAuthStore } from '../../store/authStore'
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
} from 'date-fns'
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  TrendingUp, ShoppingCart, AlertTriangle, RefreshCw, ArrowUpRight, Coins,
} from 'lucide-react'

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

// The four periods the user can switch between.
type Period = 'day' | 'week' | 'month' | 'year'
const PERIODS: { id: Period; label: string }[] = [
  { id: 'day',   label: 'Today' },
  { id: 'week',  label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year',  label: 'This Year' },
]

// Resolve a period to the date range it covers (yyyy-MM-dd strings).
function periodRange(period: Period, now = new Date()): { from: string; to: string; title: string } {
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  switch (period) {
    case 'day':
      return { from: fmt(now), to: fmt(now), title: format(now, 'EEEE, d MMM yyyy') }
    case 'week': {
      const s = startOfWeek(now, { weekStartsOn: 1 })
      const e = endOfWeek(now, { weekStartsOn: 1 })
      return { from: fmt(s), to: fmt(e), title: `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}` }
    }
    case 'month':
      return { from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)), title: format(now, 'MMMM yyyy') }
    case 'year':
      return { from: fmt(startOfYear(now)), to: fmt(endOfYear(now)), title: format(now, 'yyyy') }
  }
}

export default function DashboardPage() {
  const { profile } = useAppStore()
  const { user } = useAuthStore()
  const sym = profile?.currency_symbol ?? '₦'

  const [period, setPeriod]     = useState<Period>('day')
  const [data, setData]         = useState<any>(null)   // headline numbers for the chosen period
  const [daily, setDaily]       = useState<any>(null)   // today's rich detail (hourly + payments)
  const [lowStock, setLowStock] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)

  const load = useCallback(async (p: Period) => {
    setLoading(true)
    const { from, to } = periodRange(p)

    // "Today" uses the daily report (richest data). Week/month/year use the
    // profit-loss range for headline numbers + top products. We always pull
    // today's daily report too, to feed the hourly + payment-method charts.
    const [periodRes, dailyRes, lowRes] = await Promise.all([
      p === 'day'
        ? window.api.reports.daily(from)
        : window.api.reports.profitLoss(from, to),
      window.api.reports.daily(format(new Date(), 'yyyy-MM-dd')),
      window.api.products.getLowStock(),
    ])

    if (periodRes.success) setData(periodRes.data)
    if (dailyRes.success)  setDaily(dailyRes.data)
    if (lowRes.success)    setLowStock(lowRes.data.slice(0, 6))
    setLoading(false)
  }, [])

  useEffect(() => { load(period) }, [period, load])

  const range = periodRange(period)

  // Daily and profit-loss reports use different key names — normalise them.
  const revenue     = period === 'day' ? (data?.totalRevenue ?? 0) : (data?.revenue ?? 0)
  const grossProfit = data?.grossProfit ?? 0
  const margin      = period === 'day' ? (data?.profitMarginPct ?? 0) : (data?.grossMargin ?? 0)
  const txns        = period === 'day' ? (data?.transactionCount ?? 0) : null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 gap-3">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Loading…
      </div>
    )
  }

  const metrics = [
    {
      l: 'Revenue', v: `${sym}${revenue.toLocaleString('en', { minimumFractionDigits: 2 })}`,
      sub: txns != null ? `${txns} transactions` : range.title,
      c: 'text-blue-600', bg: 'bg-blue-50', icon: TrendingUp,
    },
    {
      l: 'Gross Profit', v: `${sym}${grossProfit.toLocaleString('en', { minimumFractionDigits: 2 })}`,
      sub: `${margin.toFixed(1)}% margin`,
      c: 'text-green-600', bg: 'bg-green-50', icon: ArrowUpRight,
    },
    period === 'day'
      ? {
          l: 'Transactions', v: String(txns ?? 0),
          sub: `${daily?.voidCount ?? 0} voided`,
          c: 'text-purple-600', bg: 'bg-purple-50', icon: ShoppingCart,
        }
      : {
          l: 'Cost of Goods', v: `${sym}${(data?.cogs ?? 0).toLocaleString('en', { minimumFractionDigits: 2 })}`,
          sub: 'Total buying cost',
          c: 'text-purple-600', bg: 'bg-purple-50', icon: Coins,
        },
    {
      l: 'Low Stock Items', v: String(lowStock.length),
      sub: 'Needs restock',
      c: 'text-amber-600', bg: 'bg-amber-50', icon: AlertTriangle,
    },
  ]

  const hourlyData = (daily?.hourlySales ?? []).map((h: any) => ({
    hour: `${String(h.hour).padStart(2, '0')}h`, revenue: h.revenue || 0,
  }))

  const periodLabel = PERIODS.find(p => p.id === period)?.label ?? ''

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Welcome, {user?.full_name?.split(' ')[0]} · {range.title}
          </p>
        </div>
        <button onClick={() => load(period)} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Period toggle */}
      <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              period === p.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics.map(m => {
          const Icon = m.icon
          return (
            <div key={m.l} className="card flex items-start gap-4">
              <div className={`w-10 h-10 ${m.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${m.c}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500">{m.l}</p>
                <p className={`text-xl font-bold ${m.c}`}>{m.v}</p>
                <p className="text-xs text-slate-400">{m.sub}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Hourly + payment charts (today's detail) */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card col-span-2">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">
            Revenue by Hour — Today
            {period !== 'day' && <span className="text-xs font-normal text-slate-400 ml-2">(today's detail)</span>}
          </h2>
          {hourlyData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-300 text-sm">No sales yet today</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={v => `${sym}${v}`} />
                <Tooltip formatter={(v: any) => [`${sym}${Number(v).toFixed(2)}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Payment Methods — Today</h2>
          {!daily?.paymentBreakdown?.length ? (
            <div className="flex items-center justify-center h-40 text-slate-300 text-sm">No data</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={daily.paymentBreakdown} dataKey="total" nameKey="method" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                    {daily.paymentBreakdown.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${sym}${Number(v).toFixed(2)}`]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {daily.paymentBreakdown.map((p: any, i: number) => (
                  <div key={p.method} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="capitalize flex-1 text-slate-600">{p.method}</span>
                    <span className="font-medium">{sym}{p.total.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Top products (period-aware) + low stock */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">
            Top Products <span className="text-xs font-normal text-slate-400">({periodLabel})</span>
          </h2>
          {!data?.topProducts?.length ? (
            <div className="text-center py-6 text-slate-400 text-sm">No sales in this period</div>
          ) : (
            <div className="space-y-2">
              {data.topProducts.slice(0, 6).map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 text-xs text-slate-400">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-sm truncate text-slate-700">{p.name}</span>
                      <span className="text-xs text-slate-500">{sym}{p.revenue.toFixed(0)}</span>
                    </div>
                    <div className="bg-slate-100 rounded-full h-1.5">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(p.revenue / (data.topProducts[0].revenue || 1)) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 w-8 text-right">{p.qty}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Low Stock Alert</h2>
            {lowStock.length > 0 && <span className="badge bg-amber-100 text-amber-700">{lowStock.length}</span>}
          </div>
          {lowStock.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">All products well-stocked ✓</div>
          ) : (
            <div className="space-y-2">
              {lowStock.map(p => (
                <div key={p.id} className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-amber-600">{p.stock_qty} {p.unit} left</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
