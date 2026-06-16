// src/renderer/src/pages/POS/POSPage.tsx
import { useState, useEffect, useCallback } from 'react'
import { useCartStore }  from '../../store/cartStore'
import { useAuthStore }  from '../../store/authStore'
import { useAppStore }   from '../../store/appStore'
import { Product, Category, CartItem, SellMode } from '@shared/types'
import CheckoutBar       from './CheckoutBar'
import PaymentModal      from './PaymentModal'
import HoldOrderModal    from './HoldOrderModal'
import CustomerSearch    from './CustomerSearch'
import {
  ShoppingCart, X, Plus, Minus, Trash2, Tag,
  Pause, Zap, Package, Grid, TrendingUp,
} from 'lucide-react'

// ── Per-cashier session stats ────────────────────────────
// Shown as a thin strip at the top of the POS screen so
// managers / cashiers can see what they've collected today.
interface CashierStats {
  salesCount: number
  totalRevenue: number
  cashTotal: number
  cardTotal: number
  transferTotal: number
}

// ── Product card in the browse grid ─────────────────────
function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product, m: SellMode) => void }) {
  const { currencySymbol } = useCartStore()
  const sym = currencySymbol
  const out = product.stock_qty <= 0
  const low = !out && product.stock_qty <= product.reorder_level

  const p = product as any
  // pricing_mode: 'unit' (pcs only) | 'both' (pcs + bulk) | 'bulk' (bulk only).
  // Fall back to has_bulk_pricing for products saved before migration 008.
  const mode: 'unit' | 'both' | 'bulk' =
    p.pricing_mode ?? (p.has_bulk_pricing && p.bulk_unit ? 'both' : 'unit')
  const hasBulk = (mode === 'both' || mode === 'bulk') && !!p.bulk_unit
  const hasUnit = mode === 'unit' || mode === 'both'

  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-all flex flex-col ${out ? 'opacity-40 border-slate-100' : 'border-slate-100 hover:border-blue-300 hover:shadow-md'}`}>
      {/* Tap the whole tile to add the default unit:
          - unit-only / both → adds a piece
          - bulk-only        → adds a bulk unit
          The explicit buttons below let the cashier choose deliberately. */}
      <button
        onClick={() => !out && onAdd(product, hasUnit ? 'unit' : 'bulk')}
        disabled={out}
        className="p-3 pb-2 text-left w-full"
      >
        <div className="flex items-center justify-center h-12 mb-2 rounded-lg overflow-hidden bg-slate-50">
          {p.image_data
            ? <img src={p.image_data} className="w-full h-full object-cover" />
            : <Package className="w-7 h-7 text-slate-200" />}
        </div>
        <p className="text-xs font-semibold text-slate-800 line-clamp-2 min-h-[2rem]">{product.name}</p>
        <p className={`text-xs mt-0.5 ${out ? 'text-red-500' : low ? 'text-amber-500' : 'text-slate-400'}`}>
          {out ? 'Out of stock' : low ? `Low: ${product.stock_qty} left` : `${product.stock_qty} in stock`}
        </p>
      </button>

      {/* Explicit add buttons — only show two when the product sells both ways */}
      {!out && (
        <div className="mt-auto border-t border-slate-100 divide-y divide-slate-100">
          {hasUnit && (
            <button
              onClick={() => onAdd(product, 'unit')}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 transition text-left"
            >
              <span className="text-xs font-medium text-slate-600">Add {product.unit}</span>
              <span className="text-sm font-bold text-blue-600">{sym}{product.selling_price.toFixed(2)}</span>
            </button>
          )}
          {hasBulk && (
            <button
              onClick={() => onAdd(product, 'bulk')}
              className="w-full flex items-center justify-between px-3 py-2 bg-amber-50/60 hover:bg-amber-100 transition text-left"
            >
              <span className="text-xs font-medium text-amber-700 flex items-center gap-1">
                📦 Add {p.bulk_unit}
                <span className="text-amber-500">({p.units_per_bulk} {product.unit})</span>
              </span>
              <span className="text-sm font-bold text-amber-700">{sym}{p.bulk_selling_price?.toFixed(2)}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Cart row ─────────────────────────────────────────────
function CartRow({ item, flash }: { item: CartItem; flash?: boolean }) {
  const { updateQty, removeItem, setItemDiscount, currencySymbol } = useCartStore()
  const [showDisc,  setShowDisc]  = useState(false)
  const [discInput, setDiscInput] = useState('')
  const mode    = item.sell_mode as SellMode
  const atLimit = item.quantity >= item.stock_qty
  const sku     = (item as any).sku as string | undefined

  return (
    <div className={`group transition-colors ${flash ? 'bg-green-50' : 'hover:bg-slate-50'}`}>
      {/* Spreadsheet-style row: Item | Price | Qty | Total */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-px">

        {/* Item cell (name + sku + per-unit price) */}
        <div className="px-2 py-1.5 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{item.product_name}</p>
          <p className="text-[11px] text-slate-400 truncate">
            {sku ? <span className="font-mono">{sku}</span> : null}
            {sku ? ' · ' : ''}per {item.unit_label}
            {item.discount_pct > 0 && <span className="text-amber-500 ml-1">−{item.discount_pct}%</span>}
          </p>
        </div>

        {/* Price cell */}
        <div className="px-2 py-1.5 text-right w-20 text-sm text-slate-600 tabular-nums">
          {currencySymbol}{item.unit_price.toFixed(2)}
        </div>

        {/* Qty cell (− input +) */}
        <div className="px-1 py-1.5 w-24 flex items-center justify-center gap-0.5">
          <button onClick={() => updateQty(item.product_id, mode, item.quantity - 1)}
            className="w-5 h-5 rounded bg-slate-100 hover:bg-red-100 flex items-center justify-center flex-shrink-0">
            <Minus className="w-3 h-3" />
          </button>
          <input
            type="number" min={1} max={item.stock_qty} value={item.quantity}
            onChange={e => {
              const n = parseInt(e.target.value)
              if (!isNaN(n) && n > 0) updateQty(item.product_id, mode, Math.min(n, item.stock_qty))
            }}
            onFocus={e => e.currentTarget.select()}
            className="w-10 text-center text-sm font-bold border border-slate-200 rounded py-0.5 focus:border-blue-400 focus:outline-none tabular-nums"
          />
          <button onClick={() => updateQty(item.product_id, mode, item.quantity + 1)} disabled={atLimit}
            className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${atLimit ? 'bg-slate-50 text-slate-300 cursor-not-allowed' : 'bg-slate-100 hover:bg-green-100'}`}>
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Total cell */}
        <div className="px-2 py-1.5 text-right w-20 flex items-center justify-end gap-1">
          <span className="text-sm font-bold tabular-nums">{currencySymbol}{item.line_total.toFixed(2)}</span>
          <button onClick={() => removeItem(item.product_id, mode)}
            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Below-row notices: stock limit + discount editor */}
      {atLimit && (
        <p className="text-[11px] text-amber-600 px-2 pb-1">⚠️ Max stock ({item.stock_qty} {item.unit_label})</p>
      )}
      {showDisc ? (
        <div className="px-2 pb-1.5 flex items-center gap-2">
          <input type="number" value={discInput} onChange={e => setDiscInput(e.target.value)}
            placeholder="discount %" className="input text-xs py-1 w-24"
            onKeyDown={e => { if (e.key === 'Enter') { setItemDiscount(item.product_id, mode, parseFloat(discInput) || 0); setShowDisc(false) } }} />
          <button onClick={() => { setItemDiscount(item.product_id, mode, parseFloat(discInput) || 0); setShowDisc(false) }} className="text-xs text-blue-600">Apply</button>
          <button onClick={() => setShowDisc(false)} className="text-xs text-slate-400">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setShowDisc(true)} className="opacity-0 group-hover:opacity-100 px-2 pb-1 flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-500">
          <Tag className="w-3 h-3" /> discount
        </button>
      )}
    </div>
  )
}

// ── Main POS page ────────────────────────────────────────
export default function POSPage() {
  const { addToast, profile } = useAppStore()
  const { user }              = useAuthStore()
  const cart                  = useCartStore()
  const sym                   = profile?.currency_symbol ?? '₦'

  const [products,      setProducts]      = useState<Product[]>([])
  const [categories,    setCategories]    = useState<Category[]>([])
  const [activeCat,     setActiveCat]     = useState<number | null>(null)
  const [gridOpen,      setGridOpen]      = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [showPayment,   setShowPayment]   = useState(false)
  const [showHold,      setShowHold]      = useState(false)
  const [discInput,     setDiscInput]     = useState('')
  const [flashKey,      setFlashKey]      = useState<string | null>(null)
  const [cashierStats,  setCashierStats]  = useState<CashierStats | null>(null)

  const totals = cart.getTotals()

  // Sync VAT and currency from profile into cartStore
  useEffect(() => {
    if (profile) cart.initSettings(profile.tax_rate, profile.tax_inclusive, profile.tax_name, profile.currency_symbol)
  }, [profile])

  // Load products + categories on mount
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

  // ── Load cashier stats for today ─────────────────────
  // Shows how many sales the current user has made today and
  // the total amount collected — useful for shift management.
  const loadCashierStats = useCallback(async () => {
    if (!user) return
    const today = new Date().toISOString().slice(0, 10)
    const r = await window.api.sales.getAll({
      dateFrom:  `${today} 00:00:00`,
      dateTo:    `${today} 23:59:59`,
      cashierId: user.id,
      status:    'completed',
    })
    if (!r.success) return

    const sales = r.data as any[]
    const totalRevenue = sales.reduce((s: number, sale: any) => s + sale.total_amount, 0)

    // Accumulate payment method totals
    let cashTotal = 0, cardTotal = 0, transferTotal = 0
    for (const sale of sales) {
      // payments array may not be included in list view; estimate from totals
      // If the sale was a single-payment cash sale, total_amount = cash collected
      // This is an approximation; for accurate breakdown use reports.daily
      if (sale.payment_method === 'cash')     cashTotal     += sale.total_amount
      if (sale.payment_method === 'card')     cardTotal     += sale.total_amount
      if (sale.payment_method === 'transfer') transferTotal += sale.total_amount
    }

    setCashierStats({ salesCount: sales.length, totalRevenue, cashTotal, cardTotal, transferTotal })
  }, [user])

  useEffect(() => { loadCashierStats() }, [loadCashierStats])

  // ── Add product to cart ──────────────────────────────
  function handleAddProduct(product: Product, mode: SellMode) {
    const result = cart.addItem(product, mode)
    if (result === 'out_of_stock') {
      addToast('error', `${product.name} is out of stock`)
    } else if (result === 'at_limit') {
      addToast('error', `Only ${product.stock_qty} ${product.unit} available for ${product.name}`)
    } else {
      const key = cart.getItemKey(product.id, mode)
      setFlashKey(key)
      setTimeout(() => setFlashKey(null), 700)
    }
  }

  // ── Sale completed ───────────────────────────────────
  async function handleSaleComplete(saleId: number, receiptNo: string) {
    setShowPayment(false)
    cart.clearCart()
    addToast('success', `Sale ${receiptNo} complete!`)

    // ── Auto-print receipt ────────────────────────────────
    // Controlled by Settings → auto_print_receipt (default ON).
    // Print failures must never block the next sale — fire & forget
    // with a soft toast so the cashier can reprint from Sales page.
    try {
      const sRes = await window.api.settings.getAll()
      const autoPrint = !sRes.success || sRes.data?.auto_print_receipt !== 'false'
      if (autoPrint) {
        window.api.hardware.printSale(saleId).then((pr: any) => {
          if (!pr.success) addToast('error', `Receipt print failed: ${pr.error || 'check printer in Settings'}`)
        })
      }
    } catch { /* never block checkout on printing */ }

    // Refresh stock levels and cashier stats after each sale
    const r = await window.api.products.getAll()
    if (r.success) setProducts(r.data)
    loadCashierStats()
  }

  const filtered = products.filter(p =>
    (activeCat === null || p.category_id === activeCat) && p.is_active
  )

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">

      {/* ── Cashier session strip ────────────────────── */}
      {user && (
        <div className="bg-slate-800 text-white px-4 py-1.5 flex items-center gap-4 text-xs flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold">
              {user.full_name.charAt(0).toUpperCase()}
            </div>
            <span className="font-medium text-slate-200">{user.full_name}</span>
            <span className="text-slate-500 capitalize text-[10px]">({user.role})</span>
          </div>

          <div className="h-3 w-px bg-slate-600" />

          {cashierStats !== null ? (
            <div className="flex items-center gap-4 text-slate-300">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-green-400" />
                <span className="font-semibold text-green-400">{cashierStats.salesCount}</span> sale{cashierStats.salesCount !== 1 ? 's' : ''} today
              </span>
              <span>·</span>
              <span>
                Collected: <span className="font-bold text-white">{sym}{cashierStats.totalRevenue.toLocaleString('en', { minimumFractionDigits: 2 })}</span>
              </span>
            </div>
          ) : (
            <span className="text-slate-500 text-[10px]">Loading stats…</span>
          )}

          <div className="flex-1" />
          <span className="text-slate-500 text-[10px]">{new Date().toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        </div>
      )}

      {/* ── Checkout bar (scan + search) ─────────────── */}
      <CheckoutBar />

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: categories + product grid ─────────── */}
        <div className="flex flex-col" style={{ width: gridOpen ? '55%' : 'auto' }}>
          {/* Category tabs */}
          <div className="bg-white border-b border-r border-slate-200 px-3 py-2 flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setGridOpen(o => !o)}
              className={`flex-shrink-0 p-2 rounded-lg transition ${gridOpen ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              title="Toggle product browser"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveCat(null)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${activeCat === null ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >All</button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id === activeCat ? null : c.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${activeCat === c.id ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                style={activeCat === c.id ? { backgroundColor: c.color } : {}}
              >{c.name}</button>
            ))}
          </div>

          {/* Product grid */}
          {gridOpen && (
            <div className="flex-1 overflow-y-auto p-3 border-r border-slate-200">
              {loading
                ? <div className="flex items-center justify-center h-32 text-slate-400 gap-2"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />Loading...</div>
                : <div className="grid grid-cols-3 gap-2">
                    {filtered.map(p => <ProductCard key={p.id} product={p} onAdd={handleAddProduct} />)}
                  </div>
              }
            </div>
          )}
          {!gridOpen && (
            <div className="flex-1 border-r border-slate-200 flex items-center justify-center" style={{ width: 48 }}>
              <span className="text-xs text-slate-300" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Browse products</span>
            </div>
          )}
        </div>

        {/* ── Right: Cart / Receipt ────────────────────── */}
        <div className="flex flex-col bg-white flex-1">
          {/* Cart header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-slate-800">Receipt</span>
              {cart.items.length > 0 && (
                <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {cart.items.reduce((s, i) => s + i.quantity, 0)}
                </span>
              )}
              {cart.groupDiscount > 0 && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                  -{cart.groupDiscount}% group
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowHold(true)} className="p-1.5 text-slate-400 hover:text-amber-500 rounded-lg" title="Hold order">
                <Pause className="w-4 h-4" />
              </button>
              {cart.items.length > 0 && (
                <button onClick={() => cart.clearCart()} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg" title="Clear cart">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Customer search */}
          <div className="px-4 py-2 border-b border-slate-50">
            <CustomerSearch
              customerId={cart.customerId}
              customerName={cart.customerName}
              groupDiscount={cart.groupDiscount}
              groupName={undefined}
              onSelect={(id, name, disc) => cart.setCustomer(id, name, disc)}
            />
          </div>

          {/* Cart items — Excel-style grid */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {cart.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 py-12">
                <ShoppingCart className="w-12 h-12 mb-3" />
                <p className="text-sm font-medium">Cart empty</p>
                <p className="text-xs mt-1">Scan a barcode or search above</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {/* Header row (like a spreadsheet) */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-px bg-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  <div className="bg-slate-50 px-2 py-1.5">Item</div>
                  <div className="bg-slate-50 px-2 py-1.5 text-right w-20">Price</div>
                  <div className="bg-slate-50 px-2 py-1.5 text-center w-24">Qty</div>
                  <div className="bg-slate-50 px-2 py-1.5 text-right w-20">Total</div>
                </div>
                {/* Data rows */}
                <div className="divide-y divide-slate-100 bg-white">
                  {cart.items.map(item => (
                    <CartRow
                      key={cart.getItemKey(item.product_id, item.sell_mode as SellMode)}
                      item={item}
                      flash={flashKey === cart.getItemKey(item.product_id, item.sell_mode as SellMode)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Totals + checkout */}
          {cart.items.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Subtotal</span><span>{sym}{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 flex-1">Order Discount %</span>
                <input
                  type="number" value={discInput}
                  onChange={e => setDiscInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && cart.setOrderDiscount(parseFloat(discInput) || 0)}
                  placeholder="0"
                  className="w-14 text-right border border-slate-200 rounded px-2 py-0.5 text-sm"
                />
                <button onClick={() => cart.setOrderDiscount(parseFloat(discInput) || 0)} className="text-xs text-blue-600 font-medium">Apply</button>
              </div>
              {totals.orderDiscountAmt > 0 && (
                <div className="flex justify-between text-sm text-amber-600">
                  <span>Discount</span><span>-{sym}{totals.orderDiscountAmt.toFixed(2)}</span>
                </div>
              )}
              {totals.taxAmount > 0 && (
                <div className="flex justify-between text-sm text-slate-500">
                  <span>{cart.taxName}</span><span>{sym}{totals.taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>TOTAL</span>
                <span className="text-blue-600">{sym}{totals.total.toFixed(2)}</span>
              </div>
              <button
                onClick={() => setShowPayment(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-2 mt-1 transition"
              >
                <Zap className="w-5 h-5" /> Charge {sym}{totals.total.toFixed(2)}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────── */}
      {showPayment && (
        <PaymentModal
          totals={totals}
          onClose={() => setShowPayment(false)}
          onSuccess={handleSaleComplete}
        />
      )}

      {showHold && (
        <HoldOrderModal
          onClose={() => setShowHold(false)}
          onRetrieve={json => {
            try {
              const r = JSON.parse(json)
              cart.clearCart()
              r.items?.forEach((i: any) => {
                const p = {
                  ...i, id: i.product_id,
                  selling_price: i.unit_price,
                  stock_qty: i.stock_qty ?? 999,
                  reorder_level: 0, is_active: true,
                  cost_price: i.cost_price ?? 0,
                  has_bulk_pricing: false, bulk_unit: null,
                  units_per_bulk: 1, bulk_buying_price: 0,
                  bulk_selling_price: 0, image_data: null,
                } as Product
                cart.addItem(p, i.sell_mode || 'unit')
              })
            } catch { addToast('error', 'Failed to restore held order') }
            setShowHold(false)
          }}
        />
      )}
    </div>
  )
}
