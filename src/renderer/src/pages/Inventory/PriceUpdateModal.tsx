// src/renderer/src/pages/Inventory/PriceUpdateModal.tsx
// Change a product's selling price WITHOUT receiving stock — for market
// changes. Either applies immediately, or holds the new price until current
// stock sells down ("sell old stock first, then switch").
import { useState } from 'react'
import { Product } from '@shared/types'
import { useAppStore } from '../../store/appStore'
import { X, TrendingUp } from 'lucide-react'

export default function PriceUpdateModal({
  product, onClose, onSaved,
}: { product: Product; onClose: () => void; onSaved: () => void }) {
  const { addToast, profile } = useAppStore()
  const sym = profile?.currency_symbol ?? '₦'
  const p = product as any

  const pmode: 'unit' | 'both' | 'bulk' =
    p.pricing_mode ?? (p.has_bulk_pricing && p.bulk_unit ? 'both' : 'unit')
  const hasUnit = pmode === 'unit' || pmode === 'both'
  const hasBulk = pmode === 'both' || pmode === 'bulk'

  const [unitPrice, setUnitPrice] = useState<number>(product.selling_price || 0)
  const [bulkPrice, setBulkPrice] = useState<number>((p.bulk_selling_price as number) || 0)
  const [mode, setMode]           = useState<'now' | 'auto_switch'>('now')
  const [saving, setSaving]       = useState(false)

  async function save() {
    setSaving(true)
    const r = await window.api.products.updatePrice({
      product_id:             product.id,
      mode,
      new_selling_price:      hasUnit ? unitPrice : undefined,
      new_bulk_selling_price: hasBulk ? bulkPrice : undefined,
      after_qty:              0,   // auto_switch: switch when current stock runs out
      reason:                 mode === 'auto_switch' ? 'market_change_auto_switch' : 'market_change',
    })
    setSaving(false)
    if (r.success) {
      addToast('success',
        mode === 'now'
          ? 'Price updated'
          : `New price will apply when ${product.stock_qty} ${product.unit} sell out`)
      onSaved()
    } else {
      addToast('error', r.error || 'Failed to update price')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <h2 className="font-bold text-slate-800">Change Price</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-800">{product.name}</p>
            <p className="text-xs text-slate-400">{product.stock_qty} {product.unit} in stock · no new stock added</p>
          </div>

          {hasUnit && (
            <div>
              <label className="label">Unit Price ({sym}/{product.unit})</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                <input type="number" step="0.01" min="0" className="input pl-8"
                  value={unitPrice || ''} onChange={e => setUnitPrice(parseFloat(e.target.value) || 0)} />
              </div>
              <p className="text-xs text-slate-400 mt-1">Was {sym}{product.selling_price.toFixed(2)}</p>
            </div>
          )}

          {hasBulk && (
            <div>
              <label className="label">Bulk Price ({sym}/{p.bulk_unit})</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-sm">{sym}</span>
                <input type="number" step="0.01" min="0" className="input pl-8"
                  value={bulkPrice || ''} onChange={e => setBulkPrice(parseFloat(e.target.value) || 0)} />
              </div>
              <p className="text-xs text-slate-400 mt-1">Was {sym}{(p.bulk_selling_price || 0).toFixed(2)}</p>
            </div>
          )}

          {/* When to apply */}
          <div className="space-y-2">
            <label className="label">When should the new price apply?</label>
            <button onClick={() => setMode('now')}
              className={`w-full text-left p-3 rounded-xl border-2 transition ${mode === 'now' ? 'border-green-500 bg-green-50' : 'border-slate-200'}`}>
              <p className="text-sm font-semibold text-slate-800">Apply now</p>
              <p className="text-xs text-slate-500">New price takes effect immediately for all stock</p>
            </button>
            {product.stock_qty > 0 && (
              <button onClick={() => setMode('auto_switch')}
                className={`w-full text-left p-3 rounded-xl border-2 transition ${mode === 'auto_switch' ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}>
                <p className="text-sm font-semibold text-slate-800">Sell current stock first, then switch</p>
                <p className="text-xs text-slate-500">
                  Keep selling the {product.stock_qty} {product.unit} at the old price;
                  the new price activates automatically when they run out.
                </p>
              </button>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : 'Update Price'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
