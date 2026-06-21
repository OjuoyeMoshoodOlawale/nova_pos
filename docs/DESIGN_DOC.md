# NovaPOS — System Design Document
## Version 1.0 · Pre-Deployment Release

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│ ELECTRON MAIN PROCESS (Node.js)                  │
│                                                   │
│ ┌──────────┐  ┌──────────────┐  ┌─────────────┐ │
│ │ SQLite DB │  │ Service Layer│  │ Sync Engine  │ │
│ │ (wasm)    │←→│ sale/product │──│ → Supabase   │ │
│ │           │  │ /report/sync │  │   (PostgREST)│ │
│ └──────────┘  └──────────────┘  └─────────────┘ │
│       ↑                ↑               ↑         │
│       │         ┌──────┴──────┐        │         │
│       │         │  IPC Bridge │        │         │
│       │         │ (preload.ts)│        │         │
│       │         └──────┬──────┘        │         │
│       │                │               │         │
│ ┌─────┴────────────────┴───────────────┴───────┐ │
│ │ ELECTRON RENDERER (React 18 + Zustand)        │ │
│ │                                                │ │
│ │ ┌─────┐ ┌─────────┐ ┌────────┐ ┌───────────┐ │ │
│ │ │ POS │ │Inventory│ │Reports │ │ Settings  │ │ │
│ │ │Page │ │+ Audit  │ │+ Dash  │ │+ Sync     │ │ │
│ │ └─────┘ └─────────┘ └────────┘ └───────────┘ │ │
│ └────────────────────────────────────────────────┘ │
│                                                     │
│ ┌──────────────┐                                   │
│ │ Printer Svc  │───→ 80mm Thermal (electron-pos)   │
│ └──────────────┘                                   │
└─────────────────────────────────────────────────────┘

         ↕ Supabase REST (every 5 min)

┌──────────────────────────────┐
│ SUPABASE (Postgres + REST)   │
│ mobile_synced = false/true   │
└──────────┬───────────────────┘
           ↕ Pull (on app open)
┌──────────────────────────────┐
│ MOBILE PWA (IndexedDB cache) │
│ Read-only: stock, sales,     │
│ alerts, push notifications   │
└──────────────────────────────┘
```

---

## 2. Data Model — The Stock Truth

### The one rule: `stock_qty` is ALWAYS in the smallest unit (pieces)

| pricing_mode | stock_qty counts | units_per_bulk | Example |
|---|---|---|---|
| `unit` | pieces | 1 | 200 sachets |
| `both` | pieces | N (e.g. 40) | 200 pcs = 5 cartons |
| `bulk` | cartons | 1 | 10 cartons (carton IS the unit) |

### Key product fields

| Field | Purpose | Example |
|---|---|---|
| `pricing_mode` | How this product is sold | 'unit' / 'both' / 'bulk' |
| `unit` | Small unit name | 'pcs' |
| `bulk_unit` | Large unit name | 'carton' |
| `units_per_bulk` | Conversion factor | 40 (1 carton = 40 pcs) |
| `cost_price` | Cost per PIECE | ₦75 |
| `selling_price` | Sell price per PIECE | ₦100 |
| `bulk_buying_price` | Cost per CARTON | ₦3,000 |
| `bulk_selling_price` | Sell price per CARTON | ₦3,600 |
| `stock_qty` | Current stock (always pieces) | 200 |
| `reorder_level` | Alert threshold (always pieces) | 80 |
| `is_sync` | Supabase sync flag | 0=dirty, 1=synced |

### Sale deduction formula

```
piecesOut = (sell_mode === 'bulk')
  ? quantity × units_per_bulk     // 2 cartons × 40 = 80 pieces
  : quantity                      // 5 pieces = 5 pieces

stock_qty -= piecesOut
```

### Void restoration formula (mirrors deduction exactly)

```
piecesBack = (sell_mode === 'bulk')
  ? quantity × units_per_bulk
  : quantity

stock_qty += piecesBack
```

---

## 3. Transaction Safety

All multi-step DB operations use `withTx(db, () => { ... })`:
- BEGIN → execute all steps → COMMIT
- Any error → ROLLBACK (no partial state)

Protected operations:
- `completeSale`: items + stock + adjustments + payments in one transaction
- `voidSale`: status change + restock + adjustments in one transaction
- `receiveStock`: stock update + price switch + adjustment in one transaction

---

## 4. Financial Accuracy

### COGS calculation (3-tier)

```
1. PREFERRED: sales.total_cost_amount (snapshot at sale time)
2. FALLBACK:  SUM(si.quantity × CASE bulk THEN ×upb ELSE 1 × si.cost_price)
3. NEVER:     SUM(si.quantity × si.cost_price) ← the old bug
```

### Revenue exclusions
- Only `status = 'completed'` sales count toward revenue
- Voided sales are excluded from money totals
- Voided sales ARE counted separately for void reports

### Price immutability
- Every sale snapshots: unit_price, cost_price, tax_rate, discount
- Past sales are NEVER recalculated when prices change
- VAT rate snapshotted per sale (tax_rate_applied column)

---

## 5. Sync Architecture

### Data flow (one-way)

```
PC (SQLite) ──push dirty──▶ Supabase ◀──pull unsynced── Mobile (IndexedDB)
```

### Algorithm
1. SQLite TRIGGERS auto-set `is_sync = 0` on every INSERT/UPDATE
2. Sync engine (every N seconds): SELECT WHERE is_sync=0 → POST to Supabase → set is_sync=1
3. Trigger WHEN clause: `NEW.is_sync = OLD.is_sync` — prevents infinite loop
4. Tables sync in FK dependency order: categories → products → sales → items
5. Upsert strategy: `Prefer: resolution=merge-duplicates` (last write wins)
6. Mobile pulls `WHERE mobile_synced = false`, then sets `mobile_synced = true`

### Conflict resolution
- PC is the single source of truth
- Cloud is a mirror (PC overwrites)
- Mobile is read-only (never writes back)
- No merge conflicts possible by design

---

## 6. Printing

### Receipt layout (minimal paper waste)
- Business name (16px, bold, center)
- Address + phone (10px)
- Receipt no + date on ONE line (compact)
- Items: monospace grid (name, qty, total) — no sub-lines
- Totals: discount, tax, TOTAL
- Payment + change
- Barcode (compact, height=25)
- Single footer line

### Speed optimizations
- Printer module cached after first import (~300ms saved per print)
- timeOutPerLine: 200ms (was 600ms)
- ~16 print elements (was ~25)
- No trailing blank lines

### Print flow
1. Sale completes → PaymentModal calls `autoPrint(saleId)`
2. autoPrint checks `auto_print_receipt` setting
3. If enabled: printSaleById → show status (printing/ok/failed)
4. If failed: prominent "Retry Print" button appears
5. No double-print (removed from POSPage)

---

## 7. Security

- Passwords: scrypt hashing with timing-safe comparison
- Backups: AES-256-GCM encryption (key derived from activation key)
- Roles: admin, manager, cashier (enforced in routes + handlers)
- Rate limiting: lockout after failed login attempts
- Soft delete only: no hard DELETE on any table
- Transaction safety: rollback on any error

---

## 8. Migration System

- Tracked in `_migrations` table (name + applied_at)
- Each migration runs exactly once (skips if already applied)
- Runs in a transaction (atomic per migration)
- Tolerates "duplicate column" errors (safe re-install)
- Current migrations: 001–012

| # | Purpose |
|---|---|
| 001 | Core schema (products, sales, users, etc.) |
| 002 | Bulk pricing fields |
| 003 | Purchase price history |
| 004 | Pending price switch |
| 005 | Customer price groups |
| 006 | Tax snapshot on sales |
| 007 | Sale snapshot totals (total_cost_amount) |
| 008 | pricing_mode field |
| 009 | sale_items.sell_mode |
| 010 | is_sync on all tables |
| 011 | Sync triggers (auto-mark dirty) |
| 012 | supabase_config table |

---

## 9. Audit Results

### Automated checks: 61/61 passing

| Category | Checks | Status |
|---|---|---|
| Sale completion (bulk deduction, oversell, cost snapshot) | 6 | ✅ |
| Void sale (bulk restock, status, double-void) | 3 | ✅ |
| Product creation (bulk-only, defaults, reorder) | 3 | ✅ |
| Stock receive (add qty, audit trail, price switch) | 3 | ✅ |
| Cart (mode switch, stock cap, discount clamps) | 4 | ✅ |
| Checkout + print (underpayment, auto-print, no double) | 4 | ✅ |
| Printer (cached import, single footer, fast timeout) | 4 | ✅ |
| Reports (COGS snapshot, bulk fallback, void exclusion) | 4 | ✅ |
| Sync (is_sync on 11 tables, triggers, dependency order) | 15 | ✅ |
| Migrations (001–012, duplicate tolerance) | 10 | ✅ |
| Stock display (bulk-only cartons, audit page) | 2 | ✅ |
| Routing (stock-audit registered) | 1 | ✅ |
| Edge cases (empty cart, held sales, barcode scanner) | 3 | ✅ |

### Manual verification required
- [ ] Print a receipt on the customer's actual printer
- [ ] Test barcode scan with their scanner hardware
- [ ] Verify Supabase sync with a real project
- [ ] Test mobile viewer on the owner's phone
- [ ] Run the dry-run checklist (see DEPLOYMENT_GUIDE.md)

---

## 10. File Map

```
src/main/
  database/
    connection.ts       — DB open/close, withTx transaction wrapper
    migrate.ts          — Schema + migrations 001-012
  services/
    saleService.ts      — completeSale, voidSale, holdSale
    productService.ts   — CRUD, receiveStock, adjustStock, updatePrice
    reportService.ts    — daily/monthly/yearly, P&L, insights
    syncService.ts      — Supabase push engine
    settingsService.ts  — business profile, key-value settings
  handlers/
    product.handler.ts  — IPC handlers for product operations
    report.handler.ts   — IPC handlers for reports
    settings.handler.ts — IPC handlers for settings + sync
  hardware/
    printerService.ts   — Receipt builder + thermal print

src/preload/
  index.ts              — IPC bridge (window.api.*)

src/renderer/src/
  store/
    cartStore.ts        — Zustand cart (add, remove, changeMode, discounts)
  pages/
    POS/
      POSPage.tsx       — Main POS screen + cart grid
      CheckoutBar.tsx   — Search + barcode scanner
      PaymentModal.tsx  — Payment + auto-print + reprint
    Inventory/
      ProductForm.tsx   — Add/edit product (3 pricing modes)
      ProductList.tsx   — Product list with stock display
      StockReceiveModal — Receive stock + price decision
      StockAdjustModal  — Adjust stock (damage/theft/correction)
      PriceUpdateModal  — Change price without restocking
      StockAuditPage    — Full stock audit (purchased/sold/remaining)
    Dashboard/
      DashboardPage.tsx — Overview + Insights tab
      InsightsPanel.tsx — Velocity, days-to-finish, movers, movement
    Settings/
      SettingsPage.tsx  — All settings + Cloud Sync tab
      SyncSettings.tsx  — Supabase credentials + test + setup guide

docs/
  DEPLOYMENT_GUIDE.md   — Step-by-step deployment instructions
  supabase_schema.sql   — Cloud schema SQL (run once per customer)

mobile-viewer/
  index.html            — PWA shell
  app.js                — Dashboard app (overview, stock, sales, alerts)
  sw.js                 — Service worker (offline + push notifications)
  manifest.json         — PWA manifest (Add to Home Screen)
```
