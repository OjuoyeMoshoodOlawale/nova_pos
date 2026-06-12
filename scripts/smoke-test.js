// scripts/smoke-test.js
// ─────────────────────────────────────────────────────────
// Zero-dependency smoke tests — run with:  node scripts/smoke-test.js
// Verifies the security-critical logic that must never silently break:
//   1. Backup encryption round-trip (AES-256-GCM, .novaenc format)
//   2. Wrong-key decryption is REJECTED (auth tag)
//   3. Tampered ciphertext is REJECTED
//   4. Backup filenames sort chronologically (latest = last)
//   5. SQLite magic-byte validation logic
//   6. Price auto-switch countdown math
// Exit code 0 = all pass; non-zero = failure (CI-friendly).
// ─────────────────────────────────────────────────────────
'use strict'
const { createHash, createCipheriv, createDecipheriv, randomBytes } = require('node:crypto')
const assert = require('node:assert')

let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed++; console.error(`  ❌ ${name}\n     ${e.message}`) }
}

// ── Mirror of the production .novaenc format (settings.handler.ts) ──
const MAGIC = 'NOVA', VERSION = 0x01, NONCE_LEN = 12, TAG_LEN = 16
const HEADER_LEN = 4 + 1 + NONCE_LEN + TAG_LEN

function deriveKey(activationKey) {
  return createHash('sha256').update(`${activationKey}:nova-pos-encrypted-backup-v1`).digest()
}
function encrypt(plaintext, key) {
  const nonce = randomBytes(NONCE_LEN)
  const c = createCipheriv('aes-256-gcm', key, nonce)
  const enc = Buffer.concat([c.update(plaintext), c.final()])
  return Buffer.concat([Buffer.from(MAGIC), Buffer.from([VERSION]), nonce, c.getAuthTag(), enc])
}
function decrypt(blob, key) {
  assert(blob.slice(0, 4).toString() === MAGIC, 'bad magic')
  assert(blob[4] === VERSION, 'bad version')
  const nonce = blob.slice(5, 5 + NONCE_LEN)
  const tag   = blob.slice(5 + NONCE_LEN, HEADER_LEN)
  const d = createDecipheriv('aes-256-gcm', key, nonce)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(blob.slice(HEADER_LEN)), d.final()])
}

console.log('\nNovaPOS smoke tests\n───────────────────')

// 1. Round trip
test('backup encrypt → decrypt round-trip restores identical bytes', () => {
  const key  = deriveKey('NOVA-4CB8-65FB-0C28-3CD8')
  const data = Buffer.concat([Buffer.from('SQLite format 3\0'), randomBytes(4096)])
  const out  = decrypt(encrypt(data, key), key)
  assert(out.equals(data), 'decrypted bytes differ from original')
})

// 2. Wrong key rejected
test('decryption with a DIFFERENT licence key is rejected', () => {
  const blob = encrypt(Buffer.from('secret sales data'), deriveKey('NOVA-AAAA'))
  assert.throws(() => decrypt(blob, deriveKey('NOVA-BBBB')), /auth/i)
})

// 3. Tamper rejected
test('tampered ciphertext is rejected by the auth tag', () => {
  const key  = deriveKey('NOVA-4CB8')
  const blob = encrypt(Buffer.from('do not tamper'), key)
  blob[blob.length - 1] ^= 0xff   // flip one ciphertext bit
  assert.throws(() => decrypt(blob, key))
})

// 4. Filename ordering — latest backup must sort LAST alphabetically
test('backup filenames sort chronologically (latest = last)', () => {
  const names = [
    'novapos-backup-2026-06-12_09-05.novaenc',
    'novapos-backup-2025-12-31_23-59.novaenc',
    'novapos-backup-2026-06-12_14-30.novaenc',
    'novapos-backup-2026-01-01_00-00.novaenc',
  ]
  const sorted = [...names].sort()
  assert.strictEqual(sorted[sorted.length - 1], 'novapos-backup-2026-06-12_14-30.novaenc')
})

// 5. SQLite magic validation (restore gatekeeper)
test('SQLite magic bytes accept real DB header, reject gzip', () => {
  const SQLITE_MAGIC = Buffer.from('53514c69746520666f726d617420330', 'hex')
  const realDb = Buffer.from('SQLite format 3\0 ........')
  const gzip   = Buffer.from([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  assert(realDb.slice(0, 15).equals(SQLITE_MAGIC), 'real DB should pass')
  assert(!gzip.slice(0, 15).equals(SQLITE_MAGIC), 'gzip must fail')
})

// 6. Price auto-switch countdown math (saleService logic)
test('auto price-switch triggers exactly when old stock reaches threshold', () => {
  // Restock: 40 old units remain, new price pending, switch_at_qty = 40 (new units)
  // Selling counts stock DOWN; switch fires when stock_qty <= price_switch_at_qty.
  const scenario = { stock_qty: 90, price_switch_at_qty: 50, pending_sell_price: 120 }
  const sell = (qty) => { scenario.stock_qty -= qty }
  const shouldSwitch = () =>
    scenario.price_switch_at_qty != null &&
    scenario.pending_sell_price != null &&
    scenario.stock_qty <= scenario.price_switch_at_qty

  sell(30); assert(!shouldSwitch(), 'must NOT switch at 60 remaining')
  sell(10); assert(shouldSwitch(),  'MUST switch at exactly 50 remaining')
})

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
