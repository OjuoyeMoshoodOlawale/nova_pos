#!/usr/bin/env node
/**
 * NovaPOS Developer Maintenance Password Generator
 * Usage: node scripts/get-dev-password.js
 *
 * The dev password rotates every 30 minutes.
 * Login username: nova.support
 * This password is valid for the current and previous 30-minute slot.
 */
const { createHmac } = require('crypto')

const DEV_SECRET = process.env.NOVA_DEV_SECRET || 'nova-default-dev-secret-v1-CHANGE-ME'
const slot       = Math.floor(Date.now() / (30 * 60 * 1000))

function getPass(s) {
  return createHmac('sha256', DEV_SECRET).update(`dev:${s}`).digest('hex').slice(0, 12)
}

const current  = getPass(slot)
const previous = getPass(slot - 1)
const expiresIn = 30 - (Math.floor(Date.now() / 60000) % 30)

console.log('\n🔐 Developer Maintenance Password')
console.log('   Username       : nova.support')
console.log('   Current Pass   : ' + current + '  (expires in ~' + expiresIn + ' min)')
console.log('   Previous Pass  : ' + previous + '  (still valid during transition)')
console.log('\nThis is a rotating password — rerun this script if it expires.')
