import { useState, useRef } from 'react'
import { Product, Category } from '@shared/types'
import { useAppStore } from '../../store/appStore'
import { X, Camera, Package, ChevronDown, ChevronUp, History, Plus } from 'lucide-react'

interface Props { product: Product|null; categories: Category[]; onClose:()=>void; onSaved:()=>void }

const UNITS = ['pcs','kg','g','litre','ml','pack','box','dozen','pair','roll','bottle','bag','tin','sachet','yard','metre','sheet']
const BULK_UNITS = ['carton','crate','dozen','pack','bag','bale','bundle','case','pallet','sack','tray','gross']

export default function ProductForm({product, categories, onClose, onSaved}: Props) {
  const {addToast, profile} = useAppStore()
  const sym = profile?.currency_symbol ?? '₦'
  const fileRef = useRef<HTMLInputElement>(null)

  const [d, setD] = useState({
    name:               product?.name||'',
    sku:                product?.sku||'',
    barcode:            product?.barcode||'',
    category_id:        product?.category_id||null as number|null,
    supplier_id:        product?.supplier_id||null as number|null,
    unit:               product?.unit||'pcs',
    cost_price:         product?.cost_price??0,
    selling_price:      product?.selling_price??0,
    stock_qty:          product?.stock_qty??0,
    reorder_level:      product?.reorder_level??5,
    description:        product?.description||'',
    has_bulk_pricing:   product?.has_bulk_pricing??false,
    bulk_unit:          product?.bulk_unit||'carton',
    units_per_bulk:     product?.units_per_bulk??1,
    bulk_buying_price:  product?.bulk_buying_price??0,
    bulk_selling_price: product?.bulk_selling_price??0,
    image_data:         product?.image_data||null as string|null,
  })
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [priceHistory, setPriceHistory] = useState<any[]|null>(null)

  const set = (k: string, v: unknown) => setD(p => ({...p, [k]: v}))

  const unitMargin = d.selling_price > 0 && d.cost_price > 0
    ? (((d.selling_price - d.cost_price) / d.selling_price) * 100).toFixed(1)
    : null
  const bulkMargin = d.bulk_selling_price > 0 && d.bulk_buying_price > 0
    ? (((d.bulk_selling_price - d.bulk_buying_price) / d.bulk_selling_price) * 100).toFixed(1)
    : null

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500_000) { addToast('error','Image too large — max 500KB'); return }
    const reader = new FileReader()
    reader.onload = () => set('image_data', reader.result as string)
    reader.readAsDataURL(file)
  }

  async function loadHistory() {
    if (!product) return
    const r = await window.api.products.priceHistory(product.id)
    if (r.success) setPriceHistory(r.data)
  }

  async function save() {
    if (!d.name.trim()) { addToast('error','Product name required'); return }
    setSaving(true)
    const r = product
      ? await window.api.products.update(product.id, d)
      : await window.api.products.create(d)
    setSaving(false)
    if (r.success) { addToast('success', product ? 'Product updated' : 'Product added'); onSaved() }
    else addToast('error', r.error || 'Failed')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold">{product ? 'Edit Product' : 'Add Product'}</h2>
          <div className="flex items-center gap-2">
            {product && (
              <button onClick={()=>{ loadHistory(); setPriceHistory(p=>p?null:[]) }}
                className="btn-secondary text-xs flex items-center gap-1 py-1.5">
                <History className="w-3.5 h-3.5"/> Price History
              </button>
            )}
            <button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Image + Name row */}
          <div className="flex gap-4 items-start">
            <div className="flex-shrink-0">
              <div onClick={()=>fileRef.current?.click()}
                className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-400 flex items-center justify-center cursor-pointer overflow-hidden bg-slate-50 transition">
                {d.image_data
                  ? <img src={d.image_data} className="w-full h-full object-cover"/>
                  : <div className="text-center"><Camera className="w-6 h-6 text-slate-300 mx-auto"/><p className="text-[10px] text-slate-400 mt-1">Add photo</p></div>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden"/>
              {d.image_data && <button onClick={()=>set('image_data',null)} className="text-xs text-red-400 mt-1 w-full text-center hover:text-red-600">Remove</button>}
            </div>
            <div className="flex-1 space-y-3">
              <div><label className="label">Product Name *</label>
                <input className="input" value={d.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Indomie Noodles 70g"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Category</label>
                  <select className="input" value={d.category_id??''} onChange={e=>set('category_id',e.target.value?Number(e.target.value):null)}>
                    <option value="">— None —</option>
                    {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><label className="label">Retail Unit</label>
                  <div className="flex gap-1">
                    <select className="input flex-1" value={d.unit} onChange={e=>set('unit',e.target.value)}>
                      {UNITS.map(u=><option key={u}>{u}</option>)}
                    </select>
                  </div></div>
              </div>
            </div>
          </div>

          {/* Unit Pricing */}
          <div className="bg-blue-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-blue-800">Unit Pricing (per {d.unit})</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Buying Price ({sym})</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                  <input type="number" step="0.01" min="0" className="input pl-8" value={d.cost_price||''} onChange={e=>set('cost_price',parseFloat(e.target.value)||0)} placeholder="0.00"/>
                </div></div>
              <div><label className="label">Selling Price ({sym})</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                  <input type="number" step="0.01" min="0" className="input pl-8" value={d.selling_price||''} onChange={e=>set('selling_price',parseFloat(e.target.value)||0)} placeholder="0.00"/>
                </div></div>
            </div>
            {unitMargin && (
              <p className={`text-xs font-medium ${parseFloat(unitMargin)>=20?'text-green-600':parseFloat(unitMargin)>=10?'text-amber-600':'text-red-600'}`}>
                Margin: {unitMargin}% · Profit: {sym}{(d.selling_price-d.cost_price).toFixed(2)} per {d.unit}
              </p>
            )}
          </div>

          {/* Bulk Pricing toggle */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer group">
              <div onClick={()=>set('has_bulk_pricing',!d.has_bulk_pricing)}
                className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${d.has_bulk_pricing?'bg-blue-600':'bg-slate-200'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${d.has_bulk_pricing?'translate-x-5':'translate-x-0.5'}`}/>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">Enable Bulk Pricing</p>
                <p className="text-xs text-slate-400">e.g. sell by carton with different price</p>
              </div>
            </label>

            {d.has_bulk_pricing && (
              <div className="mt-3 bg-amber-50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-800">Bulk Pricing</p>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="label">Bulk Unit</label>
                    <div className="flex gap-1">
                      <select className="input flex-1" value={d.bulk_unit} onChange={e=>set('bulk_unit',e.target.value)}>
                        {BULK_UNITS.map(u=><option key={u}>{u}</option>)}
                      </select>
                    </div></div>
                  <div><label className="label">{d.unit}s per {d.bulk_unit||'bulk'}</label>
                    <input type="number" step="1" min="1" className="input" value={d.units_per_bulk||''} onChange={e=>set('units_per_bulk',parseFloat(e.target.value)||1)} placeholder="e.g. 24"/></div>
                  <div className="flex items-end">
                    <p className="text-xs text-amber-700 pb-2">1 {d.bulk_unit||'bulk'} = {d.units_per_bulk} {d.unit}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Bulk Buying Price ({sym}/{d.bulk_unit||'bulk'})</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                      <input type="number" step="0.01" min="0" className="input pl-8" value={d.bulk_buying_price||''} onChange={e=>set('bulk_buying_price',parseFloat(e.target.value)||0)} placeholder="0.00"/>
                    </div></div>
                  <div><label className="label">Bulk Selling Price ({sym}/{d.bulk_unit||'bulk'})</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                      <input type="number" step="0.01" min="0" className="input pl-8" value={d.bulk_selling_price||''} onChange={e=>set('bulk_selling_price',parseFloat(e.target.value)||0)} placeholder="0.00"/>
                    </div></div>
                </div>
                {bulkMargin && (
                  <p className={`text-xs font-medium ${parseFloat(bulkMargin)>=20?'text-green-600':parseFloat(bulkMargin)>=10?'text-amber-600':'text-red-600'}`}>
                    Bulk margin: {bulkMargin}% · Profit: {sym}{(d.bulk_selling_price-d.bulk_buying_price).toFixed(2)} per {d.bulk_unit}
                  </p>
                )}
                {d.bulk_buying_price > 0 && d.units_per_bulk > 0 && (
                  <p className="text-xs text-slate-500">
                    Effective unit cost from bulk: {sym}{(d.bulk_buying_price/d.units_per_bulk).toFixed(2)} per {d.unit}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Stock */}
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Stock Qty</label>
              <input type="number" step="0.01" min="0" className="input" value={d.stock_qty||''} onChange={e=>set('stock_qty',parseFloat(e.target.value)||0)}/></div>
            <div><label className="label">Reorder Level</label>
              <input type="number" step="1" min="0" className="input" value={d.reorder_level||''} onChange={e=>set('reorder_level',parseFloat(e.target.value)||0)}/></div>
            <div><label className="label">SKU</label>
              <input className="input" value={d.sku} onChange={e=>set('sku',e.target.value)} placeholder="Auto"/></div>
          </div>

          {/* Advanced toggle */}
          <button onClick={()=>setShowAdvanced(p=>!p)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
            {showAdvanced ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
            {showAdvanced ? 'Hide' : 'Show'} advanced fields
          </button>
          {showAdvanced && (
            <div className="space-y-3">
              <div><label className="label">Barcode</label>
                <input className="input" value={d.barcode} onChange={e=>set('barcode',e.target.value)} placeholder="Scan or type"/></div>
              <div><label className="label">Description</label>
                <textarea className="input h-16" value={d.description} onChange={e=>set('description',e.target.value)}/></div>
            </div>
          )}

          {/* Price History panel */}
          {priceHistory !== null && (
            <div className="border border-slate-100 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Purchase Price History</h3>
              {priceHistory.length === 0
                ? <p className="text-sm text-slate-400 text-center py-4">No purchase history yet.</p>
                : <table className="w-full text-sm"><thead><tr className="border-b border-slate-100"><th className="pb-2 text-left text-xs text-slate-500">Date</th><th className="pb-2 text-left text-xs text-slate-500">Cost</th><th className="pb-2 text-left text-xs text-slate-500">Mode</th><th className="pb-2 text-left text-xs text-slate-500">Qty</th><th className="pb-2 text-left text-xs text-slate-500">By</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {priceHistory.map((h:any)=>(
                      <tr key={h.id}><td className="py-2 text-slate-500 text-xs">{new Date(h.recorded_at).toLocaleDateString()}</td><td className="py-2 font-medium">{sym}{h.cost_price.toFixed(2)}</td><td className="py-2"><span className="badge bg-slate-100 text-slate-600 text-xs">{h.sell_unit}</span></td><td className="py-2 text-slate-500">{h.qty_bought||'—'}</td><td className="py-2 text-slate-500 text-xs">{h.recorder_name||'—'}</td></tr>
                    ))}
                  </tbody></table>}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : product ? 'Update Product' : 'Add Product'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
