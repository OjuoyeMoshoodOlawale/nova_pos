// src/main/mailer/mailerService.ts
import nodemailer, { Transporter } from 'nodemailer'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { app } from 'electron'
import { format } from 'date-fns'
import { getSetting, getAllSettings } from '../services/settingsService'
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

// ─── BACKUP SERVICE ───────────────────────────────────────

interface BackupResult {
  path?: string
  size: number
  emailSent: boolean
}

export async function performBackup(): Promise<BackupResult> {
  const db = getDb()
  const settings = getAllSettings(db)
  const destination = settings.backup_destination ?? 'local'
  const dbPath = path.join(app.getPath('userData'), 'novapos.db')
  const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm')
  const backupName = `novapos-backup-${timestamp}.db.gz`

  // ── Checkpoint WAL so backup is complete ───────────────
  getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)')

  // ── Gzip the database file ─────────────────────────────
  const tempPath = path.join(app.getPath('temp'), backupName)
  await gzipFile(dbPath, tempPath)
  const size = fs.statSync(tempPath).size

  let savedPath: string | undefined
  let emailSent = false

  // ── Local backup ────────────────────────────────────────
  if (destination === 'local' || destination === 'both') {
    const localDir = settings.backup_local_path || path.join(app.getPath('userData'), 'backups')
    fs.mkdirSync(localDir, { recursive: true })
    savedPath = path.join(localDir, backupName)
    fs.copyFileSync(tempPath, savedPath)

    // Keep only last 7 local backups
    pruneOldBackups(localDir, 7)
    logger.info(`[Backup] Local backup saved: ${savedPath}`)
  }

  // ── Email backup ─────────────────────────────────────────
  if (destination === 'email' || destination === 'both') {
    try {
      const transport = createTransport()
      const settingsAll = getAllSettings(db)
      await transport.sendMail({
        from: `"${settingsAll.smtp_from_name}" <${settingsAll.smtp_from_email}>`,
        to: settingsAll.backup_email || settingsAll.manager_email,
        subject: `NovaPOS Backup — ${timestamp}`,
        html: `
          <p>Your NovaPOS database backup is attached.</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Size:</strong> ${(size / 1024).toFixed(1)} KB (compressed)</p>
          <p>Store this file safely. To restore, go to Settings → Backup & Restore → Restore.</p>
        `,
        attachments: [{
          filename: backupName,
          path: tempPath,
          contentType: 'application/gzip',
        }],
      })
      emailSent = true
      logger.info(`[Backup] Email backup sent to ${settingsAll.backup_email || settingsAll.manager_email}`)
    } catch (err) {
      logger.error('[Backup] Email backup failed:', (err as Error).message)
    }
  }

  // Clean temp file
  fs.unlinkSync(tempPath)

  return { path: savedPath, size, emailSent }
}

function gzipFile(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const src = fs.createReadStream(input)
    const dest = fs.createWriteStream(output)
    const gz = zlib.createGzip({ level: 9 })
    src.pipe(gz).pipe(dest)
    dest.on('finish', resolve)
    dest.on('error', reject)
  })
}

function pruneOldBackups(dir: string, keep: number): void {
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.db.gz'))
    .map((f) => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time)

  for (const file of files.slice(keep)) {
    fs.unlinkSync(path.join(dir, file.name))
    logger.info(`[Backup] Pruned old backup: ${file.name}`)
  }
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
