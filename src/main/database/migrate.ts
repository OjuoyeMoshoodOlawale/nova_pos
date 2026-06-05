// src/main/database/migrate.ts
// SQL is inlined as a TypeScript string so electron-vite bundles it —
// no file-system dependency, works in both dev and packaged production.
import type { DB } from './connection'
import { withTx } from './connection'
import logger from '../utils/logger'

// ─── Schema SQL (inlined — do not read from disk) ─────
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
-- Each product can have two sale modes: unit and bulk
-- e.g. sell 1 bottle (unit) OR 1 carton of 24 bottles (bulk)

ALTER TABLE products ADD COLUMN bulk_unit         TEXT;
ALTER TABLE products ADD COLUMN units_per_bulk    REAL DEFAULT 1;
ALTER TABLE products ADD COLUMN bulk_buying_price REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN bulk_selling_price REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN has_bulk_pricing  INTEGER DEFAULT 0;

-- Image support
ALTER TABLE products ADD COLUMN image_data        TEXT;  -- base64 data URL

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
-- Every time a product's selling price or cost price changes,
-- we log WHO changed it, WHEN, and what the old/new values were.
-- This is separate from purchase_price_history (buying price).
-- Past sale_items records are NEVER touched — they already
-- store a price snapshot at time of sale.

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
}

// ─── Run migrations ───────────────────────────────────
export function runMigrations(db: DB): void {
  // Ensure tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name)
  )

  let count = 0
  for (const [name, sql] of Object.entries(MIGRATIONS).sort()) {
    if (applied.has(name)) continue

    logger.info(`[Migrate] Applying: ${name}`)
    withTx(db, () => {
      db.exec(sql)
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run([name])
    })
    count++
    logger.info(`[Migrate] Applied: ${name}`)
  }

  if (count === 0) logger.info('[Migrate] Database is up to date')
  else logger.info(`[Migrate] ${count} migration(s) applied`)
}

// ─── INLINE MIGRATION 002 ─────────────────────────────────
// Injected directly into the MIGRATIONS object above.
// Add this key to the MIGRATIONS record in migrate.ts:

