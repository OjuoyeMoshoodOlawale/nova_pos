// StockReceiveModal.tsx
// ────────────────────────────────────────────────────────────
// Stock receiving flow:
//  1. Select product
//  2. How did you buy? (Bulk or Unit)
//  3. Enter qty + buying cost → auto-calculates unit cost
//  4. Set selling prices (bulk / unit, with on/off toggle)
//  5. Profit/loss warning if selling below cost
//  6. Confirm → updates stock + price history + audit log
// ────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import { Product }         from '@shared/types'
import { useAuthStore }    from '../../store/authStore'
import { useAppStore }     from '../../store/appStore'
import {
  X, Package, Calculator, AlertTriangle,
  TrendingUp, TrendingDown, ChevronRight, Search,
} from 'lucide-react'

const BULK_UNITS = ['carton','crate','dozen','pack','bag','bale','bundle','case','sack','tray','gross','roll']

interface Props {
  product?: Product | null
  onClose: () => void
  onSaved: () => void
}

export default function StockReceiveModal({ product: initProduct, onClose, onSaved }: Props) {
  const { user }               = useAuthStore()
  const { addToast, profile }  = useAppStore()
  const sym                    = profile?.currency_symbol ?? '₦'

  // ── Product selection ────────────────────────────────
  const [searchQ,   setSearchQ]   = useState('')
  const [searchRes, setSearchRes] = useState<Product[]>([])
  const [product,   setProduct]   = useState<Product | null>(initProduct ?? null)

  // ── How bought ──────────────────────────────────────
  const [buyMode,       setBuyMode]       = useState<'bulk'|'unit'>('bulk')
  const [bulkUnit,      setBulkUnit]      = useState('carton')
  const [unitsPerBulk,  setUnitsPerBulk]  = useState(1)
  const [qtyBought,     setQtyBought]     = useState(1)      // # cartons OR # units
  const [buyingCost,    setBuyingCost]    = useState(0)      // cost per carton OR per unit

  // ── Selling setup ────────────────────────────────────
  const [bulkSellEnabled,  setBulkSellEnabled]  = useState(true)
  const [unitSellEnabled,  setUnitSellEnabled]  = useState(true)
  const [bulkSellPrice,    setBulkSellPrice]    = useState(0)
  const [unitSellPrice,    setUnitSellPrice]    = useState(0)

  // ── Supplier + Notes ─────────────────────────────────
  const [suppliers,   setSuppliers]   = useState<any[]>([])
  const [supplierId,  setSupplierId]  = useState<number|null>(null)
  const [notes,       setNotes]       = useState('')
  const [saving,      setSaving]      = useState(false)

  // ── Load suppliers ────────────────────────────────────
  useEffect(() => {
    window.api.suppliers.getAll().then((r: any) => {
      if (r.success) setSuppliers(r.data)
    })
  }, [])

  // ── Pre-fill from existing product ───────────────────
  useEffect(() => {
    if (!product) return
    setBulkUnit(product.bulk_unit || 'carton')
    setUnitsPerBulk(product.units_per_bulk || 1)
    setBulkSellEnabled(product.has_bulk_pricing)
    setUnitSellEnabled(true)
    setUnitSellPrice(product.selling_price || 0)
    setBulkSellPrice(product.bulk_selling_price || 0)
    setBuyingCost(product.cost_price || 0)
  }, [product])

  // ── Search products ───────────────────────────────────
  async function doSearch(q: string) {
    setSearchQ(q)
    if (!q.trim()) { setSearchRes([]); return }
    const r = await window.api.products.search(q)
    if (r.success) setSearchRes(r.data.slice(0, 6))
  }

  // ── Calculations ──────────────────────────────────────
  // Cost per retail unit
  const costPerUnit = buyMode === 'bulk'
    ? (unitsPerBulk > 0 && buyingCost > 0 ? buyingCost / unitsPerBulk : 0)
    : buyingCost

  // Total retail units received
  const totalUnits = buyMode === 'bulk'
    ? qtyBought * unitsPerBulk
    : qtyBought

  // Total spend
  const totalSpend = qtyBought * buyingCost

  // Margins
  const unitMargin  = unitSellPrice > 0 && costPerUnit > 0
    ? ((unitSellPrice - costPerUnit) / unitSellPrice) * 100
    : null

  const bulkMargin  = bulkSellPrice > 0 && buyingCost > 0
    ? ((bulkSellPrice - buyingCost) / bulkSellPrice) * 100
    : null

  const sellingBelowCost =
    (unitSellEnabled  && unitSellPrice > 0 && unitSellPrice  < costPerUnit) ||
    (bulkSellEnabled  && bulkSellPrice > 0 && bulkSellPrice  < buyingCost)

  // Auto-suggest selling prices when cost changes
  function suggestPrices() {
    if (costPerUnit > 0 && unitSellPrice === 0) {
      setUnitSellPrice(+(costPerUnit * 1.25).toFixed(2))
    }
    if (buyingCost > 0 && bulkSellPrice === 0 && buyMode === 'bulk') {
      setBulkSellPrice(+(buyingCost * 1.3).toFixed(2))
    }
  }

  // Previous cost for comparison
  const prevCost     = product?.cost_price ?? 0
  const costChanged  = prevCost > 0 && Math.abs(costPerUnit - prevCost) > 0.01
  const costIncrease = costPerUnit > prevCost

  // ── Save ──────────────────────────────────────────────
  async function handleSave() {
    if (!product || !user) { addToast('error', 'Select a product first'); return }
    if (qtyBought  <= 0)   { addToast('error', 'Enter quantity received');  return }
    if (buyingCost <= 0)   { addToast('error', 'Enter the buying price');   return }
    if (totalUnits <= 0)   { addToast('error', 'Units per pack cannot be 0'); return }

    setSaving(true)
    const r = await window.api.products.receiveStock({
      product_id:            product.id,
      buy_mode:              buyMode,
      qty_received:          totalUnits,
      cost_per_unit:         costPerUnit,
      total_cost:            totalSpend,
      supplier_id:           supplierId ?? undefined,
      notes:                 notes || undefined,
      new_selling_price:     unitSellEnabled ? unitSellPrice : undefined,
      new_bulk_selling_price:bulkSellEnabled && bulkSellPrice > 0 ? bulkSellPrice : undefined,
      recorded_by:           user.id,
    })
    setSaving(false)

    if (r.success) {
      addToast('success', `✅ +${totalUnits} ${product.unit} of ${product.name} received`)
      onSaved()
    } else {
      addToast('error', r.error || 'Failed to receive stock')
    }
  }

  // ── Margin badge ──────────────────────────────────────
  function MarginBadge({ pct }: { pct: number | null }) {
    if (pct === null) return null
    const color = pct >= 20 ? 'text-green-600 bg-green-50' : pct >= 5 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'
    return (
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>
        {pct >= 0 ? '+' : ''}{pct.toFixed(1)}% margin
      </span>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Receive Stock</h2>
            <p className="text-xs text-slate-400">Record a new purchase</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* ── Step 1: Product ──────────────────────────────── */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Step 1 — Product</p>
            {product ? (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-blue-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {product.image_data
                    ? <img src={product.image_data} className="w-full h-full object-cover"/>
                    : <Package className="w-5 h-5 text-blue-400"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{product.name}</p>
                  <p className="text-xs text-slate-500">
                    In stock: <strong>{product.stock_qty} {product.unit}</strong>
                    &nbsp;· Last cost: <strong>{sym}{product.cost_price.toFixed(2)}/{product.unit}</strong>
                  </p>
                </div>
                <button onClick={()=>{setProduct(null);setSearchQ('')}}
                  className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0">Change</button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
                  <input value={searchQ} onChange={e=>doSearch(e.target.value)}
                    placeholder="Search product by name or barcode..."
                    className="input pl-9" autoFocus/>
                </div>
                {searchRes.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    {searchRes.map(p => (
                      <button key={p.id} onClick={()=>{setProduct(p);setSearchRes([]);setSearchQ('')}}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition border-b border-slate-50 last:border-0 text-left">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-400">{p.stock_qty} {p.unit} in stock</p>
                        </div>
                        <span className="text-sm font-bold text-blue-600">{sym}{p.cost_price.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {product && (<>

            {/* ── Step 2: How did you buy it? ──────────────── */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Step 2 — Purchase Mode</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['bulk', '📦', 'Bought in Bulk', 'cartons, crates, dozens...'],
                  ['unit', '🔢', 'Bought by Unit', 'individual pieces, bottles...'],
                ] as const).map(([m, ic, l, sub]) => (
                  <button key={m} onClick={()=>setBuyMode(m)}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition
                      ${buyMode===m ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <span className="text-2xl">{ic}</span>
                    <div>
                      <p className={`text-sm font-semibold ${buyMode===m?'text-blue-700':'text-slate-700'}`}>{l}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Step 3: Quantities & Cost ────────────────── */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Step 3 — Quantities & Cost</p>
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                {buyMode === 'bulk' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Bulk Unit Name</label>
                      <select className="input" value={bulkUnit} onChange={e=>setBulkUnit(e.target.value)}>
                        {BULK_UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">{product.unit}s per {bulkUnit}</label>
                      <input type="number" step="1" min="1" value={unitsPerBulk||''} className="input"
                        onChange={e=>setUnitsPerBulk(Math.max(1, parseInt(e.target.value)||1))}
                        placeholder="e.g. 24"/>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">
                      How many {buyMode==='bulk' ? bulkUnit+'s' : product.unit+'s'} received?
                    </label>
                    <input type="number" step="1" min="1" value={qtyBought||''} className="input"
                      onChange={e=>setQtyBought(parseFloat(e.target.value)||0)}
                      placeholder="e.g. 10"/>
                  </div>
                  <div>
                    <label className="label">
                      Cost per {buyMode==='bulk' ? bulkUnit : product.unit} ({sym})
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                      <input type="number" step="0.01" min="0" value={buyingCost||''} className="input pl-7"
                        onChange={e=>{setBuyingCost(parseFloat(e.target.value)||0); suggestPrices()}}
                        placeholder="0.00"
                        onBlur={suggestPrices}/>
                    </div>
                  </div>
                </div>

                {/* Calculation summary */}
                {qtyBought > 0 && buyingCost > 0 && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200">
                    {[
                      { label: `Total ${product.unit}s`, value: totalUnits.toLocaleString() },
                      { label: `Cost/${product.unit}`, value: `${sym}${costPerUnit.toFixed(2)}` },
                      { label: 'Total Spend', value: `${sym}${totalSpend.toLocaleString('en', {minimumFractionDigits:2})}` },
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-lg p-2.5 text-center border border-slate-100">
                        <p className="text-sm font-bold text-slate-800">{s.value}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cost change warning */}
                {costChanged && costPerUnit > 0 && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
                    ${costIncrease ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
                    {costIncrease ? <TrendingUp className="w-4 h-4 flex-shrink-0"/> : <TrendingDown className="w-4 h-4 flex-shrink-0"/>}
                    Cost {costIncrease ? 'increased' : 'decreased'}:
                    <span className="line-through opacity-60">{sym}{prevCost.toFixed(2)}</span>
                    → <strong>{sym}{costPerUnit.toFixed(2)}</strong> per {product.unit}
                    ({costIncrease ? '+' : ''}{(((costPerUnit-prevCost)/prevCost)*100).toFixed(1)}%)
                  </div>
                )}
              </div>
            </div>

            {/* ── Step 4: Selling Prices ───────────────────── */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Step 4 — Selling Prices</p>
              <div className="space-y-3">

                {/* Unit selling */}
                <div className={`border rounded-xl p-4 transition ${unitSellEnabled ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <label className="relative cursor-pointer">
                        <input type="checkbox" checked={unitSellEnabled}
                          onChange={e=>setUnitSellEnabled(e.target.checked)} className="sr-only peer"/>
                        <div className="w-9 h-5 bg-slate-200 peer-checked:bg-blue-600 rounded-full transition-colors"/>
                        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"/>
                      </label>
                      <span className="text-sm font-semibold text-slate-700">
                        Sell by {product.unit} (unit)
                      </span>
                    </div>
                    <MarginBadge pct={unitMargin}/>
                  </div>
                  {unitSellEnabled && (
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                        <input type="number" step="0.01" min="0" value={unitSellPrice||''} className="input pl-7"
                          onChange={e=>setUnitSellPrice(parseFloat(e.target.value)||0)} placeholder="0.00"/>
                      </div>
                      <span className="text-xs text-slate-500">per {product.unit}</span>
                    </div>
                  )}
                </div>

                {/* Bulk selling */}
                {buyMode === 'bulk' && (
                  <div className={`border rounded-xl p-4 transition ${bulkSellEnabled ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <label className="relative cursor-pointer">
                          <input type="checkbox" checked={bulkSellEnabled}
                            onChange={e=>setBulkSellEnabled(e.target.checked)} className="sr-only peer"/>
                          <div className="w-9 h-5 bg-slate-200 peer-checked:bg-amber-500 rounded-full transition-colors"/>
                          <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"/>
                        </label>
                        <span className="text-sm font-semibold text-slate-700">
                          Sell by {bulkUnit} (bulk)
                        </span>
                      </div>
                      <MarginBadge pct={bulkMargin}/>
                    </div>
                    {bulkSellEnabled && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                            <input type="number" step="0.01" min="0" value={bulkSellPrice||''} className="input pl-7"
                              onChange={e=>setBulkSellPrice(parseFloat(e.target.value)||0)} placeholder="0.00"/>
                          </div>
                          <span className="text-xs text-slate-500">per {bulkUnit}</span>
                        </div>
                        {unitsPerBulk > 1 && bulkSellPrice > 0 && unitSellEnabled && (
                          <p className="text-xs text-slate-400">
                            Equivalent: {sym}{(bulkSellPrice/unitsPerBulk).toFixed(2)}/{product.unit}
                            {bulkSellPrice/unitsPerBulk < unitSellPrice
                              ? <span className="text-amber-600 ml-1">(cheaper than unit price — bulk discount ✓)</span>
                              : <span className="text-red-500 ml-1">(more expensive than unit — fix this)</span>}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Below cost warning */}
                {sellingBelowCost && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-800">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5"/>
                    <div className="text-xs">
                      <p className="font-semibold">Selling below cost — you will make a loss!</p>
                      <p className="mt-0.5 text-red-600">Check your selling prices. Cost per {product.unit} is {sym}{costPerUnit.toFixed(2)}.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Supplier + Notes ─────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Supplier (optional)</label>
                <select className="input" value={supplierId??''} onChange={e=>setSupplierId(e.target.value?Number(e.target.value):null)}>
                  <option value="">— Not specified —</option>
                  {suppliers.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Notes (optional)</label>
                <input className="input" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Batch, date, ref..."/>
              </div>
            </div>

          </>)}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl flex-shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave}
            disabled={saving || !product || qtyBought<=0 || buyingCost<=0}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saving ? 'Saving...' : <><ChevronRight className="w-4 h-4"/> Confirm Receipt</>}
          </button>
        </div>
      </div>
    </div>
  )
}
