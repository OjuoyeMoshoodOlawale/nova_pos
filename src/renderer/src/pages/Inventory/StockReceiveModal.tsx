// StockReceiveModal.tsx — Smart stock receiving with bulk-to-unit calculation
import { useState, useEffect } from 'react'
import { Product } from '@shared/types'
import { useAuthStore } from '../../store/authStore'
import { useAppStore }  from '../../store/appStore'
import { X, Calculator, TrendingUp, Package, ChevronRight } from 'lucide-react'

const BULK_UNITS = ['carton','crate','dozen','pack','bag','bale','bundle','case','sack','tray','gross','roll']

interface Props { product?: Product; onClose: ()=>void; onSaved: ()=>void }

export default function StockReceiveModal({ product: initialProduct, onClose, onSaved }: Props) {
  const { user }              = useAuthStore()
  const { addToast, profile } = useAppStore()
  const sym                   = profile?.currency_symbol ?? '₦'

  const [search,       setSearch]       = useState('')
  const [results,      setResults]      = useState<Product[]>([])
  const [product,      setProduct]      = useState<Product | null>(initialProduct ?? null)
  const [suppliers,    setSuppliers]    = useState<any[]>([])
  const [saving,       setSaving]       = useState(false)

  // How product was purchased
  const [buyMode,      setBuyMode]      = useState<'bulk'|'unit'>('bulk')
  const [bulkUnit,     setBulkUnit]     = useState('carton')
  const [unitsPerBulk, setUnitsPerBulk] = useState(1)
  const [qtyBulks,     setQtyBulks]     = useState(1)   // how many cartons/etc received
  const [qtyUnits,     setQtyUnits]     = useState(1)   // if bought by unit
  const [costPerBulk,  setCostPerBulk]  = useState(0)   // e.g. cost per carton
  const [costPerUnit,  setCostPerUnit]  = useState(0)   // e.g. cost per piece
  const [supplierId,   setSupplierId]   = useState<number|null>(null)
  const [notes,        setNotes]        = useState('')

  // Selling prices
  const [unitSellPrice, setUnitSellPrice] = useState(0)
  const [bulkSellPrice, setBulkSellPrice] = useState(0)
  const [updatePrices,  setUpdatePrices]  = useState(true)

  // ── Derived calculations ──────────────────────────────
  const totalUnitsReceived = buyMode === 'bulk'
    ? qtyBulks * unitsPerBulk
    : qtyUnits

  const calcCostPerUnit = buyMode === 'bulk'
    ? (unitsPerBulk > 0 ? costPerBulk / unitsPerBulk : 0)
    : costPerUnit

  const totalCost = buyMode === 'bulk'
    ? qtyBulks * costPerBulk
    : qtyUnits * costPerUnit

  const unitMargin = unitSellPrice > 0 && calcCostPerUnit > 0
    ? (((unitSellPrice - calcCostPerUnit) / unitSellPrice) * 100).toFixed(1)
    : null

  const bulkMargin = bulkSellPrice > 0 && costPerBulk > 0
    ? (((bulkSellPrice - costPerBulk) / bulkSellPrice) * 100).toFixed(1)
    : null

  useEffect(() => {
    window.api.suppliers.getAll().then((r:any) => { if(r.success) setSuppliers(r.data) })
  }, [])

  useEffect(() => {
    if (product) {
      setBulkUnit(product.bulk_unit || 'carton')
      setUnitsPerBulk(product.units_per_bulk || 1)
      setUnitSellPrice(product.selling_price)
      setBulkSellPrice(product.bulk_selling_price || 0)
      setCostPerUnit(product.cost_price)
      setBuyMode(product.has_bulk_pricing ? 'bulk' : 'unit')
    }
  }, [product])

  // Auto-suggest bulk sell price
  useEffect(() => {
    if (buyMode === 'bulk' && costPerBulk > 0 && bulkSellPrice === 0) {
      setBulkSellPrice(+(costPerBulk * 1.3).toFixed(2))
    }
  }, [costPerBulk])

  useEffect(() => {
    if (calcCostPerUnit > 0 && unitSellPrice === 0) {
      setUnitSellPrice(+(calcCostPerUnit * 1.25).toFixed(2))
    }
  }, [calcCostPerUnit])

  async function doSearch(q: string) {
    setSearch(q)
    if (!q.trim()) { setResults([]); return }
    const r = await window.api.products.search(q)
    if (r.success) setResults(r.data.slice(0, 6))
  }

  async function handleSave() {
    if (!product || !user) return
    if (totalUnitsReceived <= 0) { addToast('error', 'Enter quantity received'); return }
    if (calcCostPerUnit <= 0)    { addToast('error', 'Enter buying price'); return }

    setSaving(true)
    const r = await window.api.products.receiveStock({
      product_id:              product.id,
      buy_mode:                buyMode,
      qty_received:            totalUnitsReceived,
      cost_per_unit:           calcCostPerUnit,
      total_cost:              totalCost,
      supplier_id:             supplierId ?? undefined,
      notes:                   notes || undefined,
      new_selling_price:       updatePrices ? unitSellPrice : undefined,
      new_bulk_selling_price:  updatePrices && bulkSellPrice > 0 ? bulkSellPrice : undefined,
      recorded_by:             user.id,
    })
    setSaving(false)

    if (r.success) {
      addToast('success', `✅ Stock received: +${totalUnitsReceived} ${product.unit} of ${product.name}`)
      onSaved()
    } else {
      addToast('error', `Failed: ${r.error || 'Unknown error'}`)
    }
  }

  const CurrencyInput = ({ label, value, onChange, hint }: any) => (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-medium">{sym}</span>
        <input type="number" step="0.01" min="0" value={value||''} onChange={e=>onChange(parseFloat(e.target.value)||0)}
          className="input pl-8" placeholder="0.00"/>
      </div>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Receive Stock</h2>
            <p className="text-xs text-slate-400">Record new stock purchase</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-slate-700"/></button>
        </div>

        <div className="p-6 space-y-5">

          {/* ── Product select ────────────────────────────────── */}
          {!product ? (
            <div>
              <label className="label">Select Product *</label>
              <input value={search} onChange={e=>doSearch(e.target.value)}
                placeholder="Search by name or barcode..." className="input"/>
              {results.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
                  {results.map(p => (
                    <button key={p.id} onClick={()=>{setProduct(p);setResults([]);setSearch('')}}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition border-b border-slate-50 last:border-0 text-left">
                      <div>
                        <p className="font-medium text-sm text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.unit} · {p.stock_qty} in stock</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-blue-600">{sym}{p.cost_price.toFixed(2)}</p>
                        <p className="text-xs text-slate-400">current cost</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <Package className="w-8 h-8 text-blue-500 flex-shrink-0"/>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800">{product.name}</p>
                <p className="text-xs text-slate-500">
                  Current stock: {product.stock_qty} {product.unit} ·
                  Last cost: {sym}{product.cost_price.toFixed(2)}/{product.unit}
                </p>
              </div>
              <button onClick={()=>{setProduct(null);setSearch('')}} className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0">Change</button>
            </div>
          )}

          {product && (<>
            {/* ── How did you buy it? ─────────────────────────── */}
            <div>
              <p className="label mb-2">How was this purchased?</p>
              <div className="grid grid-cols-2 gap-3">
                {([['bulk','In Bulk (carton, crate...)','📦'],['unit','By Unit (pieces, bottles...)','🔢']] as const).map(([m,l,ic])=>(
                  <button key={m} onClick={()=>setBuyMode(m)}
                    className={`flex flex-col items-center gap-1 py-4 rounded-xl border-2 font-medium text-sm transition
                      ${buyMode===m?'border-blue-500 bg-blue-50 text-blue-700':'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    <span className="text-2xl">{ic}</span>
                    <span>{l}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Bulk mode ────────────────────────────────────── */}
            {buyMode === 'bulk' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Bulk Unit</label>
                    <select className="input" value={bulkUnit} onChange={e=>setBulkUnit(e.target.value)}>
                      {BULK_UNITS.map(u=><option key={u}>{u}</option>)}
                    </select></div>
                  <div><label className="label">{product.unit}s per {bulkUnit}</label>
                    <input type="number" step="1" min="1" value={unitsPerBulk||''}
                      onChange={e=>setUnitsPerBulk(parseInt(e.target.value)||1)} className="input"
                      placeholder="e.g. 24"/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Qty {bulkUnit}s received</label>
                    <input type="number" step="1" min="1" value={qtyBulks||''}
                      onChange={e=>setQtyBulks(parseInt(e.target.value)||0)} className="input"/>
                  </div>
                  <CurrencyInput label={`Cost per ${bulkUnit}`} value={costPerBulk} onChange={setCostPerBulk}/>
                </div>
              </div>
            )}

            {/* ── Unit mode ────────────────────────────────────── */}
            {buyMode === 'unit' && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Qty {product.unit}s received</label>
                  <input type="number" step="0.01" min="1" value={qtyUnits||''}
                    onChange={e=>setQtyUnits(parseFloat(e.target.value)||0)} className="input"/>
                </div>
                <CurrencyInput label={`Buying price per ${product.unit}`} value={costPerUnit} onChange={setCostPerUnit}/>
              </div>
            )}

            {/* ── Calculated summary ─────────────────────────── */}
            {totalUnitsReceived > 0 && calcCostPerUnit > 0 && (
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5"/> Calculation
                </p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white rounded-lg p-3 border border-slate-100">
                    <p className="text-xl font-bold text-blue-600">{totalUnitsReceived}</p>
                    <p className="text-xs text-slate-500">{product.unit}s received</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-slate-100">
                    <p className="text-xl font-bold text-slate-700">{sym}{calcCostPerUnit.toFixed(2)}</p>
                    <p className="text-xs text-slate-500">cost per {product.unit}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-slate-100">
                    <p className="text-xl font-bold text-slate-700">{sym}{totalCost.toFixed(2)}</p>
                    <p className="text-xs text-slate-500">total spend</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Selling prices ────────────────────────────────── */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input type="checkbox" checked={updatePrices} onChange={e=>setUpdatePrices(e.target.checked)}/>
                <span className="text-sm font-medium text-slate-800">Update selling prices for this product</span>
              </label>
              {updatePrices && (
                <div className="space-y-3 pl-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <CurrencyInput label={`Sell price per ${product.unit}`} value={unitSellPrice} onChange={setUnitSellPrice}/>
                      {unitMargin && <p className={`text-xs mt-1 font-medium ${parseFloat(unitMargin)>=20?'text-green-600':parseFloat(unitMargin)>=10?'text-amber-600':'text-red-600'}`}>Margin: {unitMargin}%</p>}
                    </div>
                    {(buyMode === 'bulk' || product.has_bulk_pricing) && (
                      <div>
                        <CurrencyInput label={`Sell price per ${bulkUnit}`} value={bulkSellPrice} onChange={setBulkSellPrice}/>
                        {bulkMargin && <p className={`text-xs mt-1 font-medium ${parseFloat(bulkMargin)>=20?'text-green-600':parseFloat(bulkMargin)>=10?'text-amber-600':'text-red-600'}`}>Margin: {bulkMargin}%</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Supplier + Notes ──────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Supplier (optional)</label>
                <select className="input" value={supplierId??''} onChange={e=>setSupplierId(e.target.value?parseInt(e.target.value):null)}>
                  <option value="">— Not specified —</option>
                  {suppliers.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div><label className="label">Notes (optional)</label>
                <input className="input" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Batch #A12"/></div>
            </div>

            {/* ── Actions ──────────────────────────────────────── */}
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving || !product || totalUnitsReceived <= 0}
                className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving ? 'Saving...' : <>Confirm Receipt <ChevronRight className="w-4 h-4"/></>}
              </button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
}
