// src/main/services/reportService.ts
import type { DB } from '../database/connection'
import { format, endOfMonth, startOfYear, endOfYear, eachDayOfInterval } from 'date-fns'
import { DailyReportData, WeeklyReportData, MonthlyReportData, InventoryReportData, ProfitLossData } from '@shared/types'
import { getBusinessProfile } from './settingsService'

function getProfile(db: DB) {
  const p = getBusinessProfile(db)
  return { businessName: p?.name ?? 'My Business', currency: p?.currency_symbol ?? '₦' }
}

type PayRow   = { method: string; total: number; count: number }
type ProdRow  = { name: string; qty: number; revenue: number; cost: number }
type CashierRow = { name: string; sales: number; revenue: number }
type HourRow  = { hour: number; revenue: number; count: number }

// ─── Daily report ─────────────────────────────────────────
export function buildDailyReport(db: DB, date: string): DailyReportData {
  const { businessName, currency } = getProfile(db)
  const s = `${date} 00:00:00`
  const e = `${date} 23:59:59`

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status='completed' THEN total_amount ELSE 0 END),0) AS totalRevenue,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS transactionCount,
      COALESCE(SUM(CASE WHEN status='completed' THEN discount_amt ELSE 0 END),0) AS discountGiven,
      COALESCE(SUM(CASE WHEN status='completed' THEN tax_amount ELSE 0 END),0) AS taxCollected,
      SUM(CASE WHEN status='voided' THEN 1 ELSE 0 END) AS voidCount
    FROM sales WHERE sale_date BETWEEN ? AND ? AND status != 'held'
  `).get([s, e]) as { totalRevenue:number; transactionCount:number; discountGiven:number; taxCollected:number; voidCount:number }

  // COGS: prefer the per-sale snapshot (sales.total_cost_amount, migration 007)
  // which is already correct for bulk. Fall back to recomputing from
  // sale_items ONLY for pre-007 rows, multiplying bulk lines by units_per_bulk
  // so cartons are costed in pieces.
  const cogs = db.prepare(`
    SELECT COALESCE(SUM(
      CASE WHEN s.total_cost_amount > 0 THEN s.total_cost_amount
           ELSE (
             SELECT COALESCE(SUM(
               si.quantity *
               CASE WHEN si.sell_mode = 'bulk' THEN COALESCE(p.units_per_bulk, 1) ELSE 1 END *
               si.cost_price
             ), 0)
             FROM sale_items si
             LEFT JOIN products p ON si.product_id = p.id
             WHERE si.sale_id = s.id
           )
      END
    ), 0) AS totalCost
    FROM sales s
    WHERE s.sale_date BETWEEN ? AND ? AND s.status = 'completed'
  `).get([s, e]) as { totalCost: number }

  const payBreakdown = db.prepare(`
    SELECT p.method, SUM(p.amount) AS total, COUNT(*) AS count
    FROM payments p JOIN sales s ON p.sale_id = s.id
    WHERE s.sale_date BETWEEN ? AND ? AND s.status = 'completed'
    GROUP BY p.method
  `).all([s, e]) as PayRow[]

  const topProducts = db.prepare(`
    SELECT si.product_name AS name, SUM(si.quantity) AS qty, SUM(si.line_total) AS revenue
    FROM sale_items si JOIN sales s ON si.sale_id = s.id
    WHERE s.sale_date BETWEEN ? AND ? AND s.status = 'completed'
    GROUP BY si.product_id ORDER BY revenue DESC LIMIT 10
  `).all([s, e]) as ProdRow[]

  const cashierPerf = db.prepare(`
    SELECT u.full_name AS name, COUNT(s.id) AS sales, COALESCE(SUM(s.total_amount),0) AS revenue
    FROM sales s JOIN users u ON s.served_by = u.id
    WHERE s.sale_date BETWEEN ? AND ? AND s.status = 'completed'
    GROUP BY s.served_by ORDER BY revenue DESC
  `).all([s, e]) as CashierRow[]

  const hourlySales = db.prepare(`
    SELECT CAST(strftime('%H', sale_date) AS INTEGER) AS hour,
           SUM(total_amount) AS revenue, COUNT(*) AS count
    FROM sales WHERE sale_date BETWEEN ? AND ? AND status = 'completed'
    GROUP BY hour ORDER BY hour
  `).all([s, e]) as HourRow[]

  const grossProfit = totals.totalRevenue - cogs.totalCost

  return {
    date, businessName, currency,
    totalRevenue: totals.totalRevenue, totalSales: totals.totalRevenue,
    totalCost: cogs.totalCost, grossProfit,
    profitMarginPct: totals.totalRevenue > 0 ? (grossProfit / totals.totalRevenue) * 100 : 0,
    transactionCount: totals.transactionCount, voidCount: totals.voidCount,
    discountGiven: totals.discountGiven, taxCollected: totals.taxCollected,
    paymentBreakdown: payBreakdown, topProducts, cashierPerformance: cashierPerf, hourlySales,
  }
}

// ─── Monthly report ───────────────────────────────────────
export function buildMonthlyReport(db: DB, year: number, month: number): MonthlyReportData {
  const { businessName } = getProfile(db)
  const monthStart = format(new Date(year, month-1, 1), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(new Date(year, month-1)), 'yyyy-MM-dd')
  const s = `${monthStart} 00:00:00`, e = `${monthEnd} 23:59:59`

  const totals = db.prepare(`
    SELECT COALESCE(SUM(total_amount),0) AS totalRevenue, COUNT(*) AS totalTransactions
    FROM sales WHERE sale_date BETWEEN ? AND ? AND status = 'completed'
  `).get([s, e]) as { totalRevenue: number; totalTransactions: number }

  // COGS: prefer the per-sale snapshot (sales.total_cost_amount, migration 007)
  // which is already correct for bulk. Fall back to recomputing from
  // sale_items ONLY for pre-007 rows, multiplying bulk lines by units_per_bulk
  // so cartons are costed in pieces.
  const cogs = db.prepare(`
    SELECT COALESCE(SUM(
      CASE WHEN s.total_cost_amount > 0 THEN s.total_cost_amount
           ELSE (
             SELECT COALESCE(SUM(
               si.quantity *
               CASE WHEN si.sell_mode = 'bulk' THEN COALESCE(p.units_per_bulk, 1) ELSE 1 END *
               si.cost_price
             ), 0)
             FROM sale_items si
             LEFT JOIN products p ON si.product_id = p.id
             WHERE si.sale_id = s.id
           )
      END
    ), 0) AS totalCost
    FROM sales s
    WHERE s.sale_date BETWEEN ? AND ? AND s.status = 'completed'
  `).get([s, e]) as { totalCost: number }

  const days = eachDayOfInterval({ start: new Date(year, month-1, 1), end: endOfMonth(new Date(year, month-1)) })
  const dailyRows = db.prepare(`
    SELECT strftime('%Y-%m-%d', sale_date) AS date, SUM(total_amount) AS revenue, COUNT(*) AS count
    FROM sales WHERE sale_date BETWEEN ? AND ? AND status = 'completed'
    GROUP BY strftime('%Y-%m-%d', sale_date)
  `).all([s, e]) as { date:string; revenue:number; count:number }[]

  const dailyMap = new Map(dailyRows.map((r) => [r.date, r]))
  const dailyBreakdown = days.map((d) => {
    const key = format(d, 'yyyy-MM-dd')
    return { date: key, revenue: dailyMap.get(key)?.revenue ?? 0, count: dailyMap.get(key)?.count ?? 0 }
  })

  const weeklyRows = db.prepare(`
    SELECT strftime('%W', sale_date) AS week, SUM(total_amount) AS revenue, COUNT(*) AS count
    FROM sales WHERE sale_date BETWEEN ? AND ? AND status = 'completed'
    GROUP BY week ORDER BY week
  `).all([s, e]) as { week:string; revenue:number; count:number }[]

  const topProducts = db.prepare(`
    SELECT si.product_name AS name, SUM(si.quantity) AS qty, SUM(si.line_total) AS revenue
    FROM sale_items si JOIN sales s ON si.sale_id = s.id
    WHERE s.sale_date BETWEEN ? AND ? AND s.status = 'completed'
    GROUP BY si.product_id ORDER BY revenue DESC LIMIT 10
  `).all([s, e]) as ProdRow[]

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return {
    weekStart: monthStart, weekEnd: monthEnd,
    totalRevenue: totals.totalRevenue, totalTransactions: totals.totalTransactions,
    dailyBreakdown, topProducts,
    grossProfit: totals.totalRevenue - cogs.totalCost,
    month: `${MONTH_NAMES[month-1]} ${year}`, year,
    weeklyBreakdown: weeklyRows.map((r) => ({ week: `Week ${r.week}`, revenue: r.revenue, count: r.count })),
  }
}

// ─── Yearly report ────────────────────────────────────────
export function buildYearlyReport(db: DB, year: number) {
  const { businessName, currency } = getProfile(db)
  const s = `${year}-01-01 00:00:00`, e = `${year}-12-31 23:59:59`

  const totals = db.prepare(`
    SELECT COALESCE(SUM(total_amount),0) AS totalRevenue,
           COUNT(*) AS totalTransactions,
           COALESCE(SUM(discount_amt),0) AS totalDiscounts,
           COALESCE(SUM(tax_amount),0) AS totalTax
    FROM sales WHERE sale_date BETWEEN ? AND ? AND status = 'completed'
  `).get([s, e]) as { totalRevenue:number; totalTransactions:number; totalDiscounts:number; totalTax:number }

  // COGS: prefer the per-sale snapshot (sales.total_cost_amount, migration 007)
  // which is already correct for bulk. Fall back to recomputing from
  // sale_items ONLY for pre-007 rows, multiplying bulk lines by units_per_bulk
  // so cartons are costed in pieces.
  const cogs = db.prepare(`
    SELECT COALESCE(SUM(
      CASE WHEN s.total_cost_amount > 0 THEN s.total_cost_amount
           ELSE (
             SELECT COALESCE(SUM(
               si.quantity *
               CASE WHEN si.sell_mode = 'bulk' THEN COALESCE(p.units_per_bulk, 1) ELSE 1 END *
               si.cost_price
             ), 0)
             FROM sale_items si
             LEFT JOIN products p ON si.product_id = p.id
             WHERE si.sale_id = s.id
           )
      END
    ), 0) AS totalCost
    FROM sales s
    WHERE s.sale_date BETWEEN ? AND ? AND s.status = 'completed'
  `).get([s, e]) as { totalCost: number }

  const monthlyRows = db.prepare(`
    SELECT CAST(strftime('%m', sale_date) AS INTEGER) AS month,
           SUM(total_amount) AS revenue, COUNT(*) AS count
    FROM sales WHERE sale_date BETWEEN ? AND ? AND status = 'completed'
    GROUP BY month ORDER BY month
  `).all([s, e]) as { month:number; revenue:number; count:number }[]

  const monthMap = new Map(monthlyRows.map((r) => [r.month, r]))
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const monthlyBreakdown = Array.from({length:12},(_,i)=>({
    month: MONTH_NAMES[i], revenue: monthMap.get(i+1)?.revenue ?? 0, count: monthMap.get(i+1)?.count ?? 0,
  }))

  const topProducts = db.prepare(`
    SELECT si.product_name AS name, SUM(si.quantity) AS qty, SUM(si.line_total) AS revenue
    FROM sale_items si JOIN sales s ON si.sale_id = s.id
    WHERE s.sale_date BETWEEN ? AND ? AND s.status = 'completed'
    GROUP BY si.product_id ORDER BY revenue DESC LIMIT 20
  `).all([s, e]) as ProdRow[]

  const categoryRevenue = db.prepare(`
    SELECT COALESCE(c.name,'Uncategorised') AS category,
           SUM(si.line_total) AS revenue, COUNT(si.id) AS count
    FROM sale_items si JOIN sales sv ON si.sale_id = sv.id
    JOIN products p ON si.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE sv.sale_date BETWEEN ? AND ? AND sv.status = 'completed'
    GROUP BY c.name ORDER BY revenue DESC
  `).all([s, e])

  const cashierPerf = db.prepare(`
    SELECT u.full_name AS name, COUNT(s.id) AS sales, COALESCE(SUM(s.total_amount),0) AS revenue
    FROM sales s JOIN users u ON s.served_by = u.id
    WHERE s.sale_date BETWEEN ? AND ? AND s.status = 'completed'
    GROUP BY s.served_by ORDER BY revenue DESC
  `).all([s, e]) as CashierRow[]

  const grossProfit = totals.totalRevenue - cogs.totalCost

  return {
    year, businessName, currency,
    totalRevenue: totals.totalRevenue, totalTransactions: totals.totalTransactions,
    totalDiscounts: totals.totalDiscounts, totalTax: totals.totalTax,
    totalCost: cogs.totalCost, grossProfit,
    profitMarginPct: totals.totalRevenue > 0 ? (grossProfit/totals.totalRevenue)*100 : 0,
    monthlyBreakdown, topProducts, categoryRevenue, cashierPerformance: cashierPerf,
  }
}

// ─── Inventory report ─────────────────────────────────────
export function buildInventoryReport(db: DB): InventoryReportData {
  const products = db.prepare(`
    SELECT p.*, c.name AS category_name, s.name AS supplier_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN suppliers  s ON p.supplier_id  = s.id
    WHERE p.is_active = 1
  `).all() as any[]

  const totalStockValue  = products.reduce((s,p) => s + p.cost_price    * p.stock_qty, 0)
  const totalRetailValue = products.reduce((s,p) => s + p.selling_price  * p.stock_qty, 0)
  const lowStockItems    = products.filter(p => p.stock_qty <= p.reorder_level && p.stock_qty > 0)
  const outOfStockItems  = products.filter(p => p.stock_qty <= 0)

  const thirtyDaysAgo = format(new Date(Date.now() - 30*86400000), 'yyyy-MM-dd 00:00:00')
  const recentSales   = db.prepare(`
    SELECT si.product_id, SUM(si.quantity) AS totalSold
    FROM sale_items si JOIN sales s ON si.sale_id = s.id
    WHERE s.sale_date >= ? AND s.status = 'completed'
    GROUP BY si.product_id
  `).all([thirtyDaysAgo]) as { product_id:number; totalSold:number }[]

  const soldMap = new Map(recentSales.map(r => [r.product_id, r.totalSold]))
  const topMovingProducts  = products.map(p => ({ product:p, totalSold: soldMap.get(p.id)??0 })).sort((a,b)=>b.totalSold-a.totalSold).slice(0,10)
  const slowMovingProducts = products.filter(p => !soldMap.has(p.id) && p.stock_qty > 0).map(p => ({ product:p, daysSinceLastSale:30 })).slice(0,10)

  const catMap = new Map<string,{count:number;value:number}>()
  for (const p of products) {
    const cat  = p.category_name ?? 'Uncategorised'
    const prev = catMap.get(cat) ?? { count:0, value:0 }
    catMap.set(cat, { count: prev.count+1, value: prev.value + p.cost_price*p.stock_qty })
  }
  const categoryBreakdown = [...catMap.entries()].map(([category,v]) => ({ category, count:v.count, value:v.value }))

  return {
    generatedAt: new Date().toISOString(), totalProducts: products.length,
    totalStockValue, totalRetailValue, lowStockItems, outOfStockItems,
    overstockItems: [], topMovingProducts, slowMovingProducts, categoryBreakdown,
  }
}

// ─── P&L ─────────────────────────────────────────────────
// ─── Advanced dashboard insights ─────────────────────────
// Sales velocity, days-to-finish projection, top/slow movers, dead stock.
// `windowDays` is the lookback period used to compute the average daily
// sales rate (default 30 days) — the rate drives the days-to-finish estimate.
export function buildInsights(db: DB, windowDays = 30) {
  const since = `-${windowDays} days`

  // Per-product sales velocity over the window (pieces sold per day).
  // sale_items.quantity is in the sold unit; for bulk lines we multiply by
  // units_per_bulk so velocity is always in base pieces, matching stock_qty.
  const velocity = db.prepare(`
    SELECT
      p.id, p.name, p.stock_qty, p.reorder_level, p.unit,
      p.selling_price, p.cost_price,
      p.bulk_unit, COALESCE(p.units_per_bulk, 1) AS units_per_bulk,
      COALESCE(SUM(
        CASE WHEN si.sell_mode = 'bulk'
             THEN si.quantity * COALESCE(p.units_per_bulk, 1)
             ELSE si.quantity END
      ), 0) AS units_sold,
      COALESCE(SUM(si.line_total), 0) AS revenue,
      COUNT(DISTINCT s.id)            AS times_sold,
      -- Total ever purchased/received (in pieces), from restock records.
      COALESCE((
        SELECT SUM(sa.qty_change) FROM stock_adjustments sa
        WHERE sa.product_id = p.id AND sa.reason = 'restock'
      ), 0) AS total_purchased
    FROM products p
    LEFT JOIN sale_items si ON si.product_id = p.id
    LEFT JOIN sales s ON si.sale_id = s.id
         AND s.status = 'completed'
         AND s.sale_date >= datetime('now', ?)
    WHERE p.is_active = 1
    GROUP BY p.id
  `).all([since]) as Array<{
    id: number; name: string; stock_qty: number; reorder_level: number; unit: string
    selling_price: number; cost_price: number
    bulk_unit: string | null; units_per_bulk: number
    units_sold: number; revenue: number; times_sold: number; total_purchased: number
  }>

  const enriched = velocity.map(p => {
    const perDay = p.units_sold / windowDays         // avg pieces sold per day
    const daysLeft = perDay > 0 ? p.stock_qty / perDay : null  // null = no sales = won't run out
    const upb = p.units_per_bulk || 1
    const hasBulk = !!p.bulk_unit && upb > 1
    return {
      id: p.id, name: p.name, unit: p.unit,
      bulk_unit: p.bulk_unit, units_per_bulk: upb, has_bulk: hasBulk,
      // REMAINING stock — in pieces, plus pack-equivalent for bulk products
      stock_qty: p.stock_qty,
      remaining_packs: hasBulk ? +(p.stock_qty / upb).toFixed(1) : null,
      // PURCHASED (total ever received) — pieces + pack-equivalent
      total_purchased: p.total_purchased,
      purchased_packs: hasBulk ? +(p.total_purchased / upb).toFixed(1) : null,
      // SOLD in the window — pieces + pack-equivalent
      units_sold: p.units_sold,
      sold_packs: hasBulk ? +(p.units_sold / upb).toFixed(1) : null,
      reorder_level: p.reorder_level,
      revenue: p.revenue, times_sold: p.times_sold,
      per_day: +perDay.toFixed(2),
      days_left: daysLeft != null ? Math.round(daysLeft) : null,
      profit: +((p.selling_price - p.cost_price) * p.units_sold).toFixed(2),
    }
  })

  const sold = enriched.filter(p => p.units_sold > 0)

  // Most purchased (by quantity sold)
  const mostSold = [...sold].sort((a, b) => b.units_sold - a.units_sold).slice(0, 8)
  // Least purchased (sold at least once, but slowest)
  const leastSold = [...sold].sort((a, b) => a.units_sold - b.units_sold).slice(0, 8)
  // Running out soon — has a finite days_left, soonest first
  const runningOut = enriched
    .filter(p => p.days_left != null && p.stock_qty > 0)
    .sort((a, b) => (a.days_left as number) - (b.days_left as number))
    .slice(0, 10)
    .map(p => ({
      ...p,
      // Suggest ordering enough to cover ~30 days of sales, minus what's left.
      // e.g. sells 6/day → 30 days needs 180; if 45 in stock, order 135.
      suggested_order: Math.max(0, Math.ceil(p.per_day * 30 - p.stock_qty)),
    }))
  // Dead stock — in stock but ZERO sales in the window
  const deadStock = enriched
    .filter(p => p.units_sold === 0 && p.stock_qty > 0)
    .sort((a, b) => b.stock_qty - a.stock_qty)
    .slice(0, 10)
  // Most profitable products in the window
  const topProfit = [...sold].sort((a, b) => b.profit - a.profit).slice(0, 8)

  // Headline counts
  const outOfStock = enriched.filter(p => p.stock_qty <= 0).length
  const lowStock   = enriched.filter(p => p.stock_qty > 0 && p.stock_qty <= p.reorder_level).length

  return {
    windowDays,
    mostSold, leastSold, runningOut, deadStock, topProfit,
    // Full per-product movement (purchased/sold/remaining) for the audit table.
    movement: [...enriched].sort((a, b) => a.name.localeCompare(b.name)),
    counts: {
      activeProducts: enriched.length,
      outOfStock, lowStock,
      noSales: enriched.filter(p => p.units_sold === 0).length,
    },
  }
}

export function buildProfitLoss(db: DB, dateFrom: string, dateTo: string): ProfitLossData {
  const s = `${dateFrom} 00:00:00`, e = `${dateTo} 23:59:59`

  const sales = db.prepare(`
    SELECT COALESCE(SUM(total_amount),0) AS revenue,
           COALESCE(SUM(discount_amt),0) AS discounts,
           COALESCE(SUM(tax_amount),0) AS tax
    FROM sales WHERE sale_date BETWEEN ? AND ? AND status = 'completed'
  `).get([s, e]) as { revenue:number; discounts:number; tax:number }

  // COGS from the per-sale snapshot column (migration 007).
  // total_cost_amount is frozen at the moment of each sale, so price
  // changes never alter historical profit. Pre-007 rows were backfilled
  // by the migration; COALESCE guards any stragglers via the old join.
  const cogs = db.prepare(`
    SELECT COALESCE(SUM(
      CASE WHEN sv.total_cost_amount > 0 THEN sv.total_cost_amount
           ELSE COALESCE((
             SELECT SUM(
               si.quantity *
               CASE WHEN si.sell_mode = 'bulk' THEN COALESCE(p.units_per_bulk, 1) ELSE 1 END *
               si.cost_price
             )
             FROM sale_items si
             LEFT JOIN products p ON si.product_id = p.id
             WHERE si.sale_id = sv.id
           ), 0)
      END
    ),0) AS cost
    FROM sales sv
    WHERE sv.sale_date BETWEEN ? AND ? AND sv.status = 'completed'
  `).get([s, e]) as { cost: number }

  const grossProfit = sales.revenue - cogs.cost

  // Top products for the period (used by the dashboard's Top Products panel).
  const topProducts = db.prepare(`
    SELECT si.product_name AS name,
           SUM(si.quantity)   AS qty,
           SUM(si.line_total) AS revenue
    FROM sale_items si JOIN sales s ON si.sale_id = s.id
    WHERE s.sale_date BETWEEN ? AND ? AND s.status = 'completed'
    GROUP BY si.product_id ORDER BY revenue DESC LIMIT 10
  `).all([s, e]) as { name: string; qty: number; revenue: number }[]

  return {
    period: `${dateFrom} to ${dateTo}`, revenue: sales.revenue,
    cogs: cogs.cost, grossProfit,
    grossMargin: sales.revenue > 0 ? (grossProfit/sales.revenue)*100 : 0,
    totalDiscounts: sales.discounts, taxCollected: sales.tax,
    netRevenue: sales.revenue - sales.discounts,
    topProducts,
  }
}

// ─── X/Z Reports ─────────────────────────────────────────
export function buildXReport(db: DB, _userId: number) {
  return buildDailyReport(db, format(new Date(), 'yyyy-MM-dd'))
}

export function buildZReport(db: DB, userId: number) {
  const today  = format(new Date(), 'yyyy-MM-dd')
  const report = buildDailyReport(db, today)
  db.prepare("INSERT INTO activity_log (user_id, action, detail) VALUES (?, 'report.zreport', ?)")
    .run([userId, `Z-Report ${today}, Revenue: ${report.totalRevenue}`])
  return report
}
