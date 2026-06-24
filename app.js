// ═══════════════════════════════════════════════════════════
// NovaPOS Mobile Store Monitor v3 — PWA
// Read-only dashboard for store owners. Queries Supabase LIVE every
// time a screen is opened or refreshed — no manual "Sync" step, no
// row caps, always current. IndexedDB is kept only as an offline
// fallback (last-known-good snapshot shown with a clear "Offline"
// banner if a live query fails — never the primary source while
// online).
// ═══════════════════════════════════════════════════════════

const APP = document.getElementById('app')
const DB_NAME = 'novapos_mobile'
const DB_VER = 2
const TABLES = ['products','sales','sale_items','payments','customers','categories','stock_adjustments']
const REFRESH_MS = 5 * 60 * 1000  // auto-refresh the active tab every 5 min
const PAGE_SIZE = 1000            // PostgREST's own per-request cap — paginate past it so a mature store's full history is never silently truncated

// ─── IndexedDB (offline fallback cache only) ────────────
let idb = null
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = e => {
      const db = e.target.result
      for (const t of TABLES) { if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' }) }
      if (!db.objectStoreNames.contains('_meta')) db.createObjectStore('_meta', { keyPath: 'key' })
    }
    req.onsuccess = e => { idb = e.target.result; resolve(idb) }
    req.onerror = () => reject(req.error)
  })
}
// Mirrors live truth exactly — clears the store first so a row deleted
// server-side doesn't linger forever in the offline fallback.
function idbReplaceAll(store, rows) {
  return new Promise((res, rej) => {
    const tx = idb.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    os.clear()
    for (const row of rows) os.put(row)
    tx.oncomplete = res
    tx.onerror = () => rej(tx.error)
  })
}
function idbGetAll(store) {
  return new Promise((r, j) => { const tx = idb.transaction(store, 'readonly'); const req = tx.objectStore(store).getAll(); req.onsuccess = () => r(req.result); req.onerror = () => j(req.error) })
}
function idbMeta(key, val) {
  if (val === undefined) return new Promise(r => { try { const tx = idb.transaction('_meta','readonly'); const req = tx.objectStore('_meta').get(key); req.onsuccess = () => r(req.result?.value ?? null); req.onerror = () => r(null) } catch { r(null) } })
  return new Promise(r => { const tx = idb.transaction('_meta','readwrite'); tx.objectStore('_meta').put({key, value: val}); tx.oncomplete = r; tx.onerror = r })
}

// ─── Supabase ───────────────────────────────────────────
let sb = null
const getCfg = () => { try { return JSON.parse(localStorage.getItem('novapos_cfg') || 'null') } catch { return null } }
const saveCfg = c => localStorage.setItem('novapos_cfg', JSON.stringify(c))
// Accept a full URL, a scheme-less host, or just a project ref and return a
// valid absolute Supabase URL (matches the desktop app's normalizer).
const normalizeSupabaseUrl = raw => {
  let u = (raw || '').trim().replace(/\/+$/, '')
  if (!u) return u
  if (/^https?:\/\//i.test(u)) return u
  if (!u.includes('.') && !u.includes('/')) return `https://${u}.supabase.co`
  return `https://${u}`
}
const initSB = c => { sb = supabase.createClient(normalizeSupabaseUrl(c.url), c.key) }

// Tracks whether the CURRENT tab render had to fall back to cache, so the
// header status line can show an honest "Offline" banner. Reset at the top
// of every renderTab() pass; only ever set to true within that pass (a
// later successful parallel fetch should never erase an earlier failure).
let fetchTracker = { offline: false, time: null }

// Queries `table` live from Supabase, paginating past PostgREST's own
// per-request row cap so a mature store's full history is never silently
// truncated — this is the property the old IndexedDB-sync model could NOT
// guarantee (it was capped at 500 rows per sync cycle). On success, mirrors
// the result into IndexedDB as a best-effort offline cache. On failure
// (no connection, etc.), falls back to whatever's cached and flags it.
async function liveFetch(table, applyFilters) {
  try {
    let all = []
    let offset = 0
    for (;;) {
      let q = sb.from(table).select('*')
      if (applyFilters) q = applyFilters(q)
      q = q.order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1)
      const { data, error } = await q
      if (error) throw error
      all = all.concat(data || [])
      if (!data || data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }
    idbReplaceAll(table, all).catch(() => {}) // best-effort cache write, never blocks the UI
    idbMeta('last_fetch_' + table, new Date().toISOString())
    return all
  } catch (e) {
    console.warn(`Live fetch failed for ${table}, falling back to cache:`, e)
    fetchTracker.offline = true
    fetchTracker.time = await idbMeta('last_fetch_' + table)
    return await idbGetAll(table)
  }
}

// ─── resolveLineMultiplier (JS port of saleService.ts's helper) ────────
// Reads ONLY the immutable items_json snapshot already baked into each
// sale at completion time — never live product/tier data — so historical
// purchased/sold totals can't be corrupted by a later re-pack or price
// edit. Mirrors the desktop logic exactly (tier_level+base_multiplier
// first, legacy sell_mode+units_per_bulk/pallet as fallback for very old
// pre-snapshot rows).
function resolveLineMultiplier(item) {
  if (item.base_multiplier != null && item.tier_level != null) {
    return { level: item.tier_level, multiplier: item.base_multiplier }
  }
  const mode = item.sell_mode ?? 'unit'
  if (mode === 'pallet') return { level: 2, multiplier: item.units_per_pallet ?? 1 }
  if (mode === 'bulk')   return { level: 1, multiplier: item.units_per_bulk   ?? 1 }
  return { level: 0, multiplier: 1 }
}

// ─── Helpers ────────────────────────────────────────────
const fmt = n => new Intl.NumberFormat('en-NG').format(n)
const money = n => '₦' + fmt(Math.round(n))
function ago(iso) {
  if (!iso) return 'never'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s/60)+'m ago'
  if (s < 86400) return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago'
}
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
function dateKey(d) { return (d || '').slice(0, 10) }
function last7Days() {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

// ─── Setup screen ───────────────────────────────────────
function renderSetup() {
  APP.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm space-y-4">
        <div class="text-center">
          <div class="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg class="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg>
          </div>
          <h1 class="text-xl font-bold text-gray-800">NovaPOS Monitor</h1>
          <p class="text-sm text-gray-500 mt-1">Connect to your store</p>
        </div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Supabase URL</label>
          <input id="su" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://xxx.supabase.co"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Anon Key</label>
          <input id="sk" class="w-full border rounded-lg px-3 py-2 text-sm font-mono text-xs" placeholder="eyJ..."></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Store Name</label>
          <input id="sn" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="My Shop"></div>
        <button id="btn-go" class="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold">Connect</button>
      </div>
    </div>`
  document.getElementById('btn-go').onclick = async () => {
    const url = normalizeSupabaseUrl(document.getElementById('su').value)
    const key = document.getElementById('sk').value.trim()
    const name = document.getElementById('sn').value.trim() || 'My Store'
    if (!url || !key) return alert('Enter URL and key')
    saveCfg({ url, key, name })
    initSB({ url, key })
    if ('Notification' in window) await Notification.requestPermission()
    await renderApp()
  }
}

// ─── Main app ───────────────────────────────────────────
let tab = 'overview'
let refreshTimer = null
let menuOpen = false

// Deeper reports live behind a menu, not crammed into the bottom tab bar —
// the 4 bottom tabs stay focused on the things checked constantly (today's
// numbers, stock, recent sales, alerts); these are the "dig deeper" screens.
const MENU_ITEMS = [
  { id: 'stockaudit', label: 'Stock Audit',    sub: 'Purchased vs. sold vs. remaining, per product' },
  { id: 'daily',      label: 'Daily Report',   sub: 'Pick any date — revenue, discounts, tax, payments' },
  { id: 'monthly',    label: 'Monthly Report', sub: 'Pick a month — revenue, profit, daily trend' },
  { id: 'yearly',     label: 'Yearly Report',  sub: 'Pick a year — revenue, profit, monthly trend' },
  { id: 'pl',         label: 'Profit & Loss',  sub: 'Any date range — revenue, COGS, gross profit' },
]

function renderMenu() {
  let panel = document.getElementById('menu-panel')
  if (!panel) return
  panel.className = `fixed inset-0 z-40 ${menuOpen ? '' : 'pointer-events-none'}`
  panel.innerHTML = !menuOpen ? '' : `
    <div id="menu-backdrop" class="absolute inset-0 bg-black/40"></div>
    <div class="absolute top-0 left-0 h-full w-72 bg-white shadow-2xl p-4 space-y-1">
      <h2 class="text-xs font-bold text-gray-400 uppercase px-2 mb-2">More Reports</h2>
      ${MENU_ITEMS.map(m => `
        <button data-menu="${m.id}" class="w-full text-left rounded-xl px-3 py-3 hover:bg-blue-50 ${tab===m.id?'bg-blue-50':''}">
          <p class="text-sm font-semibold ${tab===m.id?'text-blue-700':'text-gray-800'}">${m.label}</p>
          <p class="text-[11px] text-gray-400">${m.sub}</p>
        </button>`).join('')}
    </div>`
  if (!menuOpen) return
  document.getElementById('menu-backdrop').onclick = () => { menuOpen = false; renderMenu() }
  panel.querySelectorAll('[data-menu]').forEach(b => b.onclick = () => {
    tab = b.dataset.menu; menuOpen = false; renderMenu()
    document.querySelectorAll('[data-t]').forEach(x => { x.className = `flex-1 py-3 text-xs font-medium text-center ${x.dataset.t===tab?'tab-active':'text-gray-400'}` })
    renderTab()
  })
}

function updateStatusLine() {
  const el = document.getElementById('syncst')
  if (!el) return
  el.textContent = fetchTracker.offline
    ? `Offline — showing data from ${ago(fetchTracker.time)}`
    : `Live — updated just now`
}

async function renderApp() {
  const c = getCfg()
  APP.innerHTML = `
    <header class="bg-blue-700 text-white px-4 pt-10 pb-4 rounded-b-2xl">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <button id="bmenu" class="p-1 -ml-1">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <div>
            <p class="text-blue-200 text-xs">${greeting()}</p>
            <h1 class="text-lg font-bold">${c.name}</h1>
          </div>
        </div>
        <div class="flex gap-2">
          <button id="brefresh" class="bg-blue-600 rounded-lg p-1.5" title="Refresh">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </button>
          <button id="bcfg" class="bg-blue-600 rounded-lg p-1.5" title="Settings">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
      <p id="syncst" class="text-blue-200 text-[10px] mt-1">Loading...</p>
    </header>
    <nav class="flex bg-white sticky top-0 z-10 border-b border-gray-100">
      ${['overview','stock','sales','alerts'].map(t =>
        `<button data-t="${t}" class="flex-1 py-3 text-xs font-medium text-center ${tab===t?'tab-active':'text-gray-400'}">${t[0].toUpperCase()+t.slice(1)}</button>`
      ).join('')}
    </nav>
    <main id="content" class="p-4 pb-20"></main>
    <div id="menu-panel" class="fixed inset-0 z-40 pointer-events-none"></div>`

  // Tab switching
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    tab = b.dataset.t
    document.querySelectorAll('[data-t]').forEach(x => { x.className = `flex-1 py-3 text-xs font-medium text-center ${x.dataset.t===tab?'tab-active':'text-gray-400'}` })
    renderTab()
  })

  // Hamburger menu (deeper reports — Stock Audit, Monthly Report)
  document.getElementById('bmenu').onclick = () => { menuOpen = true; renderMenu() }

  // Refresh — re-queries whatever tab is currently open, live
  document.getElementById('brefresh').onclick = () => renderTab()

  // Settings
  document.getElementById('bcfg').onclick = () => { if (confirm('Disconnect from this store?')) { localStorage.removeItem('novapos_cfg'); renderSetup() } }

  // Low-stock check via SW — fires every login, independent of any tab
  if (swReg?.active) swReg.active.postMessage({ type: 'CHECK_STOCK', url: c.url, key: c.key })

  // Auto-refresh — re-queries the active tab live every 5 min
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = setInterval(() => renderTab(), REFRESH_MS)

  renderTab()
}

// ─── Tab renderers ──────────────────────────────────────
async function renderTab() {
  const el = document.getElementById('content')
  if (!el) return
  fetchTracker = { offline: false, time: null }
  switch (tab) {
    case 'overview':   await renderOverview(el); break
    case 'stock':      await renderStock(el); break
    case 'sales':      await renderSales(el); break
    case 'alerts':     await renderAlerts(el); break
    case 'stockaudit': await renderStockAudit(el); break
    case 'daily':      await renderDailyReport(el); break
    case 'monthly':    await renderMonthlyReport(el); break
    case 'yearly':     await renderYearlyReport(el); break
    case 'pl':         await renderProfitLoss(el); break
  }
  updateStatusLine()
}

// Returns { [product_id]: pieces } summed from every completed sale's
// immutable items_json snapshot — the same source desktop's buildInsights
// reads from, so a tier re-pack or price edit after the fact can never
// silently change a historical "sold" number.
function sumSoldPieces(sales, sinceISO) {
  const totals = {}
  for (const s of sales) {
    if (s.status !== 'completed' || !s.items_json) continue
    if (sinceISO && s.sale_date < sinceISO) continue
    let lines
    try { lines = JSON.parse(s.items_json) } catch { continue }
    for (const line of lines) {
      const { multiplier } = resolveLineMultiplier(line)
      const pieces = (line.quantity ?? 0) * multiplier
      totals[line.product_id] = (totals[line.product_id] || 0) + pieces
    }
  }
  return totals
}

// Returns { [product_id]: pieces } summed from stock_adjustments — same
// "all-time total ever received" convention as desktop's Stock Audit page
// (reason 'restock' = Receive Stock, 'opening_balance' = initial/import qty).
function sumPurchasedPieces(adjustments) {
  const totals = {}
  for (const a of adjustments) {
    if (a.reason !== 'restock' && a.reason !== 'opening_balance') continue
    totals[a.product_id] = (totals[a.product_id] || 0) + (a.qty_change || 0)
  }
  return totals
}

// Pack-equivalent display string for a piece count, reusing the same
// flat bulk_unit/units_per_bulk fields the Stock/Alerts tabs already show
// (mobile only syncs the legacy 2-tier flat columns, not the full N-tier
// product_packaging_tiers table — consistent with the rest of this app).
function pieceLabel(p, pieces) {
  const upb = p.units_per_bulk || 1
  const isBulkOnly = p.pricing_mode === 'bulk'
  const hasBulk = (p.pricing_mode === 'both' || isBulkOnly) && upb > 1
  const unit = isBulkOnly ? (p.bulk_unit || p.unit || 'pcs') : (p.unit || 'pcs')
  const base = `${fmt1(pieces)} ${unit}`
  return hasBulk ? `${base} <span class="text-gray-400">(${fmt1(pieces / upb)} ${p.bulk_unit})</span>` : base
}
function fmt1(n) { return (Math.round(n * 10) / 10).toLocaleString('en-NG') }

async function renderStockAudit(el) {
  const [products, sales, adjustments] = await Promise.all([
    liveFetch('products'),
    liveFetch('sales', q => q.eq('status', 'completed')),
    liveFetch('stock_adjustments'),
  ])

  const sold      = sumSoldPieces(sales)       // all-time, live — no row cap, no sync window
  const purchased = sumPurchasedPieces(adjustments)

  el.innerHTML = `
    <div class="mb-3">
      <h2 class="text-sm font-bold text-gray-800">Stock Audit</h2>
      <p class="text-[11px] text-gray-400">Purchased = total ever received · Sold = all-time · Remaining = current stock</p>
    </div>
    <div class="mb-3"><input id="saq" class="w-full bg-white border rounded-lg px-3 py-2 text-sm" placeholder="Search products..."></div>
    <div class="space-y-2">
      ${[...products].sort((a, b) => a.name.localeCompare(b.name)).map(p => {
        const out = p.stock_qty <= 0, low = !out && p.stock_qty <= p.reorder_level
        const badge = out ? 'bg-red-100 text-red-700' : low ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
        return `
          <div class="bg-white rounded-xl px-4 py-3 shadow-sm sarow" data-n="${(p.name||'').toLowerCase()}">
            <div class="flex justify-between items-start mb-2">
              <p class="text-sm font-medium text-gray-800 truncate flex-1">${p.name}</p>
              <span class="text-[10px] px-2 py-0.5 rounded-full ${badge} flex-shrink-0 ml-2">${out?'Out':low?'Low':'OK'}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center">
              <div><p class="text-[9px] text-gray-400 uppercase">Purchased</p><p class="text-xs font-semibold text-gray-700">${pieceLabel(p, purchased[p.id] || 0)}</p></div>
              <div><p class="text-[9px] text-gray-400 uppercase">Sold</p><p class="text-xs font-semibold text-gray-700">${pieceLabel(p, sold[p.id] || 0)}</p></div>
              <div><p class="text-[9px] text-gray-400 uppercase">Remaining</p><p class="text-xs font-bold ${out?'text-red-600':low?'text-amber-600':'text-green-600'}">${pieceLabel(p, p.stock_qty)}</p></div>
            </div>
          </div>`
      }).join('')}
    </div>`

  document.getElementById('saq').oninput = e => {
    const q = e.target.value.toLowerCase()
    document.querySelectorAll('.sarow').forEach(r => r.style.display = r.dataset.n.includes(q) ? '' : 'none')
  }
}

// ─── Monthly Report ─────────────────────────────────────
let reportMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'

async function renderMonthlyReport(el) {
  const [y, m] = reportMonth.split('-').map(Number)
  const monthStart = `${reportMonth}-01`
  const daysInMonth = new Date(y, m, 0).getDate()
  // Half-open interval [monthStart, nextMonthStart) — avoids the off-by-a-
  // few-hours bug a string `<=` comparison against a bare date would have
  // for sales recorded late on the last day of the month.
  const nextMonthStart = new Date(y, m, 1).toISOString().slice(0, 10)

  const monthSales = await liveFetch('sales', q => q.eq('status', 'completed').gte('sale_date', monthStart).lt('sale_date', nextMonthStart))
  const monthSaleIds = monthSales.map(s => s.id)
  const monthItems = monthSaleIds.length ? await liveFetch('sale_items', q => q.in('sale_id', monthSaleIds)) : []

  const revenue = monthSales.reduce((s, x) => s + (x.total_amount || 0), 0)
  const cogs    = monthSales.reduce((s, x) => s + (x.total_cost_amount || 0), 0)
  const profit  = revenue - cogs

  const dayTotals = Array.from({ length: daysInMonth }, (_, i) => {
    const day = `${reportMonth}-${String(i + 1).padStart(2, '0')}`
    return { day: i + 1, rev: monthSales.filter(s => dateKey(s.sale_date) === day).reduce((s, x) => s + (x.total_amount || 0), 0) }
  })
  const maxRev = Math.max(...dayTotals.map(d => d.rev), 1)

  const byProduct = {}
  monthItems.forEach(i => { byProduct[i.product_name] = (byProduct[i.product_name] || 0) + i.line_total })
  const topProds = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 8)

  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })

  el.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <button id="prevm" class="p-2 bg-white rounded-lg shadow-sm">‹</button>
      <h2 class="text-sm font-bold text-gray-800">${monthLabel}</h2>
      <button id="nextm" class="p-2 bg-white rounded-lg shadow-sm">›</button>
    </div>

    <div class="grid grid-cols-3 gap-2 mb-4">
      <div class="bg-white rounded-xl p-3 shadow-sm text-center"><p class="text-[9px] text-gray-400 uppercase">Revenue</p><p class="text-sm font-bold text-green-600">${money(revenue)}</p></div>
      <div class="bg-white rounded-xl p-3 shadow-sm text-center"><p class="text-[9px] text-gray-400 uppercase">COGS</p><p class="text-sm font-bold text-gray-600">${money(cogs)}</p></div>
      <div class="bg-white rounded-xl p-3 shadow-sm text-center"><p class="text-[9px] text-gray-400 uppercase">Profit</p><p class="text-sm font-bold ${profit>=0?'text-blue-600':'text-red-600'}">${money(profit)}</p></div>
    </div>

    <div class="bg-white rounded-xl p-4 shadow-sm mb-4">
      <h3 class="text-xs font-semibold text-gray-700 mb-3">Daily Revenue</h3>
      <div class="flex items-end gap-0.5 h-20">
        ${dayTotals.map(d => `<div class="flex-1 rounded-t bg-blue-300" style="height:${Math.max(2, (d.rev/maxRev)*100)}%" title="Day ${d.day}: ${money(d.rev)}"></div>`).join('')}
      </div>
      <p class="text-[9px] text-gray-400 mt-1">${monthSales.length} sales this month</p>
    </div>

    <div class="bg-white rounded-xl p-3.5 shadow-sm">
      <h3 class="text-xs font-semibold text-gray-700 mb-2">Top Products</h3>
      ${topProds.length === 0 ? '<p class="text-[10px] text-gray-400">No sales this month</p>' :
        topProds.map(([n, v]) => `
          <div class="flex justify-between py-1 border-b border-gray-50">
            <span class="text-xs text-gray-600 truncate flex-1 mr-2">${n}</span>
            <span class="text-xs font-medium text-green-600">${money(v)}</span>
          </div>`).join('')}
    </div>`

  document.getElementById('prevm').onclick = () => {
    const [yy, mm] = reportMonth.split('-').map(Number)
    const d = new Date(yy, mm - 2, 1)
    reportMonth = d.toISOString().slice(0, 7)
    renderMonthlyReport(el)
  }
  document.getElementById('nextm').onclick = () => {
    const [yy, mm] = reportMonth.split('-').map(Number)
    const d = new Date(yy, mm, 1)
    reportMonth = d.toISOString().slice(0, 7)
    renderMonthlyReport(el)
  }
}

// Shared by Monthly/Yearly/P&L — same revenue-by-product ranking desktop's
// topProductsDisplay() returns, sourced from each report's own sale_items.
function topProductsFrom(items, limit = 8) {
  const byProduct = {}
  items.forEach(i => { byProduct[i.product_name] = (byProduct[i.product_name] || 0) + i.line_total })
  return Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, limit)
}

function topProductsHtml(topProds, emptyText) {
  return `
    <div class="bg-white rounded-xl p-3.5 shadow-sm">
      <h3 class="text-xs font-semibold text-gray-700 mb-2">Top Products</h3>
      ${topProds.length === 0 ? `<p class="text-[10px] text-gray-400">${emptyText}</p>` :
        topProds.map(([n, v]) => `
          <div class="flex justify-between py-1 border-b border-gray-50">
            <span class="text-xs text-gray-600 truncate flex-1 mr-2">${n}</span>
            <span class="text-xs font-medium text-green-600">${money(v)}</span>
          </div>`).join('')}
    </div>`
}

// ─── Daily Report — mirrors desktop's buildDailyReport ──
let reportDate = new Date().toISOString().slice(0, 10) // 'YYYY-MM-DD'

async function renderDailyReport(el) {
  const d = new Date(reportDate); d.setDate(d.getDate() + 1)
  const nextDay = d.toISOString().slice(0, 10)

  const [daySales, dayItems] = await Promise.all([
    liveFetch('sales', q => q.gte('sale_date', reportDate).lt('sale_date', nextDay)),
    liveFetch('sale_items'),
  ])

  const completed = daySales.filter(s => s.status === 'completed')
  const voidCount  = daySales.filter(s => s.status === 'voided').length
  const revenue    = completed.reduce((s, x) => s + (x.total_amount || 0), 0)
  const discounts  = completed.reduce((s, x) => s + (x.discount_amt || 0), 0)
  const tax        = completed.reduce((s, x) => s + (x.tax_amount || 0), 0)
  const cogs       = completed.reduce((s, x) => s + (x.total_cost_amount || 0), 0)

  const dayItemsForSales = dayItems.filter(i => completed.some(s => s.id === i.sale_id))
  const topProds = topProductsFrom(dayItemsForSales)

  const isToday = reportDate === new Date().toISOString().slice(0, 10)
  const label = isToday ? `Today (${reportDate})` : reportDate

  el.innerHTML = `
    <div class="flex items-center justify-between mb-3 gap-2">
      <h2 class="text-sm font-bold text-gray-800 flex-1">${label}</h2>
      <input id="dpick" type="date" value="${reportDate}" max="${new Date().toISOString().slice(0,10)}"
        class="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
    </div>
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div class="bg-white rounded-xl p-3.5 shadow-sm"><p class="text-[10px] text-gray-400 uppercase">Revenue</p><p class="text-xl font-bold text-green-600">${money(revenue)}</p><p class="text-[10px] text-gray-400">${completed.length} sales</p></div>
      <div class="bg-white rounded-xl p-3.5 shadow-sm"><p class="text-[10px] text-gray-400 uppercase">Gross Profit</p><p class="text-xl font-bold ${revenue-cogs>=0?'text-blue-600':'text-red-600'}">${money(revenue-cogs)}</p><p class="text-[10px] text-gray-400">COGS ${money(cogs)}</p></div>
      <div class="bg-white rounded-xl p-3.5 shadow-sm"><p class="text-[10px] text-gray-400 uppercase">Discounts</p><p class="text-lg font-bold text-amber-600">${money(discounts)}</p></div>
      <div class="bg-white rounded-xl p-3.5 shadow-sm"><p class="text-[10px] text-gray-400 uppercase">Tax Collected</p><p class="text-lg font-bold text-slate-700">${money(tax)}</p></div>
    </div>
    ${voidCount > 0 ? `<div class="bg-red-50 rounded-xl p-3 mb-4 text-xs text-red-700">${voidCount} sale${voidCount>1?'s':''} voided this day</div>` : ''}
    ${topProductsHtml(topProds, 'No sales this day')}`

  document.getElementById('dpick').onchange = e => { reportDate = e.target.value; renderDailyReport(el) }
}

// ─── Yearly Report — mirrors desktop's buildYearlyReport ──
let reportYear = new Date().getFullYear()

async function renderYearlyReport(el) {
  const yearStart = `${reportYear}-01-01`
  const nextYearStart = `${reportYear + 1}-01-01`

  const yearSales = await liveFetch('sales', q => q.eq('status', 'completed').gte('sale_date', yearStart).lt('sale_date', nextYearStart))
  const yearSaleIds = yearSales.map(s => s.id)
  const yearItems = yearSaleIds.length ? await liveFetch('sale_items', q => q.in('sale_id', yearSaleIds)) : []

  const revenue = yearSales.reduce((s, x) => s + (x.total_amount || 0), 0)
  const cogs    = yearSales.reduce((s, x) => s + (x.total_cost_amount || 0), 0)
  const profit  = revenue - cogs

  const monthTotals = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, '0')
    const rev = yearSales.filter(s => dateKey(s.sale_date).slice(5, 7) === mm).reduce((s, x) => s + (x.total_amount || 0), 0)
    return { month: i + 1, rev }
  })
  const maxRev = Math.max(...monthTotals.map(m => m.rev), 1)
  const monthNames = ['J','F','M','A','M','J','J','A','S','O','N','D']

  const topProds = topProductsFrom(yearItems)

  el.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <button id="prevy" class="p-2 bg-white rounded-lg shadow-sm">‹</button>
      <h2 class="text-sm font-bold text-gray-800">${reportYear}</h2>
      <button id="nexty" class="p-2 bg-white rounded-lg shadow-sm">›</button>
    </div>
    <div class="grid grid-cols-3 gap-2 mb-4">
      <div class="bg-white rounded-xl p-3 shadow-sm text-center"><p class="text-[9px] text-gray-400 uppercase">Revenue</p><p class="text-sm font-bold text-green-600">${money(revenue)}</p></div>
      <div class="bg-white rounded-xl p-3 shadow-sm text-center"><p class="text-[9px] text-gray-400 uppercase">COGS</p><p class="text-sm font-bold text-gray-600">${money(cogs)}</p></div>
      <div class="bg-white rounded-xl p-3 shadow-sm text-center"><p class="text-[9px] text-gray-400 uppercase">Profit</p><p class="text-sm font-bold ${profit>=0?'text-blue-600':'text-red-600'}">${money(profit)}</p></div>
    </div>
    <div class="bg-white rounded-xl p-4 shadow-sm mb-4">
      <h3 class="text-xs font-semibold text-gray-700 mb-3">Monthly Revenue</h3>
      <div class="flex items-end gap-1 h-20">
        ${monthTotals.map(m => `<div class="flex-1 flex flex-col items-center gap-1">
          <div class="w-full rounded-t bg-blue-300" style="height:${Math.max(2, (m.rev/maxRev)*100)}%" title="${monthNames[m.month-1]}: ${money(m.rev)}"></div>
          <span class="text-[8px] text-gray-400">${monthNames[m.month-1]}</span>
        </div>`).join('')}
      </div>
      <p class="text-[9px] text-gray-400 mt-1">${yearSales.length} sales this year</p>
    </div>
    ${topProductsHtml(topProds, 'No sales this year')}`

  document.getElementById('prevy').onclick = () => { reportYear -= 1; renderYearlyReport(el) }
  document.getElementById('nexty').onclick = () => { reportYear += 1; renderYearlyReport(el) }
}

// ─── Profit & Loss — mirrors desktop's buildProfitLoss ──
let plFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
let plTo   = new Date().toISOString().slice(0, 10)

async function renderProfitLoss(el) {
  const d = new Date(plTo); d.setDate(d.getDate() + 1)
  const toExclusive = d.toISOString().slice(0, 10)

  const sales = await liveFetch('sales', q => q.eq('status', 'completed').gte('sale_date', plFrom).lt('sale_date', toExclusive))
  const saleIds = sales.map(s => s.id)
  const items = saleIds.length ? await liveFetch('sale_items', q => q.in('sale_id', saleIds)) : []

  const revenue   = sales.reduce((s, x) => s + (x.total_amount || 0), 0)
  const discounts = sales.reduce((s, x) => s + (x.discount_amt || 0), 0)
  const tax       = sales.reduce((s, x) => s + (x.tax_amount || 0), 0)
  const cogs      = sales.reduce((s, x) => s + (x.total_cost_amount || 0), 0)
  const grossProfit = revenue - cogs
  const topProds = topProductsFrom(items, 10)

  el.innerHTML = `
    <div class="mb-3">
      <h2 class="text-sm font-bold text-gray-800">Profit & Loss</h2>
      <div class="flex items-center gap-2 mt-2">
        <input id="plfrom" type="date" value="${plFrom}" class="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
        <span class="text-xs text-gray-400">to</span>
        <input id="plto" type="date" value="${plTo}" max="${new Date().toISOString().slice(0,10)}" class="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
      </div>
    </div>
    <div class="bg-white rounded-xl p-4 shadow-sm mb-4 space-y-2">
      <div class="flex justify-between text-sm"><span class="text-gray-500">Revenue</span><span class="font-semibold text-gray-800">${money(revenue)}</span></div>
      <div class="flex justify-between text-sm"><span class="text-gray-500">Discounts given</span><span class="text-amber-600">-${money(discounts)}</span></div>
      <div class="flex justify-between text-sm"><span class="text-gray-500">Tax collected</span><span class="text-gray-600">${money(tax)}</span></div>
      <div class="flex justify-between text-sm border-t border-gray-100 pt-2"><span class="text-gray-500">Cost of Goods Sold</span><span class="text-red-500">-${money(cogs)}</span></div>
      <div class="flex justify-between text-base font-bold border-t border-gray-200 pt-2"><span>Gross Profit</span><span class="${grossProfit>=0?'text-blue-600':'text-red-600'}">${money(grossProfit)}</span></div>
      <p class="text-[10px] text-gray-400 pt-1">${sales.length} sales in range</p>
    </div>
    ${topProductsHtml(topProds, 'No sales in this range')}`

  document.getElementById('plfrom').onchange = e => { plFrom = e.target.value; renderProfitLoss(el) }
  document.getElementById('plto').onchange   = e => { plTo = e.target.value; renderProfitLoss(el) }
}

async function renderOverview(el) {
  const sevenDaysAgo = last7Days()[0]
  const [products, recentSales] = await Promise.all([
    liveFetch('products'),
    liveFetch('sales', q => q.eq('status', 'completed').gte('sale_date', sevenDaysAgo)),
  ])

  const today   = new Date().toISOString().slice(0, 10)
  const tSales  = recentSales.filter(s => dateKey(s.sale_date) === today)
  const tRev    = tSales.reduce((s, r) => s + (r.total_amount || 0), 0)
  const tCost   = tSales.reduce((s, r) => s + (r.total_cost_amount || 0), 0)
  const tProfit = tRev - tCost
  const avgSale = tSales.length > 0 ? tRev / tSales.length : 0
  const totalStock = products.reduce((s, p) => s + (p.stock_qty || 0), 0)
  const lowCount = products.filter(p => p.stock_qty > 0 && p.stock_qty <= p.reorder_level).length
  const outCount = products.filter(p => p.stock_qty <= 0).length

  // Revenue chart (last 7 days) — recentSales is already scoped to this
  // exact window, so no extra fetch needed.
  const days = last7Days()
  const dayRevs = days.map(d => {
    const r = recentSales.filter(s => dateKey(s.sale_date) === d).reduce((s, x) => s + (x.total_amount || 0), 0)
    return { day: d, rev: r }
  })
  const maxRev = Math.max(...dayRevs.map(d => d.rev), 1)

  // Payment method breakdown + top products (today) — only fetched if
  // there were any sales today, to avoid an empty .in() call.
  const todaySaleIds = tSales.map(s => s.id)
  const [tPayments, tItems] = todaySaleIds.length
    ? await Promise.all([
        liveFetch('payments', q => q.in('sale_id', todaySaleIds)),
        liveFetch('sale_items', q => q.in('sale_id', todaySaleIds)),
      ])
    : [[], []]

  const byMethod = {}
  tPayments.forEach(p => { const m = p.method || 'cash'; byMethod[m] = (byMethod[m] || 0) + p.amount })

  const byProduct = {}
  tItems.forEach(i => { byProduct[i.product_name] = (byProduct[i.product_name] || 0) + i.line_total })
  const topProds = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 5)

  el.innerHTML = `
    <!-- KPI tiles -->
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div class="bg-white rounded-xl p-3.5 shadow-sm">
        <p class="text-[10px] text-gray-400 uppercase">Today's Revenue</p>
        <p class="text-xl font-bold text-green-600">${money(tRev)}</p>
        <p class="text-[10px] text-gray-400">${tSales.length} sales</p>
      </div>
      <div class="bg-white rounded-xl p-3.5 shadow-sm">
        <p class="text-[10px] text-gray-400 uppercase">Today's Profit</p>
        <p class="text-xl font-bold ${tProfit >= 0 ? 'text-blue-600' : 'text-red-600'}">${money(tProfit)}</p>
        <p class="text-[10px] text-gray-400">avg ${money(avgSale)}/sale</p>
      </div>
      <div class="bg-white rounded-xl p-3.5 shadow-sm">
        <p class="text-[10px] text-gray-400 uppercase">Total Stock</p>
        <p class="text-xl font-bold text-slate-700">${fmt(totalStock)}</p>
        <p class="text-[10px] text-gray-400">${products.length} products</p>
      </div>
      <div class="bg-white rounded-xl p-3.5 shadow-sm">
        <p class="text-[10px] text-gray-400 uppercase">Alerts</p>
        <p class="text-xl font-bold ${outCount > 0 ? 'text-red-600' : lowCount > 0 ? 'text-amber-600' : 'text-green-600'}">${outCount + lowCount}</p>
        <p class="text-[10px] text-gray-400">${outCount} out · ${lowCount} low</p>
      </div>
    </div>

    <!-- 7-day revenue chart -->
    <div class="bg-white rounded-xl p-4 shadow-sm mb-4">
      <h3 class="text-xs font-semibold text-gray-700 mb-3">Last 7 Days Revenue</h3>
      <div class="flex items-end gap-1 h-24">
        ${dayRevs.map(d => {
          const h = Math.max(4, (d.rev / maxRev) * 100)
          const isToday = d.day === today
          return `<div class="flex-1 flex flex-col items-center gap-1">
            <span class="text-[8px] text-gray-400">${d.rev > 0 ? money(d.rev) : ''}</span>
            <div class="w-full rounded-t ${isToday ? 'bg-blue-500' : 'bg-blue-200'}" style="height:${h}%"></div>
            <span class="text-[8px] ${isToday ? 'text-blue-600 font-bold' : 'text-gray-400'}">${d.day.slice(8)}</span>
          </div>`
        }).join('')}
      </div>
    </div>

    <!-- Payment breakdown + Top products -->
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div class="bg-white rounded-xl p-3.5 shadow-sm">
        <h3 class="text-xs font-semibold text-gray-700 mb-2">By Payment</h3>
        ${Object.keys(byMethod).length === 0 ? '<p class="text-[10px] text-gray-400">No sales today</p>' :
          Object.entries(byMethod).map(([m, v]) =>
            `<div class="flex justify-between py-1 border-b border-gray-50">
              <span class="text-xs text-gray-600 capitalize">${m}</span>
              <span class="text-xs font-medium text-gray-800">${money(v)}</span>
            </div>`).join('')}
      </div>
      <div class="bg-white rounded-xl p-3.5 shadow-sm">
        <h3 class="text-xs font-semibold text-gray-700 mb-2">Top Products</h3>
        ${topProds.length === 0 ? '<p class="text-[10px] text-gray-400">No sales today</p>' :
          topProds.map(([n, v]) =>
            `<div class="flex justify-between py-1 border-b border-gray-50">
              <span class="text-xs text-gray-600 truncate flex-1 mr-2">${n}</span>
              <span class="text-xs font-medium text-green-600">${money(v)}</span>
            </div>`).join('')}
      </div>
    </div>`
}

async function renderStock(el) {
  const products = await liveFetch('products')
  const sorted = [...products].sort((a, b) => a.stock_qty - b.stock_qty)

  el.innerHTML = `
    <div class="mb-3"><input id="sq" class="w-full bg-white border rounded-lg px-3 py-2 text-sm" placeholder="Search products..."></div>
    <div id="slist" class="space-y-2">
      ${sorted.map(p => {
        const out = p.stock_qty <= 0, low = !out && p.stock_qty <= p.reorder_level
        const badge = out ? 'bg-red-100 text-red-700' : low ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
        const upb = p.units_per_bulk || 1
        const isBulkOnly = p.pricing_mode === 'bulk'
        const isBoth = p.pricing_mode === 'both' && upb > 1
        const displayUnit = isBulkOnly ? (p.bulk_unit || p.unit || 'pcs') : (p.unit || 'pcs')
        const packLine = isBoth ? `<span class="text-[10px] text-gray-400 ml-1">(${(p.stock_qty/upb).toFixed(1)} ${p.bulk_unit})</span>` : ''
        const price = isBulkOnly ? (p.bulk_selling_price || p.selling_price || 0) : (p.selling_price || 0)
        const priceUnit = isBulkOnly ? (p.bulk_unit || 'pk') : (p.unit || 'pc')
        return `
          <div class="bg-white rounded-xl px-4 py-3 shadow-sm srow" data-n="${(p.name||'').toLowerCase()}">
            <div class="flex justify-between items-start">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-800 truncate">${p.name}</p>
                <p class="text-[10px] text-gray-400">${p.sku || ''} · ${money(price)}/${priceUnit}</p>
              </div>
              <div class="text-right ml-3 flex-shrink-0">
                <span class="text-[10px] px-2 py-0.5 rounded-full ${badge}">${out?'Out':low?'Low':'OK'}</span>
                <p class="text-xs font-semibold text-gray-700 mt-1">${p.stock_qty} ${displayUnit}${packLine}</p>
              </div>
            </div>
          </div>`
      }).join('')}
    </div>`

  document.getElementById('sq').oninput = e => {
    const q = e.target.value.toLowerCase()
    document.querySelectorAll('.srow').forEach(r => r.style.display = r.dataset.n.includes(q) ? '' : 'none')
  }
}

async function renderSales(el) {
  const d = new Date(); d.setDate(d.getDate() - 13)
  const fourteenDaysAgo = d.toISOString().slice(0, 10)
  const done = await liveFetch('sales', q => q.eq('status', 'completed').gte('sale_date', fourteenDaysAgo).order('sale_date', { ascending: false }))

  // Group by date
  const groups = {}
  done.forEach(s => { const dk = dateKey(s.sale_date); if (!groups[dk]) groups[dk] = []; groups[dk].push(s) })
  const dates = Object.keys(groups).sort().reverse()

  el.innerHTML = dates.length === 0
    ? '<div class="text-center py-12 text-gray-400"><p class="text-sm">No sales in the last 14 days</p><p class="text-xs mt-1">Pull down or tap Refresh</p></div>'
    : dates.map(dk => {
        const daySales = groups[dk]
        const dayTotal = daySales.reduce((s, x) => s + (x.total_amount || 0), 0)
        const today = new Date().toISOString().slice(0, 10)
        const label = dk === today ? 'Today' : dk
        return `
          <div class="mb-4">
            <div class="flex justify-between items-center mb-2">
              <span class="text-xs font-semibold text-gray-700">${label}</span>
              <span class="text-xs font-bold text-green-600">${money(dayTotal)} · ${daySales.length} sales</span>
            </div>
            <div class="space-y-1.5">
              ${daySales.map(s => `
                <div class="bg-white rounded-lg px-3 py-2.5 shadow-sm flex justify-between items-center">
                  <div>
                    <p class="text-xs font-medium text-gray-700">${s.receipt_no || '—'}</p>
                    <p class="text-[10px] text-gray-400">${(s.sale_date||'').slice(11, 16)}</p>
                  </div>
                  <p class="text-sm font-bold text-green-600">${money(s.total_amount)}</p>
                </div>`).join('')}
            </div>
          </div>`
      }).join('')
}

async function renderAlerts(el) {
  const products = await liveFetch('products')
  const out = products.filter(p => p.stock_qty <= 0).sort((a, b) => a.name.localeCompare(b.name))
  const low = products.filter(p => p.stock_qty > 0 && p.stock_qty <= p.reorder_level).sort((a, b) => a.stock_qty - b.stock_qty)

  el.innerHTML = `
    ${out.length > 0 ? `
      <div class="bg-red-50 rounded-xl p-4 mb-3">
        <h3 class="text-xs font-bold text-red-700 mb-2">⚠ Out of Stock (${out.length})</h3>
        ${out.map(p => `
          <div class="flex justify-between py-1.5 border-b border-red-100 last:border-0">
            <span class="text-xs text-red-800">${p.name}</span>
            <span class="text-[10px] text-red-500 font-semibold">REORDER NOW</span>
          </div>`).join('')}
      </div>` : ''}

    ${low.length > 0 ? `
      <div class="bg-amber-50 rounded-xl p-4 mb-3">
        <h3 class="text-xs font-bold text-amber-700 mb-2">⚡ Low Stock (${low.length})</h3>
        ${low.map(p => {
          const upb = p.units_per_bulk || 1
          const isBoth = p.pricing_mode === 'both' && upb > 1
          const unit = p.pricing_mode === 'bulk' ? (p.bulk_unit || p.unit) : p.unit
          const packs = isBoth ? ` (${(p.stock_qty/upb).toFixed(1)} ${p.bulk_unit})` : ''
          return `
            <div class="flex justify-between py-1.5 border-b border-amber-100 last:border-0">
              <span class="text-xs text-amber-800">${p.name}</span>
              <span class="text-xs text-amber-600 font-medium">${p.stock_qty} ${unit}${packs}</span>
            </div>`
        }).join('')}
      </div>` : ''}

    ${out.length === 0 && low.length === 0 ? `
      <div class="text-center py-16">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
        </div>
        <p class="text-sm font-medium text-green-700">All stock levels healthy</p>
        <p class="text-xs text-gray-400 mt-1">No alerts right now</p>
      </div>` : ''}`
}

// ─── Service Worker + Notifications ─────────────────────
let swReg = null
async function regSW() {
  if (!('serviceWorker' in navigator)) return
  try { swReg = await navigator.serviceWorker.register('./sw.js') } catch {}
}

// ─── Boot ───────────────────────────────────────────────
async function boot() {
  await openIDB()
  await regSW()
  const c = getCfg()
  if (c?.url && c?.key) { initSB(c); await renderApp() }
  else renderSetup()
}
boot()
