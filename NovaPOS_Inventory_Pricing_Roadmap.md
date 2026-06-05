# NovaPOS — Inventory & Pricing Design Report
### Research: D365 Business Central vs NovaPOS · June 2026

---

## 1. How D365 Business Central Handles This

### 1.1 Inventory Costing Methods

BC offers five costing methods per item. The method chosen at item creation governs how COGS is calculated forever.

| Method | How Cost Flows | Best For |
|--------|---------------|----------|
| **FIFO** | Oldest receipt cost used first when selling | Perishables, items whose cost fluctuates |
| **Average** | Weighted average of all receipts recalculated at each transaction | Most retail/wholesale SMBs |
| **Standard** | Predetermined cost; variances tracked separately | Manufacturing |
| **LIFO** | Newest receipt cost used first (mainly US GAAP) | Inflationary environments |
| **Specific** | Serial/lot tracked — exact cost per unit | High-value, regulated items |

**BC's mechanism:** Every purchase, sale, adjustment, and transfer creates an **Item Ledger Entry** paired with a **Value Entry**. These are immutable records. When costing method changes are needed, BC runs the *Adjust Cost – Item Entries* batch job to reconcile cost layers against all historical transactions.

### 1.2 Price Management in BC

BC uses layered price lists (introduced 2020 Wave 2):

```
Sales Price Lists
├── Default List          (applies to all customers)
├── Retail Price List     (assigned to retail customer group)
├── Wholesale Price List  (assigned to wholesale customer group)
└── Promotional List      (date-bounded: Jan 1 – Jan 31)
```

Each list line has: Item, Unit of Measure, Minimum Qty, Unit Price, Start Date, End Date.

**Price Worksheet** — before activating price changes, BC lets you:
1. Suggest new prices (% adjustment from current)
2. Compare old vs new side-by-side
3. Implement all changes at once

**Key rules:**
- Price changes are NEVER retroactive to posted sales
- The lowest valid price on the sale date always wins
- Multiple UOM pricing (sell by each vs by box) is native

### 1.3 What BC Does That Most SMB POS Systems Don't

1. **Retroactive cost adjustment** — if a vendor invoice arrives after the goods were sold, BC adjusts the COGS retroactively to the correct cost via Value Entries. The sale price to the customer never changes, but the profitability report is corrected.

2. **Cost layer tracking** — BC knows that lot A of 50 units was bought at ₦150 and lot B of 100 units at ₦200. Under FIFO, the first 50 sales use ₦150 cost; the next use ₦200.

3. **Date-bound price lists** — "charge wholesale price from Jan 1 to Mar 31 only."

4. **Customer group pricing** — different price for retail vs wholesale vs VIP without touching the item card.

---

## 2. Where NovaPOS Currently Stands

| BC Feature | NovaPOS Now | Gap |
|-----------|-------------|-----|
| Immutable sale price snapshot | ✅ `sale_items.unit_price` | None |
| Immutable COGS snapshot | ✅ `sale_items.cost_price` | None |
| Price change audit trail | ✅ `selling_price_history` | None |
| Purchase cost history | ✅ `purchase_price_history` | None |
| 3-mode price decision on restock | ✅ keep / switch now / auto-switch | None |
| Auto-switch pending price | ✅ `pending_sell_price` | None |
| Costing method choice | ❌ | Average only |
| Customer group pricing | ❌ | Single price |
| Date-bound price lists | ❌ | No expiry |
| Bulk/unit pricing | ✅ | None |
| Price worksheet | ❌ | No bulk change tool |
| Retroactive cost adjustment | ❌ | Not needed for SMB |

**Verdict:** NovaPOS covers the core needs of a small Nigerian retail shop. The gaps are enterprise features that add complexity without proportional benefit for target clients.

---

## 3. Recommended Roadmap for NovaPOS

### Phase 1 — Current (Complete)
- [x] Sale price snapshot on every `sale_items` record
- [x] COGS snapshot (`cost_price`) at time of sale
- [x] Price change audit log (`selling_price_history`)
- [x] Purchase price history (`purchase_price_history`)
- [x] 3-mode price decision: keep / switch now / auto-switch
- [x] Bulk/unit pricing with toggles
- [x] Stock receive flow with margin calculator

### Phase 2 — Recommended Next (1–2 months)

**2A. Weighted Average Cost (WAC) calculator**
Instead of storing only the latest cost, recalculate:
```
new_avg_cost = (existing_qty × old_cost + new_qty × new_cost) / (existing_qty + new_qty)
```
Display on the stock receive screen. Let the owner decide whether to use WAC or the exact new cost as the selling price basis. This is what BC's Average costing method does automatically.

**2B. Customer / Customer Group Pricing**
Some shops sell at different prices to walk-in customers vs registered wholesale buyers.
- Add `customer_price_groups` table: Retail (default) / Wholesale / Staff
- `customer_prices` table: product_id, group_id, unit_price, bulk_price
- On POS checkout: if customer has a group, use group price automatically

**2C. Price Validity Dates**
Allow shops to set a promotional price with start/end dates:
- "This week only: Rice ₦45,000/bag (normally ₦48,000)"
- Expired prices auto-revert — no manual action needed

**2D. Minimum Stock Alert on Sell**
Before completing a sale that would bring stock below zero, warn the cashier. Currently a sale can drive stock negative silently.

### Phase 3 — Advanced (3–6 months)

**3A. Supplier-Linked Purchase Orders**
- Create a PO before goods arrive
- When goods arrive, receive against the PO
- PO tracks expected cost vs actual cost (price variance)
- Matches how BC handles purchase orders and receipts

**3B. Batch/Lot Tracking (Simplified)**
For shops that stock perishables or items with expiry dates:
- Record batch number + expiry when receiving stock
- POS shows cashier if a batch is near expiry
- FIFO enforcement: oldest batch deducted first

**3C. Stock Valuation Report**
Monthly report showing:
- Units in stock per product
- Average cost per unit
- Total stock value at cost
- Total stock value at selling price
- Potential profit if all stock sold

**3D. Price Worksheet (Bulk Price Change)**
- Select category or all products
- Enter % increase or decrease
- Preview old vs new prices
- Apply to all — with audit log entry per product

### Phase 4 — Enterprise (6–12 months)

**4A. Multi-Location Inventory**
- Track stock per branch location
- Inter-branch transfers with cost tracking
- Consolidated reporting across locations

**4B. FIFO Costing Mode**
Full lot-by-lot tracking:
- Each stock receipt = a cost layer
- Sales deduct from oldest layer first
- COGS report shows exact cost per sold item
- Requires per-product costing method setting

**4C. Accounts Integration**
- Export to accounting software (QuickBooks, Sage, etc.)
- Journal entries for purchases, sales, adjustments
- Tax filing reports (VAT returns)

---

## 4. Pricing Philosophy — Final Recommendation

Based on BC's approach and the realities of Nigerian small retail:

### The Rule: "Current Price for All, with Explicit Override"

1. **One price is active at any time** per product (simple, clear, no confusion for cashiers)
2. **When cost changes, owner decides** using the 3-mode system (keep / auto-switch / switch now)
3. **Auto-switch (BC equivalent of FIFO pricing)** handles the "sell old stock at old price" case without lot tracking or complexity
4. **All past sales are always accurate** — `sale_items` snapshot is our equivalent of BC's Value Entries
5. **Weighted average cost** shown as a suggestion when receiving new stock

### What This Means Practically

A shop buys 50 Indomie cartons at ₦4,000 (old) then 100 more at ₦5,500 (new):

| BC FIFO | NovaPOS Auto-Switch |
|---------|---------------------|
| Tracks cost per lot internally | Sets switch threshold at 100 units |
| First 50 sales use ₦4,000 COGS | First 50 units sell at old price |
| Next 100 use ₦5,500 COGS | Auto-switches when qty hits 100 |
| Cashier sees nothing | Cashier sees nothing |
| Reports show correct COGS per sale | Reports show correct price per sale |

**Outcome is equivalent for the shop owner.** BC's approach is technically more rigorous (correct COGS even if prices are the same). NovaPOS's approach is simpler and sufficient for shops that change selling price when costs change — which is nearly all Nigerian retail.

---

## 5. Immediate Action Items

| Priority | Action | Effort |
|----------|--------|--------|
| 🔴 High | Field validation — no negatives, no invalid decimals | Done ✅ |
| 🔴 High | Fix blank restock page (preload missing APIs) | Done ✅ |
| 🟡 Medium | Weighted Average Cost display on stock receive | 1 session |
| 🟡 Medium | Customer group pricing (retail/wholesale) | 2 sessions |
| 🟡 Medium | Minimum stock warning on POS | 0.5 session |
| 🟢 Low | Date-bound promotional pricing | 1 session |
| 🟢 Low | Price worksheet for bulk price changes | 1 session |
| 🟢 Low | Stock valuation report | 1 session |

---

*Research basis: Microsoft Learn (D365 BC docs), Stoneridge Software, Speaking Business Central, Dynamics Power Play — all accessed June 2026.*

*Report prepared for NovaPOS by Claude (Anthropic), June 2026.*
