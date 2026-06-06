// src/main/mailer/mailerService.ts
import nodemailer, { Transporter } from 'nodemailer'
import fs   from 'node:fs'
import path from 'node:path'
import { createHash, createCipheriv, randomBytes } from 'node:crypto'
import { app } from 'electron'
import { format } from 'date-fns'
import { getSetting, setSetting, getAllSettings } from '../services/settingsService'
import { getDb } from '../database/connection'
import { buildDailyReport, buildMonthlyReport, buildYearlyReport } from '../services/reportService'
import logger from '../utils/logger'

// ─── TRANSPORT ───────────────────────────────────────────

export function createTransport(): Transporter {
  const db = getDb()
  const host = getSetting(db, 'smtp_host')
  const port = parseInt(getSetting(db, 'smtp_port') || '587')
  const user = getSetting(db, 'smtp_user')
  const pass = getSetting(db, 'smtp_pass')

  if (!host || !user) throw new Error('SMTP is not configured. Go to Settings → Email.')

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  })
}

export async function testEmail(config: {
  host: string; port: number; user: string; pass: string
  fromName: string; fromEmail: string; toEmail: string
}): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    tls: { rejectUnauthorized: false },
  })
  await transport.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: config.toEmail,
    subject: 'NovaPOS — Test Email',
    html: `<p>✅ Your NovaPOS email is configured correctly.<br>Sent at ${new Date().toLocaleString()}</p>`,
  })
}

// ─── DAILY REPORT EMAIL ──────────────────────────────────

export async function sendDailyReportEmail(date?: string): Promise<void> {
  const db = getDb()
  const settings = getAllSettings(db)
  const reportDate = date ?? format(new Date(), 'yyyy-MM-dd')

  const report = buildDailyReport(db, reportDate)
  const html = buildDailyReportHtml(report)

  const transport = createTransport()
  await transport.sendMail({
    from: `"${settings.smtp_from_name}" <${settings.smtp_from_email}>`,
    to: settings.manager_email,
    subject: `${report.businessName} — Daily Sales Report (${reportDate})`,
    html,
  })
  logger.info(`[Mailer] Daily report sent for ${reportDate}`)
}

export async function sendMonthlyReportEmail(year: number, month: number): Promise<void> {
  const db = getDb()
  const settings = getAllSettings(db)
  const report = buildMonthlyReport(db, year, month)
  const html = buildMonthlyReportHtml(report, year, month)

  const transport = createTransport()
  await transport.sendMail({
    from: `"${settings.smtp_from_name}" <${settings.smtp_from_email}>`,
    to: settings.manager_email,
    subject: `Monthly Report — ${report.month}`,
    html,
  })
  logger.info(`[Mailer] Monthly report sent: ${year}-${month}`)
}

// ─── BACKUP SERVICE ──────────────────────────────────────
// Auto backup uses the SAME encrypted .novaenc format as the
// "Backup Now" button.  Both paths must stay in sync.
// ─────────────────────────────────────────────────────────

// AES-256-GCM constants — must match settings.handler.ts
const MAGIC_STR  = 'NOVA'
const VERSION_B  = 0x01
const NONCE_LEN  = 12   // GCM nonce
const TAG_LEN    = 16   // GCM auth tag
const HEADER_LEN = 4 + 1 + NONCE_LEN + TAG_LEN  // 33 bytes

/** Derive AES-256 key from the installation activation key (same logic as settings.handler.ts). */
function deriveBackupKey(): Buffer {
  const db = getDb()
  try {
    const act = db.prepare('SELECT activation_key FROM activation LIMIT 1').get() as any
    if (act?.activation_key) {
      return createHash('sha256')
        .update(`${act.activation_key}:nova-pos-encrypted-backup-v1`)
        .digest()
    }
  } catch { /* fall through */ }
  // Fallback: reuse or generate a persistent random key in settings
  try {
    let stored = getSetting(db, 'backup_enc_key')
    if (!stored || stored.length < 64) {
      stored = randomBytes(32).toString('hex')
      setSetting(db, 'backup_enc_key', stored)
    }
    return Buffer.from(stored, 'hex')
  } catch { /* absolute fallback */ }
  return createHash('sha256').update('nova-pos-fallback-key').digest()
}

/** Encrypt a DB file to a .novaenc buffer (same format as settings.handler.ts). */
function encryptDbToBuffer(dbPath: string): Buffer {
  const key       = deriveBackupKey()
  const plaintext = fs.readFileSync(dbPath)
  const nonce     = randomBytes(NONCE_LEN)
  const cipher    = createCipheriv('aes-256-gcm', key, nonce)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag       = cipher.getAuthTag()
  return Buffer.concat([
    Buffer.from(MAGIC_STR),
    Buffer.from([VERSION_B]),
    nonce,
    tag,
    encrypted,
  ])
}

/** Resolve the backup directory — mirrors resolveBackupDir() in settings.handler.ts. */
function resolveBackupDirLocal(): string {
  const db = getDb()
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'backup_path'").get() as any
    if (row?.value && typeof row.value === 'string' && row.value.trim()) {
      return row.value.trim()
    }
  } catch { /* fall through */ }
  try { return path.join(app.getPath('userData'), 'backups') } catch {}
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'nova-pos', 'backups')
  }
  return path.join(path.dirname(process.execPath), 'nova-pos-backups')
}

/** Resolve DB path — mirrors getDbPath() in settings.handler.ts. */
function resolveDbPath(): string {
  try { return path.join(app.getPath('userData'), 'novapos.db') } catch {}
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'nova-pos', 'novapos.db')
  }
  return path.join(path.dirname(process.execPath), 'novapos.db')
}

interface BackupResult {
  path?: string
  size: number
  emailSent: boolean
}

export async function performBackup(): Promise<BackupResult> {
  const db        = getDb()
  const settings  = getAllSettings(db)
  const dbPath    = resolveDbPath()
  const backupDir = resolveBackupDirLocal()
  const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm')
  const filename  = `novapos-backup-${timestamp}.novaenc`

  // ── Encrypt the live database ─────────────────────────
  // Same AES-256-GCM format as the "Backup Now" button.
  const encryptedBlob = encryptDbToBuffer(dbPath)

  // ── Save to backup folder ────────────────────────────
  fs.mkdirSync(backupDir, { recursive: true })
  const savedPath = path.join(backupDir, filename)
  fs.writeFileSync(savedPath, encryptedBlob)
  logger.info(`[Backup] Encrypted backup saved: ${savedPath}`)

  // Record last backup time and file in settings
  try {
    setSetting(db, 'last_backup_at',   new Date().toISOString())
    setSetting(db, 'last_backup_file', savedPath)
  } catch { /* non-fatal */ }

  // ── Prune old .novaenc backups (keep user-configured count) ──
  try {
    const keepN = Math.max(1, parseInt(getSetting(db, 'backup_keep_count') || '30') || 30)
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('novapos-backup-') && f.endsWith('.novaenc'))
      .sort()
    if (files.length > keepN) {
      files.slice(0, files.length - keepN).forEach(f => {
        try { fs.unlinkSync(path.join(backupDir, f)) } catch {}
        logger.info(`[Backup] Pruned old backup: ${f}`)
      })
    }
  } catch { /* non-fatal */ }

  const size = encryptedBlob.length
  let emailSent = false

  // ── Optional: email the encrypted backup ─────────────
  if (settings.backup_destination === 'email' || settings.backup_destination === 'both') {
    try {
      const transport = createTransport()
      await transport.sendMail({
        from: `"${settings.smtp_from_name}" <${settings.smtp_from_email}>`,
        to:   settings.backup_email || settings.manager_email,
        subject: `NovaPOS Encrypted Backup — ${timestamp}`,
        html: `
          <p>Your NovaPOS database backup is attached.</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Size:</strong> ${(size / 1024).toFixed(1)} KB (encrypted)</p>
          <p><strong>Format:</strong> AES-256-GCM encrypted (.novaenc)</p>
          <p>To restore, go to Settings → Backup → Restore and select this file.
             You must be on an installation activated with the same licence key.</p>
        `,
        attachments: [{
          filename,
          content: encryptedBlob,
          contentType: 'application/octet-stream',
        }],
      })
      emailSent = true
      logger.info(`[Backup] Email backup sent to ${settings.backup_email || settings.manager_email}`)
    } catch (err) {
      logger.error('[Backup] Email backup failed:', (err as Error).message)
    }
  }

  return { path: savedPath, size, emailSent }
}

// ─── BACKUP SCHEDULER ────────────────────────────────────

let _backupTimer: ReturnType<typeof setInterval> | null = null
let _reportTimer: ReturnType<typeof setInterval> | null = null

export function startSchedulers(): void {
  stopSchedulers()
  _backupTimer  = setInterval(checkBackupSchedule,  60_000)
  _reportTimer  = setInterval(checkReportSchedule,  60_000)
  logger.info('[Scheduler] Started backup & report schedulers')
}

export function stopSchedulers(): void {
  if (_backupTimer)  clearInterval(_backupTimer)
  if (_reportTimer)  clearInterval(_reportTimer)
}

function checkBackupSchedule(): void {
  const db = getDb()
  const settings = getAllSettings(db)
  if (settings.backup_enabled !== 'true') return

  const now = new Date()
  const [hh, mm] = (settings.backup_time || '23:00').split(':').map(Number)
  if (now.getHours() !== hh || now.getMinutes() !== mm) return

  const schedule = settings.backup_schedule ?? 'daily'
  const dayOfWeek = now.getDay()   // 0=Sun
  const dayOfMonth = now.getDate()

  if (schedule === 'weekly'  && dayOfWeek !== parseInt(settings.backup_day ?? '1')) return
  if (schedule === 'monthly' && dayOfMonth !== parseInt(settings.backup_day ?? '1')) return

  performBackup().catch((err) => logger.error('[Backup] Scheduled backup failed:', err))
}

function checkReportSchedule(): void {
  const db = getDb()
  const settings = getAllSettings(db)
  if (settings.auto_email_enabled !== 'true') return

  const now = new Date()
  const [hh, mm] = (settings.auto_email_time || '22:00').split(':').map(Number)
  if (now.getHours() !== hh || now.getMinutes() !== mm) return

  sendDailyReportEmail().catch((err) =>
    logger.error('[Mailer] Scheduled daily report failed:', err))
}

// ─── EMAIL TEMPLATES ─────────────────────────────────────

function buildDailyReportHtml(r: any): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#1d4ed8;color:white;padding:20px;border-radius:8px 8px 0 0">
      <h2 style="margin:0">📊 Daily Sales Report</h2>
      <p style="margin:4px 0 0;opacity:.8">${r.businessName} · ${r.date}</p>
    </div>
    <div style="background:#f8fafc;padding:20px">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:12px;background:white;border-radius:8px;text-align:center;width:33%">
            <div style="font-size:24px;font-weight:bold;color:#1d4ed8">${r.currency}${r.totalRevenue.toLocaleString('en', {minimumFractionDigits:2})}</div>
            <div style="color:#64748b;font-size:12px">Total Revenue</div>
          </td>
          <td style="width:10px"></td>
          <td style="padding:12px;background:white;border-radius:8px;text-align:center;width:33%">
            <div style="font-size:24px;font-weight:bold;color:#059669">${r.transactionCount}</div>
            <div style="color:#64748b;font-size:12px">Transactions</div>
          </td>
          <td style="width:10px"></td>
          <td style="padding:12px;background:white;border-radius:8px;text-align:center;width:33%">
            <div style="font-size:24px;font-weight:bold;color:#7c3aed">${r.profitMarginPct.toFixed(1)}%</div>
            <div style="color:#64748b;font-size:12px">Gross Margin</div>
          </td>
        </tr>
      </table>

      <h3 style="color:#1e293b;margin-top:24px">Top Products</h3>
      <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:8px;text-align:left;font-size:12px;color:#64748b">PRODUCT</th>
          <th style="padding:8px;text-align:right;font-size:12px;color:#64748b">QTY</th>
          <th style="padding:8px;text-align:right;font-size:12px;color:#64748b">REVENUE</th>
        </tr></thead>
        <tbody>${r.topProducts.map((p: any, i: number) => `
          <tr style="border-top:1px solid #f1f5f9">
            <td style="padding:8px;font-size:13px">${i + 1}. ${p.name}</td>
            <td style="padding:8px;text-align:right;font-size:13px">${p.qty}</td>
            <td style="padding:8px;text-align:right;font-size:13px;font-weight:bold">${r.currency}${p.revenue.toLocaleString('en',{minimumFractionDigits:2})}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <h3 style="color:#1e293b;margin-top:24px">Payment Methods</h3>
      <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:8px;text-align:left;font-size:12px;color:#64748b">METHOD</th>
          <th style="padding:8px;text-align:right;font-size:12px;color:#64748b">TRANSACTIONS</th>
          <th style="padding:8px;text-align:right;font-size:12px;color:#64748b">TOTAL</th>
        </tr></thead>
        <tbody>${r.paymentBreakdown.map((p: any) => `
          <tr style="border-top:1px solid #f1f5f9">
            <td style="padding:8px;text-transform:capitalize">${p.method}</td>
            <td style="padding:8px;text-align:right">${p.count}</td>
            <td style="padding:8px;text-align:right;font-weight:bold">${r.currency}${p.total.toLocaleString('en',{minimumFractionDigits:2})}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="background:#f1f5f9;padding:12px;border-radius:0 0 8px 8px;text-align:center;font-size:12px;color:#94a3b8">
      Sent by NovaPOS · ${new Date().toLocaleString()}
    </div>
  </div>`
}

function buildMonthlyReportHtml(r: any, year: number, month: number): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#7c3aed;color:white;padding:20px;border-radius:8px 8px 0 0">
      <h2 style="margin:0">📈 Monthly Report — ${MONTHS[month-1]} ${year}</h2>
      <p style="margin:4px 0 0;opacity:.8">${r.businessName}</p>
    </div>
    <div style="background:#f8fafc;padding:20px">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:12px;background:white;border-radius:8px;text-align:center">
            <div style="font-size:28px;font-weight:bold;color:#7c3aed">₦${r.totalRevenue.toLocaleString()}</div>
            <div style="color:#64748b">Total Revenue</div>
          </td>
          <td style="width:12px"></td>
          <td style="padding:12px;background:white;border-radius:8px;text-align:center">
            <div style="font-size:28px;font-weight:bold;color:#059669">₦${r.grossProfit.toLocaleString()}</div>
            <div style="color:#64748b">Gross Profit</div>
          </td>
        </tr>
      </table>
      <p style="color:#475569;margin-top:16px">Total transactions: <strong>${r.totalTransactions}</strong></p>
      <h3>Top Products (Month)</h3>
      <ol>${r.topProducts.map((p: any) =>
        `<li>${p.name} — ${p.qty} sold — ₦${p.revenue.toLocaleString()}</li>`
      ).join('')}</ol>
    </div>
    <div style="background:#f1f5f9;padding:12px;border-radius:0 0 8px 8px;text-align:center;font-size:12px;color:#94a3b8">
      Sent by NovaPOS
    </div>
  </div>`
}
