# NovaPOS Deployment Guide

## Pre-deployment checklist

### On the customer's PC

1. **Install NovaPOS**
   ```
   git clone https://github.com/OjuoyeMoshoodOlawale/nova_pos.git
   cd nova_pos
   npm install
   npm run dev          # test first
   npm run build        # then build for production
   ```

2. **Printer setup (Xprinter XP-T80Q or similar 80mm)**
   - Download driver: https://www.xprintertech.com/drivers-2
   - Install → select USB port → finish
   - Windows → Settings → Printers → Xprinter → Printing preferences:
     - Paper Size: **80 × 297mm** (NOT A4)
     - Margins: **None / 0**
   - In NovaPOS: Settings → Printer → select the Xprinter
   - Print a test receipt to verify

3. **First-run wizard**
   - Business name, address, phone
   - Tax rate (e.g. 7.5% VAT)
   - Admin password (strong)
   - Create cashier accounts

4. **Dry run test** (do ALL of these before going live):
   - [ ] Add a bulk product (e.g. Indomie, 40 pcs per carton)
   - [ ] Add a pieces-only product (e.g. Coca-Cola)
   - [ ] Receive stock for both (use Receive Stock button, NOT Adjust)
   - [ ] Make a unit sale → verify receipt prints + stock deducts
   - [ ] Make a bulk sale (1 carton) → verify 40 pieces deducted
   - [ ] Void a sale → verify stock restored
   - [ ] Check Dashboard → Insights → Stock Movement:
     - Purchased should match what you received
     - Sold should match what you sold
     - Remaining = Purchased - Sold
   - [ ] Backup Now → verify .novaenc file appears

---

## Cloud sync setup (per customer)

### Step 1: Create a Supabase project

1. Go to https://supabase.com → sign up (free tier)
2. Create a new project (name: the store name, e.g. "Mama Titi Shop")
3. Wait for project to initialize (~2 min)

### Step 2: Run the schema

1. In Supabase, go to **SQL Editor**
2. Open `docs/supabase_schema.sql` from the NovaPOS repo
3. Paste the entire SQL and click **Run**
4. Verify: go to **Table Editor** — you should see all tables

### Step 3: Get credentials

1. In Supabase, go to **Settings → API**
2. Copy:
   - **Project URL** (e.g. `https://abcdef.supabase.co`)
   - **anon public key** (starts with `eyJ...`)

### Step 4: Connect NovaPOS

1. In NovaPOS: **Settings → Cloud Sync**
2. Paste the Project URL and anon key
3. Set sync interval (default 300 = 5 minutes)
4. Check **Enable sync**
5. Click **Save Settings**
6. Click **Sync Now** → should show "Synced X rows"

### Step 5: Verify sync

1. In Supabase **Table Editor**, open `products`
2. You should see the store's products with all columns
3. `mobile_synced` should be `false` (ready for mobile to pull)

---

## Mobile viewer setup

### Option A: Host on Supabase (free)

Not available on Supabase free tier for static hosting. Use Option B.

### Option B: Host on Vercel/Netlify (free)

1. Create a repo with just the `mobile-viewer/` folder contents
2. Deploy to Vercel: `npx vercel` (or connect the repo)
3. Share the URL with the store owner (e.g. `https://my-store.vercel.app`)

### Option C: Local file (simplest)

1. Copy `mobile-viewer/` folder to the owner's phone
2. Open `index.html` in Chrome
3. Chrome → menu → "Add to Home Screen"

### First-time setup on mobile

1. Open the app URL or local file
2. Enter the same Supabase URL + anon key
3. Enter the store name
4. Tap **Connect**
5. Data syncs automatically — owner sees Overview, Stock, Sales, Alerts

---

## Architecture diagram

```
┌─────────────────────┐
│   NovaPOS (PC)      │
│   Electron + SQLite  │
│                     │
│ Every INSERT/UPDATE │
│ → trigger sets      │
│   is_sync = 0       │
│                     │
│ Sync engine (5min)  │──push dirty──▶  ┌──────────────────┐
│ finds is_sync = 0   │                │  Supabase Cloud   │
│ pushes to Supabase  │                │  (Postgres)       │
│ sets is_sync = 1    │                │                    │
└─────────────────────┘                │  mobile_synced     │
                                       │  = false (new)     │
                                       │  = true (pulled)   │
┌─────────────────────┐                │                    │
│   Mobile Viewer     │◀──pull new────│                    │
│   PWA + IndexedDB   │  set mobile_  │                    │
│                     │  synced=true  └──────────────────┘
│ Tabs:               │
│ • Overview (revenue)│
│ • Stock (all items) │
│ • Sales (history)   │
│ • Alerts (low/out)  │
└─────────────────────┘
```

## Sync fields

| Field | Where | Meaning |
|---|---|---|
| `is_sync` | Local SQLite | 0 = dirty (changed), 1 = pushed to cloud |
| `mobile_synced` | Supabase | false = new data, true = pulled to mobile |

### Sync flow:
1. Cashier sells → trigger sets `is_sync = 0`
2. Sync engine (every 5 min or when online) → pushes to Supabase → sets `is_sync = 1`
3. Mobile opens → pulls where `mobile_synced = false` → caches in IndexedDB → sets `mobile_synced = true`

### No data left behind:
- 11 tables have `is_sync`: categories, suppliers, products, customers, sales, sale_items, payments, stock_adjustments, purchase_orders, purchase_order_items, activity_log
- All 11 have corresponding Supabase tables with `mobile_synced`
- SQLite triggers auto-mark dirty on INSERT and UPDATE — no service code changes needed

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Insights dashboard spins forever | Pull latest code + restart (migration 009 adds required column) |
| Receipt prints with big top gap | Set Windows driver paper size to 80×297mm, not A4 |
| Receipt prints endless small pages | Set driver paper size + restart NovaPOS |
| Sync shows 0 rows but data exists | Check Supabase URL/key are correct, check RLS policies |
| Mobile shows "Offline — cached" | Phone has no internet; data from last sync still shows |
| Bulk sale deducts wrong stock | Pull latest code (critical fix in saleService) |
| Inventory doesn't show packs | Product must be "Both ways" or "Bulk only" mode |
