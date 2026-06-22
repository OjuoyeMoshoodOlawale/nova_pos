// tests/business.test.ts
// Comprehensive business-logic tests against the real service layer with a
// real in-memory SQLite DB. Covers unit + bulk sales, oversell rollback,
// voids, COGS, and report integrity (voided exclusion).
import { describe, it, expect, beforeEach } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { runMigrations } from '../src/main/database/migrate'
import { completeSale, voidSale, getSaleById } from '../src/main/services/saleService'
import { createProduct, receiveStock } from '../src/main/services/productService'
import { buildDailyReport, buildProfitLoss, buildInventoryReport } from '../src/main/services/reportService'
import { saveBusinessProfile, getBusinessProfile } from '../src/main/services/settingsService'
import type { DB } from '../src/main/database/connection'

const TODAY = new Date().toISOString().slice(0, 10) // UTC, matches datetime('now')

function freshDb(): DB {
  const db = new Database(':memory:') as unknown as DB
  db.exec('PRAGMA foreign_keys = ON')
  runMigrations(db)
  db.prepare(`INSERT INTO users (full_name, username, password_hash, role)
    VALUES ('Cashier','tester','x:y','cashier')`).run([])
  return db
}

// A unit product: cost 60, sell 100, 50 pcs in stock
function unitProduct(db: DB) {
  return createProduct(db, {
    name: 'Unit Item', unit: 'pcs',
    cost_price: 60, selling_price: 100, stock_qty: 50,
  } as any)
}

// A bulk-capable product: 1 carton = 10 pcs. Unit cost 5 (carton cost 50),
// unit sell 8, carton sell 75. Stock 100 pcs (= 10 cartons).
function bulkProduct(db: DB, upb = 10) {
  return createProduct(db, {
    name: 'Bulk Item', unit: 'pcs',
    cost_price: 5, selling_price: 8, stock_qty: 100,
    has_bulk_pricing: true, pricing_mode: 'both',
    bulk_unit: 'carton', units_per_bulk: upb,
    bulk_buying_price: 5 * upb, bulk_selling_price: 75,
  } as any)
}

function unitSale(productId: number, qty: number, price = 100) {
  return {
    customer_id: null, served_by: 1,
    discount_pct: 0, discount_amt: 0, tax_amount: 0,
    total_amount: price * qty,
    items: [{
      product_id: productId, product_name: 'Unit Item',
      unit_price: price, quantity: qty, discount_pct: 0,
      line_total: price * qty, sell_mode: 'unit',
    }],
    payments: [{ method: 'cash', amount: price * qty, reference: null }],
  } as any
}

function bulkSale(productId: number, cartons: number, upb: number, cartonPrice = 75) {
  return {
    customer_id: null, served_by: 1,
    discount_pct: 0, discount_amt: 0, tax_amount: 0,
    total_amount: cartonPrice * cartons,
    items: [{
      product_id: productId, product_name: 'Bulk Item',
      unit_price: cartonPrice, quantity: cartons, discount_pct: 0,
      line_total: cartonPrice * cartons, sell_mode: 'bulk',
      units_per_bulk: upb,
    }],
    payments: [{ method: 'cash', amount: cartonPrice * cartons, reference: null }],
  } as any
}

describe('Sales — unit', () => {
  let db: DB
  beforeEach(() => { db = freshDb() })

  it('deducts exactly the pieces sold', () => {
    const p = unitProduct(db)
    completeSale(db, unitSale(p.id, 4))
    const after = db.prepare('SELECT stock_qty FROM products WHERE id=?').get([p.id]) as any
    expect(after.stock_qty).toBe(46)
  })

  it('COGS snapshot = cost × qty', () => {
    const p = unitProduct(db)
    const r = completeSale(db, unitSale(p.id, 4))
    const s = db.prepare('SELECT total_cost_amount FROM sales WHERE id=?').get([r.saleId]) as any
    expect(s.total_cost_amount).toBe(240) // 60 × 4
  })
})

describe('Sales — bulk (carton → pieces)', () => {
  let db: DB
  beforeEach(() => { db = freshDb() })

  it('deducts qty × units_per_bulk pieces (not cartons)', () => {
    const p = bulkProduct(db, 10)
    completeSale(db, bulkSale(p.id, 2, 10)) // 2 cartons = 20 pcs
    const after = db.prepare('SELECT stock_qty FROM products WHERE id=?').get([p.id]) as any
    expect(after.stock_qty).toBe(80) // 100 - 20
  })

  it('COGS for bulk = cost × qty × units_per_bulk', () => {
    const p = bulkProduct(db, 10)
    const r = completeSale(db, bulkSale(p.id, 2, 10))
    const s = db.prepare('SELECT total_cost_amount FROM sales WHERE id=?').get([r.saleId]) as any
    expect(s.total_cost_amount).toBe(100) // cost 5 × 2 × 10
  })

  it('stock_adjustment records the piece change, not the carton count', () => {
    const p = bulkProduct(db, 10)
    completeSale(db, bulkSale(p.id, 3, 10))
    const adj = db.prepare("SELECT qty_change FROM stock_adjustments WHERE reason='sale' AND product_id=?").get([p.id]) as any
    expect(adj.qty_change).toBe(-30)
  })
})

describe('Oversell guard', () => {
  let db: DB
  beforeEach(() => { db = freshDb() })

  it('rejects a unit sale beyond stock and rolls back fully', () => {
    const p = unitProduct(db) // 50 in stock
    expect(() => completeSale(db, unitSale(p.id, 51))).toThrow()
    const after = db.prepare('SELECT stock_qty FROM products WHERE id=?').get([p.id]) as any
    const count = db.prepare('SELECT COUNT(*) c FROM sales').get([]) as any
    expect(after.stock_qty).toBe(50) // unchanged
    expect(count.c).toBe(0)          // no orphan sale row
  })

  it('rejects a bulk sale whose piece-equivalent exceeds stock', () => {
    const p = bulkProduct(db, 10) // 100 pcs = 10 cartons
    expect(() => completeSale(db, bulkSale(p.id, 11, 10))).toThrow() // 110 pcs
    const after = db.prepare('SELECT stock_qty FROM products WHERE id=?').get([p.id]) as any
    expect(after.stock_qty).toBe(100)
  })
})

describe('Void', () => {
  let db: DB
  beforeEach(() => { db = freshDb() })

  it('restores unit stock and marks the sale voided', () => {
    const p = unitProduct(db)
    const r = completeSale(db, unitSale(p.id, 5)) // 50 → 45
    voidSale(db, r.saleId, 'mistake', 1)
    const after = db.prepare('SELECT stock_qty FROM products WHERE id=?').get([p.id]) as any
    const sale = db.prepare('SELECT status FROM sales WHERE id=?').get([r.saleId]) as any
    expect(after.stock_qty).toBe(50)
    expect(sale.status).toBe('voided')
  })

  it('restores bulk stock in pieces (qty × units_per_bulk)', () => {
    const p = bulkProduct(db, 10)
    const r = completeSale(db, bulkSale(p.id, 2, 10)) // 100 → 80
    voidSale(db, r.saleId, 'mistake', 1)
    const after = db.prepare('SELECT stock_qty FROM products WHERE id=?').get([p.id]) as any
    expect(after.stock_qty).toBe(100)
  })

  it('void exactly reverses the sale even if pack size changed afterwards', () => {
    const p = bulkProduct(db, 10)
    const r = completeSale(db, bulkSale(p.id, 2, 10)) // deducts 20 → 80
    // Admin re-packs the product to 5 pcs/carton AFTER the sale
    db.prepare('UPDATE products SET units_per_bulk = 5 WHERE id=?').run([p.id])
    voidSale(db, r.saleId, 'return', 1)
    const after = db.prepare('SELECT stock_qty FROM products WHERE id=?').get([p.id]) as any
    // Must restore the 20 pieces actually deducted, NOT 2 × new-upb(5) = 10
    expect(after.stock_qty).toBe(100)
  })

  it('rejects double-void', () => {
    const p = unitProduct(db)
    const r = completeSale(db, unitSale(p.id, 1))
    voidSale(db, r.saleId, 'x', 1)
    expect(() => voidSale(db, r.saleId, 'again', 1)).toThrow()
  })

  it('rejects voiding a non-existent sale', () => {
    expect(() => voidSale(db, 9999, 'x', 1)).toThrow()
  })
})

describe('Reports — integrity', () => {
  let db: DB
  beforeEach(() => { db = freshDb() })

  it('daily revenue excludes voided sales', () => {
    const p = unitProduct(db)
    completeSale(db, unitSale(p.id, 2))          // 200, stays
    const v = completeSale(db, unitSale(p.id, 1)) // 100, will void
    voidSale(db, v.saleId, 'x', 1)
    const rep = buildDailyReport(db, TODAY)
    expect(rep.totalRevenue).toBe(200)
    expect(rep.transactionCount).toBe(1)
    expect(rep.voidCount).toBe(1)
  })

  it('daily COGS and gross profit are correct (unit)', () => {
    const p = unitProduct(db)
    completeSale(db, unitSale(p.id, 4)) // rev 400, cogs 240
    const rep = buildDailyReport(db, TODAY)
    expect(rep.totalCost).toBe(240)
    expect(rep.grossProfit).toBe(160)
  })

  it('daily COGS is correct for a bulk sale', () => {
    const p = bulkProduct(db, 10)
    completeSale(db, bulkSale(p.id, 2, 10)) // rev 150, cogs 5×20=100
    const rep = buildDailyReport(db, TODAY)
    expect(rep.totalRevenue).toBe(150)
    expect(rep.totalCost).toBe(100)
    expect(rep.grossProfit).toBe(50)
  })

  it('profit & loss excludes voided sales', () => {
    const p = unitProduct(db)
    completeSale(db, unitSale(p.id, 2))
    const v = completeSale(db, unitSale(p.id, 3))
    voidSale(db, v.saleId, 'x', 1)
    const pl = buildProfitLoss(db, `${TODAY} 00:00:00`, `${TODAY} 23:59:59`)
    expect(pl.revenue).toBe(200)
  })
})

describe('Receive stock & pricing', () => {
  let db: DB
  beforeEach(() => { db = freshDb() })

  it('adds received pieces and updates cost price', () => {
    const p = unitProduct(db) // 50 @ cost 60
    receiveStock(db, {
      product_id: p.id, buy_mode: 'unit', qty_received: 25, cost_per_unit: 70,
      total_cost: 1750, price_mode: 'keep', recorded_by: 1,
    } as any)
    const after = db.prepare('SELECT stock_qty, cost_price FROM products WHERE id=?').get([p.id]) as any
    expect(after.stock_qty).toBe(75)
    expect(after.cost_price).toBe(70)
  })

  it('auto_switch arms a pending price that fires when old stock sells down', () => {
    const p = unitProduct(db) // 50 old units @ sell 100
    receiveStock(db, {
      product_id: p.id, buy_mode: 'unit', qty_received: 10, cost_per_unit: 65,
      total_cost: 650, price_mode: 'auto_switch', new_selling_price: 130, recorded_by: 1,
    } as any)
    // pending should be set; threshold = newQty - oldStock = 60 - 50 = 10
    const armed = db.prepare('SELECT pending_sell_price, price_switch_at_qty FROM products WHERE id=?').get([p.id]) as any
    expect(armed.pending_sell_price).toBe(130)
    // Sell down to/below threshold (60 → 10) to trigger the switch
    completeSale(db, unitSale(p.id, 50))
    const done = db.prepare('SELECT selling_price, pending_sell_price FROM products WHERE id=?').get([p.id]) as any
    expect(done.selling_price).toBe(130)
    expect(done.pending_sell_price).toBeNull()
  })
})

describe('Multi-line sale (unit + bulk together)', () => {
  let db: DB
  beforeEach(() => { db = freshDb() })

  it('deducts each line correctly and sums COGS', () => {
    const u = unitProduct(db)        // 50 pcs, cost 60
    const b = bulkProduct(db, 10)    // 100 pcs, cost 5/pc
    const sale = {
      customer_id: null, served_by: 1,
      discount_pct: 0, discount_amt: 0, tax_amount: 0,
      total_amount: 100 * 2 + 75 * 1,
      items: [
        { product_id: u.id, product_name: 'Unit Item', unit_price: 100, quantity: 2,
          discount_pct: 0, line_total: 200, sell_mode: 'unit' },
        { product_id: b.id, product_name: 'Bulk Item', unit_price: 75, quantity: 1,
          discount_pct: 0, line_total: 75, sell_mode: 'bulk', units_per_bulk: 10 },
      ],
      payments: [{ method: 'cash', amount: 275, reference: null }],
    } as any
    const r = completeSale(db, sale)
    const uafter = db.prepare('SELECT stock_qty FROM products WHERE id=?').get([u.id]) as any
    const bafter = db.prepare('SELECT stock_qty FROM products WHERE id=?').get([b.id]) as any
    const s = db.prepare('SELECT total_cost_amount FROM sales WHERE id=?').get([r.saleId]) as any
    expect(uafter.stock_qty).toBe(48)        // 50 − 2
    expect(bafter.stock_qty).toBe(90)        // 100 − (1×10)
    expect(s.total_cost_amount).toBe(60 * 2 + 5 * 10) // 120 + 50 = 170
  })
})

describe('Business profile', () => {
  let db: DB
  beforeEach(() => { db = freshDb() })

  it('round-trips and returns real booleans (not 0/1)', () => {
    saveBusinessProfile(db, {
      name: 'Shop', type: 'retail', address: 'Lagos', phone: '080', email: 'a@b.c',
      logo_path: null, currency_code: 'NGN', currency_symbol: '₦',
      tax_name: 'VAT', tax_rate: 7.5, tax_inclusive: true,
      receipt_header: 'Hi', receipt_footer: 'Bye', show_logo: false,
    } as any)
    const p = getBusinessProfile(db)!
    expect(p.name).toBe('Shop')
    expect(p.tax_rate).toBe(7.5)
    expect(p.tax_inclusive).toBe(true)   // boolean, not 1
    expect(p.show_logo).toBe(false)      // boolean, not 0
  })
})

describe('Inventory report', () => {
  let db: DB
  beforeEach(() => { db = freshDb() })

  it('computes stock value and low/out-of-stock buckets', () => {
    createProduct(db, { name: 'A', cost_price: 10, selling_price: 15, stock_qty: 100, reorder_level: 5 } as any)
    createProduct(db, { name: 'B', cost_price: 20, selling_price: 30, stock_qty: 3,   reorder_level: 5 } as any) // low
    createProduct(db, { name: 'C', cost_price: 50, selling_price: 80, stock_qty: 0,   reorder_level: 5 } as any) // out
    const rep = buildInventoryReport(db)
    expect(rep.totalProducts).toBe(3)
    expect(rep.totalStockValue).toBe(10 * 100 + 20 * 3 + 0) // 1060
    expect(rep.lowStockItems.length).toBe(1)
    expect(rep.outOfStockItems.length).toBe(1)
  })
})
