// src/renderer/src/pages/Inventory/ProductForm.tsx
// ─── Bulk-first pricing flow ──────────────────────────────────
//  1. How you buy  — bulk config → bulk buying price → auto unit cost
//  2. How you sell — bulk sell price + unit sell price + margin badges
//  3. Price advisor — margin table with one-click apply
//  4. Stock         — enter in units OR bulk count
//  5. History tabs  — purchase history + price change history (edit mode)
// ─────────────────────────────────────────────────────────────
import { useState, useRef } from 'react'
import { Product, Category } from '@shared/types'
import { useAppStore } from '../../store/appStore'
import {
  X, Camera, Package, ChevronDown, ChevronUp,
  History, Calculator, TrendingUp,
} from 'lucide-react'

interface Props {
  product: Product | null
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}

const UNITS = [
  'pcs','kg','g','litre','ml','pack','box',
  'dozen','pair','roll','bottle','bag','tin',
  'sachet','yard','metre','sheet',
]
const BULK_UNITS = [
  'carton','crate','dozen','pack','bag','bale',
  'bundle','case','pallet','sack','tray','gross',
]
// Margin targets shown in the price advisor table
const MARGIN_TARGETS = [10, 15, 20, 25, 30, 35, 40]

// Selling price needed to achieve a given margin %
// Formula: sell = cost ÷ (1 − margin/100)
function priceAtMargin(cost: number, pct: number): number {
  if (pct >= 100 || cost <= 0) return 0
  return cost / (1 - pct / 100)
}

function MarginBadge({ margin }: { margin: number | null }) {
  if (margin === null) return null
  const cls =
    margin >= 20 ? 'bg-green-100 text-green-700' :
    margin >= 10 ? 'bg-amber-100 text-amber-700' :
                   'bg-red-100 text-red-700'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {margin.toFixed(1)}%
    </span>
  )
}

export default function ProductForm({ product, categories, onClose, onSaved }: Props) {
  const { addToast, profile } = useAppStore()
  const sym  = profile?.currency_symbol ?? '₦'
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Form state ──────────────────────────────────────────
  const p = product as any  // bulk fields added in migration 002, not yet in TS type

  // For NEW products, use the store's default_pricing_mode setting (Settings → Business).
  // This lets bulk-only stores avoid selecting "Bulk only" on every product.
  useEffect(() => {
    if (!product) {
      window.api.settings.getAll().then((r: any) => {
        const mode = r?.data?.default_pricing_mode
        if (mode === 'both' || mode === 'bulk') {
          setD(prev => ({
            ...prev,
            pricing_mode: mode as 'unit'|'both'|'bulk',
            has_bulk_pricing: mode !== 'unit',
            units_per_bulk: mode === 'bulk' ? 1 : prev.units_per_bulk,
          }))
        }
      })
    }
  }, [])

  const [d, setD] = useState({
    name:               p?.name              || '',
    sku:                p?.sku               || '',
    barcode:            p?.barcode           || '',
    category_id:        p?.category_id       || null as number | null,
    supplier_id:        p?.supplier_id       || null as number | null,
    unit:               p?.unit              || 'pcs',
    cost_price:         p?.cost_price        ?? 0,
    selling_price:      p?.selling_price     ?? 0,
    stock_qty:          p?.stock_qty         ?? 0,
    reorder_level:      p?.reorder_level     ?? 5,
    description:        p?.description       || '',
    has_bulk_pricing:   p?.has_bulk_pricing  ?? false,
    // pricing_mode: how this product is sold.
    //   'unit' = pieces only · 'both' = pieces + bulk · 'bulk' = bulk only
    // Derive from saved value, or from the legacy has_bulk_pricing flag.
    pricing_mode:       ((p as any)?.pricing_mode
                          ?? (p?.has_bulk_pricing ? 'both' : 'unit')) as 'unit' | 'both' | 'bulk',
    bulk_unit:          p?.bulk_unit         || 'carton',
    units_per_bulk:     p?.units_per_bulk    ?? 1,
    bulk_buying_price:  p?.bulk_buying_price ?? 0,
    bulk_selling_price: p?.bulk_selling_price?? 0,
    image_data:         p?.image_data        || null as string | null,
    pending_sell_price: p?.pending_sell_price?? null as number | null,
    pending_bulk_price: p?.pending_bulk_price?? null as number | null,
    price_switch_at_qty:p?.price_switch_at_qty?? null as number | null,
  })

  const [saving,           setSaving]           = useState(false)
  const [showAdvanced,     setShowAdvanced]     = useState(false)
  const [showAdvisor,      setShowAdvisor]      = useState(false)
  const [stockMode,        setStockMode]        = useState<'units' | 'bulks'>('units')
  const [reorderInPacks,   setReorderInPacks]   = useState(false)  // enter reorder level in packs vs pieces
  const [bulkStockQty,     setBulkStockQty]     = useState(
    // Pre-fill bulk qty if editing and has bulk pricing
    p?.has_bulk_pricing && p?.units_per_bulk > 0 && p?.stock_qty > 0
      ? Math.floor(p.stock_qty / p.units_per_bulk)
      : 0
  )
  const [priceHistory,       setPriceHistory]       = useState<any[] | null>(null)
  const [priceChangeHistory, setPriceChangeHistory] = useState<any[] | null>(null)

  // ── Single field updater ─────────────────────────────────
  const set = (k: string, v: unknown) => setD(prev => ({ ...prev, [k]: v }))

  // ── Bulk buying price changed → auto-sync unit cost ──────
  function onBulkBuyingChange(val: number) {
    setD(prev => ({
      ...prev,
      bulk_buying_price: val,
      cost_price: prev.units_per_bulk > 0 ? val / prev.units_per_bulk : prev.cost_price,
    }))
  }

  // ── Units-per-bulk changed → auto-sync unit cost ─────────
  function onUnitsPerBulkChange(val: number) {
    setD(prev => ({
      ...prev,
      units_per_bulk: val,
      cost_price:
        prev.has_bulk_pricing && val > 0 && prev.bulk_buying_price > 0
          ? prev.bulk_buying_price / val
          : prev.cost_price,
    }))
  }

  // ── Change how the product is sold (unit / both / bulk) ──
  function onPricingModeChange(mode: 'unit' | 'both' | 'bulk') {
    setD(prev => {
      if (mode === 'bulk') {
        // Bulk-only: the carton IS the unit. No pieces conversion.
        // units_per_bulk = 1 so stock_qty directly = number of cartons,
        // and the unit cost equals the bulk buying price.
        return {
          ...prev,
          pricing_mode:     'bulk',
          has_bulk_pricing: true,
          units_per_bulk:   1,
          cost_price:       prev.bulk_buying_price || prev.cost_price,
        }
      }
      return {
        ...prev,
        pricing_mode:     mode,
        has_bulk_pricing: mode !== 'unit',
        cost_price:
          mode === 'both' && prev.bulk_buying_price > 0 && prev.units_per_bulk > 0
            ? prev.bulk_buying_price / prev.units_per_bulk
            : prev.cost_price,
      }
    })
  }

  // When bulk unit changes, auto-fill units_per_bulk from known presets
  // (dozen=12, gross=144, crate=24...) so users don't have to remember counts
  function onBulkUnitChange(unit: string) {
    const preset = BULK_UNIT_PRESETS[unit]
    setD(prev => ({
      ...prev,
      bulk_unit: unit,
      ...(preset ? {
        units_per_bulk: preset,
        cost_price: prev.bulk_buying_price > 0 ? prev.bulk_buying_price / preset : prev.cost_price,
      } : {}),
    }))
  }

  // ── Opening stock: enter as bulk count ───────────────────
  function onBulkStockChange(bulks: number) {
    setBulkStockQty(bulks)
    setD(prev => ({ ...prev, stock_qty: bulks * prev.units_per_bulk }))
  }

  // ── Computed margins ─────────────────────────────────────
  const unitMargin =
    d.selling_price > 0 && d.cost_price > 0
      ? ((d.selling_price - d.cost_price) / d.selling_price) * 100
      : null

  const bulkMargin =
    d.bulk_selling_price > 0 && d.bulk_buying_price > 0
      ? ((d.bulk_selling_price - d.bulk_buying_price) / d.bulk_selling_price) * 100
      : null

  // ── Image handler ────────────────────────────────────────
  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500_000) { addToast('error', 'Image too large — max 500 KB'); return }
    const reader = new FileReader()
    reader.onload = () => set('image_data', reader.result as string)
    reader.readAsDataURL(file)
  }

  // ── Price history ────────────────────────────────────────
  async function loadHistory() {
    if (!product) return
    const [ph, pch] = await Promise.all([
      window.api.products.priceHistory(product.id),
      window.api.products.priceChangeHistory(product.id),
    ])
    if (ph.success)  setPriceHistory(ph.data)
    if (pch.success) setPriceChangeHistory(pch.data)
  }

  // ── Save ─────────────────────────────────────────────────
  async function save() {
    if (!d.name.trim()) { addToast('error', 'Product name is required'); return }

    // Ensure cost_price is fully derived before saving
    const bulkOnly = d.pricing_mode === 'bulk'
    const both     = d.pricing_mode === 'both'
    const payload = {
      ...d,
      pricing_mode:     d.pricing_mode,
      has_bulk_pricing: d.pricing_mode !== 'unit',
      // Bulk-only: carton is the unit → units_per_bulk 1, cost = bulk price.
      // Both: unit cost = bulk price ÷ pieces per carton.
      units_per_bulk:   bulkOnly ? 1 : d.units_per_bulk,
      cost_price:       bulkOnly
        ? (d.bulk_buying_price || d.cost_price)
        : (both && d.units_per_bulk > 0 && d.bulk_buying_price > 0
            ? d.bulk_buying_price / d.units_per_bulk
            : d.cost_price),
    }

    setSaving(true)
    const r = product
      ? await window.api.products.update(product.id, payload)
      : await window.api.products.create(payload)
    setSaving(false)

    if (r.success) {
      addToast('success', product ? 'Product updated' : 'Product added')
      onSaved()
    } else {
      addToast('error', r.error || 'Save failed')
    }
  }

  // ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold">{product ? 'Edit Product' : 'Add Product'}</h2>
          <div className="flex items-center gap-2">
            {product && (
              <button
                onClick={() => { loadHistory(); setPriceHistory(v => v ? null : []) }}
                className="btn-secondary text-xs flex items-center gap-1 py-1.5"
              >
                <History className="w-3.5 h-3.5" /> Price History
              </button>
            )}
            <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
          </div>
        </div>

        <div className="p-6 space-y-5">

          {/* ── SECTION 1: Basic Info ── */}
          <div className="flex gap-4 items-start">
            {/* Image picker */}
            <div className="flex-shrink-0">
              <div
                onClick={() => fileRef.current?.click()}
                className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-400 flex items-center justify-center cursor-pointer overflow-hidden bg-slate-50 transition"
              >
                {d.image_data
                  ? <img src={d.image_data} className="w-full h-full object-cover" />
                  : (
                    <div className="text-center">
                      <Camera className="w-6 h-6 text-slate-300 mx-auto" />
                      <p className="text-[10px] text-slate-400 mt-1">Add photo</p>
                    </div>
                  )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
              {d.image_data && (
                <button
                  onClick={() => set('image_data', null)}
                  className="text-xs text-red-400 mt-1 w-full text-center hover:text-red-600"
                >Remove</button>
              )}
            </div>

            {/* Name / Category / Unit */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="label">Product Name *</label>
                <input
                  className="input"
                  value={d.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Indomie Noodles 70g"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Category</label>
                  <select
                    className="input"
                    value={d.category_id ?? ''}
                    onChange={e => set('category_id', e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— None —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Retail Unit</label>
                  <select className="input" value={d.unit} onChange={e => set('unit', e.target.value)}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ── SECTION 2: HOW YOU SELL ── */}
          <div className="rounded-xl border border-blue-100 overflow-hidden">
            <div className="bg-blue-50 px-4 py-2.5">
              <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                <Package className="w-4 h-4" /> How You Sell This Product
              </p>
            </div>

            <div className="p-4 space-y-4">
              {/* 3-way selector: pieces only / both / bulk only */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['unit', '🔢', 'Pieces only',  `Sell loose ${d.unit}`] as const,
                  ['both', '📦🔢', 'Both ways',    `Pieces and ${d.bulk_unit}s`] as const,
                  ['bulk', '📦', 'Bulk only',     `Sell only by ${d.bulk_unit}`] as const,
                ]).map(([m, icon, title, sub]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onPricingModeChange(m)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition ${
                      d.pricing_mode === m
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-lg">{icon}</span>
                    <span className={`text-xs font-semibold ${d.pricing_mode === m ? 'text-blue-700' : 'text-slate-700'}`}>{title}</span>
                    <span className="text-[10px] text-slate-400 leading-tight">{sub}</span>
                  </button>
                ))}
              </div>

              {d.pricing_mode === 'bulk' ? (
                /* ── BULK ONLY — keep it dead simple ──────────────
                   The carton IS the unit. No pieces, no per-piece cost,
                   no conversion. Just: what you call it, what you pay,
                   what you sell it for. */
                <div className="space-y-3">
                  <div>
                    <label className="label">What do you sell it by?</label>
                    <select
                      className="input max-w-[260px]"
                      value={d.bulk_unit}
                      onChange={e => setD(prev => ({ ...prev, bulk_unit: e.target.value, units_per_bulk: 1 }))}
                    >
                      {BULK_UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">e.g. carton, bag, crate, sack</p>
                  </div>
                  <div>
                    <label className="label">Buying Price ({sym}/{d.bulk_unit})</label>
                    <div className="relative max-w-[260px]">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                      <input
                        type="number" step="0.01" min="0" className="input pl-8"
                        value={d.bulk_buying_price || ''}
                        onChange={e => {
                          const v = parseFloat(e.target.value) || 0
                          // carton is the unit → cost_price = bulk price, units_per_bulk = 1
                          setD(prev => ({ ...prev, bulk_buying_price: v, cost_price: v, units_per_bulk: 1 }))
                        }}
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">What you pay for one {d.bulk_unit}</p>
                  </div>
                </div>
              ) : d.pricing_mode === 'both' ? (
                <>
                  {/* Step 1: Bulk unit + count */}
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="label">Bulk Unit</label>
                      <select
                        className="input"
                        value={d.bulk_unit}
                        onChange={e => onBulkUnitChange(e.target.value)}
                      >
                        {BULK_UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">{d.unit}s per {d.bulk_unit}</label>
                      <input
                        type="number" step="1" min="1" className="input"
                        value={d.units_per_bulk || ''}
                        onChange={e => onUnitsPerBulkChange(parseFloat(e.target.value) || 1)}
                        placeholder="e.g. 24"
                      />
                    </div>
                    <div className="flex items-center pb-2">
                      <span className="text-xs font-medium text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                        1 {d.bulk_unit} = {d.units_per_bulk} {d.unit}
                      </span>
                    </div>
                  </div>

                  {/* Step 2: Bulk buying → auto unit cost */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">
                        Bulk Buying Price ({sym}/{d.bulk_unit})
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                        <input
                          type="number" step="0.01" min="0" className="input pl-8"
                          value={d.bulk_buying_price || ''}
                          onChange={e => onBulkBuyingChange(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                        />
                      </div>
                      {d.bulk_buying_price > 0 && (
                        <p className="text-xs text-slate-400 mt-1">
                          What you pay per {d.bulk_unit}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="label">
                        Unit Cost Price ({sym}/{d.unit})
                        <span className="ml-1.5 text-[10px] font-normal text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">auto</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                        <input
                          type="number" step="0.01" className="input pl-8 bg-slate-50 text-slate-600"
                          value={d.cost_price > 0 ? d.cost_price.toFixed(4) : ''}
                          readOnly
                          placeholder="Auto-calculated"
                        />
                      </div>
                      {d.bulk_buying_price > 0 && d.units_per_bulk > 0 && (
                        <p className="text-xs text-blue-600 mt-1 font-medium">
                          = {sym}{d.bulk_buying_price.toFixed(2)} ÷ {d.units_per_bulk}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                /* Pieces only: direct unit cost entry */
                <div>
                  <label className="label">Unit Buying Price ({sym}/{d.unit})</label>
                  <div className="relative max-w-[260px]">
                    <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                    <input
                      type="number" step="0.01" min="0" className="input pl-8"
                      value={d.cost_price || ''}
                      onChange={e => set('cost_price', parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">
                    Choose "Both ways" or "Bulk only" above to enter carton/crate pricing instead
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── SECTION 3: HOW YOU SELL ── */}
          <div className="rounded-xl border border-green-100 overflow-hidden">
            <div className="bg-green-50 px-4 py-2.5">
              <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> How You Sell
              </p>
            </div>
            <div className="p-4 space-y-4">

              {/* Bulk selling price (when product sells in bulk) */}
              {d.pricing_mode !== 'unit' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label">
                      Bulk Selling Price ({sym}/{d.bulk_unit})
                    </label>
                    <MarginBadge margin={bulkMargin} />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                    <input
                      type="number" step="0.01" min="0" className="input pl-8"
                      value={d.bulk_selling_price || ''}
                      onChange={e => set('bulk_selling_price', parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                  </div>
                  {bulkMargin !== null && (
                    <p className={`text-xs mt-1 ${bulkMargin >= 20 ? 'text-green-600' : bulkMargin >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                      Profit {sym}{(d.bulk_selling_price - d.bulk_buying_price).toFixed(2)} per {d.bulk_unit} · {bulkMargin.toFixed(1)}% margin
                    </p>
                  )}
                </div>
              )}

              {/* Unit selling price — shown unless the product is bulk-only */}
              {d.pricing_mode !== 'bulk' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label">
                    Unit Selling Price ({sym}/{d.unit})
                  </label>
                  <MarginBadge margin={unitMargin} />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                  <input
                    type="number" step="0.01" min="0" className="input pl-8"
                    value={d.selling_price || ''}
                    onChange={e => set('selling_price', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                </div>
                {unitMargin !== null && (
                  <p className={`text-xs mt-1 ${unitMargin >= 20 ? 'text-green-600' : unitMargin >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                    Profit {sym}{(d.selling_price - d.cost_price).toFixed(2)} per {d.unit} · {unitMargin.toFixed(1)}% margin
                  </p>
                )}
              </div>
              )}
            </div>
          </div>

          {/* ── SECTION 4: PRICE ADVISOR ── */}
          {d.cost_price > 0 && (
            <div className="rounded-xl border border-purple-100 overflow-hidden">
              <button
                onClick={() => setShowAdvisor(v => !v)}
                className="w-full bg-purple-50 px-4 py-2.5 flex items-center justify-between hover:bg-purple-100 transition"
              >
                <p className="text-sm font-semibold text-purple-800 flex items-center gap-2">
                  <Calculator className="w-4 h-4" /> Price Advisor
                  <span className="text-xs font-normal text-purple-500">
                    — what to charge for your target margin
                  </span>
                </p>
                {showAdvisor
                  ? <ChevronUp className="w-4 h-4 text-purple-400" />
                  : <ChevronDown className="w-4 h-4 text-purple-400" />
                }
              </button>

              {showAdvisor && (
                <div className="p-4">
                  {/* Cost summary */}
                  <div className="flex flex-wrap gap-4 mb-4 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                    <span>Unit cost: <strong className="text-slate-700">{sym}{d.cost_price.toFixed(2)}</strong></span>
                    {d.has_bulk_pricing && d.bulk_buying_price > 0 && (
                      <span>Bulk cost: <strong className="text-slate-700">{sym}{d.bulk_buying_price.toFixed(2)}</strong> / {d.bulk_unit}</span>
                    )}
                    {d.has_bulk_pricing && (
                      <span className="text-blue-500">unit cost auto-derived from bulk</span>
                    )}
                  </div>

                  {/* Margin table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs text-slate-500">
                          <th className="pb-2 text-left font-medium w-16">Margin</th>
                          <th className="pb-2 text-right font-medium">Unit Price ({sym})</th>
                          {d.has_bulk_pricing && (
                            <th className="pb-2 text-right font-medium">
                              {d.bulk_unit} Price ({sym})
                            </th>
                          )}
                          <th className="pb-2 text-right font-medium w-20">Apply</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {MARGIN_TARGETS.map(pct => {
                          const sugUnit = priceAtMargin(d.cost_price, pct)
                          const sugBulk = d.has_bulk_pricing
                            ? priceAtMargin(d.bulk_buying_price, pct)
                            : 0
                          const activeUnit = Math.abs(d.selling_price - sugUnit) < 0.02
                          const activeBulk = d.has_bulk_pricing
                            ? Math.abs(d.bulk_selling_price - sugBulk) < 0.02
                            : false
                          const isActive = activeUnit && (!d.has_bulk_pricing || activeBulk)

                          return (
                            <tr key={pct} className={isActive ? 'bg-purple-50' : ''}>
                              <td className="py-2 font-bold text-purple-700">{pct}%</td>
                              <td className="py-2 text-right tabular-nums">
                                {sym}{sugUnit.toFixed(2)}
                              </td>
                              {d.has_bulk_pricing && (
                                <td className="py-2 text-right tabular-nums">
                                  {sym}{sugBulk.toFixed(2)}
                                </td>
                              )}
                              <td className="py-2 text-right">
                                <button
                                  onClick={() =>
                                    setD(prev => ({
                                      ...prev,
                                      selling_price: parseFloat(sugUnit.toFixed(2)),
                                      ...(d.has_bulk_pricing
                                        ? { bulk_selling_price: parseFloat(sugBulk.toFixed(2)) }
                                        : {}),
                                    }))
                                  }
                                  className={`text-xs px-2 py-0.5 rounded-md transition ${
                                    isActive
                                      ? 'bg-purple-200 text-purple-800 font-semibold'
                                      : 'bg-slate-100 hover:bg-purple-100 text-slate-600 hover:text-purple-700'
                                  }`}
                                >
                                  {isActive ? '✓ Applied' : 'Apply'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">
                    Formula: sell&nbsp;=&nbsp;cost&nbsp;÷&nbsp;(1&nbsp;−&nbsp;margin%).
                    Applying sets both unit and bulk prices simultaneously.
                    You can still edit the price fields directly above.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── SECTION 5: STOCK ── */}
          <div className="grid grid-cols-3 gap-3">
            {/* Opening stock with bulk/unit toggle */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Opening Stock</label>
                {d.has_bulk_pricing && d.units_per_bulk > 1 && (
                  <div className="flex text-[10px] bg-slate-100 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setStockMode('units')}
                      className={`px-2 py-0.5 transition font-medium ${
                        stockMode === 'units' ? 'bg-blue-500 text-white' : 'text-slate-500'
                      }`}
                    >{d.unit}</button>
                    <button
                      onClick={() => setStockMode('bulks')}
                      className={`px-2 py-0.5 transition font-medium ${
                        stockMode === 'bulks' ? 'bg-blue-500 text-white' : 'text-slate-500'
                      }`}
                    >{d.bulk_unit}</button>
                  </div>
                )}
              </div>

              {stockMode === 'bulks' && d.has_bulk_pricing ? (
                <>
                  <input
                    type="number" step="1" min="0" className="input"
                    value={bulkStockQty || ''}
                    onChange={e => onBulkStockChange(parseFloat(e.target.value) || 0)}
                    placeholder={`# of ${d.bulk_unit}s`}
                  />
                  {bulkStockQty > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      {bulkStockQty} × {d.units_per_bulk} = <strong>{d.stock_qty} {d.unit}</strong>
                    </p>
                  )}
                </>
              ) : (
                <input
                  type="number" step="0.01" min="0" className="input"
                  value={d.stock_qty || ''}
                  onChange={e => set('stock_qty', parseFloat(e.target.value) || 0)}
                  placeholder={d.pricing_mode === 'bulk' ? `# of ${d.bulk_unit}s` : `qty in ${d.unit}`}
                />
              )}
              {d.pricing_mode === 'bulk' && (
                <p className="text-xs text-slate-400 mt-1">How many {d.bulk_unit}s you have in stock</p>
              )}
            </div>

            <div>
              <label className="label">Reorder Level (low-stock alert)</label>
              <div className="flex gap-2">
                <input
                  type="number" step="1" min="0" className="input flex-1"
                  value={reorderInPacks
                    ? (d.units_per_bulk > 0 ? +(d.reorder_level / d.units_per_bulk).toFixed(2) : d.reorder_level)
                    : (d.reorder_level || '')}
                  onChange={e => {
                    const v = parseFloat(e.target.value) || 0
                    // Store reorder_level in PIECES always. If entered in packs,
                    // convert using units_per_bulk so alerts stay consistent.
                    set('reorder_level', reorderInPacks ? v * (d.units_per_bulk || 1) : v)
                  }}
                />
                {/* Only offer the pack option when the product actually has a bulk unit */}
                {(d.pricing_mode === 'both' || d.pricing_mode === 'bulk') && d.units_per_bulk > 1 && (
                  <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
                    <button type="button" onClick={() => setReorderInPacks(false)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium ${!reorderInPacks ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                      {d.unit}
                    </button>
                    <button type="button" onClick={() => setReorderInPacks(true)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium ${reorderInPacks ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                      {d.bulk_unit}
                    </button>
                  </div>
                )}
              </div>
              {(d.pricing_mode === 'both' || d.pricing_mode === 'bulk') && d.units_per_bulk > 1 && (
                <p className="text-xs text-slate-400 mt-1">
                  Alerts when stock falls to {d.reorder_level} {d.unit}
                  {' '}({d.units_per_bulk > 0 ? +(d.reorder_level / d.units_per_bulk).toFixed(1) : 0} {d.bulk_unit})
                </p>
              )}
            </div>

            <div>
              <label className="label">SKU</label>
              <input
                className="input"
                value={d.sku}
                onChange={e => set('sku', e.target.value)}
                placeholder="Auto"
              />
            </div>
          </div>

          {/* ── Advanced fields (barcode, description) ── */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
          >
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showAdvanced ? 'Hide' : 'Show'} advanced fields
          </button>

          {showAdvanced && (
            <div className="space-y-3">
              <div>
                <label className="label">Barcode</label>
                <input
                  className="input"
                  value={d.barcode}
                  onChange={e => set('barcode', e.target.value)}
                  placeholder="Scan or type"
                />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  className="input h-16"
                  value={d.description}
                  onChange={e => set('description', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ── SECTION 6: PRICE HISTORY (edit mode only) ── */}
          {(priceHistory !== null || priceChangeHistory !== null) && (
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-slate-100">
                <button
                  onClick={() => { setPriceHistory(v => v ?? []); setPriceChangeHistory(null) }}
                  className={`flex-1 py-2.5 text-xs font-medium transition ${
                    priceHistory !== null && priceChangeHistory === null
                      ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  📦 Purchase History
                </button>
                <button
                  onClick={() => { setPriceChangeHistory(v => v ?? []); setPriceHistory(null) }}
                  className={`flex-1 py-2.5 text-xs font-medium transition ${
                    priceChangeHistory !== null
                      ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  💰 Price Changes
                </button>
              </div>

              <div className="p-4">
                {/* Safety note */}
                <div className="bg-green-50 border border-green-100 rounded-lg p-2 mb-3 text-xs text-green-700">
                  ✅ Price changes never affect past sales — each sale permanently stores
                  the selling price and cost price at the exact moment of purchase.
                  Your P&amp;L is always historically accurate.
                </div>

                {/* Purchase history table */}
                {priceHistory !== null && (
                  priceHistory.length === 0
                    ? <p className="text-sm text-slate-400 text-center py-4">No purchase history yet.</p>
                    : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="pb-2 text-left text-xs text-slate-500">Date</th>
                            <th className="pb-2 text-left text-xs text-slate-500">Cost</th>
                            <th className="pb-2 text-left text-xs text-slate-500">Mode</th>
                            <th className="pb-2 text-left text-xs text-slate-500">Supplier</th>
                            <th className="pb-2 text-left text-xs text-slate-500">Qty</th>
                            <th className="pb-2 text-left text-xs text-slate-500">Ref / By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {priceHistory.map((h: any) => (
                            <tr key={h.id}>
                              <td className="py-1.5 text-xs text-slate-500">
                                {new Date(h.recorded_at).toLocaleDateString()}
                              </td>
                              <td className="py-1.5 font-medium">{sym}{h.cost_price.toFixed(2)}</td>
                              <td className="py-1.5">
                                <span className="badge bg-slate-100 text-slate-600 text-xs">{h.sell_unit}</span>
                              </td>
                              <td className="py-1.5 text-xs text-slate-500">{h.supplier_name || '—'}</td>
                              <td className="py-1.5 text-xs text-slate-500">{h.qty_bought || '—'}</td>
                              <td className="py-1.5 text-xs text-slate-500">
                                {h.invoice_ref
                                  ? <span className="text-blue-600 font-medium">{h.invoice_ref}</span>
                                  : (h.recorder_name || '—')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                )}

                {/* Price change history table */}
                {priceChangeHistory !== null && (
                  priceChangeHistory.length === 0
                    ? <p className="text-sm text-slate-400 text-center py-4">No price changes recorded yet.</p>
                    : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="pb-2 text-left text-slate-500">Date</th>
                            <th className="pb-2 text-left text-slate-500">Cost</th>
                            <th className="pb-2 text-left text-slate-500">Sell Price</th>
                            <th className="pb-2 text-left text-slate-500">By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {priceChangeHistory.map((h: any) => (
                            <tr key={h.id}>
                              <td className="py-1.5 text-slate-500">
                                {new Date(h.changed_at).toLocaleDateString()}
                              </td>
                              <td className="py-1.5">
                                {h.old_cost_price?.toFixed(2) !== h.new_cost_price?.toFixed(2) && (
                                  <span>
                                    <span className="line-through text-slate-400">{sym}{h.old_cost_price?.toFixed(2)}</span>
                                    {' → '}
                                    <span className="font-medium text-slate-700">{sym}{h.new_cost_price?.toFixed(2)}</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5">
                                {h.old_sell_price?.toFixed(2) !== h.new_sell_price?.toFixed(2) && (
                                  <span>
                                    <span className="line-through text-slate-400">{sym}{h.old_sell_price?.toFixed(2)}</span>
                                    {' → '}
                                    <span className="font-medium text-blue-600">{sym}{h.new_sell_price?.toFixed(2)}</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 text-slate-500">{h.changer_name || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                )}
              </div>
            </div>
          )}

          {/* ── Footer buttons ── */}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : product ? 'Update Product' : 'Add Product'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
