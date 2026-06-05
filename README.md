# NovaPOS

A desktop Point-of-Sale application for Nigerian small/medium businesses.
Built with Electron + React + Vite + TypeScript + SQLite (WASM).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 31 |
| UI | React 18 + Vite 5 + TypeScript 5 |
| Styling | Tailwind CSS |
| State | Zustand |
| Database | node-sqlite3-wasm (WASM SQLite — no native binaries) |
| Charts | Recharts |
| Email | Nodemailer |
| Printing | electron-pos-printer |
| CSV | PapaParse |

---

## Quick Start

```bash
npm install
npm run dev          # starts Electron dev window
```

> `npm run dev` runs `node scripts/dev-start.js` which kills any existing Electron process first.

### Dev / Support Login

```bash
node scripts/get-dev-password.js      # prints today's HMAC-derived password
# Login: username = nova.support, password = <output above>
```

### Activation Key Generation (for new installations)

```bash
node scripts/gen-activation-key.js <machineId>
```

---

## Project Structure

```
src/
  main/
    database/
      connection.ts      — DB singleton, withTx(), DB type (WASM import)
      migrate.ts         — All migrations inlined as strings (no .sql files on disk)
    handlers/            — IPC handlers (one file per domain)
      index.ts           — Registers all handlers
      product.handler.ts
      report.handler.ts
      sale.handler.ts
      settings.handler.ts
      ...
    services/            — Business logic (called from handlers)
      productService.ts
      saleService.ts
      reportService.ts
      settingsService.ts
      ...
    utils/
      safeHandle.ts      — Wraps ipcMain.handle with error catching + { success, data, error } envelope
      logger.ts
  preload/
    index.ts             — contextBridge: exposes window.api to renderer
  renderer/src/
    pages/
      Inventory/
        ProductForm.tsx          — Add/edit product (bulk/unit pricing, price advisor)
        StockReceiveModal.tsx    — Receive stock (barcode scan, supplier, invoice ref, pricing)
        InventoryPage.tsx
      Settings/
        SettingsPage.tsx         — Business profile, VAT, categories, backup, printer
      Pricing/                   — (Planned) Price adjustment page
      ...
    store/
      appStore.ts        — Zustand: profile, toast, cart
      authStore.ts       — Zustand: user, token
shared/
  types.ts               — Shared interfaces (Product, Sale, etc.)
  ipcChannels.ts         — CH.* constants
scripts/
  dev-start.js
  gen-activation-key.js
  get-dev-password.js
```

---

## Critical Developer Rules

### Database (WASM SQLite)
- **All params as arrays**: `.run([a, b])`, `.get([id])`, `.all([q])`
- **Template literals for `datetime('now')`**: SQL with `datetime('now')` must use backtick strings, not single-quoted JS strings
- **No WAL mode**: Causes "database is locked" on Windows with WASM SQLite
- **Transactions**: Always use `withTx(db, () => { ... })` for multi-step writes
- **DB type**: Import `DB` from `'../database/connection'`, never from `better-sqlite3`

### Electron + Vite Bundling
- **No `require()` inside handlers**: electron-vite bundles everything; `require()` paths won't resolve in production. Use static `import` at the top of the file. (This was the cause of the `Cannot find module '../services/reportService'` error.)
- **No `.sql` files on disk**: All migration SQL is inlined in `migrate.ts` as strings — no `fs.readFile` needed.

### React / UI
- **Never patch JSX with Python string replace**: Rewrite full files.
- **No inline styles** in Hope Nurse pattern components.

---

## Database Schema

### Migrations (all inlined in `migrate.ts`)

| Migration | Description |
|---|---|
| 001 | Initial schema: activation, users, categories, suppliers, products, customers, sales, sale_items, payments, stock_adjustments, purchase_orders, held_orders, activity_log |
| 002 | Bulk/unit pricing columns on products; `purchase_price_history` table |
| 003 | `selling_price_history` table (price change audit trail) |
| 004 | `products.pending_sell_price`, `pending_bulk_price`, `price_switch_at_qty` |
| 005 | `customer_price_groups` table; `customers.price_group_id` |
| 006 | `sales.tax_rate_applied`, `sales.tax_inclusive_applied` (VAT snapshot); `purchase_price_history.invoice_ref` |

### Price Immutability Guarantee

Every sale permanently records:
- `sale_items.unit_price` — selling price at moment of sale
- `sale_items.cost_price` — product cost at moment of sale
- `sales.tax_rate_applied` — VAT rate active at moment of sale
- `sales.tax_inclusive_applied` — VAT mode (inclusive/exclusive) at moment of sale

**VAT rates can change at any time. Past sale records are NEVER recalculated. Historical P&L is always accurate.**

P&L formula: `Σ (unit_price − cost_price) × quantity` on `sale_items` for completed sales.

---

## Key Features

### Stock Receiving (StockReceiveModal)

1. **Barcode scanner support** — Scan barcode at top of form; press Enter to auto-select product
2. **Supplier & Invoice Ref** (Step 2) — Select supplier, enter invoice/batch reference
   - Shows last 3 purchase records with dates, suppliers, costs
   - Shows last price from the selected supplier with "Use ↩" quick-fill
3. **Buy mode** — Bulk (cartons, crates, dozens…) or by unit
4. **Unit count preloads** — Selecting `dozen` auto-fills 12, `gross` → 144, `crate` → 24, `case` → 12, `tray` → 30
5. **Weighted Average Cost (WAC)** — Shown when new cost differs from existing cost
6. **3-mode pricing decision**:
   - **Keep current** — All stock sells at today's price
   - **⏳ Auto-switch** — Old stock at old price; system auto-switches when old stock runs out
   - **Update now** — New price applies to all stock immediately
7. Every restock is logged to `purchase_price_history` (with supplier + invoice ref) and `selling_price_history` (if prices changed)

### Product Form (ProductForm)

- Bulk-first pricing: enter bulk buying price → units per bulk auto-derives unit cost
- Unit count preloads: dozen/gross/crate/etc. auto-fill the count field
- Price Advisor: suggests 10%–40% margin prices with one-click apply
- Purchase History tab: shows all restocks with supplier, invoice ref, cost, qty
- Price Changes tab: shows every time cost/sell price changed and who changed it

### VAT / Tax

- VAT rate and mode (inclusive/exclusive) are **snapshotted at time of each sale** in `tax_rate_applied` and `tax_inclusive_applied`
- Changing VAT settings never affects historical records
- Tax settings saved to `business_profile` table; accessible via Settings → Tax & VAT

### Backup System

**Location**: Backups default to the same parent directory as the database:
```
%APPDATA%\nova-pos\backups\         (Windows)
~/.config/nova-pos/backups/         (Linux/macOS)
```
The exact path is shown dynamically in Settings → Backup (reads from Electron's `app.getPath('userData')` at runtime).

**Features**:
- Local backup: timestamped `.db` copies, last 30 kept automatically
- Google Drive sync: set a GDrive Desktop sync folder; NovaPOS copies each backup there after saving
- **Offline resilience**: if the PC was off or offline at backup time, NovaPOS retries automatically when connectivity returns
- Browse button to pick any folder via native OS dialog
- "Open Folder" button opens backup folder in Windows Explorer / macOS Finder

**Setup — Google Drive sync**:
1. Install Google Drive Desktop → sign in → choose "Mirror files" mode
2. Create folder `NovaPOS Backups` inside your Google Drive
3. Settings → Backup → Google Drive Sync Folder → Browse → select that folder
4. All future backups appear in Google Drive automatically

### Reports

All reports use **stored** `sale_items.cost_price` and `sales.tax_amount` — never live product prices. This means:
- Daily, monthly, yearly revenue/profit reports
- P&L (Gross Profit = Revenue − COGS where COGS = `Σ cost_price × qty`)
- Inventory report (stock value, low stock, movement)
- X / Z reports

Report handler uses static ES module imports — no `require()` — so reports work correctly in the bundled production build.

---

## IPC Channels Reference

### Settings / Backup

| Channel | Direction | Description |
|---|---|---|
| `settings:getAppPaths` | main → renderer | Returns `{ userData, dbPath, backupDir }` dynamically |
| `settings:chooseFolder` | main → renderer | Opens native folder picker dialog |
| `settings:openFolder` | main → renderer | Opens path in OS file explorer |
| `settings:backupLocal` | main → renderer | Copies DB to `{ backupDir, gdriveDir? }`, prunes old, returns filename |
| `settings:backupNow` | main → renderer | Runs scheduled backup (email); retries on reconnect |

### Products

| Channel | Description |
|---|---|
| `products:receiveStock` | Stock receipt with supplier, invoice ref, pricing mode |
| `products:priceHistory` | Purchase history with supplier name + invoice ref |
| `products:priceChangeHistory` | Sell price audit trail |

---

## Roadmap (Planned)

- [ ] **Pricing Page** (`/Pricing`) — View/edit all product prices in a table; bulk % change by category
- [ ] **Purchase Orders** — Create PO → receive against PO
- [ ] **Stock Valuation Report** — Full inventory cost vs retail value snapshot
- [ ] **Minimum Stock Warning** — Alert cashier before completing a sale that would deplete below reorder level
- [ ] **Promotional Pricing** — Date-bound discount rules per product or category

---

## Environment

- OS: Windows 10/11 (primary); Linux/macOS supported
- DB file: `%APPDATA%\nova-pos\novapos.db`
- Dev command: `npm run dev`
- Build: `npm run build` (electron-vite)
- Node: 18+
