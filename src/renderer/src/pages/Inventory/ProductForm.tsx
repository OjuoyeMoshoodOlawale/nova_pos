import { useState } from 'react'
import { Product, Category } from '@shared/types'
import { useAppStore } from '../../store/appStore'
import { X } from 'lucide-react'

interface Props { product:Product|null; categories:Category[]; onClose:()=>void; onSaved:()=>void }
export default function ProductForm({product, categories, onClose, onSaved}: Props) {
  const {addToast} = useAppStore()
  const [d, setD] = useState({
    name: product?.name||'', sku: product?.sku||'', barcode: product?.barcode||'',
    category_id: product?.category_id||null, unit: product?.unit||'pcs',
    cost_price: product?.cost_price??0, selling_price: product?.selling_price??0,
    stock_qty: product?.stock_qty??0, reorder_level: product?.reorder_level??5,
    description: product?.description||''
  })
  const [saving, setSaving] = useState(false)
  const set = (k:string,v:any) => setD(p=>({...p,[k]:v}))

  async function save() {
    if (!d.name.trim()) { addToast('error','Product name required'); return }
    setSaving(true)
    const r = product
      ? await window.api.products.update(product.id, d)
      : await window.api.products.create(d)
    setSaving(false)
    if (r.success) { addToast('success', product?'Product updated':'Product added'); onSaved() }
    else addToast('error', r.error||'Failed')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-bold">{product?'Edit Product':'Add Product'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="label">Product Name *</label><input className="input" value={d.name} onChange={e=>set('name',e.target.value)}/></div>
            <div><label className="label">SKU</label><input className="input" value={d.sku} onChange={e=>set('sku',e.target.value)} placeholder="Auto if empty"/></div>
            <div><label className="label">Barcode</label><input className="input" value={d.barcode} onChange={e=>set('barcode',e.target.value)} placeholder="Scan or enter"/></div>
            <div><label className="label">Category</label>
              <select className="input" value={d.category_id??''} onChange={e=>set('category_id',e.target.value?Number(e.target.value):null)}>
                <option value="">— None —</option>
                {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="label">Unit</label>
              <select className="input" value={d.unit} onChange={e=>set('unit',e.target.value)}>
                {['pcs','kg','g','litre','ml','pack','box','dozen','pair','roll'].map(u=><option key={u}>{u}</option>)}
              </select>
            </div>
            <div><label className="label">Cost Price</label><input className="input" type="number" step="0.01" value={d.cost_price} onChange={e=>set('cost_price',parseFloat(e.target.value)||0)}/></div>
            <div><label className="label">Selling Price</label><input className="input" type="number" step="0.01" value={d.selling_price} onChange={e=>set('selling_price',parseFloat(e.target.value)||0)}/></div>
            <div><label className="label">Stock Quantity</label><input className="input" type="number" step="0.01" value={d.stock_qty} onChange={e=>set('stock_qty',parseFloat(e.target.value)||0)}/></div>
            <div><label className="label">Reorder Level</label><input className="input" type="number" value={d.reorder_level} onChange={e=>set('reorder_level',parseFloat(e.target.value)||0)}/></div>
            <div className="col-span-2"><label className="label">Description</label><textarea className="input h-16" value={d.description} onChange={e=>set('description',e.target.value)}/></div>
          </div>
          {d.selling_price>0&&d.cost_price>0&&(
            <div className="bg-slate-50 rounded-lg p-3 text-sm flex justify-between">
              <span className="text-slate-600">Profit Margin:</span>
              <span className="font-medium text-green-600">{(((d.selling_price-d.cost_price)/d.selling_price)*100).toFixed(1)}%</span>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving?'Saving...':product?'Update':'Add Product'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
