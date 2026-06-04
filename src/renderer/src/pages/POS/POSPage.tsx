// src/renderer/src/pages/POS/POSPage.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useCartStore }  from '../../store/cartStore'
import { useAuthStore }  from '../../store/authStore'
import { useAppStore }   from '../../store/appStore'
import { Product, Category, CartItem } from '@shared/types'
import PaymentModal      from './PaymentModal'
import HoldOrderModal    from './HoldOrderModal'
import CustomerSearch    from './CustomerSearch'
import {
  Search, ShoppingCart, X, Plus, Minus, Trash2, Tag,
  Pause, Zap, Package,
} from 'lucide-react'

function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product) => void }) {
  const { currencySymbol } = useCartStore()
  const out = product.stock_qty <= 0
  const low = !out && product.stock_qty <= product.reorder_level
  return (
    <button onClick={() => !out && onAdd(product)} disabled={out}
      className={`w-full text-left bg-white rounded-xl border p-3 transition-all
        ${out ? 'opacity-40 cursor-not-allowed border-slate-100' : 'border-slate-100 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5'}`}>
      <div className="flex items-center justify-center h-10 mb-2">
        <Package className="w-8 h-8 text-slate-200" />
      </div>
      <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug min-h-[2rem]">{product.name}</p>
      <p className="text-sm font-bold text-blue-600 mt-1">{currencySymbol}{product.selling_price.toLocaleString('en',{minimumFractionDigits:2})}</p>
      <p className={`text-xs mt-0.5 ${out ? 'text-red-500' : low ? 'text-amber-500' : 'text-slate-400'}`}>
        {out ? 'Out of stock' : low ? `Low: ${product.stock_qty}` : `${product.stock_qty} in stock`}
      </p>
    </button>
  )
}

function CartRow({ item }: { item: CartItem & { cost_price: number } }) {
  const { updateQty, removeItem, setItemDiscount, currencySymbol } = useCartStore()
  const [discInput, setDiscInput] = useState('')
  const [showDisc, setShowDisc] = useState(false)
  return (
    <div className="group py-2.5 border-b border-slate-50 last:border-0">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{item.product_name}</p>
          <p className="text-xs text-slate-400">{currencySymbol}{item.unit_price.toFixed(2)}
            {item.discount_pct > 0 && <span className="text-amber-500 ml-1">(-{item.discount_pct}%)</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => updateQty(item.product_id, item.quantity - 1)} className="w-6 h-6 rounded-full bg-slate-100 hover:bg-red-100 flex items-center justify-center"><Minus className="w-3 h-3"/></button>
          <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
          <button onClick={() => updateQty(item.product_id, item.quantity + 1)} className="w-6 h-6 rounded-full bg-slate-100 hover:bg-green-100 flex items-center justify-center"><Plus className="w-3 h-3"/></button>
        </div>
        <span className="text-sm font-bold w-20 text-right">{currencySymbol}{item.line_total.toFixed(2)}</span>
        <button onClick={() => removeItem(item.product_id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"><X className="w-4 h-4"/></button>
      </div>
      {showDisc ? (
        <div className="mt-1.5 flex items-center gap-2">
          <input type="number" value={discInput} onChange={e => setDiscInput(e.target.value)} placeholder="%" className="input text-xs py-1 w-20"
            onKeyDown={e => { if(e.key==='Enter'){setItemDiscount(item.product_id, parseFloat(discInput)||0); setShowDisc(false)} }}/>
          <button onClick={()=>{setItemDiscount(item.product_id, parseFloat(discInput)||0); setShowDisc(false)}} className="text-xs text-blue-600">Apply</button>
          <button onClick={()=>setShowDisc(false)} className="text-xs text-slate-400">Cancel</button>
        </div>
      ) : (
        <button onClick={()=>setShowDisc(true)} className="opacity-0 group-hover:opacity-100 mt-0.5 flex items-center gap-1 text-xs text-slate-400 hover:text-amber-500">
          <Tag className="w-3 h-3"/> Discount
        </button>
      )}
    </div>
  )
}

export default function POSPage() {
  const { addToast, profile } = useAppStore()
  const cart = useCartStore()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCat, setActiveCat] = useState<number|null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showPayment, setShowPayment] = useState(false)
  const [showHold, setShowHold] = useState(false)
  const [discInput, setDiscInput] = useState('')
  const totals = cart.getTotals()

  useEffect(() => {
    if (profile) cart.initSettings(profile.tax_rate, profile.tax_inclusive, profile.tax_name, profile.currency_symbol)
  }, [profile])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [pRes, cRes] = await Promise.all([window.api.products.getAll(), window.api.categories.getAll()])
      if (pRes.success) setProducts(pRes.data)
      if (cRes.success) setCategories(cRes.data)
      setLoading(false)
    }
    load()
  }, [])

  const handleScan = useCallback(async (code: string) => {
    const r = await window.api.products.findBarcode(code)
    if (r.success && r.data) { cart.addItem(r.data); addToast('success', `Added: ${r.data.name}`) }
    else addToast('error', `Not found: ${code}`)
  }, [cart, addToast])

  useBarcodeScanner(handleScan)

  const filtered = products.filter(p => {
    const mc = activeCat === null || p.category_id === activeCat
    const ms = !search.trim() || p.name.toLowerCase().includes(search.toLowerCase())
    return mc && ms && p.is_active
  })

  async function handleSaleComplete(saleId: number, receiptNo: string) {
    setShowPayment(false); cart.clearCart()
    addToast('success', `Sale ${receiptNo} completed!`)
    const r = await window.api.products.getAll()
    if (r.success) setProducts(r.data)
  }

  return (
    <div className="flex h-full overflow-hidden">
<div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        <div className="p-3 bg-white border-b border-slate-200 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product or scan barcode..." className="input pl-9 w-full"/>
            {search && <button onClick={()=>setSearch('')} className="absolute right-3 top-2.5 text-slate-400"><X className="w-4 h-4"/></button>}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={()=>setActiveCat(null)} className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition ${activeCat===null?'bg-blue-600 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All</button>
            {categories.map(c=>(
              <button key={c.id} onClick={()=>setActiveCat(c.id===activeCat?null:c.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition ${activeCat===c.id?'text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                style={activeCat===c.id?{backgroundColor:c.color}:{}}>{c.name}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-400 gap-2">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/> Loading...
            </div>
          ) : filtered.length===0 ? (
            <div className="text-center py-12 text-slate-400"><Package className="w-12 h-12 mx-auto mb-3 opacity-30"/><p>No products found.</p></div>
          ) : (
            <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
              {filtered.map(p=><ProductCard key={p.id} product={p} onAdd={p=>cart.addItem(p)}/>)}
            </div>
          )}
        </div>
      </div>

      <div className="w-80 xl:w-96 flex flex-col bg-white border-l border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-blue-600"/>
            <span className="font-semibold">Cart</span>
            {cart.items.length>0 && <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{cart.items.reduce((s,i)=>s+i.quantity,0)}</span>}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={()=>setShowHold(true)} className="p-1.5 text-slate-400 hover:text-amber-500 rounded-lg transition" title="Hold order"><Pause className="w-4 h-4"/></button>
            {cart.items.length>0 && <button onClick={()=>cart.clearCart()} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition" title="Clear"><Trash2 className="w-4 h-4"/></button>}
          </div>
        </div>
        <div className="px-4 py-2 border-b border-slate-50">
          <CustomerSearch customerId={cart.customerId} customerName={cart.customerName} onSelect={(id,name)=>cart.setCustomer(id,name)}/>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {cart.items.length===0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-300">
              <ShoppingCart className="w-10 h-10 mb-2"/><p className="text-sm">Cart is empty</p>
              <p className="text-xs">Scan or click a product</p>
            </div>
          ) : cart.items.map(item=><CartRow key={item.product_id} item={item as any}/>)}
        </div>
        {cart.items.length>0 && (
          <div className="border-t border-slate-100 px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-500"><span>Subtotal</span><span>{cart.currencySymbol}{totals.subtotal.toFixed(2)}</span></div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 flex-1">Discount %</span>
              <input type="number" value={discInput} onChange={e=>setDiscInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&cart.setOrderDiscount(parseFloat(discInput)||0)} placeholder="0" className="w-14 text-right border border-slate-200 rounded px-2 py-0.5 text-sm"/>
              <button onClick={()=>cart.setOrderDiscount(parseFloat(discInput)||0)} className="text-xs text-blue-600 font-medium">Apply</button>
            </div>
            {totals.orderDiscountAmt>0 && <div className="flex justify-between text-sm text-amber-600"><span>Discount</span><span>-{cart.currencySymbol}{totals.orderDiscountAmt.toFixed(2)}</span></div>}
            <div className="flex justify-between text-sm text-slate-500"><span>{cart.taxName}</span><span>{cart.currencySymbol}{totals.taxAmount.toFixed(2)}</span></div>
            <div className="flex justify-between text-lg font-bold text-slate-900 pt-1 border-t border-slate-200">
              <span>Total</span><span className="text-blue-600">{cart.currencySymbol}{totals.total.toFixed(2)}</span>
            </div>
            <button onClick={()=>setShowPayment(true)} className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-4 rounded-xl transition text-lg flex items-center justify-center gap-2 mt-1">
              <Zap className="w-5 h-5"/> Charge {cart.currencySymbol}{totals.total.toFixed(2)}
            </button>
          </div>
        )}
      </div>

      {showPayment && <PaymentModal totals={totals} onClose={()=>setShowPayment(false)} onSuccess={handleSaleComplete}/>}
      {showHold && <HoldOrderModal onClose={()=>setShowHold(false)} onRetrieve={json=>{
        try{const r=JSON.parse(json); cart.clearCart(); r.items?.forEach((i:any)=>cart.addItem({...i,id:i.product_id,selling_price:i.unit_price,stock_qty:999,reorder_level:0,is_active:true,cost_price:i.cost_price??0} as Product))}catch{addToast('error','Failed to restore')}
        setShowHold(false)
      }}/>}
    </div>
  )
}
