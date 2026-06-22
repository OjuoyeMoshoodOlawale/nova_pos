# NovaPOS Manual Test Plan
## Pre-Deployment Verification

Run these tests IN ORDER. Each test builds on the previous.
Mark ✅ or ❌ after each.

---

## Phase 1: Fresh Start

| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 1.1 | Delete database | Settings → Developer → type DELETE → confirm | App restarts with empty DB | |
| 1.2 | Activation | Enter licence key → activate | Shows setup wizard | |
| 1.3 | Setup wizard | Business name, address, phone, tax rate → complete | Dashboard loads | |
| 1.4 | Create admin | Set admin password | Can login | |

---

## Phase 2: Products — All 3 Pricing Modes

### Unit-only product
| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 2.1 | Create unit product | Inventory → Add → "Coca-Cola" → Pieces only → Price ₦200 → Stock 50 | Product appears in list showing "50 pcs" | |
| 2.2 | Stock display | Check Inventory list | Shows "50 pcs" with green OK badge | |

### Both-ways product
| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 2.3 | Create both product | Add → "Indomie" → Both ways → carton → 40 per carton → Bulk buy ₦3000 → Bulk sell ₦3600 → Unit sell ₦100 → Stock 200 | Unit cost auto-calculates ₦75 | |
| 2.4 | Stock display | Check Inventory list | Shows "200 pcs" + "5.0 cartons · reorder at 2.0" | |

### Bulk-only product
| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 2.5 | Create bulk product | Add → "Cement" → Bulk only → bag → Buy ₦5000 → Sell ₦6000 → Stock 20 | Form only shows: unit name, buy price, sell price, stock | |
| 2.6 | Stock display | Check Inventory list | Shows "20 bag" (NOT "20 pcs") | |

---

## Phase 3: Receive Stock

| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 3.1 | Receive (unit) | Coca-Cola → Receive Stock → 30 pcs → Keep current price | Stock: 50 → 80. Form is NOT blank. | |
| 3.2 | Receive (both-bulk) | Indomie → Receive Stock → buy as carton → 3 cartons → Keep price | Stock: 200 → 320 (3×40=120 added) | |
| 3.3 | Receive (bulk-only) | Cement → Receive Stock → 5 bags → Keep price | Stock: 20 → 25 | |
| 3.4 | Price change on receive | Receive more Indomie → new cost ₦3200 → "Sell old stock first" | Pending price set. Original price still active. | |

---

## Phase 4: POS — Selling

### Unit sale
| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 4.1 | Add to cart | POS → tap Coca-Cola | Cart shows: Coca-Cola, 1, ₦200 | |
| 4.2 | Increase qty | Tap + or type 3 | Cart shows qty 3, total ₦600 | |
| 4.3 | Stock cap | Try typing 999 in qty | Qty snaps to 80 (stock limit) | |
| 4.4 | Checkout | Charge → Cash → tender ₦700 | Sale complete, change ₦100 | |
| 4.5 | Stock deducted | Check Inventory → Coca-Cola | Stock: 80 → 77 | |

### Bulk sale (both-ways product)
| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 4.6 | Add bulk to cart | POS → Indomie → tap the carton button | Cart shows carton price ₦3600 | |
| 4.7 | Mode switch | In cart, dropdown shows pcs/carton → switch to pcs | Price changes to ₦100 per pc | |
| 4.8 | Bulk stock cap | Switch back to carton → type 999 | Qty snaps to 8 (320÷40) | |
| 4.9 | Checkout 2 cartons | Set qty 2 → Charge → Cash | Sale complete | |
| 4.10 | Stock deducted | Check Inventory → Indomie | Stock: 320 → 240 (2×40=80 deducted) | |

### Bulk-only sale
| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 4.11 | Add bulk-only | POS → Cement | Adds as "bag" (no pcs option) | |
| 4.12 | Stock cap | Type 999 | Qty snaps to 25 (or current stock) | |
| 4.13 | Sell 3 bags | Set qty 3 → Charge | Sale complete | |
| 4.14 | Stock deducted | Check Inventory → Cement | Stock: 25 → 22 bags | |

### Guards
| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 4.15 | Cash underpayment | Charge → Cash → type amount less than total | Error: "Amount paid less than total" | |
| 4.16 | Empty cart | No items → try to Charge | Charge button not visible | |

---

## Phase 5: Void

| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 5.1 | Void unit sale | Sales → find Coca-Cola sale → Void | Status → voided, stock 77 → 80 | |
| 5.2 | Void bulk sale | Sales → find Indomie sale → Void | Stock 240 → 320 (80 pcs restored) | |
| 5.3 | Void bulk-only | Sales → find Cement sale → Void | Stock 22 → 25 bags | |
| 5.4 | Double void | Try voiding the same sale again | Error: "already voided" | |

---

## Phase 6: Stock Audit & Reports

| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 6.1 | Stock Audit page | Sidebar → Stock Audit | Shows all products with Purchased/Sold/Remaining | |
| 6.2 | Verify math | For each product | Purchased − Sold = Remaining | |
| 6.3 | Insights dashboard | Dashboard → Insights tab | Loads (no infinite spinner). Shows running-out, movers. | |
| 6.4 | Stock Movement | Insights → Stock Movement table | Shows pcs + packs for both-ways products | |
| 6.5 | Daily report | Reports → Daily | Revenue excludes voided sales | |

---

## Phase 7: Printing

| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 7.1 | Printer selected | Settings → Printer → select Xprinter | Printer name saved | |
| 7.2 | Auto-print | Complete a sale | Receipt prints automatically, no button | |
| 7.3 | Print status | Watch the payment success screen | Shows "Printing…" → "✓ Receipt printed" | |
| 7.4 | Reprint | Tap "Reprint Receipt" | Receipt prints again | |
| 7.5 | Receipt layout | Check the printed receipt | No duplicate footer, no wasted top gap, items visible | |
| 7.6 | Receipt speed | Time from checkout to paper starting | Should be < 2 seconds | |

---

## Phase 8: Settings & Cloud Sync

| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 8.1 | Default pricing mode | Settings → Business → set "Bulk only" → Save → Add new product | New product defaults to Bulk only mode | |
| 8.2 | Copy Schema SQL | Settings → Cloud Sync → Copy Schema SQL | SQL copied to clipboard (paste in notepad to verify) | |
| 8.3 | Test Connection | Enter Supabase URL + key → Test Connection | Shows result: OK / no tables / auth fail | |
| 8.4 | Sync Now | Enable sync → Sync Now | Shows "Synced X rows" or "Up to date" | |

---

## Phase 9: Edge Cases

| # | Test | Steps | Expected | ✅/❌ |
|---|---|---|---|---|
| 9.1 | Barcode scan | Scan a barcode on a product | Product found, first char not dropped | |
| 9.2 | Discount > 100% | On a cart item, try typing 150% discount | Clamps to 100% | |
| 9.3 | Delete database | Settings → Developer → Delete All Data → type DELETE | App restarts fresh | |
| 9.4 | Backup + Restore | Backup Now → Delete DB → Restore from .novaenc | All data restored | |
| 9.5 | Adjust Stock (not restock) | Inventory → product → Adjust → -5 damage | Stock decreases by 5, reason = "damage" | |
| 9.6 | Price change (no stock) | Inventory → product → Change Price → Apply now | Price updates, no stock change | |

---

## Phase 10: Verification Formulas

After all tests, verify these numbers add up:

**For each product:**
```
Stock now = Initial stock + Received − Sold + Voided − Adjusted
```

**For the business:**
```
Revenue (today) = SUM of all completed sale totals (excluding voided)
COGS = SUM of (qty × cost_price) for all sold items
Gross Profit = Revenue − COGS
```

Check these in:
- Stock Audit page (Purchased / Sold / Remaining)
- Dashboard → Insights → Stock Movement
- Reports → Daily report
- Reports → Profit & Loss

If all numbers match: **ready to deploy.**
