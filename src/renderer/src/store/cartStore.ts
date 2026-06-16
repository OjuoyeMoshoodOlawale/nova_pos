// src/renderer/src/store/cartStore.ts
import { create } from 'zustand'
import { CartItem, Product, SellMode } from '@shared/types'

interface CartTotals {
  subtotal: number; orderDiscountAmt: number; taxAmount: number; total: number
}

interface CartState {
  items:              CartItem[]
  customerId:         number | null
  customerName:       string | null
  groupDiscount:      number           // % from customer price group
  orderDiscountPct:   number
  taxRate:            number
  taxInclusive:       boolean
  taxName:            string
  currencySymbol:     string

  initSettings:    (taxRate:number, taxInclusive:boolean, taxName:string, currency:string) => void
  addItem:         (product:Product, mode?:SellMode) => 'added'|'at_limit'|'out_of_stock'
  removeItem:      (productId:number, mode?:SellMode) => void
  updateQty:       (productId:number, mode:SellMode, qty:number) => void
  setItemDiscount: (productId:number, mode:SellMode, pct:number) => void
  setOrderDiscount:(pct:number) => void
  setCustomer:     (id:number|null, name:string|null, groupDiscount?:number) => void
  clearCart:       () => void
  getTotals:       () => CartTotals
  getItemKey:      (productId:number, mode:SellMode) => string
}

function itemKey(productId: number, mode: SellMode) {
  return `${productId}_${mode}`
}

function lineTotal(price: number, qty: number, discPct: number) {
  return +(price * qty * (1 - discPct / 100)).toFixed(2)
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [], customerId: null, customerName: null,
  groupDiscount: 0, orderDiscountPct: 0,
  taxRate: 7.5, taxInclusive: false, taxName: 'VAT', currencySymbol: '₦',

  getItemKey: itemKey,

  initSettings(taxRate, taxInclusive, taxName, currency) {
    set({ taxRate, taxInclusive, taxName, currencySymbol: currency })
  },

  addItem(product, mode = 'unit') {
    const p = product as any
    // A product is bulk-capable if pricing_mode allows it (migration 008),
    // or via the legacy has_bulk_pricing flag for products saved earlier.
    const bulkCapable = (p.pricing_mode === 'both' || p.pricing_mode === 'bulk' || p.has_bulk_pricing) && !!product.bulk_unit
    const isBulk    = mode === 'bulk' && bulkCapable
    const unitPrice = isBulk ? product.bulk_selling_price : product.selling_price
    const costPrice = isBulk ? product.bulk_buying_price  : product.cost_price
    const unitLabel = isBulk ? (product.bulk_unit || 'bulk') : product.unit
    const stockQty  = product.stock_qty ?? 0
    const key       = itemKey(product.id, mode)

    // ── Apply group discount ──────────────────────────
    const { groupDiscount } = get()
    const effectiveDisc = groupDiscount > 0 ? groupDiscount : 0
    const effectivePrice = +(unitPrice * (1 - effectiveDisc / 100)).toFixed(2)

    // ── Stock validation ──────────────────────────────
    if (stockQty <= 0) return 'out_of_stock'

    let result: 'added'|'at_limit' = 'added'

    set(s => {
      const existing = s.items.find(i => itemKey(i.product_id, i.sell_mode as SellMode) === key)
      const currentQty = existing?.quantity ?? 0

      if (currentQty >= stockQty) {
        result = 'at_limit'
        return s  // no change
      }

      if (existing) {
        const newQty = Math.min(currentQty + 1, stockQty)
        if (newQty === currentQty) { result = 'at_limit'; return s }
        return {
          items: s.items.map(i =>
            itemKey(i.product_id, i.sell_mode as SellMode) === key
              ? { ...i, quantity: newQty, line_total: lineTotal(i.unit_price, newQty, i.discount_pct) }
              : i
          )
        }
      }

      const newItem: CartItem = {
        product_id: product.id, product_name: product.name, barcode: product.barcode,
        unit_price: effectivePrice, quantity: 1, discount_pct: effectiveDisc,
        line_total: effectivePrice, cost_price: costPrice,
        sell_mode: mode, unit_label: unitLabel, stock_qty: stockQty,
      }
      return { items: [...s.items, newItem] }
    })

    return result
  },

  removeItem(productId, mode = 'unit') {
    const key = itemKey(productId, mode)
    set(s => ({ items: s.items.filter(i => itemKey(i.product_id, i.sell_mode as SellMode) !== key) }))
  },

  updateQty(productId, mode, qty) {
    const key = itemKey(productId, mode)
    set(s => {
      const item = s.items.find(i => itemKey(i.product_id, i.sell_mode as SellMode) === key)
      if (!item) return s
      if (qty <= 0) return { items: s.items.filter(i => itemKey(i.product_id, i.sell_mode as SellMode) !== key) }
      const safeQty = Math.min(qty, item.stock_qty)  // ← cap at available stock
      return {
        items: s.items.map(i =>
          itemKey(i.product_id, i.sell_mode as SellMode) === key
            ? { ...i, quantity: safeQty, line_total: lineTotal(i.unit_price, safeQty, i.discount_pct) }
            : i
        )
      }
    })
  },

  setItemDiscount(productId, mode, pct) {
    const key = itemKey(productId, mode)
    set(s => ({
      items: s.items.map(i =>
        itemKey(i.product_id, i.sell_mode as SellMode) === key
          ? { ...i, discount_pct: pct, line_total: lineTotal(i.unit_price, i.quantity, pct) }
          : i
      )
    }))
  },

  setOrderDiscount(pct) {
    set({ orderDiscountPct: Math.min(100, Math.max(0, pct)) })
  },

  setCustomer(id, name, groupDiscount = 0) {
    set(s => {
      const prevDisc = s.groupDiscount
      const newDisc  = groupDiscount

      // Re-price items if group discount changed
      let items = s.items
      if (prevDisc !== newDisc) {
        items = s.items.map(i => {
          // Reverse old group discount to get base price, apply new
          const basePrice = prevDisc > 0 ? +(i.unit_price / (1 - prevDisc / 100)).toFixed(2) : i.unit_price
          const newPrice  = newDisc > 0 ? +(basePrice * (1 - newDisc / 100)).toFixed(2) : basePrice
          return { ...i, unit_price: newPrice, discount_pct: newDisc, line_total: lineTotal(newPrice, i.quantity, 0) }
        })
      }

      return { customerId: id, customerName: name, groupDiscount: newDisc, items }
    })
  },

  clearCart() {
    set({ items: [], customerId: null, customerName: null, groupDiscount: 0, orderDiscountPct: 0 })
  },

  getTotals() {
    const { items, orderDiscountPct, taxRate, taxInclusive } = get()
    const subtotal          = +items.reduce((s, i) => s + i.line_total, 0).toFixed(2)
    const orderDiscountAmt  = +(subtotal * orderDiscountPct / 100).toFixed(2)
    const afterDiscount     = subtotal - orderDiscountAmt

    let taxAmount: number, total: number
    if (taxInclusive) {
      taxAmount = +(afterDiscount * taxRate / (100 + taxRate)).toFixed(2)
      total     = afterDiscount
    } else {
      taxAmount = +(afterDiscount * taxRate / 100).toFixed(2)
      total     = +(afterDiscount + taxAmount).toFixed(2)
    }
    return { subtotal, orderDiscountAmt, taxAmount, total }
  },
}))
