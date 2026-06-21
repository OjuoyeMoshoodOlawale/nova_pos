// src/renderer/src/pages/Inventory/StockAuditPage.tsx
// Dedicated stock audit view — shows every product's:
//   • Remaining stock (pcs + packs)
//   • Total purchased (from receive-stock records)
//   • Total sold (from sale records)
//   • Pricing mode (unit/both/bulk)
// This page exists so owners & managers can verify the numbers are correct.

import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { Search, RefreshCw, Package, ArrowDown, ArrowUp } from 'lucide-react'

interface AuditRow {
  id: number; name: string; sku: string; unit: string
  bulk_unit: string | null; units_per_bulk: number
  pricing_mode: string; stock_qty: number; reorder_level: number
  selling_price: number; bulk_selling_price: number
  total_purchased: number; total_sold: number
}

export default function StockAuditPage() {
  const { profile } = useAppStore()
  const sym = profile?.currency_symbol ?? '₦'

  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'sold'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [modeFilter, setModeFilter] = useState<'all' | 'unit' | 'both' | 'bulk'>('all')

  async function load() {
    setLoading(true)
    try {
      const [insR, prodsR] = await Promise.all([
        window.api.reports.insights(365), // 1 year window
        window.api.products.getAll(),
      ])

      const insData = insR?.data ?? insR
      const prods = (prodsR?.data ?? prodsR) as any[]
      const movement = insData?.movement ?? []

      // Merge products with movement data
      const merged = prods.map(p => {
        const mv = movement.find((m: any) => m.id === p.id) || {}
        return {
          id: p.id,
          name: p.name,
          sku: p.sku || '',
          unit: p.unit || 'pcs',
          bulk_unit: p.bulk_unit || null,
          units_per_bulk: p.units_per_bulk || 1,
          pricing_mode: p.pricing_mode || 'unit',
          stock_qty: p.stock_qty || 0,
          reorder_level: p.reorder_level || 0,
          selling_price: p.selling_price || 0,
          bulk_selling_price: p.bulk_selling_price || 0,
          total_purchased: mv.total_purchased || 0,
          total_sold: mv.units_sold || 0,
        } as AuditRow
      })
      setRows(merged)
    } catch (e) {
      console.error('Stock audit load failed:', e)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Filter + sort
  const filtered = rows
    .filter(r => modeFilter === 'all' || r.pricing_mode === modeFilter)
    .filter(r => r.name.toLowerCase().includes(query.toLowerCase()) || r.sku.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortBy === 'name') return a.name.localeCompare(b.name) * dir
      if (sortBy === 'stock') return (a.stock_qty - b.stock_qty) * dir
      if (sortBy === 'sold') return (a.total_sold - b.total_sold) * dir
      return 0
    })

  function toggleSort(col: 'name' | 'stock' | 'sold') {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const SortIcon = ({ col }: { col: string }) =>
    sortBy === col
      ? sortDir === 'asc' ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />
      : null

  // Summary cards
  const totalProducts = filtered.length
  const totalPieces = filtered.reduce((s, r) => s + r.stock_qty, 0)
  const totalValue = filtered.reduce((s, r) => {
    const price = r.pricing_mode === 'bulk' ? (r.bulk_selling_price || r.selling_price) : r.selling_price
    return s + price * r.stock_qty
  }, 0)
  const lowCount = filtered.filter(r => r.stock_qty > 0 && r.stock_qty <= r.reorder_level).length
  const outCount = filtered.filter(r => r.stock_qty <= 0).length

  // Helper: format stock in the right unit
  function fmtStock(r: AuditRow, qty: number) {
    const isBulkOnly = r.pricing_mode === 'bulk'
    const isBoth = r.pricing_mode === 'both' && r.units_per_bulk > 1
    const displayUnit = isBulkOnly ? (r.bulk_unit || r.unit) : r.unit

    if (isBoth) {
      const packs = +(qty / r.units_per_bulk).toFixed(1)
      return `${qty} ${r.unit} (${packs} ${r.bulk_unit})`
    }
    return `${qty} ${displayUnit}`
  }

  const modeLabel = (m: string) =>
    m === 'unit' ? 'Pieces' : m === 'both' ? 'Both' : m === 'bulk' ? 'Bulk' : m

  const modeBadge = (m: string) =>
    m === 'unit' ? 'bg-blue-100 text-blue-700'
      : m === 'both' ? 'bg-purple-100 text-purple-700'
      : 'bg-amber-100 text-amber-700'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Loading stock data…
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600" /> Stock Audit
          </h1>
          <p className="text-sm text-slate-500">
            Verify remaining stock, purchased vs sold — all products
          </p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <div className="card bg-slate-50 border-0 py-3 px-4"><p className="text-[10px] text-slate-400 uppercase">Products</p><p className="text-xl font-bold text-slate-700">{totalProducts}</p></div>
        <div className="card bg-blue-50 border-0 py-3 px-4"><p className="text-[10px] text-slate-400 uppercase">Total Units</p><p className="text-xl font-bold text-blue-600">{totalPieces.toLocaleString()}</p></div>
        <div className="card bg-green-50 border-0 py-3 px-4"><p className="text-[10px] text-slate-400 uppercase">Retail Value</p><p className="text-xl font-bold text-green-600">{sym}{totalValue.toLocaleString()}</p></div>
        <div className="card bg-amber-50 border-0 py-3 px-4"><p className="text-[10px] text-slate-400 uppercase">Low Stock</p><p className="text-xl font-bold text-amber-600">{lowCount}</p></div>
        <div className="card bg-red-50 border-0 py-3 px-4"><p className="text-[10px] text-slate-400 uppercase">Out of Stock</p><p className="text-xl font-bold text-red-600">{outCount}</p></div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or SKU…" className="input pl-9 py-2" />
        </div>
        <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1">
          {(['all', 'unit', 'both', 'bulk'] as const).map(m => (
            <button key={m} onClick={() => setModeFilter(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${modeFilter === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {m === 'all' ? 'All' : modeLabel(m)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto cart-scroll">
          <table className="w-full text-sm">
            <thead className="text-[11px] text-slate-400 uppercase sticky top-0 bg-white z-10">
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 font-medium cursor-pointer" onClick={() => toggleSort('name')}>
                  Product <SortIcon col="name" />
                </th>
                <th className="text-center py-3 px-2 font-medium w-16">Mode</th>
                <th className="text-right py-3 px-4 font-medium">Purchased (total)</th>
                <th className="text-right py-3 px-4 font-medium cursor-pointer" onClick={() => toggleSort('sold')}>
                  Sold <SortIcon col="sold" />
                </th>
                <th className="text-right py-3 px-4 font-medium cursor-pointer" onClick={() => toggleSort('stock')}>
                  Remaining <SortIcon col="stock" />
                </th>
                <th className="text-center py-3 px-2 font-medium w-16">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const out = r.stock_qty <= 0
                const low = !out && r.stock_qty <= r.reorder_level
                return (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-25">
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-700 truncate max-w-[220px]">{r.name}</p>
                      {r.sku && <p className="text-[10px] text-slate-400 font-mono">{r.sku}</p>}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${modeBadge(r.pricing_mode)}`}>
                        {modeLabel(r.pricing_mode)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-600">{fmtStock(r, r.total_purchased)}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-600">{fmtStock(r, r.total_sold)}</td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      <span className={`font-semibold ${out ? 'text-red-600' : low ? 'text-amber-600' : 'text-green-700'}`}>
                        {fmtStock(r, r.stock_qty)}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${out ? 'bg-red-100 text-red-600' : low ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
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

      {/* Legend */}
      <div className="text-[10px] text-slate-400 space-x-4">
        <span>Purchased = total ever received via Receive Stock</span>
        <span>·</span>
        <span>Sold = total sold (last 365 days)</span>
        <span>·</span>
        <span>Remaining = current stock (live)</span>
      </div>
    </div>
  )
}
