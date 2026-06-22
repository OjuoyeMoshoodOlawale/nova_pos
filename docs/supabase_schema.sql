-- ═══════════════════════════════════════════════════════════════
-- NovaPOS — Supabase (PostgreSQL) Cloud Schema
-- ───────────────────────────────────────────────────────────────
-- Run this ONCE in the Supabase SQL Editor (paste → Run).
-- It is safe to re-run: it drops and recreates the sync tables.
--
-- Design notes:
--  • The desktop app is the single source of truth. Sync is ONE-WAY:
--    PC → Supabase. These tables are a cloud mirror that the mobile
--    viewer reads from. So they carry NO foreign-key constraints
--    (push order must never be able to reject a row) and NO UNIQUE
--    constraints beyond the primary key.
--  • Columns mirror the local SQLite schema EXACTLY (the sync sends
--    SELECT *), minus the local-only 'is_sync' flag, plus 'mobile_synced'.
--  • Boolean-ish flags (is_active, has_bulk_pricing, tax_inclusive_applied)
--    stay INTEGER because the app sends 0/1, not true/false.
--  • 'id' is a plain BIGINT primary key: the app pushes its own ids and
--    upserts on id (Prefer: resolution=merge-duplicates).
-- ═══════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS purchase_order_items CASCADE;
DROP TABLE IF EXISTS purchase_orders      CASCADE;
DROP TABLE IF EXISTS activity_log         CASCADE;
DROP TABLE IF EXISTS stock_adjustments    CASCADE;
DROP TABLE IF EXISTS payments             CASCADE;
DROP TABLE IF EXISTS sale_items           CASCADE;
DROP TABLE IF EXISTS sales                CASCADE;
DROP TABLE IF EXISTS customers            CASCADE;
DROP TABLE IF EXISTS products             CASCADE;
DROP TABLE IF EXISTS suppliers            CASCADE;
DROP TABLE IF EXISTS categories           CASCADE;

CREATE TABLE categories (
  id            BIGINT PRIMARY KEY,
  name          TEXT,
  color         TEXT        DEFAULT '#6366f1',
  icon          TEXT,
  is_active     INTEGER     DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT now(),
  mobile_synced BOOLEAN     DEFAULT false
);

CREATE TABLE suppliers (
  id            BIGINT PRIMARY KEY,
  name          TEXT,
  contact       TEXT,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  notes         TEXT,
  is_active     INTEGER     DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  mobile_synced BOOLEAN     DEFAULT false
);

CREATE TABLE products (
  id                  BIGINT PRIMARY KEY,
  name                TEXT,
  sku                 TEXT,
  barcode             TEXT,
  category_id         BIGINT,
  supplier_id         BIGINT,
  parent_id           BIGINT,
  unit                TEXT        DEFAULT 'pcs',
  cost_price          NUMERIC     DEFAULT 0,
  selling_price       NUMERIC     DEFAULT 0,
  stock_qty           NUMERIC     DEFAULT 0,
  reorder_level       NUMERIC     DEFAULT 5,
  image_path          TEXT,
  description         TEXT,
  is_active           INTEGER     DEFAULT 1,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  bulk_unit           TEXT,
  units_per_bulk      NUMERIC     DEFAULT 1,
  bulk_buying_price   NUMERIC     DEFAULT 0,
  bulk_selling_price  NUMERIC     DEFAULT 0,
  has_bulk_pricing    INTEGER     DEFAULT 0,
  image_data          TEXT,
  pending_sell_price  NUMERIC,
  pending_bulk_price  NUMERIC,
  price_switch_at_qty NUMERIC,
  pricing_mode        TEXT        DEFAULT 'unit',
  mobile_synced       BOOLEAN     DEFAULT false
);

CREATE TABLE customers (
  id             BIGINT PRIMARY KEY,
  full_name      TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  notes          TEXT,
  balance        NUMERIC     DEFAULT 0,
  is_active      INTEGER     DEFAULT 1,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  price_group_id BIGINT,
  mobile_synced  BOOLEAN     DEFAULT false
);

CREATE TABLE sales (
  id                    BIGINT PRIMARY KEY,
  receipt_no            TEXT,
  customer_id           BIGINT,
  served_by             BIGINT,
  subtotal              NUMERIC     DEFAULT 0,
  discount_pct          NUMERIC     DEFAULT 0,
  discount_amt          NUMERIC     DEFAULT 0,
  tax_amount            NUMERIC     DEFAULT 0,
  total_amount          NUMERIC     DEFAULT 0,
  amount_paid           NUMERIC     DEFAULT 0,
  change_given          NUMERIC     DEFAULT 0,
  status                TEXT        DEFAULT 'completed',
  void_reason           TEXT,
  notes                 TEXT,
  sale_date             TIMESTAMPTZ DEFAULT now(),
  created_at            TIMESTAMPTZ DEFAULT now(),
  tax_rate_applied      NUMERIC     DEFAULT 7.5,
  tax_inclusive_applied INTEGER     DEFAULT 0,
  items_json            TEXT,
  total_cost_amount     NUMERIC     DEFAULT 0,
  mobile_synced         BOOLEAN     DEFAULT false
);

CREATE TABLE sale_items (
  id            BIGINT PRIMARY KEY,
  sale_id       BIGINT,
  product_id    BIGINT,
  product_name  TEXT,
  unit_price    NUMERIC,
  quantity      NUMERIC,
  discount_pct  NUMERIC     DEFAULT 0,
  line_total    NUMERIC,
  cost_price    NUMERIC     DEFAULT 0,
  sell_mode     TEXT        DEFAULT 'unit',
  mobile_synced BOOLEAN     DEFAULT false
);

CREATE TABLE payments (
  id            BIGINT PRIMARY KEY,
  sale_id       BIGINT,
  method        TEXT,
  amount        NUMERIC,
  reference     TEXT,
  paid_at       TIMESTAMPTZ DEFAULT now(),
  mobile_synced BOOLEAN     DEFAULT false
);

CREATE TABLE stock_adjustments (
  id            BIGINT PRIMARY KEY,
  product_id    BIGINT,
  adjusted_by   BIGINT,
  qty_before    NUMERIC,
  qty_change    NUMERIC,
  qty_after     NUMERIC,
  reason        TEXT,
  notes         TEXT,
  adjusted_at   TIMESTAMPTZ DEFAULT now(),
  mobile_synced BOOLEAN     DEFAULT false
);

CREATE TABLE purchase_orders (
  id            BIGINT PRIMARY KEY,
  po_number     TEXT,
  supplier_id   BIGINT,
  created_by    BIGINT,
  total_amount  NUMERIC     DEFAULT 0,
  status        TEXT        DEFAULT 'pending',
  notes         TEXT,
  expected_at   TIMESTAMPTZ,
  received_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  mobile_synced BOOLEAN     DEFAULT false
);

CREATE TABLE purchase_order_items (
  id            BIGINT PRIMARY KEY,
  po_id         BIGINT,
  product_id    BIGINT,
  quantity      NUMERIC,
  unit_cost     NUMERIC,
  received_qty  NUMERIC     DEFAULT 0,
  line_total    NUMERIC,
  mobile_synced BOOLEAN     DEFAULT false
);

CREATE TABLE activity_log (
  id            BIGINT PRIMARY KEY,
  user_id       BIGINT,
  action        TEXT,
  entity_type   TEXT,
  entity_id     BIGINT,
  detail        TEXT,
  logged_at     TIMESTAMPTZ DEFAULT now(),
  mobile_synced BOOLEAN     DEFAULT false
);

-- ── Row Level Security + open policy + mobile-pull index ──
-- The anon key reads/writes via a single permissive policy.
-- DROP POLICY IF EXISTS first because Postgres has no
-- "CREATE POLICY IF NOT EXISTS" (this was the syntax error).
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'categories','suppliers','products','customers','sales','sale_items',
    'payments','stock_adjustments','purchase_orders','purchase_order_items','activity_log'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I', t);
    EXECUTE format('CREATE POLICY allow_all ON %I FOR ALL USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_mobile_synced ON %I (mobile_synced) WHERE mobile_synced = false', t, t);
  END LOOP;
END $$;

-- Refresh PostgREST's schema cache so the new columns are visible immediately.
NOTIFY pgrst, 'reload schema';
