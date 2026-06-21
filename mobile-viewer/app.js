// ═══════════════════════════════════════════════════════════
// NovaPOS Mobile Store Monitor v2 — PWA
// Read-only dashboard for store owners. Pulls from Supabase,
// caches in IndexedDB, works offline, push notifications.
// ═══════════════════════════════════════════════════════════

const APP = document.getElementById('app')
const DB_NAME = 'novapos_mobile'
const DB_VER = 2
const TABLES = ['products','sales','sale_items','payments','customers','categories','stock_adjustments']
const REFRESH_MS = 5 * 60 * 1000  // auto-refresh every 5 min

// ─── IndexedDB ──────────────────────────────────────────
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
function idbPut(store, data) {
  return new Promise((r, j) => { const tx = idb.transaction(store, 'readwrite'); const os = tx.objectStore(store); for (const row of data) os.put(row); tx.oncomplete = r; tx.onerror = () => j(tx.error) })
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
const initSB = c => { sb = supabase.createClient(c.url, c.key) }

async function pullData(cb) {
  let total = 0
  for (const t of TABLES) {
    cb?.(`Syncing ${t}...`)
    try {
      const { data, error } = await sb.from(t).select('*').eq('mobile_synced', false).limit(500)
      if (error || !data?.length) continue
      await idbPut(t, data)
      total += data.length
      const ids = data.map(r => r.id)
      await sb.from(t).update({ mobile_synced: true }).in('id', ids)
    } catch (e) { console.warn(`Pull ${t}:`, e) }
  }
  await idbMeta('last_sync', new Date().toISOString())
  return total
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
    const url = document.getElementById('su').value.trim()
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

async function renderApp() {
  const c = getCfg()
  APP.innerHTML = `
    <header class="bg-blue-700 text-white px-4 pt-10 pb-4 rounded-b-2xl">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-blue-200 text-xs">${greeting()}</p>
          <h1 class="text-lg font-bold">${c.name}</h1>
        </div>
        <div class="flex gap-2">
          <button id="bsync" class="bg-blue-600 rounded-lg px-3 py-1.5 text-xs flex items-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Sync</button>
          <button id="bcfg" class="bg-blue-600 rounded-lg p-1.5">
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
    <main id="content" class="p-4 pb-20"></main>`

  // Tab switching
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    tab = b.dataset.t
    document.querySelectorAll('[data-t]').forEach(x => { x.className = `flex-1 py-3 text-xs font-medium text-center ${x.dataset.t===tab?'tab-active':'text-gray-400'}` })
    renderTab()
  })

  // Sync button
  document.getElementById('bsync').onclick = async () => {
    const el = document.getElementById('syncst')
    el.textContent = 'Syncing...'
    try { const n = await pullData(m => el.textContent = m); el.textContent = n > 0 ? `Synced ${n} rows` : 'Up to date'; renderTab() }
    catch (e) { el.textContent = 'Sync failed' }
  }

  // Settings
  document.getElementById('bcfg').onclick = () => { if (confirm('Disconnect from this store?')) { localStorage.removeItem('novapos_cfg'); renderSetup() } }

  // Initial sync
  try {
    const n = await pullData(m => document.getElementById('syncst').textContent = m)
    const ls = await idbMeta('last_sync')
    document.getElementById('syncst').textContent = n > 0 ? `Synced ${n} rows` : `Last sync ${ago(ls)}`
  } catch { document.getElementById('syncst').textContent = 'Offline — showing cached data' }

  // Auto-refresh
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = setInterval(async () => {
    try { await pullData(); renderTab() } catch {}
  }, REFRESH_MS)

  // Low-stock check via SW
  if (swReg?.active) swReg.active.postMessage({ type: 'CHECK_STOCK', url: c.url, key: c.key })

  renderTab()
}

// ─── Tab renderers ──────────────────────────────────────
async function renderTab() {
  const el = document.getElementById('content')
  if (!el) return
  switch (tab) {
    case 'overview': return renderOverview(el)
    case 'stock':    return renderStock(el)
    case 'sales':    return renderSales(el)
    case 'alerts':   return renderAlerts(el)
  }
}

async function renderOverview(el) {
  const products = await idbGetAll('products')
  const sales    = await idbGetAll('sales')
  const payments = await idbGetAll('payments')
  const items    = await idbGetAll('sale_items')

  const today   = new Date().toISOString().slice(0, 10)
  const done    = sales.filter(s => s.status === 'completed')
  const tSales  = done.filter(s => dateKey(s.sale_date) === today)
  const tRev    = tSales.reduce((s, r) => s + (r.total_amount || 0), 0)
  const tCost   = tSales.reduce((s, r) => s + (r.total_cost_amount || 0), 0)
  const tProfit = tRev - tCost
  const avgSale = tSales.length > 0 ? tRev / tSales.length : 0
  const totalStock = products.reduce((s, p) => s + (p.stock_qty || 0), 0)
  const lowCount = products.filter(p => p.stock_qty > 0 && p.stock_qty <= p.reorder_level).length
  const outCount = products.filter(p => p.stock_qty <= 0).length

  // Revenue chart (last 7 days)
  const days = last7Days()
  const dayRevs = days.map(d => {
    const r = done.filter(s => dateKey(s.sale_date) === d).reduce((s, x) => s + (x.total_amount || 0), 0)
    return { day: d, rev: r }
  })
  const maxRev = Math.max(...dayRevs.map(d => d.rev), 1)

  // Payment method breakdown (today)
  const tPayments = payments.filter(p => tSales.some(s => s.id === p.sale_id))
  const byMethod = {}
  tPayments.forEach(p => { const m = p.method || 'cash'; byMethod[m] = (byMethod[m] || 0) + p.amount })

  // Top 5 products by revenue (today)
  const tItems = items.filter(i => tSales.some(s => s.id === i.sale_id))
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
  const products = await idbGetAll('products')
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
  const sales = await idbGetAll('sales')
  const done = sales.filter(s => s.status === 'completed').sort((a, b) => (b.sale_date||'').localeCompare(a.sale_date||''))

  // Group by date
  const groups = {}
  done.forEach(s => { const d = dateKey(s.sale_date); if (!groups[d]) groups[d] = []; groups[d].push(s) })
  const dates = Object.keys(groups).sort().reverse().slice(0, 14)

  el.innerHTML = dates.length === 0
    ? '<div class="text-center py-12 text-gray-400"><p class="text-sm">No sales synced yet</p><p class="text-xs mt-1">Tap Sync to pull data</p></div>'
    : dates.map(d => {
        const daySales = groups[d]
        const dayTotal = daySales.reduce((s, x) => s + (x.total_amount || 0), 0)
        const today = new Date().toISOString().slice(0, 10)
        const label = d === today ? 'Today' : d
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
  const products = await idbGetAll('products')
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
  try { swReg = await navigator.serviceWorker.register('/sw.js') } catch {}
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
