# NovaPOS Store Monitor (Mobile PWA)

A read-only phone dashboard for store owners. It connects to the **same
Supabase project** the desktop app syncs to, pulls rows the desktop has pushed,
caches them in IndexedDB, and works offline after the first sync.

It is a **static PWA** — plain `index.html` + `app.js` + `sw.js`. No build step,
no framework, no `npm install`.

```
mobile-viewer/
  index.html      app shell (loads supabase-js + tailwind from CDN)
  app.js          all logic: setup, sync, tabs, IndexedDB cache, notifications
  sw.js           service worker (offline cache)
  manifest.json   PWA manifest (icons, name, theme)
  icon-192.png    required by Android packaging
  icon-512.png    required by Android packaging
  icon.svg
```

## How the sync works

One-way mirror, three hops:

```
Desktop app  ──push (is_sync)──▶  Supabase  ──pull (mobile_synced)──▶  Phone (IndexedDB)
```

`app.js` queries each table for rows where `mobile_synced = false`, stores them
locally, then sets `mobile_synced = true` so they are not pulled again. Tables
synced: products, sales, sale_items, payments, customers, categories,
stock_adjustments. Auto-refreshes every 5 minutes; manual **Sync** button too.

## 1. Run / test locally

```bash
# from the repo root
npx serve mobile-viewer
# or
cd mobile-viewer && python -m http.server 8080
```

Open the printed URL in Chrome. The service worker and "install" work on
`localhost` (and HTTPS), so local testing is full-featured.

To test on a **real phone over Wi-Fi** (same network):

```bash
npx serve mobile-viewer -l tcp://0.0.0.0:8080
```

Open `http://<your-PC-IP>:8080` on the phone. Note: over plain HTTP the service
worker and notifications will not register — that needs HTTPS hosting (below).

Debug in Chrome DevTools → **Application** tab:
- **IndexedDB → novapos_mobile** — the cached rows
- **Service Workers** — registration/update
- toggle the device toolbar for a phone-sized view

## 2. Connect to Supabase

1. In Supabase → **Settings → API**, copy the **Project URL** and the
   **anon public** key.
2. Open the viewer, enter URL + anon key + a store name, tap **Connect**.
   (You can paste either the full `https://<ref>.supabase.co` URL or just the
   project ref — it is normalized automatically.)
3. Tap **Sync**.

For data to appear, the desktop side must already be set up:
- the corrected `docs/supabase_schema.sql` has been run in the Supabase SQL editor, and
- the desktop app's Sync is enabled and has run at least once.

## 3. Host it (HTTPS)

The service worker registers at **`/sw.js`**, so the viewer must be served at the
**root** of a domain or subdomain (e.g. `monitor.yourshop.app`) — not in a
subfolder.

Easiest: drag the `mobile-viewer` folder onto **app.netlify.com/drop** (or import
the repo and set the publish directory to `mobile-viewer`). Vercel and Cloudflare
Pages work the same way. A `netlify.toml` is included so the service worker is
served uncached (so updates roll out immediately).

## 4. Package as an Android app

Once hosted on HTTPS, pick one:

- **Installed PWA (no build):** open the URL in Chrome on Android → menu →
  *Install app*. Runs full-screen like a native app. Good enough for most owners.
- **Real APK/AAB — PWABuilder (recommended):** go to
  [pwabuilder.com](https://www.pwabuilder.com), paste your HTTPS URL, and download
  the generated signed Android package (a Trusted Web Activity). The 192/512 PNG
  icons and manifest here satisfy its requirements.
- **Bubblewrap CLI:** `npm i -g @bubblewrap/cli` then
  `bubblewrap init --manifest https://your-host/manifest.json`.

## Notes

- This app is **read-only**; it never writes store data, only flips
  `mobile_synced` flags on rows it has pulled.
- The anon key is safe to embed in a client because the Supabase tables use
  permissive row-level-security policies intended for this mirror. Do **not** put
  the service-role key here.
