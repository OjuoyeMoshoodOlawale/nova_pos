// ═══════════════════════════════════════════════════════
// NovaPOS Mobile — Service Worker
// Handles offline caching + periodic low-stock checks
// with browser push notifications.
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'novapos-v3'
// Relative, not absolute — this PWA can be hosted under a subpath (e.g.
// GitHub Pages serves it at /nova_pos/, not domain root), and an absolute
// "/index.html" resolves to the WRONG url in that case (404s, breaking the
// install/offline cache entirely).
const ASSETS = ['./', './index.html', './app.js', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png']

// ─── Install: cache app shell ───────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)))
  self.skipWaiting()
})

// ─── Activate: clean old caches ─────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

// ─── Fetch: serve from cache, fall back to network ──────
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  )
})

// ─── Periodic stock check (triggered by main app) ───────
self.addEventListener('message', async e => {
  if (e.data?.type === 'CHECK_STOCK') {
    const { url, key } = e.data
    if (!url || !key) return
    try {
      await checkLowStock(url, key)
    } catch (err) {
      console.warn('[SW] Stock check failed:', err)
    }
  }
})

async function checkLowStock(url, key) {
  // Fetch products where stock_qty <= reorder_level (low or out)
  const resp = await fetch(
    `${url}/rest/v1/products?select=id,name,stock_qty,reorder_level,bulk_unit,pricing_mode&stock_qty=lte.reorder_level&is_active=eq.1`,
    { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
  )
  if (!resp.ok) return

  const items = await resp.json()
  if (!items.length) return

  // Check which items are NEW alerts (not already notified)
  const notifiedKey = 'novapos_notified_ids'
  // Service workers can't use localStorage, so we use IndexedDB via a simple cache
  const prevNotified = await getNotifiedIds()
  const newAlerts = items.filter(p => !prevNotified.has(p.id))

  if (newAlerts.length === 0) return

  // Group into out-of-stock and low-stock
  const outItems = newAlerts.filter(p => p.stock_qty <= 0)
  const lowItems = newAlerts.filter(p => p.stock_qty > 0)

  // Fire notification
  if (outItems.length > 0) {
    const names = outItems.slice(0, 3).map(p => p.name).join(', ')
    const extra = outItems.length > 3 ? ` +${outItems.length - 3} more` : ''
    self.registration.showNotification('Out of Stock!', {
      body: `${names}${extra} — need to reorder now`,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'novapos-out-of-stock',
      data: { url: './' },
      vibrate: [200, 100, 200],
    })
  }

  if (lowItems.length > 0) {
    const names = lowItems.slice(0, 3).map(p => p.name).join(', ')
    const extra = lowItems.length > 3 ? ` +${lowItems.length - 3} more` : ''
    self.registration.showNotification('Low Stock Alert', {
      body: `${names}${extra} — running low, consider reordering`,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'novapos-low-stock',
      data: { url: './' },
    })
  }

  // Remember notified IDs so we don't spam
  await saveNotifiedIds(new Set([...prevNotified, ...newAlerts.map(p => p.id)]))
}

// ─── Simple IndexedDB for notified IDs ──────────────────
function openNotifyDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('novapos_sw', 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore('meta', { keyPath: 'key' })
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

async function getNotifiedIds() {
  try {
    const db = await openNotifyDB()
    return new Promise(resolve => {
      const tx = db.transaction('meta', 'readonly')
      const req = tx.objectStore('meta').get('notified_ids')
      req.onsuccess = () => resolve(new Set(req.result?.value || []))
      req.onerror = () => resolve(new Set())
    })
  } catch { return new Set() }
}

async function saveNotifiedIds(ids) {
  try {
    const db = await openNotifyDB()
    const tx = db.transaction('meta', 'readwrite')
    tx.objectStore('meta').put({ key: 'notified_ids', value: [...ids] })
  } catch { /* non-fatal */ }
}

// ─── Handle notification click — open the app ───────────
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(cls => {
      if (cls.length > 0) return cls[0].focus()
      return clients.openWindow('./')
    })
  )
})
