# NovaPOS — Market Readiness & Security Assessment

> Honest engineering review, June 2026. A real penetration test requires a
> human security firm with a live build; this is a code-level review.

## ✅ Ready / Implemented

| Area | Status |
|---|---|
| Sale immutability | Every sale stores `items_json`, `total_cost_amount`, per-item `unit_price` + `cost_price`, and VAT snapshot (`tax_rate_applied`, `tax_inclusive_applied`). Price changes never alter history. |
| Old/new price transition | `pending_sell_price` + `price_switch_at_qty` countdown auto-switches when old stock sells out (bulk + unit). |
| Bulk vs unit | At restock (Stock Receive) and at sale (POS chooser + dual dropdown rows). |
| Encrypted backups | AES-256-GCM `.novaenc`, key derived from licence key; same format for Backup Now, Download, and scheduler; readable names `novapos-backup-YYYY-MM-DD_HH-mm.novaenc` (last file alphabetically = latest). |
| Restore safety | Decrypt → validate SQLite magic bytes → native confirm dialog → write → size verification. Live DB never deleted by error recovery. |
| Backup notifications | Desktop notification on success and on failure; offline retry. |
| Auto-print | Receipt prints on payment (toggle in Settings → Printer); failures never block checkout. |
| Scanner | Works as HID keyboard on POS; Settings → Printer has a timing-based connection check. |
| Branding | Splash loader + receipt footer: "Powered by Webautomate Nigeria". |
| Renderer security | `contextIsolation: true`, `nodeIntegration: false`, preload allow-list, DevTools blocked in production, external links open in OS browser. |
| SQL injection | All queries use `?` placeholders with array params throughout services. |

## ⚠️ Gaps to close before wide deployment

1. **Login rate limiting** — add a delay/lockout after ~5 failed attempts (cheap to add in `authService`).
2. **Password policy** — enforce minimum length on staff passwords/PINs at creation.
3. **Activity log review UI** — data is captured; a filterable admin screen would help fraud investigations.
4. **Automated tests** — no test suite exists. Priority order: `saleService.completeSale` (totals, stock, snapshots), price auto-switch, backup encrypt/decrypt round-trip, restore validation. Suggest `vitest` for services (pure functions over a temp DB).
5. **Crash reporting** — logs are local only; consider an opt-in error report email.
6. **Slow hardware** — UI is optimistic and local (no server), so "slow server" doesn't apply in standalone mode; for LAN client mode add request timeouts + retry toasts in `networkAdapter` (not yet done).

## 📈 10-year data growth plan

SQLite handles tens of millions of rows; a busy shop (~300 sales/day) ≈ 1.1M sales + ~4M sale_items in 10 years — fine with the indexes added in migrations 001/007 (`sales(sale_date, status)` etc.). Practical guidance:

- DB file stays portable (likely < 2–4 GB). Backups remain quick.
- If reports slow after years: archive sales older than N years to `novapos-archive-YYYY.db` (attachable for historical reports). Not needed now; revisit at >5M sale_items.
- `VACUUM` once a year via a maintenance button (future).

## 🔐 Security notes (code-level)

- Backup key = SHA-256(activation_key + salt). Anyone with the licence key **and** a backup file can restore — treat licence keys as secrets.
- `dev_login_enabled` should be set to `false` for security-sensitive customers (Settings → Developer).
- Recommend BitLocker/device encryption on shop PCs — SQLite file itself is not encrypted at rest (only backups are).

## Verdict

Core selling, stock, pricing, reporting, and backup flows are **fit for pilot deployment** with real shops. Close gaps 1–2 before mass distribution; add tests (gap 4) as the codebase grows.
