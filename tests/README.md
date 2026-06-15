# NovaPOS Tests

Run with:

```bash
npm test            # run once
npm run test:watch  # watch mode
```

## What's covered

- **auth.test.ts** — password hashing/verification (scrypt), unique salts,
  password policy (min 6, letter+number), PIN policy (4–6 digits).
- **backup.test.ts** — AES-256-GCM backup round-trip, wrong-key rejection,
  tamper detection, deterministic key derivation (restore-on-new-machine).
- **sale.test.ts** — full migrations on an in-memory DB, then `completeSale`:
  stock decrement, cost/price snapshots, snapshot immutability after price
  changes, payment + stock-adjustment records, sequential receipts, and the
  pending-price auto-switch countdown.

## Notes

`tests/setup.ts` mocks Electron so main-process services import cleanly under
Node. The sale tests use a real in-memory `node-sqlite3-wasm` database — no
mocking of SQL, so they catch real schema/query regressions.
