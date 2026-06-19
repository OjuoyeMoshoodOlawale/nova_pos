// src/renderer/src/pages/Inventory/StockReceiveModal.tsx
// ─── Receive Stock ───────────────────────────────────────────
//  ① Select product  (barcode scanner OR name search)
//  ② Supplier & Reference  (supplier dropdown + invoice ref)
//     Shows last 3 purchases + supplier-specific last price hint
//  ③ How you bought  (bulk / unit)
//  ④ Quantity & Cost  (auto unit-count preloads for dozen/gross/etc.)
//     WAC calculator when cost changes with existing stock
//  ⑤ Pricing Decision  (keep / auto-switch / update-now)
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react'
import { Product }      from '@shared/types'
import { useAuthStore } from '../../store/authStore'
import { useAppStore }  from '../../store/appStore'
import {
  X, Package, AlertTriangle, TrendingUp, TrendingDown,
  ChevronRight, Search, Info, Truck, Receipt, Barcode,
} from 'lucide-react'
import { validate } from '../../hooks/useValidation'

const BULK_UNITS = [
  'carton','crate','dozen','pack','bag','bale',
  'bundle','case','sack','tray','gross','roll',
]

// Auto-fill units_per_bulk for well-known bulk unit names
const BULK_UNIT_PRESETS: Record<string, number> = {
  dozen: 12,
  gross: 144,
  crate: 24,
  case:  12,
  tray:  30,
}

type PriceMode = 'keep' | 'switch_now' | 'auto_switch'

interface Props {
  product?: Product | null
  onClose:  () => void
  onSaved:  () => void
}

export default function StockReceiveModal({ product: initProduct, onClose, onSaved }: Props) {
  const { user }              = useAuthStore()
  const { addToast, profile } = useAppStore()
  const sym = profile?.currency_symbol ?? '₦'

  // ── Step 1: Product selection ───────────────────────────
  const [searchQ,         setSearchQ]         = useState('')
  const [searchRes,       setSearchRes]       = useState<Product[]>([])
  const [product,         setProduct]         = useState<Product | null>(initProduct ?? null)
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([])

  // Barcode scanner state (USB HID scanner fires rapid keypresses)
  const barcodeRef       = useRef<HTMLInputElement>(null)
  const [barcodeInput,   setBarcodeInput]   = useState('')
  const [barcodeStatus,  setBarcodeStatus]  = useState<'idle' | 'found' | 'notfound'>('idle')

  // ── Step 2: Supplier & Reference ───────────────────────
  const [suppliers,  setSuppliers]  = useState<any[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [invoiceRef, setInvoiceRef] = useState('')

  // ── Step 3: Buy mode ────────────────────────────────────
  const [buyMode, setBuyMode] = useState<'bulk' | 'unit'>('bulk')

  // ── Step 4: Quantities & cost ──────────────────────────
  const [bulkUnit,     setBulkUnit]     = useState('carton')
  const [unitsPerBulk, setUnitsPerBulk] = useState(1)
  const [qtyBought,    setQtyBought]    = useState(1)
  const [buyingCost,   setBuyingCost]   = useState(0)

  // ── Step 5: Selling prices ──────────────────────────────
  const [unitSellEnabled,  setUnitSellEnabled]  = useState(true)
  const [bulkSellEnabled,  setBulkSellEnabled]  = useState(true)
  const [unitSellPrice,    setUnitSellPrice]    = useState(0)
  const [bulkSellPrice,    setBulkSellPrice]    = useState(0)
  // Smart default: if there's existing stock, default to "sell old stock
  // first, then auto-switch" (the usual intent when restocking at a new
  // price). With no old stock, "switch now" makes more sense.
  const [priceMode,        setPriceMode]        = useState<PriceMode>(
    (product?.stock_qty ?? 0) > 0 ? 'auto_switch' : 'switch_now'
  )

  const [saving, setSaving] = useState(false)

  // ── Load suppliers once ─────────────────────────────────
  useEffect(() => {
    window.api.suppliers.getAll().then((r: any) => {
      if (r.success) setSuppliers(r.data)
    })
  }, [])

  // ── When product changes: reset fields + load history ──
  useEffect(() => {
    if (!product) { setPurchaseHistory([]); return }

    const p = product as any
    setBulkUnit(p.bulk_unit || 'carton')
    setUnitsPerBulk(p.units_per_bulk || 1)
    setUnitSellPrice(product.selling_price || 0)
    setBulkSellPrice(p.bulk_selling_price || 0)
    setBuyingCost(product.cost_price || 0)
    setBulkSellEnabled(!!p.has_bulk_pricing)

    window.api.products.priceHistory(product.id).then((r: any) => {
      if (r.success) setPurchaseHistory(r.data)
    })
  }, [product])

  // ── When bulk unit changes: auto-fill units_per_bulk ──
  function onBulkUnitChange(unit: string) {
    setBulkUnit(unit)
    const preset = BULK_UNIT_PRESETS[unit]
    if (preset) setUnitsPerBulk(preset)
  }

  // ── Barcode lookup ──────────────────────────────────────
  async function lookupBarcode(barcode: string) {
    if (!barcode.trim()) return
    setBarcodeStatus('idle')
    const r = await window.api.products.findBarcode(barcode.trim())
    if (r.success && r.data) {
      setProduct(r.data)
      setSearchRes([])
      setSearchQ('')
      setBarcodeInput('')
      setBarcodeStatus('found')
      setTimeout(() => setBarcodeStatus('idle'), 2000)
    } else {
      setBarcodeStatus('notfound')
      setTimeout(() => setBarcodeStatus('idle'), 2000)
    }
  }

  // ── Product name search ─────────────────────────────────
  async function doSearch(q: string) {
    setSearchQ(q)
    if (!q.trim()) { setSearchRes([]); return }
    const r = await window.api.products.search(q)
    if (r.success) setSearchRes(r.data.slice(0, 6))
  }

  // ── Derived values ──────────────────────────────────────
  const costPerUnit = buyMode === 'bulk' && unitsPerBulk > 0
    ? buyingCost / unitsPerBulk
    : buyingCost

  const totalUnits = buyMode === 'bulk' ? qtyBought * unitsPerBulk : qtyBought
  const totalSpend = qtyBought * buyingCost

  const existingStock = product?.stock_qty ?? 0
  const prevCost      = product?.cost_price ?? 0
  const costChanged   = prevCost > 0 && costPerUnit > 0 && Math.abs(costPerUnit - prevCost) > 0.01
  const costUp        = costPerUnit > prevCost

  // WAC
  const existingValue   = existingStock * prevCost
  const newValue        = totalUnits * costPerUnit
  const totalQty        = existingStock + totalUnits
  const weightedAvgCost = totalQty > 0 ? (existingValue + newValue) / totalQty : costPerUnit

  // Margins
  const unitMargin = unitSellPrice > 0 && costPerUnit > 0
    ? ((unitSellPrice - costPerUnit) / unitSellPrice) * 100 : null
  const bulkMargin = bulkSellPrice > 0 && buyingCost > 0
    ? ((bulkSellPrice - buyingCost) / bulkSellPrice) * 100 : null
  const belowCost =
    (unitSellEnabled && unitSellPrice > 0 && unitSellPrice < costPerUnit) ||
    (bulkSellEnabled && bulkSellPrice > 0 && bulkSellPrice < buyingCost)

  // Supplier hint from purchase history
  const supplierHistory   = supplierId ? purchaseHistory.filter((h: any) => h.supplier_id === supplierId) : []
  const supplierLastCost  = supplierHistory[0]?.cost_price  ?? null
  const supplierLastDate  = supplierHistory[0]?.recorded_at ?? null
  const supplierName      = suppliers.find(s => s.id === supplierId)?.name

  function MarginBadge({ pct }: { pct: number | null }) {
    if (pct === null) return null
    const c = pct >= 20 ? 'text-green-700 bg-green-100' :
              pct >= 5  ? 'text-amber-700 bg-amber-100' :
                          'text-red-700 bg-red-100'
    return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c}`}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
  }

  function suggestPrices() {
    if (costPerUnit <= 0) return
    if (unitSellPrice === 0 || unitSellPrice === product?.selling_price)
      setUnitSellPrice(+(costPerUnit * 1.25).toFixed(2))
    if (buyingCost > 0 && (bulkSellPrice === 0 || bulkSellPrice === (product as any)?.bulk_selling_price))
      setBulkSellPrice(+(buyingCost * 1.30).toFixed(2))
  }

  // ── Save ────────────────────────────────────────────────
  async function handleSave() {
    if (!product || !user) { addToast('error', 'Select a product first'); return }

    const rules: Record<string, any> = {
      qtyBought:  { required: true, positive: true, integer: buyMode === 'bulk', label: `Qty` },
      buyingCost: { required: true, positive: true, maxDecimals: 2, label: 'Buying price' },
    }
    if (buyMode === 'bulk') {
      rules.unitsPerBulk = { required: true, positive: true, integer: true, label: `${product.unit}s per ${bulkUnit}` }
    }
    const { errors, isValid } = validate({ qtyBought, buyingCost, unitsPerBulk }, rules)
    if (!isValid) { addToast('error', Object.values(errors)[0] as string); return }

    if (priceMode !== 'keep') {
      if (unitSellEnabled) {
        if (unitSellPrice <= 0) { addToast('error', 'Enter unit selling price'); return }
        if (unitSellPrice < costPerUnit * 0.5) {
          if (!confirm(`Sell price (${sym}${unitSellPrice}) is much less than cost (${sym}${costPerUnit.toFixed(2)}). Continue?`)) return
        }
      }
      if (bulkSellEnabled && bulkSellPrice > 0 && bulkSellPrice < buyingCost * 0.5) {
        if (!confirm(`Bulk sell price (${sym}${bulkSellPrice}) is much less than cost (${sym}${buyingCost}). Continue?`)) return
      }
    }

    setSaving(true)
    const r = await window.api.products.receiveStock({
      product_id:             product.id,
      buy_mode:               buyMode,
      qty_received:           totalUnits,
      cost_per_unit:          costPerUnit,
      total_cost:             totalSpend,
      supplier_id:            supplierId  ?? undefined,
      notes:                  invoiceRef  || undefined,
      invoice_ref:            invoiceRef  || undefined,
      price_mode:             priceMode,
      new_selling_price:      unitSellEnabled ? unitSellPrice : undefined,
      new_bulk_selling_price: bulkSellEnabled ? bulkSellPrice : undefined,
      switch_at_qty:          priceMode === 'auto_switch' ? totalUnits : undefined,
      recorded_by:            user.id,
    })
    setSaving(false)

    if (r.success) {
      const modeMsg =
        priceMode === 'keep'       ? 'Price unchanged' :
        priceMode === 'switch_now' ? `Price updated → ${sym}${unitSellPrice.toFixed(2)}` :
        `Auto-switch set → ${sym}${unitSellPrice.toFixed(2)} when old stock runs out`
      addToast('success', `✅ +${totalUnits} ${product.unit} received. ${modeMsg}`)
      onSaved()
    } else {
      addToast('error', r.error || 'Failed to save')
    }
  }

  // ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Receive Stock</h2>
            <p className="text-xs text-slate-400">Record incoming goods purchase</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-slate-700" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* ── ① Product ───────────────────────────────── */}
          <section>
            <p className="step-label">① Product</p>
            {product ? (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-blue-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {(product as any).image_data
                    ? <img src={(product as any).image_data} className="w-full h-full object-cover" />
                    : <Package className="w-5 h-5 text-blue-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{product.name}</p>
                  <p className="text-xs text-slate-500">
                    Stock: <strong>{product.stock_qty} {product.unit}</strong>
                    · Last cost: <strong>{sym}{product.cost_price.toFixed(2)}/{product.unit}</strong>
                    {(product as any).pending_sell_price && <span className="ml-2 text-amber-600">⏳ Price switch pending</span>}
                  </p>
                </div>
                <button
                  onClick={() => { setProduct(null); setSearchQ(''); setPurchaseHistory([]) }}
                  className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0"
                >Change</button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Barcode scanner input */}
                <div>
                  <label className="label flex items-center gap-1.5 mb-1">
                    <Barcode className="w-3.5 h-3.5 text-slate-400" /> Scan Barcode
                  </label>
                  <div className="flex gap-2">
                    <input
                      ref={barcodeRef}
                      value={barcodeInput}
                      onChange={e => setBarcodeInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') lookupBarcode(barcodeInput) }}
                      placeholder="Scan or type barcode, press Enter"
                      className={`input flex-1 font-mono text-sm ${
                        barcodeStatus === 'found'    ? 'border-green-400 bg-green-50' :
                        barcodeStatus === 'notfound' ? 'border-red-400 bg-red-50' : ''
                      }`}
                    />
                    <button
                      onClick={() => lookupBarcode(barcodeInput)}
                      className="btn-secondary text-xs py-2"
                    >Find</button>
                  </div>
                  {barcodeStatus === 'notfound' && (
                    <p className="text-xs text-red-600 mt-1">No product found for that barcode</p>
                  )}
                </div>

                {/* OR: Name search */}
                <div>
                  <label className="label flex items-center gap-1.5 mb-1">
                    <Search className="w-3.5 h-3.5 text-slate-400" /> Or search by name
                  </label>
                  <input
                    value={searchQ}
                    onChange={e => doSearch(e.target.value)}
                    placeholder="Type product name..."
                    className="input"
                  />
                  {searchRes.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm mt-1">
                      {searchRes.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setProduct(p); setSearchRes([]); setSearchQ('') }}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 transition border-b border-slate-50 last:border-0 text-left"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-800">{p.name}</p>
                            <p className="text-xs text-slate-400">{p.stock_qty} {p.unit} in stock</p>
                          </div>
                          <span className="text-sm font-bold text-blue-600">{sym}{p.cost_price.toFixed(2)}/{p.unit}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {product && (<>

            {/* ── ② Supplier & Reference ─────────────────── */}
            <section>
              <p className="step-label">② Supplier & Reference</p>
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-slate-400" /> Supplier
                    </label>
                    <select
                      className="input"
                      value={supplierId ?? ''}
                      onChange={e => setSupplierId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">— Not specified —</option>
                      {suppliers.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label flex items-center gap-1">
                      <Receipt className="w-3.5 h-3.5 text-slate-400" /> Invoice / Batch Ref
                    </label>
                    <input
                      className="input"
                      value={invoiceRef}
                      onChange={e => setInvoiceRef(e.target.value)}
                      placeholder="e.g. INV-001, Batch-A…"
                    />
                  </div>
                </div>

                {/* Supplier last-price hint */}
                {supplierId && supplierLastCost !== null && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex items-center justify-between">
                    <p className="text-xs text-blue-700">
                      Last from <strong>{supplierName}</strong>: <strong>{sym}{supplierLastCost.toFixed(2)}/{product.unit}</strong>
                      {supplierLastDate && <span className="text-blue-400"> · {new Date(supplierLastDate).toLocaleDateString()}</span>}
                    </p>
                    <button
                      onClick={() => setBuyingCost(
                        buyMode === 'bulk' ? supplierLastCost * unitsPerBulk : supplierLastCost
                      )}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold ml-3 flex-shrink-0"
                    >Use ↩</button>
                  </div>
                )}

                {/* Recent purchase mini-history */}
                {purchaseHistory.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Recent purchases:</p>
                    <div className="space-y-1">
                      {purchaseHistory.slice(0, 3).map((h: any, i: number) => (
                        <div key={h.id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 text-slate-500">
                            <span className="text-slate-300 w-4">#{i + 1}</span>
                            <span>{new Date(h.recorded_at).toLocaleDateString()}</span>
                            {h.supplier_name && <span className="text-slate-400">· {h.supplier_name}</span>}
                            {h.invoice_ref && <span className="text-blue-500 font-mono">{h.invoice_ref}</span>}
                          </div>
                          <div className="flex items-center gap-2 text-right">
                            <span className="font-medium text-slate-700">{sym}{h.cost_price.toFixed(2)}/{product.unit}</span>
                            <span className="text-slate-400">+{h.qty_bought}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── ③ How you bought it ─────────────────────── */}
            <section>
              <p className="step-label">③ How you bought it</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['bulk', '📦', 'Bought in Bulk', 'cartons, crates, dozens…'] as const,
                  ['unit', '🔢', 'Bought by Unit', 'individual pieces']         as const,
                ]).map(([m, ic, l, sub]) => (
                  <button key={m} onClick={() => setBuyMode(m)}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition
                      ${buyMode === m ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <span className="text-xl">{ic}</span>
                    <div>
                      <p className={`text-sm font-semibold ${buyMode === m ? 'text-blue-700' : 'text-slate-700'}`}>{l}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* ── ④ Quantity & Cost ──────────────────────── */}
            <section>
              <p className="step-label">④ Quantity & Buying Price</p>
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">

                {/* Bulk unit config */}
                {buyMode === 'bulk' && (
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="label">Bulk Unit</label>
                      <select className="input" value={bulkUnit} onChange={e => onBulkUnitChange(e.target.value)}>
                        {BULK_UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">{product.unit}s per {bulkUnit}</label>
                      <input
                        type="number" step="1" min="1" className="input"
                        value={unitsPerBulk || ''}
                        onChange={e => setUnitsPerBulk(Math.max(1, parseInt(e.target.value) || 1))}
                        placeholder="e.g. 24"
                      />
                    </div>
                    <div className="flex items-center pb-2">
                      <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1.5 rounded-lg border border-blue-100">
                        1 {bulkUnit} = {unitsPerBulk} {product.unit}
                        {BULK_UNIT_PRESETS[bulkUnit] && (
                          <span className="ml-1 text-blue-400">(preset)</span>
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {/* Qty + cost */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Qty {buyMode === 'bulk' ? `${bulkUnit}s` : `${product.unit}s`} received</label>
                    <input
                      type="number" step="1" min="1" className="input"
                      value={qtyBought || ''}
                      onChange={e => setQtyBought(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label className="label">Cost per {buyMode === 'bulk' ? bulkUnit : product.unit}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                      <input
                        type="number" step="0.01" min="0" className="input pl-7"
                        value={buyingCost || ''}
                        onChange={e => setBuyingCost(parseFloat(e.target.value) || 0)}
                        onBlur={suggestPrices}
                        placeholder="0.00"
                      />
                    </div>
                    {buyMode === 'bulk' && buyingCost > 0 && unitsPerBulk > 0 && (
                      <p className="text-xs text-blue-600 mt-1">
                        = {sym}{costPerUnit.toFixed(2)} per {product.unit}
                      </p>
                    )}
                  </div>
                </div>

                {/* Summary row */}
                {qtyBought > 0 && buyingCost > 0 && (
                  <>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200">
                      {[
                        { l: `Total ${product.unit}s`, v: totalUnits.toLocaleString() },
                        { l: `Cost/${product.unit}`,   v: `${sym}${costPerUnit.toFixed(2)}` },
                        { l: 'Total spend',            v: `${sym}${totalSpend.toLocaleString('en', { minimumFractionDigits: 2 })}` },
                      ].map(s => (
                        <div key={s.l} className="bg-white rounded-lg p-2.5 text-center border border-slate-100">
                          <p className="text-sm font-bold text-slate-800">{s.v}</p>
                          <p className="text-xs text-slate-400">{s.l}</p>
                        </div>
                      ))}
                    </div>

                    {/* WAC */}
                    {product.stock_qty > 0 && costChanged && (
                      <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-xs">
                        <p className="font-semibold text-purple-800 mb-1">📊 Weighted Average Cost (WAC)</p>
                        <div className="grid grid-cols-3 gap-2 text-purple-700">
                          <div><p className="text-purple-500">Existing</p><p className="font-medium">{product.stock_qty} × {sym}{prevCost.toFixed(2)}</p></div>
                          <div><p className="text-purple-500">New</p><p className="font-medium">{totalUnits} × {sym}{costPerUnit.toFixed(2)}</p></div>
                          <div><p className="text-purple-500">Avg cost</p><p className="font-bold text-purple-900">{sym}{weightedAvgCost.toFixed(2)}</p></div>
                        </div>
                        <p className="text-purple-500 mt-1.5">
                          To use WAC: select "Update now" below and enter {sym}{weightedAvgCost.toFixed(2)}.
                        </p>
                      </div>
                    )}

                    {/* Cost change alert */}
                    {costChanged && (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
                        ${costUp ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
                        {costUp ? <TrendingUp className="w-4 h-4 flex-shrink-0" /> : <TrendingDown className="w-4 h-4 flex-shrink-0" />}
                        Cost {costUp ? 'increased' : 'decreased'}:{' '}
                        <span className="line-through opacity-50">{sym}{prevCost.toFixed(2)}</span>
                        {' → '}<strong>{sym}{costPerUnit.toFixed(2)}</strong>/{product.unit}
                        {' '}({costUp ? '+' : ''}{(((costPerUnit - prevCost) / prevCost) * 100).toFixed(1)}%)
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* ── ⑤ Pricing Decision ─────────────────────── */}
            <section>
              <p className="step-label">⑤ Pricing Decision</p>

              {product.selling_price === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800 mb-3 flex items-start gap-2">
                  <span className="text-green-500 flex-shrink-0">★</span>
                  New product — set your selling price below.
                </div>
              )}
              {costChanged && existingStock > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 text-xs text-blue-800 flex items-start gap-2">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    You have <strong>{existingStock} {product.unit}</strong> at <strong>{sym}{prevCost.toFixed(2)}</strong>.
                    New <strong>{totalUnits}</strong> arriving at <strong>{sym}{costPerUnit.toFixed(2)}</strong>. Choose how to handle:
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {/* Keep */}
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition
                  ${priceMode === 'keep' ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="radio" name="priceMode" value="keep" checked={priceMode === 'keep'} onChange={() => setPriceMode('keep')} className="mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">Keep current price ({sym}{product.selling_price.toFixed(2)}/{product.unit})</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      All {existingStock + totalUnits} {product.unit}s sell at today's price.
                      {costUp && costPerUnit > 0 && product.selling_price > 0 &&
                        ` New margin: ${(((product.selling_price - costPerUnit) / product.selling_price) * 100).toFixed(1)}%`}
                    </p>
                  </div>
                </label>

                {/* Auto-switch */}
                {existingStock > 0 && (
                  <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition
                    ${priceMode === 'auto_switch' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name="priceMode" value="auto_switch" checked={priceMode === 'auto_switch'} onChange={() => setPriceMode('auto_switch')} className="mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">⏳ Sell old {existingStock} at {sym}{product.selling_price.toFixed(2)}, then auto-switch</p>
                      <p className="text-xs text-slate-400 mt-0.5">System switches automatically when old stock runs out.</p>
                      {priceMode === 'auto_switch' && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div>
                            <label className="label">New unit price</label>
                            <div className="relative"><span className="absolute left-2.5 top-2 text-slate-400 text-sm">{sym}</span>
                              <input type="number" step="0.01" className="input pl-7 py-1.5 text-sm" value={unitSellPrice || ''} onChange={e => setUnitSellPrice(parseFloat(e.target.value) || 0)} placeholder="0.00" /></div>
                            <MarginBadge pct={unitMargin} />
                          </div>
                          {bulkSellEnabled && buyMode === 'bulk' && (
                            <div>
                              <label className="label">New {bulkUnit} price</label>
                              <div className="relative"><span className="absolute left-2.5 top-2 text-slate-400 text-sm">{sym}</span>
                                <input type="number" step="0.01" className="input pl-7 py-1.5 text-sm" value={bulkSellPrice || ''} onChange={e => setBulkSellPrice(parseFloat(e.target.value) || 0)} placeholder="0.00" /></div>
                              <MarginBadge pct={bulkMargin} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                )}

                {/* Switch now */}
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition
                  ${priceMode === 'switch_now' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="radio" name="priceMode" value="switch_now" checked={priceMode === 'switch_now'} onChange={() => setPriceMode('switch_now')} className="mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">Update price now (applies to all stock)</p>
                    <p className="text-xs text-slate-400 mt-0.5">All {existingStock + totalUnits} {product.unit}s sell at the new price from this moment.</p>
                    {priceMode === 'switch_now' && (
                      <div className="mt-3 space-y-2">
                        {/* Unit sell */}
                        <div className={`rounded-xl p-3 space-y-2 border ${unitSellEnabled ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-slate-50'}`}>
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                              <input type="checkbox" checked={unitSellEnabled} onChange={e => setUnitSellEnabled(e.target.checked)} />
                              Sell by {product.unit}
                            </label>
                            <MarginBadge pct={unitSellEnabled ? unitMargin : null} />
                          </div>
                          {unitSellEnabled && (
                            <div className="relative"><span className="absolute left-2.5 top-2 text-slate-400 text-sm">{sym}</span>
                              <input type="number" step="0.01" className="input pl-7 py-1.5 text-sm" value={unitSellPrice || ''} onChange={e => setUnitSellPrice(parseFloat(e.target.value) || 0)} placeholder="0.00" /></div>
                          )}
                        </div>
                        {/* Bulk sell */}
                        {buyMode === 'bulk' && (
                          <div className={`rounded-xl p-3 space-y-2 border ${bulkSellEnabled ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-slate-50'}`}>
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                                <input type="checkbox" checked={bulkSellEnabled} onChange={e => setBulkSellEnabled(e.target.checked)} />
                                Sell by {bulkUnit}
                              </label>
                              <MarginBadge pct={bulkSellEnabled ? bulkMargin : null} />
                            </div>
                            {bulkSellEnabled && (
                              <div className="relative"><span className="absolute left-2.5 top-2 text-slate-400 text-sm">{sym}</span>
                                <input type="number" step="0.01" className="input pl-7 py-1.5 text-sm" value={bulkSellPrice || ''} onChange={e => setBulkSellPrice(parseFloat(e.target.value) || 0)} placeholder="0.00" /></div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </label>
              </div>

              {belowCost && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mt-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-800 font-medium">
                    Selling below cost — you will make a loss! Cost/{product.unit} = {sym}{costPerUnit.toFixed(2)}.
                  </p>
                </div>
              )}
              <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                <span className="text-green-500">✓</span>
                Past sales are never affected — every receipt permanently stores the selling price and cost at time of sale.
              </p>
            </section>

          </>)}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl flex-shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !product || qtyBought <= 0 || buyingCost <= 0}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {saving ? 'Saving…' : <><ChevronRight className="w-4 h-4" /> Confirm Receipt</>}
          </button>
        </div>
      </div>
    </div>
  )
}
