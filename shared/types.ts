// shared/types.ts
// ─────────────────────────────────────────────────────────
// Single source of truth for all TypeScript types.
// Imported by both main process AND renderer — no logic here.
// ─────────────────────────────────────────────────────────

// ─── ENUMS ───────────────────────────────────────────────
export type UserRole = 'admin' | 'manager' | 'cashier'
export type NetworkMode = 'standalone' | 'server' | 'client'
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'credit'
export type SaleStatus = 'completed' | 'voided' | 'held'
// How a line item is sold: as loose pieces ('unit') or as a bulk pack ('bulk')
export type SellMode = 'unit' | 'bulk'
export type AdjustReason = 'opening_balance' | 'restock' | 'damage' | 'theft' | 'correction' | 'sale' | 'return'
export type PurchaseOrderStatus = 'pending' | 'partial' | 'received' | 'cancelled'
export type BusinessType = 'retail' | 'restaurant' | 'pharmacy' | 'salon' | 'electronics' | 'supermarket' | 'other'

// ─── ACTIVATION ──────────────────────────────────────────
export interface ActivationRecord {
  machine_id: string
  activation_key: string
  business_name: string
  activated_at: string
}

// ─── BUSINESS PROFILE ────────────────────────────────────
export interface BusinessProfile {
  id: number
  name: string
  type: BusinessType
  address: string | null
  phone: string | null
  email: string | null
  logo_path: string | null
  currency_code: string
  currency_symbol: string
  tax_name: string
  tax_rate: number
  tax_inclusive: boolean
  receipt_header: string | null
  receipt_footer: string | null
  show_logo: boolean
  created_at: string
  updated_at: string
}

export type CreateBusinessProfileDto = Omit<BusinessProfile, 'id' | 'created_at' | 'updated_at'>

// ─── SETTINGS ────────────────────────────────────────────
export interface AppSettings {
  setup_complete: string
  printer_name: string
  paper_width: '80mm' | '58mm'
  idle_timeout_secs: string
  auto_email_enabled: string
  auto_email_time: string
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_pass: string        // stored AES-256-GCM encrypted
  smtp_from_name: string
  smtp_from_email: string
  manager_email: string
  network_mode: NetworkMode
  lan_server_ip: string
  lan_server_port: string
  lan_secret: string
  app_version: string
  dev_login_enabled: string
}

// ─── USERS ───────────────────────────────────────────────
export interface User {
  id: number
  full_name: string
  username: string
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateUserDto = {
  full_name: string
  username: string
  password: string
  pin?: string
  role: UserRole
}

export type UpdateUserDto = Partial<Omit<CreateUserDto, 'password'>> & {
  new_password?: string
}

export interface SessionUser extends User {
  token: string
}

// ─── CATEGORIES ──────────────────────────────────────────
export interface Category {
  id: number
  name: string
  color: string
  icon: string | null
  is_active: boolean
  created_at: string
}

export type CreateCategoryDto = Pick<Category, 'name' | 'color' | 'icon'>

// ─── SUPPLIERS ───────────────────────────────────────────
export interface Supplier {
  id: number
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateSupplierDto = Omit<Supplier, 'id' | 'is_active' | 'created_at' | 'updated_at'>

// ─── PRODUCTS ────────────────────────────────────────────
export interface Product {
  id: number
  name: string
  sku: string | null
  barcode: string | null
  category_id: number | null
  category_name: string | null
  supplier_id: number | null
  supplier_name: string | null
  parent_id: number | null
  unit: string
  cost_price: number
  selling_price: number
  stock_qty: number
  reorder_level: number
  image_path: string | null
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  // ── Bulk pricing (migration 002) ──────────────────────
  pricing_mode?: 'unit' | 'both' | 'bulk'
  has_bulk_pricing?: boolean
  bulk_unit?: string | null
  units_per_bulk?: number
  bulk_buying_price?: number
  bulk_selling_price?: number
  image_data?: string | null
  // ── Scheduled price change (migration 008) ────────────
  pending_sell_price?: number | null
  pending_bulk_price?: number | null
  price_switch_at_qty?: number | null
}

export type CreateProductDto = Omit<
  Product,
  'id' | 'category_name' | 'supplier_name' | 'is_active' | 'created_at' | 'updated_at'
>

export type UpdateProductDto = Partial<CreateProductDto>

// ─── CUSTOMERS ───────────────────────────────────────────
export interface Customer {
  id: number
  full_name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  balance: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateCustomerDto = Omit<Customer, 'id' | 'balance' | 'is_active' | 'created_at' | 'updated_at'>

// ─── CART & SALES ────────────────────────────────────────
export interface CartItem {
  product_id:    number
  product_name:  string
  barcode:       string | null
  unit_price:    number
  quantity:      number
  discount_pct:  number
  line_total:    number
  cost_price:    number    // snapshot for COGS calculation
  sell_mode:     SellMode  // 'unit' or 'bulk'
  unit_label:    string    // display label e.g. "pcs" or "carton"
  stock_qty:     number    // available stock snapshot — for over-sell validation
}

export interface CustomerPriceGroup {
  id:           number
  name:         string
  discount_pct: number
  description:  string | null
  color:        string
  is_active:    boolean
}

export interface PaymentEntry {
  method: PaymentMethod
  amount: number
  reference?: string
}

export interface CompleteSaleInput {
  items: CartItem[]
  customer_id: number | null
  served_by: number
  discount_pct: number
  discount_amt: number
  tax_amount: number
  total_amount: number
  payments: PaymentEntry[]
  notes?: string
}

export interface Sale {
  id: number
  receipt_no: string
  customer_id: number | null
  customer_name: string | null
  served_by: number
  cashier_name: string
  subtotal: number
  discount_pct: number
  discount_amt: number
  tax_amount: number
  total_amount: number
  amount_paid: number
  change_given: number
  status: SaleStatus
  void_reason: string | null
  notes: string | null
  sale_date: string
  created_at: string
}

export interface SaleItem {
  id: number
  sale_id: number
  product_id: number
  product_name: string
  unit_price: number
  quantity: number
  discount_pct: number
  line_total: number
}

export interface SaleDetail extends Sale {
  items: SaleItem[]
  payments: PaymentRecord[]
}

export interface PaymentRecord {
  id: number
  sale_id: number
  method: PaymentMethod
  amount: number
  reference: string | null
  paid_at: string
}

export interface CompleteSaleResult {
  saleId: number
  receiptNo: string
  change: number
}

export interface HeldOrder {
  id: number
  label: string | null
  cart_json: string
  customer_id: number | null
  held_by: number
  held_at: string
}

// ─── INVENTORY ───────────────────────────────────────────
export interface StockAdjustment {
  id: number
  product_id: number
  product_name: string
  adjusted_by: number
  adjuster_name: string
  qty_before: number
  qty_change: number
  qty_after: number
  reason: AdjustReason
  notes: string | null
  adjusted_at: string
}

export interface CreateAdjustmentDto {
  product_id: number
  adjusted_by: number
  qty_change: number
  reason: AdjustReason
  notes?: string
}

// ─── PURCHASE ORDERS ─────────────────────────────────────
export interface PurchaseOrder {
  id: number
  po_number: string
  supplier_id: number | null
  supplier_name: string | null
  created_by: number
  creator_name: string
  total_amount: number
  status: PurchaseOrderStatus
  notes: string | null
  expected_at: string | null
  received_at: string | null
  created_at: string
  items: PurchaseOrderItem[]
}

export interface PurchaseOrderItem {
  id: number
  po_id: number
  product_id: number
  product_name: string
  quantity: number
  unit_cost: number
  received_qty: number
  line_total: number
}

// ─── REPORTING ───────────────────────────────────────────
export interface DailyReportData {
  date: string
  businessName: string
  currency: string
  totalRevenue: number
  totalSales: number
  totalCost: number
  grossProfit: number
  profitMarginPct: number
  transactionCount: number
  voidCount: number
  discountGiven: number
  taxCollected: number
  paymentBreakdown: { method: string; total: number; count: number }[]
  topProducts: { name: string; qty: number; revenue: number }[]
  cashierPerformance: { name: string; sales: number; revenue: number }[]
  hourlySales: { hour: number; revenue: number; count: number }[]
}

export interface InventoryReportData {
  generatedAt: string
  totalProducts: number
  totalStockValue: number   // sum(cost_price * stock_qty)
  totalRetailValue: number  // sum(selling_price * stock_qty)
  lowStockItems: Product[]
  outOfStockItems: Product[]
  overstockItems: Product[]
  topMovingProducts: { product: Product; totalSold: number }[]
  slowMovingProducts: { product: Product; daysSinceLastSale: number }[]
  categoryBreakdown: { category: string; count: number; value: number }[]
}

export interface WeeklyReportData {
  weekStart: string
  weekEnd: string
  totalRevenue: number
  totalTransactions: number
  dailyBreakdown: { date: string; revenue: number; count: number }[]
  topProducts: { name: string; qty: number; revenue: number }[]
  grossProfit: number
}

export interface MonthlyReportData extends WeeklyReportData {
  month: string
  year: number
  weeklyBreakdown: { week: string; revenue: number; count: number }[]
}

export interface ProfitLossData {
  period: string
  revenue: number
  cogs: number   // cost of goods sold
  grossProfit: number
  grossMargin: number
  totalDiscounts: number
  taxCollected: number
  netRevenue: number
  topProducts?: { name: string; qty: number; revenue: number }[]
}

// ─── LAN NETWORK ─────────────────────────────────────────
export interface LanServerInfo {
  hostname: string
  ip: string
  port: number
  businessName: string
}

// ─── GENERIC IPC RESPONSE ────────────────────────────────
export type IpcResponse<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
