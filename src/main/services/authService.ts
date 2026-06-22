// src/main/services/authService.ts
import type { DB } from '../database/connection'
import type { JSValue } from 'node-sqlite3-wasm'
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { User, SessionUser, UserRole, CreateUserDto } from '@shared/types'
import { getMachineId, getDevPasswords, DEV_USERNAME } from '../utils/machineId'
import logger from '../utils/logger'

const sessions = new Map<string, SessionUser>()

// ─── Login rate limiting ──────────────────────────────────
// Brute-force protection: after MAX_FAILS consecutive failures for a
// username, logins for that username are locked. Lock time doubles on
// every subsequent lockout (30s → 60s → 120s … capped at 15 min).
// In-memory is correct here: a desktop attacker who can restart the app
// can also delete the DB — physical access is out of scope.
const MAX_FAILS     = 5
const BASE_LOCK_MS  = 30_000
const MAX_LOCK_MS   = 15 * 60_000
const loginAttempts = new Map<string, { fails: number; lockedUntil: number; lockouts: number }>()

function assertNotLocked(username: string): void {
  const rec = loginAttempts.get(username)
  if (!rec) return
  const remaining = rec.lockedUntil - Date.now()
  if (remaining > 0) {
    const secs = Math.ceil(remaining / 1000)
    throw new Error(`Too many failed attempts. Try again in ${secs} second${secs === 1 ? '' : 's'}.`)
  }
}

function recordLoginFail(db: DB, username: string): void {
  const rec = loginAttempts.get(username) ?? { fails: 0, lockedUntil: 0, lockouts: 0 }
  rec.fails += 1
  if (rec.fails >= MAX_FAILS) {
    rec.lockouts += 1
    rec.lockedUntil = Date.now() + Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (rec.lockouts - 1))
    rec.fails = 0
    logger.warn(`[Auth] Lockout #${rec.lockouts} for username: ${username}`)
    try {
      db.prepare("INSERT INTO activity_log (action, detail) VALUES ('auth.lockout', ?)")
        .run([`Username '${username}' locked after ${MAX_FAILS} failed attempts`])
    } catch { /* non-fatal */ }
  }
  loginAttempts.set(username, rec)
}

function recordLoginSuccess(username: string): void {
  loginAttempts.delete(username)
}

// ─── Credential policy ────────────────────────────────────
// Enforced at creation/change so weak credentials never enter the DB.
export function validatePassword(password: string): void {
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters')
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Password must include at least one letter and one number')
  }
}
export function validatePin(pin: string): void {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error('PIN must be 4 to 6 digits')
  }
}

// ─── Password hashing ─────────────────────────────────────
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(plain, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const attempt = scryptSync(plain, salt, 64)
  return timingSafeEqual(Buffer.from(hash, 'hex'), attempt)
}

export function hashPin(pin: string): string {
  const salt = randomBytes(8).toString('hex')
  const hash = scryptSync(pin, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

// ─── Sessions ────────────────────────────────────────────
function createSession(user: User): SessionUser {
  const token = uuidv4()
  const session: SessionUser = { ...user, token }
  sessions.set(token, session)
  return session
}

export function getSession(token: string): SessionUser | null {
  return sessions.get(token) ?? null
}

export function destroySession(token: string): void {
  sessions.delete(token)
}

// ─── Login ───────────────────────────────────────────────
export function login(db: DB, username: string, password: string): SessionUser {
  // Reject immediately if this username is in a lockout window
  assertNotLocked(username)

  // Developer maintenance login (not stored in DB)
  const devEnabled = db
    .prepare("SELECT value FROM settings WHERE key = 'dev_login_enabled'")
    .get() as { value: string } | undefined

  if (username === DEV_USERNAME && devEnabled?.value !== 'false') {
    const [curr, prev] = getDevPasswords()
    if (password === curr || password === prev) {
      recordLoginSuccess(username)
      logger.warn('[Auth] Developer login accessed')
      return createSession({
        id: 0, full_name: 'Developer Support', username: DEV_USERNAME,
        role: 'admin', is_active: true,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
    }
    // Wrong dev password — record the failure (counts toward lockout) and stop.
    // Do NOT fall through to the users table; nova.support is never a DB user,
    // and an explicit log entry flags attacks on the maintenance account.
    recordLoginFail(db, username)
    db.prepare("INSERT INTO activity_log (action, detail) VALUES ('auth.dev_login_fail', ?)")
      .run([`Failed developer login attempt for '${username}'`])
    throw new Error('Invalid username or password')
  }

  const row = db
    .prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
    .get([username]) as unknown as (User & { password_hash: string }) | undefined

  if (!row) {
    recordLoginFail(db, username)
    throw new Error('Invalid username or password')
  }
  if (!verifyPassword(password, row.password_hash)) {
    recordLoginFail(db, username)
    throw new Error('Invalid username or password')
  }
  recordLoginSuccess(username)

  logger.info(`[Auth] Login: ${username} (${row.role})`)
  return createSession({
    id: row.id, full_name: row.full_name, username: row.username,
    role: row.role as UserRole, is_active: true,
    created_at: row.created_at, updated_at: row.updated_at,
  })
}

export function logout(token: string): void {
  destroySession(token)
}

// ─── User management ─────────────────────────────────────
export function getAllUsers(db: DB): User[] {
  return (db.prepare(
    'SELECT id, full_name, username, role, is_active, created_at, updated_at FROM users WHERE id != 0 ORDER BY full_name'
  ).all() as unknown as User[]).map((u) => ({ ...u, is_active: Boolean(u.is_active) }))
}

export function createUser(db: DB, dto: CreateUserDto): User {
  validatePassword(dto.password)
  if (dto.pin) validatePin(dto.pin)
  const hash    = hashPassword(dto.password)
  const pinHash = dto.pin ? hashPin(dto.pin) : null

  // Positional params: full_name, username, hash, pin, role
  const result = db.prepare(`
    INSERT INTO users (full_name, username, password_hash, pin, role)
    VALUES (?, ?, ?, ?, ?)
  `).run([dto.full_name, dto.username, hash, pinHash, dto.role])

  return db.prepare(
    'SELECT id, full_name, username, role, is_active, created_at, updated_at FROM users WHERE id = ?'
  ).get([Number(result.lastInsertRowid)]) as unknown as User
}

export function changePassword(
  db: DB,
  userId: number,
  oldPassword: string,
  newPassword: string
): void {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get([userId]) as
    | { password_hash: string } | undefined
  if (!row) throw new Error('User not found')
  if (!verifyPassword(oldPassword, row.password_hash)) throw new Error('Incorrect current password')
  validatePassword(newPassword)

  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .run([hashPassword(newPassword), userId])
}

export function deactivateUser(db: DB, userId: number): void {
  db.prepare(`UPDATE users SET is_active = 0, updated_at = datetime('now') WHERE id = ?`)
    .run([userId])
}

export function updateUser(
  db: DB,
  userId: number,
  data: { full_name?: string; role?: UserRole; pin?: string }
): User {
  // Build dynamic SET clause with positional params
  const sets: string[] = [`updated_at = datetime('now')`]
  const vals: unknown[] = []

  if (data.full_name) { sets.push('full_name = ?'); vals.push(data.full_name) }
  if (data.role)      { sets.push('role = ?');       vals.push(data.role)      }
  if (data.pin)       { validatePin(data.pin); sets.push('pin = ?'); vals.push(hashPin(data.pin)) }

  vals.push(userId) // WHERE id = ?
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(vals as JSValue[])

  return db.prepare(
    'SELECT id, full_name, username, role, is_active, created_at, updated_at FROM users WHERE id = ?'
  ).get([userId]) as unknown as User
}
