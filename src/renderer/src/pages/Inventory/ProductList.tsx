// src/renderer/src/pages/Inventory/ProductList.tsx
import { useState, useEffect } from 'react'
import { Product, Category } from '@shared/types'
import { useAppStore } from '../../store/appStore'
import DataTable, { Column } from '../../components/DataTable/DataTable'
import ProductForm from './ProductForm'
import StockAdjustModal from './StockAdjustModal'
import StockReceiveModal from './StockReceiveModal'
import BulkImportModal from './BulkImportModal'
import { Plus, Edit2, Archive, BarChart2, Upload, Package } from 'lucide-react'

export default function ProductList() {
  const { addToast, profile } = useAppStore()
  const sym = profile?.currency_symbol ?? '₦'
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all'|'low'|'out'>('all')
  const [editProduct, setEditProduct] = useState<Product|null>(null)
  const [showForm, setShowForm] = useState(false)
  const [adjustProduct, setAdjustProduct] = useState<Product|null>(null)
  const [receiveProduct, setReceiveProduct] = useState<Product|null>(null)
  const [showBulk, setShowBulk] = useState(false)
  const { addToast: _t } = useAppStore()

  async function load() {
    setLoading(true)
    const [pRes, cRes] = await Promise.all([window.api.products.getAll(), window.api.categories.getAll()])
    if (pRes.success) setProducts(pRes.data)
    if (cRes.success) setCategories(cRes.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function handleArchive(id: number, name: string) {
    if (!confirm(`Archive "${name}"?`)) return
    const r = await window.api.products.archive(id)
    if (r.success) { addToast('success', `"${name}" archived`); load() }
    else addToast('error', r.error || 'Failed')
  }

  const displayed = products.filter(p => {
    if (filter==='low') return p.stock_qty<=p.reorder_level && p.stock_qty>0
    if (filter==='out') return p.stock_qty<=0
    return true
  })
  const lowCount = products.filter(p=>p.stock_qty<=p.reorder_level&&p.stock_qty>0).length
  const outCount = products.filter(p=>p.stock_qty<=0).length

  const columns: Column<Product>[] = [
    { key:'name', label:'Product', render:p=>(
      <div><p className="font-medium text-slate-800">{p.name}</p><p className="text-xs text-slate-400">{p.sku||p.barcode||'—'}</p></div>
    )},
    { key:'category_name', label:'Category', render:p=><span className="text-xs text-slate-500">{p.category_name||'—'}</span>},
    { key:'cost_price', label:'Cost', render:p=><span>{sym}{p.cost_price.toFixed(2)}</span>},
    { key:'selling_price', label:'Price', render:p=><span className="font-medium text-blue-600">{sym}{p.selling_price.toFixed(2)}</span>},
    { key:'stock_qty', label:'Stock', render:p=>(
      <span className={`badge ${p.stock_qty<=0?'bg-red-100 text-red-700':p.stock_qty<=p.reorder_level?'bg-amber-100 text-amber-700':'bg-green-100 text-green-700'}`}>
        {p.stock_qty} {p.unit}
      </span>
    )},
  ]

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-800">Inventory</h1><p className="text-sm text-slate-500">{products.length} products</p></div>
        <div className="flex gap-2">
          <button onClick={()=>setShowBulk(true)} className="btn-secondary flex items-center gap-2"><Upload className="w-4 h-4"/> Bulk Import</button>
          <button onClick={()=>{setEditProduct(null);setShowForm(true)}} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> Add Product</button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[{l:'Total',v:products.length,c:'text-slate-800'},{l:'Retail Value',v:`${sym}${products.reduce((s,p)=>s+p.selling_price*p.stock_qty,0).toLocaleString()}`,c:'text-blue-600'},{l:'Low Stock',v:lowCount,c:'text-amber-600'},{l:'Out of Stock',v:outCount,c:'text-red-600'}].map(s=>(
          <div key={s.l} className="card"><p className="text-xs text-slate-500">{s.l}</p><p className={`text-2xl font-bold mt-1 ${s.c}`}>{s.v}</p></div>
        ))}
      </div>
      <div className="flex gap-2">
        {(['all','low','out'] as const).map(f=>(
          <button key={f} onClick={()=>setFilter(f)} className={`px-4 py-1.5 rounded-full text-sm font-medium transition capitalize ${filter===f?'bg-blue-600 text-white':'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
            {f==='all'?'All':f==='low'?'Low Stock':'Out of Stock'}
          </button>
        ))}
      </div>
      <DataTable columns={columns} data={displayed} isLoading={loading} searchKeys={['name','sku','barcode','category_name']} searchPlaceholder="Search products..." emptyText="No products."
        actions={p=>(
          <div className="flex items-center gap-1 justify-end">
<button onClick={()=>setReceiveProduct(p)} className="p-1.5 text-slate-400 hover:text-green-600 rounded-lg" title="Receive stock"><Package className="w-4 h-4"/></button>
            <button onClick={()=>setAdjustProduct(p)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg" title="Adjust stock"><BarChart2 className="w-4 h-4"/></button>
            <button onClick={()=>{setEditProduct(p);setShowForm(true)}} className="p-1.5 text-slate-400 hover:text-green-600 rounded-lg"><Edit2 className="w-4 h-4"/></button>
            <button onClick={()=>handleArchive(p.id,p.name)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"><Archive className="w-4 h-4"/></button>
          </div>
        )}
      />
      {showForm && <ProductForm product={editProduct} categories={categories} onClose={()=>setShowForm(false)} onSaved={()=>{setShowForm(false);load()}}/>}
      {adjustProduct && <StockAdjustModal product={adjustProduct} onClose={()=>setAdjustProduct(null)} onSaved={()=>{setAdjustProduct(null);load()}}/>}
      {receiveProduct && <StockReceiveModal product={receiveProduct} onClose={()=>setReceiveProduct(null)} onSaved={()=>{setReceiveProduct(null);load()}}/> }
      {showBulk && <BulkImportModal onClose={()=>setShowBulk(false)} onSaved={()=>{setShowBulk(false);load()}}/>}
    </div>
  )
}
