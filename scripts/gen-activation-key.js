#!/usr/bin/env node
/**
 * NovaPOS Activation Key Generator (Developer Tool)
 * Usage: node scripts/gen-activation-key.js <machine-id>
 *
 * The machine ID is shown on the activation screen of the app.
 * KEEP NOVA_DEV_SECRET SECRET — it must match the one used at build time.
 */
const { createHmac } = require('crypto')

const DEV_SECRET = process.env.NOVA_DEV_SECRET || 'nova-default-dev-secret-v1-CHANGE-ME'
const machineId  = process.argv[2]

if (!machineId) {
  console.error('Usage: node scripts/gen-activation-key.js <machine-id>')
  console.error('  The machine ID is shown on the activation screen of the installed app.')
  process.exit(1)
}

const hash = createHmac('sha256', DEV_SECRET)
  .update(machineId)
  .digest('hex')
  .toUpperCase()
  .slice(0, 16)

const key = `NOVA-${hash.slice(0,4)}-${hash.slice(4,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}`

console.log('\n✅ Activation Key Generated')
console.log('   Machine ID : ' + machineId)
console.log('   Key        : ' + key)
console.log('\nSend this key to the client.')
