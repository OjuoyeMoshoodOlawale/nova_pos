// src/renderer/src/store/cartStore.ts
import { create } from 'zustand'
import { CartItem, Product } from '@shared/types'

interface CartTotals {
  subtotal: number
  orderDiscountAmt: number
  taxAmount: number
  total: number
}

interface CartState {
  items: CartItem[]
  customerId: number | null
  customerName: string | null
  orderDiscountPct: number

  // Tax config – init from settings when POS loads
  taxRate: number
  taxInclusive: boolean
  taxName: string
  currencySymbol: string

  // Actions
  initSettings: (taxRate: number, taxInclusive: boolean, taxName: string, currency: string) => void
  addItem:         (product: Product) => void
  removeItem:      (productId: number) => void
  updateQty:       (productId: number, qty: number) => void
  setItemDiscount: (productId: number, pct: number) => void
  setOrderDiscount:(pct: number) => void
  setCustomer:     (id: number | null, name: string | null) => void
  clearCart:       () => void

  // Computed totals (call getTotals())
  getTotals: () => CartTotals
}

function computeLineTotal(unitPrice: number, qty: number, discountPct: number): number {
  return +(unitPrice * qty * (1 - discountPct / 100)).toFixed(2)
}

function calcTotals(
  items: CartItem[],
  orderDiscountPct: number,
  taxRate: number,
  taxInclusive: boolean
): CartTotals {
  const subtotal = +items.reduce((s, i) => s + i.line_total, 0).toFixed(2)
  const orderDiscountAmt = +(subtotal * orderDiscountPct / 100).toFixed(2)
  const afterDiscount = subtotal - orderDiscountAmt

  let taxAmount: number
  let total: number

  if (taxInclusive) {
    // Tax is already included in the price
    taxAmount = +(afterDiscount * taxRate / (100 + taxRate)).toFixed(2)
    total = afterDiscount
  } else {
    taxAmount = +(afterDiscount * taxRate / 100).toFixed(2)
    total = +(afterDiscount + taxAmount).toFixed(2)
  }

  return { subtotal, orderDiscountAmt, taxAmount, total }
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customerId: null,
  customerName: null,
  orderDiscountPct: 0,
  taxRate: 7.5,
  taxInclusive: false,
  taxName: 'VAT',
  currencySymbol: '₦',

  initSettings(taxRate, taxInclusive, taxName, currency) {
    set({ taxRate, taxInclusive, taxName, currencySymbol: currency })
  },

  addItem(product) {
    set((s) => {
      const existing = s.items.find((i) => i.product_id === product.id)
      if (existing) {
        // Increment quantity
        return {
          items: s.items.map((i) =>
            i.product_id === product.id
              ? {
                  ...i,
                  quantity: i.quantity + 1,
                  line_total: computeLineTotal(i.unit_price, i.quantity + 1, i.discount_pct),
                }
              : i
          ),
        }
      }
      const newItem: CartItem = {
        product_id: product.id,
        product_name: product.name,
        barcode: product.barcode,
        unit_price: product.selling_price,
        quantity: 1,
        discount_pct: 0,
        line_total: product.selling_price,
        cost_price: product.cost_price,
      }
      return { items: [...s.items, newItem] }
    })
  },

  removeItem(productId) {
    set((s) => ({ items: s.items.filter((i) => i.product_id !== productId) }))
  },

  updateQty(productId, qty) {
    if (qty <= 0) {
      get().removeItem(productId)
      return
    }
    set((s) => ({
      items: s.items.map((i) =>
        i.product_id === productId
          ? { ...i, quantity: qty, line_total: computeLineTotal(i.unit_price, qty, i.discount_pct) }
          : i
      ),
    }))
  },

  setItemDiscount(productId, pct) {
    set((s) => ({
      items: s.items.map((i) =>
        i.product_id === productId
          ? { ...i, discount_pct: pct, line_total: computeLineTotal(i.unit_price, i.quantity, pct) }
          : i
      ),
    }))
  },

  setOrderDiscount(pct) {
    set({ orderDiscountPct: Math.min(100, Math.max(0, pct)) })
  },

  setCustomer(id, name) {
    set({ customerId: id, customerName: name })
  },

  clearCart() {
    set({ items: [], customerId: null, customerName: null, orderDiscountPct: 0 })
  },

  getTotals() {
    const { items, orderDiscountPct, taxRate, taxInclusive } = get()
    return calcTotals(items, orderDiscountPct, taxRate, taxInclusive)
  },
}))
