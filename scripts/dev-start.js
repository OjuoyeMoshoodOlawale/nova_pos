#!/usr/bin/env node
/**
 * dev-start.js
 * Kills any leftover Electron processes + cleans the DB lock file,
 * then launches electron-vite dev.
 *
 * Same approach proven in SchoolFees Manager to prevent
 * "database is locked" on Windows with node-sqlite3-wasm.
 */

const { execSync, spawn } = require('child_process')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const ok   = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`)
const warn = (msg) => console.log(`\x1b[33m⚠\x1b[0m ${msg}`)
const log  = (msg) => console.log(`\x1b[36m→\x1b[0m ${msg}`)

// ── Step 1: Kill leftover Electron processes ───────────────
log('Killing any leftover Electron processes...')
try {
  if (os.platform() === 'win32') {
    execSync('taskkill /F /IM electron.exe 2>nul', { stdio: 'pipe' })
    execSync('taskkill /F /IM Electron.exe 2>nul', { stdio: 'pipe' })
  } else {
    execSync("pkill -f 'electron .' 2>/dev/null || true", { stdio: 'pipe', shell: true })
  }
  ok('Electron processes killed')
} catch {
  ok('No Electron processes found (clean state)')
}

// ── Step 2: Wait for OS to release file handles ────────────
log('Waiting for file handles to release...')
setTimeout(startDev, 1200)

// ── Step 3: Clean DB lock files ────────────────────────────
function cleanLockFiles() {
  const appData = process.env.APPDATA || os.homedir()
  const dbDir   = path.join(appData, 'nova-pos')
  const dbFile  = path.join(dbDir, 'novapos.db')

  const lockSuffixes = ['-shm', '-wal', '-journal', '.lock']
  let cleared = 0

  if (!fs.existsSync(dbDir)) return

  for (const suffix of lockSuffixes) {
    const lockPath = dbFile + suffix
    if (!fs.existsSync(lockPath)) continue
    try {
      const stat = fs.statSync(lockPath)
      if (stat.isDirectory()) {
        fs.rmSync(lockPath, { recursive: true, force: true })
      } else {
        fs.unlinkSync(lockPath)
      }
      ok(`Removed lock file: novapos.db${suffix}`)
      cleared++
    } catch (e) {
      // Truncate fallback — SQLite treats 0-byte lock file as unlocked
      try {
        fs.writeFileSync(lockPath, Buffer.alloc(0))
        warn(`Truncated (couldn't delete): novapos.db${suffix}`)
        cleared++
      } catch {
        warn(`Could not clear: novapos.db${suffix} — ${e.message}`)
      }
    }
  }

  if (cleared === 0) ok('No DB lock files found — clean state')
}

// ── Step 4: Start electron-vite dev ───────────────────────
function startDev() {
  cleanLockFiles()

  log('Starting electron-vite dev...\n')

  const cmd  = os.platform() === 'win32' ? 'npx.cmd' : 'npx'
  const proc = spawn(cmd, ['electron-vite', 'dev'], {
    stdio: 'inherit',
    shell: false,
  })

  proc.on('close', (code) => process.exit(code ?? 0))
  proc.on('error', (err) => {
    console.error('Failed to start electron-vite:', err.message)
    process.exit(1)
  })
}
