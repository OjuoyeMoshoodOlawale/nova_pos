// ═══════════════════════════════════════════════════════════
// NovaPOS Mobile Store Monitor — PWA
// Read-only dashboard that pulls from the store's Supabase.
// Works offline (caches data in IndexedDB).
// ═══════════════════════════════════════════════════════════

const APP = document.getElementById('app')
const DB_NAME = 'novapos_mobile'
const DB_VERSION = 1
const TABLES = ['products','sales','sale_items','payments','customers','categories','stock_adjustments']

// ─── IndexedDB cache ────────────────────────────────────
let idb = null
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      for (const t of TABLES) {
        if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('_meta')) db.createObjectStore('_meta', { keyPath: 'key' })
    }
    req.onsuccess = e => { idb = e.target.result; resolve(idb) }
    req.onerror = () => reject(req.error)
  })
}

function idbPut(store, data) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    for (const row of data) os.put(row)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

function idbGetAll(store) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGetMeta(key) {
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction('_meta', 'readonly')
      const req = tx.objectStore('_meta').get(key)
      req.onsuccess = () => resolve(req.result?.value ?? null)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

function idbSetMeta(key, value) {
  return new Promise((resolve) => {
    const tx = idb.transaction('_meta', 'readwrite')
    tx.objectStore('_meta').put({ key, value })
    tx.oncomplete = resolve
    tx.onerror = resolve
  })
}

// ─── Supabase connection ────────────────────────────────
let sb = null
function getConfig() {
  try { return JSON.parse(localStorage.getItem('novapos_config') || 'null') } catch { return null }
}
function saveConfig(cfg) { localStorage.setItem('novapos_config', JSON.stringify(cfg)) }

function initSupabase(cfg) {
  sb = supabase.createClient(cfg.url, cfg.key)
}

// ─── Pull unsynced data from Supabase ───────────────────
async function pullData(statusCb) {
  let total = 0
  for (const table of TABLES) {
    statusCb?.(`Syncing ${table}...`)
    try {
      // Pull rows where mobile_synced = false
      const { data, error } = await sb.from(table).select('*').eq('mobile_synced', false).limit(500)
      if (error) { console.warn(`Pull ${table}:`, error.message); continue }
      if (!data || data.length === 0) continue

      // Cache locally
      await idbPut(table, data)
      total += data.length

      // Mark as synced in Supabase
      const ids = data.map(r => r.id)
      await sb.from(table).update({ mobile_synced: true }).in('id', ids)
    } catch (e) { console.warn(`Pull ${table}:`, e) }
  }
  await idbSetMeta('last_sync', new Date().toISOString())
  return total
}

// ─── Format helpers ─────────────────────────────────────
function fmt(n) { return new Intl.NumberFormat('en-NG').format(n) }
function fmtM(n) { return '\u20A6' + fmt(Math.round(n)) }  // ₦
function ago(iso) {
  if (!iso) return 'never'
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return 'just now'
  if (d < 3600) return Math.floor(d / 60) + 'm ago'
  if (d < 86400) return Math.floor(d / 3600) + 'h ago'
  return Math.floor(d / 86400) + 'd ago'
}

// ─── Render: Setup screen ───────────────────────────────
function renderSetup() {
  APP.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-6">
      <div class="bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm space-y-4">
        <div class="text-center">
          <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg>
          </div>
          <h1 class="text-xl font-bold text-gray-800">NovaPOS Monitor</h1>
          <p class="text-sm text-gray-500 mt-1">Connect to your store's cloud database</p>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Supabase Project URL</label>
          <input id="cfg-url" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="https://xxxxx.supabase.co">
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Anon Key</label>
          <input id="cfg-key" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-xs" placeholder="eyJhbGciOiJIUzI1NiIs...">
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Store Name</label>
          <input id="cfg-name" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="My Shop">
        </div>
        <button id="btn-connect" class="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium">Connect</button>
      </div>
    </div>`
  document.getElementById('btn-connect').onclick = async () => {
    const url = document.getElementById('cfg-url').value.trim()
    const key = document.getElementById('cfg-key').value.trim()
    const name = document.getElementById('cfg-name').value.trim() || 'My Store'
    if (!url || !key) return alert('Please enter both URL and key')
    saveConfig({ url, key, name })
    initSupabase({ url, key })
    await renderDashboard()
  }
}

// ─── Render: Dashboard ──────────────────────────────────
let currentTab = 'overview'

async function renderDashboard() {
  const cfg = getConfig()
  APP.innerHTML = `
    <div class="bg-blue-700 text-white px-4 pt-10 pb-4 rounded-b-2xl">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-blue-200 text-xs">Store Monitor</p>
          <h1 class="text-lg font-bold">${cfg.name}</h1>
        </div>
        <button id="btn-sync" class="bg-blue-600 rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          Sync
        </button>
      </div>
      <p id="sync-status" class="text-blue-200 text-[10px] mt-1">Loading...</p>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-gray-100 bg-white sticky top-0 z-10">
      <button data-tab="overview" class="flex-1 py-3 text-xs font-medium text-center tab-active">Overview</button>
      <button data-tab="stock" class="flex-1 py-3 text-xs font-medium text-center text-gray-400">Stock</button>
      <button data-tab="sales" class="flex-1 py-3 text-xs font-medium text-center text-gray-400">Sales</button>
      <button data-tab="alerts" class="flex-1 py-3 text-xs font-medium text-center text-gray-400">Alerts</button>
    </div>

    <div id="tab-content" class="p-4 space-y-4 pb-20"></div>

    <!-- Settings gear -->
    <button id="btn-settings" class="fixed bottom-4 right-4 bg-white shadow-lg rounded-full w-10 h-10 flex items-center justify-center">
      <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
    </button>`

  // Tab switching
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = () => {
      currentTab = btn.dataset.tab
      document.querySelectorAll('[data-tab]').forEach(b => {
        b.classList.toggle('tab-active', b.dataset.tab === currentTab)
        b.classList.toggle('text-gray-400', b.dataset.tab !== currentTab)
      })
      renderTabContent()
    }
  })

  // Sync button
  document.getElementById('btn-sync').onclick = async () => {
    const el = document.getElementById('sync-status')
    el.textContent = 'Syncing...'
    try {
      const count = await pullData(msg => el.textContent = msg)
      el.textContent = count > 0 ? `Synced ${count} rows just now` : 'Everything up to date'
      renderTabContent()
    } catch (e) {
      el.textContent = 'Sync failed: ' + e.message
    }
  }

  // Settings gear
  document.getElementById('btn-settings').onclick = () => {
    if (confirm('Disconnect from this store?')) {
      localStorage.removeItem('novapos_config')
      renderSetup()
    }
  }

  // Initial sync + render
  try {
    const count = await pullData(msg => {
      document.getElementById('sync-status').textContent = msg
    })
    const lastSync = await idbGetMeta('last_sync')
    document.getElementById('sync-status').textContent =
      count > 0 ? `Synced ${count} rows` : `Up to date · last sync ${ago(lastSync)}`
  } catch (e) {
    document.getElementById('sync-status').textContent = 'Offline — showing cached data'
  }

  renderTabContent()
}

// ─── Tab content renderers ──────────────────────────────
async function renderTabContent() {
  const el = document.getElementById('tab-content')
  switch (currentTab) {
    case 'overview': return renderOverview(el)
    case 'stock':    return renderStock(el)
    case 'sales':    return renderSales(el)
    case 'alerts':   return renderAlerts(el)
  }
}

async function renderOverview(el) {
  const products = await idbGetAll('products')
  const sales = await idbGetAll('sales')
  const payments = await idbGetAll('payments')

  const today = new Date().toISOString().slice(0, 10)
  const todaySales = sales.filter(s => s.sale_date?.startsWith(today) && s.status === 'completed')
  const todayRevenue = todaySales.reduce((s, r) => s + (r.total_amount || 0), 0)
  const totalStock = products.reduce((s, p) => s + (p.stock_qty || 0), 0)
  const lowStock = products.filter(p => p.stock_qty > 0 && p.stock_qty <= p.reorder_level).length
  const outOfStock = products.filter(p => p.stock_qty <= 0).length

  el.innerHTML = `
    <div class="grid grid-cols-2 gap-3">
      <div class="bg-white rounded-xl p-4 shadow-sm">
        <p class="text-[10px] text-gray-400 uppercase">Today's Revenue</p>
        <p class="text-xl font-bold text-green-600 mt-1">${fmtM(todayRevenue)}</p>
        <p class="text-[10px] text-gray-400 mt-1">${todaySales.length} sales</p>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-sm">
        <p class="text-[10px] text-gray-400 uppercase">Total Stock</p>
        <p class="text-xl font-bold text-blue-600 mt-1">${fmt(totalStock)}</p>
        <p class="text-[10px] text-gray-400 mt-1">${products.length} products</p>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-sm">
        <p class="text-[10px] text-gray-400 uppercase">Low Stock</p>
        <p class="text-xl font-bold text-amber-600 mt-1">${lowStock}</p>
        <p class="text-[10px] text-gray-400 mt-1">items near reorder</p>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-sm">
        <p class="text-[10px] text-gray-400 uppercase">Out of Stock</p>
        <p class="text-xl font-bold text-red-600 mt-1">${outOfStock}</p>
        <p class="text-[10px] text-gray-400 mt-1">items to reorder</p>
      </div>
    </div>

    <div class="bg-white rounded-xl p-4 shadow-sm">
      <h3 class="text-xs font-semibold text-gray-800 mb-3">Top Sellers Today</h3>
      ${todaySales.length === 0 ? '<p class="text-xs text-gray-400">No sales yet today</p>' :
        todaySales.slice(0, 5).map(s => `
          <div class="flex justify-between py-1.5 border-b border-gray-50">
            <span class="text-xs text-gray-700">${s.receipt_no || '—'}</span>
            <span class="text-xs font-medium text-green-600">${fmtM(s.total_amount)}</span>
          </div>`).join('')}
    </div>`
}

async function renderStock(el) {
  const products = await idbGetAll('products')
  const sorted = [...products].sort((a, b) => a.stock_qty - b.stock_qty)

  el.innerHTML = `
    <div class="bg-white rounded-xl shadow-sm overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-100">
        <input id="stock-search" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Search products...">
      </div>
      <div id="stock-list" class="max-h-[65vh] overflow-y-auto divide-y divide-gray-50">
        ${sorted.map(p => {
          const out = p.stock_qty <= 0
          const low = !out && p.stock_qty <= p.reorder_level
          const badge = out ? 'bg-red-100 text-red-700' : low ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
          const label = out ? 'Out' : low ? 'Low' : 'OK'
          const upb = p.units_per_bulk || 1
          const packs = upb > 1 ? ` (${(p.stock_qty / upb).toFixed(1)} ${p.bulk_unit || 'packs'})` : ''
          return `
            <div class="px-4 py-3 stock-row" data-name="${(p.name||'').toLowerCase()}">
              <div class="flex justify-between items-start">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-800 truncate">${p.name}</p>
                  <p class="text-[10px] text-gray-400">${p.sku || ''}</p>
                </div>
                <div class="text-right ml-3">
                  <span class="text-xs px-2 py-0.5 rounded-full ${badge}">${label}</span>
                  <p class="text-xs text-gray-700 mt-1 font-medium">${p.stock_qty} ${p.unit || 'pcs'}${packs}</p>
                </div>
              </div>
            </div>`
        }).join('')}
      </div>
    </div>`

  document.getElementById('stock-search').oninput = e => {
    const q = e.target.value.toLowerCase()
    document.querySelectorAll('.stock-row').forEach(r => {
      r.style.display = r.dataset.name.includes(q) ? '' : 'none'
    })
  }
}

async function renderSales(el) {
  const sales = await idbGetAll('sales')
  const completed = sales.filter(s => s.status === 'completed').sort((a, b) => (b.sale_date || '').localeCompare(a.sale_date || ''))

  el.innerHTML = `
    <div class="bg-white rounded-xl shadow-sm overflow-hidden">
      <div class="max-h-[70vh] overflow-y-auto divide-y divide-gray-50">
        ${completed.length === 0 ? '<p class="text-xs text-gray-400 p-4">No sales synced yet</p>' :
          completed.slice(0, 50).map(s => `
            <div class="px-4 py-3">
              <div class="flex justify-between">
                <div>
                  <p class="text-sm font-medium text-gray-800">${s.receipt_no || '—'}</p>
                  <p class="text-[10px] text-gray-400">${s.sale_date || ''}</p>
                </div>
                <div class="text-right">
                  <p class="text-sm font-bold text-green-600">${fmtM(s.total_amount)}</p>
                  ${s.discount_amt > 0 ? `<p class="text-[10px] text-amber-500">-${fmtM(s.discount_amt)} disc</p>` : ''}
                </div>
              </div>
            </div>`).join('')}
      </div>
    </div>`
}

async function renderAlerts(el) {
  const products = await idbGetAll('products')
  const out = products.filter(p => p.stock_qty <= 0)
  const low = products.filter(p => p.stock_qty > 0 && p.stock_qty <= p.reorder_level)

  el.innerHTML = `
    ${out.length > 0 ? `
      <div class="bg-red-50 rounded-xl p-4">
        <h3 class="text-xs font-semibold text-red-700 mb-2">Out of Stock (${out.length})</h3>
        ${out.map(p => `
          <div class="flex justify-between py-1.5">
            <span class="text-xs text-red-700">${p.name}</span>
            <span class="text-xs text-red-500 font-medium">0 ${p.unit || 'pcs'}</span>
          </div>`).join('')}
      </div>` : ''}

    ${low.length > 0 ? `
      <div class="bg-amber-50 rounded-xl p-4">
        <h3 class="text-xs font-semibold text-amber-700 mb-2">Low Stock (${low.length})</h3>
        ${low.map(p => {
          const upb = p.units_per_bulk || 1
          const packs = upb > 1 ? ` (${(p.stock_qty / upb).toFixed(1)} ${p.bulk_unit || 'pk'})` : ''
          return `
            <div class="flex justify-between py-1.5">
              <span class="text-xs text-amber-700">${p.name}</span>
              <span class="text-xs text-amber-600 font-medium">${p.stock_qty} ${p.unit || 'pcs'}${packs}</span>
            </div>`
        }).join('')}
      </div>` : ''}

    ${out.length === 0 && low.length === 0 ? `
      <div class="bg-green-50 rounded-xl p-4 text-center">
        <p class="text-sm text-green-700 font-medium">All stock levels healthy</p>
        <p class="text-xs text-green-500 mt-1">No alerts right now</p>
      </div>` : ''}`
}

// ─── Boot ───────────────────────────────────────────────
async function boot() {
  await openIDB()
  const cfg = getConfig()
  if (cfg?.url && cfg?.key) {
    initSupabase(cfg)
    await renderDashboard()
  } else {
    renderSetup()
  }
}

boot()
