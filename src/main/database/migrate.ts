// src/main/database/migrate.ts
// SQL is inlined as a TypeScript string so electron-vite bundles it —
// no file-system dependency, works in both dev and packaged production.
import type { DB } from './connection'
import { withTx } from './connection'
import logger from '../utils/logger'

const MIGRATIONS: Record<string, string> = {
  '001_initial_schema.sql': `
-- ─── MIGRATION TRACKING ──────────────────────────────
CREATE TABLE IF NOT EXISTS _migrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  applied_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── ACTIVATION ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS activation (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  machine_id      TEXT    NOT NULL,
  activation_key  TEXT    NOT NULL,
  business_name   TEXT    NOT NULL,
  activated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── BUSINESS PROFILE ────────────────────────────────
CREATE TABLE IF NOT EXISTS business_profile (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  name            TEXT    NOT NULL    DEFAULT 'My Business',
  type            TEXT    NOT NULL    DEFAULT 'retail',
  address         TEXT,
  phone           TEXT,
  email           TEXT,
  logo_path       TEXT,
  currency_code   TEXT    NOT NULL    DEFAULT 'NGN',
  currency_symbol TEXT    NOT NULL    DEFAULT '₦',
  tax_name        TEXT    NOT NULL    DEFAULT 'VAT',
  tax_rate        REAL    NOT NULL    DEFAULT 7.5,
  tax_inclusive   INTEGER NOT NULL    DEFAULT 0,
  receipt_header  TEXT,
  receipt_footer  TEXT                DEFAULT 'Thank you for your patronage!',
  show_logo       INTEGER NOT NULL    DEFAULT 1,
  created_at      TEXT    NOT NULL    DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL    DEFAULT (datetime('now'))
);

-- ─── SETTINGS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('setup_complete',      'false'),
  ('printer_name',        ''),
  ('paper_width',         '80mm'),
  ('idle_timeout_secs',   '300'),
  ('auto_email_enabled',  'false'),
  ('auto_email_time',     '22:00'),
  ('smtp_host',           ''),
  ('smtp_port',           '587'),
  ('smtp_user',           ''),
  ('smtp_pass',           ''),
  ('smtp_from_name',      ''),
  ('smtp_from_email',     ''),
  ('manager_email',       ''),
  ('network_mode',        'standalone'),
  ('lan_server_ip',       ''),
  ('lan_server_port',     '3977'),
  ('lan_secret',          ''),
  ('dev_login_enabled',   'true'),
  ('backup_keep_count',   '30'),
  ('auto_print_receipt',  'true'),
  ('app_version',         '1.0.0');

-- ─── USERS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT    NOT NULL,
  username      TEXT    NOT NULL UNIQUE,
  pin           TEXT,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL    DEFAULT 'cashier',
  is_active     INTEGER NOT NULL    DEFAULT 1,
  created_at    TEXT    NOT NULL    DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL    DEFAULT (datetime('now'))
);

-- ─── CATEGORIES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  color      TEXT    NOT NULL    DEFAULT '#6366f1',
  icon       TEXT,
  is_active  INTEGER NOT NULL    DEFAULT 1,
  created_at TEXT    NOT NULL    DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO categories (name, color) VALUES
  ('General',     '#6366f1'),
  ('Food',        '#f59e0b'),
  ('Beverages',   '#06b6d4'),
  ('Electronics', '#10b981'),
  ('Clothing',    '#ec4899');

-- ─── SUPPLIERS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  contact    TEXT,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  notes      TEXT,
  is_active  INTEGER NOT NULL    DEFAULT 1,
  created_at TEXT    NOT NULL    DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL    DEFAULT (datetime('now'))
);

-- ─── PRODUCTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  sku           TEXT    UNIQUE,
  barcode       TEXT    UNIQUE,
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id   INTEGER REFERENCES suppliers(id)  ON DELETE SET NULL,
  parent_id     INTEGER REFERENCES products(id)   ON DELETE SET NULL,
  unit          TEXT    NOT NULL    DEFAULT 'pcs',
  cost_price    REAL    NOT NULL    DEFAULT 0,
  selling_price REAL    NOT NULL    DEFAULT 0,
  stock_qty     REAL    NOT NULL    DEFAULT 0,
  reorder_level REAL    NOT NULL    DEFAULT 5,
  image_path    TEXT,
  description   TEXT,
  is_active     INTEGER NOT NULL    DEFAULT 1,
  created_at    TEXT    NOT NULL    DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_barcode  ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku      ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active   ON products(is_active);

-- ─── CUSTOMERS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name  TEXT    NOT NULL,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  notes      TEXT,
  balance    REAL    NOT NULL    DEFAULT 0,
  is_active  INTEGER NOT NULL    DEFAULT 1,
  created_at TEXT    NOT NULL    DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- ─── SALES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no   TEXT    NOT NULL UNIQUE,
  customer_id  INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  served_by    INTEGER NOT NULL REFERENCES users(id),
  subtotal     REAL    NOT NULL    DEFAULT 0,
  discount_pct REAL    NOT NULL    DEFAULT 0,
  discount_amt REAL    NOT NULL    DEFAULT 0,
  tax_amount   REAL    NOT NULL    DEFAULT 0,
  total_amount REAL    NOT NULL    DEFAULT 0,
  amount_paid  REAL    NOT NULL    DEFAULT 0,
  change_given REAL    NOT NULL    DEFAULT 0,
  status       TEXT    NOT NULL    DEFAULT 'completed',
  void_reason  TEXT,
  notes        TEXT,
  sale_date    TEXT    NOT NULL    DEFAULT (datetime('now')),
  created_at   TEXT    NOT NULL    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sales_date     ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_cashier  ON sales(served_by);
CREATE INDEX IF NOT EXISTS idx_sales_status   ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);

-- ─── SALE ITEMS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS sale_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id      INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT    NOT NULL,
  unit_price   REAL    NOT NULL,
  quantity     REAL    NOT NULL,
  discount_pct REAL    NOT NULL    DEFAULT 0,
  line_total   REAL    NOT NULL,
  cost_price   REAL    NOT NULL    DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale    ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

-- ─── PAYMENTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id   INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method    TEXT    NOT NULL,
  amount    REAL    NOT NULL,
  reference TEXT,
  paid_at   TEXT    NOT NULL    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);

-- ─── STOCK ADJUSTMENTS ───────────────────────────────
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  adjusted_by INTEGER NOT NULL REFERENCES users(id),
  qty_before  REAL    NOT NULL,
  qty_change  REAL    NOT NULL,
  qty_after   REAL    NOT NULL,
  reason      TEXT    NOT NULL,
  notes       TEXT,
  adjusted_at TEXT    NOT NULL    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_adj_product ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_adj_date    ON stock_adjustments(adjusted_at);

-- ─── PURCHASE ORDERS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number    TEXT    NOT NULL UNIQUE,
  supplier_id  INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  created_by   INTEGER NOT NULL REFERENCES users(id),
  total_amount REAL    NOT NULL    DEFAULT 0,
  status       TEXT    NOT NULL    DEFAULT 'pending',
  notes        TEXT,
  expected_at  TEXT,
  received_at  TEXT,
  created_at   TEXT    NOT NULL    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id        INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id),
  quantity     REAL    NOT NULL,
  unit_cost    REAL    NOT NULL,
  received_qty REAL    NOT NULL    DEFAULT 0,
  line_total   REAL    NOT NULL
);

-- ─── HELD ORDERS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS held_orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  label       TEXT,
  cart_json   TEXT    NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  held_by     INTEGER NOT NULL REFERENCES users(id),
  held_at     TEXT    NOT NULL    DEFAULT (datetime('now'))
);

-- ─── ACTIVITY LOG ────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT    NOT NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  detail      TEXT,
  logged_at   TEXT    NOT NULL    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_log_user   ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_log_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_log_date   ON activity_log(logged_at);
`,

  '002_bulk_unit_pricing.sql': `
-- ─── BULK / UNIT PRICING ─────────────────────────────────
ALTER TABLE products ADD COLUMN bulk_unit          TEXT;
ALTER TABLE products ADD COLUMN units_per_bulk     REAL    DEFAULT 1;
ALTER TABLE products ADD COLUMN bulk_buying_price  REAL    DEFAULT 0;
ALTER TABLE products ADD COLUMN bulk_selling_price REAL    DEFAULT 0;
ALTER TABLE products ADD COLUMN has_bulk_pricing   INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN image_data         TEXT;

-- ─── PURCHASE PRICE HISTORY ──────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  cost_price  REAL    NOT NULL,
  qty_bought  REAL,
  sell_unit   TEXT    NOT NULL DEFAULT 'unit',
  notes       TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchase_history_product ON purchase_price_history(product_id);
`,

  '003_price_audit_trail.sql': `
-- ─── SELLING PRICE HISTORY ────────────────────────────────
-- Past sale_items records are NEVER touched — they store a price snapshot
-- at the exact moment of sale (both unit_price and cost_price).
CREATE TABLE IF NOT EXISTS selling_price_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  changed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  old_cost_price  REAL,
  new_cost_price  REAL,
  old_sell_price  REAL,
  new_sell_price  REAL,
  old_bulk_price  REAL,
  new_bulk_price  REAL,
  reason          TEXT,
  changed_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON selling_price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_date    ON selling_price_history(changed_at);
`,

  '004_pending_price_switch.sql': `
-- Auto-switch pricing when old stock runs out
ALTER TABLE products ADD COLUMN pending_sell_price  REAL;
ALTER TABLE products ADD COLUMN pending_bulk_price  REAL;
ALTER TABLE products ADD COLUMN price_switch_at_qty REAL;
`,

  '005_customer_price_groups.sql': `
-- ─── CUSTOMER PRICE GROUPS ───────────────────────────────
CREATE TABLE IF NOT EXISTS customer_price_groups (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL UNIQUE,
  discount_pct REAL    NOT NULL DEFAULT 0,
  description  TEXT,
  color        TEXT    NOT NULL DEFAULT '#6366f1',
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO customer_price_groups (name, discount_pct, description, color) VALUES
  ('Walk-in',   0,  'Standard retail price',        '#6366f1'),
  ('Wholesale', 10, '10% off for wholesale buyers',  '#10b981'),
  ('VIP',       5,  '5% off for loyal customers',    '#f59e0b'),
  ('Staff',     15, '15% off for staff purchases',   '#8b5cf6');

ALTER TABLE customers ADD COLUMN price_group_id INTEGER REFERENCES customer_price_groups(id) ON DELETE SET NULL;
`,

  '006_tax_snapshot_and_invoice_ref.sql': `
-- ─── TAX SNAPSHOT ON SALES ────────────────────────────────
-- VAT policies can change at any time. These columns permanently record
-- the tax rate AND mode (inclusive/exclusive) that was active at the
-- exact moment each sale was processed.
-- IMMUTABLE: past sale records must never be modified.
-- Reports use sales.tax_amount (already stored) for revenue; these
-- columns enable audits of exactly what VAT rate was applied.
ALTER TABLE sales ADD COLUMN tax_rate_applied      REAL    DEFAULT 7.5;
ALTER TABLE sales ADD COLUMN tax_inclusive_applied INTEGER DEFAULT 0;

-- ─── INVOICE REF ON PURCHASE HISTORY ─────────────────────
-- Store the supplier invoice / delivery note number with each stock receipt.
-- Enables reconciliation between NovaPOS purchase records and paper invoices.
ALTER TABLE purchase_price_history ADD COLUMN invoice_ref TEXT;
`,

  '007_sale_snapshot_totals.sql': `
-- ─── SALE SNAPSHOT TOTALS ────────────────────────────────
-- Each sale stores a full JSON snapshot of its items plus the
-- total cost (buying price) at moment of sale. Reports read these
-- directly so changing product prices later NEVER alters history.
ALTER TABLE sales ADD COLUMN items_json        TEXT;
ALTER TABLE sales ADD COLUMN total_cost_amount REAL NOT NULL DEFAULT 0;

-- Backfill cost totals for existing sales from sale_items snapshots
UPDATE sales SET total_cost_amount = COALESCE((
  SELECT SUM(si.cost_price * si.quantity)
  FROM sale_items si WHERE si.sale_id = sales.id
), 0);

-- Indexes for long-term (10yr) report performance
CREATE INDEX IF NOT EXISTS idx_sales_date_status ON sales(sale_date, status);
CREATE INDEX IF NOT EXISTS idx_payments_method   ON payments(method);
`,

  '008_pricing_mode.sql': `
-- ─── FLEXIBLE PRICING MODE ───────────────────────────────
-- A product can be sold as:
--   'unit'  → loose pieces only (default; uses selling_price)
--   'both'  → loose pieces AND bulk (uses selling_price + bulk_selling_price)
--   'bulk'  → bulk container only, no loose sale (uses bulk_selling_price)
-- This lets stores be flexible: some goods sell only by carton, some only
-- loose, some both. Existing rows are backfilled from has_bulk_pricing.
ALTER TABLE products ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'unit';

UPDATE products SET pricing_mode = 'both' WHERE has_bulk_pricing = 1;
UPDATE products SET pricing_mode = 'unit' WHERE has_bulk_pricing = 0 OR has_bulk_pricing IS NULL;
`,

  '009_sale_items_sell_mode.sql': `
-- Record HOW each line was sold (unit vs bulk) so reports and reprints
-- know whether 'quantity' means pieces or cartons.
ALTER TABLE sale_items ADD COLUMN sell_mode TEXT NOT NULL DEFAULT 'unit';
`,


  '010_supabase_is_sync.sql': `
-- Add is_sync boolean to core tables (0 = changed, 1 = synced).
-- Existing rows default to 1 (treat as synced to avoid a full re-push).
ALTER TABLE categories ADD COLUMN is_sync INTEGER NOT NULL DEFAULT 1;
ALTER TABLE suppliers ADD COLUMN is_sync INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN is_sync INTEGER NOT NULL DEFAULT 1;
ALTER TABLE customers ADD COLUMN is_sync INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sales ADD COLUMN is_sync INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sale_items ADD COLUMN is_sync INTEGER NOT NULL DEFAULT 1;
ALTER TABLE payments ADD COLUMN is_sync INTEGER NOT NULL DEFAULT 1;
ALTER TABLE stock_adjustments ADD COLUMN is_sync INTEGER NOT NULL DEFAULT 1;
ALTER TABLE purchase_orders ADD COLUMN is_sync INTEGER NOT NULL DEFAULT 1;
ALTER TABLE purchase_order_items ADD COLUMN is_sync INTEGER NOT NULL DEFAULT 1;
ALTER TABLE activity_log ADD COLUMN is_sync INTEGER NOT NULL DEFAULT 1;
`,

  '011_sync_triggers.sql': `
-- Auto-mark rows as unsynced on every INSERT and UPDATE.
-- This means existing services don't need any code changes.

CREATE TRIGGER IF NOT EXISTS trg_categories_insert_unsync
AFTER INSERT ON categories
BEGIN UPDATE categories SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_categories_update_unsync
AFTER UPDATE ON categories WHEN NEW.is_sync = OLD.is_sync
BEGIN UPDATE categories SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_suppliers_insert_unsync
AFTER INSERT ON suppliers
BEGIN UPDATE suppliers SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_suppliers_update_unsync
AFTER UPDATE ON suppliers WHEN NEW.is_sync = OLD.is_sync
BEGIN UPDATE suppliers SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_products_insert_unsync
AFTER INSERT ON products
BEGIN UPDATE products SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_products_update_unsync
AFTER UPDATE ON products WHEN NEW.is_sync = OLD.is_sync
BEGIN UPDATE products SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_customers_insert_unsync
AFTER INSERT ON customers
BEGIN UPDATE customers SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_customers_update_unsync
AFTER UPDATE ON customers WHEN NEW.is_sync = OLD.is_sync
BEGIN UPDATE customers SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_sales_insert_unsync
AFTER INSERT ON sales
BEGIN UPDATE sales SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_sales_update_unsync
AFTER UPDATE ON sales WHEN NEW.is_sync = OLD.is_sync
BEGIN UPDATE sales SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_sale_items_insert_unsync
AFTER INSERT ON sale_items
BEGIN UPDATE sale_items SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_sale_items_update_unsync
AFTER UPDATE ON sale_items WHEN NEW.is_sync = OLD.is_sync
BEGIN UPDATE sale_items SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_payments_insert_unsync
AFTER INSERT ON payments
BEGIN UPDATE payments SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_payments_update_unsync
AFTER UPDATE ON payments WHEN NEW.is_sync = OLD.is_sync
BEGIN UPDATE payments SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_stock_adjustments_insert_unsync
AFTER INSERT ON stock_adjustments
BEGIN UPDATE stock_adjustments SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_stock_adjustments_update_unsync
AFTER UPDATE ON stock_adjustments WHEN NEW.is_sync = OLD.is_sync
BEGIN UPDATE stock_adjustments SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_purchase_orders_insert_unsync
AFTER INSERT ON purchase_orders
BEGIN UPDATE purchase_orders SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_purchase_orders_update_unsync
AFTER UPDATE ON purchase_orders WHEN NEW.is_sync = OLD.is_sync
BEGIN UPDATE purchase_orders SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_purchase_order_items_insert_unsync
AFTER INSERT ON purchase_order_items
BEGIN UPDATE purchase_order_items SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_purchase_order_items_update_unsync
AFTER UPDATE ON purchase_order_items WHEN NEW.is_sync = OLD.is_sync
BEGIN UPDATE purchase_order_items SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_activity_log_insert_unsync
AFTER INSERT ON activity_log
BEGIN UPDATE activity_log SET is_sync = 0 WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_activity_log_update_unsync
AFTER UPDATE ON activity_log WHEN NEW.is_sync = OLD.is_sync
BEGIN UPDATE activity_log SET is_sync = 0 WHERE id = NEW.id; END;
`,

  '012_supabase_config.sql': `
-- Supabase credentials per store. Each customer gets their own free-tier project.
CREATE TABLE IF NOT EXISTS supabase_config (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  supabase_url  TEXT    NOT NULL DEFAULT '',
  supabase_key  TEXT    NOT NULL DEFAULT '',
  sync_interval INTEGER NOT NULL DEFAULT 300,
  last_sync_at  TEXT,
  is_enabled    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO supabase_config (id) VALUES (1);
`,
}

// ─── Migration runner ──────────────────────────────────
export function runMigrations(db: DB): void {
  // Ensure the tracking table exists BEFORE we read from it. On a brand-new
  // database — e.g. first install, or after a "Delete All Data" fresh start —
  // _migrations does not exist yet (it is otherwise created inside migration
  // 001), and SELECT-ing from a missing table throws "no such table". This is
  // idempotent, so it is a no-op on databases that already have it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      applied_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[])
      .map(r => r.name)
  )

  const names = Object.keys(MIGRATIONS).sort()
  let count = 0

  for (const name of names) {
    if (applied.has(name)) continue
    const sql = MIGRATIONS[name]
    try {
      withTx(db, () => {
        db.exec(sql)
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run([name])
      })
      count++
      logger.info(`[Migrate] Applied: ${name}`)
    } catch (err) {
      const msg = (err as Error).message || ''
      // ADD COLUMN is idempotent in intent. If a column already exists (e.g.
      // a re-installed build or a partially-applied migration), don't crash
      // startup — record the migration as applied and continue.
      if (/duplicate column name/i.test(msg)) {
        try { db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run([name]) } catch { /* ignore */ }
        logger.warn(`[Migrate] ${name}: column already exists — marking as applied`)
        continue
      }
      logger.error(`[Migrate] FAILED on ${name}: ${msg}`)
      throw err
    }
  }

  if (count === 0) logger.info('[Migrate] Database already up to date')
  else logger.info(`[Migrate] Applied ${count} migration(s)`)
}
