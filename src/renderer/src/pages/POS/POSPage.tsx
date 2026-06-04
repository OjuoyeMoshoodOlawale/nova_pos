// src/renderer/src/pages/POS/POSPage.tsx
import { useState, useEffect, useCallback } from 'react'
import { useCartStore }   from '../../store/cartStore'
import { useAppStore }    from '../../store/appStore'
import { Product, Category, CartItem } from '@shared/types'
import CheckoutBar        from './CheckoutBar'
import PaymentModal       from './PaymentModal'
import HoldOrderModal     from './HoldOrderModal'
import CustomerSearch     from './CustomerSearch'
import { useBarcodeScanner } from './BarcodeScanner'
import {
  ShoppingCart, X, Plus, Minus, Trash2, Tag,
  Pause, Zap, Package, Grid,
} from 'lucide-react'

// ─── Product card (grid view) ─────────────────────────────
function ProductCard({ product, onAdd }: { product: Product; onAdd: (p:Product, m:'unit'|'bulk')=>void }) {
  const { currencySymbol } = useCartStore()
  const out = product.stock_qty <= 0
  const low = !out && product.stock_qty <= product.reorder_level
  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-all text-left
      ${out ? 'opacity-40 border-slate-100' : 'border-slate-100 hover:border-blue-300 hover:shadow-md'}`}>
      <button onClick={()=>!out&&onAdd(product,'unit')} disabled={out} className="w-full p-3 text-left">
        <div className="flex items-center justify-center h-12 mb-2 rounded-lg overflow-hidden bg-slate-50">
          {product.image_data
            ? <img src={product.image_data} className="w-full h-full object-cover"/>
            : <Package className="w-7 h-7 text-slate-200"/>}
        </div>
        <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug min-h-[2rem]">{product.name}</p>
        <p className="text-sm font-bold text-blue-600 mt-1">
          {currencySymbol}{product.selling_price.toFixed(2)}
          <span className="text-xs font-normal text-slate-400 ml-1">/{product.unit}</span>
        </p>
        <p className={`text-xs mt-0.5 ${out?'text-red-500':low?'text-amber-500':'text-slate-400'}`}>
          {out?'Out of stock':low?`Low: ${product.stock_qty}`:product.stock_qty+' in stock'}
        </p>
      </button>
      {product.has_bulk_pricing && product.bulk_unit && !out && (
        <button onClick={()=>onAdd(product,'bulk')}
          className="w-full bg-amber-50 hover:bg-amber-100 border-t border-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 transition text-left">
          📦 {currencySymbol}{product.bulk_selling_price?.toFixed(2)}/{product.bulk_unit}
        </button>
      )}
    </div>
  )
}

// ─── Cart row ─────────────────────────────────────────────
function CartRow({ item, flash }: { item: CartItem & {cost_price:number;sell_mode:string;unit_label:string}; flash?: boolean }) {
  const { updateQty, removeItem, setItemDiscount, currencySymbol } = useCartStore()
  const [showDisc, setShowDisc] = useState(false)
  const [discInput, setDiscInput] = useState('')
  return (
    <div className={`group py-2.5 border-b border-slate-50 last:border-0 transition-colors ${flash?'bg-green-50':''}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{item.product_name}</p>
          <p className="text-xs text-slate-400">
            {currencySymbol}{item.unit_price.toFixed(2)}/{item.unit_label||'pcs'}
            {item.discount_pct>0&&<span className="text-amber-500 ml-1">(-{item.discount_pct}%)</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={()=>updateQty(item.product_id,item.quantity-1)} className="w-6 h-6 rounded-full bg-slate-100 hover:bg-red-100 flex items-center justify-center"><Minus className="w-3 h-3"/></button>
          <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
          <button onClick={()=>updateQty(item.product_id,item.quantity+1)} className="w-6 h-6 rounded-full bg-slate-100 hover:bg-green-100 flex items-center justify-center"><Plus className="w-3 h-3"/></button>
        </div>
        <span className="text-sm font-bold w-20 text-right">{currencySymbol}{item.line_total.toFixed(2)}</span>
        <button onClick={()=>removeItem(item.product_id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"><X className="w-4 h-4"/></button>
      </div>
      {showDisc ? (
        <div className="mt-1.5 flex items-center gap-2">
          <input type="number" value={discInput} onChange={e=>setDiscInput(e.target.value)} placeholder="%" className="input text-xs py-1 w-20"
            onKeyDown={e=>{if(e.key==='Enter'){setItemDiscount(item.product_id,parseFloat(discInput)||0);setShowDisc(false)}}}/>
          <button onClick={()=>{setItemDiscount(item.product_id,parseFloat(discInput)||0);setShowDisc(false)}} className="text-xs text-blue-600">Apply</button>
          <button onClick={()=>setShowDisc(false)} className="text-xs text-slate-400">Cancel</button>
        </div>
      ) : (
        <button onClick={()=>setShowDisc(true)} className="opacity-0 group-hover:opacity-100 mt-0.5 flex items-center gap-1 text-xs text-slate-400 hover:text-amber-500">
          <Tag className="w-3 h-3"/> Item discount
        </button>
      )}
    </div>
  )
}

// ─── MAIN POS PAGE ─────────────────────────────────────────
export default function POSPage() {
  const { addToast, profile } = useAppStore()
  const cart = useCartStore()

  const [products,   setProducts]   = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCat,  setActiveCat]  = useState<number|null>(null)
  const [gridOpen,   setGridOpen]   = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [showPayment,setShowPayment]= useState(false)
  const [showHold,   setShowHold]   = useState(false)
  const [discInput,  setDiscInput]  = useState('')
  const [flashId,    setFlashId]    = useState<number|null>(null)

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

  // Hardware barcode scanner (USB keyboard wedge)
  const handleScan = useCallback(async (code: string) => {
    const r = await window.api.products.findBarcode(code)
    if (r.success && r.data) {
      cart.addItem(r.data, 'unit')
      setFlashId(r.data.id)
      setTimeout(() => setFlashId(null), 800)
    } else {
      addToast('error', `Barcode not found: ${code}`)
    }
  }, [cart, addToast])
  useBarcodeScanner(handleScan)

  function handleAddProduct(product: Product, mode: 'unit'|'bulk') {
    cart.addItem(product, mode)
    setFlashId(product.id)
    setTimeout(() => setFlashId(null), 800)
  }

  const filtered = products.filter(p => {
    const mc = activeCat === null || p.category_id === activeCat
    return mc && p.is_active
  })

  async function handleSaleComplete(saleId: number, receiptNo: string) {
    setShowPayment(false); cart.clearCart()
    addToast('success', `Sale ${receiptNo} complete!`)
    const r = await window.api.products.getAll()
    if (r.success) setProducts(r.data)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">

      {/* ── TOP: Checkout/Scan bar ─────────────────────── */}
      <CheckoutBar onProductAdded={name => {
        // Optional: flash last added in cart
      }}/>

      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Category nav + optional product grid ─ */}
        <div className="flex flex-col" style={{width: gridOpen ? '55%' : 'auto'}}>

          {/* Category pills always visible */}
          <div className="bg-white border-b border-r border-slate-200 px-3 py-2 flex items-center gap-2 overflow-x-auto">
            <button onClick={()=>setGridOpen(o=>!o)}
              title={gridOpen?'Hide grid':'Show product grid'}
              className={`flex-shrink-0 p-2 rounded-lg transition ${gridOpen?'bg-blue-600 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              <Grid className="w-4 h-4"/>
            </button>
            <button onClick={()=>setActiveCat(null)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${activeCat===null?'bg-blue-600 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              All
            </button>
            {categories.map(c=>(
              <button key={c.id} onClick={()=>setActiveCat(c.id===activeCat?null:c.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${activeCat===c.id?'text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                style={activeCat===c.id?{backgroundColor:c.color}:{}}>
                {c.name}
              </button>
            ))}
          </div>

          {/* Product grid (toggle) */}
          {gridOpen && (
            <div className="flex-1 overflow-y-auto p-3 border-r border-slate-200">
              {loading ? (
                <div className="flex items-center justify-center h-32 text-slate-400 gap-2">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                  Loading...
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {filtered.map(p=><ProductCard key={p.id} product={p} onAdd={handleAddProduct}/>)}
                </div>
              )}
            </div>
          )}

          {/* Collapsed state hint */}
          {!gridOpen && (
            <div className="flex-1 flex items-center justify-center p-4 text-center text-slate-300 border-r border-slate-200" style={{width:48}}>
              <div className="writing-vertical">
                <span className="text-xs transform -rotate-90 block text-slate-400 whitespace-nowrap" style={{writingMode:'vertical-rl',transform:'rotate(180deg)'}}>
                  Click 📦 to browse products
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Cart ────────────────────────────────── */}
        <div className="flex flex-col bg-white border-l border-slate-200" style={{flex:1}}>

          {/* Cart header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-blue-600"/>
              <span className="font-semibold text-slate-800">Receipt</span>
              {cart.items.length > 0 && (
                <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {cart.items.reduce((s,i)=>s+i.quantity,0)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={()=>setShowHold(true)} title="Hold order"
                className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition">
                <Pause className="w-4 h-4"/>
              </button>
              {cart.items.length>0 && (
                <button onClick={()=>cart.clearCart()} title="Clear"
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                  <Trash2 className="w-4 h-4"/>
                </button>
              )}
            </div>
          </div>

          {/* Customer */}
          <div className="px-4 py-2 border-b border-slate-50">
            <CustomerSearch customerId={cart.customerId} customerName={cart.customerName}
              onSelect={(id,name)=>cart.setCustomer(id,name)}/>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {cart.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 py-12">
                <ShoppingCart className="w-12 h-12 mb-3"/>
                <p className="text-sm font-medium">Cart empty</p>
                <p className="text-xs mt-1">Scan a barcode or search above</p>
              </div>
            ) : (
              cart.items.map(item => (
                <CartRow key={`${item.product_id}_${(item as any).sell_mode}`}
                  item={item as any}
                  flash={flashId === item.product_id}
                />
              ))
            )}
          </div>

          {/* Totals + Charge */}
          {cart.items.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Subtotal</span>
                <span>{cart.currencySymbol}{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 flex-1">Discount %</span>
                <input type="number" value={discInput} onChange={e=>setDiscInput(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&cart.setOrderDiscount(parseFloat(discInput)||0)}
                  placeholder="0" className="w-14 text-right border border-slate-200 rounded px-2 py-0.5 text-sm"/>
                <button onClick={()=>cart.setOrderDiscount(parseFloat(discInput)||0)} className="text-xs text-blue-600 font-medium">Apply</button>
              </div>
              {totals.orderDiscountAmt>0 && (
                <div className="flex justify-between text-sm text-amber-600">
                  <span>Discount</span><span>-{cart.currencySymbol}{totals.orderDiscountAmt.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-slate-500">
                <span>{cart.taxName}</span>
                <span>{cart.currencySymbol}{totals.taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>TOTAL</span>
                <span className="text-blue-600">{cart.currencySymbol}{totals.total.toFixed(2)}</span>
              </div>
              <button onClick={()=>setShowPayment(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-4 rounded-xl transition text-lg flex items-center justify-center gap-2 mt-1">
                <Zap className="w-5 h-5"/>
                Charge {cart.currencySymbol}{totals.total.toFixed(2)}
              </button>
            </div>
          )}
        </div>
      </div>

      {showPayment && <PaymentModal totals={totals} onClose={()=>setShowPayment(false)} onSuccess={handleSaleComplete}/>}
      {showHold && <HoldOrderModal onClose={()=>setShowHold(false)} onRetrieve={json=>{
        try {
          const r=JSON.parse(json); cart.clearCart()
          r.items?.forEach((i:any)=>cart.addItem({...i,id:i.product_id,selling_price:i.unit_price,stock_qty:999,reorder_level:0,is_active:true,cost_price:i.cost_price??0,has_bulk_pricing:false,bulk_unit:null,units_per_bulk:1,bulk_buying_price:0,bulk_selling_price:0,image_data:null} as Product, i.sell_mode||'unit'))
        } catch { addToast('error','Failed to restore') }
        setShowHold(false)
      }}/>}
    </div>
  )
}
