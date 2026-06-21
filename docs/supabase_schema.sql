-- ═══════════════════════════════════════════════════
-- NovaPOS Supabase Cloud Schema
-- Run this ONCE in your Supabase SQL Editor
-- to set up the cloud tables for sync.
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE,
  color      TEXT    NOT NULL    DEFAULT '#6366f1',
  icon       TEXT,
  is_active  INTEGER NOT NULL    DEFAULT 1,
  created_at TEXT    NOT NULL    DEFAULT (datetime('now',
  mobile_synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS suppliers (
  id         SERIAL PRIMARY KEY,
  name       TEXT    NOT NULL,
  contact    TEXT,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  notes      TEXT,
  is_active  INTEGER NOT NULL    DEFAULT 1,
  created_at TEXT    NOT NULL    DEFAULT (datetime('now',
  mobile_synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  name          TEXT    NOT NULL,
  sku           TEXT    UNIQUE,
  barcode       TEXT    UNIQUE,
  category_id   INTEGER REFERENCES categories(id,
  mobile_synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  full_name  TEXT    NOT NULL,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  notes      TEXT,
  balance    NUMERIC    NOT NULL    DEFAULT 0,
  is_active  INTEGER NOT NULL    DEFAULT 1,
  created_at TEXT    NOT NULL    DEFAULT (datetime('now',
  mobile_synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS sales (
  id           SERIAL PRIMARY KEY,
  receipt_no   TEXT    NOT NULL UNIQUE,
  customer_id  INTEGER REFERENCES customers(id,
  mobile_synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS sale_items (
  id           SERIAL PRIMARY KEY,
  sale_id      INTEGER NOT NULL REFERENCES sales(id,
  mobile_synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS payments (
  id        SERIAL PRIMARY KEY,
  sale_id   INTEGER NOT NULL REFERENCES sales(id,
  mobile_synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id,
  mobile_synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id           SERIAL PRIMARY KEY,
  po_number    TEXT    NOT NULL UNIQUE,
  supplier_id  INTEGER REFERENCES suppliers(id,
  mobile_synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id           SERIAL PRIMARY KEY,
  po_id        INTEGER NOT NULL REFERENCES purchase_orders(id,
  mobile_synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS activity_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id,
  mobile_synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS purchase_price_history (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id,
  mobile_synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS selling_price_history (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER NOT NULL REFERENCES products(id,
  mobile_synced BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS bulk_unit          TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS units_per_bulk     NUMERIC    DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS bulk_buying_price  NUMERIC    DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS bulk_selling_price NUMERIC    DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_bulk_pricing   INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_data         TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pending_sell_price  NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pending_bulk_price  NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_switch_at_qty NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'unit';

ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_group_id INTEGER REFERENCES customer_price_groups(id) ON DELETE SET NULL;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS tax_rate_applied      NUMERIC    DEFAULT 7.5;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS tax_inclusive_applied INTEGER DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS items_json        TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_cost_amount NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE purchase_price_history ADD COLUMN IF NOT EXISTS invoice_ref TEXT;

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS sell_mode TEXT NOT NULL DEFAULT 'unit';









-- Enable RLS (owner can see everything via anon key + policy)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON categories FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON suppliers FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON products FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON customers FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON sales FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON sale_items FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON payments FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON stock_adjustments FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON purchase_orders FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON purchase_order_items FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON activity_log FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE purchase_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON purchase_price_history FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE selling_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON selling_price_history FOR ALL USING (true) WITH CHECK (true);

-- Index on mobile_synced for efficient mobile pulls
CREATE INDEX IF NOT EXISTS idx_categories_mobile_synced ON categories(mobile_synced) WHERE mobile_synced = false;
CREATE INDEX IF NOT EXISTS idx_suppliers_mobile_synced ON suppliers(mobile_synced) WHERE mobile_synced = false;
CREATE INDEX IF NOT EXISTS idx_products_mobile_synced ON products(mobile_synced) WHERE mobile_synced = false;
CREATE INDEX IF NOT EXISTS idx_customers_mobile_synced ON customers(mobile_synced) WHERE mobile_synced = false;
CREATE INDEX IF NOT EXISTS idx_sales_mobile_synced ON sales(mobile_synced) WHERE mobile_synced = false;
CREATE INDEX IF NOT EXISTS idx_sale_items_mobile_synced ON sale_items(mobile_synced) WHERE mobile_synced = false;
CREATE INDEX IF NOT EXISTS idx_payments_mobile_synced ON payments(mobile_synced) WHERE mobile_synced = false;
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_mobile_synced ON stock_adjustments(mobile_synced) WHERE mobile_synced = false;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_mobile_synced ON purchase_orders(mobile_synced) WHERE mobile_synced = false;
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_mobile_synced ON purchase_order_items(mobile_synced) WHERE mobile_synced = false;
CREATE INDEX IF NOT EXISTS idx_activity_log_mobile_synced ON activity_log(mobile_synced) WHERE mobile_synced = false;
CREATE INDEX IF NOT EXISTS idx_purchase_price_history_mobile_synced ON purchase_price_history(mobile_synced) WHERE mobile_synced = false;
CREATE INDEX IF NOT EXISTS idx_selling_price_history_mobile_synced ON selling_price_history(mobile_synced) WHERE mobile_synced = false;