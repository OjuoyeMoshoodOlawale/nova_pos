// src/main/utils/machineId.ts
// ─────────────────────────────────────────────────────────
// Generates a stable, anonymous machine identifier.
// Used for: activation key binding + encryption key derivation.
// The ID never leaves the machine and is not personally identifiable.
// ─────────────────────────────────────────────────────────

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

// Declare the build-time constant injected by vite
declare const __DEV_SECRET__: string

let _machineId: string | null = null

/**
 * Returns a stable SHA-256 hash derived from hardware info.
 * Cached after first call.
 */
export function getMachineId(): string {
  if (_machineId) return _machineId

  // Combine multiple sources for stability across OS reinstalls
  const cpus = os.cpus()
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown'
  const hostname = os.hostname()
  const platform = os.platform()
  const arch = os.arch()
  const totalMem = os.totalmem().toString()

  // Try to read a persisted machine ID (more stable)
  const idFile = path.join(app.getPath('userData'), '.machine_id')
  if (fs.existsSync(idFile)) {
    _machineId = fs.readFileSync(idFile, 'utf8').trim()
    return _machineId
  }

  // First run: compute and persist
  const raw = `${cpuModel}|${hostname}|${platform}|${arch}|${totalMem}`
  _machineId = createHash('sha256').update(raw).digest('hex')
  fs.writeFileSync(idFile, _machineId, 'utf8')

  return _machineId
}

// ─── ACTIVATION KEY ──────────────────────────────────────

/**
 * Compute the expected activation key for this machine.
 * Format: NOVA-XXXX-XXXX-XXXX-XXXX
 */
export function computeExpectedKey(machineId: string): string {
  const hash = createHmac('sha256', __DEV_SECRET__)
    .update(machineId)
    .digest('hex')
    .toUpperCase()
    .slice(0, 16)
  return `NOVA-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`
}

/**
 * Verify an entered activation key against this machine's expected key.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyActivationKey(entered: string): boolean {
  const normalised = entered.trim().toUpperCase().replace(/\s/g, '')
  const expected = computeExpectedKey(getMachineId())
  if (normalised.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(normalised), Buffer.from(expected))
}

// ─── DEVELOPER MAINTENANCE LOGIN ─────────────────────────

/**
 * Returns the current rotating developer maintenance password.
 * The password rotates every 30 minutes using an HMAC of the
 * current time slot, so the developer can always compute it
 * using the gen-key CLI without storing passwords anywhere.
 *
 * Returns TWO valid passwords: current slot + previous slot,
 * so there is a grace period around rotation time.
 */
export function getDevPasswords(): [string, string] {
  const slot = Math.floor(Date.now() / (30 * 60 * 1000))
  const current = createHmac('sha256', __DEV_SECRET__)
    .update(`dev:${slot}`)
    .digest('hex')
    .slice(0, 12)
  const prev = createHmac('sha256', __DEV_SECRET__)
    .update(`dev:${slot - 1}`)
    .digest('hex')
    .slice(0, 12)
  return [current, prev]
}

export const DEV_USERNAME = 'nova.support'
