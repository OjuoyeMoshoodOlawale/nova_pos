// tests/cart.test.ts
// Tests the POS cart store logic headlessly via zustand getState().
import { describe, it, expect, beforeEach } from 'vitest'
import { useCartStore } from '../src/renderer/src/store/cartStore'

const cart = () => useCartStore.getState()

function unitProd(over: Record<string, unknown> = {}) {
  return { id: 1, name: 'U', unit: 'pcs', selling_price: 100, cost_price: 60,
    stock_qty: 50, pricing_mode: 'unit', ...over } as any
}
function bulkProd(over: Record<string, unknown> = {}) {
  return { id: 2, name: 'B', unit: 'pcs', selling_price: 8, cost_price: 5,
    bulk_selling_price: 75, bulk_buying_price: 50, bulk_unit: 'carton',
    units_per_bulk: 10, stock_qty: 100, pricing_mode: 'both', has_bulk_pricing: true, ...over } as any
}

describe('cart — bulk stock cap', () => {
  beforeEach(() => { cart().clearCart(); useCartStore.setState({ taxRate: 7.5, taxInclusive: false }) })

  it('caps bulk quantity at floor(stock / units_per_bulk) cartons', () => {
    const p = bulkProd({ stock_qty: 100, units_per_bulk: 10 }) // 10 cartons max
    let last = ''
    for (let i = 0; i < 12; i++) last = cart().addItem(p, 'bulk')
    const item = cart().items.find(i => i.sell_mode === 'bulk')!
    expect(item.quantity).toBe(10)   // never exceeds 10 cartons
    expect(last).toBe('at_limit')
  })

  it('unit mode caps at full piece stock', () => {
    const p = unitProd({ stock_qty: 3 })
    let last = ''
    for (let i = 0; i < 5; i++) last = cart().addItem(p, 'unit')
    expect(cart().items[0].quantity).toBe(3)
    expect(last).toBe('at_limit')
  })

  it('returns out_of_stock when nothing sellable', () => {
    expect(cart().addItem(unitProd({ stock_qty: 0 }), 'unit')).toBe('out_of_stock')
  })

  it('bulk line uses the bulk selling price', () => {
    cart().addItem(bulkProd(), 'bulk')
    const item = cart().items.find(i => i.sell_mode === 'bulk')!
    expect(item.unit_price).toBe(75)
    expect(item.line_total).toBe(75)
  })
})

describe('cart — totals & tax', () => {
  beforeEach(() => { cart().clearCart() })

  it('exclusive VAT adds tax on top', () => {
    useCartStore.setState({ taxRate: 7.5, taxInclusive: false })
    cart().addItem(unitProd({ selling_price: 1000, stock_qty: 10 }), 'unit')
    const t = cart().getTotals()
    expect(t.subtotal).toBe(1000)
    expect(t.taxAmount).toBe(75)     // 1000 × 7.5%
    expect(t.total).toBe(1075)
  })

  it('inclusive VAT extracts tax from the price', () => {
    useCartStore.setState({ taxRate: 7.5, taxInclusive: true })
    cart().addItem(unitProd({ selling_price: 1075, stock_qty: 10 }), 'unit')
    const t = cart().getTotals()
    expect(t.subtotal).toBe(1075)
    expect(t.taxAmount).toBe(75)     // 1075 × 7.5 / 107.5
    expect(t.total).toBe(1075)       // total unchanged (tax baked in)
  })
})

describe('cart — customer group discount', () => {
  beforeEach(() => { cart().clearCart(); useCartStore.setState({ taxRate: 0, taxInclusive: false }) })

  it('applies the group discount to the unit price', () => {
    cart().setCustomer(5, 'Wholesaler', 10) // 10% off
    cart().addItem(unitProd({ selling_price: 100, stock_qty: 10 }), 'unit')
    const item = cart().items[0]
    expect(item.unit_price).toBe(90) // 100 − 10%
  })
})
